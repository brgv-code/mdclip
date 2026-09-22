#!/bin/sh
# Builds the universal launcher checked into native/. Needs Xcode Command Line Tools.
set -e
cd "$(dirname "$0")"
clang -O2 -Wall -arch arm64 -arch x86_64 -o mdclip-launcher launcher.c
codesign --force --sign - mdclip-launcher
ls -la mdclip-launcher && file mdclip-launcher
