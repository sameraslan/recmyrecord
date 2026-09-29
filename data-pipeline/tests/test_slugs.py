from rmr_pipeline.slugs import kebab, make_slugs


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
