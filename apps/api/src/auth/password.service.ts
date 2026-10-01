import { Injectable, type OnModuleInit } from '@nestjs/common';
import argon2 from 'argon2';

/**
 * Argon2id with the OWASP minimum profile (19 MiB, t=2, p=1): ~50–100 ms on one core, so logins
 * stay fast on the pilot's 0.1-CPU API. Raise `memoryCost` when the API gets real CPUs;
 * `needsRehash` upgrades stored hashes on the next successful login.
 */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash = '';

  async onModuleInit() {
    this.dummyHash = await argon2.hash('not-a-real-password-dummy', OPTIONS);
  }

  hash(password: string): Promise<string> {
    return argon2.hash(password, OPTIONS);
  }

  async verify(hash: string | null, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash ?? this.dummyHash, password);
    } catch {
      return false;
    }
  }

  /** Same cost as a real check, so unknown emails take as long as wrong passwords. */
  async burn(password: string): Promise<void> {
    await this.verify(this.dummyHash, password);
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, OPTIONS);
  }
}
