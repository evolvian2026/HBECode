import type { RuntimeId } from '@hbe/shared';

/**
 * How each language is laid out, compiled and run inside the jail.
 *
 * Layout strategies:
 * - `concat`: one file = student code + driver (C, C++, Python, JS, Rust). The driver may contain
 *   the marker line `@@STUDENT_CODE@@` (in a comment) to place the student code; otherwise the
 *   driver is appended after the student code.
 * - `separate`: student code and driver are separate files compiled together (Java, Go, C#).
 */
export interface RuntimeSpec {
  id: RuntimeId;
  layout: 'concat' | 'separate';
  /** File holding the merged program (concat) or the driver (separate). */
  mainFile: string;
  /** File holding the student's code when layout is `separate`. */
  studentFile?: string;
  /** Name shown to students in error messages. */
  displayFile: string;
  compile?: (limits: { memMb: number }) => string[];
  run: (limits: { memMb: number }) => string[];
  env: Record<string, string>;
  /** Extra environment for the run step that depends on the limits. */
  runEnv?: (limits: { memMb: number }) => Record<string, string>;
  /** Extra read-only mounts (toolchain locations). */
  mounts: string[];
  /** Extra cgroup memory above the question's limit, for VM/runtime overhead (MB). */
  memOverheadMb: number;
  pids: number;
  /** Command that prints the toolchain version (first line is checked against the pin). */
  versionCmd: string[];
  versionPattern: RegExp;
  /** Patterns in stderr that mean the program ran out of memory. */
  oomPatterns: RegExp[];
}

const BASE_PATH = '/usr/local/bin:/usr/bin:/bin';
const JAVA_HOME = '/usr/lib/jvm/java-21-openjdk';
const DOTNET_ROOT = '/opt/dotnet';
const GO_ROOT = '/opt/go';
const RUST_HOME = '/opt/rust';
const NODE_HOME = '/opt/node';

