# Album notes trial: can the small, cheap model write them, and what about the albums with no Wikipedia article?

Issue #73. Run 8 to 9 October 2026, after Samer approved the trial and set the budget: no $500, existing credits only, the small Haiku model with a carefully tuned prompt. Follows `REPORT.md` in this folder. Nothing in the site or the pipeline was changed.

## 1. Verdict

- **Haiku is good enough to write the notes.** On 14 held-out albums the frozen prompt wrote 191 checkable statements. 183 (95.8%) are fully supported by the source and 8 (4.2%) are partly supported: a detail sharpened ("an early" cover idea becomes "the first"), a credit merged, a track number wrong. **None was unsupported or contradicted.** Nothing was flagged generic or as praise, apart from two sentences that reported a critic's review (section 4).
- **It costs about $0.002 an album** at Haiku's list price: writing plus an automatic Haiku check, so **about $20 for all 10,467 albums, or about $10 through the Batch API**. The earlier estimate of $450 to $500 assumed the largest model.
- **The ~20% "nothing found" is not nothing.** In a sample of 30 such albums, every one had enough for a factual line and 26 had enough for notes. 8 have a real Wikipedia album article that the automatic match missed; most others are covered by a paragraph in the artist's article, Discogs credits, label pages, interviews and reviews.
- **Two of the sources you suggested are off limits for an automated pipeline:** Reddit (its terms and robots.txt forbid collecting content, and it is suing over exactly this) and Bandcamp (its policy bans text mining and feeding its pages to AI). A Bandcamp "about" text can still be used if the artist sends it to us. Everything else (artist and label sites, interviews, reviews for facts only, Encyclopaedia Metallum, Discogs dumps) is usable with care. `SOURCES-BEYOND-WIKIPEDIA.md` has the reasoning and the quotes.
- **What the notes still lack is taste, not truth.** The checker's main complaint is what the notes leave out: an empty "Listen for" when the article names tracks, or the article's description of the sound skipped. That is the job of the rating panel (section 6).

## 2. Setup

**Albums.** 30, drawn with a fixed seed (`trial/albums.json`): 18 with an English album article spread over the rank bands, 6 with an article in another language only (Portuguese, Polish, Swedish, Japanese, Finnish, Polish), 6 with only an artist article. Split before any writing: 10 to tune the prompt (`t01` to `t10`), 20 held out to judge it (`h01` to `h20`).

**Sources** (`trial/fetch_sources.py`). Wikipedia's own APIs throttled this cloud container, so each article was read from the Internet Archive's latest 2026 copy of the page (the same text and licence, revision id kept). For artist-only albums, only the paragraphs that name the album. The Wikidata Query Service went into an outage partway through and was skipped (the infobox has the same facts). Four held-out albums got no source this way (the archive had no copy of the page, or the artist page was not found): `h02`, `h12`, `h16`, `h18`. A real build would fetch from Wikipedia directly and would not lose them.

**Packs** (`trial/make_packs.py`): what the writer sees. Infobox, Wikidata facts when available, then the article's sections up to 4,500 words, without references, charts and accolades lists. Track listings and personnel are kept as text.

**Writer.** The small Haiku model, one call per album, given only the prompt and the pack, writing JSON: a line (the hook), facts, up to three short sections, up to five "Listen for" items, each sentence tagged with the pack sections it rests on. Run as Claude Code sub-agents on the existing plan, so the trial spent no API credit. A sub-agent call carries Claude Code's own instructions as well; a production run would be one plain API call per album with the same prompt.

**Checks.** Two kinds:
1. Automatic (`trial/check.py`): hook length, banned words (praise, sales, charts, reviews), dashes, every sentence citing a real pack section, and no run of 8 or more words shared with the source (names and titles masked).
2. A larger Claude model as a strict checker (`trial/verify_prompt.md`): every sentence and fact judged against the pack only as supported, partly, unsupported or contradicted, plus flags for generic, evaluative and copied. Its verdicts are in `trial/out/*/*.verify.json`.

## 3. Tuning the prompt (10 albums)

