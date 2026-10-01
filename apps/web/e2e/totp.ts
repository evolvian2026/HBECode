import { createHmac } from 'node:crypto';

const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32(s: string): Buffer {
  let bits = 0, v = 0;
  const out: number[] = [];
  for (const c of s.replace(/=+$/, '')) {
    v = (v << 5) | A.indexOf(c);
    bits += 5;
    if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
/** RFC 6238 code for tests (same algorithm as the API). */
export function totp(secret: string, offsetSteps = 0): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offsetSteps));
  const h = createHmac('sha1', b32(secret)).update(msg).digest();
  const o = h[h.length - 1]! & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
