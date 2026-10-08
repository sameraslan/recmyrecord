# Album descriptions for recmyrecord: which sources may be used, and how

Research date: 2026-10-08. Scope: a short description (1 to 2 sentences) and a longer "show more" background section for each of the 10,467 albums, shown on a static, possibly commercial site, with the text committed as JSON to a **public** GitHub repository (so every stored text is also redistributed).

This is a reading of primary license and terms pages, not legal advice. Quotes are from the pages as fetched today unless marked "secondhand".

## Verdicts at a glance

| # | Source | Verdict | One-line reason |
|---|---|---|---|
| 1 | Wikipedia (all languages) | **Use with conditions** | CC BY-SA 4.0: commercial use allowed; attribute, link the license, say it was changed, keep the text (and anything adapted from it) under CC BY-SA |
| 2 | Wikidata | **Use** (facts, IDs, short descriptions) | CC0, no conditions; best ID crosswalk |
| 3 | MusicBrainz | **Use** core data (CC0); **Don't** use annotations | Annotations, tags and ratings are CC BY-NC-SA 3.0 (non-commercial) |
| 4 | Discogs | **Facts only** (from the CC0 dumps) | Notes are CC0 but are mostly pressing details and transcribed sleeve text; API adds a 6-hour freshness rule and a per-item credit |
| 5 | Last.fm album wiki | **Don't** | Wiki text is CC BY-SA, but API and site terms are non-commercial and much of it is copied from Wikipedia anyway; go to Wikipedia directly |
| 6 | AllMusic (Xperi) | **Don't** (license only; link out) | Reviews and bios are Xperi's licensed editorial content; B2B, unpublished pricing |
| 7 | Apple Music editorial notes | **Don't** | Developer agreement forbids MusicKit use unrelated to users' Apple Music subscriptions and use of "music-related text" apart from playback |
| 8 | Spotify Web API | **Not applicable** | No album description field at all |
| 9 | Genius | **Don't** | Personal use only without written consent; commercial API use needs a license |
| 10 | RateYourMusic / Sonemic | **Don't** (link only) | No description text; reviews are user-owned; scraping forbidden |
| 11 | Critic reviews (Pitchfork etc.) | **Link only** (plus score and at most a short attributed quote) | Copyrighted; quotation/fair use covers a short quote at most |
| 12a | LLM from its own knowledge | **Use with care, short text only** | Outputs are ours, but hallucination on obscure records and some regurgitation risk |
| 12b | LLM grounded on Wikipedia | **Use with conditions** | Treat output as an adaptation: CC BY-SA 4.0 plus attribution |
| 12c | LLM grounded on Wikidata/MusicBrainz facts | **Use** | No license conditions; facts are not copyrightable |
| 13 | Bandcamp "about", TheAudioDB, Metal Archives, Internet Archive, label press texts | **Don't** / **Link only** | No open license; Bandcamp terms are personal, non-commercial |

---

## 1. Wikipedia text (CC BY-SA 4.0 / GFDL)

**Verdict: Use with conditions.** The best source of background text for the canon part of the catalog.

### License and commercial use
- Wikimedia Terms of Use, section 7 (effective 7 June 2023, page rev. 21 Feb 2026): text is under CC BY-SA 4.0 and the unversioned GFDL, reusers may pick either, and "these licenses do allow commercial uses of your contributions" as long as the license terms are met. Commercial use (ads, subscriptions, paid tier) is **confirmed allowed**.
  https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use
- Wikipedia:Reusing Wikipedia content: text "can be used free of charge for any purpose so long as licensing terms are met."
  https://en.wikipedia.org/wiki/Wikipedia:Reusing_Wikipedia_content
- Use CC BY-SA 4.0, not GFDL (GFDL would require a "transparent copy" and the full license text).

### Exact attribution requirements
Wikimedia ToU section 7 and the reuse page say credit to the authors may be given by **any one of**:
1. "a hyperlink (where possible) or URL to the page or pages you are re-using" (this counts as crediting all authors, since the page history lists them),
2. a hyperlink or URL to an alternative stable, freely accessible copy that credits the authors equivalently, or
3. a list of all authors.

