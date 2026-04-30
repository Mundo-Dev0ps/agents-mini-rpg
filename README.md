<div align="center">

```
 █████╗  ██████╗ ███████╗███╗   ██╗████████╗    ███╗   ███╗██╗███╗   ██╗██╗    ██████╗ ██████╗  ██████╗
██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝    ████╗ ████║██║████╗  ██║██║    ██╔══██╗██╔══██╗██╔════╝
███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║       ██╔████╔██║██║██╔██╗ ██║██║    ██████╔╝██████╔╝██║  ███╗
██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║       ██║╚██╔╝██║██║██║╚██╗██║██║    ██╔══██╗██╔═══╝ ██║   ██║
██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║       ██║ ╚═╝ ██║██║██║ ╚████║██║    ██║  ██║██║     ╚██████╔╝
╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝       ╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝    ╚═╝  ╚═╝╚═╝      ╚═════╝
```

### 🤖 Terminal multi-agent RPG · powered by **Claude Code CLI** 🌲

[![npm version](https://img.shields.io/npm/v/agent-mini-rpg?style=flat-square&color=CB3837&logo=npm)](https://www.npmjs.com/package/agent-mini-rpg)
[![CI](https://img.shields.io/github/actions/workflow/status/Mundo-Dev0ps/agent-mini-rpg/ci.yml?style=flat-square&logo=githubactions&label=CI)](https://github.com/Mundo-Dev0ps/agent-mini-rpg/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)
[![Node ≥ 20](https://img.shields.io/badge/node-%E2%89%A520-brightgreen?style=flat-square&logo=nodedotjs)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS-lightgrey?style=flat-square&logo=linux)](https://github.com/Mundo-Dev0ps/agent-mini-rpg#compatibility)
[![Tests](https://img.shields.io/badge/tests-43%20passing-success?style=flat-square&logo=node.js)](https://github.com/Mundo-Dev0ps/agent-mini-rpg/actions)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-ff69b4?style=flat-square)](https://github.com/Mundo-Dev0ps/agent-mini-rpg/pulls)

<br/>

> **Every running Claude Code process becomes an in-game agent.**  
> The world freezes when no Claude is active — it literally mirrors your AI workflow in real time.

</div>

---

## 📸 Screenshots

<div align="center">

| 🌲 Adventure Mode | 🤖 Agents vs Bugs Mode |
|:-:|:-:|
| ![Adventure mode](docs/screenshots/adventure.png) | ![Bugs mode](docs/screenshots/bugs.png) |
| Forest fantasy · quests · beasts | Cyber-tech · bugs scale per round |

> **Add your own screenshots**: `scrot` / `screencapture` → save to `docs/screenshots/`.  
> Record a demo: `asciinema rec docs/screenshots/demo.cast`

</div>

---

## ✨ What is this?

**agent-mini-rpg** is a terminal tile-grid RPG where **your Claude Code CLI sessions are the characters**.

```
  Claude editing a file  →  Agent moves toward resource
  Claude running Bash    →  Agent attacks a bug
  Claude spawning Task   →  Sub-agent appears on map
  Claude goes idle       →  World freezes, map dims
```

It connects via an **MCP file-bridge** so the MCP server's stdio never collides with the TUI renderer.  
Real tool calls (`Edit`, `Bash`, `Read`, `Grep`, `Task`, …) appear live in the event log.

---

## 🎮 Highlights

| Feature | Description |
|---------|-------------|
| 🌲🤖 **Two modes** | *Adventure* (forest fantasy) and *Agents vs Bugs* (cyber-tech) — each with their own avatars, enemies, and HUD |
| 🧝🧙🧚🛡️ **4 playable avatars per mode** | Distinct stats, abilities, and aura colors |
| ⚔️ **Round-based progression** | Enemies scale per round, concurrent cap enforced, boss waves, final-boss revive |
| 📡 **MCP integration** | Real Claude tool calls appear in the event log live |
| 🧠 **Process-aware engine** | Tick freezes when all linked Claude processes go idle |
| 🔔 **Input-needed alerts** | Audio cue + blinking HUD badge when Claude needs you |
| 🖥️ **Anti-flicker renderer** | Per-cell cursor positioning — no full-screen clear |
| 👁️ **Observer mode** | Spectate agents without controlling a player |
| 🌙 **Night mode** | Toggleable — dims map, changes border style |
| ⬆️ **Agent leveling** | Agents gain XP, level up, heal to full, improve ATK/DEF |
| 🌊 **Wave balance** | Concurrent enemy cap + deescalate cooldown after deaths |

---

## 🌲 Adventure Mode

### Playable Avatars

<div align="center">

| Icon | Name | Base Class | Ability | Style |
|:----:|------|-----------|---------|-------|
| 🧝 | **Elf** | Scout | **Elven Leap** — phase through terrain | Agile · high dodge · high speed |
| 🧙 | **Wizard** | Mage | **Arcane Spell** — remote heal on nearby ally | Glass cannon · high ATK |
| 🧚 | **Fairy** | Flyer | **Magic Flight** — fly over all obstacles | Tank · high HP/DEF · healer |
| 🛡️ | **Knight** | Wolf | **Heroic Charge** — pack hunt scan radius | Balanced · high HP |

</div>

### Enemies & Bosses

<div align="center">

| Tier | Icons | Example Names | Notes |
|:----:|:-----:|---------------|-------|
| **L1** (basic) | 🐺 🐯 | WildWolf, ForestSnake, VineCreeper | Spawns early rounds |
| **L2** (elite) | 🐻 🦍 | ShadowBeast, MossOgre, ThornHound | More HP + ATK |
| **L3** (apex) | 🦏 🐃 | RootGolem, FrostLynx | Final-round regulars |
| **Boss** | 🐗 🦏 🦣 🦖 🐲 | Named boss per wave | High HP, scaled ATK cap |

</div>

---

## 🤖 Agents vs Bugs Mode

### Playable Avatars

<div align="center">

| Icon | Name | Base Class | Ability | Style |
|:----:|------|-----------|---------|-------|
| 🤖 | **Robot** | Tech | **Turbo-Deploy** — x2 speed when BUSY | Balanced · steady |
| 🛰️ | **Drone** | Flyer | **Bypass** — fly over walls and debris | Scout · high evasion |
| 🛡️ | **Firewall** | Scout | **Block Packet** — terrain bypass + block | Defensive · resilient |
| 🔧 | **Debugger** | Mage | **Remote Patch** — heals nearby allies | Support · high ATK |

</div>

### Enemies & Bosses

<div align="center">

| Tier | Icons | Example Names | Notes |
|:----:|:-----:|---------------|-------|
| **L1** (bug) | 🐛 🐜 | TimeoutError, 404_NotFound, TypeError | Common spawns |
| **L2** (error) | 👾 🦂 | RaceCondition, MemoryLeak, StackOverflow | Faster, more ATK |
| **L3** (critical) | 🕷️ 🦠 | SegFault, InfiniteLoop, DeadlockBug | Hard hitters |
| **Boss** | 🦟 🐉 🤖 👹 💀 | Named crash per wave | Max-tier ATK cap |

</div>

---

## 🗺️ Map Tiles & Items

<div align="center">

| Tile | Adventure | Bugs mode | Effect |
|:----:|-----------|-----------|--------|
| ❤️  | Heart | Heart | +10 HP |
| 🥩 / 🔋 | Meat | Battery | Refills hunger |
| ⚔️  | Weapon +1 | Crate +1 | ATK +1 |
| 🗡️  | Weapon +2 | Hammer +2 | ATK +2 |
| ➕ | Cure | Cure | Heals |
| 🕳️  | Trap | Trap | -3 HP on trigger |
| 💰 | Gold | Gold | Score |
| 🌲 | Tree | 🧱 Wall | Obstacle (bypassable) |
| 🪨 | Rock | 🧱 Wall | Obstacle |
| 🧱 | Brick wall | Brick wall | Built via BUILD action |
| 🍃 / 💾 | Herb | Disk | Class resource |
| 🐟 / 💿 | Fish | CD | Class resource |

</div>

---

## 🚀 Quick Start

### Install from npm *(once published)*

```bash
npm install -g agent-mini-rpg
agent-rpg
```

### Run from source

```bash
git clone https://github.com/Mundo-Dev0ps/agent-mini-rpg.git
cd agent-mini-rpg
npm install
npm run dev          # ts-node, no build step
# or
npm run start        # compile then run
```

On first launch:

1. **Terminal-size gate** — blocks until window is large enough (resize live to dismiss)
2. **Mode menu** — Adventure vs Agents vs Bugs
3. **Avatar menu** — 4 choices per mode with stats and ability description

Navigate with `↑/↓`, confirm `↵`, back `b`, quit `q`.

---

## ⌨️ Controls

| Key | Action |
|:---:|--------|
| `↑ ↓ ← →` | Move player |
| `space` / `↵` | Interact — talk, pick up, attack adjacent |
| `a` | Use class ability |
| `v` | Send handshake to MCP bridge |
| `r` | Respawn player |
| `n` | Restart current round |
| `p` | Pause / resume |
| `i` / `tab` | Cycle inspect panel (agent details) |
| `m` / `esc` | Open settings overlay |
| `1`–`5` | Filter event log (all / agents / tools / combat / alerts) |
| `+` / `-` | Adjust tick speed |
| `s` | Toggle audio |
| `q` | Quit |

---

## 📡 MCP Integration

Connect Claude Code so **every tool call appears as a live event**:

```bash
npm run install-mcp      # auto-merges entry into Claude Code config (+ backup)
# — or —
npm run show-config      # prints JSON block to copy manually
```

Wire the hook scripts in `~/.claude/settings.json`:

```jsonc
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Edit|Write|Bash|Read|Grep|Glob|MultiEdit|Task",
      "hooks": [{ "type": "command", "command": "bash /path/to/bin/notify-tool.sh" }]
    }],
    "SubagentStop": [{
      "hooks": [{ "type": "command", "command": "bash /path/to/bin/notify-subagent.sh" }]
    }]
  }
}
```

Both channels write to `~/.agent_rpg_sync.json` and `~/.agent_rpg_queue.ndjson`. The game polls every 2 seconds.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│  index.ts        CLI entry, class menu, main loop        │
├─────────────────────────────────────────────────────────┤
│  cli/            ANSI renderer, dashboard, input layer   │
│    renderer.ts   Per-cell CHA positioning, no cls()      │
├─────────────────────────────────────────────────────────┤
│  core/           Domain logic — zero terminal I/O        │
│    game.ts       Orchestrator: world, agents, rounds     │
│    world.ts      Procedural map gen, water, connectivity │
│    agent.ts      FSM, XP/level system, pathfinding       │
│    player.ts     Input-driven movement, class abilities  │
│    brain.ts      MockBrain + ClaudeBrain (LLM decisions) │
│    process_monitor.ts  Claude PID discovery + CPU state  │
│    bridge.ts     .agent_sync.json file-bridge poller     │
├─────────────────────────────────────────────────────────┤
│  mcp-server.ts   Standalone MCP server (separate proc)   │
│  bin/            Hook scripts + npm bin shim             │
└─────────────────────────────────────────────────────────┘
```

**Why a file-bridge?** The MCP SDK uses stdio transport — writing directly would corrupt the TUI output. The bridge decouples both: MCP server writes JSON, game polls the file.

**Anti-flicker pattern**: the renderer writes each row with `\x1b[row;1H` + per-cell `\x1b[colG` cursor-absolute positioning. No `\x1b[2J` full clear in the main loop.

**Engine freeze**: game tick halts when all linked Claude processes are `IDLE`/`STANDBY`/`DISCONNECTED` *and* the MCP bridge file is older than 5 seconds.

---

## 🖥️ Compatibility

### Supported AI agents

| Agent | Status | Notes |
|-------|:------:|-------|
| **Claude Code CLI** | ✅ | Process detection, MCP bridge, PreToolUse / SubagentStop hooks wired |
| Claude Desktop | ⚠️ | MCP entry installs; process detection untested on Desktop |
| Gemini CLI | ❌ | No detection or hook adapter yet |
| Codex CLI | ❌ | No detection or hook adapter yet |
| Others | ❌ | Generic adapter not implemented |

### Operating systems

| OS | Status | Notes |
|----|:------:|-------|
| **Linux** | ✅ | Tested. Audio: `pw-play` → `paplay` → `aplay` |
| **macOS** | ✅ | Audio via `afplay`. `ps -axo` fallback works out of the box |
| Windows native | ❌ | POSIX-only: process detection + audio |
| Windows WSL2 | ⚠️ | Expected to work as Linux — unverified |

### Terminal emulators

| Terminal | Status |
|----------|:------:|
| iTerm2, Alacritty, Kitty, GNOME Terminal, Konsole, WezTerm | ✅ Best emoji metrics |
| **VS Code integrated terminal** (Linux / macOS) | ✅ |
| VS Code on Windows (WSL2 profile only) | ⚠️ |
| JetBrains IDE terminal | ✅ |
| Tmux / screen | ✅ |
| Native Windows Terminal (PowerShell / cmd) | ❌ |

### Requirements

- **Node.js ≥ 20** (LTS recommended)
- Terminal ≥ **100×28** columns×rows (recommended **140×36**)
- Optional: `pw-play` / `paplay` / `aplay` (Linux) or `afplay` (macOS) for audio alerts
- Optional: [Claude Code CLI](https://docs.claude.com) for MCP integration (game runs standalone without it)

---

## 🔧 CLI Flags

```bash
agent-rpg --mode=adventure          # skip mode menu
agent-rpg --mode=bugs               # skip mode menu
agent-rpg --class=wizard            # skip avatar menu (adventure)
agent-rpg --class=robot             # skip avatar menu (bugs)
agent-rpg --observer                # spectator mode
agent-rpg --pacifist                # no bug spawning
agent-rpg --help=classes            # list avatar classes
```

Environment variables: `PLAYER_CLASS`, `GAME_MODE`, `OBSERVER_MODE=1`.

---

## ⚙️ Settings Overlay

Press `m` in-game:

- 🔔 Toggle audio
- 🎨 Toggle color-blind palette
- 👁️ Toggle observer mode
- 🌙 Toggle night mode
- 🔁 Restart game
- 🌐 Change mode (Adventure / Bugs)
- 🧝 Change avatar

Navigate with `↑/↓`, confirm `↵`.

---

## 🧪 Testing

```bash
npm test           # 43 unit tests via node:test
npm run typecheck  # tsc --noEmit
```

Tests cover: abilities, world tile rules, player movement (including bypass), wave-cap config, deescalate cooldown, agent leveling, observation radius, and resource detection.

---

## 🔒 Privacy

Writes **only** to `$HOME`:

- `~/.agent_rpg_sync.json` — last bridge update (overwritten each tick)
- `~/.agent_rpg_queue.ndjson` — pending events (truncated when drained)

Nothing sent over the network. The `ClaudeBrain` LLM class (`core/brain.ts`) is not wired into the default game loop.

---

## 🐛 Troubleshooting

| Issue | Fix |
|-------|-----|
| **No sound on Linux** | Check sink: `wpctl status` / `pactl list sinks short`. Game tries `pw-play → paplay → aplay` |
| **Broken terminal layout** | Use a terminal with 24-bit color + emoji width support |
| **No Claude PIDs detected** | `npm install ps-list pidusage` for richer process info; fallback uses `ps -axo` |
| **Running on Windows** | Use WSL2 (untested, expected to work). Native PowerShell will fail |
| **MCP events missing** | `chmod +x bin/notify-*.sh`; verify `ls -la ~/.agent_rpg_queue.ndjson` is being written |

---

## 📦 Release Process

CI runs on every push / PR — typecheck + build on Ubuntu + macOS, Node 20 and 22.

Publishing is **tag-driven**:

```bash
npm version patch       # bumps version in package.json
git push --follow-tags  # triggers publish workflow on tag v*.*.*
```

The workflow: verifies tag matches `package.json` → typecheck + build → publish to npm with `--provenance` → creates GitHub Release with auto-generated notes.

### One-time setup

1. Update `repository`, `homepage`, and `bugs` URLs in `package.json` (currently `Mundo-Dev0ps` placeholder)
2. Add `NPM_TOKEN` to GitHub repo secrets (Settings → Secrets and variables → Actions)
3. Optional: link repo to npm package for OIDC provenance

---

## 🤝 Contributing

PRs welcome. Before submitting:

```bash
npm test && npm run typecheck
```

Keep emoji tile widths consistent — most layout issues come from mixing 1-cell and 2-cell emoji in the same grid row.

---

## 📄 License

[MIT](./LICENSE) — © agent-mini-rpg contributors

---

<div align="center">

**Built with ❤️ for the Claude Code community**

⭐ Star this repo if it made your AI workflow more fun!

[![Star History Chart](https://api.star-history.com/svg?repos=Mundo-Dev0ps/agent-mini-rpg&type=Date)](https://star-history.com/#Mundo-Dev0ps/agent-mini-rpg&Date)

</div>
