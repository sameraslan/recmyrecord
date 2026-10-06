# art2vec: the framework

Content-only similarity for art. Start from a work you love, see what sits next to it, and walk outward one small step at a time.

This document is the constitution of the art2vec library and of every product built on it, recmyrecord first. It says what the library is for, the two rules it enforces, the one exception it allows, and the questions still open. System design, interfaces and code come after this document is agreed, and they answer to it. When a decision here changes, change it here first, in a pull request, and say why in the commit.

Status: draft for Samer's review, 6 October 2026. Tracked in recmyrecord issue 58.

## 1. What it is for

A person has a work they love: an album, a painting, a film, a novel. art2vec gives them the works that are most like it in the work itself, so they can:

1. find more of what they already love, with little wasted time;
2. branch out, by following a chain of small steps into territory they would never have searched for;
3. arrive, eventually, at things they do not like today, having got there from somewhere they do.

The output is a space to explore, not a leaderboard and not a feed. The person steers. The library's job is to make every step a small, honest step in the work's own qualities, so that the person feels they found the next thing themselves.

Success: people find things they enjoy and try things they would not have. Section 7 says how we check.

Not goals: accounts, personalisation, play tracking, or anything that learns about the person. The library knows works, not people.

## 2. The two rules and the one exception

### Rule 1. Reception picks the set

All the art ever made is far too much to go through, and there are only so many hours in a day. Each medium starts from a canon: a list of works that many people, over time, have claimed to be worth the time. Crowd-sourced charts, critics' polls, combined "best of" lists. Within that set the person explores freely.

The canon is a quality filter and nothing more. Ratings, vote counts and rankings decide what is in the set and nothing else. They never decide where anything sits in it. (Where a pipeline keeps works in chart order, that order may break ties and seed a layout; it may not move a neighbour.)

### Rule 2. The work picks the neighbours

Similarity comes only from the work itself. For music, the audio. For visual art, the image. For film, the frames, the cut and the sound. For literature, the text. An encoder reads the raw artefact and produces a vector; distance between vectors is distance between works.

Nothing about who liked a work, how many liked it, what shelf it was put on or what has been written about it enters the distance. Where an encoder cannot yet read a part of the work that matters (the words of a song, say), a medium may declare a temporary, human-sourced stand-in for that part, with an exit condition. Section 5 sets the terms. No medium uses one today.

### The exception. How the work makes people feel

The purpose of all this is enjoyment, and enjoyment is a feeling. A feeling is also the one thing content encoders read worst and the thing people most often reach for when they describe what they want ("something that feels like this"). So the library allows one kind of human-sourced information alongside the content vector, as a block of its own: descriptors of the felt response. Melancholic, tense, warm, playful, nocturnal.

The test for a label: does it describe the work, or its audience and its place among other works? "Melancholic" passes. "Underrated", "influential", "sophisticated" and "post-punk" fail. Section 5 works this exception out in detail, because it is the one place the rules bend and it has to bend the same way every time.

### Never part of a distance

- Co-occurrence: "people who liked X also liked Y".
- Ratings, popularity, vote counts, chart position.
- Genre, style, scene and movement labels.
- Era, country and artist identity. Two works by one artist should be close because they are alike, not because of the name.
- Fame that enters through the back door: models trained on text about the world (CLIP, LLMs given a title or an artist) know which works are famous and what has been said about them. Section 4 says how encoders are chosen.

Reception data has two legitimate uses besides the canon: evaluation (section 7) and labels for training a model that will later read the content alone (section 5, option D). Neither puts it in a distance.

## 3. Why these rules

Collaborative filtering recommends what people like you already like. It is good at the first job in section 1 and bad at the other two: it keeps everyone inside the circle they started in and amplifies whatever is already popular. Genre labels are coarse, social and historical; two albums that sound alike sit in different genres because of who made them and when. Both approaches describe the audience, and the person already knows their audience.

The work itself does not care about any of that. An encoder that only hears the audio will put a 1970s Ethiopian jazz record next to a 2010s electronic one if they share a texture, and that is exactly the step across a boundary that a person could never have planned. The recmyrecord genre-crossing report chose to let the sonic side cross genres freely rather than force lists to stay inside one.

