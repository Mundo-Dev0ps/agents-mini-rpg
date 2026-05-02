# Architecture

← [Back to README](../README.md)

## Layer overview

```
┌─────────────────────────────────────────────────────────┐
│  index.ts          CLI entry, class menu, main loop      │
├─────────────────────────────────────────────────────────┤
│  cli/              ANSI renderer, dashboard, input       │
│    renderer.ts     Per-cell CHA positioning, no cls()    │
│    input.ts        Raw-mode key handler                  │
├─────────────────────────────────────────────────────────┤
│  core/             Domain logic — zero terminal I/O      │
│    game.ts         Orchestrator: world, agents, rounds   │
│    world.ts        Procedural map gen, connectivity      │
│    agent.ts        FSM, XP/level system, pathfinding     │
│    player.ts       Input-driven movement + abilities     │
│    brain.ts        MockBrain + ClaudeBrain decisions     │
│    avatars.ts      Class specs, abilities, diet rules    │
│    themes.ts       Adventure / Bugs tile + icon sets     │
│    process_monitor.ts  Claude PID discovery + CPU state  │
│    bridge.ts       .agent_sync.json file-bridge poller   │
│    entity.ts       Base entity types (Bug, NPC, Weapon…) │
│    pathfinding.ts  BFS with bypass option                │
│    direction.ts    Direction helpers + arrow chars       │
│    quest.ts        Quest board logic                     │
│    identity.ts     Hostname / username resolution        │
│    fsm.ts          Finite state machine                  │
│    mcp.ts          MCP server helpers                    │
├─────────────────────────────────────────────────────────┤
│  mcp-server.ts     Standalone MCP server (separate proc) │
│  show-config.ts    Print MCP config snippet              │
│  bin/              Hook scripts + npm bin shim           │
│  scripts/          setup-mcp.ts (config auto-installer)  │
└─────────────────────────────────────────────────────────┘
```

---

## Key design decisions

### File-bridge for MCP

The MCP SDK communicates over stdio. If the MCP server ran in-process it would corrupt the TUI output. Solution: MCP server runs as a separate process, writes JSON to `~/.agent_rpg_sync.json`, and the game's `Bridge` polls every 2 seconds.

```
MCP server (stdio)  →  ~/.agent_rpg_sync.json  →  Bridge.poll()  →  game events
Hook scripts        →  ~/.agent_rpg_queue.ndjson  →  Bridge.drain()  →  game events
```

### Anti-flicker renderer

No `\x1b[2J` (full clear) in the main loop. Every frame:
1. Each map row written at absolute cursor position `\x1b[row;1H`
2. Each cell within a row uses `\x1b[colG` (CHA) — locks horizontal position regardless of emoji width variance
3. `\x1b[K` (CLEAR_EOL) erases stale content to the right
4. All output buffered in a string array and written in a single `process.stdout.write()` call

### Engine freeze

Global tick halts when **all** of:
- Every linked Claude process is `IDLE` / `STANDBY` / `DISCONNECTED`
- MCP bridge file is older than 5 seconds

Map dims, `SYSTEM SUSPENDED` overlay appears. No game state changes while frozen.

Individual agent freeze (per-agent movement halts) when:
- PID is `DISCONNECTED`, **or**
- PID is `IDLE` **and** MCP bridge is stale (>5 s)

`ACTIVE` and `STANDBY` never freeze — both indicate CPU activity. `STANDBY` (1-15% CPU) covers API waits and file I/O. Only true `IDLE` (<1% CPU) without MCP signal is treated as no-activity.

Fog of war: revealed area only follows the player. Agents and fairies are rendered above fog so they never disappear when wandering outside the player's vision radius.

### Process state classification

`ProcessMonitor` polls running processes every ~500ms and classifies each PID:

| State | CPU threshold | Notes |
|-------|:------------:|-------|
| `ACTIVE` | > 15% for 1.5 s | Claude doing CPU work |
| `STANDBY` | 1–15% | File I/O, API wait, low activity |
| `IDLE` | < 1% sustained | Truly idle, waiting for input |
| `DISCONNECTED` | not found | Process terminated |

### Fog of war

| Mode | Default |
|------|---------|
| Adventure | Enabled — unrevealed tiles show `░░`, radius 8 around player |
| Bugs | Disabled — full map visible from start |

Toggle in-game with the `👁ALL` indicator (via `toggleFog()`). When fog is off, the HUD shows a `👁ALL` badge.

### Agent FSM states

```
idle → moving → working → idle
     → fighting
     → sleep   (Claude process idle)
     → thinking (decision pending)
     → zombie  (linked PID terminated)
```

### Agent leveling

XP threshold: `15 × current_level`. On level-up:
- Full HP heal
- `maxHp += 5`
- `atq = min(20, atq + 1)`
- `def = min(20, def + 1)`

### Wave balance

- `concurrentMax` per round: 4 / 5 / 6 / 7 / 8
- Deescalate trigger: 3+ deaths in 60 ticks → `deescalateUntil = tick + 100`, bug ATQ reset

### Escalation indicator (`🔥Lx` HUD badge)

Global counter, both modes. Tracks kills in rolling 60-tick window:

| Recent kills | Escalation |
|:---:|:---:|
| 2 | L1 |
| 4 | L2 |
| 6 | L3 |
| 9 | L4 |
| 12 | L5 |

Decays 1 level every 30 ticks when kill rate drops. Bugs mode triggers higher levels more often due to denser spawn rate — by design, not asymmetry.

---

## Testing

```bash
npm test           # 43 unit tests via node:test + ts-node
npm run typecheck  # tsc --noEmit
```

Tests live in `tests/*.test.ts` and use the built-in `node:test` runner. No external test framework.

Coverage areas: abilities (all 4 classes), world tile rules, player movement + bypass, wave-cap config, deescalate cooldown, agent leveling, observation radius, resource detection.
