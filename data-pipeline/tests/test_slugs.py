from rmr_pipeline.slugs import MAX_SLUG_BYTES, kebab, make_slugs


def test_kebab_basics():
    assert kebab("In Rainbows") == "in-rainbows"
    assert kebab("good kid, m.A.A.d city") == "good-kid-m-a-a-d-city"
    assert kebab("Sgt. Pepper's Lonely Hearts Club Band") == "sgt-peppers-lonely-hearts-club-band"
    assert kebab("Sgt. Pepper’s") == "sgt-peppers"
    assert kebab("The Velvet Underground & Nico") == "the-velvet-underground-and-nico"


def test_kebab_folds_accents_and_scripts():
    assert kebab("Björk") == "bjork"
    assert kebab("Måltid") == "maltid"
    assert kebab("Korowód") == "korowod"
    assert kebab("Sigur Rós") == "sigur-ros"
    assert kebab("Øresund Æther Straße") == "oresund-aether-strasse"
    assert kebab("Группа крови") == "gruppa-krovi"
    assert kebab("98.12.28 男達の別れ (98.12.28 Otokotachi no Wakare)") == "98-12-28-98-12-28-otokotachi-no-wakare"
    assert kebab("( )") == ""


def test_make_slugs_title_then_artist_with_numeric_suffix():
    assert make_slugs(["In Rainbows"], ["Radiohead"]) == ["in-rainbows-radiohead"]
    assert make_slugs(["( )"], ["Sigur Rós"]) == ["sigur-ros"]
    assert make_slugs(["Same", "Same", "Same"], ["X", "X", "X"]) == ["same-x", "same-x-2", "same-x-3"]
    assert make_slugs(["男"], ["男"]) == ["album"]


def test_make_slugs_is_stable():
    t = ["A", "B", "A"]
    a = ["Z", "Z", "Z"]
    assert make_slugs(t, a) == make_slugs(t, a) == ["a-z", "b-z", "a-z-2"]


# --- the cap of a catalog build's new albums (MAX_SLUG_BYTES): a slug is a file name on the host ---

def _words(n, word="word"):
    return " ".join(f"{word}{i}" for i in range(n))


def test_the_cap_is_off_unless_asked_for():
    long_title, long_artist = _words(40), _words(30, "name")
    bare = make_slugs([long_title], [long_artist])
    assert bare == [f"{kebab(long_title)}-{kebab(long_artist)}"] and len(bare[0]) > MAX_SLUG_BYTES
    assert make_slugs([long_title], [long_artist], cap_from=None) == bare


def test_a_new_albums_long_slug_is_cut_at_word_boundaries_with_a_share_for_each_part():
    long_title, long_artist = _words(40), _words(30, "name")
    (slug,) = make_slugs([long_title], [long_artist], cap_from=0)
    assert len(slug) <= MAX_SLUG_BYTES and "--" not in slug and not slug.endswith("-")
    # whole words of the title (at most 80 characters), then whole words of the artist in what is left
    title = "-".join(f"word{i}" for i in range(13))  # 13 words are 80 characters, a 14th would make 87
    artist = "-".join(f"name{i}" for i in range(6))  # 6 words are 35 of the 39 left, a 7th would make 41
    assert slug == f"{title}-{artist}" and len(title) == 80 and len(slug) == 116


def test_a_short_part_leaves_its_room_to_the_other():
    (slug,) = make_slugs([_words(40)], ["Cap'n Jazz"], cap_from=0)
    assert slug.endswith("-capn-jazz") and 110 < len(slug) <= MAX_SLUG_BYTES
    assert kebab(_words(40)).startswith(slug[:-len("-capn-jazz")] + "-")
    (slug,) = make_slugs(["Blue"], [_words(40, "name")], cap_from=0)
    assert slug.startswith("blue-name0-") and 110 < len(slug) <= MAX_SLUG_BYTES and not slug.endswith("-")
    assert kebab(_words(40, "name")).startswith(slug[len("blue-"):] + "-")
    # a part alone (the other has nothing a slug can hold) has the whole cap
    (slug,) = make_slugs([_words(40)], ["男"], cap_from=0)
    assert 110 < len(slug) <= MAX_SLUG_BYTES and kebab(_words(40)).startswith(slug + "-")


def test_a_slug_within_the_cap_is_left_alone():
    title, artist = "a" * 100, "b" * 19  # 120 characters with the hyphen
    assert make_slugs([title], [artist], cap_from=0) == [f"{title}-{artist}"]
    assert make_slugs(["In Rainbows"], ["Radiohead"], cap_from=0) == ["in-rainbows-radiohead"]


