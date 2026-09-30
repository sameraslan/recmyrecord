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
  heroSub: 'Get the albums closest to it, by sound and by mood.',
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
    loading: 'Loading the closest albums',
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
  },
  phone: { map: 'Map', list: 'List', mapLabel: 'Open the map', listLabel: 'Back to the list' },
  /** Typographic cover tile when the title has no letter or digit. */
  cover: { noInitial: '·' },
  error: {
    body: 'The albums didn’t load. Check your connection, then try again.',
    retry: 'Try again',
  },
  notFound: {
    title: 'Not found',
    body: 'That page isn’t here. Search for an album, or explore the map.',
    mapLink: 'Explore the map',
  },
  about: {
    title: 'How it works',
    body: [
      'Every album here is described two ways. Its sound comes from Spotify’s audio values, such as energy, tempo and acousticness. Its mood comes from handpicked RateYourMusic descriptors, such as melancholic, lush or atmospheric.',
      'Pick an album and you get the ones closest to it once both are combined. The slider leans the comparison toward sound or toward mood.',
      `The map places ${CATALOG_SIZE_LABEL} albums so that ones that sound or feel alike sit close together.`,
    ],
    credits: 'Mood descriptors handpicked from RateYourMusic. Sound values from Spotify. Cover art from Spotify.',
    close: 'Close',
  },
  titles: {
    home: 'recmyrecord',
    map: 'Map',
    about: 'About',
    album: (title: string, artist: string) => `${title} by ${artist}`,
  },
  metaDescription: 'Pick an album you like and get the albums closest to it, by sound and by mood.',
} as const;
