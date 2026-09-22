// Hotkey watcher for the mdclip listener.
//
// libuiohook does not deliver modifier events on recent macOS, so its ctrlKey/shiftKey
// flags are always false and a combination can never match. A CGEventTap gets the flags
// from the event itself, and returning NULL swallows the key so it does not also reach
// the frontmost app.
//
// usage: mdclip-hotkey <virtual-keycode> <flag-mask> [--no-swallow]
// prints "hit" per match, exits 3 if the tap cannot be created (no Accessibility).
#include <ApplicationServices/ApplicationServices.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static CGKeyCode wanted_key;
static CGEventFlags wanted_flags;
static int swallow = 1;

static const CGEventFlags MODS =
    kCGEventFlagMaskControl | kCGEventFlagMaskShift | kCGEventFlagMaskCommand | kCGEventFlagMaskAlternate;

static CGEventRef callback(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void *info) {
  (void)proxy;
  (void)info;
  if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
    if (info) CGEventTapEnable((CFMachPortRef)info, true);
    return event;
  }
  if (type != kCGEventKeyDown) return event;

  CGKeyCode key = (CGKeyCode)CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode);
  if (key != wanted_key) return event;
  if ((CGEventGetFlags(event) & MODS) != wanted_flags) return event;

  puts("hit");
  fflush(stdout);
  return swallow ? NULL : event;
}

int main(int argc, char **argv) {
  if (argc < 3) {
    fprintf(stderr, "usage: mdclip-hotkey <keycode> <flagmask> [--no-swallow]\n");
    return 2;
  }
  wanted_key = (CGKeyCode)strtoul(argv[1], NULL, 10);
  wanted_flags = (CGEventFlags)strtoull(argv[2], NULL, 10) & MODS;
  for (int i = 3; i < argc; i++) {
    if (strcmp(argv[i], "--no-swallow") == 0) swallow = 0;
  }

  __block CFMachPortRef tap = NULL;
  tap = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap, kCGEventTapOptionDefault,
                         CGEventMaskBit(kCGEventKeyDown), callback, NULL);
  if (!tap) {
    fprintf(stderr, "mdclip-hotkey: could not create event tap (Accessibility not granted)\n");
    return 3;
  }
  CFRunLoopSourceRef source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0);
  CFRunLoopAddSource(CFRunLoopGetCurrent(), source, kCFRunLoopCommonModes);
  CGEventTapEnable(tap, true);
  puts("ready");
  fflush(stdout);
  CFRunLoopRun();
  return 0;
}
