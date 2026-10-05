# Load test results: loadtest/results/c-optimized-sse-api0.1

| Students | login p95 | start attempt p95 | heartbeat p95 | draft save p95 | events p95 | live monitor p95 | Run → verdict p50 / p95 (n) | Submit → verdict p50 / p95 / max | HTTP errors | AC verdicts | WS opened |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 10 | 1193 ms | 209 ms | 586 ms | 511 ms | 509 ms | 667 ms | 578 ms / 1526 ms (36) | 3133 ms / 3825 ms / 3902 ms | 0.0 % | 100.0 % | 100.0 % |
| 20 | 1231 ms | 306 ms | 1136 ms | 1293 ms | 1099 ms | 892 ms | 588 ms / 1700 ms (70) | 12.1 s / 15.9 s / 16.1 s | 0.0 % | 100.0 % | 100.0 % |
| 40 | 2157 ms | 1697 ms | 2875 ms | 2718 ms | 3132 ms | 1287 ms | 890 ms / 3671 ms (128) | 50.0 s / 72.7 s / 74.3 s | 0.0 % | 100.0 % | 100.0 % |

Peak container CPU (100 % = one core) / memory, sampled every ~5 s:

| Students | API | Postgres | Executor | requests |
|---|---|---|---|---|
| 10 | 11 % / 226 MiB | 14 % / 234 MiB | 156 % / 240 MiB | 862 |
| 20 | 11 % / 229 MiB | 16 % / 216 MiB | 120 % / 245 MiB | 1726 |
| 40 | 11 % / 231 MiB | 26 % / 220 MiB | 188 % / 251 MiB | 3770 |
