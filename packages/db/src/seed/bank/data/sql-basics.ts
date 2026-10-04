import type { DbQuestionInput } from '@hbe/shared';
import { CITIES, ds, int, md, nameOf, pick, rng, sqlQuestion, table } from './common.js';

type Student = [number, string, string, number, number | null];
const DDL = 'id INT PRIMARY KEY, name VARCHAR(40) NOT NULL, city VARCHAR(30) NOT NULL, grade INT NOT NULL, score INT';
const COLS = ['id', 'name', 'city', 'grade', 'score'];
const studentsSql = (rows: Student[]) => table('students', DDL, COLS, rows);
const SCHEMA = md('students', [['id', 'INT (primary key)'], ['name', 'VARCHAR(40), unique'], ['city', 'VARCHAR(30)'], ['grade', 'INT (9–12)'], ['score', 'INT (0–100)']]);
const SCHEMA_NULL = md('students', [['id', 'INT (primary key)'], ['name', 'VARCHAR(40), unique'], ['city', 'VARCHAR(30)'], ['grade', 'INT (9–12)'], ['score', 'INT (0–100), NULL if the student has not taken the exam']]);
const STARTER = '-- students(id, name, city, grade, score)\nSELECT\n';

function students(seed: number, n: number, opts: { cities?: number; nulls?: number; lo?: number; hi?: number } = {}): Student[] {
  const r = rng(seed);
  // From the end of the list so every dataset includes Pune.
  const cities = CITIES.slice(-(opts.cities ?? 6));
  return Array.from({ length: n }, (_, i) => [i + 1, nameOf(i), pick(r, cities), int(r, 9, 12), opts.nulls && r() < opts.nulls ? null : int(r, opts.lo ?? 0, opts.hi ?? 100)]);
}
const hidden = (seeds: number[], make: (seed: number, i: number) => Student[]) => seeds.map((s, i) => ds(studentsSql(make(s, i))));
const SMALL: Student[] = [
  [1, 'Asha', 'Pune', 10, 88],
  [2, 'Ravi', 'Delhi', 11, 72],
  [3, 'Meera', 'Pune', 10, 95],
  [4, 'Kiran', 'Agra', 9, 61],
  [5, 'Dev', 'Pune', 12, 88],
];
const SMALL2: Student[] = [
  [1, 'Zoya', 'Delhi', 9, 40],
  [2, 'Omkar', 'Delhi', 9, 99],
  [3, 'Lata', 'Mumbai', 12, 77],
];

const fromPune = sqlQuestion({
  title: 'Students From Pune',
  statement: 'Return the `name` and `score` of every student from **Pune**, highest score first; students with the same score are ordered by `id`.',
  difficulty: 'easy',
  tags: ['sql', 'where', 'order-by'],
  mode: 'query',
  schemaDisplay: SCHEMA,
  samples: [ds(studentsSql(SMALL), 'Meera (95), then Asha and Dev (both 88, Asha has the lower id).'), ds(studentsSql(SMALL2), 'Nobody is from Pune: no rows.')],
  hidden: hidden([1101, 1102, 1103, 1104, 1105, 1106, 1107, 1108], (s, i) => students(s, [5, 12, 30, 1, 60, 8, 200, 25][i]!, { cities: [3, 10, 4, 10, 6, 2, 10, 10][i] })),
  solution: "SELECT name, score\nFROM students\nWHERE city = 'Pune'\nORDER BY score DESC, id;\n",
  starter: STARTER,
});

