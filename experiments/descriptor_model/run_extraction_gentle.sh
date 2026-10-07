#!/bin/bash
# Run extract_embeddings.py politely on a laptop that is also being used for other work.
#
# - low CPU priority (nice), 2 CPU workers, no MERT-v2 (the one encoder that needs ~2.5 GB of weights)
# - `caffeinate -s` only keeps the machine awake while on AC power
# - a watchdog pauses the job (SIGSTOP) and resumes it (SIGCONT) when:
#     * system-wide free memory drops below MEM_PAUSE %  (resumes above MEM_RESUME %)
#     * macOS reports a CPU speed limit below 100 (thermal throttling)
#     * the laptop is on battery below BATT_PAUSE %
# The extractor is resumable, so killing this script (SIGTERM) and rerunning it loses nothing.
#
# usage: ./run_extraction_gentle.sh [extra extract_embeddings.py args]
set -u
cd "$(dirname "$0")"

MEM_PAUSE=${MEM_PAUSE:-12}
MEM_RESUME=${MEM_RESUME:-22}
BATT_PAUSE=${BATT_PAUSE:-30}
POLL=${POLL:-30}
WLOG=cache/watchdog.log

mkdir -p cache
nice -n 10 caffeinate -s .venv-audio/bin/python extract_embeddings.py \
  --workers 2 --no-mert-v2 --max-tracks 6 "$@" > cache/extract.stdout 2>&1 &
JOB=$!
trap 'kill -CONT $(pgrep -P $JOB) $JOB 2>/dev/null; kill -TERM $(pgrep -f "\.venv-audio/bin/python extract_embeddings.py") 2>/dev/null; wait $JOB; exit 143' TERM INT

pids() {  # the extractor and its worker processes
  local main; main=$(pgrep -f "\.venv-audio/bin/python extract_embeddings.py" | head -1)
  [ -n "$main" ] && echo "$main" $(pgrep -P "$main")
}
note() { echo "$(date '+%H:%M:%S') $*" >> "$WLOG"; }

paused=0
note "started job $JOB (mem pause<$MEM_PAUSE% resume>$MEM_RESUME%, battery pause<$BATT_PAUSE%)"
while kill -0 $JOB 2>/dev/null; do
  sleep "$POLL"
  free=$(memory_pressure 2>/dev/null | awk -F': ' '/free percentage/ {gsub("%","",$2); print $2}')
  free=${free:-100}
  limit=$(pmset -g therm 2>/dev/null | awk '/CPU_Speed_Limit/ {print $3}')
  limit=${limit:-100}
  batt=$(pmset -g batt | grep -Eo '[0-9]+%' | head -1 | tr -d '%')
  batt=${batt:-100}
  on_batt=0; pmset -g batt | head -1 | grep -q "Battery Power" && on_batt=1

  reason=""
  [ "$free" -lt "$MEM_PAUSE" ] && reason="memory free ${free}%"
  [ "$limit" -lt 100 ] && reason="thermal CPU limit ${limit}"
  [ "$on_batt" -eq 1 ] && [ "$batt" -lt "$BATT_PAUSE" ] && reason="battery ${batt}%"

  if [ -n "$reason" ] && [ "$paused" -eq 0 ]; then
    kill -STOP $(pids) 2>/dev/null; paused=1; note "PAUSED: $reason"
  elif [ "$paused" -eq 1 ] && [ -z "$reason" ] && [ "$free" -ge "$MEM_RESUME" ]; then
    kill -CONT $(pids) 2>/dev/null; paused=0; note "RESUMED (memory free ${free}%, battery ${batt}%)"
  fi
done
wait $JOB
rc=$?
note "job exited with $rc"
exit $rc
