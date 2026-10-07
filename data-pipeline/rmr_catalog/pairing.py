"""Which chart row is which existing album. The sheet's own in_recmyrecord flag is not used to decide.

The rule, in this order:
  1. spotify_id         the chart row links the album's Spotify id, and the names do not contradict it: artist
                        and title equal after folding (any release year), or both close and the year equal, or
                        the title and the year equal (a classical recording credited to the composer on one
                        side and to the performers on the other). The feature table's URI is sometimes another
                        album's, so an equal id with other names is not a match.
  2. artist_title_year  folded artist, folded title and release year all equal. When no row has the album's
                        artist: folded title and year equal, and the two credits share a billed name (the
                        site's "Bob Marley & The Wailers" is the chart's "The Wailers"; a conductor and
                        orchestra are the chart's composer, orchestra and conductor). These are listed.
Names are folded with rmr_audio.textnorm.norm; an artist is compared under each of its spellings (the
"native [romanised]" forms, the sheet's artist_latin, the artist correction of overrides.json), a title also
under the sheet's title_latin. Nothing looser pairs: never a title alone across artists, never a title that
extends another (a sequel, an edition, a live version).

An album pairs with one row and a row with one album. When two candidates compete, or the Spotify id points
one way and artist, title and year another, nothing is paired and the pairs are listed for review. Near
misses and disagreements with the sheet's flag are listed too (REASONS).
"""
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from rmr_audio.textnorm import artist_names, artist_sim, artist_variants, fold, main_title, norm, title_sim

from .sources import ChartRow, Existing

ARTIST_CLOSE, TITLE_CLOSE = 0.8, 0.85  # textnorm similarities above which names "do not contradict" an equal Spotify id
REASONS = {
    # paired by the rule, with something to check
    "year_differs": "paired on Spotify id, artist and title; the release years differ by more than one",
    "year_unknown": "paired on Spotify id, artist and title; the existing album's year is not known",
    "artist_differs": "paired on Spotify id, title and year; the artist credits differ",
    "artist_credit_varies": "paired on title and year; the artist credits are not equal but share a billed name",
    "sheet_flag_missing": "paired by the rule; the sheet's flag says the album is missing from the site",
    # not paired
    "competing": "two candidates for one album or one row, or Spotify id and artist+title+year disagree",
    "spotify_link_names_differ": "same Spotify link, different artist or title",
    "spotify_link_year_differs": "same Spotify link, close names, another release year",
    "year_off_by_one": "artist and title equal, release years one apart",
    "same_name_other_year": "artist and title equal, release years further apart or unknown",
    "similar_title": "same artist, similar title",
    "edition_or_sequel": "same artist, one title extends the other (edition, live version, sequel)",
    "same_title_year_other_artist": "title and year equal, another artist credit",
    "same_name_group": "the album is paired with another row of the same artist, title and year",
    "chart_row_already_paired": "artist, title and year equal, but the row is paired with another existing album",
    "sheet_flag_yes": "the sheet's flag says this row is this album; the rule did not pair them",
    "sheet_flag_likely": "the sheet's flag says this row is likely this album; the rule did not pair them",
}


def _title_key(title: str) -> str:
    return norm(title) or " ".join(fold(title).split())  # "★" has no word characters


@dataclass(frozen=True)
class Names:
    artists: frozenset  # every spelling of the credit, folded
    titles: frozenset
    parts: frozenset  # the spellings and each billed name on its own: for finding near misses

    @classmethod
    def of(cls, credits, titles) -> "Names":
        credits, titles = [c for c in credits if c], [t for t in titles if t]
        full = {norm(n, artist=True) for c in credits for n in artist_names(c)} - {""}
        parts = {k for c in credits for k, _ in artist_variants(c)}
        return cls(frozenset(full), frozenset(_title_key(t) for t in titles), frozenset(full | parts))

    def same(self, other: "Names") -> bool:
        return bool(self.artists & other.artists) and bool(self.titles & other.titles)


