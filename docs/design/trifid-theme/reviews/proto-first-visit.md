# Trifid prototype: first-visit review

Lens: someone who has never seen the site, lands on Home from a link, knows nothing about the colours, stars or names, and leaves in 30 seconds if confused.

Method: read `prototype/UX.md`, `HANDOFF.md`, `COPY.md`, `README.md`; viewed 22 of the 34 stills in `prototype/shots/` (not the stress, gas, chrome-site, notfound or album-gold-covers ones); read `src/copy.js`, `pages.js`, `panel.js`, `labels.js`, `search.js`, `regions.js`, parts of `app.js` and the three CSS files; listed the region data per stop from `data/data.js`. No extra screenshots were taken. Contrast was judged by eye from the stills, not measured. Paths below are relative to `prototype/`.

Short answer: the map is striking and the album path works once you are on it. But the newcomer is never told that a star is an album, the one sentence that explains the map is small, low and absent on phone, search is partly hijacked by regions, and region names arrive as a second unexplained vocabulary on top of the colours.

## Findings, ranked

### 1. Regions outrank albums in search, and Enter goes to a region (blocker)

Evidence: `src/search.js:88-98`. For any query, up to two regions are listed above albums and `setActive(0)` selects the first row. `Search.regions` (`search.js:56-64`) matches by prefix against the name, the plain words and every `top_words` entry. So one or two letters almost always match a region. `shots/search-regions.jpg`: typing "play" highlights PLAYFUL WAY, above "Playing the Fool". From the data: "dark" matches three Balanced regions through their top words, with 43 albums and artists starting with "dark"; "live" has 145 album matches and The Live Belt on top; "raw" puts Raw Flare above Raw Power; "urban", "heavy", "epic", "cold", "summer" behave the same.

Why it matters: the hero says "Start with an album you like" and the placeholder says "Search albums or artists". The visitor types "dark", presses Enter, and lands on a map region called Aggressive Rift. That is the main path failing at step one. The region rows also appear and vanish as letters are typed ("r", "ra", "rad"), so album rows jump under the cursor.

Fix: albums first, always. Put the Regions group below albums, never pre-select a region row, and match regions only on a whole word of the name or plain words (not prefixes, not `top_words`), from 3 characters up. Or keep regions out of typed results entirely and leave them to the browse list.

### 2. Focusing the empty search shows a wall of region names (major)

Evidence: `src/search.js:84-86` and `:112` (render on focus). `shots/search-browse.jpg`, `shots/phone-search-sheet.jpg`: 16 or 17 rows of IMPROV ARM, THE QUIET DEEP, URBAN CLUSTER and so on, under a field that says "Search albums or artists". The same code runs for the Home hero search (`pages.js:29`), so the first click on Home does this too. On phone the list fills the whole screen.

Why it matters: the visitor clicked to type an album. Before a single letter they get a full screen of invented place names they have not been introduced to. It reads as "this search is for something else". Two names are also truncated ("PROGRESSIVE SPIR…", "THE BITTERSWEET…").

Fix: on empty focus show nothing, or a short "Try" list of four or five well known albums. If regions stay, cap at five, lead with the plain words ("playful, energetic") and put the place name second, under a heading that says what they are ("Places on the map").

### 3. Nothing says a star is an album, and Home never says there is a map of 4,000+ albums (major)

Evidence: `shots/home-a.jpg`, `shots/home-b.jpg`: the backdrop is a dimmed coloured cloud with dots; the copy talks only about "an album you like". `shots/map-overview.jpg`: the only explanation is "Albums that sit close together sound or feel alike." at 13.5 px in the bottom left corner (`trifid.css:82`). It does not say the dots are the albums. "4,000+" appears only in About (`copy.js` aboutSections).

Why it matters: a nebula photo with white dots reads as decoration. The newcomer has to hover a dot and wait for the tip to discover that it is a record. Many will not hover; they will look at the big lettering instead.

Fix: say it once, where the eye starts. On the map: "Every star is an album. Close together means they sound or feel alike." placed near the top (for example as the first line of the similarity card slot or centred under the header on first visit), not the bottom corner. On Home, change the link to "Explore the map of 4,000+ albums". All of this is new copy and needs approval.

### 4. On phone the explanation is cut and then removed for good (major)

