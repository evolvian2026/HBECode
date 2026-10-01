import { z } from 'zod';
import { DIFFICULTIES } from './questions.js';

/**
 * Web questions (HTML / CSS / JavaScript / React).
 *
 * Grading runs the student's files in a jailed headless Chromium and evaluates declarative
 * checks from the grader side: DOM via Playwright locators (utility world), computed styles via
 * the DevTools protocol, interactions via real input events. Page scripts cannot fake results.
 */
export const WEB_FRAMEWORKS = ['html', 'react'] as const;
export type WebFramework = (typeof WEB_FRAMEWORKS)[number];

const MAX_FILE = 200 * 1024;
export const WebFile = z.object({
  path: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.(?:html|css|js|jsx)$/, 'letters, digits, -, _ and / only; .html .css .js .jsx'),
  content: z.string().max(MAX_FILE),
});
export type WebFile = z.infer<typeof WebFile>;
export const WebFiles = z
  .array(WebFile)
  .min(1)
  .max(20)
  .refine((fs) => new Set(fs.map((f) => f.path)).size === fs.length, 'duplicate file path')
  .refine((fs) => fs.reduce((n, f) => n + f.content.length, 0) <= 1024 * 1024, 'files exceed 1 MB in total');

const Selector = z.string().min(1).max(300);
const Viewport = z.object({ width: z.number().int().min(240).max(2560), height: z.number().int().min(240).max(2000) });
const Count = z.object({ eq: z.number().int().min(0).optional(), min: z.number().int().min(0).optional(), max: z.number().int().min(0).optional() });
const TextMatch = z
  .object({ equals: z.string().max(2000).optional(), contains: z.string().max(2000).optional(), matches: z.string().max(300).optional() })
  .refine((m) => [m.equals, m.contains, m.matches].filter((x) => x !== undefined).length === 1, 'exactly one of equals / contains / matches');

export const A11Y_RULES = ['img-alt', 'input-labels', 'button-names', 'document-lang', 'single-h1'] as const;

/** Assertions that can stand alone or follow an interaction. */
export const AssertSpec = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('exists'), selector: Selector, count: Count.optional() }),
  z.object({ kind: z.literal('text'), selector: Selector, match: TextMatch }),
  z.object({ kind: z.literal('attribute'), selector: Selector, name: z.string().min(1).max(100), match: TextMatch.optional() }),
  /** Computed style, e.g. { property: 'display', match: { equals: 'flex' } }. Colours come back as rgb()/rgba(). */
  z.object({ kind: z.literal('style'), selector: Selector, property: z.string().min(1).max(60).regex(/^-?[a-z][a-z-]*$/), match: TextMatch }),
  z.object({ kind: z.literal('role'), role: z.string().min(2).max(40), name: z.string().max(200).optional(), count: Count.optional() }),
  z.object({ kind: z.literal('a11y'), rule: z.enum(A11Y_RULES) }),
]);
export type AssertSpec = z.infer<typeof AssertSpec>;

export const InteractionStep = z.object({
  action: z.enum(['click', 'fill', 'press', 'hover', 'check', 'uncheck', 'select']),
  selector: Selector,
  value: z.string().max(500).optional(),
});

export const CheckSpec = z.union([
  AssertSpec,
  z.object({ kind: z.literal('interaction'), steps: z.array(InteractionStep).min(1).max(20), then: AssertSpec }),
]);
export type CheckSpec = z.infer<typeof CheckSpec>;

export const WebCheck = z.object({
  /** Shown to students for sample checks; hidden checks only show pass/fail. */
  title: z.string().trim().min(3).max(200),
  weight: z.number().int().min(1).max(100).default(1),
  /** Responsive checks set a viewport; default 1280×800. */
  viewport: Viewport.optional(),
  spec: CheckSpec,
});
export type WebCheck = z.infer<typeof WebCheck>;

export const WebQuestionInput = z.object({
  type: z.literal('web'),
  framework: z.enum(WEB_FRAMEWORKS),
  title: z.string().trim().min(3).max(200),
  statement: z.string().max(20000),
  difficulty: z.enum(DIFFICULTIES),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(10).default([]),
  isPractice: z.boolean().default(false),
  starterFiles: WebFiles,
  referenceFiles: WebFiles,
  samples: z.array(WebCheck).max(2).default([]),
  hidden: z.array(WebCheck).max(15).default([]),
  /** Wall-clock budget for one check (page load + steps + assertion). */
  checkTimeoutMs: z.number().int().min(1000).max(15000).default(5000),
  global: z.boolean().optional(),
});
export type WebQuestionInput = z.infer<typeof WebQuestionInput>;

export function entryFile(framework: WebFramework): string {
  return framework === 'html' ? 'index.html' : 'App.jsx';
}

export function webPublishProblems(q: WebQuestionInput): string[] {
  const p: string[] = [];
  if (q.statement.trim().length < 20) p.push('statement is too short');
  if (q.samples.length !== 2) p.push('exactly 2 sample checks are required');
  if (q.hidden.length < 8 || q.hidden.length > 15) p.push('8–15 hidden checks are required');
  const entry = entryFile(q.framework);
  if (!q.starterFiles.some((f) => f.path === entry)) p.push(`starter files must include ${entry}`);
  if (!q.referenceFiles.some((f) => f.path === entry)) p.push(`reference files must include ${entry}`);
  const keys = [...q.samples, ...q.hidden].map((c) => JSON.stringify([c.spec, c.viewport ?? null]));
  if (new Set(keys).size !== keys.length) p.push('two checks are identical');
  return p;
}
