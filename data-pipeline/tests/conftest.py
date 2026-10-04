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
    from rmr_pipeline.audio import audio_block
    from rmr_pipeline.audio_store import site_store

    return audio_block(deduped[0], site_store())  # the store the site build reads (audio_store.SITE_MODEL)


@pytest.fixture(scope="session")
def site_recs(deduped, audio):
    from rmr_pipeline.recs import build_recs

    return build_recs(deduped[0], audio.block)
