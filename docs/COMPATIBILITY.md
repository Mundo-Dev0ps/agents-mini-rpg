# Compatibility

← [Back to README](../README.md)

## Supported AI agents

| Agent | Status | Notes |
|-------|:------:|-------|
| **Claude Code CLI** | ✅ | Process detection, MCP bridge, PreToolUse / SubagentStop hooks wired |
| Claude Desktop | ⚠️ | MCP entry installs; process detection untested on Desktop |
| Gemini CLI | ❌ | No detection or hook adapter yet |
| Codex CLI | ❌ | No detection or hook adapter yet |
| Others | ❌ | Generic adapter not implemented |

Adding another agent requires: a name matcher in `ProcessMonitor`, hook scripts that write to `~/.agent_rpg_queue.ndjson` in the same JSON line format, and optionally a label entry.

---

## Operating systems

| OS | Status | Notes |
|----|:------:|-------|
| **Linux** | ✅ | Tested. Audio: `pw-play` → `paplay` → `aplay` |
| **macOS** | ✅ | Audio via `afplay`. `ps -axo` fallback works out of the box |
| Windows native | ❌ | POSIX-only: process detection + audio path |
| Windows WSL2 | ⚠️ | Expected to work as Linux — unverified |

---

## Terminal emulators

The game is a POSIX TUI — any terminal with 24-bit color, raw-mode key passthrough, and emoji support works.

| Terminal | Status | Notes |
|----------|:------:|-------|
| iTerm2, Alacritty, Kitty, GNOME Terminal, Konsole, WezTerm | ✅ | Best emoji metrics |
| **VS Code integrated terminal** (Linux / macOS) | ✅ | |
| VS Code on Windows (WSL2 profile only) | ⚠️ | PowerShell / cmd profiles will fail |
| JetBrains IDE terminal (Linux / macOS) | ✅ | Same caveats as VS Code |
| Tmux / screen | ✅ | Inherits outer terminal capabilities |
| Native Windows Terminal (PowerShell / cmd) | ❌ | POSIX assumptions break |

> **Emoji alignment note:** VS Code's webview renderer may show wider emoji differently from native terminals. Mixing 1-cell and 2-cell emoji in the same grid row can misalign the map. The renderer uses `\x1b[colG` per-cell absolute positioning to mitigate this, but visual results vary by emulator.

---

## Requirements

- **Node.js ≥ 20** (LTS recommended)
- Terminal ≥ **100×28** columns×rows (recommended **140×36**)
- Optional: `pw-play` / `paplay` / `aplay` (Linux) or `afplay` (macOS) for audio alerts
- Optional: `ps-list` + `pidusage` npm packages for richer process info (`npm install ps-list pidusage`)
- Optional: [Claude Code CLI](https://docs.claude.com) — game runs standalone without it

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| **No sound on Linux** | Check sink: `wpctl status` / `pactl list sinks short`. Game tries `pw-play → paplay → aplay` |
| **Broken terminal layout** | Use a terminal with 24-bit color + emoji width support |
| **No Claude PIDs detected** | `npm install ps-list pidusage` for richer process info; fallback uses `ps -axo` |
| **Running on Windows** | Use WSL2 (untested, expected to work). Native PowerShell will fail |
| **MCP events missing** | `chmod +x bin/notify-*.sh`; verify `ls -la ~/.agent_rpg_queue.ndjson` is being written |
