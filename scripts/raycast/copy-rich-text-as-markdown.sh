#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Copy Rich Text as Markdown
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 📝
# @raycast.packageName mdclip
# @raycast.description Converts the rich text on your clipboard to markdown. Paste it anywhere afterwards.

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

mdclip md
