/**
 * Sandbox escape-attempt corpus (docs/threat-model.md §5). Every attempt must end in a contained
 * verdict, with no effect on the host container and no effect on other runs.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { job, Sandbox } from './harness.js';

let sb: Sandbox;
beforeAll(async () => {
  sb = await Sandbox.start();
});
afterAll(async () => {
  await sb?.stop();
});
// Invariant after every attempt: nothing from the jail (uid 65534) is still running.
afterEach(async (ctx) => {
  const ps = await sb.sh("ps -eo user:20,pid,stat,args | awk '$1==\"nobody\" || $1==\"65534\"'");
  expect(ps.trim(), `leftover jailed processes after "${ctx.task.name}"`).toBe('');
});

const C = (body: string, includes = '') =>
  `#define _GNU_SOURCE\n#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n#include <unistd.h>\n#include <errno.h>\n#include <sys/types.h>\n${includes}\nint main(void){${body}}`;
const runC = (code: string, over = {}) => sb.run(job('c', code, '', [{ input: '' }], over));
const runPy = (code: string, over = {}) => sb.run(job('python', code, '', [{ input: '' }], over));
const out = async (p: ReturnType<typeof runC>) => {
  const r = await p;
  return { verdict: r.tests[0]!.verdict, stdout: r.tests[0]!.stdout.trim(), stderr: r.tests[0]!.stderr, r };
};

describe('resource exhaustion', () => {
  it('fork bomb is capped by pids.max and dies with the run', async () => {
    const r = await out(runC(C('int n=0; for(;;){ pid_t p=fork(); if(p<0){printf("capped after %d\\n",n); fflush(stdout); for(;;);} if(p==0){for(;;);} n++; }')));
    expect(r.verdict).toBe('TLE');
    expect(r.stdout).toMatch(/capped after \d+/);
    expect(Number(/(\d+)/.exec(r.stdout)![1])).toBeLessThan(20);
  });
  it('memory blow-up is MLE', async () => {
    const r = await out(runC(C('size_t total=0; for(;;){ char*p=malloc(1<<20); if(!p) break; memset(p,1,1<<20); total++; } printf("%zu\\n", total); return 0;')));
    expect(r.verdict).toBe('MLE');
  });
  it('infinite output is OLE', async () => {
    const r = await out(runC(C('for(;;) puts("spam spam spam spam");'), { limits: { cpuMs: 2000, memMb: 64, outputBytes: 64 * 1024 } }));
    expect(r.verdict).toBe('OLE');
  });
  it('busy loop is TLE', async () => {
    expect((await out(runC(C('volatile long x=0; for(;;) x++;')))).verdict).toBe('TLE');
  });
  it('sleeping past the wall clock is TLE even with no CPU use', async () => {
    const r = await out(runC(C('sleep(30); return 0;')));
    expect(r.verdict).toBe('TLE');
    expect(r.r.tests[0]!.wallMs).toBeLessThan(6000);
  });
  it('threads cannot multiply CPU time past the limit', async () => {
    const r = await out(runPy('import threading\ndef spin():\n    while True: pass\nfor _ in range(8): threading.Thread(target=spin, daemon=True).start()\nwhile True: pass\n'));
    expect(r.verdict).toBe('TLE');
  });
  it('filling /tmp or writing a huge file fails', async () => {
    const r = await out(runC(C('FILE*f=fopen("/tmp/x","w"); if(!f){puts("no tmp");return 0;} char b[65536]; memset(b,1,sizeof b); long w=0; for(int i=0;i<4096;i++){ if(fwrite(b,1,sizeof b,f)!=sizeof b) break; w++; } printf("%ld\\n", w); return 0;')));
    expect(['AC', 'RE']).toContain(r.verdict);
    if (r.verdict === 'AC') expect(Number(r.stdout)).toBeLessThan(1024); // < 64 MiB written
  });
  it('a compile bomb (#include /dev/urandom) times out as a compile error', async () => {
    const r = await sb.run(job('c', '#include "/dev/urandom"\nint main(){}', '', [{ input: '' }]));
    expect(r.compile.ok).toBe(false);
    expect(r.tests).toHaveLength(0);
  });
});

describe('isolation', () => {
  it('has no network (TCP to a public IP, DNS, loopback)', async () => {
    const r = await out(
      runPy(
        'import socket\nres=[]\nfor host,port in [("1.1.1.1",80),("127.0.0.1",4000),("169.254.169.254",80)]:\n    try:\n        socket.create_connection((host,port),timeout=2); res.append("OPEN")\n    except OSError: res.append("blocked")\ntry:\n    socket.getaddrinfo("example.com",80); res.append("DNS")\nexcept OSError: res.append("nodns")\nprint(" ".join(res))\n',
      ),
    );
    expect(r.stdout).toBe('blocked blocked blocked nodns');
  });
  it('runs as uid 65534 with no capabilities', async () => {
    const r = await out(runPy('import os\nprint(os.getuid(), os.getgid())\nprint(open("/proc/self/status").read().split("CapEff:")[1].split()[0])\n'));
    expect(r.stdout.split('\n')).toEqual(['65534 65534', '0000000000000000']);
  });
  it('cannot see host processes or the agent environment', async () => {
    const r = await out(runPy('import os\npids=[p for p in os.listdir("/proc") if p.isdigit()]\nenv=open("/proc/1/environ","rb").read()\nprint(len(pids), b"CANARY" in env, "CANARY_SECRET" in os.environ)\n'));
    expect(r.stdout).toMatch(/^[12] False False$/);
  });
  it('cannot read host secrets or files outside the allowlisted mounts', async () => {
    const r = await out(
      runPy('import os\nfor p in ["/etc/shadow","/etc/passwd","/root","/var/lib/hbe-exec","/opt/hbe/agent","/run/secrets","/home"]:\n    print(p, os.path.exists(p))\n'),
    );
    for (const line of r.stdout.split('\n')) expect(line).toMatch(/ False$/);
  });
  it('cannot write to /box, /usr or /', async () => {
    const r = await out(
      runPy('res=[]\nfor p in ["/box/x","/usr/x","/x","/proc/sys/kernel/hostname"]:\n    try:\n        open(p,"w").write("x"); res.append("WROTE "+p)\n    except OSError: res.append("ro")\nprint(" ".join(res))\n'),
    );
    expect(r.stdout).toBe('ro ro ro ro');
  });
  it('namespace and kernel attack syscalls kill the process (seccomp)', async () => {
    for (const call of ['unshare(CLONE_NEWUSER)', 'syscall(SYS_ptrace, 0, 1, 0, 0)', 'syscall(SYS_bpf, 0, 0, 0)', 'syscall(SYS_keyctl, 0, 0, 0)', 'syscall(SYS_mount, "none", "/tmp", "tmpfs", 0, 0)']) {
      const r = await out(runC(C(`long rc=${call}; printf("survived %ld %d\\n", rc, errno); return 0;`, '#include <sched.h>\n#include <sys/syscall.h>')));
      expect([call, r.verdict, r.stderr]).toEqual([call, 'RE', expect.stringContaining('forbidden system call')]);
    }
  });
  it('io_uring is unavailable (ENOSYS)', async () => {
    const r = await out(runC(C('long rc=syscall(SYS_io_uring_setup, 1, 0); printf("%ld %d\\n", rc, errno); return 0;', '#include <sys/syscall.h>')));
    expect(r.stdout).toBe('-1 38');
  });
  it('background processes do not survive the run', async () => {
    await runC(C('if(fork()==0){ setsid(); for(;;) sleep(1); } puts("parent done"); return 0;'));
    const ps = await sb.sh("ps -eo user,comm | awk '$1==\"nobody\" || $1==\"65534\"' | wc -l");
    expect(Number(ps.trim())).toBe(0);
  });
  it('child processes inherit the jail (Java Runtime.exec / Node child_process)', async () => {
    const node = await sb.run(job('javascript', "console.log(require('child_process').execSync('id -u; cat /etc/hostname 2>&1 || true').toString().trim())", '', [{ input: '' }]));
    expect(node.tests[0]!.stdout).toMatch(/^65534/);
    const java = await sb.run(
      job('java', 'class Solution {}', 'public class Main { public static void main(String[] a) throws Exception { Process p = new ProcessBuilder("/bin/cat", "/etc/shadow").redirectErrorStream(true).start(); System.out.println(new String(p.getInputStream().readAllBytes()).trim()); } }', [{ input: '' }]),
    );
    expect(java.tests[0]!.stdout).toMatch(/No such file/);
  });
  it('one run cannot affect the next (fresh /tmp, read-only /box)', async () => {
    await runC(C('FILE*f=fopen("/tmp/leftover","w"); fputs("x",f); fclose(f); return 0;'));
    const r = await out(runC(C('printf("%d\\n", access("/tmp/leftover", F_OK)==0); return 0;')));
    expect(r.stdout).toBe('0');
  });
  it('expected output never enters the jail', async () => {
    const r = await sb.run(
      job('python', 'import os\nfound=[]\nfor root,dirs,files in os.walk("/"):\n    if root.startswith(("/proc", "/sys", "/usr", "/opt", "/lib", "/bin", "/etc", "/dev")): continue\n    for f in files:\n        try:\n            if b"EXPECTED-SECRET-91" in open(os.path.join(root,f),"rb").read(): found.append(f)\n        except Exception: pass\nprint(found)\n', '', [{ input: 'x', expected: 'EXPECTED-SECRET-91', hidden: true }], { kind: 'submit', limits: { cpuMs: 5000, memMb: 256, outputBytes: 1 << 20 } }),
    );
    expect(r.tests[0]!.verdict).toBe('WA');
  });
});
