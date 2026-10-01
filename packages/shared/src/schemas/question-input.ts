import { z } from 'zod';
import { DbQuestionInput, dbPublishProblems } from './db.js';
import { CodingQuestionInput, publishProblems } from './questions.js';
import { WebQuestionInput, webPublishProblems } from './web.js';

export const QUESTION_TYPES = ['coding', 'web', 'db'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/**
 * Any question. `type` defaults to "coding" for backwards compatibility, and the payload is
 * validated against exactly one schema, so web/DB fields can never be silently dropped by a
 * looser match.
 */
export const QuestionInput = z.preprocess(
  (v) => (v && typeof v === 'object' && !Array.isArray(v) && !('type' in v) ? { ...(v as object), type: 'coding' } : v),
  z.discriminatedUnion('type', [CodingQuestionInput.extend({ type: z.literal('coding') }), WebQuestionInput, DbQuestionInput]),
);
export type QuestionInput = z.infer<typeof QuestionInput>;

export function questionProblems(q: QuestionInput): string[] {
  if (q.type === 'web') return webPublishProblems(q);
  if (q.type === 'db') return dbPublishProblems(q);
  return publishProblems(q);
}
