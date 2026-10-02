# Question format guide

How to write questions for HBECode in **Excel**, **Word** or **JSON**, import them in bulk, and export them again.
Teachers (and super admins for the global bank) use **Question bank → Import**. This guide is the reference;
the templates downloadable from that page contain the same instructions and one complete example of each type.

## The workflow

1. Download the **Excel** or **Word** template (Question bank → Import). Each contains a coding, a web (HTML/CSS) and a database (SQL) example.
2. Fill in your questions. Keep the header rows/column names unchanged; you may delete columns you do not use.
3. Upload the file (up to 10 MB and 500 questions per file by default). **Nothing is created yet.** You get a preview:
   - `ready` — will be imported (warnings such as "not ready to publish: …" mean it will be a draft until fixed);
   - `invalid` — has errors, listed with the **table, row and column** (e.g. `Coding tests, row 14 · weight: "abc" is not a number`);
   - `duplicate` — a question with the same title and statement already exists in your institution (or twice in the file).
   **Download problem report** gives every error and warning as an Excel sheet.
4. Click **Import**. Optionally tick *Validate each question in the sandbox and publish it when it passes*: every reference solution then runs against every test, exactly like the Validate button in the editor, and the page shows the progress (published / running / failed).
5. Fix the invalid rows and upload the file again — rows already imported come back as `duplicate` and are skipped.

**Updating questions in bulk:** export them (Question bank → tick questions → Export). The exported file carries each question's `id`. Edit it and import it again: rows with an `id` you can edit update that question (a published question gets a new version; tests that use the old version keep it). Exports contain **hidden tests, drivers and reference solutions** — keep them private. Only questions you can edit can be exported, and every export is recorded in the audit log.

Export → import is **lossless**: every field, whitespace, tab, line ending (including Windows `\r\n`), control character and Unicode character comes back exactly (verified by automated tests for all three formats).

## What makes a question publishable

