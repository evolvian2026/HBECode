# Load test (k6)

`exam.js` simulates a class sitting a timed, proctored coding test, the heaviest thing the pilot does. Each virtual user is one student doing what the exam page does:

- signs in, spread over `LOGIN_SPREAD` seconds (a class arriving), starts the attempt, opens the question and keeps a WebSocket open;
- sends a heartbeat every 15 s, a proctoring event batch every 5 s (30 % of the time), and a draft save every 8–12 s;
- presses **Run** about every `RUN_EVERY` seconds and waits for the verdict;
- in the last minute **Submits** (graded on the hidden tests) and finishes the test, all within ~45 s: the end-of-test burst.

Answers rotate between Python, C++ and Java. One teacher watches the live monitor (every 10 s). Verdicts arrive as the web app gets them, on the Server-Sent Events stream of the submission (one request that the server closes when grading finishes). `WAIT=poll` polls every 0.5 s instead, which is much heavier: 20 students waiting a minute add ~40 requests per second.

## Run it

```bash
# needs Docker (Compose v2), k6 ≥ 1.0, and the images: docker compose build (or see the root README)
loadtest/run.sh                          # pilot-sized stack, 10 → 20 → 40 → 80 students, 6-minute tests
STEPS="20" DURATION=4m loadtest/run.sh   # one step
API_CPUS=0.5 loadtest/run.sh             # the same with a 0.5-CPU API (Render's paid Starter size)
FRESH=0 …                                # reuse the running stack (skips the ~35-minute seed validation)
WAIT=poll …                              # poll for verdicts instead of SSE
```

`run.sh` starts a fresh stack with `loadtest/docker-compose.pilot.yml` (resource limits that mirror the pilot, see the comments in that file), seeds `load1…loadN@demo.edu`, waits until the 170 seed questions are validated (so the executor is idle), then runs each step while sampling `docker stats`. Everything goes to `loadtest/results/<timestamp>/`: k6 summaries (`k6-N.json`, `k6-N.txt`), container stats, API warnings and a `README.md` table made by `summarize.mjs`. Failed requests are logged by name and status in `k6-N.txt`.

Ports: set `PG_HOST_PORT` / `REDIS_HOST_PORT` if 5432/6379 are taken on the host.

## What it cannot tell you

- **Network:** everything is on one machine. Add the India → Singapore round trip (~60–120 ms) to every request.
- **CPU architecture and neighbours:** the executor runs on 2 cores of an x86 box here; Oracle A1 is ARM64. Free hosts share CPU with other tenants.
- **Render's own limits:** the 0.1-CPU cap is reproduced with Docker's CFS quota; Render's scheduler may behave differently under bursts.
- **Browsers:** k6 does not run the web app; page loads come from the static host and are not part of this test.

The published results and what was changed because of them are in [docs/phase-8-report.md](../docs/phase-8-report.md).
