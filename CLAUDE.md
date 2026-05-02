# agent-mini-rpg

## Overview

Terminal multi-agent RPG MVP, TypeScript. Render tile grid in terminal. Claude Code process spawn in-game agent. Each agent have class with ability + diet rules. Wired to Claude Code via MCP server using file-bridge so MCP stdio no collide with TUI render.

## Architecture

Three layers:

- `core/` — domain logic, no terminal render. Has `Game` orchestrator, procedural `World`, agent FSM, player, class system, process monitor, MCP server runner, file-bridge.
- `cli/` — terminal render + input. `Renderer` write ANSI escapes direct with cursor positioning, no full-screen clear (anti-flicker). Input raw mode.
- Top-level entry — `index.ts` game CLI, `mcp-server.ts` run MCP server separate process, `show-config.ts` print recommended Claude Code MCP config.

MCP server + game talk via `.agent_sync.json`. MCP server write JSON updates, in-game `Bridge` poll every 2 seconds. Decoupled because MCP SDK use stdin/stdout transport, would corrupt TUI output.

`ProcessMonitor` find Claude Code PIDs cross-platform. Prefer `ps-list` + `pidusage` when optional deps installed, fall back to `ps -axo` shell call. State classify `ACTIVE`, `STANDBY`, `IDLE`, `DISCONNECTED` from 15% CPU threshold with 1500 ms debounce per pid.

## Build and run

Plain TypeScript compile to CommonJS. Commands:

- `npm run build` — compile TypeScript to `dist/`.
- `npm run dev` — run game direct with `ts-node`.
- `npm run start` — compile then run compiled output.
- `npm run mcp` — compile then run MCP server. Entry point Claude Code launch when wired via user MCP config.
- `npm run show-config` — print recommended MCP server config to add to Claude Code.
- `npm run install-mcp` — auto-merge MCP server entry into user Claude Code or Claude Desktop config file (timestamped backup if unparseable).

`bin/agent-rpg.js` shebang make game runnable as globally installed npm bin.

## Character class system

Five classes in `core/avatars.ts`: `mage` (🧙), `tech` (🤖), `wolf` (🐺), `bunny` (🐰), `penguin` (🐧). Each have diet, ability, aura color, HP/attack multipliers. `parseClass` accept aliases (e.g. `pet`/`dog`/`cat` map to `wolf` back-compat). Diet rules enforced via `canEat`, refusals returned Spanish via `dietRefusal`.

## Engine state gating

Game tick frozen when engine paused, no Claude process connected, or connected process `IDLE` + MCP bridge stale (>5 seconds). `STANDBY` (CPU 1-15%) treated as alive — covers API waits + file I/O. When frozen, renderer dim map + show `SYSTEM SUSPENDED` overlay. Intentional — in-game world mirror activity of real Claude process.

## Conventions

- TypeScript strict mode. Run `npx tsc --noEmit` verify before commit.
- Renderer never call full-screen clear in main loop. Cursor positioning + per-line `\x1b[K` clear = anti-flicker pattern.
- Emoji tiles render on 2-cell width grid. Mix wider/narrower emoji break alignment — verify visually after tile changes.
- Optional deps (`@modelcontextprotocol/sdk`, `ps-list`, `pidusage`) loaded via `tryRequire` + dynamic import pattern so game run when not installed.
- User-facing fairy dialogue + class refusals Spanish. Code comments + identifiers English.
- No back-compat shims for removed code paths. Delete clean, no dead aliases.

## Key files

- `core/game.ts` — central orchestrator. Own world, player, agent list, bridge listener, engine-state evaluator.
- `core/world.ts` — procedural map gen, water clusters, deterministic tree variants, connectivity validation.
- `core/process_monitor.ts` — Claude PID discovery + CPU-based state classification.
- `core/bridge.ts` — file-bridge poller for `.agent_sync.json`. Existence-check file before stat avoid spurious errors at startup.
- `cli/renderer.ts` — ANSI render, dashboard panels, floating texts, engine-state overlays.
- `index.ts` — CLI entry, class menu, input loop, main game loop driver.