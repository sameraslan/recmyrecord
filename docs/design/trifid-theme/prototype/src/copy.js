/* Strings. RMR.COPY repeats the app's lib/copy.ts verbatim; RMR.TEXT is everything new or changed for this
 * theme: placeholder wording until the owner approves it (the full list is in ../COPY.md).
 * Rules: no em or en dashes, no emoji, no owner name, "4,000+" only, never a count of recommendations. */
(function () {
  'use strict';
  const RMR = window.RMR;
  RMR.COPY = {
    wordmark: 'recmyrecord', skip: 'Skip to content', navLabel: 'Main', navMap: 'Map', navAbout: 'About',
    searchPlaceholder: 'Search albums or artists', searchLabel: 'Search albums or artists',
    searchNoMatches: (q) => `No album matches ${q}. Try the artist’s name, or fewer words.`,
    albumLabel: (title, artist) => `${title} by ${artist}`,
    trailLabel: 'Visited', trailNav: 'Albums visited', trailMore: '…',
    openInSpotify: 'Open in Spotify', newTab: '(opens in a new tab)', copyLinkLabel: 'Copy link to this page', linkCopied: 'Link copied',
    copyFailed: (url) => `Could not copy. The link is ${url}`,
    listHeading: 'Closest albums', shares: 'Shares', showMore: 'Show more', showFewer: 'Show fewer',
    close: 'Close and return to the map', tagsLabel: 'Mood descriptors',
    rowLabel: (title, artist, shared) => `${title} by ${artist}${shared.length ? `. Shares ${shared.join(', ')}` : ''}`,
    rowSpotify: (title) => `Open ${title} in Spotify (opens in a new tab)`,
    panelLabel: (title) => `${title} and the closest albums`,
    sliderLabel: 'Similarity', stops: { sonic: 'Sonic', balanced: 'Balanced', mood: 'Mood' },
    mapHeading: 'Map of albums', hint: 'Albums that sit close together sound or feel alike.',
    hintAlbum: 'Albums that sit close together sound or feel alike. Select one to start from it.',
    canvasLabel: 'Map of albums. Drag or use arrow keys to pan, plus and minus to zoom.',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', reset: 'Reset view',
    cardPrimary: 'See closest albums', cardSpotify: 'Spotify', cardClose: 'Close',
    noWebgl: 'The map needs WebGL, which this browser has turned off. Search and lists still work.',
    exploreHere: 'Explore this area',
    hero: 'Start with an album you like.', heroSub: 'Get the most similar albums, by sound and by mood.',
    homeExplore: 'Explore the map', surprise: 'Surprise me', shelfLabel: 'Or start from one of these', shelfListLabel: 'Albums to start from',
    searchOpen: 'Search albums', searchClose: 'Close search', sheetLabel: 'Search albums',
    phoneMap: 'Map', phoneList: 'List', phoneMapLabel: 'Open the map', phoneListLabel: 'Back to the list',
    preview: 'Map preview of the album and its closest albums', openMap: 'Open map',
    nfTitle: 'Not found', nfHeading: 'That page isn’t here.', nfSub: 'Search for an album, or explore the map. Experimental exploration!', nfMapLink: 'Explore the map',
    aboutNav: 'About', aboutTitle: 'How it works', aboutClose: 'Close',
    aboutIntro: 'recmyrecord helps you find new music you may like, or step out of your comfort zone into music far outside your usual territory. Pick an album you love to get ones similar to it, and use the map to wander as far from it as you want.',
    aboutSections: [
      { heading: 'Sound and mood', body: [
        'Every album here has two core properties that make it what it is: sound and mood. Sound (sonic values) comes from the audio itself: measurements such as energy, tempo, danceability and acousticness, taken from the recording. Mood descriptors are words listeners use for the feelings or atmosphere an album evokes, such as melancholic or warm.',
        'Pick an album and you get the ones most similar to it. By default that means similar in both sound and mood; use the slider to match on sound only or mood only.',
        'Listening history plays no part in finding similar albums. Most streaming services base their recommendations on songs the same listeners play together, which reflects listening habits more than the music itself.',
        'Neither do genres or genre tags; it all comes from the sound and the mood each album evokes. Albums from the same genre often cluster together anyway, but the albums around a given one are not always from its genre. That can help you get into a new genre, since you start from something that sounds and feels a lot like music you already like.',
      ] },
      { heading: 'The map', body: [
        'The map places 4,000+ albums so that similar ones sit near one another and different ones sit further apart.',
        'An album’s closest albums sit nearby on the map, but not always right beside it. Recommendations use more features than a two-dimensional map can show, so placing albums on it means giving up some accuracy.',
      ] },
    ],
    aboutSignoff: 'Time for exploration! Enjoy!',
    aboutCredits: 'Mood descriptors handpicked from RateYourMusic. Sound values from Spotify. Cover art from Spotify.',
  };

  RMR.TEXT = {
    // slider notes: the app's notes with what the regions mean at each stop (UX.md section 8)
    sliderNotes: { sonic: 'Closest in sound.', balanced: 'Sound and mood together.', mood: 'Closest in mood.' },   // the app's notes
    sliderNames: 'Place names change with this setting.',
    hint: 'Every star is an album. Albums close together sound or feel alike.',
    hintAlbum: 'Every star is an album. Albums close together sound or feel alike. Select one to start from it.',
    famNames: ['Rose', 'Gold', 'Teal', 'Blue', 'Violet'], famWords: ['fierce', 'warm', 'quiet', 'dark', 'urban'], mixed: 'Mixed',
    regionsButton: 'Regions', regionsMenu: 'Regions at this setting', showAlbums: 'Show more', hideAlbums: 'Show fewer', regionCopy: 'Copy link to this region',
    regionGone: 'That region is not on the map at this setting.', labelsToggle: 'Hide map names (L)',
    aboutStars: 'Brighter stars are albums higher on the chart.',
    sliderLocked: 'The stress data has one layout.',
    // the colour rule: each colour word is set in its hue and isolates its family on hover
    legend: [['Rose', 'fierce', 0], ['gold', 'warm', 1], ['teal', 'quiet', 2], ['blue', 'dark', 3], ['violet', 'urban', 4]],
    legendPart: (colour, word, first) => `${colour} where ${first ? 'the music' : 'it'} is ${word}`,
    legendIsolate: (colour, word) => `${colour}: show only where the music is ${word}`,
    // evidence sentences (the mockup's wording)
    evidenceWord: (pct, word, overall) => `${pct}% of albums here are tagged ${word}<i>, against ${overall}% across the map.</i>`,
    evidenceLive: 'Concert recordings: much more crowd and room sound than the rest of the map.',
    evidenceQuiet: 'Much quieter than the rest of the map.',
    evidenceAudio: (dir, feature) => `Named from the sound: much ${dir} ${feature} than the rest of the map.`,
    // readable label for an audio-named region with no approved place name (placeholder; shown in capitals)
    audioWords: { 'danceability+': 'Danceable', 'instrumentalness+': 'Instrumental', 'liveness+': 'Live', 'loudness-': 'Quiet', 'acousticness+': 'Acoustic', 'energy+': 'Energetic', 'speechiness+': 'Spoken' },
    // regions as navigation
    inRegion: 'In', between: (a, b) => `Between ${a} and ${b}`,
    bestKnown: 'Best known here', nextTo: 'Next to', regionClose: 'Close',
    regionLabel: (name) => `Region: ${name}`, regionsList: 'Regions of the map',
    pointerLabel: (name) => `Go to ${name}`, hereLabel: (name) => `You are in ${name}. Open the region.`,
    searchCount: (albums, regions) => [albums ? `${albums} ${albums === 1 ? 'album' : 'albums'}` : '', regions ? `${regions} ${regions === 1 ? 'region' : 'regions'}` : ''].filter(Boolean).join(', '),
    // phone map mode: name plate, Colours chip and sheet, sheet grabber
    plateOpen: 'Open', plateClose: 'Close', colours: 'Colours', coloursClose: 'Close',
    coloursRow: (word, first) => `where ${first ? 'the music' : 'it'} is ${word}`,
    sheetMore: 'Show more', sheetLess: 'Show fewer',
    nearList: 'Albums in view', mapHelp: 'Drag or use arrow keys to pan, plus and minus to zoom. Comma and full stop step through the albums nearest the centre, Enter selects one.',
    // under "Closest albums": the app's own About sentence, in a new place
    closestNote: 'An album’s closest albums sit nearby on the map, but not always right beside it.',
    searchRegions: 'Regions', searchAlbums: 'Albums',
    searchHint: 'Type to see matching albums and regions. Up and down arrows move, Enter chooses.',
    searchList: 'Matching regions and albums',
    // Home, About (new copy, placeholder)
    homeRegions: 'Or start from a place on the map',
    aboutReading: { heading: 'Reading the map', body: [
      'Region names come from the handpicked mood words and the sound of the albums there. Select a name to see why it is there.',
      'The names change with the similarity setting, because each setting arranges the albums differently.',
    ] },
    stripRegion: (name) => `In ${name}`,
    stressBanner: 'Synthetic 10,000-point stress test',
    stressMissing: 'No synthetic data file yet (data/synth10k.js).',
    // prototype drawer (not part of the design)
    regionsSwitch: 'Regions', proto: { title: 'Prototype', chrome: 'Chrome', site: 'Site', trifid: 'Trifid', gas: 'Gas', live: 'Live', baked: 'Baked', data: 'Data', real: 'Real', synth: 'Synthetic 10,000', hulls: 'Show region hulls', hud: 'Frame time' },
  };
})();
