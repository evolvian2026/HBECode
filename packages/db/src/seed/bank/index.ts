import type { CodingQuestionInput, DbQuestionInput, WebQuestionInput } from '@hbe/shared';
import { ARRAYS } from './coding/arrays.js';
import { DP } from './coding/dp.js';
import { GREEDY } from './coding/greedy.js';
import { LINEAR } from './coding/linear.js';
import { MATH } from './coding/math.js';
import { SORTING } from './coding/sorting.js';
import { STRINGS } from './coding/strings.js';
import { TREES } from './coding/trees.js';
import { MONGO_AGG } from './data/mongo-agg.js';
import { MONGO_QUERIES } from './data/mongo-queries.js';
import { PANDAS } from './data/pandas.js';
import { SQL_ANALYTICS } from './data/sql-analytics.js';
import { SQL_BASICS } from './data/sql-basics.js';
import { SQL_JOINS } from './data/sql-joins.js';
import { DOM } from './web/dom.js';
import { HTML_CSS } from './web/html-css.js';
import { REACT } from './web/react.js';

export type BankQuestion = CodingQuestionInput | WebQuestionInput | DbQuestionInput;
export interface BankStack {
  id: string;
  label: string;
  kind: 'coding' | 'web' | 'db';
  questions: BankQuestion[];
}

/**
 * The seed question bank: 17 stacks of 10 questions (4 easy, 4 moderate, 2 hard each).
 * Coding questions run in all 8 languages; SQL questions in PostgreSQL and MySQL.
 * Every question must pass the same validator teachers' questions pass (CI runs it in the
 * real sandbox), so nothing here is published unless every reference solution passes.
 */
export const BANK: BankStack[] = [
  { id: 'arrays', label: 'Arrays & hashing', kind: 'coding', questions: ARRAYS },
  { id: 'strings', label: 'Strings', kind: 'coding', questions: STRINGS },
  { id: 'math', label: 'Math & number theory', kind: 'coding', questions: MATH },
  { id: 'sorting', label: 'Sorting & searching', kind: 'coding', questions: SORTING },
  { id: 'linear', label: 'Linked lists, stacks & queues', kind: 'coding', questions: LINEAR },
  { id: 'trees', label: 'Trees & graphs', kind: 'coding', questions: TREES },
  { id: 'dp', label: 'Dynamic programming', kind: 'coding', questions: DP },
  { id: 'greedy', label: 'Greedy & intervals', kind: 'coding', questions: GREEDY },
  { id: 'html-css', label: 'HTML & CSS layout', kind: 'web', questions: HTML_CSS },
  { id: 'dom', label: 'JavaScript DOM', kind: 'web', questions: DOM },
  { id: 'react', label: 'React', kind: 'web', questions: REACT },
  { id: 'sql-basics', label: 'SQL basics', kind: 'db', questions: SQL_BASICS },
  { id: 'sql-joins', label: 'SQL joins & subqueries', kind: 'db', questions: SQL_JOINS },
  { id: 'sql-analytics', label: 'SQL window functions & CTEs', kind: 'db', questions: SQL_ANALYTICS },
  { id: 'mongo-queries', label: 'MongoDB queries', kind: 'db', questions: MONGO_QUERIES },
  { id: 'mongo-agg', label: 'MongoDB aggregation', kind: 'db', questions: MONGO_AGG },
  { id: 'pandas', label: 'Pandas', kind: 'db', questions: PANDAS },
];

export const BANK_QUESTIONS: { stack: string; question: BankQuestion }[] = BANK.flatMap((s) => s.questions.map((question) => ({ stack: s.id, question })));
