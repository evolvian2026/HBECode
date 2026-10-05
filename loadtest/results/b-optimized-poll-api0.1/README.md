# Load test results: loadtest/results/b-optimized-poll-api0.1

| Students | login p95 | start attempt p95 | heartbeat p95 | draft save p95 | events p95 | live monitor p95 | Run → verdict p50 / p95 (n) | Submit → verdict p50 / p95 / max | HTTP errors | AC verdicts | WS opened |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 20 | 1938 ms | 650 ms | 1943 ms | 1810 ms | 2074 ms | 1588 ms | 1057 ms / 4355 ms (65) | 14.5 s / 24.5 s / 26.3 s | 0.0 % | 100.0 % | 100.0 % |

Peak container CPU (100 % = one core) / memory, sampled every ~5 s:

| Students | API | Postgres | Executor | requests |
|---|---|---|---|---|
| 20 | 11 % / 223 MiB | 26 % / 250 MiB | 167 % / 260 MiB | 2108 |
