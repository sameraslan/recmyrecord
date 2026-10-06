/**
 * Every user-visible string and ARIA label (spec section 8). The owner signs the copy off on the PR.
 * Rules: no em or en dashes, no hype, no emoji, no owner name, no exact catalog count ("4,000+" only),
 * never a count of recommendations.
 */
export const CATALOG_SIZE_LABEL = '4,000+';

export const COPY = {
  wordmark: 'recmyrecord',
  skip: 'Skip to content',
  nav: { label: 'Main', map: 'Map', about: 'About' },
  hero: 'Start with an album you like.',
  heroSub: 'Get the most similar albums, by sound and by mood.',
  search: {
    placeholder: 'Search albums or artists',
    label: 'Search albums or artists',
    hint: 'Type to see matching albums. Up and down arrows move, Enter chooses.',
    listLabel: 'Matching albums',
    open: 'Search albums',
    close: 'Close search',
    sheetLabel: 'Search albums',
    noMatches: (q: string) => `No album matches ${q}. Try the artist’s name, or fewer words.`,
    found: 'Matching albums listed',
    none: 'No albums found',
  },
  home: {
    explore: 'Explore the map',
    surprise: 'Surprise me',
    /** Small line under the Explore / Surprise buttons. */
    shelfLabel: 'Or start from one of these',
    shelfListLabel: 'Albums to start from',
    albumLabel: (title: string, artist: string) => `${title} by ${artist}`,
  },
  album: {
    trailLabel: 'Visited',
    trailNav: 'Albums visited',
    /** Shown before the trail when older albums are cut off. */
    trailMore: '…',
    openInSpotify: 'Open in Spotify',
    newTab: '(opens in a new tab)',
    copyLink: 'Copy link',
    copyLinkLabel: 'Copy link to this page',
    linkCopied: 'Link copied',
    copyFailed: (url: string) => `Could not copy. The link is ${url}`,
    listHeading: 'Closest albums',
    shares: (words: readonly string[]) => `Shares ${words.join(', ')}`,
    showMore: 'Show more',
    showFewer: 'Show fewer',
    close: 'Close and return to the map',
    tagsLabel: 'Mood descriptors',
    rowLabel: (title: string, artist: string, shared: readonly string[]) =>
      `${title} by ${artist}${shared.length ? `. Shares ${shared.join(', ')}` : ''}`,
    rowSpotify: (title: string) => `Open ${title} in Spotify (opens in a new tab)`,
    regionLabel: (title: string) => `${title} and the closest albums`,
  },
  slider: {
    label: 'Similarity',
    stops: { sonic: 'Sonic', balanced: 'Balanced', mood: 'Mood' },
    notes: { sonic: 'Closest in sound.', balanced: 'Sound and mood together.', mood: 'Closest in mood.' },
  },
  map: {
    heading: 'Map of albums',
    hint: 'Albums that sit close together sound or feel alike.',
    canvasLabel: 'Map of albums. Drag or use arrow keys to pan, plus and minus to zoom.',
    /** The canvas label while the map is only a backdrop (Home, About, 404) and takes no input. */
    canvasLabelStatic: 'Map of albums',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    reset: 'Reset view',
    cardPrimary: 'See closest albums',
    cardSpotify: 'Spotify',
    cardClose: 'Close',
    noWebgl: 'The map needs WebGL, which this browser has turned off. Search and lists still work.',
    preview: 'Map preview of the album and its closest albums',
    openMap: 'Open map',
    /** Beside an album: leaves it for Explore with the map left where it is. */
    exploreHere: 'Explore this area',
    /** The names toggle's one fixed label; its on/off state is aria-pressed, the label never changes.
     * PENDING OWNER APPROVAL (proposed wording, 2026-10-04). */
    names: 'Place names',
  },
  phone: { map: 'Map', list: 'List', mapLabel: 'Open the map', listLabel: 'Back to the list' },
  /** Typographic cover tile when the title has no letter or digit. */
  cover: { noInitial: '·' },
  error: {
    /** The whole message, where it is one line (search list, toast); `title` and `detail` are its two sentences. */
    body: 'The albums didn’t load. Check your connection, then try again.',
    title: 'The albums didn’t load.',
    detail: 'Check your connection, then try again.',
    retry: 'Try again',
  },
  notFound: {
    title: 'Not found',
    heading: 'That page isn’t here.',
    sub: 'Search for an album, or explore the map. Experimental exploration!',
    mapLink: 'Explore the map',
  },
  about: {
    title: 'How it works',
    /** Opening paragraph, directly under the title. */
    intro: 'recmyrecord helps you find new music you may like, or step out of your comfort zone into music far outside your usual territory. Pick an album you love to get ones similar to it, and use the map to wander as far from it as you want.',
    /** Grouped paragraphs, each under a small heading. */
    sections: [
      {
        heading: 'Sound and mood',
        body: [
          'Every album here has two core properties that make it what it is: sound and mood. Sound (sonic values) comes from the audio itself: measurements such as energy, tempo, danceability and acousticness, taken from the recording. Mood descriptors are words listeners use for the feelings or atmosphere an album evokes, such as melancholic or warm.',
          'Pick an album and you get the ones most similar to it. By default that means similar in both sound and mood; use the slider to match on sound only or mood only.',
          'Listening history plays no part in finding similar albums. Most streaming services base their recommendations on songs the same listeners play together, which reflects listening habits more than the music itself.',
          'Neither do genres or genre tags; it all comes from the sound and the mood each album evokes. Albums from the same genre often cluster together anyway, but the albums around a given one are not always from its genre. That can help you get into a new genre, since you start from something that sounds and feels a lot like music you already like.',
        ],
      },
      {
        heading: 'The map',
        body: [
          `The map places ${CATALOG_SIZE_LABEL} albums so that similar ones sit near one another and different ones sit further apart.`,
          'An album’s closest albums sit nearby on the map, but not always right beside it. Recommendations use more features than a two-dimensional map can show, so placing albums on it means giving up some accuracy.',
        ],
      },
    ],
    /** Closing line under the body, above the credits divider. */
    signoff: 'Time for exploration! Enjoy!',
    credits: 'Mood descriptors handpicked from RateYourMusic. Sound values from Spotify. Cover art from Spotify.',
    close: 'Close',
  },
  titles: {
    home: 'recmyrecord',
    /** Every page title except Home's: '{page} · recmyrecord'. */
    template: '%s · recmyrecord',
    map: 'Map',
    about: 'About',
    album: (title: string, artist: string) => `${title} by ${artist}`,
  },
  metaDescription: 'Pick an album you like and get the albums closest to it, by sound and by mood.',
} as const;
