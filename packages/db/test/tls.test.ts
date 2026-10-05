import { describe, expect, it } from 'vitest';
import { dbTls } from '../src/client.js';

describe('database TLS', () => {
  it('verifies the server certificate when a CA is configured', () => {
    expect(dbTls('postgres://u:p@h/db?sslmode=require', '-----BEGIN CERTIFICATE-----\\nabc\\n-----END CERTIFICATE-----')).toEqual({
      ssl: { ca: '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----', rejectUnauthorized: true },
      verified: true,
    });
  });
  it('encrypts without verification for sslmode=require without a CA (the API warns)', () => {
    expect(dbTls('postgres://u:p@h/db?sslmode=require', undefined)).toEqual({ ssl: { rejectUnauthorized: false }, verified: false });
  });
  it('uses no TLS for a local URL', () => {
    expect(dbTls('postgres://u:p@localhost/db', undefined)).toEqual({ ssl: undefined, verified: false });
  });
});
