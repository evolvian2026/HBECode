import { describe, expect, it } from 'vitest';
import { layoutSources } from '../src/runner.js';
import { RUNTIME_SPECS } from '../src/runtimes.js';
import { sanitizeOutput } from '../src/sanitize.js';

const driverC = `#include <stdio.h>
// @@STUDENT_CODE@@
int main(void) { int a, b; scanf("%d %d", &a, &b); printf("%d\\n", add_secret_harness(a, b)); return 0; }`;

describe('layoutSources', () => {
  it('places student code at the marker and records its line range', () => {
    const { files, map } = layoutSources(RUNTIME_SPECS.c, 'int add(int a, int b) {\n  return a + b;\n}', driverC);
    expect(files['main.c']!.split('\n')[1]).toBe('int add(int a, int b) {');
    expect(map.studentStart).toBe(2);
    expect(map.studentLines).toBe(3);
  });
  it('appends the driver when there is no marker', () => {
    const { files, map } = layoutSources(RUNTIME_SPECS.python, 'def f():\n    return 1', 'print(f())');
    expect(files['main.py']).toBe('def f():\n    return 1\nprint(f())');
    expect(map.studentStart).toBe(1);
  });
  it('uses separate files for Java', () => {
    const { files } = layoutSources(RUNTIME_SPECS.java, 'class Solution {}', 'public class Main {}');
    expect(Object.keys(files).sort()).toEqual(['Main.java', 'Solution.java']);
  });
});

describe('sanitizeOutput', () => {
  const { map } = layoutSources(RUNTIME_SPECS.c, 'int add(int a, int b) {\n  return a + c;\n}', driverC);

  it('remaps student lines to the student file', () => {
    const out = sanitizeOutput("main.c:3:14: error: 'c' undeclared (first use in this function)\n    3 |   return a + c;\n      |              ^", map);
    expect(out).toContain("solution.c:2:14: error: 'c' undeclared");
    expect(out).not.toContain('main.c');
  });

  it('drops diagnostics that point into the driver and never echoes driver code', () => {
    const raw = [
      "main.c:3:14: error: 'c' undeclared",
      '    3 |   return a + c;',
      "main.c:5:68: warning: implicit declaration of function 'add_secret_harness'",
      '    5 | int main(void) { int a, b; scanf("%d %d", &a, &b); printf("%d\\n", add_secret_harness(a, b)); return 0; }',
      '      |                                                                    ^~~~~~~~~~~~~~~~~~',
    ].join('\n');
    const out = sanitizeOutput(raw, map);
    expect(out).toContain('solution.c:2:14');
    expect(out).not.toContain('add_secret_harness');
    expect(out).toContain('hidden test harness');
  });

  it('replaces driver source lines that appear outside a driver block', () => {
    const out = sanitizeOutput('something went wrong near:\nint main(void) { int a, b; scanf("%d %d", &a, &b); printf("%d\\n", add_secret_harness(a, b)); return 0; }', map);
    expect(out).not.toContain('add_secret_harness');
  });

  it('handles Python tracebacks: keeps student frames, drops driver frames', () => {
    const py = layoutSources(RUNTIME_SPECS.python, 'def f(x):\n    return 1 // x', 'import sys\nsecret_value = int(sys.stdin.read())\nprint(f(secret_value))');
    const raw = [
      'Traceback (most recent call last):',
      '  File "/box/main.py", line 5, in <module>',
      '    print(f(secret_value))',
      '  File "/box/main.py", line 2, in f',
      '    return 1 // x',
      'ZeroDivisionError: integer division or modulo by zero',
    ].join('\n');
    const out = sanitizeOutput(raw, py.map);
    expect(out).toContain('File "solution.py", line 2, in f');
    expect(out).toContain('ZeroDivisionError');
    expect(out).not.toContain('secret_value');
  });

  it('handles javac (separate files)', () => {
    const j = layoutSources(RUNTIME_SPECS.java, 'class Solution { int f() { return x; } }', 'public class Main { static String SECRET_DRIVER = "1"; }');
    const raw = 'Solution.java:1: error: cannot find symbol\n  class Solution { int f() { return x; } }\nMain.java:1: error: something in driver\n  public class Main { static String SECRET_DRIVER = "1"; }\n2 errors';
    const out = sanitizeOutput(raw, j.map);
    expect(out).toContain('Solution.java:1: error: cannot find symbol');
    expect(out).not.toContain('SECRET_DRIVER');
  });

  it('handles rustc multi-line blocks', () => {
    const r = layoutSources(RUNTIME_SPECS.rust, 'fn add(a: i64, b: i64) -> i64 { a + c }', 'fn main() { let secret_rust_driver = add(1, 2); println!("{}", secret_rust_driver); }');
    const raw = [
      'error[E0425]: cannot find value `c` in this scope',
      ' --> main.rs:1:38',
      '  |',
      '1 | fn add(a: i64, b: i64) -> i64 { a + c }',
      '  |                                      ^ help: a local variable with a similar name exists: `a`',
      '',
      'error[E0308]: mismatched types',
      ' --> main.rs:2:30',
      '  |',
      '2 | fn main() { let secret_rust_driver = add(1, 2); println!("{}", secret_rust_driver); }',
    ].join('\n');
    const out = sanitizeOutput(raw, r.map);
    expect(out).toContain('--> solution.rs:1:38');
    expect(out).not.toContain('secret_rust_driver');
  });
});