The canon exists because content-only similarity over everything would be noise: most of what exists is not worth anyone's hour, and a space is only explorable if most of what you land on rewards the landing. Reception is the cheapest reliable signal that something is there, so it decides the set and nothing else.

## 4. What a medium is

A medium is a plugin that answers three questions about its works. The shared core does everything else.

| | Question | Where human data may appear |
|---|---|---|
| canon | Which works are in the set? | Yes. The only step that may use ratings, counts and lists. |
| encode | What is this work, as a vector, from its raw artefact? | No. |
| describe | How does this work make people feel, as a vector? | Yes: directly from a crowd today, or as labels for a model that then reads the work (section 5). |

Each medium also states what "the raw artefact" is, because that is a real choice. A 30-second preview clip per track is not the album; a thumbnail is not the painting; a trailer is not the film. The medium names the artefact it actually reads, its known gaps, and what a better artefact would be.

Planned media, as a sketch and not a commitment:

| Medium | Canon | Raw artefact | Encoder candidates | Felt-response source |
|---|---|---|---|---|
| Album | RateYourMusic all-time chart, top 10,000 | 30-second preview clips for a spread of tracks (Deezer, Apple, YouTube); full tracks if a licensed source appears | Discogs-EffNet (trained on genre and style labels, see below); CLAP with the text-leak caveat | RYM descriptors, filtered to feeling |
| Visual art | Wikidata paintings by sitelink count, museum highlights | The image at working resolution | DINOv2 or DINOv3; colour and texture statistics | ArtEmis emotion distributions |
| Film | RYM film charts, TSPDT lists | Keyframes, clips, shot-length and colour over time, the soundtrack through the album encoder | DINO on frames, V-JEPA 2 or InternVideo on clips | RYM film descriptors, filtered to feeling |
| Literature | thegreatestbooks.org | Full text where public domain, extracted features where not | Style embeddings (StyleDistance, LUAR), emotional arcs, pacing statistics | StoryGraph moods; LLM tags on anonymised excerpts |

Every encoder has seen something besides the work. Encoders trained against text (CLIP, CLAP, any captioning model) have read what the world says about works. Encoders trained on labels (Discogs-EffNet was trained to predict Discogs genres and styles) have been taught the map we leave out. The rule for choosing one: prefer encoders trained without text or labels, and decide between candidates by ear or by eye. An encoder that saw text or labels is allowed with a leak note (what it saw) and the leak checks of section 7 (genre make-up of lists, source and store probes). The recmyrecord audio work benchmarked several self-supervised audio models, found CLAP reading a store's encoding, and in the end chose Discogs-EffNet over CLAP by listening; every medium ends the same way, with someone looking or listening.

## 5. The descriptor question

This is the one place the rules bend, so it needs the most care. The question: which human-written labels may join the content vector in a distance?

### Where recmyrecord stands today

RateYourMusic offers 176 descriptors. The pipeline already drops the 56 lyric and theme words, so "what it is about" is not in the distance now. Six more are flagged as not mood (vocal type, instrumental, concept album): they stay in the distance but are hidden from the site. The other 114 are shown on the site as mood words, but they mix genuine feelings (melancholic, anxious, playful) with texture and style words (lo-fi, acoustic, orchestral, progressive, psychedelic, technical, sampling) and setting words (nocturnal, winter, urban, aquatic). Each word is weighted by its place on the album's RYM page and the block is scaled against the audio block by the slider. So today the mood side is partly a style side, and style is genre by another name.

### Four kinds of label

Sort any descriptor by the question it answers.

1. **What does the work do to you?** Felt response. Melancholic, anxious, warm, playful, hypnotic, uplifting. Setting words belong here too when they name an atmosphere the work puts you in (nocturnal, wintry) rather than a subject it depicts.
2. **What is it made of, how does it sound or look?** Texture. Lo-fi, dense, acoustic, orchestral, repetitive, minimal, noisy.
3. **What is it about?** Subject. Death, love, political, nature, religious.
4. **Where does it sit, and who is it for?** Position. Genre, style and movement words (progressive, psychedelic), era, scene, and judgements of standing (sophisticated, technical, underrated, cult).

