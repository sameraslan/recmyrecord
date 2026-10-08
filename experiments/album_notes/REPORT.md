# Album notes: sources, coverage and design

Issue #73. Research of 8 October 2026. Nothing in the site or the pipeline was changed.

The question: can every album page get a short line about the album and, behind "Read more", its background (where it comes from, how it was made, what to listen for), from sources a public, possibly commercial site may use, without writing 10,000 texts by hand?

Companion documents in this folder:

- `SOURCES.md`: every candidate source, its licence or terms quoted, and a verdict.
- `UX-SPEC.md`: the design spec (placement, short and long text, behaviour, attribution, accessibility, phases, wireframes, draft copy).
- `USER-PANEL.md`: a **simulated** panel of six personas reacting to four concepts. Hypotheses to test, not evidence.
- `results/coverage.csv`: the match of every catalog album to Wikidata and Wikipedia.

## 1. Verdict

- **Yes, without hand-writing.** Wikipedia (any language, CC BY-SA 4.0, commercial use allowed) is the only open source of real background text, and Wikidata and MusicBrainz core data (CC0) give the facts. Everything else with album prose (AllMusic, Apple Music editorial notes, Last.fm, Genius, Bandcamp, RYM, critics) is closed or non-commercial: link only.
- **Coverage.** About **two thirds (66%)** of the catalog has a Wikipedia article about the album in some language (**about 80%** of the top 1,000), and about another **15%** has none but its artist has an English article. For about **a fifth (20%)** we found nothing written that we may use. Section 3.
- **Write, don't paste.** A verbatim Wikipedia lead is the weakest form: its first sentence repeats the header, it is half chart positions and acclaim, and it has nothing to listen for. Notes written by Claude **from the fetched article only**, checked, and published as CC BY-SA 4.0 with a link to the article revision, are what make it "a full experience". Albums without a source get a quiet line, never invented text.
- **Design.** Under the mood words: one written line (at most 130 characters, facts not praise), "Read more" and the source ("Summarised from Wikipedia with AI help") always visible. "Read more" opens the notes in place: credits, Where it comes from, Making it, Listen for, What came after, sources. "Closest albums" follows straight after. Closed, it costs about 90 px; all five closest albums still fit at 1440 × 900. A clickable prototype on three real albums is published as an Artifact (link on the issue); its source is `prototype.html`.
- **Cost.** One-off generation for the whole catalog is a few hundred dollars of API use (section 5). The real cost is checking: Samer reads the top 500 lines (about three hours), plus a 2% random audit.
- **Main risk.** Text that is wrong or generic on the obscure records, which is where it is most useful. The plan starts with a 30-album trial rated by people who know the records, before any site change.

## 2. Sources

Full reasoning, quotes and links are in `SOURCES.md`. In short:

| Source | Use | Conditions |
|---|---|---|
| Wikipedia, every language | Text for the notes | CC BY-SA 4.0. Link the article revision and the licence, say it was adapted. Text written from an article is treated as an adaptation and published CC BY-SA 4.0; this does not reach the rest of the site. |
| Wikidata | Matching, facts (date, label, producer, sometimes studio), links to other sites | CC0 |
| MusicBrainz core data | Credits, recording places and dates, links | CC0. Annotations, tags and ratings are CC BY-NC-SA: do not use. 1 request a second. |
| Discogs monthly dumps | Credits and personnel | CC0. Not the API (6-hour freshness rule). Notes fields are sleeve text: not usable as prose. |
| Claude (API) | Writing the line and the notes | Customer owns outputs (Commercial Terms). Write only from fetched sources, never from the model's memory. |
| AllMusic, Apple Music notes, Last.fm wiki, Genius, Bandcamp "about", RYM reviews, critics | No text | Closed or non-commercial. Link out, or a score with a link. |

Fetching: Wikimedia's 2026 limits are 200 requests a minute for an identified client, but this container shares an IP and was throttled after a few dozen Action API calls. The build should run from Samer's machine with a contact User-Agent, use batched requests, and consider the free Wikimedia Enterprise tier (50,000 requests a month).

## 3. Coverage

### 3.1 Method

Every album in `data-pipeline/catalog/albums.csv` (10,467) was matched to Wikidata, in order:

1. **Identifiers** (`match.py`): the RYM path from `rym_url` against P8392, the Spotify album id against P2205, Apple Music P2281, Deezer P2723. 1,800 albums. Store ids differ by edition, and only 9,644 Wikidata items carry a RYM id at all, so this finds few.
2. **Exact labels** (`match_labels.py`): the album's English label equals the catalog title (or RYM or Latin spelling), its performer's label equals the artist, and it is an album, EP, soundtrack, live or compilation item. 3,864 more, 5,664 in all.
3. For every matched item, its Wikipedia site links in all languages.
4. **Artists** (`artists.py`): whether a person or group with the artist's exact English label has an English article.

