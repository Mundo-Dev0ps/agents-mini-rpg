# MCP Integration

← [Back to README](../README.md)

The game connects to Claude Code via two channels that both write to the same files in `$HOME`:

```
Claude Code process
  ├── MCP server (stdio)  →  writes ~/.agent_rpg_sync.json
  └── Hook scripts        →  appends ~/.agent_rpg_queue.ndjson

Game process
  └── Bridge poller (2s)  →  reads both files → renders in event log
```

**Why a file-bridge?** The MCP SDK uses stdio transport. Writing directly to stdout would corrupt the TUI. The file decouples both sides cleanly.

---

## Auto-install

```bash
npm run install-mcp
```

Merges the MCP server entry into your Claude Code or Claude Desktop config file. Creates a timestamped backup if the file is unparseable.

---

## Manual config

```bash
npm run show-config
```

Prints a JSON block to copy into your Claude Code MCP settings manually.

---

## Hook scripts

Wire `bin/notify-tool.sh` and `bin/notify-subagent.sh` in `~/.claude/settings.json`:

```jsonc
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|Bash|Read|Grep|Glob|MultiEdit|Task",
        "hooks": [
          { "type": "command", "command": "bash /path/to/agents-mini-rpg/bin/notify-tool.sh" }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          { "type": "command", "command": "bash /path/to/agents-mini-rpg/bin/notify-subagent.sh" }
        ]
      }
    ]
  }
}
```

Make sure the scripts are executable:

```bash
chmod +x bin/notify-tool.sh bin/notify-subagent.sh
```

---

## Event log filters

In-game press `1`–`5` to filter the event log:

| Key | Filter | Shows |
|:---:|--------|-------|
| `1` | ALL | Everything |
| `2` | 🤖 game | Agent actions, level-ups, deaths |
| `3` | ✏️ tools | MCP tool calls (Edit, Bash, Read…) |
| `4` | ⚔ combat | Damage, kills, boss events |
| `5` | 🚨 alerts | Errors, input-needed, warnings |

---

## Runtime files

| File | Purpose |
|------|---------|
| `~/.agent_rpg_sync.json` | Last MCP bridge update — overwritten each tick |
| `~/.agent_rpg_queue.ndjson` | Pending hook events — truncated when drained |

Nothing is sent over the network.

---

## Privacy

The optional `ClaudeBrain` LLM class (`core/brain.ts`) accepts an Anthropic API key as a constructor parameter. It is **not** wired into the default game loop — the game uses `MockBrain` unless `ANTHROPIC_API_KEY` is set.
