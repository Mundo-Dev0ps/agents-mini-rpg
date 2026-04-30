import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { runMcpServer } from "./core/mcp";

const syncPath = path.join(os.homedir(), ".agent_rpg_sync.json");

const userLabel = (() => {
  const u = os.userInfo().username;
  if (!u) return "User";
  const cap = u.charAt(0).toUpperCase() + u.slice(1);
  return cap.includes("jonathan") || u.toLowerCase().includes("jonathan")
    ? "Jonathan"
    : cap;
})();

process.stderr.write(`DEBUG: MCP Server started for ${userLabel}\n`);

const HEARTBEAT_MS = 5000;

function writeHeartbeat(): void {
  const payload = {
    mcp: true,
    type: "heartbeat",
    user: userLabel,
    ts: Date.now(),
  };
  try {
    fs.writeFileSync(syncPath, JSON.stringify(payload));
  } catch (err) {
    process.stderr.write(
      `heartbeat write failed: ${err instanceof Error ? err.message : String(err)}\n`
    );
  }
}

writeHeartbeat();
const heartbeatTimer = setInterval(writeHeartbeat, HEARTBEAT_MS);
heartbeatTimer.unref?.();

runMcpServer({ syncPath }).catch((err) => {
  process.stderr.write(
    `mcp-server error: ${err instanceof Error ? err.stack : String(err)}\n`
  );
  process.exit(1);
});