Evidence: `pages.css:184` hides `#hint-line` under 900 px, so the "close together" sentence never shows on a phone. `pages.css:185` plus `app.js:153` and `:274`: the colour sentence is removed on the first pointer move while a finger is down and stored in `localStorage`, so it never returns. `markPanned` fires on any move, before the 4 px drag threshold, so a slightly shaky tap is enough. `shots/phone-map-mode.jpg` shows the sentence covering three lines over the map; it is gone a moment later.

Why it matters: a phone visitor gets the colour key for one or two seconds, once, ever, and never gets the nearness rule. After that the map has no key at all.

Fix: keep one short line on phone until the visitor opens an album or closes it with a visible control; mark panned only past the drag threshold; give the map a small "What am I looking at?" control that brings the two lines back. Do not store "seen" forever.

### 5. Colours and region names are two unlinked systems (major)

Evidence: `shots/map-overview.jpg`. The sentence gives five colours with five words (fierce, warm, quiet, dark, urban). The map shows 12 or more names with other words (playful, progressive, sombre, ethereal, bittersweet). None of the five colour words appears in a name except "warm" and "urban". Sombre Void sits on blue ("dark") but is described as "sombre · cold"; Aggressive Rift, whose top words include "dark", sits on rose and violet. In `shots/search-browse.jpg` and `shots/home-b.jpg` the region dots come in about nine tints, including grey for Progressive Spiral and Ethereal Veil (`regions.js:38` uses the blended region colour). Nine dot colours next to a five colour sentence looks like a second legend that disagrees with the first.

Why it matters: the visitor cannot tell whether colour explains the names or the names explain the colour. Grey dots read as "no data".

Fix: pick one primary key. Simplest: region dots use only the five family hues (the leading family), and a region with no leading family gets no dot. In the hover line and card, tie the two together: "Mostly warm (gold)". Consider dropping the family dot from search rows altogether.

### 6. Region names are jargon to a newcomer and Home leads with the most obscure ones (major)

Evidence: `shots/home-a.jpg`: "OR START FROM A PLACE ON THE MAP: IMPROV ARM, THE QUIET DEEP, URBAN CLUSTER, PLAYFUL WAY, AGGRESSIVE RIFT", with no plain words (`pages.js:11`, `:24`). Order is by priority (`pages.js:10`), so Improv Arm is first. `shots/home-b.jpg` replaces the cover shelf with eight such names.

Why it matters: "Improv Arm" means nothing before you have seen the map. Home A now has six ways to start (search, Explore, Surprise me, five regions, 24 covers). Home B removes the covers, which are the one thing a newcomer recognises at a glance.

Fix: keep Home A, not B. Replace the place names on Home with the plain words as the link text ("playful", "aggressive", "quiet", "warm") or drop the row. If it stays, order by familiarity, not priority, and cut to four.

### 7. Home backdrop shows broken looking ghost lettering behind the headline (major)

Evidence: `shots/home-a.jpg`: "THE LIVE BELT" sits half behind "Start with an album"; "AGGRESSIVE RIFT" and "URBAN CLUSTER" are cut by the headline; "ETHEREAL VEIL" runs under "OR START FROM A PLACE"; "THE QUIET DEEP" runs into "OR START FROM ONE OF THESE". `shots/phone-home.jpg`: "RAW FLARE raw · angry" behind the sub line, "…LUSTER" beside the search field. `shots/about.jpg`: "AGGRE" and "T" peek out beside the About sheet. Cause: `app.js:214` empties the blocker list on pages, and `pages.css:5` only lowers label opacity to .32.

Why it matters: it looks like a rendering bug in the first second. The ghost names are also inert, so they look like data and labels but do nothing.

Fix: hide labels on Home, About and 404 (the UX spec allowed "or not at all"), or keep at most four that are placed with the hero, links and shelf as blockers.

### 8. The "close together" promise breaks on the first album opened (major)

Evidence: `shots/album-5.jpg`: closest albums 2, 3 and 5 sit far up the map, across a region label, while hundreds of stars are nearer to the seed. The hint is hidden in this view (`panel.js:95`, covers are showing). The explanation exists only in About ("not always right beside it").

Why it matters: the visitor was just told near means alike. The first thing the album view shows is five long lines to far away covers. It looks wrong, or it makes the map look meaningless.

