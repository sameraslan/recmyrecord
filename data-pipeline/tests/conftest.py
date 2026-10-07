import pytest

from rmr_pipeline.table import dedupe_table, load_table


@pytest.fixture(scope="session")
def table():
    return load_table()


@pytest.fixture(scope="session")
def deduped(table):
    return dedupe_table(table)


@pytest.fixture(scope="session")
def audio(deduped):
    """The feature table's albums on data-pipeline/audio, imputed: the block of a --no-catalog build, and what
    the site was built from until the switch to the 10k catalog (6 October 2026). The tests that use it are
    about that store and the mechanics of the block; the site's own block is `catalog_audio`."""
    from rmr_pipeline.audio import audio_block
    from rmr_pipeline.audio_store import DEFAULT_AUDIO

    return audio_block(deduped[0], DEFAULT_AUDIO)


@pytest.fixture(scope="session")
def site_recs(deduped, audio):
    """The lists of a --no-catalog build on data-pipeline/audio (see `audio`); the site's are `catalog_recs`."""
    from rmr_pipeline.recs import build_recs

    return build_recs(deduped[0], audio.block)


@pytest.fixture(scope="session")
def catalog_albums(deduped):
    """The site build's albums: every row of catalog/albums.csv, with the build's default flags."""
    from rmr_pipeline.catalog import DEFAULT_EXISTING, DEFAULT_WEIGHTS, catalog_frame, load_catalog

    return catalog_frame(deduped[0], load_catalog(), weights=DEFAULT_WEIGHTS, existing=DEFAULT_EXISTING)


@pytest.fixture(scope="session")
def catalog_audio(catalog_albums):
    """The site build's audio block: the store of audio_store.SITE_MODEL by RYM id, nothing imputed."""
    from rmr_pipeline.audio import audio_block
    from rmr_pipeline.audio_store import site_store

    return audio_block(catalog_albums.frame, site_store(), catalog_albums.keys, fill="mean")


@pytest.fixture(scope="session")
def catalog_recs(catalog_albums, catalog_audio):
    """The site build's lists, as recs.json holds them: {stop: rows}, [] for an album with no list there."""
    from rmr_pipeline.recs import build_recs, rec_lists

    recs = build_recs(catalog_albums.frame, catalog_audio.block, has_audio=catalog_audio.has_audio, mood_only=True)
    return {stop: rec_lists(rows) for stop, rows in recs.items()}
