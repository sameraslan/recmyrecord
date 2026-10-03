#!/bin/bash
# Laptop-friendly embedding bake-off (see bakeoff.py): the torch models first (GPU, ~1 track/s), then
# the contrastive EffNets in two low-priority single-thread workers. Resumable: rerun to continue.
#   ALBUMS=1000 TRACKS=2 ./run_bakeoff.sh      (progress in cache/bakeoff.log; ends with "ALL PASSES DONE")
cd "$(dirname "$0")" || exit 1
export PYTHONUNBUFFERED=1
run() { nice -n 19 .venv/bin/python bakeoff.py "$@" >> cache/bakeoff.log 2>&1; }
run sample --albums "${ALBUMS:-1000}"
run run --tracks "${TRACKS:-2}" --models clap,mert --device mps --threads 1
run run --tracks "${TRACKS:-2}" --workers 2 --threads 1 --device mps
run status
echo "ALL PASSES DONE $(date +%T)" >> cache/bakeoff.log
