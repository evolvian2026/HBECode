/**
 * The hand-written example questions only (used by the API for upload templates). Importing the
 * full bank (`@hbe/db/seed`) generates all 170 questions and their stress tests at load time:
 * ~9 CPU-seconds, which kept the API from starting for minutes on a 0.1-CPU instance.
 */
export { sumArray } from './questions/sum-array.js';
export { customerTotals, monthlyRevenue, topEarner } from './questions/db-questions.js';
export { profileCard, shoppingCart, todoList } from './questions/web-questions.js';