const top3 = sqlQuestion({
  title: 'Top Three Scores',
  statement: 'Return the `name` and `score` of the three highest-scoring students (fewer if there are fewer students). Break ties by `name` (A→Z).',
  difficulty: 'easy',
  tags: ['sql', 'order-by', 'limit'],
  mode: 'query',
  schemaDisplay: SCHEMA,
  samples: [ds(studentsSql(SMALL), 'Meera 95, then the tie at 88 is broken by name: Asha before Dev.'), ds(studentsSql(SMALL2.slice(0, 2)), 'Only two students exist, so only two rows.')],
  hidden: hidden([1111, 1112, 1113, 1114, 1115, 1116, 1117, 1118], (s, i) => students(s, [1, 3, 10, 40, 4, 100, 7, 250][i]!, { lo: [0, 50, 90, 0, 70, 0, 99, 0][i], hi: [100, 60, 92, 100, 70, 100, 100, 100][i] })),
  solution: 'SELECT name, score\nFROM students\nORDER BY score DESC, name\nLIMIT 3;\n',
  starter: STARTER,
});

const perGrade = sqlQuestion({
  title: 'Students per Grade',
  statement: 'For each grade that has students, return `grade` and the number of students in it as `students`, ordered by grade.',
  difficulty: 'easy',
  tags: ['sql', 'group-by', 'count'],
  mode: 'query',
  schemaDisplay: SCHEMA,
  samples: [ds(studentsSql(SMALL), 'Grade 9: Kiran; grade 10: Asha and Meera; grade 11: Ravi; grade 12: Dev.'), ds(studentsSql(SMALL2), 'Two students in grade 9 and one in grade 12; grades 10 and 11 have nobody and are not listed.')],
  hidden: hidden([1121, 1122, 1123, 1124, 1125, 1126, 1127, 1128], (s, i) => students(s, [1, 6, 20, 50, 2, 120, 9, 300][i]!)),
  solution: 'SELECT grade, COUNT(*) AS students\nFROM students\nGROUP BY grade\nORDER BY grade;\n',
  starter: STARTER,
});

const missingScores = sqlQuestion({
  title: 'Students Without a Score',
  statement: 'Some students have not taken the exam yet, so their `score` is NULL. Return the `name` of each such student, ordered by name.',
  difficulty: 'easy',
  tags: ['sql', 'null'],
  mode: 'query',
  schemaDisplay: SCHEMA_NULL,
  samples: [
    ds(studentsSql([[1, 'Asha', 'Pune', 10, null], [2, 'Ravi', 'Delhi', 11, 72], [3, 'Dev', 'Agra', 9, null]]), 'Asha and Dev have no score. `score = NULL` would match nothing — use `IS NULL`.'),
    ds(studentsSql(SMALL), 'Every student has a score: no rows.'),
  ],
  hidden: hidden([1131, 1132, 1133, 1134, 1135, 1136, 1137, 1138], (s, i) => students(s, [3, 10, 25, 60, 1, 150, 12, 40][i]!, { nulls: [1, 0.5, 0.2, 0.3, 0.9, 0.1, 0.4, 0.25][i] })),
  solution: 'SELECT name\nFROM students\nWHERE score IS NULL\nORDER BY name;\n',
  starter: STARTER,
});

const cityAverages = sqlQuestion({
  title: 'Average Score per City',
  statement:
    'For each city with **at least two** students, return `city` and the average score rounded to 2 decimals as `avg_score`. Order by `avg_score` (highest first), then `city`.',
  difficulty: 'moderate',
  tags: ['sql', 'group-by', 'having', 'aggregates'],
  mode: 'query',
  schemaDisplay: SCHEMA,
  samples: [ds(studentsSql(SMALL), 'Pune has three students: (88 + 95 + 88) / 3 = 90.33. Delhi and Agra have only one student each.'), ds(studentsSql(SMALL2), 'Delhi: (40 + 99) / 2 = 69.50. Mumbai has one student.')],
  hidden: hidden([1141, 1142, 1143, 1144, 1145, 1146, 1147, 1148], (s, i) => students(s, [6, 15, 40, 3, 90, 200, 30, 12][i]!, { cities: [3, 6, 10, 3, 8, 10, 2, 6][i] })),
  solution: 'SELECT city, ROUND(AVG(score), 2) AS avg_score\nFROM students\nGROUP BY city\nHAVING COUNT(*) >= 2\nORDER BY avg_score DESC, city;\n',
  starter: STARTER,
});

