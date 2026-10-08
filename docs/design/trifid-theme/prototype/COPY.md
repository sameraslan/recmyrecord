# Copy in the Trifid prototype

Every string a visitor can see or hear. Anything marked new or changed is placeholder and needs approval before it ships. Strings live in `src/copy.js` (`RMR.TEXT` for new ones, `RMR.COPY` for the app's); a few static ones are also in `index.html`.

Rules followed: no owner name, catalogue size only as "4,000+", never a number of recommendations, mood words are "handpicked", no em or en dashes, no emoji.

## New or changed

| String | Where it appears | Status | Source |
|---|---|---|---|
| Open | Phone name plate: the button that opens the album a first tap landed on | New | Phone review |
| Close | Phone name plate: screen-reader label of the close button (the app's card string, new place) | New use | App |
| Show more / Show fewer | Phone Explore sheet: screen-reader label of the grabber that switches between the peek and the full height (the app's strings, new place) | New use | App |
| {N} albums (singular: 1 album) | Search: announced politely to screen readers when results change. Replaces "Matching albums listed" and "No albums found"; no match announces the app's "No album matches ..." sentence | Changed | Accessibility review |
| Albums in view | Screen-reader label of the list of the twelve albums nearest the centre of the map | New | Accessibility review |
| Map | Screen-reader label of the map canvas | Changed (app: "Map of albums. Drag or use arrow keys to pan, plus and minus to zoom.") | Accessibility review |
| Drag or use arrow keys to pan, plus and minus to zoom. Comma and full stop step through the albums nearest the centre, Enter selects one. | Screen-reader description of the map canvas | Changed (the app's sentence plus one) | Accessibility review |

Nothing on the page mentions colours, explains a region, or links to one. The hint line, the search hint and the search list label are the app's own again.

## From the data (not written here)

| String | Where it appears | Source |
|---|---|---|
| Region place names, for example "Playful Way", "The Live Belt" | Lettering on the map at Whole map and Overview, nowhere else. Hidden from screen readers | `regions/regions.json` (`name_space`) and `scaling/name_table.json` through `regions_all.json`. All placeholder until approved |
| Region data word in capitals, for example "LONGING", "QUIRKY"; or Danceable, Instrumental, Live, Quiet, Acoustic, Energetic, Spoken (table `audioWords` in `src/copy.js`) | Label of a region with no approved place name. Not shown by default on the real data; only with `names=all`, and in the 10k stress test | `word` in the region data |

## Prototype only (not part of the design)

| String | Where it appears |
|---|---|
| Synthetic 10,000-point stress test | Banner when `data=10k` is on |
| No synthetic data file yet (data/synth10k.js). | Banner and drawer when the file is missing |
| The stress data has one layout. | Similarity card note in the stress test (the slider is locked) |
| Prototype; Chrome: Trifid, Site; Gas: Baked, Live; Data: Real, Synthetic 10,000; 10k regions: Fine, Default; Show region hulls; Frame time; Prototype controls | The drawer on the right edge |
| Captions and headings in `screens.html` and `phone.html` | The two review pages (not part of the product) |
| frame {n} ms, worst {n} ms, frames {n}, gas {mode} | Frame-time readout |

## Reused from the app unchanged (`frontcreck/src/lib/copy.ts`)

recmyrecord; Skip to content; Main; Map; About; Search albums or artists; No album matches {q}. Try the artist’s name, or fewer words.; {title} by {artist}; Visited; Albums visited; Open in Spotify; (opens in a new tab); Copy link to this page; Link copied; Could not copy. The link is {url}; Closest albums; Shares {words}; Show more; Show fewer; Close and return to the map; Mood descriptors; Open {title} in Spotify (opens in a new tab); {title} and the closest albums; Similarity; Sonic; Balanced; Mood; Sound and mood together.; Map of albums; Albums that sit close together sound or feel alike.; Albums that sit close together sound or feel alike. Select one to start from it.; Map of albums. Drag or use arrow keys to pan, plus and minus to zoom.; Zoom in; Zoom out; Reset view; See closest albums; Spotify; Close; The map needs WebGL, which this browser has turned off. Search and lists still work.; Explore this area; Type to see matching albums. Up and down arrows move, Enter chooses.; Matching albums; Closest in sound.; Closest in mood.; Start with an album you like.; Get the most similar albums, by sound and by mood.; Explore the map; Surprise me; Or start from one of these; Albums to start from; Search albums; Close search; Map; List; Open the map; Back to the list; Map preview of the album and its closest albums; Open map; That page isn’t here.; Search for an album, or explore the map. Experimental exploration!; How it works and the whole About text, sign-off and credits; page titles "recmyrecord", "About · recmyrecord", "Not found · recmyrecord", "Map · recmyrecord" and "{title} by {artist} · recmyrecord".