Fix: one quiet line under "Closest albums", for example "Matched on more than the map can show, so some sit further away." New copy, needs approval. Keep it visible in album view.

### 9. The similarity slider reads as a filter, then rearranges the whole world (major)

Evidence: `shots/map-overview.jpg`: a card titled SIMILARITY with Sonic, Balanced, Mood sits top left on the bare map with no album chosen. Similar to what? `shots/slider-sonic.jpg`, `shots/slider-mood.jpg`: every star moves, colours shift, and names change style: place names (URBAN CLUSTER, PLAYFUL WAY) mixed with bare words (HEAVY, DANCEABLE, LUSH, QUIRKY, LONGING). Sub lines repeat the name ("HEAVY / heavy · aggressive", "QUIRKY / quirky · playful") or use raw feature names ("high danceability · rhythmic"; in the data also "high liveness", "low loudness"). The notes over-claim: "Regions are named by sound" while Sonic shows Playful Way, Lush and The Bittersweet Reach; "Regions are named by mood" while Mood shows Urban Cluster "urban · sampling", Progressive Spiral and Acoustic. A region can also keep its name and move (Playful Way), or keep its place and change name (Warm Halo becomes DANCEABLE).

Why it matters: a newcomer who has just started to read the map as a place sees the place dissolve. Two naming styles look unfinished. The reason for the change is in a 13 px note and in About.

Fix: on the bare map, retitle the card to say what it does ("Arrange the map by: Sound / Both / Mood") and change the notes to describe the rearrangement, without claiming how regions are named. Drop the sub line when it repeats the name. Never show a raw feature name. Until Sonic and Mood have full sets of approved names, show bare plain words on those stops for every region, so the style is at least consistent. Consider collapsing the card to one line until an album is open.

### 10. A region has no visible extent, so "albums here" has no referent (major)

Evidence: `shots/map-region-card.jpg`: card says "61% of albums here are tagged playful". On the map nothing shows where "here" starts or ends. The 25% dim of outside stars (`app.js:144-148`) is not visible in the still. No hull is drawn by design (UX.md section 5).

Why it matters: the visitor cannot tell which stars belong to Playful Way, so cannot use the region to find playful records.

Fix: with the card open or a label hovered, dim outside stars and gas much more (50 to 60%), or brighten the member stars. Still no outline.

### 11. Evidence sentences are weak or over-stated for a place name (minor)

Evidence: `regions.js:12-18`, `copy.js` evidence strings, region data. Eclectic Cloud is named on 38% coverage, Pastoral Nebula on 39%, Hypnotic Orbit on 39%; on Sonic, Playful Way is 39% against 21%. "Tagged" does not say by whom. "Far more crowd and room sound than anywhere else on the map" and "The quietest corner of the map" are absolutes drawn from a mean. "against 21% across the map" is stiff.

Why it matters: a name is a claim. "38% of albums here are eclectic" tells the reader most are not.

Fix: require a majority for a place name, or phrase by ratio ("about three times as common here as elsewhere"). Say "listeners tag". Soften absolutes: "much more crowd and room sound than most of the map".

### 12. "Urban" as a colour meaning is unclear and dated (minor)

Evidence: colour sentence, "violet where it is urban" (`copy.js` legend); Urban Cluster "urban · sampling".

Why it matters: the other four are moods. "Urban" is not a mood and reads as a genre euphemism. A newcomer will not know what kind of music it means.

Fix: owner's call. Options: "streetwise", "city", or name what the data shows ("sample based"). The same word then needs to change in the region name.

### 13. Edge pointers look like more labels and collide with the colour sentence (minor)

Evidence: `shots/map-overview.jpg`: "← AGGRESSIVE RIFT", "RAW FLARE", "↑ THE LIVE BELT" in a row directly under the header, in the same lettering as labels (`trifid.css:30`), with a 12 px arrow. They read as a sub menu or as regions that sit at the top. At the bottom, "↓ LONELY DRIFT" sits on the same baseline right after "…violet where it is urban." and reads as the end of the sentence. `shots/zoom-b.jpg`: "↓ THE QUIET DEEP" sits just above the hint and "↓ LONELY DRIFT", "↓ IMPROV ARM" continue the legend line.