| Prompt | Statements checked | Supported | Partly | Unsupported or contradicted | Notes |
|---|---:|---:|---:|---:|---|
| v1 | 139 | 128 (92%) | 11 | 0 | Accurate, but leaned on catalogue numbers and credits, sometimes ignored the sound |
| v2 | not checked | | | | Over-corrected: notes shrank by a third (Earfood to one sentence) because a 40-word section minimum made it drop sections |
| v3 | 117 | 110 (94%) | 7 | 0 | Frozen. Sections may be 20 to 120 words; exactness rules; what to leave out |

What changed from v1 to v3 (`trial/prompt_v1.md` to `prompt_v3.md`):
- **Exactness rules** for the small errors v1 made: "the same year" is not "alongside", "decided to" is not "began", "a remix featuring X" is not "by X", a detail tied to one item in a list stays with that item.
- **What to leave out:** pressing details (catalogue and matrix numbers, formats), chart and sales history, sentences that only restate a date. Tell each fact once.
- **What to include:** what the source says about the sound, in "Making it" or "Listen for".
- **Players** may come from the Personnel section. Labels are separated by commas.

The one tweak made after freezing is in the checker, not the prompt: "notable", "noteworthy" and "remarkable" were added to the banned words, so a hook that says "notable for" is caught and redone.

## 4. Held-out result (frozen v3)

Of the 20 held-out albums, 16 had a source. The writer returned "nothing specific" for 2 of them (`h05`, `h10`: the artist article only lists the title in a discography), which is right. The other 14 got notes.

