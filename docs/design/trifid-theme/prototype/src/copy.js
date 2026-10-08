/* Strings. RMR.COPY repeats the app's lib/copy.ts verbatim; RMR.TEXT is everything new or changed for this
 * theme: placeholder wording until the owner approves it (the full list is in ../COPY.md).
 * Rules: no em or en dashes, no emoji, no owner name, "4,000+" only, never a count of recommendations. */
(function () {
  'use strict';
  const RMR = window.RMR;
  RMR.COPY = {
    wordmark: 'recmyrecord', skip: 'Skip to content', navLabel: 'Main', navMap: 'Map', navAbout: 'About',
    searchPlaceholder: 'Search albums or artists', searchLabel: 'Search albums or artists',
    searchHint: 'Type to see matching albums. Up and down arrows move, Enter chooses.', searchList: 'Matching albums',
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
    sliderNotes: { sonic: 'Closest in sound.', balanced: 'Sound and mood together.', mood: 'Closest in mood.' },   // the app's notes
    sliderLocked: 'The stress data has one layout.',
    // map label (in capitals) of a region named from an audio trait that has no approved place name; seen only with names=all or data=10k
    audioWords: { 'danceability+': 'Danceable', 'instrumentalness+': 'Instrumental', 'liveness+': 'Live', 'loudness-': 'Quiet', 'acousticness+': 'Acoustic', 'energy+': 'Energetic', 'speechiness+': 'Spoken' },
    searchCount: (albums) => `${albums} ${albums === 1 ? 'album' : 'albums'}`,
    // phone map mode: name plate, sheet grabber
    plateOpen: 'Open', plateClose: 'Close',
    sheetMore: 'Show more', sheetLess: 'Show fewer',
    stressBanner: 'Synthetic 10,000-point stress test',
    stressMissing: 'No synthetic data file yet (data/synth10k.js).',
  };
})();
