import { describe, expect, it } from 'vitest';
import { dbTls, pgConnection } from '../src/client.js';

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
  it('drops sslmode from the URL when TLS is configured, so pg cannot override it (migrations too)', () => {
    expect(pgConnection('postgres://u:p@h:5432/db?sslmode=require', undefined)).toEqual({ connectionString: 'postgres://u:p@h:5432/db', ssl: { rejectUnauthorized: false } });
    expect(pgConnection('postgres://u:p@h/db?a=1&sslmode=require&b=2', undefined).connectionString).toBe('postgres://u:p@h/db?a=1&b=2');
    expect(pgConnection('postgres://u:p@localhost/db', undefined)).toEqual({ connectionString: 'postgres://u:p@localhost/db', ssl: undefined });
  });
});
