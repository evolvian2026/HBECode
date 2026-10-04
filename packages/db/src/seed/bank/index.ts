import type { CodingQuestionInput, DbQuestionInput, WebQuestionInput } from '@hbe/shared';
import { customerTotals, monthlyRevenue, topEarner } from '../questions/db-questions.js';
import { profileCard, shoppingCart, todoList } from '../questions/web-questions.js';
import { ARRAYS } from './coding/arrays.js';

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
  { id: 'html-css', label: 'HTML & CSS layout', kind: 'web', questions: [profileCard] },
  { id: 'dom', label: 'JavaScript DOM', kind: 'web', questions: [todoList] },
  { id: 'react', label: 'React', kind: 'web', questions: [shoppingCart] },
  { id: 'sql-joins', label: 'SQL joins & subqueries', kind: 'db', questions: [topEarner] },
  { id: 'mongo-agg', label: 'MongoDB aggregation', kind: 'db', questions: [customerTotals] },
  { id: 'pandas', label: 'Pandas', kind: 'db', questions: [monthlyRevenue] },
];

export const BANK_QUESTIONS: { stack: string; question: BankQuestion }[] = BANK.flatMap((s) => s.questions.map((question) => ({ stack: s.id, question })));
