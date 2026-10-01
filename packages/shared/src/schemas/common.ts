import { z } from 'zod';

export const Uuid = z.uuid();
export const Email = z.email().max(254).transform((s) => s.trim().toLowerCase());
export const Slug = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, digits and single hyphens');

export const PageQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type PageQuery = z.infer<typeof PageQuery>;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Password policy (NIST 800-63B): length over composition rules; breached-list check happens server-side. */
export const Password = z.string().min(10, 'at least 10 characters').max(128);