Kind 4 fails the test in section 2 outright: it is a statement about the map and the audience, not the work. Kind 1 passes: a feeling is a first-person report of what the work did, and feelings are the point. Kinds 2 and 3 are the hard middle. They do describe the work, so they pass the test, but they are also content: texture is in the audio and subject is in the lyrics or the picture. Taking them from a crowd means describing the work in other people's words when the work is right there.

The honest objection to the whole exception is that a feeling is also something people say about a work. The difference is in what the statement is about. "This made me feel uneasy" is about the encounter between the work and a person, which is what the library exists to serve. "This is post-punk" or "this is underrated" is about the work's position among other works and other people, which is the map the library leaves out. Feelings also travel across media in a way nothing else does: a painting and an album can both be desolate, and no genre word connects them. That makes the felt block the natural bridge for cross-medium alignment (section 6).

### The options

**A. Keep the 114 as they are.** What recmyrecord does today. Richest signal, nothing to rebuild, and the lists are known to be good by ear. But texture words duplicate the audio side and style words pull the mood slider towards genre.

**B. Felt response only.** The descriptor block is exactly the exception and nothing else: kind 1, sorted by hand, committed with the medium. One rule for every medium, and it is what people mean by a vibe. It drops texture from the human side, which the audio already carries, and keeps subject out, where it already is.

**C. Felt response plus subject.** Bring the 56 lyric and theme words back. For music with lyrics the words are half the work, and no audio encoder hears them. Against: it was removed for a reason once, the framework would then say different things for paintings and films where subject shades into iconography and genre, and the right home for "what the lyrics say" is a content feature read from the lyrics, not a crowd.

**D. Predict descriptors from content.** Humans provide labels once, a model learns to read them off the artefact, and the library ships the predicted block. The descriptor model experiment reached 0.66 capped precision@10 from audio alone, against 0.44 for always guessing the common words, so this is partly within reach. It makes the library fully content-only and lets it describe works no crowd has described. Every leak in the training labels is learned too, and a model given artist, title and year (0.79 in the same experiment) is kind 4 in disguise, because it knows what has been written about the album.

### Recommendation

Take **B as the rule**: the human block is the felt response, defined per medium by a fixed list of descriptors sorted by hand into the four kinds. The sorting is a committed table (word, kind, one line of reason) so it can be reviewed, argued with and changed in a pull request like everything else.

Allow kinds 2 and 3 only as a **named stopgap**: "content the encoder cannot read yet", declared per medium with an exit condition. No medium uses one today, and the album medium does not need one: texture goes now, because the audio has it, and subject stays out, as today, until a content feature read from the lyrics brings it back (open question 5).

Treat **D as the direction**, for the felt block too. The crowd's feelings become training labels; the shipped block is read from the work. Until a model reads feeling from content as well as the crowd reports it, the crowd block ships, and the predicted block uses the same vocabulary and weighting so neighbour lists can be compared directly. The LLM that currently writes descriptors for albums beyond the chart (issue 40) is the opposite of this: it is given the artist and title and reads reputation, not the work. It breaks Rule 2 outright and goes first.

Two consequences to accept. First, crowd descriptors are not evenly spread: famous works have more of them, so a crowd block quietly favours the well-described. D fixes this; until then, report coverage. Second, cutting the 114 to the felt words will change today's neighbours. Before adopting B on the site, compare felt-only against the 114 on the current store: list overlap, how often lists cross genre families, hubness, and a listening pass over the usual seeds. That is a one-day experiment under the usual rules, and it should run before the rule is enforced on the site.

## 6. The shared core

The medium plugins stop at vectors. Everything from there on is common and medium-blind:

