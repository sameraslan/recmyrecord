"""results/store_effect_fix.json as markdown (called by store_effect_report.py). The sentences of the verdict
quote the numbers of the JSON; the reading around them was written against the run of 2026-10-04 and should
be read again if the numbers move."""
import datetime

CLIPS_IN_CATALOG = 52000  # about: what a full re-embed would download
ITUNES_CLIPS, STORE_CLIPS = 11636, 37751  # source_effect.md section 5: iTunes clips (872 + 10,764) of all store-preview clips


def t(header: list[str], rows: list[list]) -> list[str]:
    return ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)] + ["| " + " | ".join(str(c) for c in row) + " |" for row in rows] + [""]


def f(x, n=3) -> str:
    return "–" if x is None else f"{x:.{n}f}"


def pc(x) -> str:
    return "–" if x is None else f"{100 * x:.1f}%"


def q3(v, unit="") -> str:
    return "–" if not v else f"{v[1]:g}{unit} ({v[0]:g} to {v[2]:g})"


def effect_row(label: str, x: dict) -> list:
    c, p, rt, nb = x["cosine"], x["probe"], x["retrieval"], x["neighbours"]["other_albums"]
    return [label, f"{f(c['same_track_cross_store'])} ({f(c['same_track_cross_store_median'])})", f(c["other_track_same_album_same_store"]),
            f"{c['gap']:+.3f}", f"{f(p['auc'])} ± {f(p['fold_sd'])}", pc(p["pairs_itunes_scored_higher"]),
            f"{pc(rt['top1'])} / {pc(rt['top5'])}", f"{pc(nb['share'])} ({pc(nb['deezer_seeds'])} / {pc(nb['itunes_seeds'])})"]


EFFECT_HEAD = ["Variant", "Same track, other store: cosine mean (median)", "Other track of the album, same store", "Gap",
               "Store probe AUC ± fold sd", "Pairs where the iTunes clip scores more iTunes", "Own track found in the other store, top 1 / top 5",
               "Neighbours from the other store (Deezer seeds / iTunes seeds)"]


def music_row(label: str, x: dict, moved: dict | None) -> list:
    m = x["music"]
    return [label, f(m["spearman_with_base"]), f"{m['overlap10_with_base']:.1f}", "–" if moved is None else f"{f(moved['deezer'])} / {f(moved['itunes'])}",
            f(m["same_album_auc"]), f"{pc(m['family_knn'])} ({pc(m['family_chance'])})", f"{pc(m['genre_knn'])} ({pc(m['genre_chance'])})"]


MUSIC_HEAD = ["Variant", "Spearman with the baseline's similarities", "Of 10 neighbours, kept from the baseline",
              "Cosine of a clip with its own baseline vector (Deezer / iTunes)", "Same album vs other album AUC",
              "Neighbours of the same genre family (chance)", "Neighbours of the same first genre (chance)"]