A random check of 25 matches found no wrong album. Steps 1 and 2 miss real articles whenever the names differ (Wikidata calls the artist of *Doggystyle* "Snoop Dogg", the catalog "Snoop Doggy Dogg"), so they are a lower bound.

5. **Search sample** (`sample_search.py`): for a random 300 of the 4,870 albums still without an article, a search of English Wikipedia by title and artist (run through the Wikidata Query Service, since Wikipedia's own API throttled this IP), accepting a hit only if its Wikidata item is a release by that artist with that title. 79 of 300 had an English article after all (26%, 95% interval 21% to 31%); 29 of 30 of those checked by eye were the right album. Steps 1 to 4 give each album's row in `results/coverage.csv`; step 5 is only an estimate and is not in the table.

### 3.2 Results

From the exact matches (lower bound), by RYM rank:

| Rank band | Albums | English article | Other language only | Artist article only | Nothing found |
|---|---:|---:|---:|---:|---:|
| 1 to 1,000 | 1,000 | 731 (73%) | 11 (1%) | 121 (12%) | 137 (14%) |
| 1,001 to 2,500 | 1,500 | 791 (53%) | 28 (2%) | 342 (23%) | 339 (23%) |
| 2,501 to 5,000 | 2,500 | 1,226 (49%) | 64 (3%) | 554 (22%) | 656 (26%) |
| 5,001 to 10,000 | 5,000 | 2,272 (45%) | 218 (4%) | 1,098 (22%) | 1,412 (28%) |
| off the chart | 467 | 252 (54%) | 4 (1%) | 135 (29%) | 76 (16%) |
| all | 10,467 | 5,272 (50%) | 325 (3%) | 2,250 (21%) | 2,620 (25%) |

With the search sample: the search found an English article for 45 of the 142 sampled "artist article only" albums (32%) and 34 of the 158 "nothing found" (22%). Applying those two rates within each band (estimates, rounded):

| Rank band | Albums | English article | Other language only | Artist article only | Nothing found | Any album article |
|---|---:|---:|---:|---:|---:|---:|
| 1 to 1,000 | 1,000 | about 800 (80%) | 11 (1%) | about 80 (8%) | about 110 (11%) | **81%** |
| 1,001 to 2,500 | 1,500 | about 970 (65%) | 28 (2%) | about 230 (16%) | about 270 (18%) | **67%** |
| 2,501 to 5,000 | 2,500 | about 1,540 (62%) | 64 (3%) | about 380 (15%) | about 510 (21%) | **64%** |
| 5,001 to 10,000 | 5,000 | about 2,920 (58%) | 218 (4%) | about 750 (15%) | about 1,110 (22%) | **63%** |
| off the chart | 467 | about 310 (67%) | 4 (1%) | about 90 (20%) | about 60 (13%) | **67%** |
| all | 10,467 | **about 6,550 (63%)** | 325 (3%) | **about 1,540 (15%)** | **about 2,060 (20%)** | **66%** |

The whole-catalog figure for English articles has a 95% interval of about 6,310 to 6,800 (from the sample's 26% with interval 21% to 31%, times the 4,870 albums searched for).

What the numbers say:

- The canon is well covered; the long tail is not. Recent albums are the thinnest: 70% of 2020s albums and 59% of 2010s albums have no matched article, against 37% for the 1970s (exact matches).
- Other languages add little on top of English (3%), but they are the right source for many Argentine, Brazilian, Italian, Polish, Finnish and Japanese records, and their articles can be rich (the Spanish article on *Películas* has the players, studio, the concept, and a motorcycle credited as an instrument).
- **Classical recordings** are a case of their own. The catalog's *L'Orfeo* is John Eliot Gardiner's 1987 recording; Wikipedia has a long article on the opera and none on the recording. Notes about the work, clearly labelled as such, are the useful text there.
- About a fifth of albums have no article but their artist has one. A paragraph on the album inside the artist article is often there; using it needs care to quote only what is about this album.

### 3.3 What each album gets

| Tier | When | Closed | Open |
|---|---|---|---|
| Rich | An album article with enough about the record | Line, Read more, source | Credits, sections incl. Listen for, sources |
| Thin | A stub, the album's paragraph in the artist article, or the article on the work (classical) | Line, Read more, source | Credits, one short section, sources |
| Facts | No text, but facts (label, producer, players) | One quiet facts line | None |
| Nothing | Neither | "Not much has been written about this one yet, so you get to hear it with fresh ears. :)" | None |

## 4. Design

`UX-SPEC.md` has the full spec; `USER-PANEL.md` the simulated reactions it drew on. The decisions that matter:

- **Placement:** between the mood words and "Closest albums", in the same order on desktop and phone. Rejected: text always open, tabs, a drawer over the map, a separate About view, a phone bottom sheet, text after the list (kept as a phone-only test).
- **The line:** written to length, 80 to 130 characters, never cut. It says what makes the record itself (how it sounds, where and how it was made, the idea behind it). Never acclaim, rankings, sales, "masterpiece": every album in a top-10,000 chart is acclaimed, and the site's copy rules forbid hype.
- **The notes:** 250 to 450 words, about the length of the first song or two. Credits as a labelled list, then Where it comes from, Making it, Listen for (track titles plus one sentence each), What came after. No "Why it lasts" section: it attracts opinion and cliché.
- **Trust:** the source and AI help are stated next to "Read more", before anyone reads a word. The footer links the article revision and the licence. "Checked by hand" appears only when someone did. A "Something off? Let us know" link (an email address, since a GitHub link would show the owner's name).
- **Honesty about the list:** the recommendations come from sound and mood only, so the notes never explain a match. Shared producers or players go in a separate, labelled "Same people, other records" strip (phase 2).
- **Also:** the album's year beside the artist on every album (the site has it and shows it nowhere); the text in the prerendered page so find-in-page and search engines see it; `#about` to deep-link and to restore the open notes after a phone reloads the tab; the line as the page's link-preview description.

## 5. How the notes would be made

A new pipeline step, run on demand and resumable, writing a separate notes file merged into the album pages at build (not into `albums.json`, which the client loads whole):

1. Match each album to Wikidata (sections 3.1 steps 1 to 5, with the search for every album, not a sample), then to MusicBrainz for credits.
2. Fetch the chosen article at a pinned revision (English when it says enough, else the richest language).
3. Write the line and the notes with Claude from the fetched text and facts only. Each sentence keeps the ids of the passages it rests on.
4. Check automatically: a second model judges each sentence against its passages; dates, names and places are compared with Wikidata and MusicBrainz; a style check rejects dashes, hype and acclaim words, quotes, and long overlaps with the article's wording; track titles must exist on the album. A failure drops the album one tier.
5. Samer reads the lines of the top 500 albums and anything flagged; a 2% random sample of the rest is audited and its error rate reported.

Cost, at the 8 October 2026 list prices through the Batch API (half price): about 8,000 tokens in and 3,000 out per album to write (Opus 5.5, $2 and $10 per million in batch), about $0.05 an album; the check pass on Sonnet 5.5 about $0.015. About $0.065 an album, so roughly **$450 to $500** for the 7,000 or so albums with text, and well under $1,000 with retries and re-runs. Refreshing later costs the same per album changed.

## 6. Limitations and ideas not run

1. **Nobody has rated any notes yet.** The prototype text was written for three albums and checked against the sources by its writer only. The 30-album trial (phase 0 below) is the real test of quality on the long tail.
2. The English search was a 300-album sample, so the total is an estimate. Other-language searches were not run (they would add mostly Spanish, Portuguese, Italian and Japanese articles).
3. Matching by exact labels can pick the wrong item when an artist has two albums of the same title (57 albums matched more than one item; not checked).
4. Album paragraphs inside artist articles were counted by artist only, not read.
5. The user panel is simulated. It shaped the hypotheses; real people must test them (`UX-SPEC.md` section 7.2 has the script).

## 7. Plan

| Phase | What | Needs approval |
|---|---|---|
| 0, trial | 30 albums across rank bands and languages, notes written both ways (Wikipedia lead and written notes), rated by Samer and two listeners for accuracy and interest. The strings for `copy.ts`. | No (this folder only) |
| 1, build | The pipeline step (section 5), the year, the line and Read more, the empty line, credits on the About page, tests and the fold check. | Yes: changes `frontcreck/` and `data-pipeline/` |
| 2, more | Links to catalog albums the notes mention, "Same people, other records", the line on the map card. | Yes |

## 8. Reproducing

Python 3.11 or later, standard library only. From this folder, with `CAT=../../data-pipeline/catalog/albums.csv`:

```bash
python3 match.py $CAT wd.json                      # ids; ~2 min of Wikidata queries
python3 match_labels.py $CAT wd.json wd2.json      # exact labels and site links; ~4 min
python3 artists.py $CAT artists.json               # artist articles; ~2 min
python3 table.py $CAT wd2.json artists.json results/coverage.csv   # the table and the band summary
python3 sample_search.py $CAT wd2.json sample_en.json 300          # the search sample; ~15 min
```

The intermediate JSON files (about 4 MB) are not committed. All queries go to `query.wikidata.org`, which did not throttle; Wikipedia's own APIs did. Results drift as Wikidata is edited.

`results/coverage.csv` columns: `rym_id`, `rank` (empty off the chart), `artist`, `title`, `year`, `status` (`en`: an English article on the album; `other`: an article in another language only; `artist_only`: no album article, the artist has an English one; `none`), `wikidata` (matched items), `matched_by` (P8392, P2205, P2281, P2723, label), `en_title`, `other_wikis` (language codes), `artist_en_article`.