export const RUNTIME_SPECS: Record<RuntimeId, RuntimeSpec> = {
  c: {
    id: 'c',
    layout: 'concat',
    mainFile: 'main.c',
    displayFile: 'solution.c',
    compile: () => ['/usr/bin/gcc', '-std=c17', '-O2', '-pipe', '-fdiagnostics-color=never', '-o', 'main', 'main.c', '-lm'],
    run: () => ['./main'],
    env: { PATH: BASE_PATH },
    mounts: [],
    memOverheadMb: 8,
    pids: 16,
    versionCmd: ['/usr/bin/gcc', '--version'],
    versionPattern: /\b13\.3\.\d/,
    oomPatterns: [],
  },
  cpp: {
    id: 'cpp',
    layout: 'concat',
    mainFile: 'main.cpp',
    displayFile: 'solution.cpp',
    compile: () => ['/usr/bin/g++', '-std=c++17', '-O2', '-pipe', '-fdiagnostics-color=never', '-o', 'main', 'main.cpp'],
    run: () => ['./main'],
    env: { PATH: BASE_PATH },
    mounts: [],
    memOverheadMb: 8,
    pids: 16,
    versionCmd: ['/usr/bin/g++', '--version'],
    versionPattern: /\b13\.3\.\d/,
    oomPatterns: [/std::bad_alloc/],
  },
  java: {
    id: 'java',
    layout: 'separate',
    mainFile: 'Main.java',
    studentFile: 'Solution.java',
    displayFile: 'Solution.java',
    compile: () => [`${JAVA_HOME}/bin/javac`, '-J-Xshare:auto', '-J-XX:+UseSerialGC', '-J-Xmx512m', '-encoding', 'UTF-8', '-nowarn', '-d', '.', 'Main.java', 'Solution.java'],
    run: ({ memMb }) => [`${JAVA_HOME}/bin/java`, '-Xshare:auto', '-XX:+UseSerialGC', `-Xmx${memMb}m`, '-Xss64m', '-XX:TieredStopAtLevel=1', '-cp', '.', 'Main'],
    env: { PATH: `${JAVA_HOME}/bin:${BASE_PATH}`, JAVA_HOME },
    mounts: ['/usr/lib/jvm', '/etc/java-21-openjdk'],
    memOverheadMb: 192,
    pids: 64,
    versionCmd: [`${JAVA_HOME}/bin/java`, '-version'],
    versionPattern: /version "21\./,
    oomPatterns: [/java\.lang\.OutOfMemoryError/],
  },
  python: {
    id: 'python',
    layout: 'concat',
    mainFile: 'main.py',
    displayFile: 'solution.py',
    compile: () => ['/usr/bin/python3', '-c', 'import py_compile,sys; py_compile.compile("main.py", cfile="main.pyc", doraise=True)'],
    run: () => ['/usr/bin/python3', '-B', 'main.pyc'],
    env: { PATH: BASE_PATH, PYTHONDONTWRITEBYTECODE: '1', PYTHONIOENCODING: 'utf-8', PYTHONHASHSEED: '0' },
    mounts: [],
    memOverheadMb: 16,
    pids: 16,
    versionCmd: ['/usr/bin/python3', '--version'],
    versionPattern: /Python 3\.12\./,
    oomPatterns: [/MemoryError/],
  },
  javascript: {
    id: 'javascript',
    layout: 'concat',
    mainFile: 'main.js',
    displayFile: 'solution.js',
    compile: () => [`${NODE_HOME}/bin/node`, '--check', 'main.js'],
    run: ({ memMb }) => [`${NODE_HOME}/bin/node`, `--max-old-space-size=${memMb}`, '--stack-size=65500', 'main.js'],
    env: { PATH: `${NODE_HOME}/bin:${BASE_PATH}`, NODE_OPTIONS: '' },
    mounts: [NODE_HOME],
    memOverheadMb: 64,
    pids: 32,
    versionCmd: [`${NODE_HOME}/bin/node`, '--version'],
    versionPattern: /^v22\./,
    oomPatterns: [/JavaScript heap out of memory/, /Maximum call stack size exceeded/],
  },
  go: {
    id: 'go',
    layout: 'separate',
    mainFile: 'main.go',
    studentFile: 'solution.go',
    displayFile: 'solution.go',
    // The std-library build cache is pre-built into the image and copied to tmpfs per compile;
    // a cold cache would cost several seconds.
    compile: () => ['/bin/sh', '-c', `cp -r /opt/gocache-seed /tmp/gocache && exec ${GO_ROOT}/bin/go build -trimpath -o main main.go solution.go`],
    run: () => ['./main'],
    env: {
      PATH: `${GO_ROOT}/bin:${BASE_PATH}`,
      GOROOT: GO_ROOT,
      GOCACHE: '/tmp/gocache',
      GOPATH: '/tmp/gopath',
      GOFLAGS: '-mod=mod',
      GO111MODULE: 'off',
      CGO_ENABLED: '0',
      GOTOOLCHAIN: 'local',
      GOTELEMETRY: 'off',
      GOMAXPROCS: '2',
    },
    mounts: [GO_ROOT, '/opt/gocache-seed'],
    memOverheadMb: 32,
    pids: 64,
    versionCmd: [`${GO_ROOT}/bin/go`, 'version'],
    versionPattern: /go1\.24\./,
    oomPatterns: [/runtime: out of memory/],
  },
  rust: {
    id: 'rust',
    layout: 'concat',
    mainFile: 'main.rs',
    displayFile: 'solution.rs',
    compile: () => [`${RUST_HOME}/bin/rustc`, '--edition', '2021', '-O', '-C', 'debuginfo=0', '--color', 'never', '-o', 'main', 'main.rs'],
    run: () => ['./main'],
    env: { PATH: `${RUST_HOME}/bin:${BASE_PATH}`, RUSTUP_HOME: '/opt/rustup' },
    mounts: [RUST_HOME, '/opt/rustup'],
    memOverheadMb: 8,
    pids: 32,
    versionCmd: [`${RUST_HOME}/bin/rustc`, '--version'],
    versionPattern: /rustc 1\.90\./,
    oomPatterns: [/memory allocation of \d+ bytes failed/],
  },
  csharp: {
    id: 'csharp',
    layout: 'separate',
    mainFile: 'Main.cs',
    studentFile: 'Solution.cs',
    displayFile: 'Solution.cs',
    // Calls the Roslyn compiler directly (no MSBuild): ~2 s faster than `dotnet build`.
    compile: () => ['/opt/hbe/csc.sh'],
    run: () => [`${DOTNET_ROOT}/dotnet`, 'main.dll'],
    runEnv: ({ memMb }) => ({ DOTNET_GCHeapHardLimit: (memMb * 1024 * 1024).toString(16) }),
    env: {
      PATH: `${DOTNET_ROOT}:${BASE_PATH}`,
      DOTNET_ROOT,
      DOTNET_CLI_TELEMETRY_OPTOUT: '1',
      DOTNET_NOLOGO: '1',
      DOTNET_SYSTEM_GLOBALIZATION_INVARIANT: '1',
      DOTNET_gcServer: '0',
      DOTNET_GCgen0size: '0x4000000',
      DOTNET_TieredPGO: '0',
      DOTNET_EnableDiagnostics: '0',
      // W^X double-mapping ftruncates a huge memfd, which trips RLIMIT_FSIZE inside the jail.
      DOTNET_EnableWriteXorExecute: '0',
      HOME: '/tmp',
    },
    mounts: [DOTNET_ROOT, '/opt/hbe/csc.sh'],
    memOverheadMb: 160,
    pids: 64,
    versionCmd: [`${DOTNET_ROOT}/dotnet`, '--list-runtimes'],
    versionPattern: /Microsoft\.NETCore\.App 8\.0\./,
    oomPatterns: [/OutOfMemoryException/],
  },
};
