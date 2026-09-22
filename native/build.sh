#!/bin/sh
# Builds the universal binaries checked into native/. Needs Xcode Command Line Tools.
set -e
cd "$(dirname "$0")"
FRAMEWORKS="-framework ApplicationServices -framework CoreFoundation"
clang -O2 -Wall -arch arm64 -arch x86_64 $FRAMEWORKS -o mdclip-launcher launcher.c
clang -O2 -Wall -arch arm64 -arch x86_64 $FRAMEWORKS -o mdclip-hotkey hotkey.c
codesign --force --sign - mdclip-launcher
codesign --force --sign - mdclip-hotkey
ls -la mdclip-launcher mdclip-hotkey
