# Trifid Theme Part 1: Theme Data and Gas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the real app the Trifid nebula gas: a build step that bakes the gas of each slider stop into a texture plus a small `theme.json`, a client loader for that data, the shared theme constants, and a three.js gas layer drawn behind the album points. Parts 2 (stars and region names) and 3 (chrome, CSS tokens, names toggle) build on the interfaces this part produces.

**Architecture:** The gas is baked at build time, not in the visitor's browser. `npm run theme` (a Node script) drives one headless Chromium on software WebGL, runs the prototype's field code and swirl shader (copied into `frontcreck/scripts/theme/`), and writes three 2048 x 2048 RGBA WebP files (RGB = toned gas, A = dust transmission) and `theme.json` into `frontcreck/public/data/theme/`, which are committed. Its inputs are two committed copies of the design analysis under `data-pipeline/theme/`, produced by a small additions-only Python module. At runtime the map loads `theme.json` beside the catalog, and `GasField` draws one world-space quad under the album points: it cross-fades two stop textures with the slider, applies the prototype's `finish()` (strength, dust, pool, dither), adds the detail octaves the bake could not hold, takes its glow from the bake's own mips, and past 32 px covers fades on to a faint, blurred, greyer remnant (the prototype's deep zoom). The map canvas does not redraw at rest. If the theme data is missing or stale the map still works with plain sky. Trifid replaces the current look: there is no theme switch, and nothing here is behind a flag.

**Tech Stack:** Node 22.23.3 (arm64), Next 16.3.8, React 19.3.0, three 0.186.1 through @react-three/fiber 9.8.1, zustand 5.0.15, TypeScript 6.0.3, Vitest 4.1.11 (jsdom), @playwright/test 1.63.0 (bundled Chromium, SwiftShader), sharp 0.35.5 (new exact devDependency; already in the lockfile as an optional dependency of Next). Python 3.11 with the pipeline's own virtualenv and pytest 9.1.1; the new module uses the standard library only.

**Spec:** docs/design/trifid-theme/HANDOFF.md (section "Current state: decisions made on 2026-10-04") and the section "Decisions made on 2026-10-04" of the overview, `docs/superpowers/plans/2026-10-04-trifid-theme.md`, which wins wherever the two differ. Tracking issue 45, pull request 47.

## Global Constraints

- Album positions never move: the gas, the pool and every helper here read positions, none writes them.
- The map canvas does not redraw at rest: every easing in this part (dim, pool) asks for another frame only while it is unsettled; no clock uniform exists in the gas shader, and the deep zoom values are a pure function of the camera. (Part 2's twinkle is DOM and CSS on a timer and never redraws the canvas; nothing in this part moves on a timer.)
- Snappiness is a core requirement: no effect may cost responsiveness. Measure each one. If it costs speed it is dropped or replaced by its cheaper version without asking the owner again, and he is told afterwards. The budgets in `frontcreck/scripts/perf/budgets.json` do not change.
- No regressions against the current site: the baseline screenshots, performance runs and regression checklist are in `docs/design/trifid-theme/reviews/baseline/` (`README.md`, `REGRESSION-CHECKLIST.md`, `BASELINE-PERF.md`, the raw output in `perf/`, the screenshots in `shots/desktop/` and `shots/phone/`, and the two scripts `capture.mjs` and `hover-measure.mjs`). Nothing in that folder is edited, with one exception in Task 6 Step 7 (the dpr 2 column of today's site is added to it). A number that got worse than baseline while still inside budget is a finding to explain or fix (the exact rule is in Task 6 Step 7).
- Text contrast 4.5:1: this part only supplies `ThemeLabel.lum` and `ThemeLabel.rgb` so part 2 can solve its halo; it draws no text.
- Covers stay legible, and deep zoom goes to space: gas strength falls to 0.6 by 22 px covers and 0.3 by 32 px, then keeps fading to a floor of 0.06 at 56 px covers and over, losing colour, detail and focus on the same ease (the owner's choice C, "Faint", `docs/design/trifid-theme/options/q-deep.jpg`). Dust is gone by 22 px.
- 44 px tap targets on phone: this part adds no control.
- Every star is an album: the gas layer draws no points; `stars.lead` (colour family) and `stars.bg` (gas brightness under the album) hold one entry per album. `theme.json` carries no star size, brightness class or rank: those are drawn at random on each page load in the browser (part 2) and never come from album order.
- Budgets (`frontcreck/scripts/perf/budgets.json`): at most one idle frame, 50 ms frame gap, 200 KB first-load JS, 250 ms startup long task, no idle long task. `GasField` is imported only from `canvas/Scene.tsx` and `shaders/gas.ts` only from `GasField` (the lazy map chunk). The baseline's first-load JS is 190.5 KB, so all three parts together have 9.5 KB of room.
- Copy rules: never show the owner's name, the only catalogue number is "4,000+", never a number of recommendations, mood words are "handpicked", no dashes or emoji. This covers READMEs, code comments and test titles written here. Any new wording that a visitor can see needs the owner's approval. The region names in `data-pipeline/theme/regions.json` are such wording: the owner approved them on 2026-10-04 exactly as listed in the overview (17 on Balanced, 7 on Sonic, 6 on Mood; `docs/design/trifid-theme/prototype/COPY.md` still calls them placeholder, the overview wins). Nothing is added to that list, and a new or changed name needs approval again. The two README texts written here (Task 1 Step 6 and Task 3 Step 12) are new prose in a public repository and are listed for the owner's read through before the pull request leaves draft.
- Machine rules: every shell that runs `node`, `npm` or `npx` starts with `export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"` and `node -p process.arch` must print `arm64`. One browser at a time, never in parallel: Playwright runs carry `--workers=1` (the config default is 2). Jobs run one after the other, never side by side: one heavy job at a time, no watch modes.
- Existing site data and pipeline files are not edited: `frontcreck/public/data/albums.json`, `positions.json`, `recs.json`, and `data-pipeline/rmr_pipeline/validate.py`, `constants.py`, `build.py` (open PRs 25 and 31 change some of them). The theme only adds files beside them. The new Python module only reads `constants.py` and `io.py`.
- Production code never imports from `docs/`. The prototype is the reference; the code is copied.
- The gas textures hold data in the alpha channel. They are never drawn through a 2D canvas and never decoded with premultiplied alpha.
- Paths are relative to the worktree root unless a command starts with `cd`.
- Commits: at least one per task, conventional message, then a blank line, `Refs #45`, a blank line and the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit, do not push. A push to this branch makes Vercel build a preview deployment, so commits that change anything under `frontcreck/` or `data-pipeline/` are not pushed until the owner says yes (part 3 Task 11 asks). Commits that touch only documents may be pushed. Never open a PR, never merge, never deploy.

## Review Focus

The five failure modes most likely to bite that an ordinary task test would miss. Each is pinned by a test in the task named.

1. **`theme.json` missing, wrongly shaped or stale against `positions.json`.** Runtime: Task 2 (`loadTheme` rejects, `themeFor` drops a theme built for another album count) and Task 6 (e2e: a 404 leaves a working map with `gas === 'off'`). Build: Task 3 (`theme.data.test.ts` compares `n` and `positionsHash` with the committed data) and Task 1 (`--check` compares the input hashes).
2. **WebGL context loss and restore.** three rebuilds its GL state on restore and uploads textures again from their images, so the gas bitmaps are kept alive and marked for upload. Task 6 loses and restores the context in a real browser and checks the gas is back.
3. **`MAX_TEXTURE_SIZE` under 2048.** WebGL2 guarantees 2048, so this should not occur, but a smaller limit would make three resize through a 2D canvas and corrupt the dust channel. Task 4 pins `gasTextureFits`, Task 5 turns the gas off when it is false, Task 3 makes the bake refuse to run.
4. **Slider moved before the second stop's texture has loaded.** Task 4 pins `gasPair` (falls back to a loaded stop, never to an empty sampler); Task 6 holds one texture back in a real browser and moves the slider.
5. **The `nowebgl` Playwright project.** Without WebGL no theme file may be requested and nothing may throw. Task 6 extends `e2e/nowebgl.spec.ts`.

---

### Task 1: Theme inputs from the design analysis (Python, additions only)

**Files:**
- Create: `data-pipeline/rmr_pipeline/theme.py`
- Create: `data-pipeline/tests/test_theme.py`
- Create (generated by the module, committed): `data-pipeline/theme/weights.json`, `data-pipeline/theme/regions.json`
- Create: `data-pipeline/theme/README.md`

**Interfaces:**
- Consumes: `docs/design/trifid-theme/regions/colour.json` (`family_order`, `album_weights`: one row of six shares per album, in `albums.json` order), `docs/design/trifid-theme/regions/regions.json` (17 hand-made Balanced regions), `docs/design/trifid-theme/scaling/out/regions_all.json` (automated regions per stop), `frontcreck/public/data/albums.json`, `frontcreck/public/data/positions.json`; `rmr_pipeline.constants` (`DEFAULT_OUT`, `PIPELINE_DIR`, `REPO`, `STOPS`) and `rmr_pipeline.io.write_json`, both read only.
- Produces:
  - `data-pipeline/theme/weights.json`: `{"n": int, "families": ["fierce","warm","quiet","dark","urban","neutral"], "slugsHash": str, "weights": [6n ints 0..100]}`.
  - `data-pipeline/theme/regions.json`: `{"positionsHash": str, "sonic": [Region], "balanced": [Region], "mood": [Region]}` with `Region = {"id","name","word","strength","level","n","priority","cx","cy","radius"}`, named level-1 regions only (7, 17 and 6 today).
  - Hash rule shared with Task 3: first 12 hex characters of SHA-256. `positionsHash` is over the bytes of `positions.json`; `slugsHash` is over the album slugs joined with `"\n"`, UTF-8.
  - CLI: `python -m rmr_pipeline.theme` writes both files; `python -m rmr_pipeline.theme --check` validates the committed files and exits 1 with one line per problem.

- [ ] **Step 1: Make sure the pipeline virtualenv exists**

This worktree has no `data-pipeline/.venv` (the test `conftest.py` imports pandas, so the full requirements are needed). Create it as `data-pipeline/README.md` says; skip if it already exists.

```bash
test -x data-pipeline/.venv/bin/python || { python3.11 -m venv data-pipeline/.venv && data-pipeline/.venv/bin/pip install -r data-pipeline/requirements.txt; }
data-pipeline/.venv/bin/python -c "import pytest, pandas; print('ok')"
```

Expected: `ok`.

- [ ] **Step 2: Write the failing tests**

Create `data-pipeline/tests/test_theme.py`:

```python
import json

import pytest

from rmr_pipeline import theme
from rmr_pipeline.constants import DEFAULT_OUT

ALBUMS = [{"slug": "a"}, {"slug": "b"}]
COLOUR = {
    "family_order": theme.FAMILIES,
    "album_weights": [[0.15, 0.23, 0.0, 0.39, 0.0, 0.23], [0.0, 0.59, 0.08, 0.15, 0.0, 0.18]],
}
HAND = {"regions": [
    {"id": "live", "name_space": "The Live Belt", "strength": "strong", "n": 174,
     "name_evidence": {"feature": "liveness", "z": 3.17}, "cx": -0.236, "cy": 0.883, "radius": 0.105},
    {"id": "pastoral", "name_space": "Pastoral Nebula", "strength": "fair", "n": 226,
     "name_evidence": {"word": "pastoral", "coverage": 0.5, "max_other_region": 0.2}, "cx": 0.065, "cy": -0.321,
     "radius": 0.117},
]}
AUTO_STOP = {
    "album_region": [1, 1, 2, -1],
    "regions": [
        {"id": "area-heavy", "level": 0, "name": None, "word": "heavy", "strength": "strong", "n": 965,
         "priority": 12.9144, "cx": -0.691, "cy": 0.367, "radius": 0.35},
        {"id": "urban", "level": 1, "name": "Urban Cluster", "word": "urban", "strength": "strong", "n": None,
         "priority": 2.35221, "cx": 0.53111, "cy": 0.463, "radius": 0.102},
        {"id": "lush", "level": 1, "name": None, "word": "lush", "strength": "strong", "n": 54,
         "priority": 2.0878, "cx": 0.331, "cy": 0.022, "radius": 0.068},
    ],
}


def test_pack_weights_makes_flat_integer_shares_in_album_order():
    assert theme.pack_weights(COLOUR, ALBUMS) == {
        "n": 2,
        "families": ["fierce", "warm", "quiet", "dark", "urban", "neutral"],
        "slugsHash": theme.slugs_hash(ALBUMS),
        "weights": [15, 23, 0, 39, 0, 23, 0, 59, 8, 15, 0, 18],
    }


def test_pack_weights_rejects_a_table_for_another_album_count():
    with pytest.raises(ValueError, match="2 weight rows but albums.json has 3 albums"):
        theme.pack_weights(COLOUR, ALBUMS + [{"slug": "c"}])


def test_pack_weights_rejects_rows_that_do_not_sum_to_one():
    bad = {**COLOUR, "album_weights": [[0.5, 0.2, 0.0, 0.0, 0.0, 0.0], COLOUR["album_weights"][1]]}
    with pytest.raises(ValueError, match="weights row 0"):
        theme.pack_weights(bad, ALBUMS)


def test_hand_balanced_keeps_every_region_with_the_prototype_priority():
    live, pastoral = theme.hand_balanced(HAND)
    assert live == {"id": "live", "name": "The Live Belt", "word": "liveness", "strength": "strong", "level": 1,
                    "n": 174, "priority": 2.1772, "cx": -0.236, "cy": 0.883, "radius": 0.105}
    # fair: 1 + 226 / 1000 + (0.5 - 0.2) / 100
    assert pastoral["priority"] == 1.229
    assert tuple(pastoral) == theme.REGION_KEYS


def test_auto_named_drops_broad_areas_and_regions_without_a_place_name():
    assert theme.auto_named(AUTO_STOP) == [
        {"id": "urban", "name": "Urban Cluster", "word": "urban", "strength": "strong", "level": 1, "n": 2,
         "priority": 2.3522, "cx": 0.5311, "cy": 0.463, "radius": 0.102},
    ]


def test_validate_names_every_stale_or_broken_input():
    weights = theme.pack_weights(COLOUR, ALBUMS)
    regions = {"positionsHash": theme.short_hash(b"positions"), "sonic": theme.auto_named(AUTO_STOP),
               "balanced": theme.hand_balanced(HAND), "mood": theme.auto_named(AUTO_STOP)}
    assert theme.validate(weights, regions, ALBUMS, b"positions") == []
    errors = theme.validate({**weights, "weights": weights["weights"][:-1] + [90]},
                            {**regions, "mood": []}, list(reversed(ALBUMS)), b"moved")
    assert any("do not sum to about 100" in e for e in errors)
    assert any("slugsHash does not match albums.json" in e for e in errors)
    assert any("positionsHash does not match positions.json" in e for e in errors)
    assert any("mood has no regions" in e for e in errors)


def test_committed_inputs_match_the_site_data():
    assert theme.check() == []


def test_committed_regions_are_the_named_ones_of_each_stop():
    regions = json.loads((theme.THEME_DIR / "regions.json").read_text(encoding="utf-8"))
    assert [len(regions[s]) for s in ("sonic", "balanced", "mood")] == [7, 17, 6]
    albums = json.loads((DEFAULT_OUT / "albums.json").read_text(encoding="utf-8"))
    weights = json.loads((theme.THEME_DIR / "weights.json").read_text(encoding="utf-8"))
    assert weights["n"] == len(albums)
```

- [ ] **Step 3: Run the tests to see them fail**

```bash
cd data-pipeline && .venv/bin/python -m pytest tests/test_theme.py
```

Expected: collection error, `ImportError: cannot import name 'theme' from 'rmr_pipeline'`.

- [ ] **Step 4: Write the module**

Create `data-pipeline/rmr_pipeline/theme.py`:

```python
"""CLI: python -m rmr_pipeline.theme [--check]

Copies what the map theme needs out of the design analysis in docs/design/trifid-theme/ into
data-pipeline/theme/ (weights.json, regions.json) and checks both against the site's data files.
The site's theme build (frontcreck: npm run theme) reads only those two copies.

Not called by rmr_pipeline.build: the design analysis is not reproducible from the feature table yet,
so these files are refreshed by hand whenever albums.json or positions.json change (see theme/README.md).
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

from .constants import DEFAULT_OUT, PIPELINE_DIR, REPO, STOPS
from .io import write_json

DESIGN_DIR = REPO / "docs" / "design" / "trifid-theme"
THEME_DIR = PIPELINE_DIR / "theme"
FAMILIES = ["fierce", "warm", "quiet", "dark", "urban", "neutral"]
REGION_KEYS = ("id", "name", "word", "strength", "level", "n", "priority", "cx", "cy", "radius")


def short_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:12]


def slugs_hash(albums: list[dict]) -> str:
    """Changes when an album is added, removed or reordered, which is when the weights go stale."""
    return short_hash("\n".join(a["slug"] for a in albums).encode("utf-8"))


def pack_weights(colour: dict, albums: list[dict]) -> dict:
    """The six colour family shares of every album as integers 0..100, flat, in albums.json order."""
    if colour["family_order"] != FAMILIES:
        raise ValueError(f"colour.json family_order is {colour['family_order']}, expected {FAMILIES}")
    rows = colour["album_weights"]
    if len(rows) != len(albums):
        raise ValueError(f"colour.json has {len(rows)} weight rows but albums.json has {len(albums)} albums")
    flat: list[int] = []
    for i, row in enumerate(rows):
        if len(row) != len(FAMILIES) or abs(sum(row) - 1) > 0.03:
            raise ValueError(f"weights row {i} does not hold six shares that sum to 1: {row}")
        flat.extend(round(v * 100) for v in row)
    return {"n": len(albums), "families": FAMILIES, "slugsHash": slugs_hash(albums), "weights": flat}


def _priority(strength: str, n: int, margin: float) -> float:
    """Strong before fair, then size, then how far the name word stands clear of the runner-up."""
    return round((2 if strength == "strong" else 1) + n / 1000 + margin / 100, 4)


def hand_balanced(hand: dict) -> list[dict]:
    """The hand-made Balanced regions (regions/regions.json), every one of which has a place name."""
    out = []
    for r in hand["regions"]:
        e = r["name_evidence"]
        margin = e["coverage"] - e.get("max_other_region", 0) if "word" in e else abs(e.get("z", 0)) / 10
        out.append({
            "id": r["id"], "name": r["name_space"], "word": e.get("word") or e.get("feature"),
            "strength": r["strength"], "level": 1, "n": r["n"],
            "priority": _priority(r["strength"], r["n"], margin),
            "cx": round(r["cx"], 4), "cy": round(r["cy"], 4), "radius": round(r["radius"], 4),
        })
    return out


def auto_named(stop_data: dict) -> list[dict]:
    """Automated regions of one stop (scaling/out/regions_all.json): level 1 with an approved place name only."""
    out = []
    for k, r in enumerate(stop_data["regions"]):
        if r.get("level", 1) != 1 or not r.get("name"):
            continue
        n = r.get("n") or sum(1 for x in stop_data["album_region"] if x == k)
        out.append({
            "id": r["id"], "name": r["name"], "word": r["word"], "strength": r["strength"], "level": 1, "n": n,
            "priority": round(r["priority"], 4),
            "cx": round(r["cx"], 4), "cy": round(r["cy"], 4), "radius": round(r["radius"], 4),
        })
    return out


def _region_errors(stop: str, rows) -> list[str]:
    if not isinstance(rows, list) or not rows:
        return [f"regions.json: {stop} has no regions"]
    errors = []
    ids = [r.get("id") for r in rows]
    if len(set(ids)) != len(ids):
        errors.append(f"regions.json: {stop} repeats a region id")
    for r in rows:
        where = f"regions.json: {stop} region {r.get('id')!r}"
        if tuple(r) != REGION_KEYS:
            errors.append(f"{where} has keys {sorted(r)}, expected {list(REGION_KEYS)}")
            continue
        if not isinstance(r["name"], str) or not r["name"].strip():
            errors.append(f"{where} has no place name")
        if r["strength"] not in ("strong", "fair") or r["level"] != 1:
            errors.append(f"{where} must be a level 1 region of strength strong or fair")
        if not isinstance(r["n"], int) or r["n"] < 1:
            errors.append(f"{where} has no album count")
        numbers = [r["priority"], r["cx"], r["cy"], r["radius"]]
        if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in numbers) or max(abs(r["cx"]), abs(r["cy"])) > 2:
            errors.append(f"{where} has a priority, centre or radius that is not a sensible number")
    return errors


def validate(weights: dict, regions: dict, albums: list[dict], positions_bytes: bytes) -> list[str]:
    """Every way the two input files can disagree with the site data. An empty list means they are usable."""
    errors = []
    n = len(albums)
    again = "rerun the analysis in docs/design/trifid-theme, then python -m rmr_pipeline.theme"
    w = weights.get("weights", [])
    if weights.get("n") != n:
        errors.append(f"weights.json: n is {weights.get('n')} but albums.json has {n} albums")
    if weights.get("families") != FAMILIES:
        errors.append(f"weights.json: families must be {FAMILIES}")
    if len(w) != 6 * n:
        errors.append(f"weights.json: {len(w)} values, expected {6 * n}")
    elif any(not isinstance(v, int) or v < 0 or v > 100 for v in w):
        errors.append("weights.json: every value must be an integer from 0 to 100")
    else:
        bad = [i for i in range(n) if not 97 <= sum(w[6 * i:6 * i + 6]) <= 103]
        if bad:
            errors.append(f"weights.json: {len(bad)} rows do not sum to about 100 (first: album {bad[0]})")
    if weights.get("slugsHash") != slugs_hash(albums):
        errors.append(f"weights.json: slugsHash does not match albums.json (albums changed; {again})")
    if regions.get("positionsHash") != short_hash(positions_bytes):
        errors.append(f"regions.json: positionsHash does not match positions.json (layouts changed; {again})")
    for stop in STOPS:
        errors.extend(_region_errors(stop, regions.get(stop)))
    return errors


def _read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def build(design: Path = DESIGN_DIR, data: Path = DEFAULT_OUT) -> tuple[dict, dict]:
    albums = _read(data / "albums.json")
    auto = _read(design / "scaling" / "out" / "regions_all.json")
    weights = pack_weights(_read(design / "regions" / "colour.json"), albums)
    regions = {
        "positionsHash": short_hash((data / "positions.json").read_bytes()),
        "sonic": auto_named(auto["sonic"]),
        "balanced": hand_balanced(_read(design / "regions" / "regions.json")),
        "mood": auto_named(auto["mood"]),
    }
    return weights, regions


def check(theme_dir: Path = THEME_DIR, data: Path = DEFAULT_OUT) -> list[str]:
    """Validates the committed copies against the site data as it is now."""
    return validate(_read(theme_dir / "weights.json"), _read(theme_dir / "regions.json"),
                    _read(data / "albums.json"), (data / "positions.json").read_bytes())


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m rmr_pipeline.theme",
                                description="Copy the theme's inputs from the design analysis into data-pipeline/theme.")
    p.add_argument("--check", action="store_true", help="Only validate the committed files against the site data.")
    args = p.parse_args(argv)
    if args.check:
        errors = check()
    else:
        weights, regions = build()
        errors = validate(weights, regions, _read(DEFAULT_OUT / "albums.json"),
                          (DEFAULT_OUT / "positions.json").read_bytes())
        if not errors:
            size = write_json(THEME_DIR / "weights.json", weights) + write_json(THEME_DIR / "regions.json", regions)
            counts = ", ".join(f"{s} {len(regions[s])}" for s in STOPS)
            print(f"theme inputs written to {THEME_DIR} ({size // 1024} KB; named regions: {counts})")
    for e in errors:
        print(e, file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 5: Generate the two input files**

```bash
cd data-pipeline && .venv/bin/python -m rmr_pipeline.theme && .venv/bin/python -m rmr_pipeline.theme --check; echo "exit $?"
```

Expected: one line ending `named regions: sonic 7, balanced 17, mood 6)`, then `exit 0`. `git status --short data-pipeline/theme` lists `weights.json` and `regions.json` as new.

- [ ] **Step 6: Write the README**

Create `data-pipeline/theme/README.md`:

```markdown
# Theme inputs

Two small files the site's theme build reads (`cd frontcreck && npm run theme`). They are copies of the
design analysis in `docs/design/trifid-theme/`, kept here so the build never reads from `docs/`.

| File | Contents | Source |
|---|---|---|
| `weights.json` | For every album, in `albums.json` order, six integer shares from 0 to 100: fierce, warm, quiet, dark, urban, neutral. `n` is the album count, `slugsHash` identifies the album list they were made for. | `album_weights` in `docs/design/trifid-theme/regions/colour.json` |
| `regions.json` | The named regions of each similarity stop: id, name, word, strength, level, n, priority, cx, cy, radius. Centres and radii are in the raw units of `positions.json`. `positionsHash` identifies the layouts they were made for. | Balanced: `docs/design/trifid-theme/regions/regions.json` (made by hand). Sonic and Mood: `docs/design/trifid-theme/scaling/out/regions_all.json`, level 1 regions with an approved place name |

Regenerate and check:

    cd data-pipeline
    .venv/bin/python -m rmr_pipeline.theme           # rewrite both files from the design sources
    .venv/bin/python -m rmr_pipeline.theme --check   # compare the committed files with the site data

`rmr_pipeline.build` does not call this module, and `rmr_pipeline.validate` does not look at these files.

## When these files go stale

They describe one album list and one set of layouts. When `albums.json` or `positions.json` change (the
preview audio work and any growth of the catalogue both change them), `--check` fails, and so does
the theme build. The order of work is then:

1. Rerun the colour and region analysis under `docs/design/trifid-theme/` (`regions/` and `scaling/`) on the new data.
2. `python -m rmr_pipeline.theme` to refresh the copies here.
3. `cd frontcreck && npm run theme` to bake the gas and `theme.json` again.

The region names are text a visitor reads on the map. A new or changed name needs the owner's approval
before it ships.
```

This README is new prose in a public repository. It follows the copy rules (no owner name, no album count, no number of recommendations, no dashes, no emoji) and is listed for the owner's read through; do not reword it while building.

- [ ] **Step 7: Run the tests to see them pass**

```bash
cd data-pipeline && .venv/bin/python -m pytest tests/test_theme.py
```

Expected: `8 passed`.

- [ ] **Step 8: Commit, do not push**

```bash
git add data-pipeline/rmr_pipeline/theme.py data-pipeline/tests/test_theme.py data-pipeline/theme/weights.json data-pipeline/theme/regions.json data-pipeline/theme/README.md
git commit -F - <<'EOF'
feat(pipeline): theme inputs copied from the design analysis, with a staleness check

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Shared constants, raw to world transform, theme loader and hook

**Files:**
- Create: `frontcreck/src/components/map/theme.ts`
- Modify: `frontcreck/src/components/map/data.ts` (L14-20 `MapData`, L26-55 `normalizePositions`, L57-69 `buildMapData`)
- Modify: `frontcreck/src/components/map/data.test.ts` (L3 import, one new test)
- Modify: `frontcreck/src/components/map/state/bounds.test.ts` (L17, the hand-built `MapData`)
- Modify: `frontcreck/src/lib/data/client.ts` (L18 `fetchJson`, L54 `Resource`, L78 `idle`, L86 `load`, L169-174 `resetDataCache`)
- Create: `frontcreck/src/lib/data/theme.ts`
- Modify: `frontcreck/src/lib/data/useData.ts` (imports, one new hook at the end)
- Test: `frontcreck/src/lib/data/theme.test.ts`

**Interfaces:**
- Consumes: `STOP_IDS`, `StopId`, `Positions` from `@/lib/types`; the private loader helpers of `client.ts`, exported here.
- Produces (parts 2 and 3 import these names exactly):
  - `frontcreck/src/components/map/theme.ts`: `SKY_RGB`, `EMBER_RGB`, `NEUTRAL_RGB`, `STAR_WHITE`, `FRAME_RGB`, `NAMES_BAND_PX`, `GAS_LUM_MAX` (values in Step 3).
  - `frontcreck/src/components/map/data.ts`: `interface MapTransform { cx: number; cy: number; s: number }`, `MapData.tx: MapTransform`, `positionsTransform(p: Positions): MapTransform`, `normalizePositions(p: Positions, tx: MapTransform = positionsTransform(p)): Record<StopId, Float32Array>` (the second argument is new and optional, so existing callers are unchanged), `rawToWorld(data: Pick<MapData, 'tx'>, x: number, y: number): [number, number]` (world = (raw - centre) * s, the transform of `normalizePositions`).
  - `frontcreck/src/lib/data/theme.ts`: `interface ThemeLabel`, `interface ThemeData`, `THEME_URL = '/data/theme/theme.json'`, `isTheme(x: unknown): x is ThemeData`, `loadTheme(): Promise<ThemeData>`, `peekTheme(): ThemeData | null`, `themeState(): DataState`, `themeFor(theme: ThemeData | null, n: number): ThemeData | null`.
  - `frontcreck/src/lib/data/useData.ts`: `useThemeLoad(enabled: boolean): { status: LoadStatus; theme: ThemeData | null }`. It is the only theme hook: there is no `useTheme` (code inside the canvas tree reads the theme from the map store, Task 5).
  - `frontcreck/src/lib/data/client.ts` now also exports `fetchJson`, `Resource`, `idle`, `load`, `registerReset(fn: () => void): void`.

- [ ] **Step 1: Install dependencies unless `frontcreck/node_modules` is already there**

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; node -p process.arch
cd frontcreck && { test -d node_modules/vitest || npm ci; } && node -e "console.log(require('./node_modules/vitest/package.json').version)"
```

Expected: `arm64`, then `4.1.11` (after an install with no error when one was needed).

- [ ] **Step 2: Write the failing tests**

In `frontcreck/src/components/map/data.test.ts` replace the import on L3:

```ts
import { STOP_T, buildMapData, interpolateInto, interpolated, normalizePositions } from './data';
```

with:

```ts
import { STOP_T, buildMapData, interpolateInto, interpolated, normalizePositions, positionsTransform, rawToWorld } from './data';
```

and add this test inside `describe('map data', ...)`, after the test `'normalises all stops with the balanced transform (median to 0, p5..p95 to 0.55)'`:

```ts
  it('keeps the raw to world transform, so anything stored in raw units lands on the albums', () => {
    const p: Positions = { sonic: grid(100, 0.02, 0.5), balanced: grid(100, 0.1, 0.3), mood: grid(100, 0.1, 0.3) };
    const data = buildMapData(Array.from({ length: 100 }, (_, i) => album(i)), p);
    expect(data.tx).toEqual(positionsTransform(p));
    expect(data.tx.s).toBeGreaterThan(0);
    for (const i of [0, 37, 99]) {
      const [x, y] = rawToWorld(data, p.sonic[2 * i], p.sonic[2 * i + 1]);
      expect(x).toBeCloseTo(data.pos.sonic[2 * i], 5);
      expect(y).toBeCloseTo(data.pos.sonic[2 * i + 1], 5);
    }
  });
```

Create `frontcreck/src/lib/data/theme.test.ts`:

```ts
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataLoadError, resetDataCache } from './client';
import { THEME_URL, isTheme, loadTheme, peekTheme, themeFor, type ThemeData } from './theme';
import { useThemeLoad } from './useData';

const LABEL = { id: 'live', name: 'The Live Belt', x: -0.236, y: 0.883, strong: true, n: 174, p: 2.1772, rgb: [255, 236, 224] as [number, number, number], lum: 0.31 };
const THEME: ThemeData = {
  v: 1,
  n: 2,
  positionsHash: 'a7c1dbd996fd',
  bakeHalf: 1.6,
  stars: { lead: [0, -1], bg: [10, 20, 30, 40, 50, 255] },
  labels: { sonic: [], balanced: [LABEL], mood: [] },
};

const serve = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

afterEach(() => {
  cleanup();
  resetDataCache();
  vi.unstubAllGlobals();
});

describe('isTheme', () => {
  it('accepts the shape the theme build writes', () => {
    expect(isTheme(THEME)).toBe(true);
  });

  it.each([
    ['nothing', null],
    ['another version', { ...THEME, v: 2 }],
    ['a lead list of the wrong length', { ...THEME, stars: { ...THEME.stars, lead: [0] } }],
    ['a lead family out of range', { ...THEME, stars: { ...THEME.stars, lead: [0, 5] } }],
    ['a luminance list that is not three per album', { ...THEME, stars: { ...THEME.stars, bg: [1, 2, 3] } }],
    ['a luminance that is not a byte', { ...THEME, stars: { ...THEME.stars, bg: [10, 20, 30, 40, 50, 256] } }],
    ['a missing stop', { ...THEME, labels: { sonic: [], balanced: [LABEL] } }],
    ['a label without its ink', { ...THEME, labels: { ...THEME.labels, mood: [{ ...LABEL, rgb: [255, 236] }] } }],
    ['no bake size', { ...THEME, bakeHalf: 0 }],
  ])('rejects %s', (_, value) => {
    expect(isTheme(value)).toBe(false);
  });
});

describe('loadTheme', () => {
  it('fetches theme.json once and memoises it', async () => {
    const f = serve(THEME);
    vi.stubGlobal('fetch', f);
    const [a, b] = await Promise.all([loadTheme(), loadTheme()]);
    expect(a).toBe(b);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledWith(THEME_URL, { credentials: 'same-origin' });
    expect(peekTheme()).toBe(a);
  });

  it('rejects a missing or wrongly shaped file with DataLoadError and retries on the next call', async () => {
    vi.stubGlobal('fetch', serve('nope', 404));
    await expect(loadTheme()).rejects.toBeInstanceOf(DataLoadError);
    vi.stubGlobal('fetch', serve({ ...THEME, v: 2 }));
    await expect(loadTheme()).rejects.toBeInstanceOf(DataLoadError);
    expect(peekTheme()).toBeNull();
    vi.stubGlobal('fetch', serve(THEME));
    await expect(loadTheme()).resolves.toEqual(THEME);
  });

  it('is cleared by resetDataCache', async () => {
    vi.stubGlobal('fetch', serve(THEME));
    await loadTheme();
    resetDataCache();
    expect(peekTheme()).toBeNull();
  });
});

describe('themeFor', () => {
  it('drops a theme that was built for another album count', () => {
    expect(themeFor(THEME, 2)).toBe(THEME);
    expect(themeFor(THEME, 3)).toBeNull();
    expect(themeFor(null, 2)).toBeNull();
  });
});

describe('useThemeLoad', () => {
  it('gives null until the theme has loaded, then the theme', async () => {
    vi.stubGlobal('fetch', serve(THEME));
    const h = renderHook(() => useThemeLoad(true));
    expect(h.result.current.theme).toBeNull();
    await waitFor(() => expect(h.result.current).toEqual({ status: 'ready', theme: THEME }));
  });

  it('does not fetch while disabled', () => {
    const f = serve(THEME);
    vi.stubGlobal('fetch', f);
    const h = renderHook(() => useThemeLoad(false));
    expect(h.result.current).toEqual({ status: 'idle', theme: null });
    expect(f).not.toHaveBeenCalled();
  });

  it('reports an error and keeps null when the file is missing, so the map can go on without a theme', async () => {
    vi.stubGlobal('fetch', serve('nope', 404));
    const h = renderHook(() => useThemeLoad(true));
    await waitFor(() => expect(h.result.current.status).toBe('error'));
    expect(h.result.current.theme).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"
cd frontcreck && npm run test -- src/components/map/data.test.ts src/lib/data/theme.test.ts
```

Expected: `theme.test.ts` fails to import `./theme`; `data.test.ts` fails with `positionsTransform is not a function`.

- [ ] **Step 4: Write the shared constants**

Create `frontcreck/src/components/map/theme.ts` (constants only; the values are pinned by `shaders/gas.test.ts` in Task 4):

```ts
/**
 * Constants of the nebula theme shared by the gas, the stars, the region names and the chrome.
 * Colours are sRGB bytes. The gas itself is baked with the same palette (scripts/theme/bake-core.js).
 */

/** The empty sky: the gas shader's SKY, vec3(.024, .022, .034), and the map pane's CSS background. */
export const SKY_RGB: [number, number, number] = [6, 6, 9];
/** The Ember palette, one hue per colour family: fierce, warm, quiet, dark, urban. */
export const EMBER_RGB: [number, number, number][] = [[232, 96, 60], [244, 190, 120], [150, 200, 214], [66, 110, 190], [120, 140, 220]];
/** Thin or mixed gas, and albums that no family leads. */
export const NEUTRAL_RGB: [number, number, number] = [138, 138, 146];
export const STAR_WHITE: [number, number, number] = [255, 250, 244];
/** The off-white accent (frames, focus rings); equals --color-lamp once the theme's CSS tokens are in. */
export const FRAME_RGB: [number, number, number] = [241, 236, 228];
/** Region names show, and the gas is at full strength, while covers are smaller than this (CSS px). */
export const NAMES_BAND_PX = 13;
/** Gas luminance that a byte of 255 in ThemeData.stars.bg stands for. */
export const GAS_LUM_MAX = 0.6;
```

- [ ] **Step 5: Keep the transform in `MapData`**

In `frontcreck/src/components/map/data.ts` replace L14-20:

```ts
export interface MapData {
  n: number;
  albums: AlbumRecord[];
  /** Normalised flat positions per stop, album order. */
  pos: Record<StopId, Float32Array>;
  atlasUrls: string[];
}
```

with:

```ts
/** Raw layout units (positions.json) to world units: world = (raw - centre) * s. */
export interface MapTransform {
  cx: number;
  cy: number;
  s: number;
}

export interface MapData {
  n: number;
  albums: AlbumRecord[];
  /** Normalised flat positions per stop, album order. */
  pos: Record<StopId, Float32Array>;
  atlasUrls: string[];
  /** The transform that made `pos`; theme data stored in raw units goes through rawToWorld. */
  tx: MapTransform;
}
```

Replace L26-55 (the comment and `normalizePositions`):

```ts
/** Centre on the balanced layout's median and scale its 5th..95th percentile extent to 0.55 world units
 * (the camera constants ported from the personal site assume this). The same transform is applied to all
 * three stops so the aligned layouts stay aligned. */
export function normalizePositions(p: Positions): Record<StopId, Float32Array> {
  const b = p.balanced;
  const n = b.length / 2;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = b[2 * i];
    ys[i] = b[2 * i + 1];
  }
  xs.sort();
  ys.sort();
  const cx = quantile(xs, 0.5);
  const cy = quantile(ys, 0.5);
  const ext = Math.max(quantile(xs, 0.95) - cx, cx - quantile(xs, 0.05), quantile(ys, 0.95) - cy, cy - quantile(ys, 0.05)) || 1;
  const s = 0.55 / ext;
  const out = {} as Record<StopId, Float32Array>;
  for (const stop of STOP_IDS) {
    const src = p[stop];
    const f = new Float32Array(src.length);
    for (let i = 0; i < src.length; i += 2) {
      f[i] = (src[i] - cx) * s;
      f[i + 1] = (src[i + 1] - cy) * s;
    }
    out[stop] = f;
  }
  return out;
}
```

with:

```ts
/** Centre on the balanced layout's median and scale its 5th..95th percentile extent to 0.55 world units
 * (the camera constants ported from the personal site assume this). */
export function positionsTransform(p: Positions): MapTransform {
  const b = p.balanced;
  const n = b.length / 2;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = b[2 * i];
    ys[i] = b[2 * i + 1];
  }
  xs.sort();
  ys.sort();
  const cx = quantile(xs, 0.5);
  const cy = quantile(ys, 0.5);
  const ext = Math.max(quantile(xs, 0.95) - cx, cx - quantile(xs, 0.05), quantile(ys, 0.95) - cy, cy - quantile(ys, 0.05)) || 1;
  return { cx, cy, s: 0.55 / ext };
}

/** The same transform is applied to all three stops so the aligned layouts stay aligned. */
export function normalizePositions(p: Positions, tx: MapTransform = positionsTransform(p)): Record<StopId, Float32Array> {
  const out = {} as Record<StopId, Float32Array>;
  for (const stop of STOP_IDS) {
    const src = p[stop];
    const f = new Float32Array(src.length);
    for (let i = 0; i < src.length; i += 2) {
      f[i] = (src[i] - tx.cx) * tx.s;
      f[i + 1] = (src[i + 1] - tx.cy) * tx.s;
    }
    out[stop] = f;
  }
  return out;
}

/** A point in raw layout units (region centres, the gas bake square) in the world units of `data.pos`. */
export function rawToWorld(data: Pick<MapData, 'tx'>, x: number, y: number): [number, number] {
  return [(x - data.tx.cx) * data.tx.s, (y - data.tx.cy) * data.tx.s];
}
```

In `buildMapData` replace:

```ts
  return {
    n: albums.length,
    albums,
    pos: normalizePositions(positions),
    atlasUrls: Array.from({ length: atlasCount(albums.length) }, (_, i) => atlasUrl(i)),
  };
```

with:

```ts
  const tx = positionsTransform(positions);
  return {
    n: albums.length,
    albums,
    pos: normalizePositions(positions, tx),
    atlasUrls: Array.from({ length: atlasCount(albums.length) }, (_, i) => atlasUrl(i)),
    tx,
  };
```

In `frontcreck/src/components/map/state/bounds.test.ts` L17 replace:

```ts
  return { n: xy.length, albums: [], pos: { sonic: flat, balanced: flat, mood: flat }, atlasUrls: [] };
```

with:

```ts
  return { n: xy.length, albums: [], pos: { sonic: flat, balanced: flat, mood: flat }, atlasUrls: [], tx: { cx: 0, cy: 0, s: 1 } };
```

- [ ] **Step 6: Open the loader helpers of `client.ts`**

In `frontcreck/src/lib/data/client.ts` make these five edits.

L18, replace `async function fetchJson<T>(url: string, isValid: (v: unknown) => boolean): Promise<T> {` with:

```ts
export async function fetchJson<T>(url: string, isValid: (v: unknown) => boolean): Promise<T> {
```

L54, replace `interface Resource<T> {` with:

```ts
export interface Resource<T> {
```

L78, replace `function idle<T>(): Resource<T> {` with:

```ts
export function idle<T>(): Resource<T> {
```

L86, replace `function load<T>(get: () => Resource<T>, fetcher: () => Promise<T>): Promise<T> {` with:

```ts
export function load<T>(get: () => Resource<T>, fetcher: () => Promise<T>): Promise<T> {
```

L169-174, replace:

```ts
/** Tests only. */
export function resetDataCache(): void {
  catalog = idle();
  positions = idle();
  emit();
}
```

with:

```ts
const resetters: (() => void)[] = [];

/** A data file kept in another module (the theme) registers how to forget it, so one reset clears every cache. */
export function registerReset(fn: () => void): void {
  resetters.push(fn);
}

/** Tests only. */
export function resetDataCache(): void {
  catalog = idle();
  positions = idle();
  for (const fn of resetters) fn();
  emit();
}
```

- [ ] **Step 7: Write the theme loader**

Create `frontcreck/src/lib/data/theme.ts`:

```ts
import { fetchJson, idle, load, registerReset, type DataState } from '@/lib/data/client';
import { STOP_IDS } from '@/lib/types';
import type { StopId } from '@/lib/types';

/** A region name on the map, in the raw units of positions.json (components/map/data.ts rawToWorld). */
export interface ThemeLabel {
  id: string;
  name: string;
  x: number;
  y: number;
  strong: boolean;
  /** Albums in the region. */
  n: number;
  /** Priority: higher shows first. */
  p: number;
  /** Ink: near white with a breath of the gas colour under the name. */
  rgb: [number, number, number];
  /** Brightest gas luminance (0..1) in the name's box at Overview, at full gas strength. */
  lum: number;
}

/** public/data/theme/theme.json, written by `npm run theme` (scripts/theme/build-theme.mjs). */
export interface ThemeData {
  v: 1;
  /** Album count the theme was built for. */
  n: number;
  /** First 12 hex characters of the SHA-256 of the positions.json it was built for. */
  positionsHash: string;
  /** The gas textures cover the raw square from -bakeHalf to bakeHalf on both axes. */
  bakeHalf: number;
  stars: {
    /** Per album: leading colour family 0..4 (fierce, warm, quiet, dark, urban) or -1. */
    lead: number[];
    /** Per album, three bytes (sonic, balanced, mood): gas luminance 0..GAS_LUM_MAX at the album. */
    bg: number[];
  };
  labels: Record<StopId, ThemeLabel[]>;
}

export const THEME_URL = '/data/theme/theme.json';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, lo: number, hi: number): boolean => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;

function isLabel(v: unknown): v is ThemeLabel {
  if (!v || typeof v !== 'object') return false;
  const l = v as Record<string, unknown>;
  return (
    typeof l.id === 'string' &&
    typeof l.name === 'string' &&
    isNum(l.x) &&
    isNum(l.y) &&
    typeof l.strong === 'boolean' &&
    isNum(l.n) &&
    isNum(l.p) &&
    Array.isArray(l.rgb) &&
    l.rgb.length === 3 &&
    l.rgb.every((c) => isInt(c, 0, 255)) &&
    isNum(l.lum)
  );
}

export function isTheme(x: unknown): x is ThemeData {
  if (!x || typeof x !== 'object') return false;
  const t = x as Record<string, unknown>;
  if (t.v !== 1 || !isInt(t.n, 1, 1e6) || typeof t.positionsHash !== 'string' || !isNum(t.bakeHalf) || t.bakeHalf <= 0) return false;
  const n = t.n as number;
  const stars = t.stars as { lead?: unknown; bg?: unknown } | null | undefined;
  if (!stars || !Array.isArray(stars.lead) || !Array.isArray(stars.bg)) return false;
  if (stars.lead.length !== n || stars.bg.length !== 3 * n) return false;
  if (!stars.lead.every((v) => isInt(v, -1, 4)) || !stars.bg.every((v) => isInt(v, 0, 255))) return false;
  const labels = t.labels as Record<string, unknown> | null | undefined;
  return !!labels && STOP_IDS.every((s) => Array.isArray(labels[s]) && (labels[s] as unknown[]).every(isLabel));
}

let theme = idle<ThemeData>();
registerReset(() => {
  theme = idle();
});

/**
 * theme.json, fetched once per page load. Call from effects or event handlers, never during render
 * (starting a load notifies subscribeData listeners synchronously). The map works without it.
 */
export function loadTheme(): Promise<ThemeData> {
  return load(
    () => theme,
    () => fetchJson<ThemeData>(THEME_URL, isTheme),
  );
}

export function peekTheme(): ThemeData | null {
  return theme.value;
}

export function themeState(): DataState {
  return theme.state;
}

/** The theme if it was built for this album count, else null: a stale bake must not colour the wrong albums. */
export function themeFor(loaded: ThemeData | null, n: number): ThemeData | null {
  return loaded && loaded.n === n ? loaded : null;
}
```

- [ ] **Step 8: Add the hook**

In `frontcreck/src/lib/data/useData.ts`, after the import block that ends with `} from '@/lib/data/client';` (L14), add:

```ts
import { loadTheme, peekTheme, themeState, type ThemeData } from '@/lib/data/theme';
```

and append at the end of the file:

```ts

/** The map theme and its load state. A failed load is reported, never retried on its own: the map shows plain sky. */
export function useThemeLoad(enabled: boolean): { status: LoadStatus; theme: ThemeData | null } {
  const { status, value } = useLoaded(loadTheme, peekTheme, themeState, enabled);
  return { status, theme: value };
}
```

- [ ] **Step 9: Run the tests to see them pass, then typecheck and lint**

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"
cd frontcreck && npm run test -- src/components/map/data.test.ts src/lib/data/theme.test.ts src/lib/data/client.test.ts src/lib/data/useData.test.ts src/components/map/state/bounds.test.ts && npm run typecheck && npm run lint
```

Expected: all five files pass, typecheck and lint print no error.

- [ ] **Step 10: Commit, do not push**

```bash
git add frontcreck/src/components/map/theme.ts frontcreck/src/components/map/data.ts frontcreck/src/components/map/data.test.ts frontcreck/src/components/map/state/bounds.test.ts frontcreck/src/lib/data/client.ts frontcreck/src/lib/data/theme.ts frontcreck/src/lib/data/theme.test.ts frontcreck/src/lib/data/useData.ts
git commit -F - <<'EOF'
feat(map): theme constants, raw to world transform and the theme.json loader

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: The theme build (`npm run theme`) and its committed output

**Files:**
- Modify: `frontcreck/package.json` (scripts L18-19, devDependencies) and `frontcreck/package-lock.json` (through npm)
- Create: `frontcreck/scripts/theme/bake-core.js` (DOM-free shared code: constants, fields, luminance and label maths, `theme.json` assembly)
- Create: `frontcreck/scripts/theme/bake-core.test.mjs`
- Create: `frontcreck/scripts/theme/bake-page.js` (browser side: WebGL2, the swirl shader)
- Create: `frontcreck/scripts/theme/build-theme.mjs` (Node driver)
- Create (generated, committed): `frontcreck/public/data/theme/gas-sonic.webp`, `gas-balanced.webp`, `gas-mood.webp`, `theme.json`
- Test: `frontcreck/src/lib/data/theme.data.test.ts` (guards the committed output against the committed data)
- Modify: `frontcreck/README.md` (one row in the Commands table, one new section "Map theme data")

**Interfaces:**
- Consumes: `data-pipeline/theme/weights.json` and `regions.json` (Task 1), `frontcreck/public/data/albums.json` and `positions.json`, `isTheme` (Task 2), `assertNativeChrome` from `frontcreck/scripts/check-native.mjs`.
- Produces:
  - `npm run theme` (from `frontcreck/`), documented in `frontcreck/README.md` together with the staleness guard (Step 12).
  - `frontcreck/public/data/theme/gas-<stop>.webp`: 2048 x 2048, lossy RGB with lossless alpha, not premultiplied. RGB = toned gas with no sky and no dust (the prototype's `u_bake` output); A = dust transmission (255 = no dust, never under 51). The image is upright: pixel (0, 0) is raw (-bakeHalf, +bakeHalf), the last pixel is raw (+bakeHalf, -bakeHalf). Drawn over the sky colour with ordinary alpha blending it is a fair still of the gas (useful to part 3 for a non-WebGL strip).
  - `frontcreck/public/data/theme/theme.json`: `ThemeData` (Task 2). `stars.lead[i]`: family 0..4 when its share is over 0.3 and over the neutral share, else -1 (the star's colour tint; nothing in the file says how large or bright a star is, which part 2 draws at random on each page load). `stars.bg[3i + k]`: `min(255, round(L / 0.6 * 255))` with L the gas luminance at album i's position at stop k (sonic, balanced, mood), sky and grain included, full strength, no dust. `labels[stop][j]`: `x, y` = region centre in raw units; `p` = priority; `strong`; `n`; `rgb` = gas colour under the centre scaled so its largest channel is 255, then 80% of the way to white; `lum` = brightest gas luminance (same scale as L, 0..1, three decimals) in the box centred on the region centre with half size `((0.47 * fs * name.length + 30) / 600 / s, (0.525 * fs + 28) / 600 / s)` raw units, where `fs = 0.88 * (strong ? 17 + 7 * min(1, sqrt(n / 346)) : 15 + 3 * min(1, sqrt(n / 346)))` is the prototype's Tenor Sans size in px, 600 px per world unit is the desktop overview scale of the current app, 30 and 28 px allow for the name being nudged, and `s` is `MapTransform.s`.
  - `globalThis.RMR_THEME` (inside the build only): `GAS`, `EMBER`, `STOPS`, `noiseTable`, `blur`, `at`, `halves`, `fieldData`, `leadFamilies`, `positionsTransform`, `luminance`, `lumCell`, `lumGrid`, `lumIn`, `labelFontPx`, `labelBox`, `labelInk`, `assemble`; in the page also `start`, `renderStop`, `readRows`.

Differences from the prototype, all deliberate: the bake is 2048 px, not 4096 (so `u_ppr` during the bake is 640 px per raw unit and the runtime adds the missing octaves, Task 4); only one stop's fields are bound at a time (the build never mixes stops, so `u_b0..4` and `u_mix` are gone); `HALF` is a uniform (`u_rawHalf`) instead of a string-built constant; the colour scheme switch, the guard pairs and the other looks are removed, with the `swirl` numbers written into the shader.

- [ ] **Step 1: Add sharp as an exact devDependency and the script entry**

`sharp` 0.35.5 is already in `package-lock.json` as an optional dependency of Next; the build must not rely on an optional transitive install. The lockfile was generated with npm 11 (see the redesign plan's Global Constraints), so use it here too.

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"
cd frontcreck && npx npm@11 install --save-dev --save-exact sharp@0.35.5 && npm ci && node -e "import('sharp').then((m) => console.log(m.default.versions.sharp))"
```

Expected: `0.35.5`, and `git diff frontcreck/package.json` shows `"sharp": "0.35.5"` under `devDependencies`.

In `frontcreck/package.json` replace:

```json
    "perf": "node scripts/perf/perf.mjs",
    "shots": "node scripts/review-shots.mjs"
```

with:

```json
    "perf": "node scripts/perf/perf.mjs",
    "shots": "node scripts/review-shots.mjs",
    "theme": "node scripts/theme/build-theme.mjs"
```

- [ ] **Step 2: Write the failing unit test for the shared bake code**

Create `frontcreck/scripts/theme/bake-core.test.mjs`:

```js
import { describe, expect, it } from 'vitest';
import './bake-core.js';

const T = globalThis.RMR_THEME;

describe('bake-core (the DOM-free half of the theme build)', () => {
  it('builds the seeded noise table of the prototype', () => {
    const t = T.noiseTable();
    expect(t.length).toBe(65536);
    expect(Array.from(t.slice(0, 8))).toEqual([2, 15, 250, 178, 133, 103, 119, 61]);
    expect(t[65535]).toBe(213);
    expect(t.reduce((s, v) => s + v, 0)).toBe(8329196);
  });

  it('blurs without losing light away from the edges', () => {
    const n = 64;
    const d = new Float32Array(n * n);
    d[32 * n + 32] = 1;
    T.blur(d, n, n, 3);
    let sum = 0;
    for (const v of d) sum += v;
    expect(sum).toBeCloseTo(1, 4);
    expect(d[32 * n + 32]).toBeGreaterThan(d[32 * n + 36]);
    expect(d[32 * n + 36]).toBeCloseTo(d[36 * n + 32], 6);
  });

  it('leads a star with a family only over 0.3 and over the neutral share', () => {
    const w = [50, 20, 10, 10, 0, 10, 30, 30, 10, 10, 0, 20, 10, 10, 10, 10, 20, 40, 0, 0, 0, 0, 45, 40];
    expect(Array.from(T.leadFamilies(w, 4))).toEqual([0, -1, -1, 4]);
  });

  it('takes the bake and field squares from the layout extent', () => {
    const h = T.halves({ sonic: [0.2, -1], balanced: [0.5, 0.5], mood: [-0.7, 0.1] });
    expect(h.bakeHalf).toBeCloseTo(1.6, 10);
    expect(h.rawHalf).toBeCloseTo(1.75, 10);
  });

  it('packs density and colour weights into five float fields', () => {
    const fields = T.fieldData(new Float32Array([0, 0]), [0, 100, 0, 0, 0, 0], 1, 1.75);
    const n = T.GAS.GRID;
    expect(fields).toHaveLength(5);
    for (const f of fields) expect(f.length).toBe(4 * n * n);
    const centre = 4 * ((n / 2) * n + n / 2);
    const corner = 0;
    expect(fields[0][centre]).toBeGreaterThan(0.5); // fine density, normalised at the album
    expect(fields[0][corner]).toBe(0);
    expect(fields[1][centre + 1]).toBeGreaterThan(0); // local weight of family 1 (warm)
    expect(fields[1][centre]).toBe(0); // none of family 0
    expect(fields[2][centre + 2]).toBe(0); // no neutral share
  });

  it('mirrors the app transform: balanced median to 0, 5th to 95th percentile to 0.55', () => {
    const b = [];
    for (let i = 0; i < 100; i++) b.push((i % 10) * 0.1 + 0.3, Math.floor(i / 10) * 0.1 - 0.3);
    const tx = T.positionsTransform(b);
    expect(tx.cx).toBeCloseTo(0.7, 6);
    expect(tx.cy).toBeCloseTo(0.1, 6);
    expect(tx.s).toBeCloseTo(0.55 / 0.5, 6);
  });

  it('reads luminance from the grid in raw units, rows running south to north', () => {
    const n = T.GAS.LUM;
    expect(T.lumCell(-1.75, -1.75, 1.75)).toBe(0);
    expect(T.lumCell(1.75, 1.75, 1.75)).toBe(n * n - 1);
    expect(T.lumCell(1.75, -1.75, 1.75)).toBe(n - 1);
    expect(T.luminance([255, 255, 255])).toBeCloseTo(1, 6);
    expect(T.luminance([0, 0, 0])).toBe(0);
    const lum = new Float32Array(n * n);
    lum[T.lumCell(0.1, 0.1, 1.75)] = 0.4;
    expect(T.lumIn(lum, 1.75, 0, 0, 0.2, 0.2)).toBeCloseTo(0.4, 6);
    expect(T.lumIn(lum, 1.75, -0.4, -0.4, -0.2, -0.2)).toBe(0);
  });

  it('sizes and inks a name as the prototype does', () => {
    expect(T.labelFontPx(true, 346)).toBeCloseTo(0.88 * 24, 6);
    expect(T.labelFontPx(false, 0)).toBeCloseTo(0.88 * 15, 6);
    const [hw, hh] = T.labelBox('Warm Halo', true, 346, 0.5);
    expect(hw).toBeCloseTo((0.47 * 0.88 * 24 * 9 + 30) / 600 / 0.5, 6);
    expect(hh).toBeCloseTo((0.525 * 0.88 * 24 + 28) / 600 / 0.5, 6);
    expect(T.labelInk([120, 60, 30])).toEqual([255, 230, 217]);
    expect(T.labelInk([0, 0, 0])).toEqual([204, 204, 204]);
  });

  it('assembles theme.json from the luminance renders', () => {
    const n = T.GAS.LUM;
    const px = new Uint8Array(4 * n * n);
    for (let i = 0; i < n * n; i++) px.set([60, 30, 15, 255], 4 * i);
    const region = { id: 'warm', name: 'Warm Halo', word: 'warm', strength: 'strong', level: 1, n: 106, priority: 2.3104, cx: 0.262, cy: 0.248, radius: 0.112 };
    const input = {
      n: 2,
      positionsHash: 'a7c1dbd996fd',
      positions: { sonic: [0, 0, 1, 1], balanced: [0, 0, 1, 1], mood: [0, 0, 1, 1] },
      weights: [50, 20, 10, 10, 0, 10, 10, 10, 10, 10, 20, 40],
      regions: { sonic: [], balanced: [region, { ...region, id: 'area', level: 0 }, { ...region, id: 'bare', name: null }], mood: [] },
    };
    const theme = T.assemble(input, { sonic: px, balanced: px, mood: px }, 1.6, 1.75);
    const byte = Math.min(255, Math.round((T.luminance([60, 30, 15]) / 0.6) * 255));
    expect(theme).toEqual({
      v: 1,
      n: 2,
      positionsHash: 'a7c1dbd996fd',
      bakeHalf: 1.6,
      stars: { lead: [0, -1], bg: [byte, byte, byte, byte, byte, byte] },
      labels: {
        sonic: [],
        balanced: [{ id: 'warm', name: 'Warm Halo', x: 0.262, y: 0.248, strong: true, n: 106, p: 2.3104, rgb: [255, 230, 217], lum: Math.round(T.luminance([60, 30, 15]) * 1000) / 1000 }],
        mood: [],
      },
    });
  });
});
```

- [ ] **Step 3: Run it to see it fail**

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"
cd frontcreck && npm run test -- scripts/theme/bake-core.test.mjs
```

Expected: fails to resolve `./bake-core.js`.

- [ ] **Step 4: Write the shared bake code**

Create `frontcreck/scripts/theme/bake-core.js`:

```js
/* The DOM-free half of the theme build (npm run theme). A classic script with no imports or exports, so one file
 * serves three readers: the bake page loads it with a script tag, and Node and vitest import it for its side
 * effect. Everything hangs off globalThis.RMR_THEME.
 * Ported from docs/design/trifid-theme/prototype/src/gas.js, data.js, stars.js and labels.js (gas look `swirl`,
 * palette `ember`). The site never imports from docs/; this copy is the production one. */
(function () {
  'use strict';

  const GAS = {
    GRID: 512,
    // Gaussian widths in raw layout units: fine, local colour, big, wide colour, huge, far, very far
    BLUR: { fine: 0.016, col: 0.034, big: 0.05, wide: 0.13, huge: 0.14, far: 0.3, vfar: 0.62 },
    BAKE: 2048, // px of a baked stop; WebGL2 guarantees textures this large
    LUM: 512, // px of the luminance copy that stars and names read
    LUM_PPR: 1000, // px per raw unit the luminance copy is shaded for
    BAKE_MARGIN: 0.6, // the bake reaches this far past the outermost album, where the gas has already ended
    RAW_MARGIN: 0.75, // the fields reach a little further, past the widest blur that still lights anything
    LUM_MAX: 0.6, // a byte of 255 in stars.bg
    LABEL_REF_PPW: 600, // px per world unit names are boxed at: the desktop overview of the app
  };
  const EMBER = { hues: [[232, 96, 60], [244, 190, 120], [150, 200, 214], [66, 110, 190], [120, 140, 220]], neutral: [138, 138, 146] };
  const STOPS = ['sonic', 'balanced', 'mood'];
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  /** The prototype's seeded 256 x 256 random table (mulberry32, seed 7). The runtime builds the same one. */
  function noiseTable() {
    let a = 7;
    const rnd = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const nt = new Uint8Array(256 * 256);
    for (let i = 0; i < nt.length; i++) nt[i] = Math.floor(rnd() * 256);
    return nt;
  }

  /** Three box passes in place, close to a Gaussian of `sigmaCells`. */
  function blur(d, w, h, sigmaCells) {
    const r = Math.max(1, Math.round(sigmaCells)), t = new Float32Array(w * h), inv = 1 / (2 * r + 1);
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < h; y++) { let s = 0; const o = y * w; for (let x = -r; x <= r; x++) s += d[o + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { t[o + x] = s * inv; s += d[o + Math.min(w - 1, x + r + 1)] - d[o + Math.max(0, x - r)]; } }
      for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { d[y * w + x] = s * inv; s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; } }
    }
    return d;
  }

  /** Bilinear read of an n x n grid at grid coordinates. */
  function at(d, n, gx, gy) {
    gx = clamp(gx, 0, n - 1.001); gy = clamp(gy, 0, n - 1.001);
    const xi = gx | 0, yi = gy | 0, fx = gx - xi, fy = gy - yi, o = yi * n + xi;
    return d[o] * (1 - fx) * (1 - fy) + d[o + 1] * fx * (1 - fy) + d[o + n] * (1 - fx) * fy + d[o + n + 1] * fx * fy;
  }

  /** Half sizes, in raw units, of the baked square and of the field grids, from the outermost album of any stop. */
  function halves(positions) {
    let ext = 0;
    for (const stop of STOPS) for (const v of positions[stop]) ext = Math.max(ext, Math.abs(v));
    return { bakeHalf: ext + GAS.BAKE_MARGIN, rawHalf: ext + GAS.RAW_MARGIN };
  }

  /** Album density at five blurs and the seven colour weights at two, for one stop, normalised by percentiles taken
   * at the album positions (so the rule is the same at 4,000 or 10,000 points), as five RGBA float grids:
   *   0: fine, big, huge, far      1: local weights 0..3      2: local 4, 5, neutral; very far
   *   3: wide weights 0..3         4: wide 4, 5, neutral
   * raw: flat xy of the stop. w6: six integer shares 0..100 per album (five families, then neutral). Rows run from
   * raw y = -rawHalf upwards. Channel 5 is unused by the five-family scheme and stays empty. */
  function fieldData(raw, w6, N, rawHalf) {
    const n = GAS.GRID, cell = (2 * rawHalf) / n, B = GAS.BLUR;
    const g = new Float32Array(n * n), w7 = [0, 1, 2, 3, 4, 5, 6].map(() => new Float32Array(n * n));
    const gxs = new Float32Array(N), gys = new Float32Array(N), W = new Float32Array(7);
    for (let i = 0; i < N; i++) {
      const gx = (raw[2 * i] + rawHalf) / cell - 0.5, gy = (raw[2 * i + 1] + rawHalf) / cell - 0.5; gxs[i] = gx; gys[i] = gy;
      const xi = Math.floor(gx), yi = Math.floor(gy); if (xi < 0 || yi < 0 || xi >= n - 1 || yi >= n - 1) continue;
      for (let j = 0; j < 5; j++) W[j] = w6[6 * i + j] / 100;
      W[5] = 0; W[6] = w6[6 * i + 5] / 100;
      const fx = gx - xi, fy = gy - yi, o = yi * n + xi, k = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy], oo = [o, o + 1, o + n, o + n + 1];
      for (let c = 0; c < 4; c++) { g[oo[c]] += k[c]; for (let j = 0; j < 7; j++) w7[j][oo[c]] += k[c] * W[j]; }
    }
    const mk = (src, sigma) => blur(Float32Array.from(src), n, n, sigma / cell);
    const fine = mk(g, B.fine), big = mk(g, B.big), huge = mk(g, B.huge), far = mk(g, B.far), vfar = mk(g, B.vfar);
    const wide = w7.map((q) => mk(q, B.wide)); w7.forEach((q) => blur(q, n, n, B.col / cell));
    const pct = (d, q) => { const v = []; for (let i = 0; i < N; i += 2) v.push(at(d, n, gxs[i], gys[i])); v.sort((a, b) => a - b); return v[Math.floor(v.length * q)] || 1e-6; };
    const nb = pct(big, 0.6), nh = pct(huge, 0.6), nf = pct(fine, 0.85), nfar = pct(far, 0.5), nvf = pct(vfar, 0.5);
    const T = [0, 1, 2, 3, 4].map(() => new Float32Array(4 * n * n));
    for (let i = 0; i < n * n; i++) {
      const o = 4 * i;
      T[0][o] = fine[i] / nf; T[0][o + 1] = big[i] / nb; T[0][o + 2] = huge[i] / nh; T[0][o + 3] = far[i] / nfar;
      for (let j = 0; j < 4; j++) { T[1][o + j] = w7[j][i] / nb; T[3][o + j] = wide[j][i] / nh; }
      for (let j = 0; j < 3; j++) { T[2][o + j] = w7[4 + j][i] / nb; T[4][o + j] = wide[4 + j][i] / nh; }
      T[2][o + 3] = vfar[i] / nvf;
    }
    return T;
  }

  /** Leading colour family per album (0..4), or -1 when no family is over 0.3 or the neutral share is larger. */
  function leadFamilies(w6, N) {
    const lead = new Int8Array(N);
    for (let i = 0; i < N; i++) {
      let m = 0, mj = -1;
      for (let j = 0; j < 5; j++) { const v = w6[6 * i + j] / 100; if (v > m) { m = v; mj = j; } }
      lead[i] = m > 0.3 && m > w6[6 * i + 5] / 100 ? mj : -1;
    }
    return lead;
  }

  const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];
  /** The app's raw to world transform (src/components/map/data.ts positionsTransform), from the flat balanced layout. */
  function positionsTransform(balanced) {
    const n = balanced.length / 2, xs = new Float64Array(n), ys = new Float64Array(n);
    for (let i = 0; i < n; i++) { xs[i] = balanced[2 * i]; ys[i] = balanced[2 * i + 1]; }
    xs.sort(); ys.sort();
    const cx = quantile(xs, 0.5), cy = quantile(ys, 0.5);
    const ext = Math.max(quantile(xs, 0.95) - cx, cx - quantile(xs, 0.05), quantile(ys, 0.95) - cy, cy - quantile(ys, 0.05)) || 1;
    return { cx, cy, s: 0.55 / ext };
  }

  const srgb2lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const luminance = (c) => 0.2126 * srgb2lin(c[0]) + 0.7152 * srgb2lin(c[1]) + 0.0722 * srgb2lin(c[2]);
  /** Cell of the luminance copy that holds raw point (x, y). The copy covers the field square; row 0 is the south edge. */
  function lumCell(x, y, rawHalf) {
    const n = GAS.LUM, g = (v) => clamp(Math.round(((v + rawHalf) / (2 * rawHalf)) * n - 0.5), 0, n - 1);
    return g(y) * n + g(x);
  }
  /** Luminance per cell of an RGBA render of the luminance copy. */
  function lumGrid(px) {
    const n = GAS.LUM, out = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) out[i] = luminance([px[4 * i], px[4 * i + 1], px[4 * i + 2]]);
    return out;
  }
  /** Brightest luminance inside a raw box. */
  function lumIn(lum, rawHalf, x0, y0, x1, y1) {
    const n = GAS.LUM, a = lumCell(x0, y0, rawHalf), b = lumCell(x1, y1, rawHalf);
    const xa = Math.min(a % n, b % n), xb = Math.max(a % n, b % n), ya = Math.min((a / n) | 0, (b / n) | 0), yb = Math.max((a / n) | 0, (b / n) | 0);
    let m = 0;
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) { const v = lum[y * n + x]; if (v > m) m = v; }
    return m;
  }

  /** Font size in px of a region name in Tenor Sans (the prototype's fontSize with the face's 0.88 factor). */
  function labelFontPx(strong, n) {
    const k = Math.min(1, Math.sqrt(n / 346));
    return 0.88 * (strong ? 17 + 7 * k : 15 + 3 * k);
  }
  /** Half width and half height, in raw units, of the area a name may cover at the overview: wide capitals at
   * about 0.94 em a letter (advance plus 0.26 em tracking), plus room for the nudges the placement may apply. */
  function labelBox(name, strong, n, s) {
    const fs = labelFontPx(strong, n);
    return [(0.47 * fs * name.length + 30) / GAS.LABEL_REF_PPW / s, (0.525 * fs + 28) / GAS.LABEL_REF_PPW / s];
  }
  /** Ink of a name: the gas colour under it at full brightness, then 80% of the way to white. */
  function labelInk(rgb) {
    const m = Math.max(rgb[0], rgb[1], rgb[2], 1);
    return rgb.map((v) => { const c = (v / m) * 255; return Math.round(c + (255 - c) * 0.8); });
  }

  /** theme.json. input: { n, positionsHash, positions, weights, regions }; lumPx: per stop, the RGBA bytes of the
   * luminance copy (rows from the south edge). */
  function assemble(input, lumPx, bakeHalf, rawHalf) {
    const { n, positions, weights, regions } = input;
    const tx = positionsTransform(positions.balanced), bg = new Array(3 * n).fill(0), labels = {};
    STOPS.forEach((stop, k) => {
      const px = lumPx[stop], lum = lumGrid(px), P = positions[stop];
      for (let i = 0; i < n; i++) bg[3 * i + k] = Math.min(255, Math.round((lum[lumCell(P[2 * i], P[2 * i + 1], rawHalf)] / GAS.LUM_MAX) * 255));
      labels[stop] = regions[stop].filter((r) => r.level === 1 && r.name).map((r) => {
        const strong = r.strength === 'strong', c = 4 * lumCell(r.cx, r.cy, rawHalf), [hw, hh] = labelBox(r.name, strong, r.n, tx.s);
        return {
          id: r.id, name: r.name, x: r.cx, y: r.cy, strong, n: r.n, p: r.priority,
          rgb: labelInk([px[c], px[c + 1], px[c + 2]]),
          lum: Math.round(lumIn(lum, rawHalf, r.cx - hw, r.cy - hh, r.cx + hw, r.cy + hh) * 1000) / 1000,
        };
      });
    });
    return { v: 1, n, positionsHash: input.positionsHash, bakeHalf: Math.round(bakeHalf * 1e4) / 1e4, stars: { lead: Array.from(leadFamilies(weights, n)), bg }, labels };
  }

  globalThis.RMR_THEME = Object.assign(globalThis.RMR_THEME || {}, {
    GAS, EMBER, STOPS, noiseTable, blur, at, halves, fieldData, leadFamilies, positionsTransform,
    luminance, lumCell, lumGrid, lumIn, labelFontPx, labelBox, labelInk, assemble,
  });
})();
```

- [ ] **Step 5: Run the unit test to see it pass**

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"
cd frontcreck && npm run test -- scripts/theme/bake-core.test.mjs
```

Expected: 9 tests pass.

- [ ] **Step 6: Write the browser side of the bake**

Create `frontcreck/scripts/theme/bake-page.js`:

```js
/* The browser half of the theme build: builds the field textures of each stop and runs the gas shader once per
 * stop into a 2048 px target (rgb = toned gas with no sky and no dust, a = what the dust lets through), and once
 * more at 512 px with sky and grain for the luminance that stars and names read. Loaded after bake-core.js by
 * build-theme.mjs. Ported from docs/design/trifid-theme/prototype/src/gas.js with the `swirl` numbers written in:
 * WARP 3.4, W2 1.6, TEX .3 + 2 b^2, FIL .5, CW .42 and .16, DW .14, DUST .8, DSOFT .7, DFINE .7, EX 1.18, P 2.6,
 * SAT 1.05, FAR 1, CORE .07, HI .25. */
(function () {
  'use strict';
  const T = globalThis.RMR_THEME, G = T.GAS;
  let gl, prog, vao, noiseTex, bakeHalf = 0, rawHalf = 0, baked = null;
  const fields = {};

  const VS = `#version 300 es
  in vec2 a_p; uniform vec4 u_rect; out vec2 v_raw;
  void main(){ vec2 uv=a_p*.5+.5; v_raw=mix(u_rect.xy,u_rect.zw,uv); gl_Position=vec4(a_p,0.,1.); }`;

  const FS = `#version 300 es
  precision highp float;
  in vec2 v_raw; out vec4 o;
  uniform sampler2D u_noise, u_a0, u_a1, u_a2, u_a3, u_a4;
  uniform float u_ppr, u_bake, u_rawHalf;
  uniform vec3 u_hue[6]; uniform vec3 u_neu;
  const float F=5.;
  const vec3 SKY=vec3(.024,.022,.034);
  float sm(float a,float b,float x){ float t=clamp((x-a)/(b-a),0.,1.); return t*t*(3.-2.*t); }
  // value noise from the 256 px random table; the smoothstep fraction makes LINEAR filtering do the interpolation
  float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return texture(u_noise,(i+f+.5)/256.).r; }
  float fbm4(vec2 p){ float s=0.,a=.5,f=1.; for(int i=0;i<4;i++){ s+=a*vn(p*f+vec2(17.3,9.1)*float(i)); a*=.5; f*=2.03; } return s; }
  // fbm with gain .6 and lacunarity 2.07, normalised to 0..1. An octave only counts once its cells are a few
  // pixels wide, so the bake holds exactly the detail its resolution can carry.
  float fbmG(vec2 p,float k,int base,int total){
    float s=0.,a=1.,f=1.,n=0.;
    for(int i=0;i<total;i++){
      float cellPx=u_ppr/(F*k*f), fade=sm(1.5,4.,cellPx);
      if(i<base) n+=a;
      if(fade>0.) s+=a*fade*(i<base?1.:1.8)*(vn(p*f+vec2(17.3,9.1)*float(i))-.5);
      a*=.6; f*=2.07;
    }
    return s/n+.5;
  }
  // shares raised to a power, so the leading family takes the hue and neighbours bleed in; weak fits (no family
  // leads) and the neutral share lose colour
  vec3 famCol(vec4 a,vec3 b){
    float w[6]; w[0]=max(a.x,0.); w[1]=max(a.y,0.); w[2]=max(a.z,0.); w[3]=max(a.w,0.); w[4]=max(b.x,0.); w[5]=max(b.y,0.);
    float s=0., t=0., m=0.; float q[6];
    for(int j=0;j<6;j++){ s+=w[j]; }
    if(s<1e-9) return u_neu;
    for(int j=0;j<6;j++){ q[j]=pow(w[j]/s,2.6); t+=q[j]; }
    for(int j=0;j<6;j++) q[j]/=t;
    vec3 c=vec3(0.);
    for(int j=0;j<6;j++){ m=max(m,q[j]); c+=u_hue[j]*q[j]; }
    float neu=max(b.z,0.)/(s+max(b.z,0.)+1e-9), sat=min(1.,(.25+1.05*m)*1.05)*(1.-.7*neu);
    return mix(u_neu,c,sat);
  }
  void main(){
    vec2 p=vec2(v_raw.x*F+20.,-v_raw.y*F+20.);
    // the flow: a slow vector field q; every noise lookup below is displaced along it, which is what makes the swirl
    vec2 q=vec2(fbm4(p+vec2(1.7,9.2))-.47, fbm4(p+vec2(8.3,2.8))-.47);
    vec2 pw=p*1.25+q*3.4;
    // a second, finer vector that lives in the warped space: it marbles the luminance and carries the colour
    vec2 r=vec2(fbmG(pw+vec2(31.,77.),1.25,4,4), fbmG(pw+vec2(63.,12.),1.25,4,4))-.5;
    float b=fbmG(pw+r*1.6,1.25,6,8);
    float tex=.3+2.*pow(clamp(b,0.,1.),2.);
    float fold=1.-abs(2.*fbmG(p*2.7+q*4.2+r*1.5+vec2(31.,77.),2.7,5,7)-1.); fold*=fold; tex*=1.+.5*(fold*fold-.22);
    // fields: the fine density is read where it is (cores stay on their albums); the wider ones through a small warp
    // so the cloud's edge is wisps, not a round blur; the colour weights through the flow, so colours swirl
    vec2 uv=(v_raw+u_rawHalf)/(2.*u_rawHalf), fl=vec2(q.x,-q.y), fr=vec2(r.x,-r.y);
    vec2 uvw=uv+fl*.14/(2.*u_rawHalf), uvc=uv+(fl*.42+fr*.16)/(2.*u_rawHalf);
    vec4 d1=texture(u_a0,uv), d0=texture(u_a0,uvw), w1a=texture(u_a1,uvc), w1b=texture(u_a2,uvc), w2a=texture(u_a3,uvc), w2b=texture(u_a4,uvc); float dV=texture(u_a2,uvw).a;
    float dF=min(2.,d1.r), dB=d0.g, dH=d0.b, dFar=d0.a;
    // lit gas wherever albums are, a thin far field around them, and nothing beyond: env is 0 in empty sky, so the
    // cloud ends in the plain dark sky with no outline
    float near=sm(.02,1.6,dB*.7+dH*.55), env=sm(.02,.55,dFar);
    float lit=near*.84+(.2*sm(.05,1.3,dFar)+(.085*sm(0.,1.1,dV)+.03)*env);
    float Lm=lit*tex;
    // colour from the weights: local where albums are, the wider average further out, neutral in the far field
    float s1=dot(w1a,vec4(1.))+dot(w1b.xyz,vec3(1.)), s2=dot(w2a,vec4(1.))+dot(w2b.xyz,vec3(1.));
    vec3 c=u_neu;
    if(s2>1e-7){ c=famCol(w2a,w2b.xyz); if(s1>1e-7) c=mix(c,famCol(w1a,w1b.xyz),sm(0.,.1,s1)); c=mix(u_neu,c,sm(.02,.45,dFar)); }
    // dust: thin, sharp, dark lanes that only show against bright gas, shaped by the same flow. The broad lanes are
    // eased where the albums are dense, so no large blot sits on a crowd of albums.
    float rd=1.-abs(2.*fbmG(p*1.5+q.yx*2.8+vec2(40.,13.),1.5,5,5)-1.);
    float rd2=1.-abs(2.*fbmG(p*3.1+q*2.2+vec2(71.,29.),3.1,5,5)-1.);
    float gate=sm(.54,.7,fbmG(p*.8+vec2(90.,55.),.8,3,3));
    float dense=.7*sm(.55,1.5,dB);
    float lane=min(1.,sm(.9+.05*dense,.96+.032*dense,rd)*gate+sm(.93+.02*dense,.975+.012*dense,rd2)*.7*gate)*sm(.3,.75,Lm);
    float A=1.-.8*lane;
    // cream cores on the densest spots, a warm lift on the brightest gas, then the exponential tone map
    const vec3 WARM=vec3(1.,.92,.78);
    float core=pow(dF,1.6)*.07*sm(.3,1.,dB), hi=pow(max(0.,Lm-.55),2.)*.25;
    vec3 col=1.-exp(-1.18*(c*Lm*.95+(core+hi)*WARM));
    if(u_bake>.5){ o=vec4(col,A); return; }
    // the luminance copy: the runtime's finish() at full strength with no dust and no pool, sky and grain included
    col=1.-max(1.-col,vec3(.002));
    float n=(texelFetch(u_noise,ivec2(gl_FragCoord.xy)&255,0).r-.5)*.012;
    o=vec4(SKY+col+n,1.);
  }`;

  function program(vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.bindAttribLocation(p, 0, 'a_p'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }

  function floatTexture(data, n) {
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, n, n, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  const base64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };

  /** input: { n, positions: { sonic, balanced, mood } flat raw xy, weights: six integers per album }. */
  T.start = function (input) {
    gl = document.getElementById('gl').getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false });
    if (!gl) throw new Error('this browser has no WebGL2');
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (max < G.BAKE) throw new Error('MAX_TEXTURE_SIZE is ' + max + ', the bake needs ' + G.BAKE);
    ({ bakeHalf, rawHalf } = T.halves(input.positions));
    prog = program(VS, FS);
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
    noiseTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, noiseTex); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 256, 0, gl.RED, gl.UNSIGNED_BYTE, T.noiseTable());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    for (const stop of T.STOPS) fields[stop] = T.fieldData(Float32Array.from(input.positions[stop]), input.weights, input.n, rawHalf).map((d) => floatTexture(d, G.GRID));
    return { bakeHalf, rawHalf, renderer: String(gl.getParameter(gl.RENDERER)) };
  };

  /** Run the shader for one stop over a raw rectangle into an n x n target and read it back (rows from the south edge). */
  function run(stop, rect, ppr, bake, n) {
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, n, n);
    const u = prog.u;
    gl.useProgram(prog.p); gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, noiseTex); gl.uniform1i(u.u_noise, 0);
    for (let i = 0; i < 5; i++) { gl.activeTexture(gl.TEXTURE1 + i); gl.bindTexture(gl.TEXTURE_2D, fields[stop][i]); gl.uniform1i(u['u_a' + i], 1 + i); }
    const hues = T.EMBER.hues.concat([T.EMBER.neutral]);
    gl.uniform3fv(u.u_hue, new Float32Array(hues.flat().map((v) => v / 255)));
    gl.uniform3f(u.u_neu, T.EMBER.neutral[0] / 255, T.EMBER.neutral[1] / 255, T.EMBER.neutral[2] / 255);
    gl.uniform4f(u.u_rect, rect[0], rect[1], rect[2], rect[3]);
    gl.uniform1f(u.u_ppr, ppr); gl.uniform1f(u.u_bake, bake ? 1 : 0); gl.uniform1f(u.u_rawHalf, rawHalf);
    gl.disable(gl.BLEND); gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Uint8Array(4 * n * n); gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fbo); gl.deleteTexture(tex);
    return px;
  }

  /** Bake one stop (kept in the page for readRows) and return the luminance copy as base64 RGBA. */
  T.renderStop = function (stop) {
    const H = bakeHalf, R = rawHalf;
    baked = run(stop, [-H, -H, H, H], G.BAKE / (2 * H), true, G.BAKE);
    return base64(run(stop, [-R, -R, R, R], G.LUM_PPR, false, G.LUM));
  };
  /** Rows y0 to y0 + rows of the last bake as base64 RGBA (a whole stop is too large for one message). */
  T.readRows = function (y0, rows) { return base64(baked.subarray(4 * G.BAKE * y0, 4 * G.BAKE * (y0 + rows))); };
})();
```

- [ ] **Step 7: Write the Node driver**

Create `frontcreck/scripts/theme/build-theme.mjs`:

```js
#!/usr/bin/env node
/** npm run theme: bakes the map theme into public/data/theme/ (three gas textures and theme.json).
 * One headless Chromium on software WebGL does the shading, so the output is the same on every machine.
 * Inputs: data-pipeline/theme/{weights,regions}.json and public/data/{albums,positions}.json. It refuses to run
 * when the inputs were made for other albums or layouts. Previews for a human go to test-results/theme/. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { assertNativeChrome } from '../check-native.mjs';
import './bake-core.js';

const T = globalThis.RMR_THEME;
const HERE = import.meta.dirname;
const ROOT = path.resolve(HERE, '../..');
const DATA = path.join(ROOT, 'public/data');
const OUT = path.join(DATA, 'theme');
const INPUTS = path.resolve(ROOT, '../data-pipeline/theme');
const PREVIEW = path.join(ROOT, 'test-results/theme');
// Software WebGL in headless Chrome, as playwright.config.ts and scripts/perf/perf.mjs start it.
const WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const SKY = { r: 6, g: 6, b: 9 };
const STRIP_ROWS = 256;

const shortHash = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

function writeAtomic(file, data) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.tmp`);
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

function loadInput() {
  const albums = readJson(path.join(DATA, 'albums.json'));
  const positionsBytes = fs.readFileSync(path.join(DATA, 'positions.json'));
  const positions = JSON.parse(positionsBytes.toString('utf8'));
  const weights = readJson(path.join(INPUTS, 'weights.json'));
  const regions = readJson(path.join(INPUTS, 'regions.json'));
  const n = albums.length;
  const positionsHash = shortHash(positionsBytes);
  const again = 'Refresh data-pipeline/theme (see its README), then run npm run theme again.';
  if (weights.n !== n || weights.weights.length !== 6 * n) throw new Error(`weights.json covers ${weights.n} albums but albums.json has ${n}. ${again}`);
  if (weights.slugsHash !== shortHash(Buffer.from(albums.map((a) => a.slug).join('\n'), 'utf8'))) throw new Error(`weights.json was made for another album list. ${again}`);
  if (regions.positionsHash !== positionsHash) throw new Error(`regions.json was made for other layouts. ${again}`);
  for (const stop of T.STOPS) {
    if (!Array.isArray(positions[stop]) || positions[stop].length !== 2 * n) throw new Error(`positions.json: ${stop} does not hold ${n} points`);
    if (!Array.isArray(regions[stop])) throw new Error(`regions.json: no ${stop} list. ${again}`);
  }
  return { n, positions, positionsHash, weights: weights.weights, regions };
}

/** Checks one baked stop, writes it as WebP (lossy colour, lossless dust channel) and a flattened preview. */
async function writeGas(stop, rgba, size) {
  let light = 0;
  let minA = 255;
  for (let i = 0; i < rgba.length; i += 4) {
    light += rgba[i] + rgba[i + 1] + rgba[i + 2];
    if (rgba[i + 3] < minA) minA = rgba[i + 3];
  }
  const mean = light / (3 * size * size);
  // dust lets through at least 1 - 0.8 = 0.2 (51 of 255); a blank or fully see-through bake means the shader broke
  if (mean < 2 || minA < 45) throw new Error(`gas-${stop}: the bake looks wrong (mean colour ${mean.toFixed(1)}, lowest dust ${minA})`);
  const raw = { raw: { width: size, height: size, channels: 4 } };
  const webp = await sharp(rgba, raw).webp({ quality: 84, alphaQuality: 100, effort: 5 }).toBuffer();
  // Decode it again: the colour must stay close everywhere, also under dust (a premultiplied encode would darken
  // exactly those pixels), and the dust channel must come back as written.
  const back = await sharp(webp).raw().toBuffer({ resolveWithObject: true });
  if (back.info.width !== size || back.info.height !== size || back.info.channels !== 4) throw new Error(`gas-${stop}: decoded as ${back.info.width}x${back.info.height}x${back.info.channels}`);
  let err = 0;
  let dustErr = 0;
  let dustPx = 0;
  let alphaErr = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const d = Math.abs(rgba[i] - back.data[i]) + Math.abs(rgba[i + 1] - back.data[i + 1]) + Math.abs(rgba[i + 2] - back.data[i + 2]);
    err += d;
    if (rgba[i + 3] < 200) {
      dustErr += d;
      dustPx++;
    }
    alphaErr = Math.max(alphaErr, Math.abs(rgba[i + 3] - back.data[i + 3]));
  }
  const meanErr = err / (3 * size * size);
  const meanDustErr = dustPx ? dustErr / (3 * dustPx) : 0;
  if (meanErr > 4 || meanDustErr > 8 || alphaErr > 2) throw new Error(`gas-${stop}: the WebP differs from the bake (colour ${meanErr.toFixed(2)}, colour under dust ${meanDustErr.toFixed(2)}, dust ${alphaErr})`);
  writeAtomic(path.join(OUT, `gas-${stop}.webp`), webp);
  await sharp(rgba, raw).flatten({ background: SKY }).resize(768, 768).png().toFile(path.join(PREVIEW, `gas-${stop}.png`));
  return webp.length;
}

async function main() {
  const input = loadInput();
  const { bakeHalf, rawHalf } = T.halves(input.positions);
  const size = T.GAS.BAKE;
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(PREVIEW, { recursive: true });
  const lumPx = {};
  const browser = await chromium.launch({ args: WEBGL_ARGS });
  try {
    await assertNativeChrome(browser);
    const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setContent('<!doctype html><canvas id="gl" width="16" height="16"></canvas>');
    await page.addScriptTag({ path: path.join(HERE, 'bake-core.js') });
    await page.addScriptTag({ path: path.join(HERE, 'bake-page.js') });
    const info = await page.evaluate((i) => globalThis.RMR_THEME.start(i), { n: input.n, positions: input.positions, weights: input.weights });
    console.log(`baking ${input.n} albums, raw square of half ${info.bakeHalf.toFixed(2)}, on ${info.renderer}`);
    for (const stop of T.STOPS) {
      const t0 = Date.now();
      lumPx[stop] = new Uint8Array(Buffer.from(await page.evaluate((s) => globalThis.RMR_THEME.renderStop(s), stop), 'base64'));
      const rgba = Buffer.alloc(4 * size * size);
      for (let y0 = 0; y0 < size; y0 += STRIP_ROWS) {
        const strip = Buffer.from(await page.evaluate(([y, rows]) => globalThis.RMR_THEME.readRows(y, rows), [y0, STRIP_ROWS]), 'base64');
        // GL rows run from the south edge up; the file is stored upright, row 0 at the north edge.
        for (let r = 0; r < STRIP_ROWS; r++) strip.copy(rgba, 4 * size * (size - 1 - (y0 + r)), 4 * size * r, 4 * size * (r + 1));
      }
      const bytes = await writeGas(stop, rgba, size);
      console.log(`gas-${stop}.webp ${Math.round(bytes / 1024)} KB (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    }
    if (errors.length) throw new Error(`the bake page reported: ${errors.join('; ')}`);
  } finally {
    await browser.close();
  }
  const theme = T.assemble(input, lumPx, bakeHalf, rawHalf);
  writeAtomic(path.join(OUT, 'theme.json'), `${JSON.stringify(theme)}\n`);
  const names = T.STOPS.map((s) => `${s} ${theme.labels[s].length}`).join(', ');
  console.log(`theme.json ${Math.round(fs.statSync(path.join(OUT, 'theme.json')).size / 1024)} KB (names: ${names}; positions ${theme.positionsHash})`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
```

- [ ] **Step 8: Write the failing guard test for the committed output**

Create `frontcreck/src/lib/data/theme.data.test.ts`:

```ts
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { STOP_IDS } from '@/lib/types';
import { isTheme, type ThemeData } from './theme';

// vitest runs from frontcreck/, like the build-time data access in server.ts
const DATA = path.resolve(process.cwd(), 'public/data');
const read = (name: string): Buffer => fs.readFileSync(path.join(DATA, name));
const theme = (): ThemeData => JSON.parse(read('theme/theme.json').toString('utf8')) as ThemeData;

describe('committed theme data (public/data/theme)', () => {
  it('has the shape the loader accepts', () => {
    expect(isTheme(theme())).toBe(true);
  });

  it('was built for the committed albums and layouts (run npm run theme after either changes)', () => {
    const t = theme();
    const albums = JSON.parse(read('albums.json').toString('utf8')) as unknown[];
    expect(t.n).toBe(albums.length);
    expect(t.positionsHash).toBe(crypto.createHash('sha256').update(read('positions.json')).digest('hex').slice(0, 12));
  });

  it('names regions at every stop, inside the baked square, with light ink', () => {
    const t = theme();
    expect(STOP_IDS.map((s) => t.labels[s].length)).toEqual([7, 17, 6]);
    for (const s of STOP_IDS) {
      for (const l of t.labels[s]) {
        expect(Math.max(Math.abs(l.x), Math.abs(l.y)), l.id).toBeLessThan(t.bakeHalf);
        expect(Math.min(...l.rgb), l.id).toBeGreaterThanOrEqual(204);
        expect(l.lum, l.id).toBeGreaterThan(0);
        expect(l.lum, l.id).toBeLessThanOrEqual(1);
      }
    }
  });

  it('colours most stars and sees gas behind most of them', () => {
    const t = theme();
    const led = t.stars.lead.filter((v) => v >= 0).length;
    expect(led).toBeGreaterThan(t.n * 0.6);
    const lit = t.stars.bg.filter((v) => v > 2).length; // the empty sky is 1 of 255
    expect(lit).toBeGreaterThan(t.stars.bg.length * 0.8);
  });

  it.each(STOP_IDS)('has a 2048 px WebP with a dust channel for %s', (stop) => {
    const b = read(`theme/gas-${stop}.webp`);
    expect(b.toString('latin1', 0, 4)).toBe('RIFF');
    expect(b.toString('latin1', 8, 16)).toBe('WEBPVP8X');
    expect(b[20] & 0x10, 'alpha flag').toBe(0x10);
    expect(1 + b.readUIntLE(24, 3)).toBe(2048);
    expect(1 + b.readUIntLE(27, 3)).toBe(2048);
    expect(b.length).toBeLessThan(1_500_000);
  });

  it('keeps theme.json under 80 KB on disk, since every map visit loads it', () => {
    expect(read('theme/theme.json').length).toBeLessThan(80_000);
  });
});
```

Run it:

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"
cd frontcreck && npm run test -- src/lib/data/theme.data.test.ts
```

Expected: every test fails with `ENOENT ... public/data/theme/...`.

- [ ] **Step 9: Run the bake (one browser, nothing else heavy running)**

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; node -p process.arch
cd frontcreck && npm run theme
```

Expected: `arm64`; then a line naming a SwiftShader renderer, three lines `gas-<stop>.webp <size> KB`, and `theme.json <size> KB (names: sonic 7, balanced 17, mood 6; positions a7c1dbd996fd)`. The whole run should take well under a minute. Each WebP must come out under 1.5 MB (the guard test checks it): if one is larger, lower `quality: 84` to `quality: 76` in `writeGas` and run again; do not raise the limit.

- [ ] **Step 10: Look at the result**

Open `frontcreck/test-results/theme/gas-balanced.png`, `gas-sonic.png` and `gas-mood.png` with the Read tool and compare `gas-balanced.png` with `docs/design/trifid-theme/options/chosen-whole.jpg` (the chosen configuration at the whole-map framing; ignore its stars, names and panels). Check: one continuous swirling cloud in rust, cream, pale ice, blue and steel-lavender; thin dark lanes; the cloud ends in plain dark sky well inside the image on every side (no gas touching an edge); north is up (the Live Belt region, raw y about +0.88 on Balanced, lies in the upper half). If the image is blank, upside down or cut off at an edge, fix `bake-page.js` or the row flip in `build-theme.mjs` before going on; do not commit a wrong bake.

- [ ] **Step 11: Run the tests to see them pass, then lint**

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"
cd frontcreck && npm run test -- src/lib/data/theme.data.test.ts scripts/theme/bake-core.test.mjs && npm run lint
```

Expected: all pass, lint prints no error.

- [ ] **Step 12: Document the command and the staleness guard in the README**

In `frontcreck/README.md`, in the Commands table, after the row that starts `| `npm run shots` |`, add this row:

```markdown
| `npm run theme` | Bakes the map theme into `public/data/theme/`: the gas of each slider stop as three images, plus `theme.json`. Uses Playwright's own Chromium on software rendering. Run it after `albums.json` or `positions.json` change (see "Map theme data"). |
```

Then, between the end of the section "How it works" (the paragraph that starts `App state (current stop, focus, hover, selection`) and the heading `## Deployment`, add this section:

```markdown
## Map theme data

The gas behind the albums is painted once, at build time, not in the visitor's browser. `npm run theme` starts one headless Chromium on software WebGL and writes four files to `public/data/theme/`, which are committed:

- `gas-sonic.webp`, `gas-balanced.webp`, `gas-mood.webp`: the gas of each slider stop, 2048 px square.
- `theme.json`: for every album its colour family and the gas brightness under it at each stop, plus the region names and where they sit.

It reads `public/data/albums.json`, `public/data/positions.json` and two input files in `../data-pipeline/theme/` (`weights.json` and `regions.json`, described in that folder's README). It changes none of them.

### When the theme goes stale

The baked files describe one album list and one set of layouts. `theme.json` records which: `n` is the album count and `positionsHash` is the first 12 hex characters of the SHA-256 of `positions.json`. When the album count or `positions.json` changes, the committed theme no longer matches the data and `npm test` fails in `src/lib/data/theme.data.test.ts`, in the test named "was built for the committed albums and layouts (run npm run theme after either changes)". The inputs have their own guard: in `../data-pipeline`, `.venv/bin/python -m rmr_pipeline.theme --check` and `tests/test_theme.py` fail when the albums were added, removed or reordered, or when the layouts moved, and `npm run theme` refuses to run until they pass.

To bake again:

1. Refresh the inputs, following `../data-pipeline/theme/README.md`. Its last step is `cd ../data-pipeline && .venv/bin/python -m rmr_pipeline.theme`.
2. `npm run theme`, on arm64 Node with nothing else heavy running.
3. Look at the previews it writes to `test-results/theme/`, run `npm test`, and commit the four files in `public/data/theme/`.

A stale or missing theme never breaks the map for a visitor: the map checks the album count, and without a matching theme it shows plain sky.
```

This is the only place the staleness guard is explained to someone who did not read this plan; keep the test name in the README identical to the one in `theme.data.test.ts` (Step 8). The text is new prose in a public repository. It follows the copy rules (no owner name, no album count, no number of recommendations, no dashes used as punctuation, no emoji) and is listed for the owner's read through; do not reword it while building.

```bash
grep -n "npm run theme" frontcreck/README.md | head -5 && grep -c "was built for the committed albums and layouts (run npm run theme after either changes)" frontcreck/README.md frontcreck/src/lib/data/theme.data.test.ts
```

Expected: the table row and the section lines, then a count of 1 for each of the two files.

- [ ] **Step 13: Commit, do not push**

```bash
git add frontcreck/README.md frontcreck/package.json frontcreck/package-lock.json frontcreck/scripts/theme/bake-core.js frontcreck/scripts/theme/bake-core.test.mjs frontcreck/scripts/theme/bake-page.js frontcreck/scripts/theme/build-theme.mjs frontcreck/src/lib/data/theme.data.test.ts frontcreck/public/data/theme/gas-sonic.webp frontcreck/public/data/theme/gas-balanced.webp frontcreck/public/data/theme/gas-mood.webp frontcreck/public/data/theme/theme.json
git commit -F - <<'EOF'
feat(theme): npm run theme bakes the gas of each stop and theme.json at build time, documented in the README

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Gas shader and its pure helpers

**Files:**
- Create: `frontcreck/src/components/map/shaders/gas.ts`
- Test: `frontcreck/src/components/map/shaders/gas.test.ts`

**Interfaces:**
- Consumes: `NAMES_BAND_PX`, `SKY_RGB`, `EMBER_RGB`, `NEUTRAL_RGB`, `STAR_WHITE`, `FRAME_RGB`, `GAS_LUM_MAX` from `../theme` (Task 2); `smoothstep` from `../state/zoomLimits`; `STOP_IDS`, `StopId` from `@/lib/types`.
- Produces (`frontcreck/src/components/map/shaders/gas.ts`):
  - `GAS_VERTEX_SHADER: string`, `GAS_FRAGMENT_SHADER: string` (three `ShaderMaterial` sources; uniforms `u_tx: vec3`, `u_quadHalf: float`, `u_gasA`, `u_gasB`, `u_noise: sampler2D`, `u_mix`, `u_ppr`, `u_bakePpr`, `u_bakeHalf`, `u_strength`, `u_deep`, `u_dust`, `u_poolAmt: float`, `u_pool: vec3`).
  - `gasCurve(coverPx: number): { strength: number; deep: number }`, the prototype's `RMR.gasCurve` with its default floor. `strength`: 1 under 13 px covers, a straight line to 0.6 at 22, a straight line to 0.3 at 32, then `0.3 + (0.06 - 0.3) * e` with `u = clamp((coverPx - 32) / (56 - 32), 0, 1)` and `e = 1 - (1 - u)^2`, so 0.06 at 56 px and over. `deep`: 0 under 32 px, `e` from there on (1 at 56 px and over). There is no `gasStrength` any more.
  - `gasDust(coverPx: number): number` (1 under 13 px, 0 from 22, smoothstep between).
  - `stopMix(t: number): { a: StopId; b: StopId; k: number }` (the piecewise rule of `shaders/album.ts` `interpolatePos`).
  - `gasPair(t: number, ready: Record<StopId, boolean>): { a: StopId; b: StopId; k: number } | null` (the textures to bind; falls back to a loaded stop; null when none is loaded).
  - `focusPool(pos: Float32Array, ids: readonly number[], minRadius: number): [number, number, number] | null` (centre and radius, in the units of `pos`, of the dim pool around a focus group).
  - `gasStopsToStart(current: StopId, interactive: boolean): StopId[]` (the stops a map starts loading, the one on screen first: only that one on the dimmed backdrop, all three on an interactive map).
  - `gasTextureFits(maxTextureSize: number): boolean`, `gasNoise(): Uint8Array`, `gasUrl(stop: StopId): string`.
  - Constants `GAS_TEXTURE_PX = 2048`, `GAS_BAND_MID_PX = 22`, `GAS_BAND_COVERS_PX = 32`, `GAS_DEEP_END_PX = 56`, `GAS_DEEP_FLOOR = 0.06`, `GAS_DEEP_DESAT = 0.35`, `GAS_DEEP_LOD: [number, number] = [3.5, 5]`, `GAS_QUAD_SCALE = 5`, `GAS_GLOW = 0.18`, `GAS_DIMMED_STRENGTH = 0.6`, `POOL_MS = 400`, `POOL_MIN_PX = 170`, `GAS_SKY: [number, number, number] = [0.024, 0.022, 0.034]`.

What the shader keeps from the prototype (`gas.js` `FINISH`, `FS_BAKED`, `FS_BLIT`): strength, dust and pool applied as `1 - (1 - c)^k`; the pool's dim (0.6 outside, 0.25 at its centre) and half desaturation; the grain; plain sky beyond the bake; the detail octaves 5 to 8 past the bake's resolution. What changes: the glow is taken in the same pass from blurred mip levels of the bake (the prototype blurred the finished screen image in a second pass); the image is upright, so `v` runs north to south. The grain is the gas shader's own dither, which the prototype keeps so that dark gradients do not band. It is not the site's film grain overlay, which the owner removed and part 3 takes out.

Deep zoom is ported from the prototype as it stands (`RMR.gasCurve` and `DEEP` in `src/config.js`, `u_deep` in `src/gas.js`, the Deep zoom section of the prototype README). The owner chose option C, "Faint" (`docs/design/trifid-theme/options/q-deep.jpg`). Past 32 px covers the strength goes on from 0.3 to the floor 0.06 at 56 px, and three more things follow the same ease `e`, which the shader receives as `u_deep`:

| What | Prototype | Here |
|---|---|---|
| Colour | mixed toward its own grey by `0.35 * e`, combined with the pool's loss of colour as `1 - (1 - pool) * (1 - 0.35 * e)` | the same line, `GAS_DEEP_DESAT = 0.35` |
| Detail | the extra octaves are multiplied by `1 - e` | the same factor |
| Focus | the bake is mixed by `e` toward the mean of its mip levels 4.5 and 6 | the same mix, at levels 3.5 and 5 (`GAS_DEEP_LOD`) |

The two mip levels are the one number that is converted and not copied. The prototype's bake is 4096 px and this one is 2048 px over the same raw square (the outermost album plus 0.6 on every side in both), so a texel here is twice as wide and the same blur sits exactly one level lower: 4.5 and 6 become 3.5 and 5. One line is added that the prototype did not need: its glow was a blur of the finished image, so in deep zoom it was already soft, while the glow here reads the bake directly. The two glow taps are therefore never sharper than `u_deep` times the deep zoom levels (`max(lod + 3.5, 3.5 * u_deep)` and `max(lod + 5.0, 5.0 * u_deep)`), which at full deep zoom makes them the same two blurred copies. With an album open the pool still multiplies the strength (0.6 far from the group, 0.25 at its centre), so an open album in deep zoom is darker still and never brighter. The values `stars.bg` and `ThemeLabel.lum` are read at strength 1 and do not change.

Cost: outside deep zoom (`u_deep` is 0 under 32 px covers) the shader does no extra work. In deep zoom it reads each bound stop twice more. That is measured in Task 6, and if it costs a frame the blurred copy is dropped there without asking (the fade, the loss of colour and the detail fade cost nothing and stay).

- [ ] **Step 1: Write the failing test**

Create `frontcreck/src/components/map/shaders/gas.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { EMBER_RGB, FRAME_RGB, GAS_LUM_MAX, NAMES_BAND_PX, NEUTRAL_RGB, SKY_RGB, STAR_WHITE } from "../theme";
import {
  GAS_BAND_COVERS_PX,
  GAS_BAND_MID_PX,
  GAS_DEEP_DESAT,
  GAS_DEEP_END_PX,
  GAS_DEEP_FLOOR,
  GAS_DEEP_LOD,
  GAS_DIMMED_STRENGTH,
  GAS_FRAGMENT_SHADER,
  GAS_GLOW,
  GAS_SKY,
  GAS_TEXTURE_PX,
  GAS_VERTEX_SHADER,
  focusPool,
  gasCurve,
  gasDust,
  gasNoise,
  gasPair,
  gasStopsToStart,
  gasTextureFits,
  gasUrl,
  stopMix,
} from "./gas";

const ALL = { sonic: true, balanced: true, mood: true };

describe("theme constants the three parts share", () => {
  it("are the chosen Ember palette, sky and bands", () => {
    expect(SKY_RGB).toEqual([6, 6, 9]);
    expect(EMBER_RGB).toEqual([[232, 96, 60], [244, 190, 120], [150, 200, 214], [66, 110, 190], [120, 140, 220]]);
    expect(NEUTRAL_RGB).toEqual([138, 138, 146]);
    expect(STAR_WHITE).toEqual([255, 250, 244]);
    expect(FRAME_RGB).toEqual([241, 236, 228]);
    expect(NAMES_BAND_PX).toBe(13);
    expect(GAS_LUM_MAX).toBe(0.6);
  });

  it("give the shader the same sky as the CSS pane", () => {
    expect(GAS_SKY.map((v) => Math.round(v * 255))).toEqual(SKY_RGB);
    expect(GAS_FRAGMENT_SHADER).toContain("const vec3 SKY = vec3(0.0240, 0.0220, 0.0340);");
  });
});

describe("gasCurve and gasDust (zoom bands by cover size)", () => {
  it("has the prototype's bands and deep zoom numbers", () => {
    expect([NAMES_BAND_PX, GAS_BAND_MID_PX, GAS_BAND_COVERS_PX, GAS_DEEP_END_PX]).toEqual([13, 22, 32, 56]);
    expect(GAS_DEEP_FLOOR).toBe(0.06);
    expect(GAS_DEEP_DESAT).toBe(0.35);
    // the prototype's mip levels 4.5 and 6 on its 4096 px bake are one level lower on a 2048 px bake
    expect(GAS_DEEP_LOD).toEqual([4.5 - Math.log2(4096 / GAS_TEXTURE_PX), 6 - Math.log2(4096 / GAS_TEXTURE_PX)]);
    expect(GAS_DEEP_LOD).toEqual([3.5, 5]);
  });

  it("keeps the gas at full strength while names show, then yields to the covers", () => {
    expect(gasCurve(5)).toEqual({ strength: 1, deep: 0 });
    expect(gasCurve(12.99)).toEqual({ strength: 1, deep: 0 });
    expect(gasCurve(17.5).strength).toBeCloseTo(0.8, 10);
    expect(gasCurve(22).strength).toBeCloseTo(0.6, 10);
    expect(gasCurve(27).strength).toBeCloseTo(0.45, 10);
    expect(gasCurve(31.99).strength).toBeCloseTo(0.3003, 10);
    for (const px of [17.5, 22, 27, 31.99]) expect(gasCurve(px).deep, String(px)).toBe(0);
  });

  it("past 32 px covers fades on to the faint floor at 56 px, eased out, with no step at 32", () => {
    expect(gasCurve(32)).toEqual({ strength: 0.3, deep: 0 });
    expect(gasCurve(38).strength).toBeCloseTo(0.195, 10);
    expect(gasCurve(38).deep).toBeCloseTo(0.4375, 10);
    expect(gasCurve(44).strength).toBeCloseTo(0.12, 10);
    expect(gasCurve(44).deep).toBeCloseTo(0.75, 10);
    expect(gasCurve(50).strength).toBeCloseTo(0.075, 10);
    expect(gasCurve(50).deep).toBeCloseTo(0.9375, 10);
    expect(gasCurve(56)).toEqual({ strength: 0.06, deep: 1 });
    expect(gasCurve(64)).toEqual({ strength: 0.06, deep: 1 });
    // never rises again as covers grow
    let last = 1;
    for (let px = 0; px <= 64; px += 0.25) {
      const { strength } = gasCurve(px);
      expect(strength, String(px)).toBeLessThanOrEqual(last);
      last = strength;
    }
  });

  it("removes the dust before covers show", () => {
    expect(gasDust(5)).toBe(1);
    expect(gasDust(13)).toBe(1);
    expect(gasDust(17.5)).toBeCloseTo(0.5, 10);
    expect(gasDust(22)).toBe(0);
    expect(gasDust(40)).toBe(0);
  });
});

describe("stopMix and gasPair (which baked stops the slider shows)", () => {
  it("mixes piecewise, as the album positions do", () => {
    expect(stopMix(0)).toEqual({ a: "sonic", b: "balanced", k: 0 });
    expect(stopMix(0.25)).toEqual({ a: "sonic", b: "balanced", k: 0.5 });
    expect(stopMix(0.5)).toEqual({ a: "sonic", b: "balanced", k: 1 });
    expect(stopMix(0.75)).toEqual({ a: "balanced", b: "mood", k: 0.5 });
    expect(stopMix(1)).toEqual({ a: "balanced", b: "mood", k: 1 });
  });

  it("binds one texture at a stop and two between stops", () => {
    expect(gasPair(0, ALL)).toEqual({ a: "sonic", b: "sonic", k: 0 });
    expect(gasPair(0.5, ALL)).toEqual({ a: "balanced", b: "balanced", k: 0 });
    expect(gasPair(1, ALL)).toEqual({ a: "mood", b: "mood", k: 0 });
    expect(gasPair(0.25, ALL)).toEqual({ a: "sonic", b: "balanced", k: 0.5 });
  });

  it("falls back to a loaded stop when the slider reaches one whose texture has not arrived", () => {
    const noMood = { sonic: true, balanced: true, mood: false };
    expect(gasPair(0.75, noMood)).toEqual({ a: "balanced", b: "balanced", k: 0 });
    expect(gasPair(1, noMood)).toEqual({ a: "balanced", b: "balanced", k: 0 });
    expect(gasPair(0.9, { sonic: false, balanced: false, mood: true })).toEqual({ a: "mood", b: "mood", k: 0 });
    expect(gasPair(0.1, { sonic: false, balanced: false, mood: true })).toEqual({ a: "mood", b: "mood", k: 0 });
    expect(gasPair(0.5, { sonic: false, balanced: false, mood: false })).toBeNull();
  });
});

describe("gasStopsToStart (which baked stops a map loads)", () => {
  it("starts only the stop on screen while the map is a dimmed backdrop", () => {
    expect(gasStopsToStart("balanced", false)).toEqual(["balanced"]);
    expect(gasStopsToStart("mood", false)).toEqual(["mood"]);
  });

  it("starts all three on an interactive map, the stop on screen first", () => {
    expect(gasStopsToStart("balanced", true)).toEqual(["balanced", "sonic", "mood"]);
    expect(gasStopsToStart("mood", true)).toEqual(["mood", "sonic", "balanced"]);
  });
});

describe("focusPool (the dim area around an open album's group)", () => {
  const pos = new Float32Array([0, 0, 2, 0, 0, 2, 9, 9]);

  it("is centred on the group's box and reaches 0.3 of its diagonal", () => {
    const p = focusPool(pos, [0, 1, 2], 0.1)!;
    expect(p[0]).toBe(1);
    expect(p[1]).toBe(1);
    expect(p[2]).toBeCloseTo(Math.hypot(2, 2) * 0.3, 10);
  });

  it("never gets smaller than the given radius", () => {
    expect(focusPool(pos, [0], 0.5)).toEqual([0, 0, 0.5]);
  });

  it("is null without a known album", () => {
    expect(focusPool(pos, [], 0.5)).toBeNull();
    expect(focusPool(pos, [99], 0.5)).toBeNull();
  });
});

describe("texture and noise", () => {
  it("needs textures of the baked size", () => {
    expect(GAS_TEXTURE_PX).toBe(2048);
    expect(gasTextureFits(2048)).toBe(true);
    expect(gasTextureFits(16384)).toBe(true);
    expect(gasTextureFits(1024)).toBe(false);
  });

  it("builds the noise table the bake was shaded with (scripts/theme/bake-core.js noiseTable)", () => {
    const t = gasNoise();
    expect(t.length).toBe(65536);
    expect(Array.from(t.slice(0, 8))).toEqual([2, 15, 250, 178, 133, 103, 119, 61]);
    expect(t[65535]).toBe(213);
    expect(t.reduce((s, v) => s + v, 0)).toBe(8329196);
  });

  it("names the baked files", () => {
    expect(gasUrl("mood")).toBe("/data/theme/gas-mood.webp");
  });
});

describe("gas shader source", () => {
  it("declares every uniform GasField sets", () => {
    for (const name of ["u_gasA", "u_gasB", "u_noise", "u_mix", "u_ppr", "u_bakePpr", "u_bakeHalf", "u_strength", "u_deep", "u_dust", "u_poolAmt", "u_pool"]) {
      expect(GAS_FRAGMENT_SHADER, name).toMatch(new RegExp(`uniform \\w+ ${name};`));
    }
    for (const name of ["u_tx", "u_quadHalf"]) expect(GAS_VERTEX_SHADER, name).toMatch(new RegExp(`uniform \\w+ ${name};`));
  });

  it("has no clock: nothing in the gas can move at rest", () => {
    expect(GAS_VERTEX_SHADER + GAS_FRAGMENT_SHADER).not.toMatch(/u_time|u_clock|u_frame/);
  });

  it("in deep zoom loses colour, detail and focus on one uniform, as the prototype does", () => {
    expect(GAS_FRAGMENT_SHADER).toContain("const float DEEP_DESAT = 0.3500;");
    expect(GAS_FRAGMENT_SHADER).toContain("const float DEEP_LOD_A = 3.5000;");
    expect(GAS_FRAGMENT_SHADER).toContain("const float DEEP_LOD_B = 5.0000;");
    expect(GAS_FRAGMENT_SHADER).toContain("t.rgb *= 1.0 + 1.6 * d * (1.0 - u_deep);");
    // at full deep zoom that factor is 0, so the four noise reads are skipped
    expect(GAS_FRAGMENT_SHADER).toContain("if (u_ppr > u_bakePpr && u_deep < 1.0) {");
    expect(GAS_FRAGMENT_SHADER).toContain("if (u_deep > 0.0) t = mix(t, 0.5 * (gasLod(uv, DEEP_LOD_A) + gasLod(uv, DEEP_LOD_B)), u_deep);");
    expect(GAS_FRAGMENT_SHADER).toContain("des = 1.0 - (1.0 - des) * (1.0 - DEEP_DESAT * u_deep);");
    expect(GAS_FRAGMENT_SHADER).toContain("max(lod + 3.5, DEEP_LOD_A * u_deep)");
    expect(GAS_FRAGMENT_SHADER).toContain("max(lod + 5.0, DEEP_LOD_B * u_deep)");
  });

  it("applies strength, dust and the pool to the light, not to the colour", () => {
    expect(GAS_FRAGMENT_SHADER).toContain("1.0 - pow(max(1.0 - t.rgb, vec3(0.002)), vec3(k * mix(1.0, t.a, u_dust)))");
    expect(GAS_FRAGMENT_SHADER).toContain("k *= mix(1.0, mix(0.6, 0.25, e), u_poolAmt);");
  });

  it("reads the upright bake (north at the top of the image) and ends in sky beyond it", () => {
    expect(GAS_FRAGMENT_SHADER).toContain("vec2(v_raw.x + u_bakeHalf, u_bakeHalf - v_raw.y) / (2.0 * u_bakeHalf)");
    expect(GAS_FRAGMENT_SHADER).toContain("vec4(0.0, 0.0, 0.0, 1.0)");
  });

  it("takes its glow from the bake's own mips", () => {
    expect(GAS_GLOW).toBe(0.18);
    expect(GAS_FRAGMENT_SHADER).toContain("const float GLOW = 0.1800;");
    expect(GAS_FRAGMENT_SHADER).toMatch(/textureLod\(u_gasA, c, lod\)/);
  });

  it("draws the quad behind the album points", () => {
    expect(GAS_VERTEX_SHADER).toContain("vec4(world, -1.0, 1.0)");
  });

  it("has balanced braces and brackets", () => {
    for (const src of [GAS_VERTEX_SHADER, GAS_FRAGMENT_SHADER]) {
      for (const [open, close] of [["{", "}"], ["(", ")"]]) expect(src.split(open).length, open).toBe(src.split(close).length);
    }
  });

  it("dims the gas on the dimmed pages", () => {
    expect(GAS_DIMMED_STRENGTH).toBeGreaterThan(0.3);
    expect(GAS_DIMMED_STRENGTH).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"
cd frontcreck && npm run test -- src/components/map/shaders/gas.test.ts
```

Expected: fails to resolve `./gas`.

- [ ] **Step 3: Write the shader and helpers**

Create `frontcreck/src/components/map/shaders/gas.ts`:

```ts
import { STOP_IDS, type StopId } from "@/lib/types";
import { smoothstep } from "../state/zoomLimits";
import { NAMES_BAND_PX } from "../theme";

/**
 * The nebula gas behind the album points. Each slider stop's gas is baked at build time (npm run theme:
 * scripts/theme/) into public/data/theme/gas-<stop>.webp, where rgb is the toned gas with no sky and no dust and
 * a is what the dust lets through. This shader draws one quad in world space: it cross-fades two stops, applies
 * the zoom band strength, the dust and the pool around an open album, adds the fine octaves the bake could not
 * hold, a soft glow from the bake's mips, the sky and a little grain. In deep zoom (covers past 32 px) what is
 * left of the gas is fainter, greyer, smooth and out of focus. It has no clock.
 */

/** Edge of a baked stop in px. WebGL2 guarantees textures this large. */
export const GAS_TEXTURE_PX = 2048;
/** Cover sizes (CSS px) where the gas has yielded to 0.6 and to 0.3 of its strength; dust is gone by the first. */
export const GAS_BAND_MID_PX = 22;
export const GAS_BAND_COVERS_PX = 32;
/** Deep zoom (the prototype's DEEP): past GAS_BAND_COVERS_PX the gas goes on fading, from 0.3 to the floor at
 * this cover size, eased out, so full-size covers sit in near-black space. */
export const GAS_DEEP_END_PX = 56;
export const GAS_DEEP_FLOOR = 0.06;
/** Share of its colour the gas loses over the same stretch. */
export const GAS_DEEP_DESAT = 0.35;
/** Over the same stretch the gas is read more and more from a blurred copy of the bake: the mean of these two
 * mip levels. The prototype uses 4.5 and 6 on a 4096 px bake of the same square; a 2048 px bake is one level lower. */
export const GAS_DEEP_LOD: [number, number] = [3.5, 5];
/** The quad is this many times the baked square, so sky and grain run on past anything the camera can show. */
export const GAS_QUAD_SCALE = 5;
/** Share of the blurred gas added back as glow. */
export const GAS_GLOW = 0.18;
/** Strength factor on Home, About and 404, where the map is a backdrop. */
export const GAS_DIMMED_STRENGTH = 0.6;
/** The pool around an open album's group: easing time, and its smallest radius on screen (CSS px). */
export const POOL_MS = 400;
export const POOL_MIN_PX = 170;
/** The empty sky as the shader writes it; rounds to SKY_RGB (../theme). */
export const GAS_SKY: [number, number, number] = [0.024, 0.022, 0.034];

export const gasUrl = (stop: StopId): string => `/data/theme/gas-${stop}.webp`;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Gas strength for a cover size in CSS px, and how far into deep zoom the view is (0 to 1). A port of the
 * prototype's RMR.gasCurve with its default floor.
 * strength: 1 while region names show; a straight line to 0.6 at 22 px covers; a straight line to 0.3 at 32 px;
 * then 0.3 + (floor - 0.3) * e, with u = (coverPx - 32) / (56 - 32) clamped to 0..1 and e = 1 - (1 - u)^2.
 * deep: e. The shader applies strength as 1 - (1 - c)^strength and uses deep for colour, detail and focus.
 */
export function gasCurve(coverPx: number): { strength: number; deep: number } {
  if (coverPx < NAMES_BAND_PX) return { strength: 1, deep: 0 };
  if (coverPx < GAS_BAND_MID_PX) return { strength: lerp(1, 0.6, (coverPx - NAMES_BAND_PX) / (GAS_BAND_MID_PX - NAMES_BAND_PX)), deep: 0 };
  if (coverPx < GAS_BAND_COVERS_PX) return { strength: lerp(0.6, 0.3, (coverPx - GAS_BAND_MID_PX) / (GAS_BAND_COVERS_PX - GAS_BAND_MID_PX)), deep: 0 };
  const u = Math.min(1, Math.max(0, (coverPx - GAS_BAND_COVERS_PX) / (GAS_DEEP_END_PX - GAS_BAND_COVERS_PX)));
  const e = 1 - (1 - u) * (1 - u);
  return { strength: lerp(0.3, GAS_DEEP_FLOOR, e), deep: e };
}

/** How much of the dust shows: all of it at the overview, none once covers approach. */
export function gasDust(coverPx: number): number {
  return 1 - smoothstep(NAMES_BAND_PX, GAS_BAND_MID_PX, coverPx);
}

/** The two stops the slider is between and how far towards the second (the rule of album.ts interpolatePos). */
export function stopMix(t: number): { a: StopId; b: StopId; k: number } {
  return t <= 0.5 ? { a: "sonic", b: "balanced", k: t * 2 } : { a: "balanced", b: "mood", k: (t - 0.5) * 2 };
}

/**
 * The textures to bind at slider position t. At a stop it is one texture twice with k 0. When a needed stop has
 * not loaded yet, the nearer loaded stop of the pair stands in (then any loaded stop), so the gas never drops
 * out while the slider moves; null when nothing has loaded.
 */
export function gasPair(t: number, ready: Record<StopId, boolean>): { a: StopId; b: StopId; k: number } | null {
  const m = stopMix(t);
  if (ready[m.a] && ready[m.b]) {
    if (m.k >= 1) return { a: m.b, b: m.b, k: 0 };
    if (m.k <= 0) return { a: m.a, b: m.a, k: 0 };
    return m;
  }
  const near = m.k < 0.5 ? m.a : m.b;
  const far = near === m.a ? m.b : m.a;
  const pick = ready[near] ? near : ready[far] ? far : STOP_IDS.find((s) => ready[s]);
  return pick ? { a: pick, b: pick, k: 0 } : null;
}

/** Centre and radius of the dim pool around a focus group: the middle of the albums' box, 0.3 of its diagonal,
 * at least `minRadius`. `pos` is flat xy; ids outside it are skipped. null when no id is known. */
export function focusPool(pos: Float32Array, ids: readonly number[], minRadius: number): [number, number, number] | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const i of ids) {
    const x = pos[2 * i];
    const y = pos[2 * i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  if (x0 === Infinity) return null;
  return [(x0 + x1) / 2, (y0 + y1) / 2, Math.max(Math.hypot(x1 - x0, y1 - y0) * 0.3, minRadius)];
}

/**
 * The stops whose gas a map starts loading, the one on screen first. The dimmed backdrop of Home, About and 404
 * takes no input and cannot reach another stop, so it starts only the stop it shows. An interactive map also
 * starts the other two, which GasField fetches at idle priority.
 */
export function gasStopsToStart(current: StopId, interactive: boolean): StopId[] {
  return interactive ? [current, ...STOP_IDS.filter((s) => s !== current)] : [current];
}

/** A smaller limit would make three resize the bake through a 2D canvas, which multiplies the dust channel into
 * the colour. Then there is no gas (plain sky). */
export function gasTextureFits(maxTextureSize: number): boolean {
  return maxTextureSize >= GAS_TEXTURE_PX;
}

/** The seeded 256 x 256 random table the bake was shaded with (mulberry32, seed 7): grain and fine octaves. */
export function gasNoise(): Uint8Array {
  let a = 7;
  const rnd = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const table = new Uint8Array(256 * 256);
  for (let i = 0; i < table.length; i++) table[i] = Math.floor(rnd() * 256);
  return table;
}

const f = (v: number) => v.toFixed(4);

export const GAS_VERTEX_SHADER = /* glsl */ `
  uniform vec3 u_tx;         // raw centre x, y and scale: world = (raw - centre) * scale
  uniform float u_quadHalf;  // half size of the quad in raw units

  varying vec2 v_raw;

  void main() {
    v_raw = position.xy * u_quadHalf;
    vec2 world = (v_raw - u_tx.xy) * u_tx.z;
    // Behind the album points (z 0 to 0.4). The material neither tests nor writes depth.
    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, -1.0, 1.0);
  }
`;

export const GAS_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D u_gasA;   // baked stop: rgb = toned gas, a = what the dust lets through
  uniform sampler2D u_gasB;   // the stop the slider is moving towards
  uniform sampler2D u_noise;  // 256 px random table (gasNoise)
  uniform float u_mix;        // 0 = only A
  uniform float u_ppr;        // CSS px per raw unit on screen
  uniform float u_bakePpr;    // texels per raw unit in the bake
  uniform float u_bakeHalf;   // the bake covers raw -half to half on both axes
  uniform float u_strength;   // zoom band times the dim of Home and About
  uniform float u_deep;       // 0 to 1: how far into deep zoom the view is (gasCurve)
  uniform float u_dust;       // 1 at the overview, 0 once covers approach
  uniform float u_poolAmt;    // 0 to 1, eased while an album opens or closes
  uniform vec3 u_pool;        // raw centre x, y and radius of the pool around an open album's group

  varying vec2 v_raw;

  const vec3 SKY = vec3(${GAS_SKY.map(f).join(", ")});
  const float GLOW = ${f(GAS_GLOW)};
  const float DEEP_DESAT = ${f(GAS_DEEP_DESAT)};
  const float DEEP_LOD_A = ${f(GAS_DEEP_LOD[0])};
  const float DEEP_LOD_B = ${f(GAS_DEEP_LOD[1])};

  float sm(float a, float b, float x) {
    float t = clamp((x - a) / (b - a), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }

  // Value noise from the random table; the smoothstep fraction makes LINEAR filtering do the interpolation.
  float vn(vec2 p) {
    vec2 i = floor(p);
    vec2 fr = fract(p);
    fr = fr * fr * (3.0 - 2.0 * fr);
    return texture2D(u_noise, (i + fr + 0.5) / 256.0).r;
  }

  // Beyond the bake there is no gas: plain sky, no dust.
  vec4 inBake(vec4 t, vec2 uv) {
    float e = step(0.5, max(abs(uv.x - 0.5), abs(uv.y - 0.5)));
    return mix(t, vec4(0.0, 0.0, 0.0, 1.0), e);
  }

  vec4 gas(vec2 uv) {
    vec2 c = clamp(uv, 0.0, 1.0);
    vec4 t = texture2D(u_gasA, c);
    if (u_mix > 0.0) t = mix(t, texture2D(u_gasB, c), u_mix);
    return inBake(t, uv);
  }

  vec4 gasLod(vec2 uv, float lod) {
    vec2 c = clamp(uv, 0.0, 1.0);
    vec4 t = textureLod(u_gasA, c, lod);
    if (u_mix > 0.0) t = mix(t, textureLod(u_gasB, c, lod), u_mix);
    return inBake(t, uv);
  }

  // The bake's tone map is 1 - exp(-EX * light), so scaling the light by k afterwards is 1 - (1 - c)^k. The zoom
  // band strength, the dust (which fades out with zoom) and the pool all act on the light this way.
  vec3 lit(vec4 t, float k) {
    return 1.0 - pow(max(1.0 - t.rgb, vec3(0.002)), vec3(k * mix(1.0, t.a, u_dust)));
  }

  void main() {
    // The image is stored upright: row 0 is the north edge.
    vec2 uv = vec2(v_raw.x + u_bakeHalf, u_bakeHalf - v_raw.y) / (2.0 * u_bakeHalf);

    float k = u_strength;
    float des = 0.0;
    if (u_poolAmt > 0.0) {
      vec2 dd = (v_raw - u_pool.xy) / u_pool.z;
      float e = exp(-dot(dd, dd) * 0.5);
      k *= mix(1.0, mix(0.6, 0.25, e), u_poolAmt);
      des = 0.5 * e * u_poolAmt;
    }

    vec4 t = gas(uv);
    // Past the bake's resolution, world-anchored noise octaves (the ones the bake could not hold) keep the gas
    // textured. They fade out in deep zoom, where the faint gas that is left must be smooth, and are not read
    // at all once deep zoom is complete (their weight is 0 there).
    if (u_ppr > u_bakePpr && u_deep < 1.0) {
      vec2 p = vec2(v_raw.x * 5.0 + 20.0, -v_raw.y * 5.0 + 20.0) * 1.25;
      float d = 0.0;
      float a = 0.0778;
      float fq = 38.0;
      for (int i = 5; i < 9; i++) {
        float have = sm(1.5, 4.0, u_bakePpr / (6.25 * fq));
        float want = sm(1.5, 4.0, u_ppr / (6.25 * fq));
        if (want > have) d += a * (want - have) * (vn(p * fq + vec2(17.3, 9.1) * float(i)) - 0.5);
        a *= 0.6;
        fq *= 2.07;
      }
      t.rgb *= 1.0 + 1.6 * d * (1.0 - u_deep);
    }
    // Deep zoom: the gas goes out of focus as it fades (a blurred copy, the mean of two mip levels), so there are
    // no blotches and no detail behind full-size covers.
    if (u_deep > 0.0) t = mix(t, 0.5 * (gasLod(uv, DEEP_LOD_A) + gasLod(uv, DEEP_LOD_B)), u_deep);
    vec3 c = lit(t, k);

    // Glow: the same gas about 11 and 32 CSS px wide, read from the bake's mips (level 0 is one texel per
    // 1 / u_bakePpr raw units, the screen shows u_ppr px per raw unit). In deep zoom it is never sharper than
    // the blurred copy above.
    float lod = log2(max(u_bakePpr / max(u_ppr, 1.0), 0.0001));
    vec3 g = lit(gasLod(uv, max(lod + 3.5, DEEP_LOD_A * u_deep)), k) * 0.6 + lit(gasLod(uv, max(lod + 5.0, DEEP_LOD_B * u_deep)), k) * 0.4;
    c += g * GLOW;

    // The pool takes half the colour at its centre and deep zoom takes DEEP_DESAT of it; the two combine.
    des = 1.0 - (1.0 - des) * (1.0 - DEEP_DESAT * u_deep);
    c = mix(c, vec3((c.r + c.g + c.b) / 3.0), des);
    float n = (texelFetch(u_noise, ivec2(gl_FragCoord.xy) & 255, 0).r - 0.5) * 0.012;
    // Colours are authored in sRGB and written straight to the framebuffer (see canvas/Scene.tsx onCreated).
    gl_FragColor = vec4(SKY + c + n, 1.0);
  }
`;
```

- [ ] **Step 4: Run the test to see it pass, then typecheck and lint**

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"
cd frontcreck && npm run test -- src/components/map/shaders/gas.test.ts && npm run typecheck && npm run lint
```

Expected: 26 tests pass; typecheck and lint print no error.

- [ ] **Step 5: Commit, do not push**

```bash
git add frontcreck/src/components/map/shaders/gas.ts frontcreck/src/components/map/shaders/gas.test.ts
git commit -F - <<'EOF'
feat(map): gas shader over the baked stops, with its zoom curve, deep zoom, mix and pool helpers

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: `GasField` in the scene, the theme in the map store, the readiness flag

**Files:**
- Create: `frontcreck/src/components/map/canvas/GasField.tsx`
- Modify: `frontcreck/src/components/map/state/mapStore.ts` (L1-4 imports, L21-57 `MapStore`, L59-94 store body)
- Test: `frontcreck/src/components/map/state/mapStore.theme.test.ts`
- Modify: `frontcreck/src/components/map/types.ts` (L1-2 imports, L59-66 `MusicMapProps`)
- Modify: `frontcreck/src/components/map/MusicMap.tsx` (L25-28)
- Modify: `frontcreck/src/components/map/MapStage.tsx` (L6-7 imports, L170, L337)
- Modify: `frontcreck/src/components/map/canvas/Scene.tsx` (L21-22 imports, L138-139, L168-169)
- Modify: `frontcreck/src/types/global.d.ts` (L14-15)
- Modify: `frontcreck/e2e/helpers.ts` (L31-34 `waitForMap`)
- Modify: `frontcreck/scripts/perf/perf.mjs` (L179), `frontcreck/scripts/review-shots.mjs` (L20)

**Interfaces:**
- Consumes: Task 2 (`ThemeData`, `themeFor`, `useThemeLoad`, `MapData.tx`), Task 3 (the files under `/data/theme/`), Task 4 (everything in `shaders/gas.ts`); `useMapStore`, `requestRender`, `coverCssPx`, `pxPerWorld`, `easeOutCubic`, `prefersReducedMotion`.
- Produces:
  - `GasField({ data, theme }: { data: MapData; theme: ThemeData }): JSX.Element` in `frontcreck/src/components/map/canvas/GasField.tsx`, mounted in `SceneInner` after `MorphDriver` and before `AlbumField`, only while the store has a theme.
  - `useMapStore`: `theme: ThemeData | null` and `setTheme(theme: ThemeData | null): void` (asks for one frame when the theme changes). Parts 2 and 3 read the theme inside the canvas tree with `useMapStore((s) => s.theme)`.
  - `MusicMapProps.theme: ThemeData | null`; `MapStage` passes `themeFor(loaded, mapData.n)`.
  - `window.__rmr.gas?: 'loading' | 'ready' | 'off'`. A stop is "started" from the moment it is scheduled: the stop on screen always, and the other two as soon as the map is interactive (`MapInput.interactive`: Explore, and the album view on desktop or in phone map mode), also while their fetch still waits for an idle slot. The flag is `'loading'` while any started stop is unsettled, `'ready'` when every started stop has settled (uploaded or failed), and `'off'` when there is no gas to wait for (theme missing, failed, built for another album count, or textures too large for the GPU). So on `/map` and on an open album `'ready'` still means all three stops are in, and on Home, About and 404 it means the one shown is in. When the backdrop turns into the map on the same page (no reload) the flag goes back to `'loading'` until the other two have settled.
  - Loading order, which the flag follows: only the current stop's image is fetched at once. The other two are fetched only on an interactive map, in an idle slot (`requestIdleCallback`, timeout 600 ms) after the first stop has settled, so they never compete with the first frame, search or covers. Home loads only the stop it shows. A stop the slider asks for is fetched at once, whether or not it was waiting. `gasStopsToStart(current, interactive)` in `shaders/gas.ts` (Task 4) is the rule.
  - `window.__rmr.gasShownMs?: number`: `performance.now()` of the first drawn frame with a gas texture on screen, written once per page load by `GasField`. The perf script reports it as "Nebula visible".
  - `window.__rmr.gasPool?: number`: the eased pool amount of the last drawn frame (0 = no open album, 1 = fully dimmed around it). `window.__rmr.gasDeep?: number`: the deep zoom amount of the last drawn frame (`gasCurve(cover).deep`: 0 up to 32 px covers, 1 from 56 px).
  - `waitForMap` (e2e) and the perf and review scripts now also wait for `gas` to be `'ready'` or `'off'`. Their code is the same for every page; what `'ready'` covers follows the rule above. A test that goes from Home to the map without a reload must first wait for the view to change (the URL, or `data-view="explore"` on `.map-pane`) and only then call `waitForMap`, or it can read the `'ready'` that Home left behind.
- Independent of where the stage starts. Part 3 extends the map stage under the header (today `.stage` has `top: var(--hdr)` in `src/styles/shell.css`). Nothing here reads the header height or the stage's offset: the quad is placed in world space, `u_ppr` and the cover size come from the canvas's own height (`state.size.height`, as `AlbumField` does), the pool radius is in px of that same scale, and the `gas` flag depends only on textures. A taller canvas changes the cover size at a given zoom for the gas and the albums alike.
- Dependency on part 3 (not done here): the map pane's CSS background must become the sky colour `rgb(6, 6, 9)` (`--color-pane`), since the pane shows before the first texture arrives and whenever the gas is off. The gas quad is opaque, so `AmbientLayers variant="map"` under the canvas and the brown `.veil` gradient on Home no longer read as designed; part 3 decides what replaces them.

- [ ] **Step 1: Write the failing store test**

Create `frontcreck/src/components/map/state/mapStore.theme.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ThemeData } from '@/lib/data/theme';
import { setInvalidate } from './invalidate';
import { useMapStore } from './mapStore';

const THEME: ThemeData = { v: 1, n: 1, positionsHash: 'a7c1dbd996fd', bakeHalf: 1.6, stars: { lead: [0], bg: [1, 2, 3] }, labels: { sonic: [], balanced: [], mood: [] } };

afterEach(() => {
  setInvalidate(null);
  useMapStore.getState().setTheme(null);
});

describe('map store theme', () => {
  it('starts without a theme, so the map can draw plain sky', () => {
    expect(useMapStore.getState().theme).toBeNull();
  });

  it('holds the theme and asks for one frame when it changes, none when it does not', () => {
    const invalidate = vi.fn();
    setInvalidate(invalidate);
    useMapStore.getState().setTheme(THEME);
    expect(useMapStore.getState().theme).toBe(THEME);
    expect(invalidate).toHaveBeenCalledTimes(1);
    useMapStore.getState().setTheme(THEME);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});
```

Run it:

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"
cd frontcreck && npm run test -- src/components/map/state/mapStore.theme.test.ts
```

Expected: fails with `setTheme is not a function`.

- [ ] **Step 2: Put the theme in the map store**

In `frontcreck/src/components/map/state/mapStore.ts` replace L1-4:

```ts
import { create } from 'zustand';
import type { MapData } from '../data';
import type { MapCallbacks, MapInput } from '../types';
import { requestRender } from './invalidate';
```

with:

```ts
import { create } from 'zustand';
import type { ThemeData } from '@/lib/data/theme';
import type { MapData } from '../data';
import type { MapCallbacks, MapInput } from '../types';
import { requestRender } from './invalidate';
```

Replace:

```ts
export interface MapStore {
  data: MapData | null;
  input: MapInput;
```

with:

```ts
export interface MapStore {
  data: MapData | null;
  /** Gas, star colours and region names; null while it loads and when there is none (plain sky, white stars). */
  theme: ThemeData | null;
  input: MapInput;
```

Replace:

```ts
  setData: (data: MapData | null) => void;
  setInput: (input: MapInput) => void;
```

with:

```ts
  setData: (data: MapData | null) => void;
  setTheme: (theme: ThemeData | null) => void;
  setInput: (input: MapInput) => void;
```

Replace:

```ts
export const useMapStore = create<MapStore>()((set) => ({
  data: null,
  input: DEFAULT_INPUT,
```

with:

```ts
export const useMapStore = create<MapStore>()((set, get) => ({
  data: null,
  theme: null,
  input: DEFAULT_INPUT,
```

Replace:

```ts
  setData: (data) => set({ data }),
  setInput: (input) => {
```

with:

```ts
  setData: (data) => set({ data }),
  setTheme: (theme) => {
    if (get().theme === theme) return;
    set({ theme });
    requestRender();
  },
  setInput: (input) => {
```

Run the test again with the command of Step 1. Expected: 2 tests pass.

- [ ] **Step 3: Type the test hooks**

In `frontcreck/src/types/global.d.ts` replace:

```ts
      /** Frames the map has rendered. */
      frames?: number;
```

with:

```ts
      /** Frames the map has rendered. */
      frames?: number;
      /** The gas layer. A stop is started from the moment it is scheduled: the stop on screen always, the other
       * two as soon as the map is interactive (also while their fetch waits for an idle slot). 'loading' while any
       * started stop is unsettled, 'ready' once every started stop is uploaded or has failed, 'off' when there is
       * no gas to wait for (no theme data, a stale theme, textures too large). So on the map 'ready' means all
       * three are in, and on Home, About and 404 it means the one shown is in. */
      gas?: 'loading' | 'ready' | 'off';
      /** performance.now() of the first drawn frame with a gas texture on screen. Written once per page load. */
      gasShownMs?: number;
      /** Eased pool amount of the last drawn frame: 0 with no album open, 1 fully dimmed around the open one. */
      gasPool?: number;
      /** Deep zoom amount of the last drawn frame: 0 up to 32 px covers, 1 once covers are 56 px or larger. */
      gasDeep?: number;
```

- [ ] **Step 4: Write `GasField`**

Create `frontcreck/src/components/map/canvas/GasField.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import type { ThemeData } from "@/lib/data/theme";
import { easeOutCubic, prefersReducedMotion } from "@/lib/media";
import { STOP_IDS, type StopId } from "@/lib/types";
import type { MapData } from "../data";
import {
  GAS_DIMMED_STRENGTH,
  GAS_FRAGMENT_SHADER,
  GAS_QUAD_SCALE,
  GAS_TEXTURE_PX,
  GAS_VERTEX_SHADER,
  POOL_MIN_PX,
  POOL_MS,
  focusPool,
  gasCurve,
  gasDust,
  gasNoise,
  gasPair,
  gasStopsToStart,
  gasTextureFits,
  gasUrl,
  stopMix,
} from "../shaders/gas";
import { useMapStore } from "../state/mapStore";
import { coverCssPx, pxPerWorld } from "../state/zoomLimits";

// Decoded off the main thread. The alpha channel is data (what the dust lets through), so it must not be
// multiplied into the colour: premultiplyAlpha "none", and never a 2D canvas.
const loader = new THREE.ImageBitmapLoader();
loader.setOptions({ imageOrientation: "none", premultiplyAlpha: "none" });

interface LoadedGas {
  texture: THREE.Texture;
  bitmap: ImageBitmap;
}

function loadGas(url: string): Promise<LoadedGas> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (result) => {
        const bitmap = result as unknown as ImageBitmap;
        const texture = new THREE.Texture(bitmap as unknown as HTMLImageElement);
        // Row 0 of the image (north) stays at v = 0; the shader flips v itself.
        texture.flipY = false;
        // The shader writes display-referred values straight to the framebuffer (Scene.tsx onCreated).
        texture.colorSpace = THREE.NoColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true; // the glow and the deep zoom blur read the mips
        texture.needsUpdate = true;
        resolve({ texture, bitmap });
      },
      undefined,
      (err) => reject(err),
    );
  });
}

/** The bitmap is kept as long as the texture: after a lost WebGL context three uploads it again. */
function disposeGas(g: LoadedGas): void {
  g.texture.dispose();
  g.bitmap.close();
}

function setGasFlag(value: "loading" | "ready" | "off"): void {
  if (window.__rmr) window.__rmr.gas = value;
}

/**
 * The nebula gas: one quad in world space under the album points, textured with the stop baked at build time.
 * The current stop's texture loads first. The other two load only on an interactive map, in an idle slot after
 * the first is on screen (or at once when the slider asks); the dimmed backdrop loads only the stop it shows.
 * Nothing here draws at rest: the dim and the pool ask for another frame only while they are easing, and a
 * texture that arrives asks for one frame. The zoom curve and deep zoom are a pure function of the camera, so
 * they change only in frames the camera has already asked for.
 */
export function GasField({ data, theme }: { data: MapData; theme: ThemeData }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const enabled = gasTextureFits(gl.capabilities.maxTextureSize);
  const loaded = useRef<Partial<Record<StopId, LoadedGas>>>({});
  // Strength factor of the dimmed pages, eased like AlbumField's dot alpha; -1 until the first frame.
  const dim = useRef(-1);
  // Pool amount (0 to 1) and its easing; value -1 until the first frame.
  const pool = useRef({ value: -1, from: 0, to: 0, start: 0 });
  // World centre and radius of the pool; kept after the album closes so the pool fades out in place.
  const poolAt = useRef<[number, number, number]>([0, 0, 1]);

  const { mesh, material, noise } = useMemo(() => {
    const noiseTex = new THREE.DataTexture(gasNoise(), 256, 256, THREE.RedFormat, THREE.UnsignedByteType);
    noiseTex.colorSpace = THREE.NoColorSpace;
    noiseTex.wrapS = THREE.RepeatWrapping;
    noiseTex.wrapT = THREE.RepeatWrapping;
    noiseTex.minFilter = THREE.LinearFilter;
    noiseTex.magFilter = THREE.LinearFilter;
    noiseTex.generateMipmaps = false;
    noiseTex.unpackAlignment = 1;
    noiseTex.needsUpdate = true;
    const mat = new THREE.ShaderMaterial({
      vertexShader: GAS_VERTEX_SHADER,
      fragmentShader: GAS_FRAGMENT_SHADER,
      // Opaque and under everything: drawn in the opaque pass, before the transparent album points.
      transparent: false,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        u_tx: { value: new THREE.Vector3(data.tx.cx, data.tx.cy, data.tx.s) },
        u_quadHalf: { value: theme.bakeHalf * GAS_QUAD_SCALE },
        u_gasA: { value: null },
        u_gasB: { value: null },
        u_noise: { value: noiseTex },
        u_mix: { value: 0 },
        u_ppr: { value: 1 },
        u_bakePpr: { value: GAS_TEXTURE_PX / (2 * theme.bakeHalf) },
        u_bakeHalf: { value: theme.bakeHalf },
        u_strength: { value: 1 },
        u_deep: { value: 0 },
        u_dust: { value: 1 },
        u_poolAmt: { value: 0 },
        u_pool: { value: new THREE.Vector3(0, 0, 1) },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    // The plane's own bounds are in quad units, not world units: never cull it.
    quad.frustumCulled = false;
    quad.renderOrder = -1;
    quad.visible = false; // until a texture is in
    return { mesh: quad, material: mat, noise: noiseTex };
  }, [data, theme]);

  useEffect(() => {
    if (!enabled) {
      setGasFlag("off");
      return;
    }
    let alive = true;
    const store: Partial<Record<StopId, LoadedGas>> = {};
    loaded.current = store;
    // A stop is "started" from the moment it is scheduled, also while its fetch still waits for an idle slot.
    const started = new Set<StopId>();
    const fetching = new Set<StopId>();
    let settled = 0;
    let firstIn = false;
    let idle: { cancel: () => void } | null = null;
    // 'loading' while any started stop is unsettled, 'ready' once every started stop is in or has failed.
    function flag(): void {
      if (alive) setGasFlag(settled === started.size ? "ready" : "loading");
    }
    function fetchStop(stop: StopId): void {
      if (!alive || fetching.has(stop)) return;
      fetching.add(stop);
      started.add(stop);
      flag();
      loadGas(gasUrl(stop))
        .then((g) => {
          if (!alive) {
            disposeGas(g);
            return;
          }
          store[stop] = g;
          // Upload now, outside a frame, so the first frame that shows this stop does not stall on it.
          gl.initTexture(g.texture);
          // frameloop="demand": a texture arriving is not an input event. Draw one frame if this stop is on
          // screen now, or if nothing is (it may stand in until the wanted stop arrives).
          const m = stopMix(useMapStore.getState().sliderT);
          if (stop === m.a || stop === m.b || !mesh.visible) invalidate();
        })
        .catch((err) => {
          console.error("gas texture failed", gasUrl(stop), err);
        })
        .finally(() => {
          settled += 1;
          flag();
          if (!firstIn) {
            firstIn = true;
            queueRest();
          }
        });
    }
    function rest(): void {
      idle = null;
      for (const stop of [...started]) fetchStop(stop);
    }
    // The stops that are started but not yet fetched wait until the first stop is on screen, and then for an
    // idle slot, so they never compete with the first frame, the search index or the covers.
    function queueRest(): void {
      if (!alive || idle || !firstIn || fetching.size === started.size) return;
      if (typeof window.requestIdleCallback === "function") {
        const handle = window.requestIdleCallback(rest, { timeout: 600 });
        idle = { cancel: () => window.cancelIdleCallback(handle) };
      } else {
        const handle = window.setTimeout(rest, 300);
        idle = { cancel: () => window.clearTimeout(handle) };
      }
    }
    function schedule(stops: StopId[]): void {
      for (const stop of stops) started.add(stop);
      flag();
      queueRest();
    }
    // The stop on screen is fetched at once. The dimmed backdrop (Home, About, 404) starts nothing else; an
    // interactive map also starts the other two, which are fetched at idle priority.
    const first = useMapStore.getState().input;
    fetchStop(first.stop);
    schedule(gasStopsToStart(first.stop, first.interactive));
    const unsubscribe = useMapStore.subscribe((s, prev) => {
      // The slider asked for a stop: fetch it at once, whether or not it was waiting for an idle slot.
      if (s.input.stop !== prev.input.stop) fetchStop(s.input.stop);
      // The backdrop became the map (same page, no reload): the other stops are started now, so the flag goes
      // back to 'loading' until they are in.
      if (s.input.interactive && !prev.input.interactive) schedule(gasStopsToStart(s.input.stop, true));
    });
    // three rebuilds its GL state after a restored context; mark every texture so it is uploaded again.
    const canvas = gl.domElement;
    const onRestored = () => {
      for (const stop of STOP_IDS) {
        const g = store[stop];
        if (g) g.texture.needsUpdate = true;
      }
      noise.needsUpdate = true;
      invalidate();
    };
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => {
      alive = false;
      idle?.cancel();
      unsubscribe();
      canvas.removeEventListener("webglcontextrestored", onRestored);
      for (const stop of STOP_IDS) {
        const g = store[stop];
        if (g) disposeGas(g);
      }
      loaded.current = {};
    };
  }, [enabled, gl, invalidate, mesh, noise]);

  // eslint-disable-next-line react-hooks/immutability -- three.js objects are mutated in place by design
  useFrame((state, delta) => {
    const { input, sliderT } = useMapStore.getState();
    const got = loaded.current;
    const pair = enabled ? gasPair(sliderT, { sonic: !!got.sonic, balanced: !!got.balanced, mood: !!got.mood }) : null;
    // eslint-disable-next-line react-hooks/immutability -- three.js objects are mutated in place by design
    mesh.visible = pair !== null;
    if (!pair) return;
    // When the nebula first showed, on the page clock. Written once; the perf script reports it.
    if (window.__rmr && window.__rmr.gasShownMs === undefined) window.__rmr.gasShownMs = performance.now();
    const u = material.uniforms;
    // eslint-disable-next-line react-hooks/immutability -- three.js objects are mutated in place by design
    u.u_gasA.value = got[pair.a]!.texture;
    u.u_gasB.value = got[pair.b]!.texture;
    u.u_mix.value = pair.k;

    const zoom = (camera as THREE.OrthographicCamera).zoom;
    const height = state.size.height;
    const ppw = pxPerWorld(zoom, height);
    const cover = coverCssPx(zoom, height);
    u.u_ppr.value = ppw * data.tx.s;
    u.u_dust.value = gasDust(cover);

    // The dimmed backdrop (Home, About, 404) eases with the dots (AlbumField). With frameloop="demand" the first
    // frame after an idle period has a delta of seconds; clamp it, or the dim would jump instead of easing.
    const reduced = prefersReducedMotion();
    const dt = Math.min(delta, 1 / 30);
    const dimTarget = input.dimmed ? GAS_DIMMED_STRENGTH : 1;
    if (dim.current < 0 || reduced) dim.current = dimTarget;
    else dim.current += (dimTarget - dim.current) * (1 - Math.exp(-dt / 0.12));
    if (Math.abs(dimTarget - dim.current) < 0.002) dim.current = dimTarget;
    else invalidate();
    // Zoom bands, and past 32 px covers the deep zoom fade to a faint remnant (strength, colour, detail, focus).
    const curve = gasCurve(cover);
    u.u_strength.value = curve.strength * dim.current;
    u.u_deep.value = curve.deep;

    // The pool: a soft dim, half desaturated area around the open album's group, at the target stop's positions.
    const focus = input.focus;
    if (focus) {
      const at = focusPool(data.pos[input.stop], [focus.seed, ...focus.recs], POOL_MIN_PX / ppw);
      if (at) poolAt.current = at;
    }
    const p = pool.current;
    const target = focus ? 1 : 0;
    const now = performance.now();
    if (p.value < 0 || reduced) {
      p.value = target;
      p.to = target;
    } else if (p.to !== target) {
      p.from = p.value;
      p.to = target;
      p.start = now;
    }
    if (p.value !== p.to) {
      const k = Math.min(1, (now - p.start) / POOL_MS);
      p.value = k >= 1 ? p.to : p.from + (p.to - p.from) * easeOutCubic(k);
      if (k < 1) invalidate();
    }
    u.u_poolAmt.value = p.value;
    const [wx, wy, wr] = poolAt.current;
    (u.u_pool.value as THREE.Vector3).set(wx / data.tx.s + data.tx.cx, wy / data.tx.s + data.tx.cy, wr / data.tx.s);
    if (window.__rmr) {
      window.__rmr.gasPool = p.value;
      window.__rmr.gasDeep = curve.deep;
    }
  });

  useEffect(() => {
    return () => {
      mesh.geometry.dispose();
      material.dispose();
      noise.dispose();
    };
  }, [mesh, material, noise]);

  return <primitive object={mesh} />;
}
```

- [ ] **Step 5: Pass the theme from `MapStage` to the store**

In `frontcreck/src/components/map/types.ts` replace L1-2:

```ts
import type { AlbumId, Focus, MapCamera, StopId } from '@/lib/types';
import type { MapData } from './data';
```

with:

```ts
import type { ThemeData } from '@/lib/data/theme';
import type { AlbumId, Focus, MapCamera, StopId } from '@/lib/types';
import type { MapData } from './data';
```

and replace:

```ts
export interface MusicMapProps {
  data: MapData;
  input: MapInput;
```

with:

```ts
export interface MusicMapProps {
  data: MapData;
  /** Null while the theme loads and when there is none: the map then shows plain sky. */
  theme: ThemeData | null;
  input: MapInput;
```

In `frontcreck/src/components/map/MusicMap.tsx` replace:

```tsx
export default function MusicMap({ data, input, callbacks, initialCamera, onApi }: MusicMapProps) {
  useLayoutEffect(() => {
    useMapStore.getState().setData(data);
  }, [data]);
```

with:

```tsx
export default function MusicMap({ data, theme, input, callbacks, initialCamera, onApi }: MusicMapProps) {
  useLayoutEffect(() => {
    useMapStore.getState().setData(data);
  }, [data]);
  useLayoutEffect(() => {
    useMapStore.getState().setTheme(theme);
  }, [theme]);
```

In `frontcreck/src/components/map/MapStage.tsx` replace L6-7:

```ts
import { toSummary } from '@/lib/data/catalog';
import { useCatalog, usePositions } from '@/lib/data/useData';
```

with:

```ts
import { toSummary } from '@/lib/data/catalog';
import { themeFor } from '@/lib/data/theme';
import { useCatalog, usePositions, useThemeLoad } from '@/lib/data/useData';
```

Replace L170:

```ts
  const mapData = useMemo(() => (catalog && positions ? buildMapData(catalog.albums, positions) : null), [catalog, positions]);
```

with:

```ts
  const mapData = useMemo(() => (catalog && positions ? buildMapData(catalog.albums, positions) : null), [catalog, positions]);
  // The theme is optional. Missing, failed or built for another album count, the map goes on with plain sky.
  const { status: themeStatus, theme: loadedTheme } = useThemeLoad(enabled);
  const theme = mapData ? themeFor(loadedTheme, mapData.n) : null;
  useEffect(() => {
    // Tests wait for the gas to settle (e2e/helpers.ts waitForMap); tell them when there is none to wait for.
    if (!window.__rmr) return;
    if (themeStatus === 'error' || (mapData !== null && loadedTheme !== null && theme === null)) window.__rmr.gas = 'off';
  }, [themeStatus, mapData, loadedTheme, theme]);
```

Replace L337:

```tsx
          <MusicMap data={mapData} input={input} callbacks={callbacks} initialCamera={null} onApi={onApi} />
```

with:

```tsx
          <MusicMap data={mapData} theme={theme} input={input} callbacks={callbacks} initialCamera={null} onApi={onApi} />
```

- [ ] **Step 6: Mount `GasField` in the scene**

In `frontcreck/src/components/map/canvas/Scene.tsx` replace:

```tsx
import { FocusFramer } from "./FocusFramer";
import { FRUSTUM_HALF_HEIGHT, InitialFrame } from "./InitialFrame";
```

with:

```tsx
import { FocusFramer } from "./FocusFramer";
import { GasField } from "./GasField";
import { FRUSTUM_HALF_HEIGHT, InitialFrame } from "./InitialFrame";
```

Replace:

```tsx
function SceneInner({ initialCamera, onApi }: { initialCamera: MapCamera | null; onApi: (api: MapApi | null) => void }) {
  const data = useMapStore((s) => s.data)!;
```

with:

```tsx
function SceneInner({ initialCamera, onApi }: { initialCamera: MapCamera | null; onApi: (api: MapApi | null) => void }) {
  const data = useMapStore((s) => s.data)!;
  const theme = useMapStore((s) => s.theme);
```

Replace:

```tsx
      <MorphDriver />
      <AlbumField data={data} atlasTextures={textures} positionsRef={positionsRef} />
```

with:

```tsx
      <MorphDriver />
      {/* The gas reads the slider position MorphDriver has just written and is drawn under the album points.
          Without a theme there is no gas: the pane's sky colour shows through the transparent canvas. */}
      {theme ? <GasField data={data} theme={theme} /> : null}
      <AlbumField data={data} atlasTextures={textures} positionsRef={positionsRef} />
```

- [ ] **Step 7: Make the test and measurement scripts wait for the gas**

In `frontcreck/e2e/helpers.ts` replace:

```ts
/** Waits until the map has loaded, rendered and exposed its API. */
export async function waitForMap(page: Page): Promise<void> {
  await page.waitForFunction(() => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0, null, { timeout: 20_000 });
}
```

with:

```ts
/** Waits until the map has loaded, rendered and exposed its API, and its gas has settled: every started stop's
 * texture is in ('ready': all three on an interactive map, the one shown on Home, About and 404), or there is
 * none to wait for ('off'). After this no late texture can cost a frame inside a test's idle window. After going
 * from Home to the map without a reload, wait for the view to change before calling this. */
export async function waitForMap(page: Page): Promise<void> {
  await page.waitForFunction(
    () => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0 && (window.__rmr?.gas === 'ready' || window.__rmr?.gas === 'off'),
    null,
    { timeout: 20_000 },
  );
}
```

In `frontcreck/scripts/perf/perf.mjs` L179 replace:

```js
  await page.waitForFunction(() => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0, null, { timeout: 20000 });
```

with:

```js
  await page.waitForFunction(() => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0 && (window.__rmr?.gas === 'ready' || window.__rmr?.gas === 'off'), null, { timeout: 20000 });
```

In `frontcreck/scripts/review-shots.mjs` L20 replace:

```js
const mapReady = (p) => p.waitForFunction(() => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0, null, { timeout: 20000 });
```

with:

```js
const mapReady = (p) => p.waitForFunction(() => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0 && (window.__rmr?.gas === 'ready' || window.__rmr?.gas === 'off'), null, { timeout: 20000 });
```

- [ ] **Step 8: Unit tests, typecheck, lint**

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"
cd frontcreck && npm run test && npm run typecheck && npm run lint
```

Expected: every unit test passes; typecheck and lint print no error. `GasField.tsx` as written above carries three `react-hooks/immutability` comments (above `useFrame`, above `mesh.visible` and above the first uniform write); with those three, ESLint 9.39.4 with this repo's config reports nothing on the file, and it reports the first uniform write when the third is missing. If lint still reports the rule on another line of `GasField.tsx` that mutates a three.js object or a ref inside `useFrame`, put the same comment on the line above it, exactly as `AlbumField.tsx` does: `// eslint-disable-next-line react-hooks/immutability -- three.js objects are mutated in place by design`.

- [ ] **Step 9: The existing demand-rendering test still holds with the gas in (one browser)**

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; node -p process.arch
cd frontcreck && npx playwright test map.spec.ts --project=desktop --workers=1
```

Expected: `arm64`; every test of `map.spec.ts` passes, including `the map is a lazily loaded WebGL canvas that renders on demand` (at most one frame in its 1200 ms idle window). The run builds the app first, which takes a few minutes. Then open `frontcreck/test-results/shots/desktop-explore.png` with the Read tool: the Ember gas is behind the albums, north up, and matches `frontcreck/test-results/theme/gas-balanced.png` in shape. The pane beyond the gas is still the old brown until part 3 changes `--color-pane`; that is expected here.

- [ ] **Step 10: Commit, do not push**

```bash
git add frontcreck/src/components/map/canvas/GasField.tsx frontcreck/src/components/map/canvas/Scene.tsx frontcreck/src/components/map/state/mapStore.ts frontcreck/src/components/map/state/mapStore.theme.test.ts frontcreck/src/components/map/types.ts frontcreck/src/components/map/MusicMap.tsx frontcreck/src/components/map/MapStage.tsx frontcreck/src/types/global.d.ts frontcreck/e2e/helpers.ts frontcreck/scripts/perf/perf.mjs frontcreck/scripts/review-shots.mjs
git commit -F - <<'EOF'
feat(map): gas layer under the album points, loaded per stop after first paint

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Browser checks for the gas and its failure modes

**Files:**
- Create: `frontcreck/e2e/gas.spec.ts`
- Modify: `frontcreck/e2e/nowebgl.spec.ts` (L4-16, the first test)
- Modify: `frontcreck/scripts/perf/perf.mjs` (`VIEWPORTS` and a `--no-gas` flag, `exploreFlow`, `measure`, `main`: six edits), `frontcreck/scripts/perf/lib.mjs` (`ROWS`, three reported rows and an `n/a` formatter), `frontcreck/scripts/perf/lib.test.mjs` (one added test). `budgets.json`, `BUDGET_KEYS`, `GAP_KEYS` and `checkBudgets` are not touched.
- Create: `docs/design/trifid-theme/reviews/app-perf-part1.md` (the comparison with the baseline and the regression checklist), its raw output beside it (`perf-part1/perf-run1.txt` and `.json` to `perf-part1/perf-run3.txt` and `.json`, `app-hover-part1.json`, `app-hover-part1.txt`), and `docs/design/trifid-theme/reviews/app-fidelity-part1.md`
- Read, and edited in one place only: `docs/design/trifid-theme/reviews/baseline/`. The one allowed edit is the dpr 2 column of today's site, which the baseline lacks (Step 7): six new files `perf/perf-dpr2-run1.json` to `perf-dpr2-run3.json` and `.txt`, and one section appended to `BASELINE-PERF.md`. Everything else there is never edited (`REGRESSION-CHECKLIST.md`, `README.md`, the existing files in `perf/`, `shots/`, `hover-measure.mjs`, `capture.mjs`, and every existing line of `BASELINE-PERF.md`)

**Interfaces:**
- Consumes: `waitForMap`, `waitForCameraIdle`, `waitForMapQuiet`, `visibleAlbumPoint`, `isPhone`, `shot` from `e2e/helpers.ts`; `window.__rmr.gas`, `window.__rmr.gasPool`, `window.__rmr.gasDeep`, `window.__rmr.map` (`screenPoint`, `isAnimating`, `flyTo`, `getCamera`, `setCamera`), `window.__rmr.getState()` (`setStop`, `webgl`, `selected`); `COPY.map.exploreHere`, `COPY.map.noWebgl`, `COPY.nav.label`, `COPY.nav.map`.
- Produces: nothing other parts import. `lumaAt` in `gas.spec.ts` (luma at a quantile of a screenshot rectangle; the median reads the background between dots and covers) may be copied by part 2 for star checks. The perf script gains, all reported only (Step 6): the viewport `desktop2x` and with it a fifth column `gpu desktop2x`; the rows "Nebula visible (reported only)" (`gasShownMs`), "Deep zoom drag worst frame gap (reported only)" (`deepDragGapMs`) and "Deep zoom, slider between stops, worst frame gap (reported only)" (`deepMorphGapMs`); `deepZoom` in the raw JSON; and the flag `--no-gas`. Parts 2 and 3 see all of them in their runs. The baseline folder gains the dpr 2 column of today's site (Step 7): `baseline/perf/perf-dpr2-run1.json` to `perf-dpr2-run3.json` and `.txt`, and one section in `BASELINE-PERF.md`.

Nothing in these checks assumes the map starts below the header, which part 3 changes. Positions come from `screenPoint`, which is in client px from the canvas's own rectangle; screenshots are of the whole page; a sampled patch must pass `onCanvas`, which rejects a point with anything over the canvas; and the bare patch search of the deep zoom test stays 140 px inside the top and bottom of the window, clear of a header of any kind.

A limit of two thresholds until part 3. The map pane keeps its old brown background (`#17120e`, luma about 19) until part 3 Task 1 changes the token to the sky colour, and a canvas with no gas quad would show that pane. So in tests 1, 4 and 5 the bounds `SKY_LUMA * 3` (18.6) and `SKY_LUMA * 2` (12.4) do not by themselves tell gas from no gas while part 1 and part 2 are being built: there the proof that the gas is on screen is the `gas` flag, the list of requested files, the dimming and deep zoom ratios of tests 2 and 3 (a plain pane has no ratio) and the screenshot looked at in Task 5. From part 3 Task 1 on the bounds alone prove it. Do not raise them here without a measured gas value; record the luma these two tests read in `app-perf-part1.md` so part 3 can tighten the bound to a measured number if it wants to.

There is no `e2e/data.ts` in this repo; the helpers are in `e2e/helpers.ts` and the pixel readers are local to `e2e/explore.spec.ts`.

- [ ] **Step 1: Write the gas spec**

Create `frontcreck/e2e/gas.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { isPhone, shot, visibleAlbumPoint, waitForCameraIdle, waitForMap, waitForMapQuiet } from './helpers';

/** In Rainbows in albums.json: near the middle of every layout, where the gas is dense. */
const IN_RAINBOWS = 11;
/** Luma of the empty sky, rgb(6, 6, 9). The old brown pane, #17120e, is about 19. */
const SKY_LUMA = 6.2;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Luma at quantile q of a client-px rectangle of the screenshot. The median reads the background between album
 * dots and covers, which is the gas. */
async function lumaAt(page: Page, r: Rect, q = 0.5): Promise<number> {
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ([data, rect, quantile]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const k = img.width / innerWidth;
      const d = ctx.getImageData(Math.round(rect.x * k), Math.round(rect.y * k), Math.round(rect.w * k), Math.round(rect.h * k)).data;
      const lumas: number[] = [];
      for (let i = 0; i < d.length; i += 4) lumas.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      lumas.sort((a, b) => a - b);
      return lumas[Math.floor((lumas.length - 1) * quantile)];
    },
    [png, r, q] as const,
  );
}

/** A square of client px centred `offset` away from an album's point on screen. */
async function patchAt(page: Page, id: number, offset: readonly [number, number], size: number): Promise<Rect> {
  const p = (await page.evaluate((i) => window.__rmr!.map!.screenPoint(i), id))!;
  return { x: p.x + offset[0] - size / 2, y: p.y + offset[1] - size / 2, w: size, h: size };
}

/** True when the centre and the four corners of the rectangle are on the map canvas (no marker, panel or button there). */
async function onCanvas(page: Page, r: Rect): Promise<boolean> {
  return page.evaluate(
    (q) =>
      [[0.5, 0.5], [0, 0], [1, 0], [0, 1], [1, 1]].every(([fx, fy]) => {
        const x = q.x + q.w * fx;
        const y = q.y + q.h * fy;
        return x > 0 && y > 0 && x < innerWidth && y < innerHeight && !!document.elementFromPoint(x, y)?.classList.contains('map-canvas');
      }),
    r,
  );
}

/** Offsets tried, in order, for a patch of bare map beside an open album: inside its pool, clear of its markers. */
const BESIDE: readonly (readonly [number, number])[] = [[200, 0], [-200, 0], [0, -180], [0, 180], [260, 0], [-260, 0]];

/** The point on the canvas that is furthest from every album (in the larger of its x and y distances), if that
 * is at least `clearance` client px: bare gas with no cover near it. Kept 140 px inside the top and bottom of
 * the window and 100 px inside its sides, away from the header and the controls. */
async function barePoint(page: Page, clearance: number): Promise<{ x: number; y: number } | null> {
  return page.evaluate((need) => {
    const api = window.__rmr!.map!;
    const pts: { x: number; y: number }[] = [];
    for (let id = 0; ; id++) {
      const p = api.screenPoint(id);
      if (!p) break;
      if (p.x > -need && p.y > -need && p.x < innerWidth + need && p.y < innerHeight + need) pts.push(p);
    }
    let best: { x: number; y: number; d: number } | null = null;
    for (let y = 140; y <= innerHeight - 140; y += 12) {
      for (let x = 100; x <= innerWidth - 100; x += 12) {
        let d = Infinity;
        for (const p of pts) {
          d = Math.min(d, Math.max(Math.abs(p.x - x), Math.abs(p.y - y)));
          if (d < need) break;
        }
        if (d < need || (best && d <= best.d)) continue;
        if (document.elementFromPoint(x, y)?.classList.contains('map-canvas')) best = { x, y, d };
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }, clearance);
}

test('the gas is drawn behind the albums at the overview, and nothing draws at rest', async ({ page }, info) => {
  test.skip(isPhone(info), 'the gas checks use the desktop framing');
  const requested: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/data/theme/')) requested.push(new URL(r.url()).pathname);
  });
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  expect(await page.evaluate(() => window.__rmr!.gas)).toBe('ready');
  // polled: the other two stops are fetched in an idle slot, so their requests must not be raced
  await expect.poll(() => [...requested].sort()).toEqual(['/data/theme/gas-balanced.webp', '/data/theme/gas-mood.webp', '/data/theme/gas-sonic.webp', '/data/theme/theme.json']);
  expect(await lumaAt(page, await patchAt(page, IN_RAINBOWS, [0, 0], 80))).toBeGreaterThan(SKY_LUMA * 3);
  expect(await page.evaluate(() => window.__rmr!.gasPool)).toBe(0);
  const f1 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  await page.waitForTimeout(1200); // the idle window: with every texture in, the map must not draw
  const f2 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  expect(f2 - f1).toBeLessThanOrEqual(1);
});

test('the gas dims around an open album and comes back when it closes', async ({ page }, info) => {
  test.skip(isPhone(info), 'the gas checks use the desktop framing');
  await page.goto('/album/in-rainbows-radiohead');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await waitForMapQuiet(page, 300);
  expect(await page.evaluate(() => window.__rmr!.gasPool)).toBe(1);
  const zoom = (await page.evaluate(() => window.__rmr!.map!.getCamera())).zoom;
  // A patch of bare map beside the album; the same patch of the map is read again once the album is closed.
  let offset: readonly [number, number] | null = null;
  for (const o of BESIDE) {
    if (await onCanvas(page, await patchAt(page, IN_RAINBOWS, o, 120))) {
      offset = o;
      break;
    }
  }
  expect(offset, 'a patch of bare map beside the open album').not.toBeNull();
  const dimmed = await lumaAt(page, await patchAt(page, IN_RAINBOWS, offset!, 120));
  await page.getByRole('button', { name: COPY.map.exploreHere }).click();
  await expect(page).toHaveURL(/\/map$/);
  await waitForCameraIdle(page);
  await page.evaluate((z) => {
    const api = window.__rmr!.map!;
    const cam = api.getCamera();
    if (Math.abs(cam.zoom - z) > 1e-3) api.setCamera({ ...cam, zoom: z }, false);
  }, zoom);
  await waitForCameraIdle(page);
  await waitForMapQuiet(page, 300);
  expect(await page.evaluate(() => window.__rmr!.gasPool)).toBe(0);
  const closed = await patchAt(page, IN_RAINBOWS, offset!, 120);
  expect(await onCanvas(page, closed), 'the same patch is on the map after the album closes').toBe(true);
  const plain = await lumaAt(page, closed);
  expect(plain, 'the sampled patch must show gas').toBeGreaterThan(SKY_LUMA + 4);
  expect(dimmed - SKY_LUMA).toBeLessThan((plain - SKY_LUMA) * 0.85);
});

test('past 32 px covers the gas fades on to a faint remnant at full-size covers', async ({ page }, info) => {
  test.skip(isPhone(info), 'the gas checks use the desktop framing');
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  // flyTo centres the album and zooms until covers are 32 px: the end of the bands, where deep zoom starts.
  await page.evaluate((id) => window.__rmr!.map!.flyTo(id), IN_RAINBOWS);
  await expect.poll(() => page.evaluate(() => window.__rmr!.map!.isAnimating())).toBe(false);
  await waitForCameraIdle(page);
  const at32 = await page.evaluate(() => window.__rmr!.map!.getCamera());
  // (rounding may leave the cover a hair past 32 px, so this is "about 0", not exactly 0)
  expect(await page.evaluate(() => window.__rmr!.gasDeep)).toBeLessThan(0.001);
  // Twice the zoom: 64 px covers, past the 56 px where the fade ends.
  await page.evaluate((c) => window.__rmr!.map!.setCamera({ ...c, zoom: c.zoom * 2 }, false), at32);
  await waitForCameraIdle(page);
  await waitForMapQuiet(page, 300);
  expect(await page.evaluate(() => window.__rmr!.gasDeep)).toBe(1);
  await shot(page, info, 'gas-deep');
  // A point of bare gas: 60 px clear of every album here, so 30 px clear at half the zoom, where covers are 32 px.
  const bare = await barePoint(page, 60);
  expect(bare, 'a point of bare map at full zoom').not.toBeNull();
  const seed64 = (await page.evaluate((i) => window.__rmr!.map!.screenPoint(i), IN_RAINBOWS))!;
  const deep = await lumaAt(page, { x: bare!.x - 8, y: bare!.y - 8, w: 16, h: 16 });
  // The same point of the map with 32 px covers: half as far from the album on screen.
  await page.evaluate((c) => window.__rmr!.map!.setCamera(c, false), at32);
  await waitForCameraIdle(page);
  await waitForMapQuiet(page, 300);
  expect(await page.evaluate(() => window.__rmr!.gasDeep)).toBeLessThan(0.001);
  const seed32 = (await page.evaluate((i) => window.__rmr!.map!.screenPoint(i), IN_RAINBOWS))!;
  const same = { x: seed32.x + (bare!.x - seed64.x) / 2 - 8, y: seed32.y + (bare!.y - seed64.y) / 2 - 8, w: 16, h: 16 };
  expect(await onCanvas(page, same), 'the same point is on the map at 32 px covers').toBe(true);
  const mid = await lumaAt(page, same);
  expect(mid, 'the sampled point must show gas at 32 px covers').toBeGreaterThan(SKY_LUMA + 4);
  // Strength 0.06 against 0.3 leaves about a fifth of the light; the old floor of 0.3 would leave all of it.
  expect(deep - SKY_LUMA).toBeLessThan((mid - SKY_LUMA) * 0.6);
  expect(deep, 'a faint remnant, not a hole in the sky').toBeGreaterThan(SKY_LUMA - 2);
});

test('moving the slider to a stop whose gas has not arrived keeps gas on screen, draws nothing at rest and breaks nothing', async ({ page }, info) => {
  test.skip(isPhone(info), 'the gas checks use the desktop framing');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/data/theme/gas-mood.webp', async (route) => {
    await held;
    await route.continue();
  });
  const balanced = page.waitForResponse((r) => r.url().endsWith('/data/theme/gas-balanced.webp') && r.ok());
  await page.goto('/map');
  await balanced;
  await page.waitForFunction(() => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0, null, { timeout: 20_000 });
  await waitForMapQuiet(page, 300);
  expect(await page.evaluate(() => window.__rmr!.gas)).toBe('loading');
  await page.evaluate(() => window.__rmr!.getState().setStop('mood'));
  await expect.poll(() => page.evaluate(() => window.__rmr!.map!.isAnimating())).toBe(false);
  await waitForMapQuiet(page, 300);
  const vp = page.viewportSize()!;
  const middle = { x: vp.width / 2 - 150, y: vp.height / 2 - 150, w: 300, h: 300 };
  // the Balanced gas stands in while the Mood texture is held back: no blank frame
  expect(await lumaAt(page, middle)).toBeGreaterThan(SKY_LUMA * 2);
  // and no redraw loop while it waits: the frame counter stops
  expect(await page.evaluate(() => window.__rmr!.gas)).toBe('loading');
  const f1 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  await page.waitForTimeout(1200);
  const f2 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  expect(f2 - f1, 'frames drawn while the stand-in stop shows').toBeLessThanOrEqual(1);
  release();
  await waitForMap(page);
  await waitForMapQuiet(page, 300);
  expect(await lumaAt(page, middle)).toBeGreaterThan(SKY_LUMA * 2);
  expect(errors).toEqual([]);
});

test('the gas comes back after the WebGL context is lost and restored', async ({ page }, info) => {
  test.skip(isPhone(info), 'the gas checks use the desktop framing');
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  const patch = await patchAt(page, IN_RAINBOWS, [0, 0], 80);
  expect(await lumaAt(page, patch)).toBeGreaterThan(SKY_LUMA * 3);
  await page.evaluate(async () => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas.map-canvas')!;
    const lose = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    const restored = new Promise((resolve) => canvas.addEventListener('webglcontextrestored', resolve, { once: true }));
    lose.loseContext();
    await new Promise((resolve) => setTimeout(resolve, 300));
    lose.restoreContext();
    await restored;
  });
  await waitForMapQuiet(page, 300);
  expect(await page.evaluate(() => window.__rmr!.getState().webgl)).toBe('ok');
  expect(await lumaAt(page, patch)).toBeGreaterThan(SKY_LUMA * 3);
});

test('without theme data the map still works, with plain sky and no gas requests', async ({ page }, info) => {
  test.skip(isPhone(info), 'the gas checks use the desktop framing');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const gasRequests: string[] = [];
  page.on('request', (r) => {
    if (/\/data\/theme\/gas-\w+\.webp$/.test(r.url())) gasRequests.push(r.url());
  });
  await page.route('**/data/theme/theme.json', (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'missing' }));
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  expect(await page.evaluate(() => window.__rmr!.gas)).toBe('off');
  expect(await page.evaluate(() => window.__rmr!.getState().webgl)).toBe('ok');
  await expect(page.locator('canvas.map-canvas')).toBeVisible();
  const p = await visibleAlbumPoint(page);
  await page.mouse.click(p.x, p.y);
  await expect.poll(() => page.evaluate(() => window.__rmr!.getState().selected)).not.toBeNull();
  expect(gasRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('Home loads only the gas of the stop it shows, and the other two wait for the map', async ({ page }, info) => {
  test.skip(isPhone(info), 'the gas checks use the desktop framing');
  const requested: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/data/theme/')) requested.push(new URL(r.url()).pathname);
  });
  await page.goto('/');
  await waitForMap(page);
  expect(await page.evaluate(() => window.__rmr!.gas)).toBe('ready');
  await page.waitForTimeout(1500); // well past the idle slot in which an interactive map fetches the other stops
  expect([...requested].sort()).toEqual(['/data/theme/gas-balanced.webp', '/data/theme/theme.json']);
  // The same canvas becomes the interactive map: now, and only now, the other two stops are fetched.
  await page.getByRole('navigation', { name: COPY.nav.label }).getByRole('link', { name: COPY.nav.map, exact: true }).click();
  await expect(page.locator('.map-pane')).toHaveAttribute('data-view', 'explore');
  await expect.poll(() => [...requested].sort()).toEqual(['/data/theme/gas-balanced.webp', '/data/theme/gas-mood.webp', '/data/theme/gas-sonic.webp', '/data/theme/theme.json']);
  await waitForMap(page);
  expect(await page.evaluate(() => window.__rmr!.gas)).toBe('ready');
});
```

- [ ] **Step 2: Extend the no-WebGL test**

In `frontcreck/e2e/nowebgl.spec.ts` replace the first test (L4-16):

```ts
test('without WebGL the map shows a message and search still works', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/map');
  await expect(page.getByText(COPY.map.noWebgl)).toBeVisible();
  await expect(page.locator('canvas.map-canvas')).toHaveCount(0);
  expect(await page.evaluate(() => window.__rmr!.getState().webgl)).toBe('unavailable');
  const input = page.getByRole('combobox', { name: COPY.search.label });
  await input.click();
  await input.pressSequentially('loveless');
  await expect(page.getByRole('option').first()).toContainText('Loveless');
  expect(errors).toEqual([]);
});
```

with:

```ts
test('without WebGL the map shows a message, asks for no theme file, and search still works', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const themeRequests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/data/theme/')) themeRequests.push(r.url());
  });
  await page.goto('/map');
  await expect(page.getByText(COPY.map.noWebgl)).toBeVisible();
  await expect(page.locator('canvas.map-canvas')).toHaveCount(0);
  expect(await page.evaluate(() => window.__rmr!.getState().webgl)).toBe('unavailable');
  const input = page.getByRole('combobox', { name: COPY.search.label });
  await input.click();
  await input.pressSequentially('loveless');
  await expect(page.getByRole('option').first()).toContainText('Loveless');
  expect(themeRequests).toEqual([]);
  expect(errors).toEqual([]);
});
```

This test is extended, not loosened: every earlier assertion is still there (the message, no canvas, `webgl` is `'unavailable'`, search works, no page error), and it now also proves that a browser without WebGL never asks for a theme file.

- [ ] **Step 3: Run the gas spec (one browser)**

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; node -p process.arch
cd frontcreck && npx playwright test gas.spec.ts --project=desktop --workers=1
```

Expected: `arm64`; 7 tests pass. These tests exercise code that Task 5 already wrote, so they are expected to pass on the first run; to see each one fail for the right reason once, temporarily change `u.u_strength.value = curve.strength * dim.current;` in `GasField.tsx` to `u.u_strength.value = 0;`, rerun (tests 1, 4 and 5 fail on the luma checks, test 2 on `the sampled patch must show gas`, test 3 on `the sampled point must show gas at 32 px covers`), and restore the line. To see the deep zoom test catch the old behaviour, temporarily change `return { strength: lerp(0.3, GAS_DEEP_FLOOR, e), deep: e };` in `shaders/gas.ts` to `return { strength: 0.3, deep: e };`, rerun (test 3 fails on its ratio), and restore the line. If the context loss test fails because the album points themselves do not come back after the restore (a fault of the existing map, not of the gas), stop and report it with the trace instead of changing `Scene.tsx`.

If test 3 fails on `a point of bare map at full zoom` (no 120 px gap between albums around In Rainbows at full zoom), do not lower the clearance, which would let a cover into the sample: move the test to a sparser place by replacing `IN_RAINBOWS` in that test with the id of an album near the edge of the dense middle, and say which in the hand-off note.

Then open `frontcreck/test-results/shots/desktop-gas-deep.png` with the Read tool beside `docs/design/trifid-theme/options/q-deep.jpg` (panel C, "Faint"): full-size covers on near-black sky with a faint, smooth trace of the local colour, no blotches, no texture.

- [ ] **Step 4: Run the no-WebGL project (one browser)**

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"
cd frontcreck && npx playwright test nowebgl.spec.ts --project=nowebgl --workers=1
```

Expected: 2 tests pass.

- [ ] **Step 5: Run the suites the gas can disturb (one browser at a time, one command after the other)**

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"
(cd frontcreck && npx playwright test map.spec.ts explore.spec.ts focus.spec.ts --project=desktop --workers=1)
(cd frontcreck && npx playwright test map.spec.ts --project=phone --workers=1)
```

Expected: the frame-count checks pass (`map.spec.ts` idle window, `focus.spec.ts` `rendered frames to settle`). One existing assertion may no longer hold, because it measures against the old pane colour: `explore.spec.ts` `in cover mode the picked album is drawn large on top, framed in lamp, with the other covers dimmed` compares mean luma with `PANE_LUMA = 19` (the brown pane), and there is gas behind those covers now. If only that assertion fails, do not edit the test here: part 3 owns the pane colour (its Task 1) and rewrites that check (its Task 7), so list it in the hand-off note with the measured `dimmed` and `plain` values. Any other failure is this part's to fix before committing.

- [ ] **Step 6: Extend the perf script: deep zoom, the nebula's first frame, a dpr 2 column (all reported, none budgeted)**

`npm run perf` drags and zooms at the overview, at device pixel ratio 1 on desktop, and never reaches full-size covers. So it would not see the three places where the gas costs most: the deep zoom blur, a slider move at full zoom (both stops bound, the blur read from both), and a desktop screen at device pixel ratio 2, where the quad covers four times the pixels. This step adds them. Everything added is reported only: `budgets.json`, `BUDGET_KEYS`, `GAP_KEYS` and `checkBudgets` stay exactly as they are, and a value that is missing prints `n/a` and never throws. Part 3 edits these two files again, so make the seven edits below and no others.

What is added:

- `VIEWPORTS.desktop2x`: 1440 x 900 at `deviceScaleFactor: 2`. A default run gains a fifth column, `gpu desktop2x`, measured in gpu mode only and never passed to `checkBudgets`. `--viewport desktop2x` runs it alone.
- `deepDragGapMs`, row "Deep zoom drag worst frame gap (reported only)": the overview drag again with covers at full size.
- `deepMorphGapMs`, row "Deep zoom, slider between stops, worst frame gap (reported only)": at full zoom another stop is chosen and the worst frame gap of the morph is read. This is the gas's worst case.
- `gasShownMs`, row "Nebula visible (reported only)": `window.__rmr.gasShownMs` of the first page load (Task 5), rounded.
- `--no-gas`: skips every wait for `window.__rmr.gas`, so the same script can measure a build that has no gas (the site as it is today). The nebula row then prints `n/a`; the two deep zoom rows are still measured, since full zoom and the slider exist without the gas.

In `frontcreck/scripts/perf/perf.mjs` make these six edits.

1. The viewport and the flag. Replace:

```js
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
```

with:

```js
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  // Reported only and gpu only: a desktop screen at device pixel ratio 2, where the map shades four times the pixels.
  desktop2x: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
};
// --no-gas: do not wait for window.__rmr.gas, so a build without the gas layer can be measured with this script.
const NO_GAS = args.includes('--no-gas');
```

2. The wait in `exploreFlow` (the line Task 5 Step 7 wrote). Replace:

```js
  await page.waitForFunction(() => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0 && (window.__rmr?.gas === 'ready' || window.__rmr?.gas === 'off'), null, { timeout: 20000 });
```

with:

```js
  await page.waitForFunction((noGas) => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0 && (noGas || window.__rmr?.gas === 'ready' || window.__rmr?.gas === 'off'), NO_GAS, { timeout: 20000 });
```

3. The two deep zoom measures, in `exploreFlow`. Replace:

```js
    res.zoomGapMs = Math.round(longest);
    await new Promise((r2) => setTimeout(r2, 1500));
```

with:

```js
    res.zoomGapMs = Math.round(longest);
    // Deep zoom, reported only: the same drag with covers at full size, where the gas is read from a blurred
    // copy. setCamera clamps the zoom to its maximum. The camera is put back before the idle window is measured.
    const api = window.__rmr.map;
    const home = api.getCamera();
    api.setCamera({ ...home, zoom: 1000 }, false);
    await P.settled();
    fire('pointerdown', cx, cy);
    longest = 0;
    last = performance.now();
    const t2 = last;
    while (performance.now() - t2 < 2000) {
      const k = (performance.now() - t2) / 2000;
      fire('pointermove', cx + Math.sin(k * 6.28) * 140, cy + Math.cos(k * 6.28) * 100);
      const now = await P.raf();
      longest = Math.max(longest, now - last);
      last = now;
    }
    fire('pointerup', cx, cy);
    res.deepDragGapMs = Math.round(longest);
    res.deepZoom = window.__rmr.gasDeep ?? null;
    // The worst case for the gas, reported only: still at full zoom, another stop is chosen, so both stops are
    // bound and the blurred copy is read from both while the albums morph. Then the stop is put back.
    await P.settled();
    const stop0 = window.__rmr.getState().stop;
    window.__rmr.getState().setStop(stop0 === 'sonic' ? 'mood' : 'sonic');
    res.deepMorphGapMs = await P.gaps(700);
    await P.settled();
    window.__rmr.getState().setStop(stop0);
    await P.settled();
    api.setCamera(home, false);
    // Full zoom makes the atlas fetch cover sheets; wait until the map has stopped drawing so a late sheet
    // cannot land in the idle window measured below.
    await P.settled();
    await new Promise((r2) => setTimeout(r2, 1500));
```

4. When the nebula first showed, in `measure`. Replace:

```js
  await page.waitForFunction(() => window.__mapFirstFrame !== null, null, { timeout: 20000 }).catch(() => {});
  const startup = await page.evaluate(() => ({
    lt: window.__lt.slice(),
```

with:

```js
  await page.waitForFunction(() => window.__mapFirstFrame !== null, null, { timeout: 20000 }).catch(() => {});
  // The gas of the stop Home shows arrives after the first frame; wait for it so its upload is inside the startup
  // long tasks and its time can be reported. A page with no gas (or --no-gas) is not waited for.
  if (!NO_GAS) await page.waitForFunction(() => typeof window.__rmr?.gasShownMs === 'number' || window.__rmr?.gas === 'off', null, { timeout: 20000 }).catch(() => {});
  const startup = await page.evaluate(() => ({
    gasShown: window.__rmr?.gasShownMs ?? null,
    lt: window.__lt.slice(),
```

and replace:

```js
    mapFirstFrameMs: startup.mapFirstFrame,
```

with:

```js
    mapFirstFrameMs: startup.mapFirstFrame,
    gasShownMs: typeof startup.gasShown === 'number' ? Math.round(startup.gasShown) : null,
```

5. The dpr 2 column, in `main`. Replace:

```js
        const r = await measure(mode, vp);
        rows.push(r);
        fails.push(...checkBudgets(r, mode, BUDGETS, { allowSoftwareGpu: args.includes('--allow-software-gpu') }));
```

with:

```js
        if (vp === 'desktop2x' && mode !== 'gpu') continue; // dpr 2 is measured on the GPU only
        const r = await measure(mode, vp);
        rows.push(r);
        // The dpr 2 column is reported only: it has no budget and is never checked.
        if (vp !== 'desktop2x') fails.push(...checkBudgets(r, mode, BUDGETS, { allowSoftwareGpu: args.includes('--allow-software-gpu') }));
```

6. A line under the table, in `main`. Replace:

```js
    console.log(`\n${formatTable(rows)}\n`);
```

with:

```js
    console.log(`\n${formatTable(rows)}\n`);
    if (rows.some((r) => r.vp === 'desktop2x')) console.log('The desktop2x column (1440 x 900 at device pixel ratio 2, gpu only) is reported only: it has no budget and cannot fail the run.\n');
    if (NO_GAS) console.log('Run with --no-gas: the script did not wait for a gas layer.\n');
```

In `frontcreck/scripts/perf/lib.mjs` make one edit, in and above `ROWS`. Replace:

```js
const ROWS = [
  ['Renderer', (r) => r.renderer],
  ['Search usable', (r) => `${r.searchUsableMs} ms`],
  ['Startup worst long task', (r) => `${r.startupLongTaskMs} ms`],
  ['WebGL warm-up end (reported only)', (r) => (r.warmUp ? `${r.warmUp.ms} ms (${r.warmUp.why})` : 'none')],
  ['Map first frame (reported only)', (r) => `${r.mapFirstFrameMs} ms`],
  ['Typing to suggestions', (r) => `${r.typeToSuggestionsMs} ms`],
  ['Select to album', (r) => `${r.selectToAlbumMs} ms`],
  ['Transition worst frame gap', (r) => `${r.transitionGapMs} ms`],
  ['Slider to list', (r) => `${r.sliderToListMs} ms`],
  ['Morph worst frame gap', (r) => `${r.morphGapMs} ms`],
  ['Drag worst frame gap', (r) => `${r.dragGapMs} ms`],
  ['Zoom worst frame gap', (r) => `${r.zoomGapMs} ms`],
```

with:

```js
/** A reported-only value that an older build or a run with --no-gas may not have: never throws. */
const ms = (v) => (typeof v === 'number' && Number.isFinite(v) ? `${v} ms` : 'n/a');

const ROWS = [
  ['Renderer', (r) => r.renderer],
  ['Search usable', (r) => `${r.searchUsableMs} ms`],
  ['Startup worst long task', (r) => `${r.startupLongTaskMs} ms`],
  ['WebGL warm-up end (reported only)', (r) => (r.warmUp ? `${r.warmUp.ms} ms (${r.warmUp.why})` : 'none')],
  ['Map first frame (reported only)', (r) => `${r.mapFirstFrameMs} ms`],
  ['Nebula visible (reported only)', (r) => ms(r.gasShownMs)],
  ['Typing to suggestions', (r) => `${r.typeToSuggestionsMs} ms`],
  ['Select to album', (r) => `${r.selectToAlbumMs} ms`],
  ['Transition worst frame gap', (r) => `${r.transitionGapMs} ms`],
  ['Slider to list', (r) => `${r.sliderToListMs} ms`],
  ['Morph worst frame gap', (r) => `${r.morphGapMs} ms`],
  ['Drag worst frame gap', (r) => `${r.dragGapMs} ms`],
  ['Zoom worst frame gap', (r) => `${r.zoomGapMs} ms`],
  ['Deep zoom drag worst frame gap (reported only)', (r) => ms(r.deepDragGapMs)],
  ['Deep zoom, slider between stops, worst frame gap (reported only)', (r) => ms(r.deepMorphGapMs)],
```

Pin the `n/a` rule with one new test. In `frontcreck/scripts/perf/lib.test.mjs` replace:

```js
  it('formats a markdown table', () => {
```

with:

```js
  it('prints n/a for a reported-only value a run does not have, and the value when it does', () => {
    const none = formatTable([{ mode: 'gpu', ...ok }]);
    expect(none).toContain('| Nebula visible (reported only) | n/a |');
    expect(none).toContain('| Deep zoom drag worst frame gap (reported only) | n/a |');
    expect(none).toContain('| Deep zoom, slider between stops, worst frame gap (reported only) | n/a |');
    const some = formatTable([{ mode: 'gpu', ...ok, gasShownMs: 640, deepDragGapMs: 21, deepMorphGapMs: 33 }]);
    expect(some).toContain('| Nebula visible (reported only) | 640 ms |');
    expect(some).toContain('| Deep zoom drag worst frame gap (reported only) | 21 ms |');
    expect(some).toContain('| Deep zoom, slider between stops, worst frame gap (reported only) | 33 ms |');
  });

  it('formats a markdown table', () => {
```

This adds a test; no existing test is edited.

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"
cd frontcreck && node --check scripts/perf/perf.mjs && npm run test -- scripts/perf/lib.test.mjs && npm run lint
```

Expected: no syntax error, the perf library's tests pass with one more than before (the existing ones unchanged), lint prints no error.

- [ ] **Step 7: Measure three times, compare with the baseline, write it down (heavy; run it alone, nothing else running)**

First read `docs/design/trifid-theme/reviews/baseline/BASELINE-PERF.md`. Its layout, which the write-up of this step mirrors:

- "Sizes": one table (first-load JS with and without nomodule scripts, the three.js chunk in the first-load scripts, the server HTML of `/` and of `/album/in-rainbows-radiohead`).
- "Medians (three runs)": one table with the four columns of the perf script, in its order: software desktop, software phone, gpu desktop, gpu phone.
- "Budget results per run": one line per run naming every budget that run missed.
- "Every run, per combination": one table per column with `Metric | Run 1 | Run 2 | Run 3 | Median | Min to max | Budget`.
- "Hover path": the first, second and third hover after a fresh load, per mode, each as median and min to max of five loads.

The raw output of the baseline is in `baseline/perf/`: `perf-run1.json` to `perf-run3.json` (the perf script's own JSON), `perf-run1.txt` to `perf-run3.txt` (its console output), `hover.json` and `hover.txt`.

The rule for this step, and for the same step of parts 2 and 3: run `npm run perf` three times, one after another. Each measure is judged on the median of the three runs: the median must be inside its budget, and it is compared with the baseline's median and min to max in `BASELINE-PERF.md`. A median above the baseline's worst run is a finding even when it is inside budget. Any single run over budget is named and explained in the write-up (the baseline has three such single run outliers).

First write the small helper that turns three runs into medians (it is not part of the repository; it reads the perf script's JSON files and prints, per column, run 1 to 3, the median and min to max of every measure):

```bash
cat > "${TMPDIR:-/tmp}/perf-medians.mjs" <<'EOF'
import fs from 'node:fs';
const runs = process.argv.slice(2).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const KEYS = ['searchUsableMs', 'startupLongTaskMs', 'mapFirstFrameMs', 'typeToSuggestionsMs', 'selectToAlbumMs', 'transitionGapMs', 'sliderToListMs', 'morphGapMs', 'dragGapMs', 'zoomGapMs', 'deepDragGapMs', 'deepMorphGapMs', 'gasShownMs', 'idleLongTasks', 'idleFrames'];
console.log(`first-load JS (KB): ${runs.map((r) => r.js.kb).join(', ')}; without nomodule: ${runs.map((r) => r.js.modernKb).join(', ')}; three.js on first load (KB): ${runs.map((r) => r.js.threeKb).join(', ')}`);
for (const col of runs[0].rows.map((r) => `${r.mode} ${r.vp}`)) {
  console.log(`\n${col}\n| Measure | Run 1 | Run 2 | Run 3 | Median | Min to max |\n|---|---|---|---|---|---|`);
  for (const k of KEYS) {
    const v = runs.map((r) => r.rows.find((x) => `${x.mode} ${x.vp}` === col)?.[k]);
    if (v.some((x) => typeof x !== 'number')) { console.log(`| ${k} | ${v.join(' | ')} | missing | missing |`); continue; }
    const s = [...v].sort((a, b) => a - b);
    console.log(`| ${k} | ${v.join(' | ')} | ${s[1]} | ${s[0]} to ${s[2]} |`);
  }
}
runs.forEach((r, i) => console.log(`\nrun ${i + 1} budget misses: ${r.fails.length ? r.fails.join('; ') : 'none'}`));
EOF
```

Then, once, the dpr 2 column of today's site. The baseline has no column at device pixel ratio 2, so `gpu desktop2x` would have nothing to be compared with. Measure it with the extended script of Step 6 on commit `6f10463e` (the baseline's own commit; its app code is the live site's), in a temporary worktree. This is not a branch switch: the working tree stays where it is. Serial, nothing else running. Skip this block when `docs/design/trifid-theme/reviews/baseline/perf/perf-dpr2-run3.json` already exists. Use a path in the session's scratch directory for `W` when one is given.

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; node -p process.arch
ROOT="$PWD"; W="${TMPDIR:-/tmp}/baseline-6f10463e"; B="$ROOT/docs/design/trifid-theme/reviews/baseline/perf"
git worktree add "$W" 6f10463e
ln -s "$ROOT/frontcreck/node_modules" "$W/frontcreck/node_modules"
cp "$ROOT/frontcreck/scripts/perf/perf.mjs" "$ROOT/frontcreck/scripts/perf/lib.mjs" "$W/frontcreck/scripts/perf/"
(cd "$W/frontcreck" && npm run build && for i in 1 2 3; do npm run perf -- --mode gpu --viewport desktop2x --no-gas > "$B/perf-dpr2-run$i.txt" 2>&1; cp "$(ls -t scripts/perf/out/*.json | head -1)" "$B/perf-dpr2-run$i.json"; tail -n 3 "$B/perf-dpr2-run$i.txt"; sleep 20; done)
node "${TMPDIR:-/tmp}/perf-medians.mjs" "$B/perf-dpr2-run1.json" "$B/perf-dpr2-run2.json" "$B/perf-dpr2-run3.json"
git worktree remove --force "$W" && git worktree list
```

Expected: `arm64`; a detached worktree at `6f10463e`; a build with no error; three runs that each end in `All budgets met.` (the dpr 2 column is never checked, so only the size checks could fail, and they pass on this commit); the helper's table for the one column `gpu desktop2x`, with `gasShownMs` marked missing; and a worktree list without `$W`. Run from the worktree root (the directory that holds `frontcreck/`). If `npm run build` fails because of the linked `node_modules` (the bundler may refuse a link that leaves the project), remove the link, run `npm ci` in `$W/frontcreck` and repeat from the build. `--force` is needed because the worktree holds the copied scripts and the build output.

Append this section to the end of `docs/design/trifid-theme/reviews/baseline/BASELINE-PERF.md`, with the numbers the helper printed (this, and the six files just written, are the only changes this part makes in the baseline folder):

```markdown
## gpu desktop at dpr 2, added later with the same script

The three runs above have no column at device pixel ratio 2. This one was added on <date> from commit `6f10463e` (app code identical to `1e9ef508`), built in a temporary worktree. The script was the extended `scripts/perf/perf.mjs` and `lib.mjs` of the Trifid plan (part 1, Task 6 Step 6), run as `npm run perf -- --mode gpu --viewport desktop2x --no-gas`, three times, one after another. Viewport 1440 x 900 at device pixel ratio 2, gpu mode. The column has no budget; the 50 ms frame gap of the other gpu columns is the yardstick. Raw output: `perf/perf-dpr2-run1.json` to `perf-dpr2-run3.json` and `.txt`.

Renderer: <renderer string>

| Metric | Run 1 | Run 2 | Run 3 | Median | Min to max | Budget |
|---|---|---|---|---|---|---|
| Search usable (ms) | | | | | | none (reported only) |
| Startup worst long task (ms) | | | | | | none (reported only) |
| Map first frame (ms) | | | | | | none (reported only) |
| Typing to suggestions (ms) | | | | | | none (reported only) |
| Select to album (ms) | | | | | | none (reported only) |
| Transition worst frame gap (ms) | | | | | | none; 50 as yardstick |
| Slider to list (ms) | | | | | | none (reported only) |
| Morph worst frame gap (ms) | | | | | | none; 50 as yardstick |
| Drag worst frame gap (ms) | | | | | | none; 50 as yardstick |
| Zoom worst frame gap (ms) | | | | | | none; 50 as yardstick |
| Deep zoom drag worst frame gap (ms) | | | | | | none; 50 as yardstick |
| Deep zoom, slider between stops, worst frame gap (ms) | | | | | | none; 50 as yardstick |
| Long tasks while idle (3 s) | | | | | | none (reported only) |
| Frames while idle (3 s) | | | | | | none (reported only) |

Nebula visible: n/a (this commit has no gas).
```

Now part 1 itself. Build once, then the three runs (each about two minutes, all five columns, one browser after the other), then the medians:

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; node -p process.arch
cd frontcreck && npm run build
R=../docs/design/trifid-theme/reviews; mkdir -p $R/perf-part1
for i in 1 2 3; do npm run perf > $R/perf-part1/perf-run$i.txt 2>&1; cp "$(ls -t scripts/perf/out/*.json | head -1)" $R/perf-part1/perf-run$i.json; tail -n 3 $R/perf-part1/perf-run$i.txt; sleep 20; done
node "${TMPDIR:-/tmp}/perf-medians.mjs" $R/perf-part1/perf-run1.json $R/perf-part1/perf-run2.json $R/perf-part1/perf-run3.json
```

Expected: `arm64`; a build with no error; after each run its last lines, which are either `All budgets met.` or `FAIL` and the budgets that run missed (the script exits 1 on a miss, and the loop goes on). If a `.txt` ends in a stack trace instead, that run did not finish and the JSON copied beside it belongs to an earlier run: delete both and repeat that run alone (`npm run perf > $R/perf-part1/perf-run2.txt 2>&1`, then the same `cp`). Then the helper prints the three first-load JS numbers, one table per column (five, the last being `gpu desktop2x`) with the three runs, the median and min to max of every measure, and the budget misses of each run. The same helper pointed at `$R/baseline/perf/perf-run1.json` to `perf-run3.json` prints the numbers of `BASELINE-PERF.md` for its four columns, with the rows the baseline does not have marked missing.

Then the first hover, with the baseline's own script (desktop only; gpu, then software, five fresh loads each; it starts and stops its own `next start` on port 3500):

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"
cd frontcreck && node ../docs/design/trifid-theme/reviews/baseline/hover-measure.mjs ../docs/design/trifid-theme/reviews/app-hover-part1.json http://127.0.0.1:3500 --start 2>&1 | tee ../docs/design/trifid-theme/reviews/app-hover-part1.txt
```

Expected: ten lines `gpu load 1: #1 tip ... ms, long task ... ms, gap ... ms | #2 ... | #3 ...` to `software load 5: ...`, then per mode three lines `hover 1: tip <median> ms (<min> to <max>), longest long task ..., frame gap ...`, and `wrote .../app-hover-part1.json`. It uses the build made above; build again first if the code changed since. Compare it line by line with `baseline/perf/hover.txt` (the same format) and with the "Hover path" tables of `BASELINE-PERF.md`.

Write `docs/design/trifid-theme/reviews/app-perf-part1.md` with these sections, in the order of `BASELINE-PERF.md`:

1. The commit measured, the date, the load on the machine if it was shared, and the two renderer strings.
2. "Sizes": the five rows of the baseline's table, each with the baseline value, the part 1 value and the budget. Baseline: first-load JS 190.5 KB with nomodule scripts (budget 200 KB) and 151.9 KB without, three.js chunk in the first-load scripts 0 KB (must be 0), server HTML 28.3 KB and 34 KB (budget 150 KB each).
3. "Every run, per combination": one table per column (five tables; `gpu desktop2x` is compared with the section "gpu desktop at dpr 2" just added to `BASELINE-PERF.md`, has no budget, and names the 50 ms frame gap as its yardstick) with `Metric | Run 1 | Run 2 | Run 3 | Median | Baseline median | Baseline min to max | Budget | Verdict`. The verdict is "same" when the median lies inside the baseline's min to max, "better" when it is below the baseline's best run, "worse" when it is above the baseline's worst run. The two deep zoom rows have a baseline only in the dpr 2 column (measured above with the same script); in the other four columns put them beside the same column's "Drag worst frame gap" and "Morph worst frame gap" medians of these runs and of the baseline. "Nebula visible" has no baseline anywhere: report it beside "Map first frame" of the same column.
4. "Budget results per run": one line per run, as the baseline has. Every single run over budget is named and explained here, also when the median is inside budget.
5. "Hover path": per mode, for the first, second and third hover, "Pointer move to tip visible", "Longest long task" and "Longest frame gap" as median (min to max), each beside the baseline's value (gpu first hover: tip visible 150.3 ms (135.7 to 169.3), longest long task 0 ms (0 to 55), longest frame gap 33.3 ms (16.8 to 50)). The same rule applies: a median above the baseline's max is a finding.
6. For every "worse" and every median over budget, one of: the cause and why it is accepted, or the fix made and the three numbers after it. The software columns draw the gas on the CPU, so their frame gaps are expected to grow; say by how much. A worse number with no explanation is not acceptable.
7. What was dropped or made cheaper under the snappiness rule, if anything, with the medians before and after. The owner reads this list afterwards; he is not asked first.

Rules for this step:

- Do not change `budgets.json`.
- Size. The perf script's own first line is the number to use: `First-load JS of / (gzip): <a> KB with nomodule scripts (budget 200 KB), <b> KB without; three.js chunk on first load: <c> KB`. `<a>` must stay under 200 and is compared with the baseline's 190.5; `<c>` must be 0 (the script fails the run otherwise). Part 1 adds one small module to the first load, `src/lib/data/theme.ts` (a loader and a validator, reached from `MapStage.tsx` and `useData.ts`), so `<a>` should grow by well under 1 KB. Growth of more than 1.5 KB is a finding even inside budget, because all three parts share 9.5 KB: from the worktree root run `grep -rnE "from ['\"](\.\./shaders/gas|\./gas|\./GasField|\.\./theme|@/components/map/theme)['\"]" frontcreck/src` and make sure it prints five lines and no more: `canvas/GasField.tsx` importing `../shaders/gas`, `canvas/Scene.tsx` importing `./GasField`, `shaders/gas.ts` importing `../theme`, and `shaders/gas.test.ts` importing `../theme` and `./gas`. This has no cheaper version: a miss is a bug in the imports.
- `idleFrames` must be at most 1 and `idleLongTasks` 0 in every column of every run. These are the gas's own promises (the map canvas does not redraw at rest, nothing new runs at rest) and have no cheaper version: a miss is a bug to fix in Task 5.
- The gas has six costs. Each has a row that shows it and a cheaper version. When a median in a gpu column is over 50 ms, or above the baseline's worst run, apply the cheaper version of the cost that row belongs to, without asking, then run that column three times again (`for i in 1 2 3; do npm run perf -- --mode gpu --viewport <desktop or phone>; done`) and judge the new median. When only the gpu phone column is worse, start with item 4, which leaves the desktop look alone.
  1. The deep zoom blur (two more reads of each bound stop per pixel past 32 px covers). Row: "Deep zoom drag worst frame gap". Cheaper version: drop the blurred copy. In `shaders/gas.ts` delete the line `if (u_deep > 0.0) t = mix(t, 0.5 * (gasLod(uv, DEEP_LOD_A) + gasLod(uv, DEEP_LOD_B)), u_deep);` and in the glow line replace `max(lod + 3.5, DEEP_LOD_A * u_deep)` with `max(lod + 3.5, 0.0)` and `max(lod + 5.0, DEEP_LOD_B * u_deep)` with `max(lod + 5.0, 0.0)`; in the deep zoom test in `gas.test.ts` remove the `toContain` line for the mix and the two for `max(lod + `. The fade to 0.06, the loss of colour and the detail fade stay; they cost nothing.
  2. The glow (two blurred reads of each bound stop per pixel, at every zoom). Rows: "Transition", "Morph" and "Drag worst frame gap", and the hover's "Longest frame gap". Cheaper version: drop the wider tap. In `shaders/gas.ts` replace the `vec3 g = ...` line with `vec3 g = lit(gasLod(uv, max(lod + 4.0, DEEP_LOD_A * u_deep)), k);` (with `max(lod + 4.0, 0.0)` if item 1 was applied), and remove the two `toContain` lines for `max(lod + ` from the deep zoom test in `gas.test.ts` if they are still there.
  3. The work a zoom switches on, frame by frame. In every frame of a zoom `GasField` writes `u_ppr`, `u_dust`, `u_strength` and `u_deep`, and as soon as `u_ppr` passes `u_bakePpr` (640 texels per raw unit, which the screen reaches at covers of about 7.5 px, a little under twice the desktop overview zoom) the shader adds four noise reads per pixel for the detail octaves. Row: "Zoom worst frame gap", which is the row with the least room in the baseline (gpu desktop median 38 ms, 34 to 43; gpu phone median 44 ms, 42 to 53, budget 50). Cheaper version, after item 2: drop the detail octaves. In `shaders/gas.ts` delete the block that starts with the line `if (u_ppr > u_bakePpr && u_deep < 1.0) {` and ends with the closing brace after `t.rgb *= 1.0 + 1.6 * d * (1.0 - u_deep);`, together with the two comment lines above it, and in the deep zoom test in `gas.test.ts` remove the `toContain` line for `t.rgb *= 1.0 + 1.6 * d * (1.0 - u_deep);` and the one for `if (u_ppr > u_bakePpr && u_deep < 1.0) {`. The gas is then a little softer between 7.5 px and 32 px covers. The JavaScript side of a zoom frame (one `gasCurve` call, one `gasDust` call and a dozen uniform writes) has no cheaper version worth having, since the zoom changes in every such frame and nothing can be cached; if the row is still worse with the octaves gone, record the numbers and stop for the owner.
  4. The fill rate of the opaque quad on a phone. The quad is shaded for every pixel of the canvas (390 x 844 CSS px at a device pixel ratio capped at 1.5 in `Scene.tsx`), with seven texture reads per pixel at the overview while the slider is between stops (two for the gas, four for the glow, one for the grain) and more once zoomed in. Rows: every frame gap row of the gpu phone column. Cheaper version: a lighter shader on narrow layouts only, one read of each bound stop per pixel plus the grain. In `shaders/gas.ts` put a line `#ifndef GAS_LITE` directly above the line `if (u_ppr > u_bakePpr && u_deep < 1.0) {` and a line `#endif` directly above the line `vec3 c = lit(t, k);`; put a line `#ifndef GAS_LITE` directly above the line that starts `float lod = log2(` and a line `#endif` directly below the line `c += g * GLOW;`. In `GasField.tsx` change the import `import { easeOutCubic, prefersReducedMotion } from "@/lib/media";` to `import { easeOutCubic, isNarrow, prefersReducedMotion } from "@/lib/media";` and add the line `defines: isNarrow() ? { GAS_LITE: "" } : {},` to the `ShaderMaterial` options, directly below `depthWrite: false,`. On a phone the gas then has no glow, no added detail and no blur in deep zoom; the zoom bands, the fade to 0.06, the loss of colour, the dust and the pool are unchanged, and no existing test line changes (this was checked: the tests of `gas.test.ts`, the typecheck and lint pass with these edits). The choice is made when the map mounts, so a desktop window dragged narrower keeps the full shader until reload.
  5. The texture uploads (one 2048 px texture with mips after first paint, and two more in an idle slot on an interactive map). Row: "Startup worst long task" (baseline median 0 ms in the gpu columns, with one run at 345 ms). Cheaper version: spread the uploads. In `GasField.tsx` change `window.requestIdleCallback(rest, { timeout: 600 })` to `window.requestIdleCallback(rest, { timeout: 2000 })`.
  6. The fill rate at device pixel ratio 2. On a desktop screen at dpr 2 the quad is shaded for four times the pixels of the `gpu desktop` column. Rows: "Drag worst frame gap" and "Zoom worst frame gap" of the `gpu desktop2x` column (and its two deep zoom rows). The column has no budget; apply the cheaper version, without asking, when its drag or zoom median is over 50 ms or above the worst run of the baseline's dpr 2 section. Cheaper version, in two stages, measuring between them (`for i in 1 2 3; do npm run perf -- --mode gpu --viewport desktop2x; done`). Stage one, no detail octaves at dpr 2 or more: in `shaders/gas.ts` put a line `#ifndef GAS_NO_DETAIL` directly above the line `if (u_ppr > u_bakePpr && u_deep < 1.0) {` and a line `#endif` directly below the closing brace of that block (the line after `t.rgb *= 1.0 + 1.6 * d * (1.0 - u_deep);`); in `GasField.tsx` add the line `defines: gl.getPixelRatio() >= 2 ? { GAS_NO_DETAIL: "" } : {},` to the `ShaderMaterial` options, directly below `depthWrite: false,`, and change the dependency list of that `useMemo` from `}, [data, theme]);` to `}, [data, theme, gl]);`. If item 4 already added a `defines` line, replace it with `defines: isNarrow() ? { GAS_LITE: "" } : gl.getPixelRatio() >= 2 ? { GAS_NO_DETAIL: "" } : {},` instead of adding a second one. Stage two, if still over: no glow either, which is the lighter shader of item 4 at dpr 2. Make item 4's four line additions in `shaders/gas.ts` if they are not there yet, and in the `defines` line of `GasField.tsx` change `{ GAS_NO_DETAIL: "" }` to `{ GAS_LITE: "" }`. A screen at dpr 2 has pixels fine enough that the added detail and the glow are the least missed there. No existing test line changes in either stage (stage one was checked: tests, typecheck and lint pass).
- The first hover is judged the same way: the median "Pointer move to tip visible" of the first hover against the baseline's 150.3 ms (135.7 to 169.3) in gpu mode, and the median "Longest long task" must stay 0. A hover draws three map frames, each over the whole gas quad, so its cheaper version is item 2. A single load with a long task is named in the write-up (the baseline has one of 55 ms).
- If a row is still worse after its cheaper version, record the numbers and stop for the owner: that is a finding, not something to hide inside the budget.
- After any change made here, run Step 3 again and `npm run test -- src/components/map/shaders/gas.test.ts`, build again, and replace the affected numbers in the write-up with the new medians (keep the old ones in section 7).

- [ ] **Step 8: Walk the regression checklist against fresh screenshots**

`docs/design/trifid-theme/reviews/baseline/REGRESSION-CHECKLIST.md` has 18 numbered sections ("1. Overlapping covers on the map" to "18. Performance niceties") and 234 items. Each item is a checkbox line with a bold title, `- [ ] **Title.**`, and three lines under it: `Sees:` (what a visitor sees), `How:` (where the code does it) and `Verify:` (how to check it). A `Verify:` line names one or more of: baseline screenshots by base name (they are in `baseline/shots/desktop/` and `baseline/shots/phone/`; full views are `.jpg`, names ending in `-crop` are `.png`; `baseline/README.md` lists every name and its state), an e2e test by its title, a `grep` to run from `frontcreck/`, or a probe marked "Manual:".

Take the same screenshots of the app as it is now, with the baseline's own script (one headless Chrome at a time, about four minutes; it starts and stops its own `next start` on port 3400):

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"; node -p process.arch
cd frontcreck && npm run build && node ../docs/design/trifid-theme/reviews/baseline/capture.mjs test-results/part1-shots http://127.0.0.1:3400 --start
```

Expected: `arm64`; then `frontcreck/test-results/part1-shots/desktop/` and `phone/` hold the same file names as `baseline/shots/desktop/` and `baseline/shots/phone/`, beside `capture-log-desktop.json` and `capture-log-phone.json`. These files are not committed (`test-results/` is ignored). The script exits non-zero and leaves a `FAILED-<state>.jpg` when it could not reach a state; part 1 renames no class in its `SEL` list, so a failed state is a regression to look into, not a selector to update. Never write into `baseline/shots/`. One state can be taken again with `--only <part of its name>`, one viewport with `--viewport desktop` or `--viewport phone`. The script waits for the map to stop drawing but does not know the `gas` flag: if a map shot shows the plain pane where its neighbours show gas, it was taken before the texture arrived, so take that state again.

Then go through every item, section by section, and do what its `Verify:` line says:

- A screenshot name: open the baseline file and the file of the same name under `frontcreck/test-results/part1-shots/` with the Read tool, one pair at a time.
- An e2e test: it already ran in Step 3, 4 or 5 of this task; if its spec was not among them, run it alone (`cd frontcreck && npx playwright test <spec file> --project=desktop --workers=1`, with the arm64 path set first).
- A `grep`: run it from `frontcreck/`.
- A "Manual:" probe that needs a person at a browser and that no screenshot or test covers: do not start a browser for it; write it down as "routed to part 3". Part 3 Task 10's regression reviewer does the ones that can be done from a running build and stills or by reading code, and the rest go on the owner's trial list in part 3 Task 11. No probe may be left without an owner: every "Manual:" line of the checklist ends up as held, regressed or routed.

Do not tick or edit `REGRESSION-CHECKLIST.md` itself. Add a section "Regression checklist" to `docs/design/trifid-theme/reviews/app-perf-part1.md`: one line per section, 1 to 18, with how many of its items hold, and under it one line for every item that does not simply hold, quoting its bold title, with one of these marks: "changed on purpose in part 1" (only the map background: gas where the pane was plain, in every shot that shows the map), "waits for part 2 or 3" (stars, names, panels, header, the grain), "routed to part 3" (a "Manual:" probe, with the probe's own words so part 3 can pick it up), or "regressed". Pay particular attention to sections 1 to 6 and 13: the way overlapping covers are drawn and picked, hover and selection, dots turning into covers, the marker layout, the lines and badges, and the camera. The gas sits under the album points and must change none of them. Fix every "regressed" item before committing.

- [ ] **Step 9: Commit, do not push**

```bash
git add frontcreck/e2e/gas.spec.ts frontcreck/e2e/nowebgl.spec.ts frontcreck/scripts/perf/perf.mjs frontcreck/scripts/perf/lib.mjs docs/design/trifid-theme/reviews/app-perf-part1.md docs/design/trifid-theme/reviews/perf-part1/perf-run1.txt docs/design/trifid-theme/reviews/perf-part1/perf-run1.json docs/design/trifid-theme/reviews/perf-part1/perf-run2.txt docs/design/trifid-theme/reviews/perf-part1/perf-run2.json docs/design/trifid-theme/reviews/perf-part1/perf-run3.txt docs/design/trifid-theme/reviews/perf-part1/perf-run3.json docs/design/trifid-theme/reviews/app-hover-part1.json docs/design/trifid-theme/reviews/app-hover-part1.txt frontcreck/scripts/perf/lib.test.mjs docs/design/trifid-theme/reviews/baseline/BASELINE-PERF.md docs/design/trifid-theme/reviews/baseline/perf/perf-dpr2-run1.txt docs/design/trifid-theme/reviews/baseline/perf/perf-dpr2-run1.json docs/design/trifid-theme/reviews/baseline/perf/perf-dpr2-run2.txt docs/design/trifid-theme/reviews/baseline/perf/perf-dpr2-run2.json docs/design/trifid-theme/reviews/baseline/perf/perf-dpr2-run3.txt docs/design/trifid-theme/reviews/baseline/perf/perf-dpr2-run3.json
git commit -F - <<'EOF'
test(e2e): gas is drawn, dims around an open album, fades in deep zoom, survives a late texture, a lost context and missing data; part 1 measured against the baseline

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

If Step 7 changed `shaders/gas.ts`, `gas.test.ts` or `GasField.tsx`, add those files to the same commit.

- [ ] **Step 10: Fidelity check of this part (one reviewer subagent, no browser)**

Dispatch one fresh reviewer subagent that did not write this part. Give it only the paths below and this brief. It opens the images one at a time with the Read tool and starts no browser.

> Compare what part 1 built with the approved pictures and list every difference in the gas, worst first. App images: `frontcreck/test-results/theme/gas-balanced.png`, `gas-sonic.png` and `gas-mood.png` (the bake previews of Task 3), `frontcreck/test-results/shots/desktop-explore.png` (written by `map.spec.ts` in Step 5) and `frontcreck/test-results/shots/desktop-gas-deep.png` (full zoom, written by `gas.spec.ts` in Step 3). Approved: `docs/design/trifid-theme/options/final-overview.jpg`, `final-whole.jpg` and `final-mood.jpg`, and for full zoom panel C, "Faint", of `docs/design/trifid-theme/options/q-deep.jpg`. Judge only the gas: its five colours and where each sits, the swirl, the dust lanes, how bright it is, where it ends, that north is up, and at full zoom that the covers sit on near-black sky with only a faint, smooth trace of colour (no blotches, no texture, not as bright as the "Before" panel, not pure black). Mark each difference "worse than approved", "equal" or "expected until parts 2 and 3". The only expected ones: albums are still the old coloured dots, there are no region names, the panels and the pane beyond the gas are still the old warm brown, the header still sits above the map and not over it, and the site's film grain is still there.

Fix every "worse than approved" item here (the bake in Task 3 or the shader in Task 4), run the affected step again and have the same reviewer look again. Save its final list as `docs/design/trifid-theme/reviews/app-fidelity-part1.md` and commit it (commit, do not push):

```bash
git add docs/design/trifid-theme/reviews/app-fidelity-part1.md
git commit -F - <<'EOF'
docs(design): part 1 fidelity notes

Refs #45

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

The reviewer sees stills only. It cannot judge motion in flight (the slider cross-fade, the pool easing, the fade into deep zoom) or a real phone, which is why the owner's own preview checklist in part 3 Task 11 stays.

---

## Self-review

Revised on 2026-10-04 after the owner's decisions (overview, "Decisions made on 2026-10-04"). This section describes the revised text.

**Spec coverage (HANDOFF decisions of 2026-10-04, the overview's decisions of the same day, and the part 1 brief)**

| Requirement | Where |
|---|---|
| Gas look `swirl`, ported line by line, colour carried by the flow | Task 3 `bake-page.js` (constants written in), checked by eye in Step 10 |
| Ember palette on the five families | Task 3 `bake-core.js` `EMBER`, Task 2 `EMBER_RGB`, pinned in Task 4's test |
| Gas baked once per slider stop, at build time | Task 3 (`npm run theme`, committed output) |
| Per-album colour weights and named regions per stop as committed inputs, regenerated when layouts change | Task 1 (`weights.json`, `regions.json`, hashes, README) |
| `theme.json` shape, `stars.lead`, `stars.bg`, `labels`, `positionsHash` | Task 2 (types and guard), Task 3 (`assemble`, `theme.data.test.ts`) |
| Stars are random: no star size, brightness class or rank in `theme.json`, nothing from album order | Global Constraints; `ThemeData.stars` holds only the colour family and the gas brightness under each album (Tasks 2 and 3) |
| Existing site data and pipeline files do not change, the theme only adds files | Global Constraints; Task 1 reads `constants.py` and `io.py`; Task 3 reads `albums.json` and `positions.json` and writes only under `public/data/theme/` |
| `npm run theme` and the staleness guard documented in `frontcreck/README.md` | Task 3 Step 12 (exact text) |
| Client loader, `useThemeLoad`, map works without theme data | Task 2, Task 5 (`themeFor`, `'off'`), Task 6 (404 test) |
| Shared constants and `rawToWorld` | Task 2 |
| Gas layer: cross-fade by the points' rule, `finish()`, detail octaves, glow from mips, bands 13/22/32, pool eased over 400 ms, dimmed mode | Task 4 (shader and helpers), Task 5 (`GasField`) |
| Deep zoom goes to space: floor 0.06 at 56 px covers and over, with loss of colour, detail fade and blur on the same ease | Task 4 (`gasCurve`, the `GAS_DEEP_*` constants, `u_deep` in the shader, unit tests with the prototype's values), Task 5 (`u_deep`, `gasDeep`), Task 6 (browser test 3, fidelity against `q-deep.jpg` panel C) |
| The map canvas does not redraw at rest, textures lazy, readiness flag | Task 4 (no clock, pinned by a test; `gasStopsToStart`), Task 5 (`gas` flag, `waitForMap`), Task 6 tests 1, 4 and 7, Task 5 Step 9 |
| Gas images: only the stop on screen at first; the other two only on an interactive map, at idle priority; Home loads one | Task 4 (`gasStopsToStart`, two unit tests), Task 5 (`GasField` effect, flag wording), Task 6 test 7 (Home requests one image, the map the other two), test 4 (a slider move before a stop has arrived: stand-in gas, no page error, no redraw loop), test 1 (polled request list) |
| Commit, do not push | Global Constraints; every commit step is headed "Commit, do not push" |
| `theme.json` stays small | Task 3 `theme.data.test.ts` (under 80 KB on disk) |
| Snappiness: each effect measured, the cheaper version taken without asking | Global Constraints; Task 6 Step 6 (reported measures for deep zoom, a slider move at full zoom, the nebula's first frame and a dpr 2 column), Step 7 (the dpr 2 column of today's site, three runs judged on the median, the first hover with the baseline's script, and one cheaper version for each of the gas's six costs) |
| No regressions: compared with the baseline at the end of the part | Task 6 Step 7 (`app-perf-part1.md`, against `BASELINE-PERF.md` and `baseline/perf/`), Step 8 (fresh screenshots with `baseline/capture.mjs`, then every item of `REGRESSION-CHECKLIST.md`) |
| No growth of first-load JS | `GasField` is only imported from `Scene.tsx` and `shaders/gas.ts` only from `GasField`; `lib/data/theme.ts` (a validator and a loader) is the only new first-load code; the size check of Task 6 Step 7 compares the perf script's number with the baseline's 190.5 KB and requires the three.js chunk to stay at 0 |
| Review Focus 1 to 5 | Tasks 2, 3, 4, 5 and 6 as listed under Review Focus |
| The stage will extend under the header (part 3) | Nothing here depends on where the stage starts: Task 5 Interfaces, Task 6 Interfaces |
| Random stars, twinkle, names toggle, Tenor Sans, glass chrome, header over the map, removal of the film grain, sky-coloured pane, star tints | Not this part: parts 2 and 3. The dependencies are stated in Task 5's Interfaces |

**Placeholder scan.** No step says "TBD", "similar to", "add error handling" or "write tests for the above". Every new file is given in full, every edit as exact before and after text. Three steps name a concrete follow-up instead of a guess: Task 5 Step 8 (where to put the lint comment if the rule fires on another line), Task 6 Step 3 (what to do if no bare point is found at full zoom) and Task 6 Step 7 (the specific cheaper version of each cost if a row gets worse). Task 6 Steps 7 and 8 were rewritten on 2026-10-04 against the finished baseline folder: they use its real file names, the real arguments of `hover-measure.mjs` and `capture.mjs`, and the real table layout of `BASELINE-PERF.md` and `REGRESSION-CHECKLIST.md`.

**Type and name consistency.**
- `ThemeData` and `ThemeLabel` are defined once (`lib/data/theme.ts`) and used by `useData.ts`, `mapStore.ts`, `types.ts`, `GasField.tsx` and the tests; `assemble` in `bake-core.js` writes exactly those keys, and `theme.data.test.ts` checks the committed file with `isTheme`.
- `MapTransform { cx, cy, s }` is produced by `positionsTransform` in `data.ts` and mirrored by `positionsTransform` in `bake-core.js` (same quantile rule); `GasField` uses `data.tx` for `u_tx`, `u_ppr` and the pool.
- The noise table is built by `noiseTable` (bake) and `gasNoise` (runtime) from the same seed; both tests pin the same eight values, last value and sum.
- Hashes: `short_hash` (Python), `shortHash` (Node) and the vitest guard all take the first 12 hex characters of SHA-256 over the same bytes.
- Image orientation: `build-theme.mjs` stores row 0 at the north edge; `GasField` sets `flipY = false`; the shader computes `v` as `u_bakeHalf - v_raw.y`; Task 4's test pins that line; Task 3 Step 10 and Task 5 Step 9 check it by eye.
- Uniform names set in `GasField.tsx`, `u_deep` included, are the ones Task 4's test requires the shader to declare.
- `gasCurve` is the only zoom curve: defined and tested in Task 4, called once per frame in `GasField` (Task 5) for both `u_strength` and `u_deep`, named in Task 6 Step 3. No step calls `gasStrength`, which no longer exists. Parts 2 and 3 never called it.
- `gasPair` returns stops whose textures exist, so the non-null assertions `got[pair.a]!` in `GasField` hold.
- `window.__rmr.gas` values `'loading' | 'ready' | 'off'` are written by `GasField` (`loading`, `ready`, `off` for large-texture failure) and `MapStage` (`off`), typed in `global.d.ts`, and read by `waitForMap`, `perf.mjs`, `review-shots.mjs` and `gas.spec.ts`. `gasPool` and `gasDeep` are written by `GasField` in every drawn frame, typed in `global.d.ts`, and read by `gas.spec.ts` (and `gasDeep` by `perf.mjs`).
- Every commit block carries `Refs #45` and the trailer; every `node`, `npm` and `npx` command starts from the arm64 Node path; every Playwright run has `--workers=1`.

**Checked by running (independent check, 2026-10-04, repeated on 2026-10-05 after the coordinator's rulings).** A copy of `frontcreck/` (sources only) was made outside the repository and every edit of Tasks 2, 5 and 6 was applied to it by exact text match: each of the 38 before texts occurs exactly once in the file it names, in task order (the perf script's edits included). In that copy the unit tests of this part pass (`gas.test.ts` 26, `bake-core.test.mjs` 9, `theme.test.ts` 17, `mapStore.theme.test.ts` 2, perf `lib.test.mjs` 11, and the existing `data`, `client` and `useData` tests), `node --check` accepts `perf.mjs`, `tsc --noEmit` reports nothing (it covers `GasField.tsx` and `e2e/gas.spec.ts`), and ESLint reports nothing. The cheaper versions 4 and 6 (stage one) of Task 6 Step 7 were applied together to that copy: tests, typecheck and lint still pass. Task 1's module was run against the real design files without writing anything: 7, 17 and 6 named regions, the names of the overview one for one, `positionsHash` `a7c1dbd996fd`, no validation error. Not run: the bake, any browser, any shader compile, the perf script itself, and the loading order of `GasField` in a real page (Task 6 tests 4 and 7 are its first run).

**Checked by running (reviser).** The deep zoom curve was run in Node against the prototype's own `RMR.gasCurve` (loaded from `prototype/src/config.js`) at every 0.01 px from 0 to 80 px covers with no difference, and the expected values in Task 4's test are that function's output. The whole of Task 4's test file was run against Task 4's `gas.ts` as written here, with the three imports stubbed: 24 tests pass. The shader itself has not been compiled; that first happens in Task 5 Step 9.

**Fixed during review.**
- `gasPair` first normalised the pair and then looked for a fallback, which sent a slider at Mood with a missing Mood texture to Sonic instead of Balanced; the fallback now runs on the unnormalised pair, and the test covers that case.
- The first draft measured "gas behind most stars" with a byte threshold of 12, which thin outer gas may not reach; the committed-data test uses 2 (just above the empty sky's 1).
- The pool check first compared whole-screen luma between two routes, which album dots and covers dominate; it now reads `gasPool` and compares the median luma of the same patch of the map at the same zoom.
- The quad was first the size of the bake, which would have left a seam where the grain stops; it is `GAS_QUAD_SCALE` times larger and the shader returns sky beyond the bake.
- Revision of 2026-10-04: `gasStrength` and its floor of 0.3 gave way to `gasCurve` and deep zoom. The prototype's blur levels 4.5 and 6 belong to a 4096 px bake; copied as they are onto the 2048 px bake they would have blurred twice as wide, so they are 3.5 and 5 here. The glow, which here reads the bake and not the finished image, would have put sharp gas back over the blurred copy at full zoom; its two taps are now held to the deep zoom levels.
- Revision of 2026-10-04: the perf script never reached full-size covers, so the deep zoom blur would have gone unmeasured; Task 6 Step 6 adds a reported measure for it.
- Rulings of 2026-10-05: the gas of the other two stops is no longer fetched on the dimmed backdrop, and on the map only at idle after the first stop is in; the `gas` flag counts started stops. `useTheme` is gone (nothing used it). The perf script also reports a slider move at full zoom, the nebula's first frame and a `gpu desktop2x` column, and can run without the gas. The four detail octave reads are skipped once deep zoom is complete.