| Type | Rules checked before sandbox validation |
|---|---|
| Coding | statement ≥ 20 characters; constraints, input format, output format, time and space complexity filled in; **exactly 2 samples**, each with an explanation; **10–15 hidden tests**; moderate/hard questions need at least one stress test (`stress = yes`); no two tests with the same input; templates (starter, driver, solution) for **C, C++, Java, Python and JavaScript** at least (Go, Rust, C# optional) |
| Web | statement ≥ 20 characters; **exactly 2 sample checks** and **8–15 hidden checks**; starter and reference files both include `index.html` (HTML) or `App.jsx` (React); no two identical checks |
| DB | statement ≥ 20 characters; schema description; **exactly 2 sample datasets** and **8–15 hidden datasets**; a reference solution and a setup for every dialect; DML questions need a state query and support PostgreSQL/MySQL only; no two identical datasets |

Sandbox validation then runs every reference solution on every test: it must pass all of them with at least **30% of the time limit to spare**. For web questions the starter files must **fail** at least one hidden check; for DB questions the reference output becomes the expected result (you never type expected tables), all dialects must agree, and at least half of the hidden datasets must give a different answer from every sample.

## Excel

One workbook, one sheet per table below (sheet names must match; an `Instructions` sheet or any other sheet is ignored). The first non-empty row of each sheet is its header.
Each question has a **key** (e.g. `Q1`) in *Questions*; rows in the other sheets refer to it with the same key.

- **Long values.** An Excel cell holds at most 32,767 characters. A longer value (a big stress-test input, a long setup script) continues on the next row with the same key and identity columns (`kind` + `no`, `language`, or `set` + `path`) and `part` = 2, 3, …; the parts are joined without separators. Exports do this automatically (≤ 32,000 characters per part).
- **Text is text.** Enter values as plain text. Formulas are not evaluated by us: if a cell has one, its last calculated value is used and a warning says so. Numbers typed as numbers are fine (`1000`, `0.000001`).
- Special characters are stored the way Excel stores them (`_x000D_` for a carriage return, etc.) — you do not need to do anything.
- Yes/no columns accept `yes`/`no` (also `true`/`false`, `y`/`n`, `1`/`0`). List columns (`tags`, `dialects`) are comma-separated.

## Word

One document. Each question is a **two-column table whose header row is `Field | Value`** (the *Questions* columns, one per row), followed by tables for its tests, code and files. Those tables have a header row with the same column names as the Excel sheets, including `key` — that is how a table is recognised. Paragraphs between tables are notes and are ignored.

- Inside a cell, **each paragraph is one line**; tabs and spaces are kept. A value containing characters Word cannot hold (control characters, a carriage return on its own) is written as `[[base64]]…` by exports — leave such cells as they are.
- Turn **off AutoCorrect** ("smart quotes", automatic capitalisation, "-- → —") before typing code or test data: Word would otherwise change your characters, and the change would be imported.
- There is no cell size limit, so `part` is not needed in Word.

## JSON

The canonical format — the same objects the API accepts at `POST /api/v1/questions`:

```json
{
  "format": "hbecode-questions",
  "version": 1,
  "questions": [
    {
      "type": "coding",
      "title": "Sum of an Array",
      "statement": "Given an array of n integers, …",
      "difficulty": "easy",
      "tags": ["arrays"],
      "isPractice": true,
      "constraints": "…", "inputFormat": "…", "outputFormat": "…",
      "timeComplexity": "O(n)", "spaceComplexity": "O(1)",
      "baseTimeLimitMs": 1000, "memoryLimitMb": 256,
      "compare": { "mode": "trim_trailing" },
      "samples": [{ "input": "3\n1 2 3\n", "output": "6\n", "explanation": "1 + 2 + 3 = 6." }],
      "hidden": [{ "input": "…", "output": "…", "weight": 1, "isStress": false }],
      "templates": { "python": { "stub": "…", "driver": "…", "solution": "…" } }
    }
  ]
}
```

A bare array of questions, or a single question object, is also accepted. Exported questions carry an `"id"`. The exact schema (all three types) is in `packages/shared/src/schemas/` and in the OpenAPI document (`QuestionInput`).

### Web check definitions (`check` column / `spec`)

```json
{"kind":"exists","selector":"nav a","count":{"min":3}}
{"kind":"text","selector":"h1","match":{"equals":"Hello"}}
{"kind":"attribute","selector":"img.avatar","name":"alt","match":{"contains":"photo"}}
{"kind":"style","selector":".card","property":"display","match":{"equals":"flex"}}
{"kind":"role","role":"button","name":"Add to cart","count":{"eq":3}}
{"kind":"a11y","rule":"img-alt"}
{"kind":"interaction","steps":[{"action":"fill","selector":"#todo","value":"Milk"},{"action":"click","selector":"#add"}],"then":{"kind":"text","selector":"li:last-child","match":{"contains":"Milk"}}}
```

`match` takes exactly one of `equals`, `contains` or `matches` (a regular expression). Colours are compared as computed values (`rgb(255, 0, 0)`). a11y rules: `img-alt`, `input-labels`, `button-names`, `document-lang`, `single-h1`. Steps: `click`, `fill`, `press`, `hover`, `check`, `uncheck`, `select`.

### DB dataset setups

- `setup_sql` runs on PostgreSQL and MySQL; `setup_postgres` / `setup_mysql` override it for one dialect.
- `setup_mongodb`: `{"orders": [{"customer": "a", "items": [...]}, …], "other_collection": [...]}`.
- `setup_pandas`: `{"sales": "date,region,amount\n2024-01-03,North,120\n…"}` — each table becomes a DataFrame argument of `solve(...)`.

## Limits and safety

- Up to **10 MB per file** by default (`UPLOAD_MAX_BYTES`; 5 MB recommended on the free Render plan), **500 questions per file**, 10 uploads per 10 minutes per author.
- Files are read in an isolated worker with memory and time limits. Excel/Word files are zip archives: we refuse archives that unpack to more than 64 MB per part or 160 MB in total, and XML with DTDs (entity-expansion and XXE attacks).
- Uploads, and the hidden data in them, are deleted after **7 days**; the question data inside an upload is cleared as soon as it is imported.

## Column reference

### Questions

One row per question. Columns that do not apply to the question type stay empty.

| Column | Applies to | What to enter |
|---|---|---|
| `key` | all | Short label that links this question to its rows in the other tables, e.g. Q1. Unique in the file. |
| `id` | all | Leave empty for new questions. Filled by export: re-importing a row with an id updates that question (a published question gets a new version). |
| `type` | all | coding, web or db. |
| `title` | all | 3–200 characters. |
| `difficulty` | all | easy, moderate or hard. |
| `tags` | all | Comma-separated, e.g. arrays, hashing (at most 10). |
| `is_practice` | all | yes = also visible in Practice; no = tests only. |
| `statement` | all | Problem statement (Markdown). |
| `constraints` | coding | Markdown. |
| `input_format` | coding | Markdown. |
| `output_format` | coding | Markdown. |
| `time_complexity` | coding | Expected time complexity, e.g. O(n). |
| `space_complexity` | coding | Expected space complexity, e.g. O(1). |
| `time_limit_ms` | coding, db | Coding: base time limit (× language multiplier), 100–10000. DB: per-dataset limit, 200–10000. |
| `memory_limit_mb` | coding | 32–1024. |
| `compare_mode` | coding | exact, trim_trailing, unordered_lines or float. |
| `compare_epsilon` | coding | Tolerance for float mode, e.g. 0.000001. |
| `framework` | web | html or react. |
| `check_timeout_ms` | web | Time budget per check, 1000–15000. |
| `dialects` | db | Comma-separated: postgres, mysql, mongodb, pandas. |
| `db_mode` | db | query (compare the result) or dml (compare the state query output). |
| `schema_display` | db | Tables/collections shown to students (Markdown). |
| `state_query_sql` | db | DML only: query whose output is compared (PostgreSQL and MySQL). |
| `state_query_postgres` | db | DML only: PostgreSQL-specific state query. |
| `state_query_mysql` | db | DML only: MySQL-specific state query. |
| `order_sensitive` | db | yes if row order matters. |
| `column_names` | db | exact, ignore_case or ignore. |
| `float_epsilon` | db | Numeric tolerance, e.g. 0.000001. |
| `ignore_mongo_id` | db | MongoDB: yes to drop _id before comparing. |

### Coding tests

Coding questions: exactly 2 samples (with explanations) and 10–15 hidden tests. Long inputs continue on the next row with the same key/kind/no and part 2, 3, …

| Column | Applies to | What to enter |
|---|---|---|
| `key` | all | Question key. |
| `kind` | all | sample or hidden. |
| `no` | all | 1, 2, 3, … within the kind. |
| `part` | all | Leave empty (or 1). 2, 3, … continue a long value from the previous row. |
| `weight` | all | Hidden tests: 1–100 (default 1). |
| `stress` | all | Hidden tests: yes for a max-constraint stress test. |
| `explanation` | all | Samples: why the output is correct (Markdown). |
| `input` | all (long: may continue on extra rows) | Exact stdin. |
| `output` | all (long: may continue on extra rows) | Exact expected stdout. |

### Web checks

Web questions: exactly 2 sample checks and 8–15 hidden checks. `check` is the check definition in JSON (see the format guide).

| Column | Applies to | What to enter |
|---|---|---|
| `key` | all | Question key. |
| `kind` | all | sample or hidden. |
| `no` | all | 1, 2, 3, … within the kind. |
| `title` | all | What is checked (shown to students for samples). |
| `weight` | all | 1–100 (default 1). |
| `viewport` | all | Optional WIDTHxHEIGHT, e.g. 375x800, for responsive checks. |
| `check` | all | JSON, e.g. {"kind":"text","selector":"h1","match":{"equals":"Hello"}}. |

### DB datasets

DB questions: exactly 2 sample and 8–15 hidden datasets. Expected results are not typed: validation runs the reference solution on each dataset.

| Column | Applies to | What to enter |
|---|---|---|
| `key` | all | Question key. |
| `kind` | all | sample or hidden. |
| `no` | all | 1, 2, 3, … within the kind. |
| `part` | all | Continuation of long setup scripts (2, 3, …). |
| `weight` | all | 1–100 (default 1). |
| `explanation` | all | Samples: shown with the expected output. |
| `setup_sql` | all (long: may continue on extra rows) | SQL run before the student query (PostgreSQL and MySQL). |
| `setup_postgres` | all (long: may continue on extra rows) | PostgreSQL-specific setup (overrides setup_sql). |
| `setup_mysql` | all (long: may continue on extra rows) | MySQL-specific setup (overrides setup_sql). |
| `setup_mongodb` | all (long: may continue on extra rows) | EJSON: {"collection": [ {document}, … ]}. |
| `setup_pandas` | all (long: may continue on extra rows) | JSON: {"table_name": "csv text with header", …}. |

### Code

Coding: one row per language with starter (stub), hidden driver and reference solution; C, C++, Java, Python and JavaScript are required. DB: one row per dialect with starter and reference solution (driver empty).

| Column | Applies to | What to enter |
|---|---|---|
| `key` | all | Question key. |
| `language` | all | Coding: c, cpp, java, python, javascript, go, rust, csharp. DB: postgres, mysql, mongodb, pandas. |
| `part` | all | Continuation of long code (2, 3, …). |
| `starter` | all (long: may continue on extra rows) | Code students start from. |
| `driver` | all (long: may continue on extra rows) | Coding only: hidden driver that reads input and calls the student code. |
| `solution` | all (long: may continue on extra rows) | Reference solution (never shown to students). |

### Web files

Web questions: starter files (what students get) and reference files (a correct solution). index.html (HTML) or App.jsx (React) is required in both sets.

| Column | Applies to | What to enter |
|---|---|---|
| `key` | all | Question key. |
| `set` | all | starter or reference. |
| `path` | all | File name, e.g. index.html, styles.css, App.jsx. |
| `part` | all | Continuation of long files (2, 3, …). |
| `content` | all (long: may continue on extra rows) | File content. |

