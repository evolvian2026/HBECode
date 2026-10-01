/*
 * hbe-run: PID 1 inside every jail.
 *
 *   hbe-run <cpu_ms> <wall_ms> -- <program> [args...]
 *
 * - forks the program with RLIMIT_CPU set (backstop) and fd 3 closed, so the student's code
 *   cannot write to the stats channel;
 * - enforces the wall-clock limit precisely with a timer (nsjail's own limit is coarser);
 * - after the program exits (or is killed), kills every other process in the PID namespace;
 * - writes one line to fd 3:  "<cpu_us> <maxrss_kb> <exit_code> <signal> <wall_timeout>\n"
 */
#define _GNU_SOURCE
#include <errno.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>
#include <sys/time.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

static volatile sig_atomic_t timed_out = 0;
static pid_t child = -1;

static void on_alarm(int sig) {
  (void)sig;
  timed_out = 1;
  if (child > 0) kill(child, SIGKILL);
  kill(-1, SIGKILL); /* everything else in this PID namespace (we are PID 1, so we survive) */
}

int main(int argc, char **argv) {
  if (argc < 5 || strcmp(argv[3], "--") != 0) {
    fprintf(stderr, "usage: hbe-run <cpu_ms> <wall_ms> -- <program> [args...]\n");
    return 120;
  }
  long cpu_ms = strtol(argv[1], NULL, 10);
  long wall_ms = strtol(argv[2], NULL, 10);
  if (cpu_ms <= 0 || wall_ms <= 0) return 121;

  child = fork();
  if (child < 0) return 122;
  if (child == 0) {
    close(3);
    struct rlimit rl;
    rl.rlim_cur = (rlim_t)(cpu_ms / 1000 + 1);
    rl.rlim_max = rl.rlim_cur + 1;
    setrlimit(RLIMIT_CPU, &rl);
    signal(SIGALRM, SIG_DFL);
    execv(argv[4], &argv[4]);
    fprintf(stderr, "exec failed: %s\n", strerror(errno));
    _exit(127);
  }

  struct sigaction sa;
  memset(&sa, 0, sizeof sa);
  sa.sa_handler = on_alarm;
  sigaction(SIGALRM, &sa, NULL);
  struct itimerval it;
  memset(&it, 0, sizeof it);
  it.it_value.tv_sec = wall_ms / 1000;
  it.it_value.tv_usec = (wall_ms % 1000) * 1000;
  setitimer(ITIMER_REAL, &it, NULL);

  int status = 0;
  struct rusage ru;
  memset(&ru, 0, sizeof ru);
  for (;;) {
    pid_t p = wait4(child, &status, 0, &ru);
    if (p == child) break;
    if (p < 0 && errno != EINTR) break;
  }
  memset(&it, 0, sizeof it);
  setitimer(ITIMER_REAL, &it, NULL);
  kill(-1, SIGKILL);
  while (waitpid(-1, NULL, WNOHANG) > 0) {
  }

  /* RUSAGE_CHILDREN also covers grandchildren that were reaped (e.g. compiler sub-processes). */
  struct rusage all;
  getrusage(RUSAGE_CHILDREN, &all);
  long long cpu_us = (long long)all.ru_utime.tv_sec * 1000000 + all.ru_utime.tv_usec +
                     (long long)all.ru_stime.tv_sec * 1000000 + all.ru_stime.tv_usec;
  long maxrss = all.ru_maxrss > ru.ru_maxrss ? all.ru_maxrss : ru.ru_maxrss;
  int code = WIFEXITED(status) ? WEXITSTATUS(status) : -1;
  int sig = WIFSIGNALED(status) ? WTERMSIG(status) : 0;
  dprintf(3, "%lld %ld %d %d %d\n", cpu_us, maxrss, code, sig, (int)timed_out);
  return 0;
}
