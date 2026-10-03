"""Hand-written reading of every descriptor column used on the map.

Source of the wording: the "Descriptors" tab of the project Google Sheet (saved as descriptors.csv).
Where the sheet has no description (all 28 mood words, and a few form words that are not in the
sheet at all) the reading comes from the plain meaning of the word and its place in the RYM tree.

Fields per descriptor:
  v  valence, -1 dark .. +1 bright
  e  energy,  -1 calm .. +1 intense
  t  warmth,  -1 cold .. +1 warm
  setting  imagery words, free text
  kind     mood | atmosphere | style | technical   (technical = technique, form, line-up, vocals)
  drive    0..1, how much the word is allowed to drive colour (technical words get 0)
  fam, fs  hand-built family for scheme S3 and the strength of membership (fam '' = none)
  unc      1 = uncertain judgement
"""
# name: (v, e, t, setting, kind, drive, fam, fs, unc)
M = {
# ---- mood (no descriptions in the sheet; read from the word and its parent) ----
"aggressive":  (-0.6, 1.0, 0.7, "", "mood", 1.0, "fierce", 1.0, 0),
"angry":       (-0.8, 0.9, 0.8, "", "mood", 1.0, "fierce", 1.0, 0),
"anxious":     (-0.6, 0.4, -0.4, "", "mood", 1.0, "dark", 0.7, 1),
"bittersweet": (0.1, -0.2, 0.4, "", "mood", 1.0, "tender", 1.0, 0),
"calm":        (0.4, -0.9, 0.0, "", "mood", 1.0, "dreamy", 1.0, 0),
"meditative":  (0.3, -0.9, -0.1, "", "mood", 1.0, "dreamy", 1.0, 0),
"disturbing":  (-0.9, 0.3, -0.5, "", "mood", 1.0, "dark", 1.0, 0),
"energetic":   (0.3, 1.0, 0.6, "", "mood", 1.0, "fierce", 0.4, 1),
"manic":       (-0.2, 1.0, 0.6, "", "mood", 1.0, "fierce", 0.8, 0),
"happy":       (1.0, 0.5, 0.8, "", "mood", 1.0, "joyful", 1.0, 0),
"lethargic":   (-0.3, -0.9, -0.1, "", "mood", 1.0, "dreamy", 0.5, 1),
"longing":     (-0.2, -0.3, 0.3, "", "mood", 1.0, "tender", 1.0, 0),
"mellow":      (0.4, -0.7, 0.5, "", "mood", 1.0, "tender", 0.8, 0),
"soothing":    (0.6, -0.8, 0.4, "", "mood", 1.0, "dreamy", 0.8, 1),
"passionate":  (0.2, 0.6, 0.8, "", "mood", 0.6, "", 0.0, 1),
"playful":     (0.8, 0.5, 0.6, "", "mood", 1.0, "joyful", 1.0, 0),
"quirky":      (0.5, 0.4, 0.3, "", "mood", 0.8, "joyful", 0.6, 1),
"romantic":    (0.6, -0.3, 0.8, "", "mood", 1.0, "tender", 1.0, 0),
"sad":         (-0.7, -0.5, -0.2, "", "mood", 1.0, "dark", 0.6, 1),
"depressive":  (-1.0, -0.5, -0.6, "", "mood", 1.0, "dark", 1.0, 0),
"lonely":      (-0.6, -0.6, -0.5, "", "mood", 1.0, "dark", 0.7, 1),
"melancholic": (-0.5, -0.4, -0.1, "", "mood", 1.0, "tender", 0.6, 1),
"sombre":      (-0.8, -0.5, -0.5, "", "mood", 1.0, "dark", 1.0, 0),
"scary":       (-0.9, 0.5, -0.5, "", "mood", 1.0, "dark", 1.0, 0),
"sensual":     (0.5, -0.1, 0.9, "night, body", "mood", 1.0, "tender", 0.6, 1),
"sentimental": (0.3, -0.3, 0.6, "", "mood", 1.0, "tender", 1.0, 0),
"uplifting":   (0.9, 0.5, 0.6, "", "mood", 1.0, "joyful", 1.0, 0),
"triumphant":  (0.8, 0.8, 0.6, "", "mood", 1.0, "joyful", 0.8, 0),
# ---- atmosphere (described in the sheet) ----
"apocalyptic": (-0.9, 0.7, 0.2, "end of the world, destruction", "atmosphere", 1.0, "dark", 0.8, 1),
"dark":        (-0.8, 0.1, -0.4, "infernal, mysterious, ominous, gloomy", "atmosphere", 1.0, "dark", 1.0, 0),
"ominous":     (-0.8, 0.2, -0.5, "something evil will happen", "atmosphere", 1.0, "dark", 1.0, 0),
"infernal":    (-0.9, 0.9, 0.9, "hell, fire, demons", "atmosphere", 1.0, "fierce", 1.0, 0),
"funereal":    (-0.9, -0.7, -0.6, "mourning, sorrow", "atmosphere", 1.0, "dark", 1.0, 0),
"cold":        (-0.5, -0.2, -1.0, "low temperature, frost, freezing landscape", "atmosphere", 1.0, "dark", 1.0, 0),
"epic":        (0.2, 0.7, 0.2, "grand scale, heroes, wars", "atmosphere", 0.4, "", 0.0, 1),
"ethereal":    (0.5, -0.5, -0.3, "heavenly, airy, graceful", "atmosphere", 1.0, "dreamy", 1.0, 0),
"futuristic":  (0.0, 0.3, -0.6, "advanced technology, science fiction", "atmosphere", 0.8, "nocturnal", 0.6, 1),
"hypnotic":    (0.0, -0.3, -0.1, "trance, lowered awareness", "atmosphere", 0.8, "dreamy", 0.6, 1),
"mechanical":  (-0.4, 0.4, -0.8, "machinery, industrial scenery", "atmosphere", 0.8, "nocturnal", 0.5, 1),
"mysterious":  (-0.3, -0.2, -0.3, "something eludes the listener", "atmosphere", 0.8, "dark", 0.5, 1),
"nocturnal":   (-0.2, -0.3, -0.3, "night", "atmosphere", 1.0, "nocturnal", 1.0, 0),
"urban":       (0.0, 0.3, 0.0, "city, metropolis", "atmosphere", 0.8, "nocturnal", 1.0, 0),
"party":       (0.8, 0.9, 0.7, "parties", "atmosphere", 1.0, "joyful", 1.0, 0),
"pastoral":    (0.5, -0.6, 0.4, "countryside, fields, hills, villages", "atmosphere", 1.0, "tender", 0.6, 1),
"peaceful":    (0.7, -0.9, 0.2, "tranquillity, serenity", "atmosphere", 1.0, "dreamy", 1.0, 0),
"psychedelic": (0.3, 0.2, 0.3, "psychedelic drugs, reverb, phasing", "atmosphere", 0.6, "dreamy", 0.6, 1),
"ritualistic": (-0.2, 0.3, 0.3, "ritual ceremony, trance, primal", "atmosphere", 0.4, "", 0.0, 1),
"spiritual":   (0.5, -0.3, 0.2, "higher plane, bliss", "atmosphere", 0.8, "dreamy", 0.7, 0),
"surreal":     (0.0, 0.0, -0.1, "dream, hallucination, unreal", "atmosphere", 0.6, "dreamy", 0.7, 1),
"suspenseful": (-0.5, 0.4, -0.3, "uncertainty, build-up", "atmosphere", 0.8, "dark", 0.6, 0),
"space":       (0.0, -0.3, -0.7, "outer space, dark void, alien planets", "atmosphere", 0.8, "dreamy", 0.8, 0),
"warm":        (0.6, -0.1, 1.0, "warmth, desert, tropics", "atmosphere", 1.0, "joyful", 0.8, 0),
"summer":      (0.8, 0.4, 0.9, "warm days, beaches, holidays", "atmosphere", 1.0, "joyful", 1.0, 0),
"spring":      (0.8, 0.0, 0.5, "blooming flowers, warming", "atmosphere", 1.0, "joyful", 0.7, 0),
"autumn":      (-0.1, -0.5, 0.3, "autumn", "atmosphere", 1.0, "tender", 0.9, 0),
"winter":      (-0.3, -0.6, -1.0, "snow, cold, fireplaces", "atmosphere", 1.0, "dark", 0.8, 0),
"seasonal":    (0.0, 0.0, 0.0, "time of year", "atmosphere", 0.0, "", 0.0, 0),
"tropical":    (0.8, 0.4, 1.0, "tropics, beaches, lush vegetation", "atmosphere", 1.0, "joyful", 1.0, 0),
"aquatic":     (0.3, -0.5, -0.5, "water, oceans", "atmosphere", 1.0, "dreamy", 0.9, 0),
"rain":        (-0.3, -0.6, -0.4, "rain", "atmosphere", 1.0, "tender", 0.6, 1),
"forest":      (0.2, -0.5, -0.1, "forest, trees", "atmosphere", 0.8, "dreamy", 0.5, 1),
"desert":      (0.0, -0.1, 0.9, "arid land, sand, heat", "atmosphere", 0.6, "", 0.0, 1),
"natural":     (0.4, -0.6, 0.0, "natural environment, field recordings", "atmosphere", 0.6, "dreamy", 0.4, 1),
"medieval":    (0.0, -0.1, 0.0, "Middle Ages", "atmosphere", 0.0, "", 0.0, 0),
"tribal":      (0.2, 0.5, 0.6, "tribal rhythm, entrancing", "atmosphere", 0.4, "", 0.0, 1),
"martial":     (-0.4, 0.7, 0.0, "armed forces, war", "atmosphere", 0.5, "fierce", 0.4, 1),
"fairy tale":  (0.5, -0.2, 0.3, "fantastical children's stories", "atmosphere", 0.3, "dreamy", 0.3, 1),
# ---- style (described in the sheet); only the ones with a feel drive colour ----
"melodic":     (0.4, 0.0, 0.3, "", "style", 0.25, "", 0.0, 0),
"rhythmic":    (0.3, 0.5, 0.4, "", "style", 0.25, "", 0.0, 0),
"atmospheric": (-0.1, -0.5, -0.4, "timbre and texture", "style", 0.5, "dreamy", 0.4, 1),
"heavy":       (-0.5, 0.9, 0.5, "distorted, crushing weight", "style", 0.8, "fierce", 0.8, 0),
"progressive": (0.0, 0.0, 0.0, "", "technical", 0.0, "", 0.0, 0),
"lush":        (0.5, -0.1, 0.5, "rich, tender, colourful", "style", 0.5, "tender", 0.5, 0),
"complex":     (0.0, 0.0, 0.0, "", "technical", 0.0, "", 0.0, 0),
"raw":         (-0.3, 0.8, 0.5, "unrefined, direct", "style", 0.6, "fierce", 0.7, 0),
"dense":       (-0.1, 0.5, 0.1, "busy, thick", "style", 0.2, "", 0.0, 0),
"eclectic":    (0.0, 0.0, 0.0, "", "technical", 0.0, "", 0.0, 0),
"technical":   (0.0, 0.0, 0.0, "", "technical", 0.0, "", 0.0, 0),
"avant-garde": (-0.2, 0.2, -0.2, "challenging, radical", "style", 0.15, "", 0.0, 1),
"noisy":       (-0.4, 0.8, 0.2, "distorted timbres", "style", 0.6, "fierce", 0.6, 0),
"repetitive":  (0.0, 0.0, -0.1, "", "style", 0.1, "", 0.0, 0),
"anthemic":    (0.6, 0.8, 0.5, "powerful, singalong", "style", 0.6, "joyful", 0.6, 0),
"dissonant":   (-0.6, 0.5, -0.3, "harsh, inharmonious", "style", 0.5, "dark", 0.4, 1),
"chaotic":     (-0.4, 1.0, 0.3, "disorder", "style", 0.7, "fierce", 0.7, 0),
"soft":        (0.4, -0.8, 0.4, "light, gentle, comforting", "style", 0.8, "tender", 0.8, 0),
"lo-fi":       (0.0, -0.2, 0.2, "", "style", 0.15, "", 0.0, 0),
"minimalistic":(0.0, -0.6, -0.3, "stripped down", "style", 0.3, "dreamy", 0.3, 1),
"sparse":      (-0.1, -0.8, -0.4, "silence", "style", 0.4, "dreamy", 0.3, 1),
"atonal":      (-0.4, 0.1, -0.4, "", "style", 0.2, "dark", 0.3, 1),
"polyphonic":  (0.0, 0.0, 0.0, "", "technical", 0.0, "", 0.0, 0),
"Wall of Sound": (0.2, 0.4, 0.3, "reverb, massed instruments", "technical", 0.2, "", 0.0, 1),
"ballad":      (0.2, -0.6, 0.6, "slow, sentimental love song", "style", 0.5, "tender", 0.6, 0),
"parody":      (0.5, 0.3, 0.2, "humour", "technical", 0.0, "", 0.0, 0),
}
# technique, form, line-up and vocals: never drive colour
for _n in ["male vocals", "female vocals", "androgynous vocals", "vocal group", "instrumental", "acoustic",
           "concept album", "improvisation", "sampling", "uncommon time signatures", "orchestral", "suite",
           "rock opera", "choral", "chamber music", "monologue", "symphony", "skit", "lyrics", "ensemble",
           "medley", "string quartet", "opera", "mashup", "waltz", "jingle", "oratorio"]:
    M[_n] = (0.0, 0.0, 0.0, "", "technical", 0.0, "", 0.0, 0)
