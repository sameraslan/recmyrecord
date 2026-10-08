# Album notes: design spec (draft)

Date: 2026-10-08. Status: proposal for Samer. Nothing here is built; no repository file was changed.

Read before writing this: `CLAUDE.md` ("Writing for visitors"), `frontcreck/README.md`, the redesign spec `docs/superpowers/specs/2026-09-29-recmyrecord-redesign-design.md` (sections 4.3, 4.4, 5, 7, 8), `frontcreck/src/components/album/{AlbumPanel,SeedHeader,RecList,RecRow,MapPreviewStrip}.tsx`, `frontcreck/src/lib/copy.ts`, `frontcreck/src/styles/{album,phone,map,shell}.css`, `frontcreck/src/app/globals.css`, `data-pipeline/catalog/albums.csv`, `frontcreck/public/data/recs.json`.

Two corrections to the brief, from the code:

- The Sonic / Balanced / Mood slider is not in the panel. On desktop it sits top-left on the map (`.mode`); on a phone it appears only in map mode, at the bottom. So the panel's vertical budget is: trail, seed header, tags, "Closest albums", 5 rows, "Show more" (and on a phone the map strip).
- The album's **year is shown nowhere** today, although `albums.csv` has `year` and `release_date`. That is the cheapest piece of context there is (section 2.1).

---

## 0. The idea in one paragraph

