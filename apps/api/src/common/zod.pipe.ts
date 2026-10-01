import { type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { badRequest } from './errors.js';

/** Validates and strips unknown fields. Every body and query goes through one of these. */
export class ZodPipe<T extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}
  transform(value: unknown): z.infer<T> {
    const r = this.schema.safeParse(value ?? {});
    if (!r.success) {
      throw badRequest('Request validation failed', {
        errors: r.error.issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return r.data;
  }
}

export const zp = <T extends z.ZodType>(s: T) => new ZodPipe(s);