const bands = sqlQuestion({
  title: 'Score Bands',
  statement:
    'Classify each student into a band — **A** for 90–100, **B** for 75–89, **C** for 50–74, **D** below 50 — and return `band` and the number of students in it as `students`, ordered by band. Bands without students are not listed.',
  difficulty: 'moderate',
  tags: ['sql', 'case', 'group-by'],
  mode: 'query',
  schemaDisplay: SCHEMA,
  samples: [ds(studentsSql(SMALL), 'Meera is in A; Asha and Dev (88) in B; Ravi (72) and Kiran (61) in C.'), ds(studentsSql(SMALL2), 'Omkar A, Lata B, Zoya D. No one is in C.')],
  hidden: hidden([1151, 1152, 1153, 1154, 1155, 1156, 1157, 1158], (s, i) => students(s, [1, 8, 30, 60, 5, 150, 20, 45][i]!, { lo: [0, 40, 0, 0, 90, 0, 0, 74][i], hi: [100, 60, 100, 100, 100, 100, 49, 75][i] })),
  solution: "SELECT CASE\n         WHEN score >= 90 THEN 'A'\n         WHEN score >= 75 THEN 'B'\n         WHEN score >= 50 THEN 'C'\n         ELSE 'D'\n       END AS band,\n       COUNT(*) AS students\nFROM students\nGROUP BY band\nORDER BY band;\n",
  starter: STARTER,
});

const curve = sqlQuestion({
  title: 'Curve the Grade-10 Scores',
  statement:
    'Write an **UPDATE**: every student in grade 10 gets 5 bonus points, but no score may exceed 100. Other grades are unchanged.\n\nYour statement runs against the table; the checker then compares `SELECT id, score FROM students ORDER BY id`.',
  difficulty: 'moderate',
  tags: ['sql', 'update', 'dml'],
  mode: 'dml',
  schemaDisplay: SCHEMA,
  samples: [ds(studentsSql(SMALL), 'Asha 88 → 93 and Meera 95 → 100 (capped); the others are not in grade 10.'), ds(studentsSql(SMALL2), 'Nobody is in grade 10: nothing changes.')],
  hidden: hidden([1161, 1162, 1163, 1164, 1165, 1166, 1167, 1168], (s, i) => students(s, [4, 12, 30, 60, 8, 100, 20, 1][i]!, { lo: [0, 90, 0, 95, 0, 0, 96, 50][i], hi: [100, 100, 100, 100, 50, 100, 100, 50][i] })),
  stateQuery: { sql: 'SELECT id, score FROM students ORDER BY id' },
  solution: 'UPDATE students\nSET score = LEAST(score + 5, 100)\nWHERE grade = 10;\n',
  starter: '-- students(id, name, city, grade, score)\nUPDATE students\n',
});

const secondHighest = sqlQuestion({
  title: 'Second Highest Score',
  statement:
    'Return one row with one column, `second_highest`: the second-highest **distinct** score. If there is no second distinct score (for example, everybody has the same score), return NULL.',
  difficulty: 'moderate',
  tags: ['sql', 'subqueries', 'distinct'],
  mode: 'query',
  schemaDisplay: SCHEMA,
  samples: [ds(studentsSql(SMALL), 'Distinct scores: 95, 88, 72, 61. The second highest is 88.'), ds(studentsSql([[1, 'Asha', 'Pune', 10, 70], [2, 'Ravi', 'Delhi', 11, 70]]), 'Only one distinct score, so the single row holds NULL.')],
  hidden: hidden([1171, 1172, 1173, 1174, 1175, 1176, 1177, 1178], (s, i) => students(s, [1, 2, 10, 50, 6, 200, 30, 4][i]!, { lo: [0, 60, 0, 0, 77, 0, 0, 90][i], hi: [100, 61, 100, 100, 77, 100, 100, 91][i] })),
  solution: 'SELECT (\n  SELECT DISTINCT score FROM students\n  ORDER BY score DESC\n  LIMIT 1 OFFSET 1\n) AS second_highest;\n',
  starter: STARTER,
});

