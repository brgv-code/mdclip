// Tiny app-bundle launcher for the mdclip listener.
//
// macOS grants Accessibility to an app bundle and attributes the grant to that bundle's
// children, but it will not list a bare `node` started by launchd, and AppleScript's
// `do shell script` disclaims responsibility for what it runs. So this binary is the
// bundle's main executable: it reads Contents/Resources/argv, spawns node as a child,
// forwards signals, and exits with the child's status.
#include <mach-o/dyld.h>
#include <signal.h>
#include <spawn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>

extern char **environ;
static pid_t child = 0;

static void forward(int sig) {
  if (child > 0) kill(child, sig);
}

int main(void) {
  char exe[4096];
  uint32_t size = sizeof(exe);
  if (_NSGetExecutablePath(exe, &size) != 0) return 2;
  // .../mdclip.app/Contents/MacOS/mdclip -> .../mdclip.app/Contents/Resources/argv
  char *slash = strrchr(exe, '/');
  if (!slash) return 2;
  *slash = '\0';
  slash = strrchr(exe, '/');
  if (!slash) return 2;
  *slash = '\0';
  char argv_path[4200];
  snprintf(argv_path, sizeof(argv_path), "%s/Resources/argv", exe);

  FILE *f = fopen(argv_path, "r");
  if (!f) {
    perror("mdclip launcher: argv");
    return 2;
  }
  char *args[64];
  int n = 0;
  char line[4096];
  while (n < 63 && fgets(line, sizeof(line), f)) {
    line[strcspn(line, "\n")] = '\0';
    if (line[0]) args[n++] = strdup(line);
  }
  fclose(f);
  args[n] = NULL;
  if (n == 0) return 2;

  signal(SIGTERM, forward);
  signal(SIGINT, forward);
  signal(SIGHUP, forward);

  if (posix_spawn(&child, args[0], NULL, NULL, args, environ) != 0) {
    perror("mdclip launcher: spawn");
    return 2;
  }
  int status = 0;
  while (waitpid(child, &status, 0) < 0) {
  }
  if (WIFSIGNALED(status)) return 128 + WTERMSIG(status);
  return WEXITSTATUS(status);
}
