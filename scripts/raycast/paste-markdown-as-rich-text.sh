#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Paste Markdown as Rich Text
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 📋
# @raycast.packageName mdclip
# @raycast.description Converts the markdown on your clipboard to rich text and pastes it.

# GUI launchers get a minimal PATH; add the usual places node and mdclip live.
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

mdclip rich --paste
