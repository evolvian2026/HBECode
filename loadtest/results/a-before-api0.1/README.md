# Load test results: loadtest/results/a-before-api0.1

| Students | login p95 | start attempt p95 | heartbeat p95 | draft save p95 | events p95 | live monitor p95 | Run → verdict p50 / p95 (n) | Submit → verdict p50 / p95 / max | HTTP errors | AC verdicts | WS opened |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 10 | 1225 ms | 162 ms | 1764 ms | 1931 ms | 1922 ms | 1693 ms | 2298 ms / 6601 ms (37) | 9949 ms / 12.6 s / 13.1 s | 0.0 % | 100.0 % | 100.0 % |
| 20 | 1459 ms | 506 ms | 5352 ms | 5279 ms | 5345 ms | 3037 ms | 3693 ms / 9251 ms (68) | 56.3 s / 66.0 s / 68.5 s | 0.12 % | 100.0 % | 100.0 % |
| 40 | 4143 ms | 7125 ms | 12.9 s | 12.9 s | 13.0 s | 5290 ms | 113.2 s / 182.9 s (70) | 181.0 s / 183.1 s / 184.0 s | 6.3 % | 40.7 % | 100.0 % |

Peak container CPU (100 % = one core) / memory, sampled every ~5 s:

| Students | API | Postgres | Executor | requests |
|---|---|---|---|---|
| 10 | 11 % / 243 MiB | 21 % / 230 MiB | 122 % / 232 MiB | 1071 |
| 20 | 11 % / 243 MiB | 23 % / 255 MiB | 156 % / 236 MiB | 2476 |
| 40 | 11 % / 249 MiB | 28 % / 269 MiB | 154 % / 232 MiB | 9147 |
