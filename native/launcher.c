// The mdclip.app bundle executable: hotkey watcher plus supervisor for the Node listener.
//
// Two macOS facts shape this file. Privacy & Security only lists app bundles, and the
// Accessibility grant follows the bundle's main executable, not a grandchild process, so
// the CGEventTap has to live here rather than in Node or a helper. And libuiohook does not
// deliver modifier events on recent macOS, so the tap reads the flags off the event itself.
//
// Contents/Resources/argv holds one argument per line (node, cli.js, listen) and
// Contents/Resources/hotkey holds "<virtual-keycode> <flag-mask>". On a match this writes
// "hit" to the child's stdin and swallows the key so it does not also reach the frontmost app.
#include <ApplicationServices/ApplicationServices.h>
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
static int child_stdin = -1;
static CGKeyCode wanted_key = 0;
static CGEventFlags wanted_flags = 0;
static CFMachPortRef tap = NULL;

static const CGEventFlags MODS =
    kCGEventFlagMaskControl | kCGEventFlagMaskShift | kCGEventFlagMaskCommand | kCGEventFlagMaskAlternate;

static void forward(int sig) {
  if (child > 0) kill(child, sig);
  _exit(128 + sig);
}

static CGEventRef on_event(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void *info) {
  (void)proxy;
  (void)info;
  if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
    if (tap) CGEventTapEnable(tap, true);
    return event;
  }
  if (type != kCGEventKeyDown) return event;
  if ((CGKeyCode)CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode) != wanted_key) return event;
  if ((CGEventGetFlags(event) & MODS) != wanted_flags) return event;

  if (child_stdin >= 0) {
    ssize_t ignored = write(child_stdin, "hit\n", 4);
    (void)ignored;
  }
  return NULL;  // swallow, so the app in front never sees it
}

static void check_child(CFRunLoopTimerRef timer, void *info) {
  (void)timer;
  (void)info;
  int status = 0;
  if (child > 0 && waitpid(child, &status, WNOHANG) == child) {
    exit(WIFSIGNALED(status) ? 128 + WTERMSIG(status) : WEXITSTATUS(status));
  }
}

static int read_lines(const char *path, char **out, int max) {
  FILE *f = fopen(path, "r");
  if (!f) return -1;
  int n = 0;
  char line[4096];
  while (n < max && fgets(line, sizeof(line), f)) {
    line[strcspn(line, "\n")] = '\0';
    if (line[0]) out[n++] = strdup(line);
  }
  fclose(f);
  return n;
}

int main(void) {
  char exe[4096];
  uint32_t size = sizeof(exe);
  if (_NSGetExecutablePath(exe, &size) != 0) return 2;
  char *slash = strrchr(exe, '/');  // .../Contents/MacOS/mdclip -> .../Contents/MacOS
  if (!slash) return 2;
  *slash = '\0';
  slash = strrchr(exe, '/');  // -> .../Contents
  if (!slash) return 2;
  *slash = '\0';

  char path[4200];
  char *args[64];
  snprintf(path, sizeof(path), "%s/Resources/argv", exe);
  int n = read_lines(path, args, 63);
  if (n <= 0) {
    fprintf(stderr, "mdclip: cannot read %s\n", path);
    return 2;
  }
  args[n] = NULL;

  snprintf(path, sizeof(path), "%s/Resources/hotkey", exe);
  char *hk[2];
  if (read_lines(path, hk, 2) >= 1) {
    unsigned long key = 0, mask = 0;
    if (sscanf(hk[0], "%lu %lu", &key, &mask) == 2) {
      wanted_key = (CGKeyCode)key;
      wanted_flags = (CGEventFlags)mask & MODS;
    }
  }

  int pipefd[2];
  if (pipe(pipefd) != 0) {
    perror("mdclip: pipe");
    return 2;
  }
  posix_spawn_file_actions_t actions;
  posix_spawn_file_actions_init(&actions);
  posix_spawn_file_actions_adddup2(&actions, pipefd[0], STDIN_FILENO);
  posix_spawn_file_actions_addclose(&actions, pipefd[1]);

  setenv("MDCLIP_FROM_LAUNCHER", "1", 1);
  int rc = posix_spawn(&child, args[0], &actions, NULL, args, environ);
  posix_spawn_file_actions_destroy(&actions);
  close(pipefd[0]);
  if (rc != 0) {
    fprintf(stderr, "mdclip: cannot start %s: %s\n", args[0], strerror(rc));
    return 2;
  }
  child_stdin = pipefd[1];

  signal(SIGTERM, forward);
  signal(SIGINT, forward);
  signal(SIGHUP, forward);

  CFRunLoopTimerRef timer =
      CFRunLoopTimerCreate(kCFAllocatorDefault, 0, 1.0, 0, 0, check_child, NULL);
  CFRunLoopAddTimer(CFRunLoopGetCurrent(), timer, kCFRunLoopCommonModes);

  if (wanted_key != 0 || wanted_flags != 0) {
    tap = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap, kCGEventTapOptionDefault,
                           CGEventMaskBit(kCGEventKeyDown), on_event, NULL);
    if (!tap) {
      fprintf(stderr, "mdclip: no event tap (Accessibility not granted yet)\n");
    } else {
      CFRunLoopSourceRef source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0);
      CFRunLoopAddSource(CFRunLoopGetCurrent(), source, kCFRunLoopCommonModes);
      CGEventTapEnable(tap, true);
      fprintf(stderr, "mdclip: hotkey tap active\n");
    }
  }

  CFRunLoopRun();
  return 0;
}
