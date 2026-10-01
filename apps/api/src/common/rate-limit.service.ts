import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../infra/infra.module.js';
import { tooMany } from './errors.js';

/** Fixed-window counters in Redis (shared by all API replicas). */
@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async hit(key: string, limit: number, windowSec: number): Promise<{ allowed: boolean; retryAfter: number; count: number }> {
    const k = `rl:${key}`;
    const res = await this.redis.multi().incr(k).expire(k, windowSec, 'NX').ttl(k).exec();
    const count = Number(res?.[0]?.[1] ?? 0);
    const ttl = Number(res?.[2]?.[1] ?? windowSec);
    return { allowed: count <= limit, retryAfter: Math.max(1, ttl), count };
  }

  async enforce(key: string, limit: number, windowSec: number): Promise<void> {
    const r = await this.hit(key, limit, windowSec);
    if (!r.allowed) throw tooMany(r.retryAfter);
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(`rl:${key}`);
  }
}
