# Phase 5 report — bulk upload, validator, templates

Branch `claude/compassionate-carson-jcy713`. Everything below was run in this phase on a 4-core x86_64 dev box. Numbers are as measured, including what failed along the way.

## What was built

| Area | Delivered |
|---|---|
| **One format, three files** (`packages/question-format`) | A lossless table view of the canonical question (`QuestionInput`, the same schema the editor and API use) for all three types — coding, web, database. Excel: one sheet per table (*Questions*, *Coding tests*, *Web checks*, *DB datasets*, *Code*, *Web files*), linked by a question `key`. Word: per question a *Field \| Value* table plus tables for tests, code and files; text between tables is ignored. JSON: the canonical objects. Values longer than an Excel cell (32,767 characters — e.g. a 200,000-number stress test) continue on extra rows (`part`). |
| **Templates** | Excel and Word templates with an *Instructions* sheet/section and one complete, valid example of each type (coding in 8 languages, HTML/CSS, SQL for PostgreSQL + MySQL), 43 KB / 39 KB. A browser test imports the unchanged template and all three examples **pass real sandbox validation and publish**. |
| **Bulk upload** | Question bank → Import: upload `.xlsx`, `.docx` or `.json` (10 MB / 500 questions; 5 MB on the free Render plan) → **preview** with every question marked *ready*, *invalid* or *duplicate*, *new* or *update*, and each problem located by **table, row and column** (e.g. `Coding tests, row 14 · weight: "heavy" is not a number`) → **Download problem report** (Excel) → **Import**, optionally with *validate in the sandbox and publish when it passes*, with live progress (published / running / failed). Nothing is created before you confirm. |
| **Validator** | The same rules as the editor, applied per row: the schema (types, ranges, required fields, valid check JSON), then the publish checklist as warnings (2 samples, 10–15 hidden tests, stress test for moderate/hard, 5 required languages, …; web 8–15 checks; DB 8–15 datasets, solutions per dialect), then — if chosen — sandbox validation (every reference solution on every test with ≥ 30% time headroom; starter must fail for web; dialect agreement and anti-hard-coding for DB). |
| **Export and bulk edit** | Question bank → tick questions → Export (Excel / Word / JSON). Files carry each question's `id`; re-importing them **updates** those questions (a published question gets a new version; tests keep the version they pinned). Exports include hidden tests, drivers and solutions, so only questions you can edit can be exported, and every export is audited. |
| **Safety** | Uploads are untrusted: magic-byte check, size cap at the HTTP layer, zip inflate limits enforced while streaming, DTDs rejected (no entity expansion / XXE), no formulas written or evaluated, parsing in a worker thread with a heap limit and timeout. Uploads are visible only to the institution's teachers (RLS); the file is dropped after parsing, question data in the preview is cleared on import, and uploads are deleted after 7 days. |
| **Docs** | [Question format guide](question-format.md) (workflow, publish rules, Excel/Word/JSON specifics, web check and DB setup syntax, limits, full column reference — generated from the code's column spec, with a test that fails if they drift), architecture §15.7, threat model §5c (U1–U7), deployment notes, OpenAPI (8 new operations; Redocly: valid). |

## Test results (final runs)

| Suite | Tests | What it proves |
|---|---|---|
| `packages/question-format` (new) | 17 | **Export → import is lossless in Excel, Word and JSON for all 7 seed questions** (coding with 200,000-number stress tests, HTML, JS, React, SQL, MongoDB, pandas) and for a question built to break things: leading/trailing spaces, tabs, `\r\n` and lone `\r`, control characters, emoji, a literal `_x000D_`, a value starting with the Word escape marker, `=SUM(A1)`, a 100,000-character input split over 4 parts. Excel files as Excel itself saves them (shared strings, rich text, numbers, `_x000D_`, formulas → cached value + warning). Errors located by row and column; duplicate keys / numbers / missing parts; publish gaps → warnings, still importable. **Hostile files:** not-a-zip, billion-laughs DTD, XXE `SYSTEM` entity (xlsx and docx), a 70 MB part packed into < 200 KB (refused at 64 MB), 501 questions. Templates parse back into their examples. The guide documents every column. |
| `packages/db` | 46 (43 + **3 new**) | Upload rows inherit the job's tenant; only teachers of the tenant see uploads (associates, institution admins, students, other tenants: nothing); global uploads are platform-only; no cross-tenant writes |
| `apps/api` | 99 (85 + **14 new**) | Templates are author-only; the unchanged template → 3 ready rows → import creates drafts in the author's tenant and clears the stored payloads; re-upload → duplicates; **import with publish → sandbox validation → published**; per-row errors with locations and a downloadable report whose rows say *error \| Q2 \| … \| Coding tests, row n \| weight \| "heavy" is not a number*; good rows import alongside bad ones; wrong type / oversize (413) / damaged / **zip bomb** → refused or `failed` with the reason; other tenants 404, associates/students 403; exports author-only, editable questions only (a teacher exporting a global question → 403), audited; **export from institution A → import into institution B is identical field by field in all three formats**; re-import with an id updates the question; audit trail (`upload.create/confirm/import`, `question.export/create/update`) |
| Other suites | 24 + 3 + 10 | shared, web-runtime, executor unit — unchanged, pass |
| `apps/web` Playwright on a **fresh** `docker compose up` + `seed` | 18 (15 + **3 new**) | Teacher downloads both templates; the Excel template previews as 3 questions with no errors; a JSON file with one good and one bad question shows *1 ready · 1 with errors*, the problem, and the report downloads; importing the good one; exporting it from the question bank as Excel and uploading that file shows it as an **update**; **the template's 3 examples pass real sandbox validation and publish (9 s)**. All Phase 2–4 flows still pass. No CSP violations or page errors. |
| `apps/api` e2e with the real executor | 13 (unchanged suites, rerun) | Phases 2–4 grading in all 8 languages, web and DB graders, attempts graded by the sandbox: all pass after the Phase 5 changes |

### Measured

| | Size | Questions | Parse time (worker thread) |
|---|---|---|---|
| All 7 seeds, Excel | 1.25 MB | 7 | 635 ms |
| All 7 seeds, Word | 1.25 MB | 7 | 850 ms |
| All 7 seeds, JSON | 4.81 MB | 7 | 246 ms |
| Seed copies, Excel | 9.92 MB | 55 | 2,666 ms |
| Seed copies, Word | 9.97 MB | 54 | 4,875 ms |
| Seed copies, JSON | 9.62 MB | 14 | 375 ms |

All of them parsed inside the worker's 384 MB heap limit. Reading the 10 MB Excel file in-process peaked at about **310 MB RSS** (sampled; a sample can miss the very top). That is why `render.yaml` sets 5 MB uploads on the free 512 MB instance. Seed copies are a worst case: one in seven has two ~2 MB stress tests. Ordinary questions are a few KB each, so 500 of them fit easily.

## Failures found along the way, and what changed

- **My first parse of Excel with fast-xml-parser left numeric character references (`&#10;`) undecoded.** Found by a probe before writing the reader; entity handling is now ours (five predefined entities + numeric references, nothing else), which also closes entity expansion.
- An **Excel `str` (formula string) cell was entity-decoded twice** — caught while re-reading the reader, before any test.
- The lossless tests were checked by mutation: with carriage-return escaping (Excel) and base64 decoding (Word) disabled, exactly the two hostile-string tests fail.
- **Import page bugs found by the browser tests:** after *Import*, the page did not refresh (React batched the "reset and restart polling" into one update); now an explicit refresh counter. File inputs in tests whose output folder had a non-ASCII name silently did nothing; the spec now uses a plain temp folder (test fix).
- **Template examples collided with the seed questions.** The first fresh-volume run had 5 failures: the import spec (which runs first) imported the template's examples, whose titles equalled the seed questions and which were marked "practice", so later specs saw two *Sum of an Array*. Same-title questions in different banks are allowed, but template examples should not look like real bank questions: they are now titled *Template example: …* and are not practice questions. Then 18/18.
- A lint rule flagged a literal BOM character in a regex and intentional control-character regexes; fixed/annotated.

## Known gaps and honest caveats

1. **Word AutoCorrect can change typed code** (smart quotes, `--` → `—`). The template and guide say to turn it off; we import exactly what the file contains.
2. **Empty means "not set".** A field deliberately set to an empty string where the schema has no default (e.g. an empty DB starter) comes back as absent. Tags containing commas cannot be expressed in the comma-separated column. Neither occurs in the seeds; JSON has neither limitation.
3. **Excel formulas are not evaluated** (the cached value is used, with a warning). A file saved by a program that does not store cached values imports those cells as empty.
4. Excel/Word uploads are limited by memory on the free plan (5 MB; split bigger files). JSON is the efficient format for very large stress tests.
5. Validation of a big import is executor-bound: 500 coding questions × 8 languages is 4,000 validation runs at the lowest priority. On the pilot's 2-slot executor that takes a while (not measured at that size). Test and practice runs are claimed first, but a validation job already running holds its slot until it finishes (a few seconds), so avoid big imports during a live test.
6. Tested with files produced by our own writers and with hand-built Excel-style XML (shared strings, rich text). **Not tested with files saved by Microsoft Excel, LibreOffice or Google Sheets / Microsoft Word, LibreOffice Writer or Google Docs** (none is available in this environment). They follow the same OOXML structures our reader handles, but please try a round trip through your editor of choice during review; any mismatch will show up in the preview, not as silent changes.
7. The upload preview shows at most six warnings per row (all are in the report).
8. Not built: a T-SQL format (T-SQL is postponed), importing from other platforms' formats (HackerRank, Moodle XML), and question images/attachments.

## Sign-ins needed from you

None for this phase.
