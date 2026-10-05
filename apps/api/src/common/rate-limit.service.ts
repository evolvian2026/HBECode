import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../infra/infra.module.js';
import { tooMany } from './errors.js';

/**
 * Fixed-window counters in Redis (shared by all API replicas). One script call per hit
 * (INCR, EXPIRE on the first hit, TTL) instead of a MULTI of three commands: it runs on every
 * heartbeat, draft and event, and the MULTI showed up in the Phase 8 CPU profile.
 */
const HIT = `local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return {c, redis.call('TTL', KEYS[1])}`;

type Scripted = Redis & { rlHit(key: string, windowSec: number): Promise<[number, number]> };

@Injectable()
export class RateLimitService {
  private readonly r: Scripted;

  constructor(@Inject(REDIS) redis: Redis) {
    if (!('rlHit' in redis)) redis.defineCommand('rlHit', { numberOfKeys: 1, lua: HIT });
    this.r = redis as Scripted;
  }

  async hit(key: string, limit: number, windowSec: number): Promise<{ allowed: boolean; retryAfter: number; count: number }> {
    const [count, ttl] = await this.r.rlHit(`rl:${key}`, windowSec);
    return { allowed: count <= limit, retryAfter: Math.max(1, ttl > 0 ? ttl : windowSec), count };
  }

  async enforce(key: string, limit: number, windowSec: number): Promise<void> {
    const r = await this.hit(key, limit, windowSec);
    if (!r.allowed) throw tooMany(r.retryAfter);
  }

  async reset(key: string): Promise<void> {
    await this.r.del(`rl:${key}`);
  }
}
