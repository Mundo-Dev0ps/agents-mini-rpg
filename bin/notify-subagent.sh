#!/usr/bin/env bash
# Hook bridge for Claude Code → agents-mini-rpg sub-agent visualization
# Reads JSON from stdin (Claude Code hook payload) and writes update_subagent
# event to ~/.agent_rpg_sync.json

set -euo pipefail

SYNC_PATH="${HOME}/.agent_rpg_sync.json"
QUEUE_PATH="${HOME}/.agent_rpg_queue.ndjson"

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
PARENT_PID="${CLAUDE_PID:-${CLAUDE_PID_RESOLVED:-${PPID}}}"

# Read hook payload
PAYLOAD="$(cat || true)"

# Detect event from arg1: "spawning" | "working" | "done"
STATUS="${1:-working}"

# Extract task hint from payload (best-effort)
TASK="research"
if echo "$PAYLOAD" | grep -qiE 'review|lint|audit'; then TASK="review"
elif echo "$PAYLOAD" | grep -qiE 'explore|search|find'; then TASK="explore"
elif echo "$PAYLOAD" | grep -qiE 'build|compile|create'; then TASK="build"
elif echo "$PAYLOAD" | grep -qiE 'debug|fix|error'; then TASK="debug"
elif echo "$PAYLOAD" | grep -qiE 'test|verify|check'; then TASK="test"
fi

NOTE="$(echo "$PAYLOAD" | head -c 100 | tr -d '\n\r"')"
RESULT_ICON=""
if [ "$STATUS" = "done" ]; then RESULT_ICON="✓"; fi

TS="$(date +%s%3N 2>/dev/null || date +%s)000"

PAYLOAD_LINE='{"mcp":true,"type":"update_subagent","parent_pid":'"${PARENT_PID}"',"task":"'"${TASK}"'","status":"'"${STATUS}"'","note":"'"${NOTE}"'","result_icon":"'"${RESULT_ICON}"'","ts":'"${TS}"'}'
echo "$PAYLOAD_LINE" > "$SYNC_PATH"
echo "$PAYLOAD_LINE" >> "$QUEUE_PATH"