Fix: give pointers a different treatment from labels (small plate, sans, larger arrow first) and extend the hint blocker (`app.js:216`) to the full bottom row, or keep pointers off the bottom edge while the hint is shown.

### 14. From a region to recommendations takes three clicks and blind covers (minor)

Evidence: `regions.js:66`, `panel.js:135`: a "Best known here" cover picks the album on the map (Explore card), then "See closest albums" opens it. Covers are 52 px with no visible title (title attribute only; nothing on touch).

Fix: show the title on hover or focus in the card, as the Home shelf does, and open the album directly from the card.

### 15. First click on a star gives a small, far away response (minor)

Evidence: `shots/map-explore-pick.jpg`: the picked star gets a ring of about 26 px mid map; the card appears bottom left, some 800 px away. Stars are 1.1 to 2.6 px radius (`UX.md` section 4), which looks unclickable even though the hit radius is 14 px.

Fix: anchor the card near the picked star, or draw a hairline from star to card. Show the pointer cursor and the tip sooner so stars feel clickable.

### 16. Star brightness is data nobody is told about (minor)

Evidence: `UX.md` section 4: four magnitude classes by chart position. Not mentioned on the map or in About.

Why it matters: brighter looks like "more similar" or "more important". It is data that reads as ornament, or as the wrong data.

Fix: one clause in About ("brighter stars are better known albums"), or use one size until the pipeline has a real rank field.

### 17. Faded labels and fair labels look below 4.5:1 while still clickable (minor, verify)

Evidence: `shots/zoom-c.jpg`: ECLECTIC CLOUD, EPIC EXPANSE, SOMBRE VOID at about 35% (`labels.js:65`), and the scrim fades with them (`labels.js:111`). `shots/map-overview.jpg`: ECLECTIC CLOUD and THE BITTERSWEET REACH at 75%. Judged by eye; measure before acting.

Fix: fade labels out completely over a shorter range and hand over to the chip, so no half visible buttons remain.

### 18. Smaller items (minor)

- Colour words are buttons that only react to hover and focus, with `cursor: default` and no click action (`trifid.css:87`, `panel.js:103-106`). On touch a tap isolates a family and it stays until focus moves. Tap height is about 20 px, under the 44 px rule. Add click to toggle, a pointer cursor, and padding on phone.
- The Home veil is one full screen link to the map (`index.html:38`, `pages.css:7`). Any stray click on the backdrop leaves Home. Limit it or drop it.
- The region line sits between artist and title in the album panel (`panel.js:35-37`, `shots/album-5.jpg`). "Between Eclectic Cloud and The Bittersweet Reach" is the second thing read on a newcomer's first album, before the title. Move it under the tags.
- About says "Hover a name to see why it is there" (`copy.js` aboutReading). There is no hover on phone. Say "Select a name".
- Dust lanes show as dark squiggles (`shots/map-region-card.jpg` around x 450 y 290 and x 700 y 320; `shots/slider-mood.jpg` around x 700 y 300). To a newcomer they look like marks with meaning. Lower their contrast at Overview.
- A tiny lone cluster at the right of the whole map (`shots/map-whole.jpg`, x 1190 y 640) looks like a stray artefact on Home.

## What works

- The headline and search on Home state the task in one line, and the cover shelf gives a recognisable way in.
- Album view: white cased lines, numbered badges and the matching numbered list read at once (`shots/album-5.jpg`, `shots/album-10-hot.jpg`). "Shares melodic, uplifting" explains each match in plain words.
- Plain words under strong names ("playful · energetic") do more for a newcomer than the place names themselves.
- Hovering a colour word and seeing only that family (`shots/map-legend-quiet.jpg`) is the clearest teaching moment in the prototype, once found.
- The "you are here" chip at cover zoom (`shots/zoom-d.jpg`) keeps a sense of place without clutter.

## Do regions help a newcomer?

At Overview, as plain words, yes: they turn a coloured cloud into "playful over here, sombre over there". As navigation on Home and in search they distract: they add a made up vocabulary before the visitor has done the one thing asked, which is to pick an album. Keep regions on the map and in the album panel; take them out of the first 30 seconds.

## Scores

| | Score |
|---|---|
| Clarity on first visit | 5 / 10 |
| Learnability of colours | 5 / 10 |
| Learnability of names | 4 / 10 |
| Overall | 5 / 10 |