Give every album a one-sentence **hook** that says the one thing that makes this record itself (never that it is acclaimed: on a site built from RYM's top chart every album is acclaimed), and behind a "Read more" an inline **About this album** block: a credits-style facts list, three or four short sections written to be read while the record plays (Where it comes from, Making it, Listen for, What came after), and a plain sources line with the licence. It sits between the mood tags and "Closest albums", costs about two lines when closed, opens in place, and ends where the recommendations begin, so reading leads into the next album instead of away from it.

---

## 1. Placement: the core tension

The album page's job is the list of closest albums. The design spec set a bar for it: "All default rows fit without scrolling on a laptop" (section 3), and on phones "compact seed header, then the rows immediately" (section 4.4). Any text we add is paid for in rows.

### 1.1 The height budget today (estimate from the CSS; measure with `npm run shots`)

Desktop 1440 x 900: panel height 836 px. Padding 18, trail 38, seed header about 116 + tags 40, recs margin 18, heading 39, 5 rows at about 83 each (415), "Show more" 32. About 716 px used, **about 120 px free**.

Desktop 1280 x 800: panel height 736, same content, **about 20 px free**.

Phone 390 x 844: rows start roughly 450 px down; about 3.5 rows are visible above the fold.

So: on a 1440 x 900 laptop a two-line hook plus one meta line (about 90 px) fits with all five rows still visible. At 1280 x 800 it does not, without some give elsewhere (section 6.3).

### 1.2 Recommendation

**Desktop panel and phone, the same structure and the same DOM order:**

1. Seed header as today, with the year added to the artist line: `Radiohead · 1997`. Costs no height.
2. Mood tags, as today.
3. **About block (new):** the hook (one sentence, at most 2 lines on desktop, 3 on a phone), then one meta line: `Read more ⌄` on the left, the source in small quiet text on the right (`From Wikipedia`, or `Summarised from Wikipedia with AI help`).
4. "Read more" expands the full notes **inline, in place**, directly under the hook. The notes end with "Show less", and right after them the "Closest albums" heading follows as it does now.
5. "Closest albums", the rows, "Show more", the phone map strip: unchanged.

Why here:

- **The album's identity stays together.** Cover, artist, year, title, listen button and tags are not pushed apart; the notes come after them.
- **Reading leads into the next album.** A listener who opens the notes reads down, and the end of the story is the start of the list. On the desktop the map keeps showing the numbered recommendations the whole time, so they never fully leave the screen even when the notes are long.
- **The tags stay close to the rows.** Hovering a row lights the shared mood words in the tags (`lit`). With the hook between them they are about 90 px apart, still in view together; only when someone has chosen to open the notes do they separate, and then the person is reading, not comparing.
- **One pattern everywhere.** The same disclosure on every width means one component, one set of tests, one prerendered HTML with the text in it (good for search engines and for the link preview, section 5.6).
- **It is the pattern listeners know:** Apple Music's editorial blurb with "More" under the album header, Spotify's "About", Bandcamp's description beside the tracks, Wikipedia mobile's collapsed sections.

### 1.3 Alternatives considered and rejected

| Option | Why not |
|---|---|
| **Long text always visible between tags and list** | Pushes every recommendation below the fold on every album, for every visitor, whether they want to read or not. Breaks the page's main promise. |
| **Hook inside the header's right column, beside the cover** (magazine standfirst) | Attractive, but the column is already as tall as the 116 px cover (artist, title up to 3 lines, actions), so it adds the same height; on a phone the grid is different and the hook would have to move anyway. Two positions for one thing. |
| **Tabs: "Closest albums / About"** | Hides one or the other. A deep link to the About tab lands people on a page with no recommendations. Breaks the row hover link to the map and the tags. Tabs inside a 45% side panel feel like an app settings screen. |
| **A separate reading drawer over the map (desktop)** | The map is the second view of the recommendations (numbered covers, lines to the seed). Covering it to read about the seed trades the product's best visual for text. It also needs a second inset for the map camera (`usePanelInset`) and its own Escape handling. Worth revisiting only as a wide-screen reading mode (≥ 1600 px), not for the MVP. |
| **A push view inside the panel ("About" screen with a Back button)** | Adds navigation state and a second meaning for Escape (today Escape closes the album, or leaves phone map mode). Hides the list while reading. The tags no longer light. |
| **Phone: a full-height bottom sheet for the long text** | Stacks a sheet over a panel that is already full screen, plus the floating Map button; back gesture and Escape become ambiguous. Loses "finish reading, arrive at the next album". The phone keeps inline, like the desktop. |
| **The whole About section after the recommendations** (Spotify artist page style) | Protects the list perfectly but almost nobody would find it: the list is followed by the map strip, and people leave the page through a row. Worth testing **on the phone only** as variant B (section 7.2), because the phone's first screen is the tightest. |
| **Hook in the recommendation rows** | See section 4.1. |

---

## 2. Short and long

### 2.1 What is shown, by tier

Albums differ a lot in what is known. Four tiers, decided at build time, never at runtime:

| Tier | When | Collapsed | Expanded |
|---|---|---|---|
| **A, rich** | An album article (any language) with at least ~300 words about the album itself | Hook + meta line | Facts, 3 or 4 sections incl. Listen for, sources |
| **B, thin** | A stub, or only an artist article with a paragraph about this album | Hook + meta line | Facts + one short section ("Where it comes from"), sources |
| **C, facts only** | Nothing written, but Wikidata or MusicBrainz facts (label, producer, place, players) | One quiet facts line in place of the hook (`Recife, Brazil · Discos Marcus Pereira`), no "Read more" | none |
| **D, nothing** | Neither | The empty-state line (section 5.4) | none |

The year in the header line comes from our own catalog, so every album gets it, whatever its tier.

### 2.2 The hook (short description)

- **Length:** 80 to 120 characters, hard cap 130. At the desktop panel's content width (584 px at 1440, 432 px at 900 to 1100) that is 2 lines, 3 at the narrow width; on a 390 px phone 3 lines. It is written to length, never cut, so there is no fade or ellipsis in normal use.
- **What it says:** the one thing that makes this record itself. Usually one or two of: how it sounds (instruments, texture, an approach), where and how it was made, the idea or story behind it, the moment it answered. Concrete nouns over adjectives.
- **What it never says:** acclaim, rankings, "one of the greatest", sales, chart positions, awards, "masterpiece", "seminal", "iconic", "groundbreaking", "must listen". Every album here is acclaimed, so this carries no information, and it breaks the site's no-hype rule. Never the first sentence of Wikipedia's lead either ("X is the third studio album by English rock band Y, released on..."), which only repeats what the header already shows.
- **Voice:** the site's voice: plain, friendly, specific, a little character, no dashes, no emoji. Like a well-read friend handing you the record, not an encyclopedia and not a press release. Present tense for how it sounds, past tense for history.
- **Typography:** the display serif (Cormorant Garamond) roman, 20 px desktop, 19 px phone, line height 1.35, `--color-paper`. Roman, not italic, so it does not look like the italic "Closest albums" heading.

### 2.3 The long version

Order and structure (tier A). Target length **250 to 450 words in all**, so it reads in 2 or 3 minutes: about the length of the first song. Each section at most ~120 words; "Listen for" is a list.

1. **Facts** (a credits list, like the back of a sleeve). A two-column `<dl>`: small uppercase labels (the existing `.cap` style), values in `--color-dust`. Only facts we have from structured data, in this order, each line optional:
   - Released: `16 June 1997`
   - Recorded: `1996 to 1997, Canned Applause, Didcot and St Catherine's Court, near Bath`
   - Produced by: `Nigel Godrich and Radiohead`
   - Label: `Parlophone, Capitol`
   - From: for albums where place matters more than studio (`Recife, Pernambuco, Brazil`)
   - Players: for small ensembles and session crews, names with instruments
   Not shown: length, chart positions, certifications.
2. **Where it comes from** (background: the scene, the place, what came before).
3. **Making it** (who, where, how; the studio stories). Merged into section 2 for tier B and when the source is short.
4. **Listen for** (3 to 5 items, each a track name and one sentence): section 3.
5. **What came after** (what it led to for the people involved, and which records it led to). No praise, no rankings. "Legacy" is told through consequences: the next record, who borrowed the idea, what the producer did next.
6. **Sources** footer (section 5.1), plus "Something off? Let us know." (section 5.5).

Later (phase 2): **Same people, other records**: up to 4 catalog albums that share a producer, players or studio with this one, as small cover links (section 4.3).

Section headings are `<h3>` in the `.cap` style (11.5 px uppercase, letter-spaced, `--color-ash`): it reads like liner-note credits and stays quieter than the album title and the "Closest albums" heading.

**Verbatim Wikipedia or rewritten?** Both are designed for, because the decision is about quality at scale, not about layout:

- *Verbatim lead* (the article's opening paragraphs): no factual risk from us, simplest licence situation, available on day one for every album with an article. But it is encyclopedic, often half chart positions and "greatest albums" lists, and it rarely has anything to listen for. It cannot provide the hook (its first sentence is boilerplate).
- *Editorial rewrite* (AI-written from the article, Wikidata and MusicBrainz, checked): far better while listening, and the only way to get "Listen for" and a good hook. Needs a grounding and checking pipeline (section 5.3) and an honest label.

Recommendation: **MVP uses the editorial hook plus the verbatim Wikipedia lead** (cleaned: citation markers removed, date ranges written "1995 to 1997", marked "shortened and lightly edited"). **Phase 2 replaces the lead with editorial sections** for every album whose notes pass the checks, keeping the verbatim lead as the fallback. Phase 0 (section 7.1) checks this choice on 30 albums in both formats before anything is built.

### 2.4 How "Read more" behaves

- **Inline disclosure**, not a sheet or a dialog: a `<button aria-expanded aria-controls>`. Label "Read more", with a hidden " about {title}" for screen readers (the list below has its own "Show more", and the two must not read alike). The chevron turns 180° in 180 ms.
- **The body is in the server HTML**, collapsed with `hidden="until-found"`. Find-in-page (Ctrl+F) and search engines see it, and Chrome opens it on a match (`beforematch` sets the state). Browsers without `until-found` treat it as `hidden`.
- **Expanding:** nothing scrolls. The button stays where it is and the text appears under it. Focus stays on the button (standard disclosure). Height animates 260 ms with `var(--out)` (the `grid-template-rows: 0fr → 1fr` technique, or `interpolate-size` where supported), text fades in over 200 ms. Under reduced motion: instant.
- **Inside, at the top:** a small text link "Skip to closest albums" (moves focus to the list heading, `#recs-h`, which already has `tabIndex=-1`). It helps keyboard and screen-reader users and anyone who opened the notes by accident.
- **At the bottom:** "Show less". It collapses the block, then scrolls the panel (`.album-scroll`, not the window) so the top "Read more" button is in view, and moves focus to it. Without this, collapsing from the bottom of a long text would drop the person somewhere in the middle of the recommendations.
- **Deep link and restore:** opening the notes sets `#about` with `history.replaceState`; closing removes it. A link to `/album/ok-computer-radiohead#about` opens the notes and scrolls to them. This also restores the open notes when a phone browser reloads a tab the person left to go to the Spotify app, which happens often while listening. "Copy link" keeps copying the page link without the hash (no change to `CopyLinkButton`).
- **Escape** keeps its current meaning (close the album, or leave phone map mode). The notes are not modal and do not take it over.
- **Default state:** closed on every album, also when arriving from an album whose notes were open. A remembered "always open" preference pushes the recommendations down on every page, so it is a phase 3 test, not a default.
- **Album to album:** the panel already scrolls to the top and fades; the notes start closed. The `expandedFor` pattern in `AlbumPanel` (state keyed by slug) is the model to copy.

---

## 3. While the record plays

The most likely moment: the person pressed "Open in Spotify", the record is playing in another tab or app, and they come back to the page. What helps then, in order of value:

1. **Listen for** (phase 2, the most valuable). Three to five pointers tied to tracks, each one sentence: something you can hear, and why it is there. Example: "*Exit Music (For a Film)*: written for the closing credits of Baz Luhrmann's *Romeo + Juliet*." Track names are set in the serif italic in the album's accent colour (`--acc`, which the code already guarantees at 4.5:1 against the room colour), with a 2 px accent bar on the left like a hovered row. Grounded in the article's "Composition", "Songs" or "Recording" sections; only items the source supports, so many albums get 2 items or none, and the section is then left out.
2. **The making** (MVP through the lead; better in phase 2). The studio, the room, the year, who was in it: the context that makes a sound make sense.
3. **Where it comes from** (MVP through the lead). Scene, city, movement. Especially valuable for the catalog's long tail (Brazilian, Japanese, Eastern European records), where the listener usually knows nothing at all.
4. **Track by track notes** (phase 3). A short note per track keyed to the track list (MusicBrainz), drawing on the song articles that famous songs have. High value, high cost, high error risk; only after Listen for has proven itself.

Small things that help while listening:

- **Reading length that fits the first song or two** (250 to 450 words).
- **Restore on return** through `#about` (section 2.4).
- **No "now playing" sync.** The site is static and has no Spotify login; it cannot know which track is playing, and should not pretend to. A Spotify embed player on the page was out of scope in the redesign spec and would cost the performance budgets; leave it out.
- **No reading-time label.** "2 min read" is article furniture; the text is short enough.

---

## 4. Recommendations and the text

### 4.1 A hook in each recommendation row? No.

- Rows are already title (2 lines), artist and "Shares lush, melancholic". A hook would double their height and halve the rows on screen: exactly the cost this design is trying to avoid.
- The decision a row asks for is "is this worth a click", and the cover, title, artist and shared mood words answer it well. The hook is one click away, on that album's page.
- Better places for the hook outside the album page (phase 2): the **Explore map card** (cover, title, artist, "See closest albums"): one line of hook helps decide whether to go in, and the card has the room; the **link preview** (`og:description` and meta description), section 5.6.

### 4.2 Should the text explain why albums connect? Carefully, and never as the reason for a recommendation.

The recommendations come from sound and mood only; the About page says so, explicitly: listening history and genres play no part. Text that says "recommended because they share a producer" would be false. Real example from `recs.json`: at the Sonic stop, OK Computer's closest album is Beck's *Sea Change*, which Nigel Godrich also produced; at Balanced, the list has Owen, Modest Mouse, Steve Earle, Kid A and PJ Harvey, and no history connects most of them. A shared producer is a coincidence of the data, not the cause.

So:

- The **"Shares {mood words}" line stays the only "why"** on a row. It is true to how the list is made.
- **Factual connections are a separate, labelled path** (phase 2): a "Same people, other records" strip at the end of the notes, listing catalog albums that share a producer, players or a studio, built from Wikidata and MusicBrainz credits. It is about history, it says so, and it sits in the notes, not in the list. Examples: OK Computer → *The Bends*, *Kid A*, Beck's *Sea Change* (Nigel Godrich). *Misslim* → Happy End's *Kazemachi Roman* and *Pacific* (Haruomi Hosono and Shigeru Suzuki play on all three) [verify credits].
- A small "Also produced by Nigel Godrich" note on a row that happens to share a producer is a phase 3 experiment, only with a test showing people do not read it as the reason for the match.

### 4.3 Linking albums the text mentions (yes, phase 1.5 to 2)

A strong, cheap discovery path: the story of a record is full of other records.

- **Match by identity, not by text.** Wikipedia's links point to articles; articles map to Wikidata items; our albums map to Wikidata items (section 8.1). So "The Bends" in OK Computer's article becomes a link to `/album/the-bends-radiohead` exactly, with no fuzzy title matching. In editorial text, the writer keeps the source's link targets.
- Links keep the current `?by=` (use `albumHref`). Style: paper text with a 1 px underline in `--acc` at about 50%, full accent on hover and focus. External links (sources) carry the existing `ext` icon and the hidden "(opens in a new tab)".
- Albums **not** in the catalog stay plain text (no dead ends, no links out to Wikipedia from inside the story).
- Phase 3: hovering or focusing a mentioned album highlights it on the map, as rows do (`setHot`), when it is in view.

---

## 5. Trust and attribution

### 5.1 The sources line, without clutter

Two levels:

**Collapsed (always, next to "Read more"):** one short phrase, 12.5 px, `--color-ash`, the source name a link:

| Text is | Collapsed source label |
|---|---|
| Verbatim Wikipedia | `From Wikipedia` |
| Rewritten from Wikipedia | `Summarised from Wikipedia with AI help` |
| Rewritten and translated | `From Japanese Wikipedia, translated with AI help` |
| Facts only (tier C) | none (facts are not text; they are credited on the About page) |

AI help is said where the AI-written text is, not only behind a click. It is a few words in a quiet colour; honesty is worth the line.

**Expanded footer (end of the notes):**

> Based on the Wikipedia article *OK Computer* (English, version of 1 October 2026), with facts from Wikidata and MusicBrainz. Written with AI help and checked by hand. You can reuse this text under CC BY-SA 4.0.
> Something off? Let us know.

Variants: "Shortened and lightly edited from..." for the verbatim lead; "Translated from the Portuguese Wikipedia article..." for translations; "Written with AI help. It can get small details wrong, and the sources have the whole story." for notes that only passed automatic checks. "Checked by hand" appears only when a person actually checked that album's notes.

Licence mechanics (not legal advice; worth one look by someone who knows CC BY-SA):

- Wikipedia text is CC BY-SA 4.0. Reuse needs the title, a link to the source (pin the revision, `oldid`, so the link shows the text we used), "Wikipedia contributors" as author (the link covers it), a link to the licence, and a note that it was changed.
- A rewritten or translated summary of an article is safest treated as an adaptation: the notes text is then itself CC BY-SA 4.0. The site code is unaffected. Keep the notes in their own data file with a licence note.
- Wikidata and MusicBrainz core data are CC0: no attribution needed, but credit them anyway.
- The About page gets one more credits sentence and a short paragraph on how the notes are made (section 5.7).

### 5.2 What the notes never do

- No acclaim, rankings or sales as content (section 2.2).
- No quotes of slurs or offensive lyrics; describe themes plainly, without graphic detail.
- **Hard subjects** (suicide, abuse, addiction, violence) in an album's themes: say what the record is about in plain words, without detail, never in the hook unless the record is wholly about it (and then plainly, without sensationalism).
- **Artists with crimes or extremist ties** (the RYM chart has some): say it where it matters to the record, in one factual, sourced sentence in "Where it comes from" or "What came after", never in the hook, never glorifying, never as a joke. Albums that exist to spread an ideology: facts only (tier C), decided by hand.
- **Living people:** nothing beyond what the source says and cites; no speculation about health, relationships or motives.
- **Story spoilers** for concept albums and rock operas: the hook gives the premise only; the full story goes in "Where it comes from" or "Listen for", which a person opens on purpose. No spoiler warnings: they add clutter for little gain on music.

### 5.3 Keeping AI-written text true (pipeline rules that shape the design)

- Write **only from retrieved source text**, never from the model's memory. Each sentence carries the ids of the source passages it rests on (kept in the data, not shown).
- **Automatic checks** before anything ships: a second pass judges each sentence against its passages; dates, places, names and numbers are checked against Wikidata and MusicBrainz; a style check rejects dashes, hype words, acclaim and ranking language, and length overruns; catalog links must resolve.
- **Human check:** all hooks for the ~500 most visited albums (start with the top-ranked, which feed the Home shelf), every note an automatic check flagged, and a 2% random sample of the rest. The sample's error rate is published in the experiment report.
- Anything failing falls back one step: editorial → verbatim lead → facts only.

### 5.4 Albums with nothing (tier D), and thin ones

Thin (tier B or C): show what there is, in the same place, with no apology. A facts line alone is a fine outcome.

Nothing (tier D): one quiet line in the hook's place (sans, 15 px, `--color-dust`):

> Not much has been written about this one yet, so you get to hear it with fresh ears.&nbsp;:)

It says what still works (the music), suggests the next step (listen), does not blame anyone, and makes obscurity a small pleasure rather than a gap. Alternatives for Samer:

- "Nobody has written much about this one yet. Press play and make up your own mind.&nbsp;:)"
- "No notes for this one yet. A good excuse to just listen.&nbsp;:)"

### 5.5 "Something off? Let us know."

The site is static and must not show the owner's name; a GitHub issue link would show it (the repository is `sameraslan/recmyrecord`). Use a plain `mailto:` to a project address (for example notes@ a project domain), with the subject prefilled `Notes: {title} by {artist}`. Shown only in the expanded footer. Decision for Samer (section 9).

### 5.6 Search and link previews

Album pages are prerendered (`generateStaticParams`) and all use the same `COPY.metaDescription` today. Use the hook as the page's meta description and `og:description` where there is one; keep the generic line elsewhere. Shared links then say something about the record. No new request at runtime.

### 5.7 Non-English sources

Much of the catalog's tail (Japanese, Brazilian, Turkish, Polish, Russian records) has an article only in its own language.

- Find articles in **any language** through Wikidata's site links. Prefer English when it has enough about the album; otherwise use the longest article.
- Translate and summarise; say so in the source label and footer, and link the original article.
- Names in native script keep the site's existing form, native with Latin in brackets (`BracketText`), and get a `lang` attribute where the language is known, so screen readers and fonts (the CJK serif fallbacks in `--font-serif`) handle them.
- Never translate song or album titles silently: native title, then a translation in brackets if the source gives one.

---

## 6. Visual design and accessibility

### 6.1 Type and measure

| Element | Style |
|---|---|
| Hook | `--font-serif` roman 500, 20 px / 1.35 desktop, 19 px phone, `--color-paper`, `text-wrap: pretty` |
| Meta line | "Read more" in the existing `.textbtn .u` style (as the list's "Show more"); source label 12.5 px `--color-ash`, link underline on hover |
| Facts | `<dl>`, two columns on desktop (label 104 px, value), stacked on phone; labels `.cap`; values 14.5 px / 1.45 `--color-dust` |
| Section headings | `<h3>` in `.cap`, 22 px above, 6 px below |
| Body | `--font-sans` 15.5 px / 1.62, `--color-paper`, paragraphs 0.75 em apart, **max-width 36em** (about 560 px: about 70 characters a line at 1440, about 60 at 900 to 1100, about 45 on a phone) |
| Listen for | List; track name serif italic 17 px in `--acc`; 2 px `--acc` bar on the left like `.rec-main::before`; note in body style |
| Footer | 13 px / 1.5 `--color-ash`, a hairline (`--color-rule`) above |
| Empty line | 15 px `--color-dust` |

Spacing: 16 px from tags to hook, 6 px from hook to meta line, 18 px from the About block to "Closest albums" (as today from tags). When open, 28 px between the notes' "Show less" and "Closest albums", with the heading's existing rule acting as the divider.

### 6.2 Truncation and fade

The hook is written to length, so normally nothing is cut. When something must be cut (the short-viewport rule below, or a translated hook that ran long), clamp with `-webkit-line-clamp` and fade the end of the last line with **`mask-image`** on the text, not a gradient laid over it: the ambient wash (`.amb`, two cover colours behind the header) makes the background uneven, and an overlay gradient would show as a band. The full text stays in the page and opens with "Read more".

### 6.3 Keeping the rows on screen

Budget rules, checked with `npm run shots` and asserted in an end-to-end test:

- 1440 x 900: all five rows fully visible with the About block closed.
- 1280 x 800: rows 1 to 4 fully visible and row 5's title visible. With `@media (min-width: 900px) and (max-height: 820px)`: cover 100 px instead of 116, 12 px instead of 18 above "Closest albums", hook clamped to 1 line (section 6.2).
- 390 x 844: at least row 1 fully and row 2 partly visible above the fold. On phones the hook clamps to 2 lines (fade, full text in the open notes), and the meta line is one 44 px tap row.

### 6.4 Motion

- Open and close: height 260 ms `var(--out)`, opacity 200 ms; chevron 180 ms. Nothing animates on page entry beyond the panel's existing fade.
- `prefers-reduced-motion`: instant (the global rule in `shell.css` already shortens transitions; the open state should not depend on a transition ending).
- The list's FLIP animation (`useFlipList`) must not fire when the notes open: the rows move because the layout moved, not because the ranking changed. Its key is `stop|expanded`, so it does not, but test it.

### 6.5 Ambient colour

The top of the About block sits inside the 440 px ambient wash. The wash is darkened and desaturated, but check AA contrast for `--color-ash` (12.5 px source label) at the wash's lightest point on the 20 lightest covers. Use `--acc` only for the Listen for accents and mentioned-album underlines, never for body text.

### 6.6 Accessibility

- Structure: `<section aria-labelledby>` with an `<h2>` "About this album" that is visually hidden (the hook needs no visible label; a visible one would cost a line). Sections are `<h3>`. Heading navigation goes: album title, About this album, its sections, Closest albums.
- Tab order: Open in Spotify, Copy link, Read more, source link, then (open) Skip to closest albums, links in the text, sources, Let us know, Show less, then the rows.
- Disclosure semantics: `aria-expanded`, `aria-controls`. No live-region announcement of the text.
- Text at 200% zoom and 320 px width: no horizontal scroll (the facts list stacks).
- `lang` on translated passages and native names (section 5.7).
- All strings in `copy.ts` (`COPY.album.notes.*`), including the hidden ones.

---

## 7. Measuring success, and a test plan

### 7.1 Phase 0: an experiment before any build

Per `experiments/README.md`: a new `experiments/album_notes/` on an `experiment/album-notes` branch that only adds files, with a `REPORT.md`.

1. **Coverage.** Match all 10,467 albums to Wikidata (by Spotify album id, Apple Music album id, MusicBrainz release group, then title and artist search; property ids P2205, P2281, P436 [verify], and RYM release id if Wikidata has one [verify]). Count, by rank band (1 to 1,000, 1,001 to 5,000, 5,001 to 10,467) and by language: album article in English; in another language only; artist article only; structured facts only; nothing. Words about the album per article. This replaces the 70 to 90% guess with numbers and fixes the tier thresholds.
2. **Content.** Notes for 30 albums (10 per rank band, at least 8 with non-English sources) in both formats: verbatim lead and editorial sections. Samer and two listeners rate each for accuracy (claims checked against the source), interest while listening (1 to 5) and voice. Count wrong claims per 100 sentences.
3. **Prototype.** A static HTML mock outside the repository (or an Artifact) of three albums (one rich, one translated, one empty) in collapsed and open states at 1440 x 900, 1280 x 800 and 390 x 844, using the real CSS tokens. Check the fold rules (section 6.3) before writing any React.

### 7.2 Usability test (5 or 6 people, 30 minutes each, remote)

People who listen to whole albums: a mix of RYM users and Spotify-only listeners, at least two on phones.

Tasks:

1. "Open an album you know well. Tell me what you see." (Do they notice the hook? Do they read it?)
2. "Now find something new to listen to from here." (Does the About block slow down or block the main task?)
3. "Open an album you have never heard, put it on, and use this page for ten minutes while it plays." (Do they open the notes, read while listening, come back after switching apps, reach the list after reading?)
4. "Where do you think this text comes from? Would you trust it?" (Do they see the source line and the AI note?)

Questions after:

- "What did you learn that changed how you heard the record?"
- "Was there anything you wanted to know that wasn't there?" (Track notes? Lyrics? Credits?)
- "Did the text ever get in the way of finding the next album?"
- "Did anything sound wrong, too gushing or too dry?"

Phone variant: half the phone participants see the About block between tags and list (A), half after the list, before the map strip (B). Pick B only if A clearly hurts the first-screen use of the list.

### 7.3 Metrics once live

The site has no analytics today. Measuring live use needs a privacy-friendly, cookieless counter with a handful of events (for example Vercel Web Analytics custom events): `notes_open`, `notes_section_seen` (Listen for reached), `rec_click`, `listen_click`, `mentioned_album_click`. Decision for Samer (section 9); without it, rely on 7.1 and 7.2.

| Measure | Target |
|---|---|
| Album views where the notes are opened | 15% or more desktop, 8% or more phone (tier A albums) |
| Openers who reach Listen for | half or more |
| Recommendation clicks per album view (guardrail) | no more than 5% lower than before |
| Listen-button clicks per album view | the same or higher |
| Clicks on albums mentioned in the notes | 3% or more of note openings |
| Reported mistakes | under 1 per 1,000 note openings; every report answered within a week |
| Audit error rate (2% sample) | under 2 wrong claims per 100 sentences; no wrong hook in the top 500 |
| Coverage | hook on X% of albums per rank band and language, reported, not targeted |
| Test sessions | 4 of 6 people name something they learned that changed how they heard the record |

---

## 8. Phased plan

### Phase 0, experiment (adds files only; no approval needed to merge the report)

Coverage study, 30 sample notes in both formats, ratings, the static prototype, the style guide for hooks and notes. Output: `experiments/album_notes/REPORT.md` and a row in the `CLAUDE.md` index.

### Phase 1, MVP (changes `frontcreck/` and `data-pipeline/`: waits for Samer's approval)

- Year in the header line, every album.
- About block: hook (editorial, checked), "Read more" inline disclosure, collapsed source label.
- Open notes: facts list (Wikidata and MusicBrainz) + Wikipedia lead, cleaned and verbatim, in the best language available, translated where needed + sources footer with licence + "Something off? Let us know."
- Tiers C and D: facts line, empty-state line.
- `#about` deep link and restore; `hidden="until-found"`; hook as meta and `og:` description.
- Strings in `copy.ts`; unit tests for tiering and the style check; end-to-end tests for open, close, focus, deep link, the fold rules, no-WebGL mode; axe checks.
- Data: a pipeline step that writes the notes per album (pinned Wikipedia revisions, sources, tier, checked flag) into a separate notes file, CC BY-SA, merged into page data at build. Not in `albums.json`, which the client loads whole. About 3 to 5 KB more per album page; the album to album budget (under 200 ms) is checked with `npm run perf`.
- About page: one credits sentence and one paragraph on how the notes are made.

### Phase 2

- Editorial sections (Where it comes from, Making it, Listen for, What came after) replace the lead wherever the checks pass.
- Links to catalog albums mentioned in the text.
- "Same people, other records" strip.
- Hook in the Explore map card.

### Phase 3

- Track by track notes.
- Hovering a mentioned album highlights it on the map.
- Tests of: a remembered "keep notes open" preference; a factual "Also produced by" note on rows; a wide-screen (≥ 1600 px) reading layout.

---

## 9. Decisions for Samer

1. The feature name on the page. Proposed: no visible heading in the closed state; "About this album" for screen readers. "Liner notes" was rejected: real liner notes are the artist's or label's own text, and the label would suggest ours are.
2. AI-written text: accept "with AI help" in the collapsed source label (recommended), or only in the open notes' footer?
3. MVP long text: verbatim Wikipedia lead first (recommended), or wait for editorial sections?
4. Analytics: a cookieless event counter, or none?
5. Where "Let us know" goes: a project email address (a GitHub link would show the owner's name).
6. Dashes in quoted text: normalise date ranges ("1995 to 1997") in verbatim excerpts and say "lightly edited" (recommended), or keep Wikipedia's dashes inside quotes.
7. Empty-state line: pick from section 5.4.

---

## 10. Wireframes

Widths are approximate; in 10.1 and 10.2 the source label is shortened to fit the drawing (the real one reads "Summarised from Wikipedia with AI help" and fits the 584 px column). `■` cover, `↗` opens in a new tab, `⧉` copy link, `⌄ ⌃` chevrons.

### 10.1 Desktop, 1440 x 900, closed

```
┌ recmyrecord ─────────────── [ Search albums or artists ] ────────── Map  About ┐
├─ album panel, 648 px ─────────────────────────────┬─ map ──────────────────────┤
│ Visited  In Rainbows › OK Computer             ✕  │ ┌ Similarity ───────────┐  │
│                                                   │ │ Sonic ─●─ Mood        │  │
│ ┌──────────┐  Radiohead · 1997                    │ │ Sound and mood ...    │  │
│ │          │                                      │ └───────────────────────┘  │
│ │  cover   │  OK Computer                         │          ③                 │
│ │  116 px  │                                      │      ①──◉──④               │
│ └──────────┘  [ Open in Spotify ↗ ] [⧉]           │        ②    ⑤              │
│ [melancholic] [anxious] [alienation] [futuristic] │                            │
│ [existential] [atmospheric]                       │                            │
│                                                   │                            │
│ Songs about cars, planes, computers and the       │                            │
│ loneliness between them, made mostly in an old    │                            │
│ manor house near Bath.                            │                            │
│ Read more ⌄    Summarised from Wikipedia, AI help │                            │
│                                                   │                            │
│ Closest albums                                    │                            │
│ ───────────────────────────────────────────────── │                            │
│ 1 ■ No Good for No One Now                     ↗  │                            │
│     Owen · Shares melancholic, lonely             │                            │
│ 2 ■ The Moon & Antarctica                      ↗  │                            │
│ 3 ■ Transcendental Blues                       ↗  │                            │
│ 4 ■ Kid A                                      ↗  │                            │
│ 5 ■ Is This Desire?                            ↗  │                            │
│ Show more                                         │                            │
└───────────────────────────────────────────────────┴────────────────────────────┘
```

### 10.2 Desktop, open (scrolled a little)

```
├─ album panel ─────────────────────────────────────┬─ map (recs still shown) ───┤
│ [existential] [atmospheric]                       │                            │
│                                                   │      ①──◉──④               │
│ Songs about cars, planes, computers and the       │        ②    ⑤              │
│ loneliness between them, made mostly in an old    │                            │
│ manor house near Bath.                            │                            │
│ Read more ⌃    Summarised from Wikipedia, AI help │                            │
│                            Skip to closest albums │                            │
│ RELEASED     16 June 1997                         │                            │
│ RECORDED     1996 to 1997, Canned Applause,       │                            │
│              Didcot and St Catherine's Court,     │                            │
│              near Bath                            │                            │
│ PRODUCED BY  Nigel Godrich and Radiohead          │                            │
│ LABEL        Parlophone, Capitol                  │                            │
│                                                   │                            │
│ WHERE IT COMES FROM                               │                            │
│ After The Bends (link) and a long tour ...        │                            │
│                                                   │                            │
│ MAKING IT                                         │                            │
│ ...                                               │                            │
│                                                   │                            │
│ LISTEN FOR                                        │                            │
│ ▌Airbag                                           │                            │
│ ▌The drums: ...                                   │                            │
│ ▌Exit Music (For a Film)                          │                            │
│ ▌Written for the closing credits of ...           │                            │
│                                                   │                            │
│ WHAT CAME AFTER                                   │                            │
│ ...                                               │                            │
│ ───────────────────────────────────────────────── │                            │
│ Based on the Wikipedia article OK Computer ↗ ...  │                            │
│ CC BY-SA 4.0 ↗. Something off? Let us know.       │                            │
│ Show less ⌃                                       │                            │
│                                                   │                            │
│ Closest albums                                    │                            │
│ ───────────────────────────────────────────────── │                            │
│ 1 ■ No Good for No One Now                     ↗  │                            │
```

### 10.3 Phone, 390 x 844, closed

```
┌ recmyrecord              🔍 ☰ ┐
│ Visited  In Rainbows › OK Co… │
│ ┌───────┐ Radiohead · 1997    │
│ │ cover │ OK                  │
│ │ 92 px │ Computer            │
│ └───────┘                     │
│ [  Open in Spotify ↗  ] [ ⧉ ] │
│ [melancholic] [anxious]       │
│ [alienation] [futuristic]     │
│ [existential] [atmospheric]   │
│                               │
│ Songs about cars, planes,     │
│ computers and the loneliness  │
│ between them, made mostly i…  │  (2 lines, faded end)
│ Read more ⌄       Wikipedia,  │
│                   AI help     │  (one 44 px row; label may wrap)
│ Closest albums                │
│ ───────────────────────────── │
│ 1 ■ No Good for No One Now  ↗ │
│     Owen                      │
│ 2 ■ The Moon & Antarctica  ↗  │
│                    ( Map ▣ )  │  (floating Map button)
└───────────────────────────────┘
```

On a phone the collapsed source label shortens to `Wikipedia, AI help` (the full wording is in the footer).

### 10.4 Phone, open

```
┌───────────────────────────────┐
│ Songs about cars, planes,     │
│ computers and the loneliness  │
│ between them, made mostly in  │
│ an old manor house near Bath. │  (full hook)
│ Read more ⌃       Wikipedia,  │
│                   AI help     │
│ Skip to closest albums        │
│                               │
│ RELEASED                      │
│ 16 June 1997                  │
│ RECORDED                      │
│ 1996 to 1997, Canned          │
│ Applause, Didcot and St       │
│ Catherine's Court, near Bath  │
│ PRODUCED BY                   │
│ Nigel Godrich and Radiohead   │
│                               │
│ WHERE IT COMES FROM           │
│ After The Bends and a long    │
│ tour, ...                     │
│ ...                           │
│ LISTEN FOR                    │
│ ▌Airbag                       │
│ ▌The drums ...                │
│ ...                           │
│ Based on the Wikipedia ...    │
│ Show less ⌃                   │
│                               │
│ Closest albums                │
│                    ( Map ▣ )  │
└───────────────────────────────┘
```

### 10.5 Tier C and D, closed (desktop)

```
│ [medieval] [instrumental] [progressive] [warm]    │
│                                                   │
│ Recife, Brazil · Discos Marcus Pereira            │   tier C: facts line only
│                                                   │
│ Closest albums                                    │

│ [rhythmic] [love]                                 │
│                                                   │
│ Not much has been written about this one yet, so  │   tier D
│ you get to hear it with fresh ears. :)            │
│                                                   │
│ Closest albums                                    │
```

---

## 11. Example copy

Facts I am not sure of are marked [verify]. Every one must be checked against the sources before use; these are drafts of format and voice, not content to ship. No dashes, no hype, no acclaim.

### 11.1 OK Computer, Radiohead (rank 2, tier A, English Wikipedia)

**Header line:** Radiohead · 1997

**Hook (116 characters):**
> Songs about cars, planes, computers and the loneliness between them, made mostly in an old manor house near Bath. [verify "mostly"]

**Collapsed source label:** Summarised from Wikipedia with AI help

**Facts**

| | |
|---|---|
| Released | 16 June 1997 |
| Recorded | 1996 to 1997 [verify; "Lucky" was recorded in 1995], Canned Applause, Didcot and St Catherine's Court, near Bath |
| Produced by | Nigel Godrich and Radiohead |
| Label | Parlophone, Capitol |

**Where it comes from**
> After The Bends and a long tour, Radiohead wanted to stop writing about themselves. Thom Yorke said the new songs were more like snapshots of what he saw around him: traffic, airports, adverts, people being processed [verify wording]. The band had time and a budget, and chose to produce the record themselves with Nigel Godrich, who had engineered parts of The Bends [verify].

**Making it**
> They started in Canned Applause, their rehearsal space in a converted apple shed near Didcot [verify], then moved into St Catherine's Court, an old manor house outside Bath that belonged to the actor Jane Seymour [verify]. They recorded in its rooms rather than in a studio: some vocals were sung in the stone hall for its echo, and Let Down was recorded in the ballroom at three in the morning [verify both].

**Listen for**
> **Airbag.** The drums. Phil Selway's part was recorded, then cut up and rearranged, after the band had been listening to DJ Shadow's Endtroducing..... [verify]
> **Paranoid Android.** Three different songs joined into one, in the spirit of the Beatles' Happiness Is a Warm Gun from The Beatles [White Album] [verify].
> **Fitter Happier.** The voice is a speech program from an Apple Macintosh [verify].
> **Exit Music (For a Film).** Written for the closing credits of Baz Luhrmann's Romeo + Juliet.
> **No Surprises.** The glockenspiel. The band were after the mood of Louis Armstrong's What a Wonderful World [verify].

**What came after**
> The tour that followed left the band worn out; it was filmed for Meeting People Is Easy [verify]. Their next record, Kid A, left most of the guitars behind. Nigel Godrich went on to produce every Radiohead album since, and records for others, including Beck's Sea Change [verify "every"].

(Catalog links: The Bends, Endtroducing....., The Beatles [White Album], Kid A, Sea Change: all five are in the catalog.)

**Footer**
> Based on the Wikipedia article OK Computer (English, version of [date]), with facts from Wikidata and MusicBrainz. Written with AI help and checked by hand. You can reuse this text under CC BY-SA 4.0. Something off? Let us know.

Word count of the body: about 330. Reading time: about the length of Airbag plus Paranoid Android.

### 11.2 Do romance ao galope nordestino, Quinteto Armorial (rank 7,482, 1974; tier A or B, Portuguese sources)

The likely case for the catalog's tail: no English article about the album [verify], a Portuguese article about the group and the movement [verify].

**Header line:** Quinteto Armorial · 1974

**Hook (104 characters):**
> Old ballads and dance tunes of Brazil's northeast, played like chamber music on fiddle, fife and guitars.

**Collapsed source label:** From Portuguese Wikipedia, translated with AI help

**Facts**

| | |
|---|---|
| Released | 1974 |
| From | Recife, Pernambuco, Brazil |
| Label | Discos Marcus Pereira [verify] |
| Players | Antônio José Madureira, viola and direction; Antônio Carlos Nóbrega, rabeca and violin; Egildo Vieira, pífano and flute; Edilson Eulálio, guitar; Fernando Torres Barbosa, marimbau [verify all names and instruments] |

**Where it comes from**
> In 1970 the writer Ariano Suassuna started the Movimento Armorial in Recife [verify year]: an attempt to build a learned Brazilian art out of the popular culture of the northeastern backlands, its chapbook poetry with woodcut covers, its fair musicians and fife bands, and the ballads that came over from Portugal and Spain centuries ago. The quintet was formed to be the movement's music [verify], and this was its first record [verify].

**How it sounds** (merged "Making it" and "Listen for" when the source has little on the recording)
> There are no drums and nothing is amplified. Instruments of the street, the rabeca fiddle and the cane pífano, play with the care of a string quartet, over the ringing ten-string viola [verify]. The melodies move in old modes, which is why the tags above say medieval.
> The title names two ends of the tradition: the romance, a sung ballad that tells a story, and the galope, a fast verse form of the northeast's improvising singers [verify].

**What came after**
> The quintet made several more records through the 1970s [verify]. Antônio Nóbrega went on to a long career on stage as a dancer and musician of northeastern traditions [verify].
> Also from Recife in those years, and in the catalog: Ave Sangria (1974) and Lula Côrtes and Zé Ramalho's Paêbirú (1975), the city's psychedelic answer to the same traditions [verify that the sources support "same traditions"].

**Footer**
> Translated and summarised from the Portuguese Wikipedia article Quinteto Armorial (version of [date]), with facts from Wikidata and MusicBrainz. Written with AI help. It can get small details wrong, and the sources have the whole story. You can reuse this text under CC BY-SA 4.0. Something off? Let us know.

Note the contrast with the recommendations: its closest albums at Balanced are Robbie Basho, Goblin, Carlos Paredes, Almir Sater and Gustavo Santaolalla. None shares its history; the notes must not suggest they do. The Recife albums are offered as history, in the notes, not as matches.

### 11.3 ミスリム Misslim, 荒井由実 (Yumi Arai) (rank 7,829, 1974; tier B, Japanese sources). Hook and facts only

**Header line:** 荒井由実 [Yumi Arai] · 1974

**Hook (118 characters):**
> Her second album: soft piano songs played by the session crew that would shape Japanese city pop, Hosono and Suzuki among them. [verify]

**Collapsed source label:** From Japanese Wikipedia, translated with AI help

**Facts:** Released October 1974 [verify]. Label: Express, Toshiba EMI [verify]. Players: Haruomi Hosono, bass; Shigeru Suzuki, guitar; Tatsuo Hayashi, drums; Masataka Matsutoya, keyboards (as Caramel Mama, soon Tin Pan Alley) [verify]. Backing vocals arranged by Tatsuro Yamashita [verify].

**One line worth having for "Listen for":** やさしさに包まれたなら (Yasashisa ni Tsutsumareta nara) was later used at the end of Hayao Miyazaki's Kiki's Delivery Service [verify].

**Same people, other records (phase 2):** Happy End, 風街ろまん Kazemachi Roman (1971); Hosono, Suzuki and Yamashita, Pacific (1978). Both in the catalog.

### 11.4 Empty album (tier D)

> Not much has been written about this one yet, so you get to hear it with fresh ears.&nbsp;:)

---

## 12. Strings to add to `copy.ts` (draft)

```ts
notes: {
  label: 'About this album',                       // visually hidden h2
  readMore: 'Read more',
  readMoreLabel: (title: string) => `Read more about ${title}`,
  readLess: 'Show less',
  skipToList: 'Skip to closest albums',
  sections: {
    from: 'Where it comes from',
    making: 'Making it',
    sound: 'How it sounds',
    listen: 'Listen for',
    after: 'What came after',
    people: 'Same people, other records',
  },
  facts: { released: 'Released', recorded: 'Recorded', producer: 'Produced by', label: 'Label', from: 'From', players: 'Players' },
  source: {
    wiki: 'From Wikipedia',
    wikiAi: 'Summarised from Wikipedia with AI help',
    wikiLang: (lang: string) => `From ${lang} Wikipedia, translated with AI help`,
    wikiAiShort: 'Wikipedia, AI help',                // phone
  },
  footerChecked: 'Written with AI help and checked by hand.',
  footerUnchecked: 'Written with AI help. It can get small details wrong, and the sources have the whole story.',
  licence: 'You can reuse this text under CC BY-SA 4.0.',
  report: 'Something off? Let us know.',
  empty: 'Not much has been written about this one yet, so you get to hear it with fresh ears. :)',
},
```
