# Copy in the Trifid prototype

Every string a visitor can see or hear. Anything marked new or changed is placeholder and needs approval before it ships. Strings live in `src/copy.js` (`RMR.TEXT` for new ones, `RMR.COPY` for the app's); a few static ones are also in `index.html`.

Rules followed: no owner name, catalogue size only as "4,000+" (not used here), never a number of recommendations, mood words are "handpicked" (not used here), no em or en dashes, no emoji. Per-region album counts are not shown.

## New or changed

| String | Where it appears | Status | Source |
|---|---|---|---|
| Rose where the music is fierce, gold where it is warm, teal where it is quiet, blue where it is dark, violet where it is urban. | Second line of the hint, bottom left of the map. Each colour word is a button in its hue | New | `regions/colour.json` caption, as in the mockup |
| {Rose, Gold, Teal, Blue, Violet}: show only where the music is {fierce, warm, quiet, dark, urban} | Accessible name of each colour word (a toggle button; the name starts with the visible word) | New | Prototype |
| {N}% of albums here are tagged {word}, against {M}% across the map. | Under a hovered region name; region card; screen-reader label of a region | New | Mockup (`mockups/src/build.py`) |
| Concert recordings: much more crowd and room sound than the rest of the map. | Evidence for a region named from liveness | New | Mockup |
| Much quieter than the rest of the map. | Evidence for a region named from low loudness | New | Mockup |
| Named from the sound: much {higher, lower} {feature} than the rest of the map. | Evidence for regions named from any other audio feature (automated Sonic regions) | New | Prototype; the feature name is the raw data word (for example "danceability") |
| Place names change with this setting. | Similarity card, a small line under the note, on all three stops (the notes themselves are the app's) | New | Phase 3 review |
| Every star is an album. Albums close together sound or feel alike. | First line of the hint on the map (replaces the app's hint here) | Changed | Phase 3 review |
| Every star is an album. Albums close together sound or feel alike. Select one to start from it. | The same line beside an album | Changed | Phase 3 review |
| Rose, Gold, Teal, Blue, Violet with fierce, warm, quiet, dark, urban; "Mixed" | Family tag: region card ("GOLD · WARM"), end of the hover evidence line, search rows, Regions menu, Home b. Followed by the region's plain words with no word shown twice ("Gold · warm · rhythmic", not "Gold · warm · warm · rhythmic") | New; changed in phase 4 (no repeats) | Phase 3 review |
| Regions | Button under the similarity card that opens the list of regions | New | Phase 3 review |
| Show more / Show fewer | Region card: expands the list of the region's albums (the app's strings, new place) | New use | App |
| Copy link to this region | Screen-reader label of the copy button on the region card | New | Prototype |
| That region is not on the map at this setting. | Toast when a link names a region that does not exist | New | Prototype |
| Hide map names (L) | Prototype drawer; the `L` key does the same | New | Prototype |
| Brighter stars are albums higher on the chart. | About, "Reading the map". The owner must approve this claim | New | Phase 3 review |
| In {Region name} | Album panel under the artist; Explore card. Set in small capitals | New | `UX.md` section 6 |
| Between {Region} and {Region} | Same places, for albums in no region | New | `UX.md` section 6 |
| Best known here | Region card, above six covers | New | `UX.md` section 6 |
| Next to | Region card, before neighbouring region names | New | `UX.md` section 6 |
| Region: {name} | Screen-reader label of the region card | New | Prototype |
| Regions of the map | Screen-reader label of the region list in the map | New | Prototype |
| Go to {Region name} | Screen-reader label of an edge pointer (it shows an arrow and the name) | New | Prototype |
| You are in {Region name}. Open the region. | Screen-reader label of the chip at the top of the map (it shows the name) | New | Prototype |
| Regions | Search list group heading | New | `UX.md` section 6 |
| Albums | Screen-reader name of the album group in the search list | New | Prototype |
| Type to see matching albums and regions. Up and down arrows move, Enter chooses. | Screen-reader hint of the search field | Changed (app: "Type to see matching albums. ...") | Prototype |
| Matching regions and albums | Screen-reader label of the search list | Changed (app: "Matching albums") | Prototype |
| Or start from a place on the map | Home: label above the region links (both variants) | New | Prototype |
| Reading the map | About: heading of the added section | New | `UX.md` section 9 |
| Region names come from the handpicked mood words and the sound of the albums there. Select a name to see why it is there. | About, "Reading the map" (after the colour sentence) | New | Prototype |
| The names change with the similarity setting, because each setting arranges the albums differently. | About, "Reading the map" | New | Prototype |
| Danceable, Instrumental, Live, Quiet, Acoustic, Energetic, Spoken | Label (in capitals) of a region named from an audio trait that has no approved place name. From the table `audioWords` in `src/copy.js` | New | Prototype; needs approval |
| Open | Phone name plate: the button that opens the album a first tap landed on | New (phase 4) | Phone review |
| Close | Phone name plate and Colours sheet: screen-reader label of the close button (the app's card string, new place) | New use (phase 4) | App |
| Colours | Phone map: the chip that opens the Colours sheet, and the sheet's screen-reader label | New (phase 4) | `UX.md` section 9 |
| where the music is fierce; where it is warm; where it is quiet; where it is dark; where it is urban | Phone Colours sheet: the meaning beside each colour name (the colour sentence, split into five rows). Above them the sheet repeats "Every star is an album. Albums close together sound or feel alike." | New use (phase 4) | The colour sentence |
| Show more / Show fewer | Phone sheets: screen-reader label of the grabber that switches between the peek and the full height (the app's strings, new place) | New use (phase 4) | App |
| {N} albums, {N} regions (singular: 1 album, 1 region) | Search: announced politely to screen readers when results change. Replaces "Matching albums listed" and "No albums found"; no match announces the app's "No album matches ..." sentence | Changed (phase 4) | Accessibility review |
| Albums in view | Screen-reader label of the list of the twelve albums nearest the centre of the map | New (phase 4) | Accessibility review |
| Map | Screen-reader label of the map canvas | Changed (app: "Map of albums. Drag or use arrow keys to pan, plus and minus to zoom.") | Accessibility review |
| Drag or use arrow keys to pan, plus and minus to zoom. Comma and full stop step through the albums nearest the centre, Enter selects one. | Screen-reader description of the map canvas | Changed (the app's sentence plus one) | Accessibility review |
| An album’s closest albums sit nearby on the map, but not always right beside it. | Album panel, one quiet line under "Closest albums" (the app's About sentence, new place) | New use (phase 4) | First-visit review |
| {Region name} · Map · recmyrecord | Page title when a region card is open | Changed (phase 4) | Accessibility review |
| danceable, live, quiet (and the rest of the `audioWords` table, lower case) | Plain words: a raw feature phrase from the data ("high danceability") is shown as its plain word | Changed (phase 4) | First-visit review |

## From the data (not written here)

| String | Where it appears | Source |
|---|---|---|
| Region place names, for example "Playful Way", "The Live Belt" | Map labels, pointers, chip, cards, search, panel line | `regions/regions.json` (`name_space`) and `scaling/name_table.json` through `regions_all.json`. All placeholder until approved |
| Region data word in capitals, for example "LONGING", "QUIRKY" | Label of a region with no approved place name | `word` in the region data |
| "high danceability", "low loudness" and the like | Only when the trait is missing from the `audioWords` table (otherwise the plain word is shown) | `plain` in the region data |
| Plain words, for example "raw · angry" | Under a strong region's name at Overview; region card; search rows; Home. A word already shown beside them (the family word, or the label itself for a region with no place name) is left out | `label_plain` / `plain` in the region data |

## Prototype only (not part of the design)

| String | Where it appears |
|---|---|
| Synthetic 10,000-point stress test | Banner when `data=10k` is on |
| No synthetic data file yet (data/synth10k.js). | Banner and drawer when the file is missing |
| The stress data has one layout. | Similarity card note in the stress test (the slider is locked) |
| Prototype; Chrome: Trifid, Site; Gas: Baked, Live; Data: Real, Synthetic 10,000; 10k regions: Fine, Default; Home: A shelf, B regions; Show region hulls; Frame time; Prototype controls | The drawer on the right edge |
| Captions and headings in `screens.html` and `phone.html` | The two review pages (not part of the product) |
| frame {n} ms, worst {n} ms, frames {n}, gas {mode} | Frame-time readout |

## Reused from the app unchanged (`frontcreck/src/lib/copy.ts`)

recmyrecord; Skip to content; Main; Map; About; Search albums or artists; No album matches {q}. Try the artist’s name, or fewer words.; {title} by {artist}; Visited; Albums visited; Open in Spotify; (opens in a new tab); Copy link to this page; Link copied; Could not copy. The link is {url}; Closest albums; Shares {words}; Show more; Show fewer; Close and return to the map; Mood descriptors; Open {title} in Spotify (opens in a new tab); {title} and the closest albums; Similarity; Sonic; Balanced; Mood; Sound and mood together.; Map of albums; Albums that sit close together sound or feel alike.; Albums that sit close together sound or feel alike. Select one to start from it.; Map of albums. Drag or use arrow keys to pan, plus and minus to zoom.; Zoom in; Zoom out; Reset view; See closest albums; Spotify; Close; The map needs WebGL, which this browser has turned off. Search and lists still work.; Explore this area; Matching albums listed; No albums found; Closest in sound.; Closest in mood.; Start with an album you like.; Get the most similar albums, by sound and by mood.; Explore the map; Surprise me; Or start from one of these; Albums to start from; Search albums; Close search; Map; List; Open the map; Back to the list; Map preview of the album and its closest albums; Open map; That page isn’t here.; Search for an album, or explore the map. Experimental exploration!; How it works and the whole About text, sign-off and credits; page titles "recmyrecord", "About · recmyrecord", "Not found · recmyrecord", "Map · recmyrecord" and "{title} by {artist} · recmyrecord".