| | Count |
|---|---:|
| Statements checked (hooks, facts, section sentences, Listen for items) | 191 |
| Supported | 183 (95.8%) |
| Partly supported | 8 (4.2%) |
| Unsupported | 0 |
| Contradicted | 0 |
| Flagged evaluative | 2 (both in `h13`, reporting a critic's review) |
| Flagged copied | 1 (an 8-word run in a hook) |
| Flagged generic | 0 |
| Automatic check flags | 3 (one "sold", two 8-word runs) |

The 8 partly supported statements, all small: "an early" cover idea called "the first" (`h06`); a later label merged into the original release (`h07`); "the only instrumental" where the source says only "instrumental" (`h08`); "added" where the source says "more pronounced" (`h11`); two credit details (`h13`); a quote credited to the wrong cause (`h19`); "the ninth track" for track seven (`h20`).

Two of these the automatic check would have caught with small additions: reviews named by outlet (add "AllMusic", "Pitchfork", "Rolling Stone", "Christgau" and similar to the banned list) and track positions (check any "track N" against the track listing). Both go into the build.

What the checker missed most often was not an error but a gap: 4 of 14 held-out notes have no "Listen for" although the article names tracks, and several skip the article's description of the sound. That is a quality question for people, not a truth question, and it is what the rating panel measures.

## 5. Cost

Measured on the 23 albums with notes: the prompt is 1,107 words, a mean writing call is about 2,700 tokens in and 2,000 out (with room for thinking), and a Haiku checking call about 3,300 in and 600 out.

| | Per album | 7,000 albums with an article | All 10,467 |
|---|---:|---:|---:|
| Write + automatic Haiku check, list price | $0.0019 | $13 | $20 |
| Same through the Batch API (half price) | $0.0010 | $7 | $10 |

Prices: Haiku list price on 8 October 2026, $0.10 per million input tokens and $0.50 per million output tokens. Fetching Wikipedia is free. The larger-model checker used in this trial is for measuring, not for production; a 2% audit sample with it would add well under a dollar.

## 6. The rating panel

People still have to judge whether the notes are interesting and whether they beat the plain Wikipedia opening. A private page does that: **Album notes panel** (Artifact, link on the issue; source `trial/rating_page.html` filled by `trial/build_rating_data.py`).

- 23 albums. For each, the two versions are shown blind as A and B in a fixed random order (11 albums each way, plus one where the other version is the empty-state line).
- Each rater says how well they know the record, rates each version's interest while listening (1 to 5), flags anything wrong, and picks which they would rather see.
- Answers save as they go, one private document per rater; only the owner sees everyone's answers, on a Results tab that unblinds them.
- Raters need Contributor access to the page. Non-English excerpts are marked as such, since the site would show them translated.

No ratings exist yet.

## 7. The albums with nothing found (30-album study)

Sample: 30 random albums from the 124 that neither the exact match nor the English search found (`trial/nothing_sample.json`). Three research agents searched the web for each and recorded every source, the facts it gives, and whether a line or notes could be written (`trial/nothing_study/batch1.json` to `batch3.json`). They did not open RateYourMusic pages.

| | Albums (of 30) |
|---|---:|
| Enough for a factual line | 30 |
| Enough for notes of 150 words or more | 26 |
| A real Wikipedia album article after all | 8 |
| Covered in a section of the artist's Wikipedia article | 18 |
| Covered by a Wikipedia article on the work (classical) | 4 |
| Had a review | 19 |
| Had Discogs credits or notes | 12 |
| Had a Bandcamp page with text (not usable, see below) | 11 |
| Had an interview | 6 |
| Had a label page | 5 |
| Had a usable Reddit thread | 0 |

Without Bandcamp and Reddit, all 30 still had at least 3 usable facts and 27 had 8 or more.

Why the match missed the 8 album articles: a different spelling of the artist ("The Flying Burrito Bros" against "The Flying Burrito Brothers", "Aqsak" against "Aksak"), a disambiguation suffix ("Uncut Gems (soundtrack)"), the artist credited under another name (Terre Thaemlitz for DJ Sprinkles), or the article only in Czech or Japanese. All fixable in the matcher.

Some of these "albums" are not what the catalog implies: Hijokaidan's *The Noise* is a 30-CD box set, and SimpleJosh's *Thank God for Drugs* is a fan compilation of unreleased Kanye West recordings. The notes should say so.

**What it means for the plan**, cheapest first:
1. **Better matching** (free): spelling variants, suffixes such as "(soundtrack)" and "(album)", other-language articles, and MusicBrainz and Discogs links to Wikipedia. Recovers about a quarter of the group as full album articles.
2. **The album's paragraph in the artist's article** (free, Wikipedia): most of the rest get a short note.
3. **Articles on the work** for classical recordings (free).
4. **Discogs monthly dumps** (CC0, free, offline): credits, studios, recording dates.
5. **Web research** for what is left: artist and label pages, interviews, reviews for facts only, Encyclopaedia Metallum. A two-step design (one call extracts plain facts with their links, a second call writes only from those facts) keeps it clear of copying. Respect robots.txt and AI opt-outs; never Bandcamp or Reddit. With a paid search API this is the only step with a real cost (search alone about $10 per 1,000 searches, so roughly $50 to $100 for the whole group). It can instead run slowly as Claude Code jobs on the existing plan, the way this study did.

## 8. Limitations

1. **Nobody has rated anything yet.** Accuracy is measured; whether people find the notes worth reading is not. The panel is the next step.
2. **The checker is a model, not a person.** It is strict and literal, but it can miss what a knowledgeable listener would catch, and it only checks against the source, not against the world (a wrong fact in Wikipedia passes).
3. **Small samples.** 14 held-out albums and 191 statements; the 95% interval for "unsupported or contradicted" is 0% to about 2%.
4. **Sub-agents, not API calls.** The writer ran inside Claude Code, which adds its own instructions. A plain API call with the same prompt may behave a little differently; the first build batch should be checked the same way.
5. **Archived sources.** Four held-out albums had no source because of how this container had to fetch pages.
6. **The nothing-found study used larger models with web search**, and counted sources the pipeline may not use (Bandcamp). The counts without them are given above.

## 9. Reproducing

From `experiments/album_notes/trial/`:

```bash
python3 fetch_sources.py albums.json <wd2.json from ../match_labels.py> sources   # slow: about a minute a page via the archive
python3 make_packs.py sources packs out/excerpt
# write: for each album, the prompt (prompt_v3.md) plus packs/<id>.md to the small Haiku model, JSON to out/final/<id>.json
python3 check.py packs out/final
# verify: verify_prompt.md plus the pack and the notes to a larger model, JSON to <id>.verify.json
python3 build_rating_data.py albums.json out/excerpt out/final packs rating_data.json
```

Files: `sources/` and `packs/` hold Wikipedia text (CC BY-SA 4.0, each with its article and revision); `out/haiku_v1`, `out/haiku_v2`, `out/haiku_v3` are the tuning runs, `out/haiku_v3_held` the held-out run with verdicts, `out/final` the notes shown on the panel, `out/excerpt` the plain-excerpt versions. The raw archived pages (about 5 MB) are in `.cache/`, which is not committed.
