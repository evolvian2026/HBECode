import { describe, expect, it } from 'vitest';
import { parseMongoQuery, MongoQueryError } from './mongo-guard.js';
import { compareResults, documentsToResult } from './result-compare.js';
import { DbQuestionInput, dbPublishProblems } from './schemas/db.js';
import { WebQuestionInput, webPublishProblems } from './schemas/web.js';

const cfg = { orderSensitive: false, columnNames: 'ignore_case' as const, floatEpsilon: 1e-6, ignoreMongoId: true };

describe('compareResults', () => {
  const exp = { columns: ['name', 'total'], rows: [['a', 10], ['b', 2.5]] };
  it('ignores row order unless order-sensitive', () => {
    expect(compareResults({ columns: ['NAME', 'total'], rows: [['b', '2.5'], ['a', '10']] }, exp, cfg).ok).toBe(true);
    expect(compareResults({ columns: ['name', 'total'], rows: [['b', 2.5], ['a', 10]] }, exp, { ...cfg, orderSensitive: true }).ok).toBe(false);
  });
  it('checks column names per rule, row counts and float tolerance', () => {
    expect(compareResults({ columns: ['x', 'total'], rows: exp.rows }, exp, cfg).reason).toMatch(/columns differ/);
    expect(compareResults({ columns: ['x', 'y'], rows: exp.rows }, exp, { ...cfg, columnNames: 'ignore' }).ok).toBe(true);
    expect(compareResults({ columns: exp.columns, rows: [['a', 10]] }, exp, cfg).reason).toBe('expected 2 row(s), got 1');
    expect(compareResults({ columns: exp.columns, rows: [['a', 10.0000000001], ['b', 2.5]] }, exp, cfg).ok).toBe(true);
    expect(compareResults({ columns: exp.columns, rows: [['a', 10.1], ['b', 2.5]] }, exp, cfg).ok).toBe(false);
  });
  it('treats NULLs as equal and MySQL 0/1 as booleans; never prints hidden values', () => {
    expect(compareResults({ columns: ['v'], rows: [[null], [1]] }, { columns: ['v'], rows: [[null], [true]] }, cfg).ok).toBe(true);
    const r = compareResults({ columns: ['v'], rows: [['SECRET-A']] }, { columns: ['v'], rows: [['SECRET-B']] }, cfg);
    expect(r.ok).toBe(false);
    expect(r.reason).not.toContain('SECRET');
  });
  it('turns Mongo documents into a table without _id', () => {
    expect(documentsToResult([{ _id: 1, b: 2, a: 1 }, { _id: 2, a: 3 }], true)).toEqual({ columns: ['a', 'b'], rows: [[1, 2], [3, null]] });
  });
});

describe('parseMongoQuery', () => {
  it('accepts pipelines and find queries', () => {
    expect(parseMongoQuery('{"collection":"orders","pipeline":[{"$match":{"status":"paid"}}]}').collection).toBe('orders');
    expect(parseMongoQuery('{"collection":"orders","find":{"filter":{"qty":{"$gt":2}},"limit":5}}').find?.limit).toBe(5);
  });
  it.each([
    ['{"collection":"o","pipeline":[{"$match":{"$where":"sleep(1000)"}}]}', /\$where/],
    ['{"collection":"o","pipeline":[{"$addFields":{"x":{"$function":{"body":"function(){}","args":[],"lang":"js"}}}}]}', /\$function/],
    ['{"collection":"o","pipeline":[{"$group":{"_id":1,"x":{"$accumulator":{}}}}]}', /\$accumulator/],
    ['{"collection":"o","pipeline":[{"$out":"stolen"}]}', /\$out/],
    ['{"collection":"o","pipeline":[{"$merge":{"into":"x"}}]}', /\$merge/],
    ['{"collection":"o","pipeline":[{"$currentOp":{}}]}', /\$currentOp/],
    ['{"collection":"o","find":{"filter":{"$where":"1"}}}', /\$where/],
    ['{"collection":"system.users","pipeline":[]}', /collection/],
    ['db.orders.find()', /Not valid JSON/],
    ['{"collection":"o","pipeline":[],"eval":"x"}', /Unknown field/],
  ])('rejects %s', (q, re) => {
    expect(() => parseMongoQuery(q)).toThrow(MongoQueryError);
    expect(() => parseMongoQuery(q)).toThrow(re);
  });
});

describe('web and db publish rules', () => {
  it('web: needs 2 samples, 8–15 hidden checks and the entry file', () => {
    const q = WebQuestionInput.parse({ type: 'web', framework: 'react', title: 'Counter', statement: 'x', difficulty: 'easy', starterFiles: [{ path: 'main.js', content: '' }], referenceFiles: [{ path: 'App.jsx', content: '' }] });
    const p = webPublishProblems(q);
    expect(p).toContain('exactly 2 sample checks are required');
    expect(p).toContain('starter files must include App.jsx');
  });
  it('db: DML needs a state query; every dialect needs a solution and setup', () => {
    const q = DbQuestionInput.parse({ type: 'db', title: 'Raise salaries', statement: 'x', difficulty: 'easy', dialects: ['postgres', 'mongodb'], mode: 'dml', schemaDisplay: 'employees', samples: [{ setup: { sql: 'create table t(x int)' } }] });
    const p = dbPublishProblems(q);
    expect(p).toContain('DML questions support PostgreSQL and MySQL only');
    expect(p).toContain('postgres: a state query is required for DML questions');
    expect(p).toContain('mongodb: dataset 1 has no setup');
    expect(p).toContain('postgres: reference solution is required');
  });
});
