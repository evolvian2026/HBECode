/**
 * Supported coding runtimes. Versions are pinned in apps/executor/Dockerfile; the executor
 * verifies at startup that the installed toolchains report these versions and refuses to
 * serve a runtime whose version drifted.
 */
export const RUNTIME_IDS = ['c', 'cpp', 'java', 'python', 'javascript', 'go', 'rust', 'csharp'] as const;
export type RuntimeId = (typeof RUNTIME_IDS)[number];

export interface RuntimeInfo {
  id: RuntimeId;
  label: string;
  /** Human-readable pinned version, shown in the IDE. */
  version: string;
  /** Monaco language id. */
  monaco: string;
  /** Multiplier applied to a question's base time limit. */
  timeMultiplier: number;
  compiled: boolean;
  /** File name the student's code is presented as (used in error messages). */
  studentFile: string;
}

export const RUNTIMES: Record<RuntimeId, RuntimeInfo> = {
  c: { id: 'c', label: 'C', version: 'GCC 13.3 · C17', monaco: 'c', timeMultiplier: 1, compiled: true, studentFile: 'solution.c' },
  cpp: { id: 'cpp', label: 'C++', version: 'G++ 13.3 · C++17', monaco: 'cpp', timeMultiplier: 1, compiled: true, studentFile: 'solution.cpp' },
  java: { id: 'java', label: 'Java', version: 'OpenJDK 21', monaco: 'java', timeMultiplier: 2, compiled: true, studentFile: 'Solution.java' },
  python: { id: 'python', label: 'Python', version: 'CPython 3.12', monaco: 'python', timeMultiplier: 3, compiled: false, studentFile: 'solution.py' },
  javascript: { id: 'javascript', label: 'JavaScript', version: 'Node.js 22', monaco: 'javascript', timeMultiplier: 2.5, compiled: false, studentFile: 'solution.js' },
  go: { id: 'go', label: 'Go', version: 'Go 1.24', monaco: 'go', timeMultiplier: 1.5, compiled: true, studentFile: 'solution.go' },
  rust: { id: 'rust', label: 'Rust', version: 'rustc 1.90', monaco: 'rust', timeMultiplier: 1.5, compiled: true, studentFile: 'solution.rs' },
  csharp: { id: 'csharp', label: 'C#', version: '.NET 8 · C# 12', monaco: 'csharp', timeMultiplier: 2, compiled: true, studentFile: 'Solution.cs' },
};

/** Languages every published coding question must provide templates for. */
export const REQUIRED_RUNTIMES: readonly RuntimeId[] = ['c', 'cpp', 'java', 'python', 'javascript'];

export function isRuntimeId(v: string): v is RuntimeId {
  return (RUNTIME_IDS as readonly string[]).includes(v);
}
