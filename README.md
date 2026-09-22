# mdclip

Copy markdown as rich text, and rich text as markdown.

You copy an answer from an LLM, a file from the terminal, or a note from Obsidian, paste it into Linear, Motion, Notion or Google Docs, and get literal `##` and `**` instead of headings and bold. Or the other way round: you copy from a rich editor and want plain markdown.

The clipboard holds several flavors at once (`text/plain`, `text/html`, `text/rtf`). Markdown sources only write the plain one. `mdclip` writes all of them, so every app picks the flavor it understands.

```
mdclip service install   # macOS: from now on press Ctrl+Shift+C instead of Cmd+C. That's it.
```

Or as a one-off command:

```
pbpaste | mdclip       # what you just copied, now pastes as rich text everywhere
mdclip md              # copied rich text, now pastes as markdown
```

## Install

```bash
npm install -g mdclip        # or: pnpm add -g mdclip
npx mdclip --help            # no install
```

Homebrew (macOS, includes node):

```bash
brew install brgv-code/tap/mdclip
```

Requires Node 18+. Tested on macOS. Linux and Windows adapters are implemented but marked experimental, see [Platform support](#platform-support).

## Smart copy (macOS)

```bash
mdclip service install
```

This registers a small background listener that starts at login. Press **Ctrl+Shift+C** instead of Cmd+C. It copies the selection, looks at what landed on the clipboard, and fills in what is missing:

- plain text only (Claude, ChatGPT, a terminal, Obsidian) → treated as markdown, HTML and RTF are added
- rich text (Notion, Linear, a web page, Docs) → a markdown version becomes the plain-text flavor

Tables copied out of a terminal are repaired on the way: Claude Code, `bat` and friends draw them with box-drawing characters rather than markdown, and mdclip turns that art back into a GFM table before converting. Wrapped cells (a table wider than your terminal) cannot be recovered.

Then paste with a normal Cmd+V anywhere. Motion, Notion and Docs pick the HTML, the terminal picks the markdown.

Obsidian is a special case: it converts pasted HTML itself, so it uses that flavor rather than our markdown, and a table pasted in the middle of a line will not render because markdown needs a table to start its own block. Paste on an empty line, or turn off Auto convert HTML in Obsidian's Editor settings to make it take our markdown verbatim. No paste hotkey, no direction to think about. Pressing the hotkey with nothing selected converts whatever is already on the clipboard, so "Cmd+C, then Ctrl+Shift+C" works too.

First run: macOS asks for **Accessibility** access for `node` (the listener needs it to see the hotkey and to send Cmd+C). Allow it in System Settings > Privacy & Security > Accessibility; the listener waits and starts by itself. If the hotkey still does nothing, `mdclip service restart`.

```
mdclip service status | restart | uninstall | log
mdclip listen              # same thing in the foreground, to try it out
```

Change the hotkey or turn notifications off in `~/.config/mdclip/config.json`:

```json
{ "hotkey": "ctrl+shift+c", "notify": true, "sound": "Tink", "rtf": true }
```

`rtf` adds the flavor native apps want (Mail, Pages, Keynote) and costs about 290 ms of a 450 ms round trip, since `textutil` is a separate process. Set it to `false` if you only paste into web editors.

`sound` is any name from `/System/Library/Sounds`, or `false` for silence. It exists because notifications are posted through `osascript`, so macOS attributes them to Script Editor and drops them when that app's notifications are off; the sound always plays.

The hotkey is swallowed: the app in front never sees it, so it cannot collide with a shortcut there. Ctrl+Shift+C is the default because it is bound by almost nothing on macOS; Cmd+Shift+C would shadow "inspect element" in Chrome, which is where most LLM copying happens.

After an upgrade that changes the bundled launcher, macOS treats it as a new app and asks for Accessibility again. Remove the stale "mdclip" entry in Privacy & Security before allowing the new one.

Cost: one Node process, ~60 MB, idle until you press the key. Linux and Windows: the service is not available yet, the CLI is.

## Usage

```
mdclip [rich] [file]   markdown -> clipboard as text + html + rtf  (default)
mdclip md [file]       html on the clipboard -> markdown

Input comes from the file argument, from a pipe, or from the clipboard.

Options
  -c, --clipboard   read the clipboard even when stdin is a pipe
  -o, --stdout      print the converted result instead of writing the clipboard
  --paste           send the paste keystroke after writing (macOS: needs Accessibility access)
  --no-rtf          skip the RTF flavor (macOS)
```

Typical flows:

| You want to | Run |
| --- | --- |
| Paste an LLM answer into Linear / Motion / Docs | copy it, then `mdclip`, then paste |
| Paste a markdown file as rich text | `mdclip rich notes.md`, then paste |
| Turn a Notion / Linear / web selection into markdown | copy it, then `mdclip md`, then paste into Obsidian or a `.md` file |
| Save copied rich text straight to a file | `mdclip md -o > page.md` |
| Preview the HTML that will be written | `mdclip -o` |

Tip for Claude Code and other terminal LLMs: the terminal renders markdown, so selecting text in it loses the syntax. Have the answer written to a file and run `mdclip rich answer.md`.

## Hotkeys without the service

If you would rather not run a background process, bind the CLI to a key in a launcher you already have.

**Raycast**: copy `scripts/raycast/*.sh` into your Raycast script commands folder. You get "Paste Markdown as Rich Text" and "Copy Rich Text as Markdown"; assign hotkeys in Raycast.

**Hammerspoon**: copy `scripts/hammerspoon/mdclip.lua` to `~/.hammerspoon/` and add `require("mdclip")` to `init.lua`. Cmd+Shift+V pastes markdown as rich text, Cmd+Shift+M converts rich text to markdown.

**Anything else** (Keyboard Maestro, BetterTouchTool, Alfred, Karabiner): run `mdclip rich --paste` on a key.

Two things to know for launchers:

- `--paste` sends Cmd+V through System Events, which needs Accessibility access for the launcher (System Settings > Privacy & Security > Accessibility).
- GUI launchers do not see your shell `PATH`. If node comes from nvm/fnm/volta, add its bin directory to the `PATH` line in the script, or install via Homebrew, which bundles node.

## How it works

- Markdown to HTML: [marked](https://github.com/markedjs/marked) with GFM (tables, task lists, strikethrough, fenced code).
- HTML to markdown: [turndown](https://github.com/mixmark-io/turndown) with the GFM plugin, tuned for atx headings, fenced code and two-space list nesting.
- Hotkey, macOS: a `CGEventTap` in the bundle's own executable (`native/launcher.c`). It has to live there because the Accessibility grant follows the app bundle, not a child process, and because libuiohook does not deliver modifier events on recent macOS, which makes its `ctrlKey`/`shiftKey` flags useless.
- Clipboard, macOS: a JXA script drives `NSPasteboard` directly (`public.utf8-plain-text`, `public.html`, `public.rtf`), so no native module and no compile step. RTF is produced by the system `textutil`.
- Clipboard, Linux: CopyQ if present (the only common tool that writes several MIME types at once), else `wl-clipboard` or `xclip`, which can only serve one type, so HTML wins when both exist.
- Clipboard, Windows: PowerShell with a `DataObject` carrying UnicodeText and a CF_HTML envelope.

No pandoc, no daemon, nothing running in the background.

## Platform support

| Platform | Read | Write flavors | Paste keystroke | Status |
| --- | --- | --- | --- | --- |
| macOS | text, html, rtf | text + html + rtf | System Events | tested, covered by CI; smart-copy service |
| Linux | text, html | text + html (CopyQ) or one of them | xdotool / wtype | implemented, untested on a real display server |
| Windows | text, html | text + html | SendKeys | implemented, untested |

If you run Linux or Windows and can confirm or fix the adapter, a PR with what you saw is very welcome.

## Development

```bash
pnpm install
pnpm build        # tsc -> dist/
pnpm test         # vitest; the macOS clipboard test touches your real clipboard
pnpm lint         # biome
node dist/cli.js --help
```

Layout: `src/convert.ts` (pure conversion, tested), `src/clipboard/<platform>.ts` (one adapter per OS behind a tiny interface), `src/cli.ts` (argument handling and input detection), `src/service/` (smart-copy logic, launchd agent, bundle builder), `native/` (the C launcher that owns the event tap).

The two binaries in `native/` are committed so `npm install` needs no compiler. Rebuild them from source with `native/build.sh` (Xcode Command Line Tools); they are universal arm64 + x86_64 and ad-hoc signed.

Release: bump `version` in `package.json`, tag `vX.Y.Z`, push the tag. `publish.yml` publishes to npm with provenance via trusted publishing. Then update `url` and `sha256` in the Homebrew formula.

## License

MIT