Plus:
- **License notice:** each copy must include a notice that the text is under CC BY-SA, with a link to or copy of the license (https://creativecommons.org/licenses/by-sa/4.0/).
- **Indicate changes:** you must show "in a reasonable fashion that the original work has been modified."
- CC BY-SA 4.0 legal code, §3(a)(1): retain creator identification, copyright notice, license notice, disclaimer notice and "a URI or hyperlink to the Licensed Material to the extent reasonably practicable"; "indicate if You modified the Licensed Material". §3(a)(2): this may be done "in any reasonable manner based on the medium, means, and context". https://creativecommons.org/licenses/by-sa/4.0/legalcode.en

Recommended: link to the **specific revision** (`index.php?title=…&oldid=<revid>`) that was used, which is a stable copy and makes the "changes" claim checkable.

### Share-alike: what must be CC BY-SA
- **Verbatim excerpt:** stays CC BY-SA 4.0; attribute as above.
- **Edited excerpt, summary, or LLM rewrite produced from the article:** CC BY-SA 4.0 defines Adapted Material as material "derived from or based upon the Licensed Material … translated, altered, arranged, transformed, or otherwise modified". Whether a given summary is legally an adaptation depends on whether it copies protected expression (wording, structure, selection) rather than just facts; the CC FAQ says an adaptation generally needs "sufficient new creativity" and that "Facts are not subject to copyright, nor are the ideas underlying copyrighted content." An LLM summary of a single article usually follows that article's order, selection and phrasing closely, so **the safe and cheap course is to treat any text written with the Wikipedia article in the prompt as Adapted Material** and license it CC BY-SA 4.0. Translation from another language edition is always an adaptation.
- §3(b) ShareAlike: the adapter's license must be a CC license with the same elements (BY-SA 4.0 or later), you must link it, and "You may not offer or impose any additional or different terms or conditions on" the adapted text (so site terms must not forbid copying those texts, and no technical lock-in).
- **Does it infect the rest of the site? No.** CC FAQ: "CC licenses do not require the collection or the compilation itself to be made available under an SA license." The site code, the recommendation data, the design and any text written independently (e.g. from Wikidata facts alone) keep their own status. Only the Wikipedia-derived text blocks are BY-SA. https://creativecommons.org/faq/
- **Public repo:** the JSON holding those texts is a redistribution. The repo has no LICENSE file today (all rights reserved by default); add a notice next to the data file saying the description texts are CC BY-SA 4.0 and that each record's source/revision field is its attribution, so the repo copy is compliant too.

### Fetching ~10k pages: policies and limits
- **User-Agent is mandatory:** "Wikimedia sites require an HTTP User-Agent header for all requests", format `<client name>/<version> (<contact information>) <library>/<version>`; generic agents get HTTP 403 or are "blocked without notice". https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy
- **New 2026 rate limits** (per minute, Action API and REST API): anonymous with no identification **10 req/min**; identified bots with a compliant User-Agent **200 req/min**; authenticated new accounts 200/min, established editors 2,000/min; bot-flagged accounts exempt. Marked "new in 2026" and "subject to experimentation and change". https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits . The changelog records enforcement from March 2026 and limits on identified requests from late April 2026. https://www.mediawiki.org/wiki/Wikimedia_APIs/Changelog
  - Observed today: from this sandbox's shared egress IP, a dozen Wikidata API calls in a loop with a proper User-Agent already got "You are making too many requests to the API". Plan for serial requests, backoff, and ideally OAuth2 authentication or bulk sources.
- **API:Etiquette:** "There is no hard speed limit on read requests", requests "in series rather than in parallel", use `maxlag` for non-interactive jobs, back off on `ratelimited`. https://www.mediawiki.org/wiki/API:Etiquette
- **Endpoints:**
  - REST page summary `https://<lang>.wikipedia.org/api/rest_v1/page/summary/<title>`: still live (no deprecation found; RESTBase docs moved to Special:RestSandbox). Returns the lead extract, `description`, `revision`, and the page URL. One page per request: 10k requests at 200/min is under an hour.
  - Better for bulk: Action API `action=query&prop=extracts|revisions|pageprops&exintro=1&explaintext=1` batches **20 titles per request** for intros (≈ 525 requests for the catalog); full-article plain text is one title per request. `pageprops` gives `wikibase_item` (the Wikidata QID).
  - **Wikimedia Enterprise** (built for commercial reusers): free account, no card: On-demand API up to **50,000 requests/month**, Snapshot API 30 requests/month and 1,500 chunks/month, Structured Contents (beta, includes abstract) and Wikidata; paid tier has bespoke, unpublished pricing. 50k/month covers the whole catalog in one month. https://enterprise.wikimedia.com/pricing/
  - **Dumps** (dumps.wikimedia.org, "Most content and data … can also be downloaded in bulk"): overkill for 10k pages but free and limit-free. https://www.mediawiki.org/wiki/Wikimedia_APIs/Access_policy
- Wikimedia also publishes an optional Attribution Framework and Attribution API for reusers (norms, not license terms): https://www.mediawiki.org/wiki/Wikimedia_Attribution_Framework

### Non-English Wikipedias
Same Terms of Use, same CC BY-SA 4.0. Find them through the Wikidata item's sitelinks (jawiki, ptwiki, dewiki, frwiki, plwiki…), useful for Japanese, Brazilian, Polish, Italian, French records. A translated summary is an adaptation: attribute as "adapted and translated from the Japanese Wikipedia article …".

### Coverage (measured on the catalog)
- `data-pipeline/catalog/albums.csv` has `rym_url` for 10,000 of 10,467 albums.
- Direct ID joins to Wikidata (RYM slug P8392, Spotify P2205, Deezer P2723, Apple P2281) found only **1,834** albums (1,713 with an English article), because store IDs differ by edition (e.g. the site's OK Computer Spotify ID differs from Wikidata's) and P8392 is sparse (only 813 matches).
- A random sample of 55 albums searched by title and artist on MusicBrainz: 45 matched a release group, **32 (58%) had a Wikidata link** (a Wikidata item usually, not always, means a Wikipedia article in some language; not checked one by one). Misses included albums that surely have articles (e.g. D'Angelo "Brown Sugar", Angel Olsen "All Mirrors"), so real coverage is higher once a Wikipedia title search fallback is added. Expect roughly 60 to 75% with an article in some language, much higher in the top ranks; the long tail (demos, game and anime soundtracks, obscure metal, classical recordings) will have none.

---

## 2. Wikidata (CC0)

**Verdict: Use.** "All structured data (i.e. the main, Property, Lexeme, and EntitySchema namespaces) is released into the public domain" under CC0. No attribution required (a credit is courteous). https://www.wikidata.org/wiki/Wikidata:Licensing

Item **descriptions** (e.g. "1997 studio album by Radiohead") are in the main namespace, so CC0 too: a ready, license-free fallback one-liner.

### Album facts it can hold (coverage is uneven)
| Property | ID | Note |
|---|---|---|
| publication date | P577 | common |
| genre | P136 | common |
| record label | P264 | common |
| producer | P162 | ~64k album statements |
| performer | P175 | |
| recorded at studio or venue | P483 | sparse (~5k album statements) |
| recording location | P8546 | sparse |
| recording date | P10135 | very sparse (~2.6k) |
| part of the series | P179 | e.g. discography series |
| award received | P166 | Grammys, National Recording Registry etc. |
| tracklist | P658 | |
| review score / review score by | P444 / P447 | e.g. Pitchfork 10/10, a fact you can show with a link |
| follows / followed by | P155 / P156 | previous and next album |

### Crosswalk IDs (exact properties and formats, checked via SPARQL today)
| ID | Property | Format | Formatter URL |
|---|---|---|---|
| Spotify album ID | **P2205** | `[0-9A-Za-z]{22}` | |
| Apple Music album ID | **P2281** | `[1-9][0-9]*` | `https://music.apple.com/album/$1` |
| Deezer album ID | **P2723** | `\d+` | `https://www.deezer.com/album/$1` |
| MusicBrainz release group ID | **P436** | UUID | |
| MusicBrainz release ID | P5813 | UUID | |
| Discogs master ID | **P1954** | `[1-9][0-9]*` | |
| Discogs release ID | P2206 | `[1-9][0-9]*` | |
| **Rate Your Music release ID** | **P8392** | path after `/release/`: `album/<artist-slug>/<album-slug>` (also `single/…`, `ep/…`; some older values use underscores or a trailing slash, non-Latin slugs are percent-encoded) | `https://rateyourmusic.com/release/$1/` |
| RYM artist ID | P5404 | | |
| AllMusic album ID | P1729 | `mw[0-9]{10}` | |
| Genius album ID | P6217 | `Artist/Album` | |
| Encyclopaedia Metallum release ID | P2721 | | |
| Bandcamp release ID | P11354 | `\d+` | |
| Tidal album ID | P4577 | | |
| Last.fm ID | P3192 | | |

Example, OK Computer (Q202996): P8392 `album/radiohead/ok-computer`, P2205 `2fGCAYUMssLKiUAoNdxGLx`, P2281 `1097861387`, P2723 `14879699`, P436 `b1392450-e666-3926-a536-22c65f834433`, P1954 `21491`.

To join: strip `https://rateyourmusic.com/release/` and the trailing slash from `rym_url`, lower-case, compare to P8392; then try P2205/P2723/P2281; then MusicBrainz (section 3).

**Practicality:** excellent. The SPARQL endpoint returned 41k Spotify-ID rows in one query. Use whole-table queries rather than per-album API calls (the per-call API hit the 2026 rate limits quickly).

---

## 3. MusicBrainz

**Verdict: Use core data (CC0). Don't use annotations, tags, ratings.**

- License split, https://musicbrainz.org/doc/About/Data_License and https://musicbrainz.org/doc/MusicBrainz_Database:
  - Core data, **CC0**: artists, labels, places, recordings, release groups, releases, series, works, "Relationships & URLs".
  - Supplementary data, **CC BY-NC-SA 3.0**: "user submitted annotations, tags (including genre associations) and ratings", edit history, statistics. **Annotations are non-commercial**, so not usable on a possibly-commercial site without a separate license from MetaBrainz ("MusicBrainz users give the MetaBrainz Foundation the right to license this data for commercial use").
- Commercial use: MetaBrainz social contract: "We won't object to commercial use of our content" (https://metabrainz.org/social-contract). The **Live Data Feed** replication packets are CC BY-NC-SA 3.0 and "we ask that commercial users support our efforts financially" (https://musicbrainz.org/doc/Live_Data_Feed). Supporter tiers: Stealth Start-Up $0+, Bronze $100+/month for "small to mid-size start-ups with public products", etc. (https://metabrainz.org/supporters/account-type). Using the CC0 core data from the API or dumps does not legally require a tier; signing up as a supporter once revenue exists is the decent thing.
- API: "on average 1 request per second" per IP, 503 above it; meaningful User-Agent with contact required. https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting . 10k albums × 2 calls ≈ 6 hours, fine for an offline pipeline (observed today: occasional 503s, need retry).
- Useful for this feature: URL relationships to **Wikidata, Wikipedia, Discogs, AllMusic, Bandcamp**; producer/engineer credits; "recorded at" place relationships with dates. All CC0.

---

## 4. Discogs

**Verdict: Facts only, from the CC0 monthly dumps.** Not a source of description text.

- Dumps: "This data is made available under the CC0 No Rights Reserved license"; releases, artists, labels, masters. https://data.discogs.com/
- API Terms of Use (last updated 27 May 2025), CC0 Data explicitly includes "Release titles, notes, dates, format, track listings, barcodes and other identifiers, credits…" and "Artist names, notes"; Restricted Data is user data and images ("You may not … Use Restricted Data for any commercial purposes"). https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use
- But the **API** adds conditions even for CC0 data: "You may not display … the Content if it is more than six (6) hours older than the information on Our online properties"; "You may not cache or store the Content longer than is necessary"; a prominent "not affiliated" notice; and "Data provided by Discogs." next to the data, hyperlinked to the discogs.com page, no `nofollow`. Charging for access to data Discogs gives free is a prohibited commercial use. A static site with committed JSON cannot meet the 6-hour rule, so **use the dumps, not the API**.
- Content reality (checked today): master 21491 notes are one useful sentence ("Radiohead's third studio album, produced by Nigel Godrich" plus release dates); release notes are pressing details and verbatim sleeve text ("Back sleeve reads: … © 1997 EMI Records Ltd"). Transcribed sleeve and liner text is the label's copyright, which a contributor's CC0 dedication cannot clear (Discogs disclaims non-infringement). Use for facts (dates, credits, labels), not for prose.

---

## 5. Last.fm album wiki

**Verdict: Don't.**

- Album wiki pages say "All user-contributed text on this page is available under the Creative Commons Attribution-ShareAlike License; additional terms may apply." (https://www.last.fm/music/Radiohead/OK+Computer/+wiki)
- API Terms of Service: 3.1 "You are permitted to use the Last.fm Data solely for non-commercial purposes"; 3.2 commercial use requires a commercial use agreement (partners@last.fm); must credit and link Last.fm; storage cap of 100 MB; delete on termination. https://www.last.fm/api/tos
- Site terms: non-commercial licence, no spidering/screen scraping, no "commercial purpose or activity" without consent. https://www.last.fm/legal/terms
- So the CC BY-SA text is only reachable through channels that are non-commercial, and album wikis are very often pasted from Wikipedia without attribution, so provenance is unreliable. Wikipedia gives the same text directly under clean terms.

---

## 6. AllMusic / Xperi (TiVo, formerly Rovi)

**Verdict: Don't use the text; link out via Wikidata P1729.**

- AllMusic's FAQ says album reviews, biographies, credits, genres and moods "come from our data provider, Xperi (formerly known as TiVo)"; AllMusic itself is a licensee (web property owned by Nexxen, data by Xperi). https://www.allmusic.com/faq/artist , https://www.allmusic.com/copyright-policy (403 to automated fetch; quoted via search)
- Xperi sells "expert-written editorial content & ratings" as a B2B metadata license; pricing is not published (enterprise sales). https://musicbiz.org/news/new-member-profile-xperi/
- Not realistic for a free side project; expect four- to five-figure annual contracts with display and caching rules.

---

## 7. Apple Music editorial notes (Apple Music API / MusicKit)

**Verdict: Don't.**

- The album resource has `editorialNotes` (`short`, `standard`, plus `name`, `tagline`) written by Apple Music editors. https://developer.apple.com/documentation/applemusicapi/albums/attributes-data.dictionary
- Apple Developer Program License Agreement (last updated 18 Aug 2026), §3.3.6(D) MusicKit: "You agree not to call the MusicKit APIs or use MusicKit JS (or otherwise attempt to gain information through the MusicKit APIs or MusicKit JS) for purposes unrelated to facilitating access to Your end users' Apple Music subscriptions"; "album art and music-related text from the MusicKit API may not be used separately from music playback or managing playlists"; "You agree not to … indirectly monetize access to the Apple Music service (e.g. … advertising …)". https://developer.apple.com/support/terms/apple-developer-program-license-agreement/
- §3.3.6(F) Apple Music Feed API: content only on screens that promote that music, next to an Apple Music badge linking to it, "not used for independent entertainment value apart from its promotional purpose".
- Pulling notes offline and committing them to a public repo for a recommender page breaks both.

---

## 8. Spotify Web API

**Verdict: Not applicable.** The album object has no description, editorial or biography field (only `name` and copyright text); `genres` is "always empty"; `label` and `popularity` are deprecated. https://developer.spotify.com/documentation/web-api/reference/get-an-album

Developer Terms v10 (effective 15 May 2025), for context: §IV.2.a.i bars "using the Spotify Platform or any Spotify Content to train a machine learning or AI model"; §IV.3.a.i "you may not store, aggregate or create compilations or databases of Spotify Content, other than as strictly necessary" and "Do not store Spotify Content indefinitely"; §IV.2.e no transfer to ad networks; §V.5 no selling Spotify data. https://developer.spotify.com/terms

---

## 9. Genius album descriptions

**Verdict: Don't.** genius.com and docs.genius.com block automated fetches; secondhand but consistent: the terms say "The Service is for your personal use and may not be used for direct commercial endeavors without the express written consent of Genius", and commercial API use needs a license from api-sales@genius.com. Album descriptions are user annotations hosted by Genius with no open license; the public API does not expose album descriptions as a documented field anyway. Sources: https://publicapis.dev/resource/genius/ro8ulu1u , https://lyricsgenius.readthedocs.io/en/latest/how_it_works.html

---

## 10. RateYourMusic / Sonemic

**Verdict: Don't take text; link only (P8392 / `rym_url`).**

- RYM release pages have no editorial description; text is user reviews (copyright of each reviewer) plus descriptors, lists and credits.
- Scraping: the official r/rateyourmusic wiki FAQ says scraping or crawling RYM with automated tools without permission is forbidden by the Terms of Service and can lead to bans; the founder has said RYM "never allowed scraping". No public API yet (in development). rateyourmusic.com/terms returns 403 to automated fetches; secondhand. https://en.wikipedia.org/wiki/Rate_Your_Music

---

## 11. Critic reviews (Pitchfork, Rolling Stone, The Wire, etc.)

**Verdict: Link only, plus the score and at most one short, attributed quote.**

- Reviews are copyrighted. Summarising a review's facts is fine; reproducing or closely paraphrasing its prose is not.
- US fair use (17 U.S.C. §107) weighs purpose (commercial weighs against), amount, and market effect; a one-sentence quote with attribution and a link, alongside your own text, is the usual safe pattern. EU InfoSoc Directive art. 5(3)(d) allows quotation "for purposes such as criticism or review" if the source and author are named, "in accordance with fair practice, and to the extent required by the specific purpose". A blanket quote on every page, used to decorate rather than to discuss, is weaker ground. https://www.law.cornell.edu/uscode/text/17/107 , https://eur-lex.europa.eu/eli/dir/2001/29/oj
- Scores and accolades are facts: Wikidata P444/P447 lets you show "Pitchfork: 10/10" with a link to the review.

---

## 12. LLM-written original text

### (a) From the model's own knowledge
- Ownership: Anthropic **Commercial Terms** (API; effective 17 June 2025) §B: Customer "(a) retains all rights to its Inputs, and (b) owns its Outputs", and "Anthropic hereby assigns to Customer its right, title and interest (if any) in and to Outputs." §D.4 bars using the Services to build a competing product or to "train competing AI models". https://www.anthropic.com/legal/commercial-terms . Consumer Terms (claude.ai; effective 8 Oct 2025) §4: "we assign to you all of our right, title, and interest—if any—in Outputs." https://www.anthropic.com/legal/consumer-terms . Use the API for a pipeline.
- IP indemnity (Commercial Terms §K.1) covers claims that Outputs from paid use infringe, but §K.3 excludes claims arising from "(a) modifications made by Customer to the Services or Outputs", "(c) Inputs or other data provided by Customer", and use the customer "knows or reasonably should know" infringes. §L.1: Customer warrants it "has all rights and permissions required to submit Inputs".
- Copyrightability: the US Copyright Office's 2025 report (Copyright and AI, Part 2) holds that text generated from prompts alone is not protected, so others may copy it; no problem for this use. https://www.copyright.gov/ai/
- Risks: **hallucination** grows sharply outside the canon (the descriptor-model experiment showed the LLM knows canon albums well; it has no grounding for a 2023 Brazilian demo); **regurgitation** of well-known review lines or Wikipedia sentences is possible for famous albums. Mitigate: write only from supplied facts, forbid quotes, keep it short, and run an n-gram overlap check against the fetched Wikipedia text.

### (b) Grounded on fetched Wikipedia text
Treat the output as Adapted Material (section 1): license it CC BY-SA 4.0, link the article revision and the license, and say it was summarised. The Anthropic indemnity will not cover a claim arising from that input (§K.3(c)), so compliance with the license is on the site, which is easy.

### (c) Grounded on Wikidata / MusicBrainz / Discogs-dump facts
No license conditions (CC0 facts). Safe for the short description of every album, including those with no article. Keep it factual and modest where facts are thin.

---

## 13. Other sources

| Source | License / terms | Verdict |
|---|---|---|
| Wikipedia in other languages | CC BY-SA 4.0, same as en (via Wikidata sitelinks) | Use with conditions; translation is an adaptation |
| Wikidata item descriptions | CC0 | Use as fallback one-liner |
| Bandcamp album "about" text | Terms (updated 7 May 2026): "Use, reproduction, modification, distribution or storage of any Content for other than personal, non-commercial use" is prohibited without permission; descriptive text belongs to the artist. https://bandcamp.com/terms_of_use | Don't (link via P11354 / `bandcamp_url`); could ask individual artists |
| TheAudioDB descriptions | Terms allow copying API output but the free tier cannot publish apps; descriptions are user-pasted, often from Wikipedia/AllMusic with unknown provenance. https://www.theaudiodb.com/docs_terms_of_use.php | Don't |
| Encyclopaedia Metallum | No open license; reviews belong to reviewers; no API | Facts only (line-ups, dates) + link (P2721) |
| Internet Archive (liner note scans, old magazines) | Rights stay with publishers; IA access does not license reuse | Link only |
| Label press releases / EPKs | Copyright of label; implied permission for press coverage, not bulk reuse | Link or short quote only |
| Jazz discographies (jazzdisco.org etc.) | No license; session dates and personnel are facts | Facts only |
| DBpedia | CC BY-SA (derived from Wikipedia) | Same as Wikipedia; no advantage |
| Library of Congress National Recording Registry essays | Written by guest authors, not public domain by default | Link only; registry membership is a fact (also on Wikidata P166) |

---

## Recommended commercially safe stack (ranked)

1. **Wikidata + MusicBrainz core (CC0) as the backbone.** Resolve each album to a MusicBrainz release group (search by Latin artist and title, or by Spotify/Deezer URL), then to a Wikidata item via URL relationships, then to Wikipedia sitelinks; first try the direct joins on `rym_url` (P8392), Spotify (P2205), Deezer (P2723) and Apple (P2281). Pull facts in bulk with SPARQL: date, label, producer, studio, recording dates, series, awards, review scores, previous/next album, plus all outbound IDs (AllMusic, Discogs, Bandcamp, Metal Archives, Genius) for links.
2. **Wikipedia (English first, then other languages) for the "show more" section.** Fetch the lead and the Background / Recording / Release / Reception sections with a compliant User-Agent, serially, via Action API batches or the Wikimedia Enterprise free tier (50k on-demand requests/month). Store `lang`, `title`, `revid` and fetch date per album.
3. **Claude (API, Commercial Terms) to write both texts**:
   - Short description (1 to 2 sentences): from CC0 facts and, if present, the Wikipedia lead.
   - Show more (about 120 to 250 words): a condensed summary of the Wikipedia sections, in the site's voice, no quotes, then an overlap check.
   - Any text whose prompt contained Wikipedia text is published as CC BY-SA 4.0 with the attribution below. To keep it simple, label both texts for those albums.
   - **No article found:** short description from CC0 facts only (or the Wikidata description), no invented background; hide "show more" or show a facts list (label, producer, studio, recorded, links).
4. **Links out, never copied text:** Wikipedia, AllMusic, Discogs, MusicBrainz, RYM, Bandcamp, Metal Archives, and critic reviews (with the score from P444 where present).
5. **Do not use:** Last.fm wiki, AllMusic text, Apple editorialNotes, Genius, RYM reviews, MusicBrainz annotations, Bandcamp "about", TheAudioDB, Discogs API (the dumps are fine for facts).

## Attribution UI needed

**Under the "show more" text (and under the short text if it used Wikipedia), per album:**

> Adapted from the Wikipedia article "[OK Computer](https://en.wikipedia.org/w/index.php?title=OK_Computer&oldid=<revid>)", shared under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Summarised by recmyrecord. Album facts from Wikidata and MusicBrainz.

Translated case: "Adapted and translated from the Japanese Wikipedia article "…", shared under CC BY-SA 4.0. …"

This one line meets every requirement: the link to the revision credits the authors (Wikimedia ToU option 1) and is a stable copy; the license is named and linked; "Adapted / Summarised" indicates changes; the site imposes no extra terms on that text.

**Site-wide (about or credits page, footer link):**

> Album facts come from Wikidata and MusicBrainz, which share them freely (CC0). The background texts are adapted from Wikipedia and shared under CC BY-SA 4.0, so you are welcome to reuse them under the same license. Each album page links the article it came from.

**In the public repo:** a short license note next to the data file that holds the texts, stating that the description fields are CC BY-SA 4.0 and that each record's source fields (`lang`, `title`, `revid`) are its attribution; the rest of the repository keeps its own terms.

Visitor-facing wording goes through `frontcreck/src/lib/copy.ts` and Samer's sign-off (no dashes in prose; the license name "CC BY-SA 4.0" is a proper name and stays as is). No Discogs notice is needed if only the dumps are used; if the Discogs API is ever used, "Data provided by Discogs" must sit next to that data with a followed link, plus a "not affiliated" notice.
