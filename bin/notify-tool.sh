#!/usr/bin/env bash
# Generic PreToolUse hook for Claude Code → agents-mini-rpg event log.
# Reads JSON payload from stdin, writes update_agent_status payload to bridge file.

set -euo pipefail

SYNC_PATH="${HOME}/.agent_rpg_sync.json"
QUEUE_PATH="${HOME}/.agent_rpg_queue.ndjson"

# Resolve true Claude PID. Hook usually invoked as child of bash spawned by claude.
# Walk parent chain until we find a process with command containing "claude".
resolve_claude_pid() {
  local pid="$$"
  for _ in 1 2 3 4 5 6; do
    pid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
    [ -z "$pid" ] || [ "$pid" = "0" ] || [ "$pid" = "1" ] && break
    local cmd
    cmd=$(ps -o args= -p "$pid" 2>/dev/null || echo "")
    case "$cmd" in
      *claude*) echo "$pid"; return ;;
    esac
  done
  echo ""
}

CLAUDE_PID_RESOLVED="$(resolve_claude_pid)"
PID="${CLAUDE_PID:-${CLAUDE_PID_RESOLVED:-${PPID}}}"

# Read hook payload (Claude Code passes tool info as JSON on stdin)
PAYLOAD="$(cat || true)"

if [ -z "$PAYLOAD" ]; then
  exit 0
fi

# Extract tool name + relevant input (best-effort with jq, fallback grep)
TOOL_NAME="$(echo "$PAYLOAD" | jq -r '.tool_name // empty' 2>/dev/null || echo "")"
if [ -z "$TOOL_NAME" ]; then
  TOOL_NAME="$(echo "$PAYLOAD" | grep -oE '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"([^"]+)"$/\1/')"
fi

TOOL_NAME="${TOOL_NAME:-Tool}"

# Try to extract a useful detail from tool_input (file_path, command, pattern)
DETAIL="$(echo "$PAYLOAD" | jq -r '.tool_input.file_path // .tool_input.command // .tool_input.pattern // .tool_input.description // empty' 2>/dev/null || echo "")"
DETAIL="${DETAIL:0:200}"
DETAIL="$(echo "$DETAIL" | tr -d '\n\r' | sed 's/"/\\"/g')"

# Health delta heuristic: errors negative, success positive small
HP_DELTA=0

TS="$(date +%s%3N 2>/dev/null || echo "$(date +%s)000")"

PAYLOAD_LINE='{"mcp":true,"type":"update_agent_status","pid":'"${PID}"',"action":"'"${TOOL_NAME}"'","metadata":"'"${DETAIL}"'","health_delta":'"${HP_DELTA}"',"ts":'"${TS}"'}'
echo "$PAYLOAD_LINE" > "$SYNC_PATH"
echo "$PAYLOAD_LINE" >> "$QUEUE_PATH"
