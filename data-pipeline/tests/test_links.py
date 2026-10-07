import pytest

from rmr_pipeline.links import LINK_COLUMNS, LINK_REF_RE, album_links, link_ref, link_url

GOOD = {
    "am": [("https://music.apple.com/us/album/ok-computer/1097861387", "us/1097861387"),
           ("https://music.apple.com/jp/album/%E9%A2%A8%E8%A1%97/1440858337?l=en", "jp/1440858337"),
           ("https://music.apple.com/br/album/acabou-chorare-édição/592438322", "br/592438322"),
           ("https://music.apple.com/gb/album/1097861387", "gb/1097861387")],
    "bc": [("https://magdalenabay.bandcamp.com/album/imaginal-disk", "magdalenabay.bandcamp.com/album/imaginal-disk"),
           ("https://yayayi.bandcamp.com/album/yayayi?from=embed", "yayayi.bandcamp.com/album/yayayi"),
           ("https://music.sufjan.com/album/illinois", "music.sufjan.com/album/illinois"),
           ("https://eyevyberecords.com/album/--2", "eyevyberecords.com/album/--2"),
           ("https://someone.bandcamp.com/track/one-song/", "someone.bandcamp.com/track/one-song")],
    "dz": [("https://www.deezer.com/album/14879699", "14879699"),
           ("https://www.deezer.com/en/album/14879699?utm=x", "14879699")],
    "yt": [("https://www.youtube.com/watch?v=zdPCt5ZEf40", "zdPCt5ZEf40"),
           ("https://www.youtube.com/watch?list=PL1&v=mnjH-ZYe59c&t=3", "mnjH-ZYe59c"),
           ("https://youtu.be/mnjH-ZYe59c", "mnjH-ZYe59c")],
    "sc": [("https://soundcloud.com/radiohead/sets/ok-computer-3", "radiohead/sets/ok-computer-3"),
           ("https://soundcloud.com/fishmans-music/long-season", "fishmans-music/long-season"),
           ("https://soundcloud.com/2814music/dreamcd_1?si=abc", "2814music/dreamcd_1")],
}
BAD = {
    "am": ["https://music.apple.com/us/artist/radiohead/657515", "https://itunes.apple.com/us/album/x/1", "us/1"],
    "bc": ["https://magdalenabay.bandcamp.com", "https://magdalenabay.bandcamp.com/music",
           "http://magdalenabay.bandcamp.com/album/x", "https://user:pw@evil.example/album/x",
           "https://host.example:8080/album/x", "https://bandcamp.com/album/a b"],
    "dz": ["https://www.deezer.com/artist/399", "https://www.deezer.com/album/abc", "https://deezer.page.link/xyz"],
    "yt": ["https://www.youtube.com/playlist?list=PL123", "https://www.youtube.com/watch?v=short",
           "https://www.youtube.com/watch?v=zdPCt5ZEf40x"],
    "sc": ["https://soundcloud.com/radiohead", "https://soundcloud.com/a/b/c/d", "https://on.soundcloud.com/abc",
           "https://soundcloud.com/a/../b"],
}


def test_the_services_and_their_catalog_columns():
    assert LINK_COLUMNS == {"am": "apple_music_url", "bc": "bandcamp_url", "dz": "deezer_url", "yt": "youtube_url",
                            "sc": "soundcloud_url"}
    assert set(LINK_REF_RE) == set(LINK_COLUMNS)


@pytest.mark.parametrize("service,url,ref", [(s, u, r) for s, pairs in GOOD.items() for u, r in pairs])
def test_a_link_becomes_its_ref_and_the_ref_a_url(service, url, ref):
    assert link_ref(service, url) == ref
    assert LINK_REF_RE[service].match(ref)
    assert link_ref(service, link_url(service, ref)) == ref  # the URL form reads back as the same ref


@pytest.mark.parametrize("service,url", [(s, u) for s, urls in BAD.items() for u in urls])
def test_a_link_of_another_form_has_no_ref(service, url):
    assert link_ref(service, url) == ""
    assert link_ref(service, "") == ""


def test_the_url_forms():
    assert link_url("am", "us/1097861387") == "https://music.apple.com/us/album/1097861387"
    assert link_url("bc", "magdalenabay.bandcamp.com/album/imaginal-disk") == "https://magdalenabay.bandcamp.com/album/imaginal-disk"
    assert link_url("dz", "14879699") == "https://www.deezer.com/album/14879699"
    assert link_url("yt", "zdPCt5ZEf40") == "https://www.youtube.com/watch?v=zdPCt5ZEf40"
    assert link_url("sc", "radiohead/sets/ok-computer-3") == "https://soundcloud.com/radiohead/sets/ok-computer-3"
    with pytest.raises(ValueError, match="spotify"):
        link_url("spotify", "x")
    with pytest.raises(ValueError, match="not a dz ref"):
        link_url("dz", "14879699/../x")


def test_album_links_keeps_what_parses_in_service_order_and_names_the_rest():
    row = {"apple_music_url": "https://music.apple.com/us/album/ok-computer/1097861387",
           "bandcamp_url": "https://magdalenabay.bandcamp.com/music",
           "deezer_url": "", "youtube_url": "https://www.youtube.com/watch?v=zdPCt5ZEf40",
           "soundcloud_url": "https://soundcloud.com/radiohead/sets/ok-computer-3"}
    links, odd = album_links(row)
    assert links == {"am": "us/1097861387", "yt": "zdPCt5ZEf40", "sc": "radiohead/sets/ok-computer-3"}
    assert list(links) == ["am", "yt", "sc"]
    assert odd == [("bc", "https://magdalenabay.bandcamp.com/music")]
    assert album_links({}) == ({}, [])  # a catalog without the link columns
    assert album_links({"deezer_url": "  "}) == ({}, [])