def test_a_single_overlong_word_is_cut_inside_the_word():
    (slug,) = make_slugs(["x" * 300], ["Radiohead"], cap_from=0)
    assert slug == "x" * 110 + "-radiohead" and len(slug) == MAX_SLUG_BYTES
    (slug,) = make_slugs(["x" * 300], ["y" * 300], cap_from=0)
    assert slug == "x" * 80 + "-" + "y" * 39
    (slug,) = make_slugs(["Blue"], ["y" * 300], cap_from=0)
    assert slug == "blue-" + "y" * 115
    # only the word that does not fit by itself is cut: a word after a short one is dropped whole
    (slug,) = make_slugs(["Ok " + "x" * 300], ["Radiohead"], cap_from=0)
    assert slug == "ok-radiohead"


def test_collisions_under_the_cap_get_their_suffix_within_it():
    long_title, long_artist = _words(40), _words(30, "name")
    slugs = make_slugs([long_title] * 12, [long_artist] * 12, cap_from=0)
    assert len(set(slugs)) == 12 and all(len(s) <= MAX_SLUG_BYTES for s in slugs)
    assert slugs[1] == slugs[0] + "-2" and slugs[11] == slugs[0] + "-12"
    # a slug that fills the cap gives up whole words for its suffix
    title, artist = "a" * 100, "b" * 19
    full = f"{title}-{artist}"
    assert make_slugs([title] * 3, [artist] * 3, cap_from=0) == [full, f"{title}-2", f"{title}-3"]
    # a single word that fills the cap is cut for it
    one = make_slugs(["x" * 300] * 11, [""] * 11, cap_from=0)
    assert one[:2] == ["x" * 120, "x" * 118 + "-2"] and one[10] == "x" * 117 + "-11"
    # two long albums that differ only after the cut
    assert make_slugs([long_title + " one", long_title + " two"], [long_artist] * 2, cap_from=0) == [slugs[0], slugs[0] + "-2"]
    # a later album whose own slug is the one a cut made
    assert make_slugs([long_title, "word0"], [long_artist, "x"], cap_from=0)[1] == "word0-x"
    cut_title, cut_artist = slugs[0][:80], slugs[0][81:]
    assert make_slugs([long_title, cut_title], [long_artist, cut_artist], cap_from=0) == [slugs[0], slugs[0] + "-2"]


def test_the_albums_before_cap_from_keep_their_slugs():
    long_title, long_artist = _words(40), _words(30, "name")
    bare = make_slugs([long_title], [long_artist])[0]
    slugs = make_slugs([long_title, "Same", long_title, "Same", long_title], [long_artist, "X", long_artist, "X", long_artist],
                       cap_from=3)
    assert slugs[:3] == [bare, "same-x", bare + "-2"]  # existing albums: as long as they are, suffixed as before
    capped = make_slugs([long_title], [long_artist], cap_from=0)[0]
    assert slugs[3:] == ["same-x-2", capped]
    # and the existing albums are numbered before any new one, whatever the new ones are
    assert make_slugs(["Same", "Same"], ["X", "X"], cap_from=1) == ["same-x", "same-x-2"]


def test_the_real_catalogs_new_slugs_are_within_the_cap_and_the_sites_are_the_committed_ones(deduped):
    import json

    from rmr_pipeline.artists import clean_artist
    from rmr_pipeline.catalog import catalog_frame, load_catalog
    from rmr_pipeline.constants import DEFAULT_OUT

    site = json.loads((DEFAULT_OUT / "albums.json").read_text(encoding="utf-8"))
    n_site = len(deduped[0])
    assert n_site == len(site) == 4081
    cat = catalog_frame(deduped[0], load_catalog())
    artists = [clean_artist(a) for a in deduped[0]["Artist"].astype(str)] + cat.slug_artists[n_site:]
    bare = make_slugs(cat.slug_titles, artists)
    slugs = make_slugs(cat.slug_titles, artists, cap_from=n_site)
    assert len(slugs) == len(set(slugs)) > 10000
    assert slugs[:n_site] == bare[:n_site]
    # the committed slugs, but for the albums whose artist overrides.json corrects after this step
    moved = [i for i in range(n_site) if slugs[i] != site[i]["slug"]]
    overrides = json.loads((DEFAULT_OUT.parents[2] / "data-pipeline" / "overrides.json").read_text(encoding="utf-8"))
    assert {slugs[i] for i in moved} == {k for k, e in overrides.items() if "a" in e}
    assert max(len(s["slug"].encode()) for s in site) == 151  # the longest of the existing ones; they are not cut
    assert max(len(s.encode()) for s in slugs[n_site:]) <= MAX_SLUG_BYTES
    changed = [i for i in range(n_site, len(slugs)) if slugs[i] != bare[i]]
    assert len(changed) == 17 and all(len(bare[i]) > MAX_SLUG_BYTES for i in changed)
    assert max(len(s) for s in bare) == 245  # Salvatore Sciarrino: over the host's 233 for `<slug>.prerender-config.json`
