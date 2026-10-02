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

    return audio_block(deduped[0])
