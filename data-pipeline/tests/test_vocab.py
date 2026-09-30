from rmr_pipeline.constants import LYRIC_DROP, NON_MOOD
from rmr_pipeline.vocab import build_vocab


def test_vocab_size_and_exclusions(deduped):
    sub, _ = deduped
    vocab, tops = build_vocab(sub)
    assert len(vocab) == 114
    assert len(set(vocab)) == 114
    assert not (set(vocab) & set(LYRIC_DROP))
    assert not (set(vocab) & NON_MOOD)
    assert vocab[:3] == ["melodic", "energetic", "passionate"]
    assert len(tops) == len(sub)


def test_in_rainbows_descriptors(deduped):
    sub, _ = deduped
    vocab, tops = build_vocab(sub)
    assert [vocab[i] for i in tops[11][:6]] == ["lush", "melancholic", "bittersweet", "mellow", "atmospheric", "warm"]


def test_tops_are_bounded_and_unique(deduped):
    sub, _ = deduped
    vocab, tops = build_vocab(sub)
    for row in tops:
        assert len(row) <= 10
        assert len(set(row)) == len(row)
        assert all(0 <= i < len(vocab) for i in row)