@dataclass
class Pairing:
    partner: dict[int, tuple[ChartRow, str]] = field(default_factory=dict)  # album index -> (row, matched_by)
    taken: dict[str, int] = field(default_factory=dict)  # rym_id -> album index
    doubts: dict[tuple[int, str], list[str]] = field(default_factory=dict)  # (album index, rym_id) -> reasons

    def doubt(self, e: Existing, s: ChartRow, reason: str) -> None:
        reasons = self.doubts.setdefault((e.index, s.rym_id), [])
        if reason not in reasons:
            reasons.append(reason)

    def join(self, e: Existing, s: ChartRow, by: str) -> None:
        self.partner[e.index], self.taken[s.rym_id] = (s, by), e.index


def year_gap(e: Existing, s: ChartRow) -> int | None:
    """Years between the releases (the nearest of the album's candidate years); None when one is unknown."""
    return min(abs(int(y) - int(s.year)) for y in e.years) if e.years and s.year else None


def pair(existing: list[Existing], chart: list[ChartRow], manual: dict[str, str] | None = None) -> Pairing:
    """Pair the existing albums with chart rows by the rule. `manual` (URI -> key, the rows of keys.csv set by
    hand) is taken as given: those albums and rows are neither paired by the rule nor listed."""
    manual = manual or {}
    by_id = {s.rym_id: s for s in chart}
    en = {e.index: Names.of(e.credits, [e.title]) for e in existing}
    sn = {s.rym_id: Names.of([s.artist, s.artist_latin], [s.title, s.title_latin]) for s in chart}
    out = Pairing()
    settled = set()  # albums decided by hand, then also the ones left for review
    for e in existing:
        if e.uri in manual:
            settled.add(e.index)
            if manual[e.uri] in by_id:
                out.join(e, by_id[manual[e.uri]], "manual")

    by_spotify, by_name, by_part, by_title = (defaultdict(list) for _ in range(4))
    for s in chart:
        if s.spotify_id:
            by_spotify[s.spotify_id].append(s)
        for a in sn[s.rym_id].artists:
            for t in sn[s.rym_id].titles:
                by_name[(a, t)].append(s)
        for a in sn[s.rym_id].parts:
            by_part[a].append(s)
        for t in sn[s.rym_id].titles:
            by_title[(t, s.year)].append(s)

    def unique(rows) -> list[ChartRow]:
        return list({s.rym_id: s for s in rows}.values())

    def same_name(e: Existing) -> list[ChartRow]:
        return unique(s for a in en[e.index].artists for t in en[e.index].titles for s in by_name.get((a, t), []))

    def same_artist(e: Existing, s: ChartRow) -> bool:
        return max(artist_sim(c, a) for c in e.credits for a in (s.artist, s.artist_latin) if a) >= ARTIST_CLOSE

    def close(e: Existing, s: ChartRow) -> bool:
        return same_artist(e, s) and max(title_sim(e.title, t) for t in (s.title, s.title_latin) if t) >= TITLE_CLOSE

    # 1. Spotify id.
    found: dict[int, list[tuple[ChartRow, str]]] = {}
    for e in existing:
        if e.index in settled or not e.spotify_id:
            continue
        for s in by_spotify.get(e.spotify_id, []):
            if s.rym_id in out.taken:
                continue
            gap, names, other = year_gap(e, s), en[e.index], sn[s.rym_id]
            if names.same(other):
                found.setdefault(e.index, []).append(
                    (s, "" if gap in (0, 1) else "year_unknown" if gap is None else "year_differs"))
            elif gap == 0 and close(e, s):
                found.setdefault(e.index, []).append((s, ""))
            elif gap == 0 and names.titles & other.titles:
                found.setdefault(e.index, []).append((s, "artist_differs"))
            else:
                out.doubt(e, s, "spotify_link_year_differs" if close(e, s) else "spotify_link_names_differ")
    claims = Counter(s.rym_id for rows in found.values() for s, _ in rows)
    for index, rows in found.items():
        e = existing[index]
        # The id says one row; does artist + title + year say another?
        rivals = [r for r in same_name(e) if year_gap(e, r) == 0 and r.rym_id not in out.taken
                  and all(r.rym_id != s.rym_id for s, _ in rows)] if any(year_gap(e, s) != 0 for s, _ in rows) else []
        if len(rows) == 1 and claims[rows[0][0].rym_id] == 1 and not rivals:
            s, reason = rows[0]
            out.join(e, s, "spotify_id")
            if reason:
                out.doubt(e, s, reason)
        else:
            settled.add(index)
            for s in [s for s, _ in rows] + rivals:
                out.doubt(e, s, "competing")

    # 2. Artist, title and year.
    found2: dict[int, list[ChartRow]] = {}
    varies = set()
    for e in existing:
        if e.index in settled or e.index in out.partner:
            continue
        rows = [s for s in same_name(e) if year_gap(e, s) == 0 and s.rym_id not in out.taken]
        if not rows:
            rows = [s for s in unique(s for t in en[e.index].titles for y in e.years for s in by_title.get((t, y), []))
                    if s.rym_id not in out.taken and same_artist(e, s)]
            varies.update((e.index, s.rym_id) for s in rows)
        found2[e.index] = rows
    claims = Counter(s.rym_id for rows in found2.values() for s in rows)
    for index, rows in found2.items():
        if len(rows) == 1 and claims[rows[0].rym_id] == 1:
            out.join(existing[index], rows[0], "artist_title_year")
            if (index, rows[0].rym_id) in varies:
                out.doubt(existing[index], rows[0], "artist_credit_varies")
        else:
            for s in rows:
                out.doubt(existing[index], s, "competing")

    # What the rule left: near misses of the albums without a row.
    for e in existing:
        if e.index in out.partner or e.uri in manual:
            continue
        names = en[e.index]
        for s in unique(s for a in names.parts for s in by_part.get(a, [])):
            other, gap, free = sn[s.rym_id], year_gap(e, s), s.rym_id not in out.taken
            if names.same(other):
                if not free:
                    if gap == 0:
                        out.doubt(e, s, "chart_row_already_paired")
                elif gap != 0:
                    out.doubt(e, s, "year_off_by_one" if gap == 1 else "same_name_other_year")
            elif free and max(title_sim(e.title, t) for t in (s.title, s.title_latin) if t) >= TITLE_CLOSE:
                out.doubt(e, s, "similar_title")
            elif free and _extends(names.titles, other.titles, e.title, s.title):
                out.doubt(e, s, "edition_or_sequel")
        for s in unique(s for t in names.titles for y in e.years for s in by_title.get((t, y), [])):
            if s.rym_id not in out.taken and not names.artists & sn[s.rym_id].artists:
                out.doubt(e, s, "same_title_year_other_artist")

    # Rows of the same name and year as a paired album: the pair may be the wrong one of the group.
    for e in existing:
        if e.index in out.partner and e.uri not in manual:
            for s in same_name(e):
                if s.rym_id not in out.taken and year_gap(e, s) == 0:
                    out.doubt(e, s, "same_name_group")

    # Where the sheet's own flag and the rule disagree.
    by_label = {}
    for e in existing:
        by_label.setdefault(e.label, e)
    for s in chart:
        index = out.taken.get(s.rym_id)
        if s.flag == "missing":
            if index is not None and existing[index].uri not in manual:
                out.doubt(existing[index], s, "sheet_flag_missing")
        elif s.flag_label in by_label:
            e = by_label[s.flag_label]
            if index != e.index and e.uri not in manual and (index is None or existing[index].uri not in manual):
                out.doubt(e, s, "sheet_flag_likely" if s.flag == "likely" else "sheet_flag_yes")
    return out


def _extends(ours: frozenset, theirs: frozenset, our_title: str, their_title: str) -> bool:
    """Does one title begin with the other, word for word, or do both have the same title before a subtitle?"""
    for a in ours:
        for b in theirs:
            short, long = sorted((a, b), key=len)
            if short and short != long and long.startswith(short + " "):
                return True
    return _title_key(main_title(our_title)) == _title_key(main_title(their_title))