def markdown(res: dict) -> str:
    s, L, V, al = res["sample"], res["labels"], res["variants"], res["aligned"]
    lab = lambda v: f"`{v}` {L.get(v, '')}"  # noqa: E731
    b = V["base"]
    exp = b["neighbours"]["other_albums"]["expected"]
    one = res["one_store_only"]
    yt = res["youtube"]
    dg, an = res["diagnostics"], res["alignment"]
    dz, it, df = dg["stores"]["deezer"], dg["stores"]["itunes"], dg["itunes_minus_deezer"]
    out = ["# What makes CLAP tell the stores apart, and what removes it", "",
           f"Generated {datetime.date.today().isoformat()} by `store_effect_fix.py`. {s['albums']} albums that both stores carry, "
           f"{s['pairs']} tracks fetched from both ({2 * s['pairs']} preview clips), every clip embedded under {len(V)} preprocessing variants; "
           f"{al['n_pairs']} of the pairs also cut to the stretch of the track both previews share. "
           + (f"YouTube: {yt.get('albums', 0)} of these albums as full-album audio, {yt.get('windows', 0)} windows." if yt.get("albums") else "YouTube: not run (see below)."), "",
           "**Measurements on vectors and waveform statistics. Nobody listened to anything.** The music-information columns are proxies "
           "(agreement with the baseline's own neighbourhoods, album and genre agreement on a few hundred clips).", ""]
    if s["albums"] < 100:
        out += [f"**The run is incomplete: {s['albums']} of the 120 albums planned.** The laptop went onto battery at 18% during the run and the job "
                "was stopped rather than drain it; it resumes from its cache (command at the end). The effects below are large and the same in "
                "every album so far, but every n here is small: read the percentages as rough.", ""]
    out += ["## Verdict", ""]
    st = one.get("itunes_mp3st__deezer_base")
    m3, lp12, rs16 = V.get("mp3st"), V.get("lp12"), V.get("rs16")
    ab, ub = al["variants"]["base"], al["unaligned_same_pairs"]["base"]
    out += [
        f"- **The cause is how the two stores encode, and it sits at the top of what CLAP hears.** The same track from the other store is "
        f"at cosine {f(b['cosine']['same_track_cross_store'])}, barely closer than another track of the album from the same store "
        f"({f(b['cosine']['other_track_same_album_same_store'])}); a probe tells the stores apart with AUC {f(b['probe']['auc'])} and scores the iTunes "
        f"clip as more iTunes in {pc(b['probe']['pairs_itunes_scored_higher'])} of the pairs; a clip's ten nearest clips from other albums are "
        f"{pc(b['neighbours']['other_albums']['share'])} from the other store where {pc(exp)} would be even. This is the catalog's store split, on recordings that are the same.",
        f"- **Not the excerpt.** The two previews are usually the same stretch of the track shifted by a few seconds (median offset "
        f"{an['offset_s_q5_25_50_75_95'][2]:g} s; {an['overlap_15s_or_more']} of {an['n']} pairs share 15 s or more, {an['no_common_stretch']} share nothing "
        f"that was found). Cut to exactly the shared stretch, "
        f"the same-track cosine is {f(ab['cosine']['same_track_cross_store'])} against {f(ub['same_track'])} uncut, and the probe still reads {f(ab['probe']['auc'])}.",
        f"- **Not loudness.** iTunes previews are louder by a median {df['lufs']['q10_50_90'][1]:g} dB. Bringing every clip to one level leaves the "
        f"cosine at {f(V['loud']['cosine']['same_track_cross_store'])} and the probe at {f(V['loud']['probe']['auc'])}.",
        f"- **Not the missing top octave as such.** Deezer's MP3 (128 kbit/s) has nothing above about {dz['cutoff_hz_q10_50_90'][1] / 1000:g} kHz, "
        f"Apple's AAC (about {it['bit_rate_kbps_q10_50_90'][1]:.0f} kbit/s) runs to {it['cutoff_hz_q10_50_90'][1] / 1000:g} kHz. But CLAP's input stops at "
        f"14 kHz, and cutting both at 16, 15 or 14 kHz changes nothing (cosine {f(V['rs32']['cosine']['same_track_cross_store'])}, "
        f"{f(V['lp15']['cosine']['same_track_cross_store'])}, {f(V['lp14']['cosine']['same_track_cross_store'])}). Cutting at 13 kHz starts to help "
        f"({f(V['lp13']['cosine']['same_track_cross_store'])}), at 12 kHz most of it is gone ({f(lp12['cosine']['same_track_cross_store'])}). "
        "The long-term level between 12 and 14 kHz is the same in both stores to a quarter of a dB; what differs is the frame-by-frame pattern, "
        "and it differs most in CLAP's top bands (section 3). The likely reading: a 128 kbit/s stereo MP3 is short of bits up there and codes "
        "that band unevenly from frame to frame. So: the MP3 encoding of the 12 to 14 kHz band, seen by CLAP's top mel bands.",
    ]
    if m3 and st:
        out += [
            f"- **What removes it: giving the iTunes clip Deezer's encoding.** The decoded iTunes preview, stereo, through MP3 128 kbit/s "
            f"and back (`mp3st`), then the recipe as it is, against Deezer clips left alone: same-track cosine {f(st['same_track'])}, probe "
            f"{f(st['auc'])}, neighbours from the other store {pc(st['share_other_albums'])} ({pc(st['deezer_seeds'])} for Deezer seeds, "
            f"{pc(st['itunes_seeds'])} for iTunes seeds). Only the iTunes clips change. A probe still finds something (EffNet's reads "
            f"{f(res['effnet']['base']['probe']['auc']) if res.get('effnet') else '–'} on the same clips), but the neighbourhoods mix. The same round trip "
            f"on a mono signal (`mp3`) does not work ({f(V['mp3']['cosine']['same_track_cross_store'])}): it is the stereo encode at this bitrate that leaves the mark.",
            f"- **A low-pass on every clip also works, less cleanly.** At 12 kHz: cosine {f(lp12['cosine']['same_track_cross_store'])}, probe "
            f"{f(lp12['probe']['auc'])}, other-store neighbours {pc(lp12['neighbours']['other_albums']['share'])}. Via 16 kHz (content to 8 kHz): "
            f"{f(rs16['cosine']['same_track_cross_store'])}, {f(rs16['probe']['auc'])}, {pc(rs16['neighbours']['other_albums']['share'])}. It has to be "
            f"applied to both stores (applied to one it makes things worse), so every clip is embedded again.",
            f"- **Cost in music information (proxies).** Low-pass 12 kHz keeps {lp12['music']['overlap10_with_base']:.1f} of a clip's 10 same-store "
            f"neighbours and same-album AUC {f(lp12['music']['same_album_auc'])} (baseline {f(b['music']['same_album_auc'])}); via 16 kHz keeps "
            f"{rs16['music']['overlap10_with_base']:.1f} and {f(rs16['music']['same_album_auc'])}. The MP3 round trip moves an iTunes clip to cosine "
            f"{f(res['moved']['mp3st']['itunes'])} with its own baseline vector and a Deezer clip (encoded a second time) to "
            f"{f(res['moved']['mp3st']['deezer'])}; same-album AUC {f(m3['music']['same_album_auc'])}. A small cost on these proxies for all three; "
            "the one-store fix leaves the Deezer clips (about two thirds of the catalog's) exactly as they are.",
        ]
    vm = res["vector_corrections"].get("base: iTunes vectors ridge map, lambda 1 (fitted on other albums' pairs)")
    if vm:
        out += [f"- **Without fetching anything: a linear map on the stored iTunes vectors.** A ridge map from the iTunes vector to its Deezer version, fitted "
                f"on the pairs of other albums, gives same-track cosine {f(vm['same_track'])} and {pc(vm['share_other_albums'])} other-store neighbours on "
                "held-out pairs. That is close to the round trip and costs no download. It was not applied to the catalog; the corrections that failed there "
                "(`source_effect.md`, section 6) were fitted on the two populations, not on pairs, so this one is worth trying first: the vectors are already stored."]
    if yt.get("variants"):
        yb = yt["variants"]["base"]
        ys = yt["variants"].get("rs16", yb)
        out += [f"- **YouTube audio ({'/'.join(yt['audio']['codec'])}, {yt['albums']} albums).** As it is, a probe separates YouTube windows from Deezer "
                f"clips of the same albums with AUC {f(yb['youtube_vs_deezer_auc'])} and from iTunes clips with {f(yb['youtube_vs_itunes_auc'])} "
                f"(windows from other parts of the album, so part of that is the music: two random halves of the YouTube windows give "
                f"{f(yb['floor_random_split_of_youtube_auc'])}). The album's YouTube mean finds its own album among the {yb['album_retrieval_deezer']['candidates']} "
                f"Deezer means first in {pc(yb['album_retrieval_deezer']['top1'])} and among the iTunes means in {pc(yb['album_retrieval_itunes']['top1'])}. "
                f"YouTube windows' ten nearest clips of other albums are {pc(yb['neighbours']['youtube_seeds_youtube_share'])} YouTube where "
                f"{pc(yb['neighbours']['expected'])} would be even. So YouTube audio is a third accent, milder than the Deezer/iTunes split "
                f"(iTunes vs Deezer on the same albums: {f(yb['itunes_vs_deezer_auc_same_albums'])}), and it finds the right album about as often as a store clip finds "
                f"its album's other tracks. Low-passing every source brings it closer (via 16 kHz: {f(ys['youtube_vs_deezer_auc'])} / {f(ys['youtube_vs_itunes_auc'])}, "
                f"{pc(ys['neighbours']['youtube_seeds_youtube_share'])} YouTube neighbours). The stereo MP3 round trip was not run on YouTube audio (the windows reach "
                "the model process as mono), so whether it does for YouTube what it does for iTunes is open. 25 albums: rough numbers."]
    else:
        out += ["- **YouTube audio: not measured.** " + (yt.get("note") or "The run stopped before the YouTube part.")]
    out += [""]

    out += ["## The sample", "",
            f"Albums of `catalog/albums.csv` with both a Deezer and an Apple Music link (4,659), drawn with seed 0 in turn from cells of (on the site / new) "
            f"x decade x genre family, an album with a YouTube link first in every other visit. Listings by `rmr_audio.match.tracks` (Deezer id; Apple id in "
            f"its link's storefront, then `us`). A track is paired when its normalised title is the same in both listings and the durations are within 2 s; "
            f"up to 3 pairs an album, spread through it. Tried: {s['candidates_tried']}.", ""]
    out += t(["Albums", "Pairs", "On the site / new", "With a YouTube link", "Decades", "Genre families", "iTunes storefronts"],
             [[s["albums"], s["pairs"], f"{s['existing']} / {s['new']}", s["with_youtube_link"], ", ".join(f"{k} {v}" for k, v in s["decade"].items()),
               ", ".join(f"{k} {v}" for k, v in s["family"].items()), ", ".join(f"{k.split(':')[1]} {v}" for k, v in s["itunes_storefront"].items())]])

    out += ["## 1. The files", "", "Median (10th to 90th percentile) over the clips; ffprobe for the format, the decoded 44.1 kHz signal for the rest.", ""]
    rows = []
    for name, d in (("Deezer", dz), ("iTunes", it)):
        rows.append([name, d["n"], ", ".join(f"{k} {v}" for k, v in d["codec"].items()), q3(d["bit_rate_kbps_q10_50_90"]),
                     ", ".join(f"{k} Hz {v}" for k, v in d["sample_rate"].items()), ", ".join(f"{k} s: {v}" for k, v in d["decoded_seconds"].items()),
                     q3(d["cutoff_hz_q10_50_90"]), q3(d["energy_above_12k_db_q10_50_90"]), q3(d["lufs_q10_50_90"]), q3(d["peak_db_q10_50_90"]),
                     q3(d["side_db_q10_50_90"]), q3(d["mono_loss_db_q10_50_90"])])
    out += t(["Store", "Clips", "Codec", "kbit/s", "Sample rate", "Decoded length", "Highest 250 Hz band above -100 dBFS (Hz)",
              "Energy above 12 kHz (dB re total)", "Loudness (LUFS, mono)", "Peak (dBFS)", "Side re mid (dB)", "Level lost by (L+R)/2 (dB)"], rows)
    out += ["iTunes minus Deezer, the same track:", ""]
    out += t(["Measure", "n", "Mean", "sd", "Median (10th to 90th)", "Median absolute"],
             [[k, v["n"], v["mean"], v["sd"], q3(v["q10_50_90"]), v["abs_median"]] for k, v in df.items()])

    out += ["## 2. Are the two previews the same 30 seconds?", "",
            "Offset of the iTunes excerpt against the Deezer one, by cross-correlating the two waveforms at 8 kHz (accepted from a correlation of 0.5 at "
            "the best lag, with at least 5 s shared) or, failing that, their loudness envelopes (from 0.6). Negative: iTunes starts earlier in the track.", ""]
    out += t(["Pairs", "Found by", "Waveform correlation at the best lag", "Offset (s): 5th, 25th, 50th, 75th, 95th", "iTunes earlier / later", "Within 5 s",
              "Shared stretch (s)", "Sharing 15 s or more", "No common stretch", "Albums whose pairs all have one offset"],
             [[an["n"], ", ".join(f"{k} {v}" for k, v in an["found_by"].items()), q3(an["wave_ncc_q10_50_90"]),
               ", ".join(f"{x:g}" for x in an["offset_s_q5_25_50_75_95"]), f"{pc(an['itunes_starts_earlier'])} / {pc(an['itunes_starts_later'])}",
               pc(an["offset_within_5s"]), q3(an["overlap_s_q10_50_90"]), an["overlap_15s_or_more"], an["no_common_stretch"],
               f"{an['same_offset_within_album']['within_0.05s']} of {an['same_offset_within_album']['albums']}"]])
    out += ["Offsets, pairs per range (s): " + ", ".join(f"{k}: {v}" for k, v in an["offset_histogram_s"].items() if v) + ".", "",
            f"A waveform correlation near 1 after the shift says the two stores were encoded from the same master. In "
            f"{an['same_offset_within_album']['within_0.05s']} of the {an['same_offset_within_album']['albums']} albums with two or more aligned pairs the offset is the same for every track.", ""]

    bd = res["bands"]
    fe = bd["feature_extractor"]
    out += ["## 3. Where in frequency the two versions differ", "",
            f"The {bd['n_pairs']} pairs cut to their shared stretch. CLAP's input: {fe['n_mels']} mel bands from {fe['fmin']:.0f} to {fe['fmax']:.0f} Hz at "
            f"{fe['sampling_rate']} Hz, in dB. First table: that input, frame by frame over the first 10 s (band centres computed from those settings). "
            "Second: the decoded waveforms' long-term spectrum.", ""]
    out += t(["Band (Hz)", "Mel bands", "Mean absolute difference per frame (dB)", "iTunes minus Deezer (dB)", "Spread over time, iTunes minus Deezer (dB)"],
             [[f"{x['band_hz'][0]:g} to {x['band_hz'][1]:g}", x["mel_bands"], x["abs_diff_db"], x["itunes_minus_deezer_db"], x["sd_over_time_itunes_minus_deezer_db"]]
              for x in bd["model_input_by_band"]])
    out += t(["Band (Hz)", "Deezer level (dB, median)", "iTunes level", "iTunes minus Deezer (median)", "Median absolute difference"],
             [[f"{x['band_hz'][0]:g} to {x['band_hz'][1]:g}", x["deezer_db_median"], x["itunes_db_median"], x["itunes_minus_deezer_db_median"], x["abs_diff_db_median"]]
              for x in bd["waveform_spectrum_by_band"]])

    out += ["## 4. CLAP under each variant: the store effect", "",
            f"Each variant is applied to the 44.1 kHz mono clip of both stores, then the catalog's recipe unchanged ({res['recipe']}). "
            f"n = {b['cosine']['n_pairs']} pairs, {s['albums']} albums. Cosines are between clip vectors. Probe: logistic regression on standardised vectors, C 0.01, "
            f"five folds with an album's clips kept together; the paired column uses the same out-of-fold scores. Retrieval: a clip looks for its own track among the "
            f"{b['retrieval']['candidates']} clips of the other store. Last column: the share of a clip's ten nearest clips that come from the other store, among "
            f"the clips of other albums only ({pc(exp)} if the store did not matter).", ""]
    out += t(EFFECT_HEAD, [effect_row(lab(v), x) for v, x in V.items()])
    ci = b["cosine"]["same_track_ci95"]
    out += [f"Baseline same-track cosine, 95% interval by resampling albums: {f(ci[0])} to {f(ci[1])}. Other album, same store: "
            f"{f(b['cosine']['other_album_same_store'])}; other album, other store: {f(b['cosine']['other_album_cross_store'])}.", ""]

    out += ["## 5. What each variant keeps of the music (proxies, inside one store)", "",
            "Each store on its own, then the two averaged: no store effect can enter. Rank correlation of all pairwise clip cosines with the baseline's; how "
            "many of a clip's 10 nearest clips stay; same album against other album from the cosine alone (AUC); share of the 10 nearest clips of other "
            "albums with the seed's genre family and first primary genre.", ""]
    out += t(MUSIC_HEAD, [music_row(lab(v), x, res["moved"].get(v)) for v, x in V.items()])

    out += ["## 6. The two excerpts cut to the same stretch", "",
            f"{al['n_pairs']} pairs ({al['albums']} albums) that share 15 s or more. Both clips are cut to the shared stretch, so position in the track is "
            "equal and only the encoding differs. `Uncut` is the same pairs as whole previews.", ""]
    out += t(EFFECT_HEAD + ["Uncut: cosine / probe / other-store neighbours"],
             [effect_row(lab(v), x) + [f"{f(al['unaligned_same_pairs'][v]['same_track'])} / {f(al['unaligned_same_pairs'][v]['auc'])} / "
                                       f"{pc(al['unaligned_same_pairs'][v]['share_other_albums'])}"] for v, x in al["variants"].items()])

    out += ["## 7. The fix applied to one store's clips only", "",
            "One store's clips through the variant, the other store's as they are in the catalog now.", ""]
    rows = []
    for v in V:
        if v == "base":
            continue
        a, c = one[f"itunes_{v}__deezer_base"], one[f"deezer_{v}__itunes_base"]
        rows.append([lab(v), f(a["same_track"]), f(a["auc"]), f"{pc(a['share_other_albums'])} ({pc(a['deezer_seeds'])} / {pc(a['itunes_seeds'])})",
                     f(c["same_track"]), f(c["auc"]), pc(c["share_other_albums"])])
    out += t(["Variant", "iTunes clips only: same-track cosine", "Probe AUC", "Other-store neighbours (Deezer / iTunes seeds)",
              "Deezer clips only: same-track cosine", "Probe AUC", "Other-store neighbours"], rows)

    out += ["## 8. Corrections on the vectors (no audio fetched again)", "",
            "Fitted on these clips, so descriptive; the maps are fitted on the pairs of other albums (five folds). A probe AUC under 0.5 is what a "
            "cross-validated probe gives once the two means are made equal, not a signal.", ""]
    out += t(["Correction", "Same-track cosine", "Probe AUC", "Top 1", "Other-store neighbours (Deezer / iTunes seeds)"],
             [[k, f(x["same_track"]), f(x["auc"]), pc(x["top1"]), f"{pc(x['share_other_albums'])} ({pc(x['deezer_seeds'])} / {pc(x['itunes_seeds'])})"]
              for k, x in res["vector_corrections"].items()])
    out += ["Centring each store helps less than the audio fixes, as over the catalog (`source_effect.md`, section 6). The ridge map is the new one: it is fitted on "
            "pairs, which the catalog-level corrections could not be, and on held-out pairs it does about as well as the stereo round trip. Not tried on the catalog.", ""]

    if res.get("effnet"):
        e, c = res["effnet"]["base"], res["effnet"]["clap_base_same_pairs"]
        out += ["## 9. Discogs-EffNet on the same clips (baseline only)", "",
                f"{res['effnet']['n_pairs']} pairs, embedded by the fetcher with the pipeline's own decode and model (`rmr_audio.embed`). EffNet listens at 16 kHz. "
                "The preprocessing variants were not run through EffNet (it lives in another environment, and low-passing above 8 kHz cannot change its input).", ""]
        out += t(["Model"] + EFFECT_HEAD[1:], [effect_row("EffNet", e)[0:1] + effect_row("EffNet", e)[1:], effect_row("CLAP, as it is", c)])

    out += ["## 10. YouTube as a third source", ""]
    if yt.get("variants"):
        a = yt["audio"]
        out += [f"{yt['links_checked']} YouTube links of the paired albums checked by metadata (`rmr_audio.fulllength.classify`): "
                + ", ".join(f"{k} {v}" for k, v in yt["class"].items()) + f". {yt['albums']} full albums fetched (audio-only stream, deleted after its windows were cut), "
                f"{yt['windows']} windows of 30 s (up to 6 an album, laid out by `rmr_audio.windows`). Codec: {a['codec']}, {a['sample_rate']} Hz, "
                f"{q3(a['bit_rate_kbps_q10_50_90'])} kbit/s; highest band above -100 dBFS {q3(a['cutoff_hz_q10_50_90'])} Hz; loudness {q3(a['lufs_q10_50_90'])} LUFS.", "",
                "Probe: YouTube windows against one store's clips of the same albums (album-grouped folds). The windows are other parts of the album than the "
                "previews, so a probe can also learn what differs between an album's tracks; `floor` is the same probe on the YouTube windows split at random "
                "in two. Retrieval: the album's mean YouTube vector against the mean store vector of every album in the sample. Reference: one store clip "
                "against the means of the album's other clips (other tracks), same store and other store, for the same albums.", ""]
        rows = []
        for v, x in yt["variants"].items():
            rd, ri = x["album_retrieval_deezer"], x["album_retrieval_itunes"]
            rows.append([lab(v), f(x["youtube_vs_deezer_auc"]), f(x["youtube_vs_itunes_auc"]), f(x["itunes_vs_deezer_auc_same_albums"]), f(x["floor_random_split_of_youtube_auc"]),
                         f"{pc(rd['top1'])} / {pc(rd['top5'])}", f"{pc(ri['top1'])} / {pc(ri['top5'])}",
                         f"{pc(x['reference_deezer_clip_vs_deezer_rest']['top1'])} / {pc(x['reference_itunes_clip_vs_deezer_rest']['top1'])}",
                         f"{pc(x['neighbours']['youtube_seeds_youtube_share'])} ({pc(x['neighbours']['expected'])})"])
        out += t(["Variant", "YouTube vs Deezer AUC", "YouTube vs iTunes AUC", "iTunes vs Deezer, same albums", "Floor",
                  "Own album among Deezer means, top 1 / top 5", "Among iTunes means", "Reference top 1: Deezer clip vs Deezer rest / iTunes clip vs Deezer rest",
                  "YouTube windows' neighbours that are YouTube (expected)"], rows)
    else:
        out += [yt.get("note") or "Not run: the job was stopped before the YouTube part. `store_effect_fix.py run` does it after the previews.", ""]

    out += ["## What this means in practice", "",
            f"- A fix on the audio means embedding again, and since audio is never stored, downloading again. The stereo round trip touches only the iTunes-sourced "
            f"clips: {ITUNES_CLIPS:,} of the {STORE_CLIPS:,} store-preview clips `source_effect.md` counts (31%), so about a third of the roughly {CLIPS_IN_CATALOG:,} "
            "clips a full re-embed would fetch. The Deezer clips and their vectors stay. In the recipe (`experiments/preview_features/clap_catalog.py`, "
            "and the one-pass worker that calls it): when the clip's source is iTunes, after ffmpeg has decoded the preview and before the channels are averaged, "
            "pass the decoded stereo signal through `ffmpeg -c:a libmp3lame -b:a 128k` and decode it again (pipes, no file: `store_effect_dsp.mp3_stereo`), "
            "then (L+R)/2 and everything else as now. Deezer clips: no change.",
            "- The low-pass alternative is one line for every clip (`store_effect_dsp.lowpass(x, 12000)` on the 44.1 kHz mono signal before `embed`), but it has to be "
            f"applied to both stores, which means all {CLIPS_IN_CATALOG:,} previews downloaded and embedded again, and it leaves more of the store in the vectors.",
            "- Before either: the ridge map of section 8 can be tried on the stored vectors at no cost in downloads. If it holds on the catalog, no audio is needed.",
            "- Full-length sources (YouTube, Bandcamp, local files) are a third encoding, milder. The round trip was not tested on them; the low-pass was, and helps.",
            "- Whichever is chosen: the PCA block is refitted afterwards, and `source_effect.py`'s neighbour table (share of iTunes neighbours for Deezer seeds against "
            "the genre's make-up) is the check on the catalog itself.", ""]

    out += ["## What could not be tested", "",
            "- **How the lists sound.** Everything here is vectors and proxies. The music-information columns say the variants keep most of the baseline's structure; "
            "they do not say the baseline's structure was right.",
            "- **The mechanism inside the encoder.** The band is located (12 to 14 kHz as CLAP sees it) and the stereo MP3 round trip reproduces the effect; which "
            "encoder decision does it (joint stereo, the bit reservoir, a psychoacoustic cut that moves from frame to frame) was not taken apart.",
            "- **Deezer's encoder is not ours.** The round trip uses ffmpeg's libmp3lame at its defaults. It lands close to Deezer's files on these pairs; it is not "
            "known to be the same encoder or settings, and Deezer may change theirs.",
            "- **The catalog itself.** These are pairs: the same track from both stores. In the catalog an album comes from one store, and iTunes-only albums "
            "are a different population (other storefronts, other eras). The fix has to be checked there after re-embedding.",
            "- **EffNet under the variants**, and the aligned set under `mp3st` (that variant needs the stereo file; the aligned cut is made on the mono signal).",
            "- **Sampling.** Albums with a YouTube link were preferred in half the draws; pairs need equal titles and durations, which leaves out albums whose "
            "listings differ (other editions, live albums with venue names in the titles). No listening confirmed that paired tracks are the same recording, but "
            "the waveform correlation does for the pairs it aligned.", "",
            "## What would change this reading", "",
            "- If, after re-embedding the iTunes clips through the round trip, Deezer seeds in the catalog still got far fewer iTunes neighbours than their genre's "
            "make-up, the pairs would not have carried over and something besides encoding separates the two populations.",
            "- If a different MP3 encoder or bitrate on the iTunes side closed the gap equally well or better, the claim narrows from Deezer's encoding to "
            "any low-bitrate stereo MP3.",
            "- If a listener found that the round-tripped or low-passed lists were worse, the proxies in section 5 missed what CLAP's top bands were good for.",
            "- If a larger sample showed pairs with an offset of 20 s or more behaving differently, the excerpt would matter for those albums (here the cut pairs and "
            "the whole previews agree).", "",
            "## Reproduce", "", "```", "cd experiments/audio_10k",
            "PYTHONDONTWRITEBYTECODE=1 nice -n 19 <.venv-torch python> store_effect_fix.py run --fetch-python <.venv-audio python> --albums 120 --youtube 25",
            "PYTHONDONTWRITEBYTECODE=1 <build .venv python (scikit-learn, scipy)> store_effect_fix.py report", "```", "",
            "The first resumes from `cache/store_effect_fix.sqlite` (gitignored: embeddings and measurements, no audio). Run it on mains power: the laptop sleeps "
            "on battery and the stores' connections do not survive it.", ""]
    return "\n".join(out)
