# Load test results: loadtest/results/d-optimized-sse-api0.5

| Students | login p95 | start attempt p95 | heartbeat p95 | draft save p95 | events p95 | live monitor p95 | Run → verdict p50 / p95 (n) | Submit → verdict p50 / p95 / max | HTTP errors | AC verdicts | WS opened |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 20 | 203 ms | 54 ms | 42 ms | 46 ms | 41 ms | 49 ms | 429 ms / 1082 ms (72) | 1081 ms / 2816 ms / 3066 ms | 0.0 % | 100.0 % | 100.0 % |
| 40 | 190 ms | 81 ms | 38 ms | 54 ms | 43 ms | 53 ms | 424 ms / 1096 ms (141) | 1743 ms / 4428 ms / 4740 ms | 0.0 % | 100.0 % | 100.0 % |
| 80 | 189 ms | 54 ms | 81 ms | 96 ms | 84 ms | 216 ms | 549 ms / 1681 ms (287) | 25.7 s / 39.3 s / 40.3 s | 0.0 % | 100.0 % | 100.0 % |

Peak container CPU (100 % = one core) / memory, sampled every ~5 s:

| Students | API | Postgres | Executor | requests |
|---|---|---|---|---|
| 20 | 40 % / 230 MiB | 22 % / 217 MiB | 182 % / 230 MiB | 1722 |
| 40 | 33 % / 221 MiB | 30 % / 219 MiB | 184 % / 262 MiB | 3368 |
| 80 | 43 % / 236 MiB | 41 % / 223 MiB | 182 % / 291 MiB | 7134 |