const aboveCityAverage = sqlQuestion({
  title: 'Above Their City\'s Average',
  statement:
    'Return `name`, `city` and `score` of every student who scored **strictly above the average score of students from the same city**. Order by `city`, then `score` (highest first), then `id`.',
  difficulty: 'hard',
  tags: ['sql', 'subqueries', 'correlated'],
  mode: 'query',
  schemaDisplay: SCHEMA,
  samples: [ds(studentsSql(SMALL), 'Pune averages 90.33, so only Meera (95) qualifies; Delhi and Agra have one student each, who equals the average.'), ds(studentsSql(SMALL2), 'Delhi averages 69.5: Omkar (99) qualifies.')],
  hidden: hidden([1181, 1182, 1183, 1184, 1185, 1186, 1187, 1188], (s, i) => students(s, [3, 10, 40, 80, 6, 200, 25, 15][i]!, { cities: [1, 3, 6, 10, 2, 10, 4, 5][i] })),
  solution: 'SELECT s.name, s.city, s.score\nFROM students s\nWHERE s.score > (SELECT AVG(t.score) FROM students t WHERE t.city = s.city)\nORDER BY s.city, s.score DESC, s.id;\n',
  starter: STARTER,
});

type User = [number, string, string];
const usersSql = (rows: User[]) => table('users', 'id INT PRIMARY KEY, email VARCHAR(60) NOT NULL, name VARCHAR(40) NOT NULL', ['id', 'email', 'name'], rows);
function users(seed: number, n: number, emails: number): User[] {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => [i + 1, `user${int(r, 1, emails)}@example.com`, nameOf(i)]);
}
const dedupe = sqlQuestion({
  title: 'Delete Duplicate Accounts',
  statement:
    'Several `users` rows may share an `email`. Write a **DELETE** that removes duplicates, keeping only the row with the **smallest id** for each email.\n\nThe checker then compares `SELECT id, email FROM users ORDER BY id`. Note that MySQL does not let a subquery read the table being deleted from directly — wrap it in a derived table or use a self-join.',
  difficulty: 'hard',
  tags: ['sql', 'delete', 'dml', 'subqueries'],
  mode: 'dml',
  schemaDisplay: md('users', [['id', 'INT (primary key)'], ['email', 'VARCHAR(60), lowercase'], ['name', 'VARCHAR(40)']]),
  samples: [
    ds(usersSql([[1, 'a@x.in', 'Asha'], [2, 'b@x.in', 'Ravi'], [3, 'a@x.in', 'Asha R'], [4, 'a@x.in', 'A. R.']]), 'Rows 3 and 4 repeat a@x.in and are deleted; rows 1 and 2 stay.'),
    ds(usersSql([[1, 'c@x.in', 'Kiran'], [2, 'd@x.in', 'Dev']]), 'No duplicates: nothing is deleted.'),
  ],
  hidden: [1191, 1192, 1193, 1194, 1195, 1196, 1197, 1198].map((s, i) => ds(usersSql(users(s, [2, 6, 20, 60, 10, 150, 40, 100][i]!, [1, 3, 20, 15, 10, 40, 40, 100][i]!)))),
  stateQuery: { sql: 'SELECT id, email FROM users ORDER BY id' },
  solution: 'DELETE FROM users\nWHERE id NOT IN (\n  SELECT keep_id FROM (SELECT MIN(id) AS keep_id FROM users GROUP BY email) AS k\n);\n',
  starter: '-- users(id, email, name)\nDELETE FROM users\n',
});

export const SQL_BASICS: DbQuestionInput[] = [fromPune, top3, perGrade, missingScores, cityAverages, bands, curve, secondHighest, aboveCityAverage, dedupe];
