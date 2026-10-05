#!/usr/bin/env bash
# Run the exam load test against a fresh pilot-sized stack and keep every result.
#   loadtest/run.sh                     # steps 10 20 40 80 students, 6-minute tests
#   STEPS="20" DURATION=4m loadtest/run.sh
#   API_CPUS=1 loadtest/run.sh          # same, with a 1-CPU API (a paid instance) for comparison
# Needs Docker (Compose v2), k6 (https://k6.io) and the three images (docker compose build).
set -euo pipefail
cd "$(dirname "$0")/.."
STEPS=${STEPS:-"10 20 40 80"}
DURATION=${DURATION:-6m}
MAX=$(echo "$STEPS" | tr ' ' '\n' | sort -n | tail -1)
OUT=${OUT:-loadtest/results/$(date -u +%Y%m%dT%H%M%SZ)-api${API_CPUS:-0.1}cpu}
mkdir -p "$OUT"

# Throwaway keys for this local stack only (never reused anywhere else).
ENVF=loadtest/.env.loadtest
if [ ! -f "$ENVF" ]; then
  {
    printf 'JWT_PRIVATE_KEY="%s"\n' "$(openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 2>/dev/null)"
    printf 'MFA_ENCRYPTION_KEY=%s\n' "$(openssl rand -base64 32)"
  } > "$ENVF"
fi
set -a; . "$ENVF"; set +a
export API_CPUS=${API_CPUS:-0.1}
DC=(docker compose -f docker-compose.yml -f loadtest/docker-compose.pilot.yml)

if [ "${FRESH:-1}" = 1 ]; then "${DC[@]}" down -v >/dev/null 2>&1 || true; fi
t_up=$(date +%s)
"${DC[@]}" up -d
# On 0.1 CPU the API needs a while to boot (Render free has the same cold start after sleeping).
until curl -sf -o /dev/null http://localhost:4000/readyz; do sleep 1; done
echo "API ready $(( $(date +%s) - t_up )) s after 'up' (API_CPUS=$API_CPUS)" | tee "$OUT/api-start.txt"
SEED_LOAD_STUDENTS=$MAX "${DC[@]}" run --rm -e SEED_LOAD_STUDENTS="$MAX" seed | tail -2

echo "waiting for the seed bank to finish validating (the executor must be idle before measuring)…"
psql_() { "${DC[@]}" exec -T postgres psql -U hbe_owner -d hbe -tAc "$1"; }
t0=$(date +%s)
until [ "$(psql_ "SELECT count(*) FROM hbe.questions q JOIN hbe.question_versions v ON v.id = q.latest_version_id WHERE q.tenant_id IS NULL AND q.status NOT IN ('published','invalid')")" = 0 ]; do
  sleep 15
done
echo "seed bank validated in $(( $(date +%s) - t0 )) s: $(psql_ "SELECT string_agg(status||'='||n, ' ') FROM (SELECT status, count(*) n FROM hbe.questions GROUP BY 1) x")" | tee "$OUT/seed.txt"

for n in $STEPS; do
  echo "=== $n students"
  ( while :; do docker stats --no-stream --format "$(date +%s),{{.Name}},{{.CPUPerc}},{{.MemUsage}}" ; sleep 3; done ) > "$OUT/stats-$n.csv" 2>/dev/null &
  sampler=$!
  taskset -c 1 k6 run -q -e STUDENTS="$n" -e DURATION="$DURATION" -e WAIT="${WAIT:-sse}" -e SUMMARY_OUT="$OUT/k6-$n.json" loadtest/exam.js 2>&1 | tee "$OUT/k6-$n.txt" || true
  kill "$sampler" 2>/dev/null || true
  "${DC[@]}" logs --no-color --since 15m api 2>&1 | grep -E '"level":(40|50|60)' > "$OUT/api-warnings-$n.log" || true
  sleep 20 # let the queue drain completely between steps
done
node loadtest/summarize.mjs "$OUT" | tee "$OUT/README.md"
