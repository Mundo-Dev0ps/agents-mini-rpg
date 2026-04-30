import * as path from "path";
import * as os from "os";

const cwd = process.cwd();
const distEntry = path.join(cwd, "dist", "mcp-server.js");
const syncFile = path.join(cwd, ".agent_sync.json");

const config = {
  mcpServers: {
    "agent-mini-rpg": {
      command: "node",
      args: [distEntry],
      env: {
        AGENT_SYNC_FILE: syncFile,
      },
    },
  },
};

const block = JSON.stringify(config, null, 2);
const home = os.homedir();
const claudeConfig = path.join(home, ".claude", "config.json");

process.stdout.write(`
╔══════════════════════════════════════════════════════════════════╗
║  agent-mini-rpg — MCP Server Auto-Configuration                  ║
╚══════════════════════════════════════════════════════════════════╝

1. Build: npm run build
2. Install SDK (if not present): npm i @modelcontextprotocol/sdk
3. Add this block to ${claudeConfig} (merge mcpServers key):

${block}

4. Restart Claude Code. Tool 'update_agent_status' becomes callable.
5. Run TUI: node dist/index.js

Sync file (bridge): ${syncFile}
`);