- **Blocks, one distance.** A work is one or more content blocks (audio; later lyrics) and one felt-response block. Each block is scaled to the same total variance before weights are applied, and one weight, which the person controls, sets how much the felt block counts against the content. recmyrecord's "sound" and "mood" sides are this weight at its two ends. The weight's default, its curve and any reduction of a block's dimensions are the medium's choice and are recorded with its vectors.
- **Missing blocks.** A work with no content (an album with no audio) is placed only where it has data and never given an imputed block. Its lists say so.
- **Neighbours.** Nearest neighbours in the combined space, with filters the person may apply that never alter distances (era, length, "not this artist again").
- **Paths.** A chain of small steps from one work to another, so the person can walk from where they are to somewhere they have never been (recmyrecord issue 34). Paths serve purposes 2 and 3 of section 1.
- **Maps.** A two-dimensional projection for a visual surface, with the understanding that any projection distorts and the neighbour list is the truth.
- **Export.** Vectors and metadata in a plain columnar format, and precomputed neighbour lists and map positions in compact JSON for a site that does no distance maths in the browser, which is how recmyrecord works today.
- **Cross-medium alignment**, later: anchors that exist in the works themselves (a soundtrack ties a film to an album, cover art ties an album to a painting, an adaptation ties a book to a film), plus a small shared felt-response vocabulary that each medium's own list maps onto. Anchors are declared by the two media they join and the alignment lives in the core. No anchor comes from co-consumption.

How any of this is built is for the system design that follows this document.

## 7. How we know it works

The rules keep human data out of the distances. They do not keep it out of the evaluation; that is where it belongs.

- **Leak checks.** Genre make-up of neighbour lists, store or source make-up and probes, artist repeats, hubness. These catch leaks (a model reading the encoding rather than the music) and are never optimised for.
- **Listening and looking sessions.** Fixed seed sets, lists side by side with the labels hidden, and odd-one-out judgements collected from people and compared with the embedding's geometry. A library whose space nobody can hear is wrong, whatever the proxy says.
- **Path tests.** Does a path cross a boundary the person would not have crossed, while every step stays small? Count steps, count crossings, and ask the person at the end whether they would have found the destination alone. What counts as a small step is a number the system design has to set.
- **Held-out data is spent once.** Reports say which splits were scored and new ideas are judged on fresh ones, as in the recmyrecord experiments rules.

## 8. Data, rights and respect

- Ship code and scripts. Never ship copyrighted media, and never commit audio, images or text that are not ours to redistribute.
- Ship vectors and metadata only where the source's terms allow it, and say which source and which terms.
- Do not fetch a site at runtime that does not want to be fetched. Canons come from exports, published lists and licensed snapshots, gathered slowly and resumably.
- Note the licence of every encoder and every preview source before shipping anything built on it (recmyrecord issue 35).
- No secrets in the repository; keys and data paths come from configuration.

## 9. What the library has to be

Principles the system design must honour. Not the design itself.

- **Modular.** One medium is one package that implements the three questions and nothing else. Adding a medium touches no other medium; the core changes only when a new shared capability is needed, never for one medium's convenience.
- **Small surface.** A newcomer should read the three questions, run one example end to end, and understand the whole shape in an afternoon.
- **Reproducible.** Same inputs, same vectors. Encoders are pinned; every stored vector says which encoder, which artefact and which version of the medium made it. A medium that changes its encoder or its descriptor list changes its version, and old vectors are not mixed with new.
- **Honest about leaks.** Every encoder and every descriptor source carries a note about what human or textual data it saw and what that may let in.
- **Installable.** A plain `pip install art2vec`, with media as optional extras so a user who only wants books does not download an audio model.
- **Offline after fetch.** Artefacts are fetched once, cached, and everything after runs without network.
- **Gentle on the machine.** Heavy jobs are resumable and run one at a time; the laptop that builds this has 16 GB.

## 10. Album, the first medium

recmyrecord is the proof that the shape works, and album2vec is the first plugin to extract from it. The current pipeline maps to the three questions as follows (as of 6 October 2026, from `data-pipeline/` on `main` and the `feat/audio-10k` branch).

