-- Add to ~/.hammerspoon/init.lua:  require("mdclip")
-- Cmd+Shift+V  paste the clipboard markdown as rich text
-- Cmd+Shift+M  convert the clipboard rich text to markdown (then paste with Cmd+V as usual)

local MDCLIP = "/opt/homebrew/bin/mdclip"
local PATH = "/opt/homebrew/bin:/usr/local/bin:" .. os.getenv("HOME") .. "/.local/bin:" .. os.getenv("PATH")

local function mdclip(args)
  local cmd = "PATH=" .. PATH .. " " .. MDCLIP .. " " .. args .. " </dev/null 2>&1"
  local out, ok = hs.execute(cmd)
  if not ok then hs.alert.show("mdclip: " .. (out or "failed")) end
  return ok
end

hs.hotkey.bind({ "cmd", "shift" }, "v", function()
  if mdclip("rich") then hs.eventtap.keyStroke({ "cmd" }, "v") end
end)

hs.hotkey.bind({ "cmd", "shift" }, "m", function()
  if mdclip("md") then hs.alert.show("Copied as markdown") end
end)