- **canon**: RateYourMusic's all-time chart. The live site has 4,081 albums from the top 5,000; the 10k catalog has 10,467 (the 10,000 on the chart plus 467 that have dropped off since). Rating and vote count decide membership and row order and are not columns in any matrix.
- **encode**: the live site still runs on 13 Spotify audio features. Spotify has withdrawn these from its API for new integrations, so the live catalog cannot grow on them. Built and unshipped: Discogs-EffNet embeddings (1,280 dimensions per clip) of 30-second previews from Deezer, Apple or YouTube, four to eight clips per album in a spread of tracks, averaged, normalised, centred and reduced to 64 dimensions by PCA, then scaled to the variance of the old Spotify block. CLAP was built in parallel and set aside by ear. Albums with no audio were once given an audio block imputed from their descriptor neighbours; they are now to be limited to the mood side (issue 61).
- **describe**: 120 of the 176 RYM descriptors (the 56 lyric and theme words dropped; six vocal and form words kept in the distance but hidden from the site), weighted by their place on the album's page, combined with the audio block as `[audio | descriptors / s³]` with `s` at 5, 1.765 and 0.5 for the sound, balanced and mood stops. Neighbours are the 10 nearest by Euclidean distance. The 120 are all four kinds of section 5 except subject; the first act of the framework on the site is to sort them and run the comparison recommended there.
- **what ships**: compact JSON with 10 neighbours per album per stop, a UMAP position per stop, and the top mood words. No vectors reach the browser and the browser does no distance maths.

Extraction happens with no behaviour change first: for a fixed set of seed albums the ten neighbours at each stop are the same ten in the same order before and after (any float-order difference is a bug to explain, not a tolerance to grant), and the site then depends on the library instead of its own copy of the code.

## 11. Left to the system design

Questions a reader will rightly ask that this document does not answer, because they are design and not principle. The system design must answer each one and point back here.

- Versioning of the document, of a medium, of vectors; what counts as a breaking change.
- Which version of a work is the artefact (remaster, director's cut, translation) and how a canon is refreshed without reordering what exists.
- The default felt-response weight and its curve; whether a block is reduced in dimension and how.
- The evaluation protocol in enough detail to repeat it: seed sets, listeners, labels hidden or shown, what a small step is in numbers, and how listening-session data is stored and with whose consent.
- How a new medium is accepted: a leak note template, the committed descriptor table, the regression set.
- A glossary (canon, artefact, block, stop, leak, path).

## 12. Open questions

For Samer, each with a recommendation.

1. **Descriptors.** Options A to D in section 5. Recommend B as the rule, 2 and 3 as a declared stopgap, D as the direction, and the comparison experiment before the site changes.
2. **Where this lives.** Recommend a new public repository `sameraslan/art2vec` with this document as `FRAMEWORK.md` at its root and recmyrecord as the first consumer that pins a version. The name is free on PyPI and under the account as of 6 October 2026; the only GitHub namesake is an unlicensed zero-star course project. `art-to-vec` reads as "turn art into vector graphics" and is not recommended.
3. **Text-trained encoders.** Ban them, or allow them with a measured leak? Recommend allow with measurement, since the alternative removes the strongest encoders in several media, and the leak test in section 7 is cheap.
4. **Artist identity.** Should the library ever use it, even as a filter? Recommend yes as a filter the person can switch on ("not this artist again"), never in a distance.
5. **Subject for music.** Lyrics are content, and today nothing reads them. Should the album medium get a lyrics-based content block, which is how "what it is about" comes back without a crowd? Recommend yes, later, as a second content block, after the extraction.
6. **Descriptors for works no crowd has described.** Today an LLM given artist, title and year writes them (issue 40), which reads reputation rather than the work. Keep it as a labelled stopgap, or stop? Recommend keep, flagged in the data as predicted, until option D in section 5 replaces it with a model that reads the audio, and never let it fill in the chart albums themselves.
7. **Licence.** Code licence for the library (MIT or Apache 2.0; recommend Apache 2.0 for the patent clause) and a separate statement for any shipped vectors.

## 13. Changing this document

This is a living document and the only place the rules are written down. Change it in a pull request that explains the reason, update the status line, and make the code follow. If a shortcut in the code disagrees with this document, the document wins until the document is changed.
