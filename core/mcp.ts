import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const ERROR_LOG_PATH = path.join(os.homedir(), ".agent_rpg_mcp_error.log");

function logError(msg: string): void {
  const ts = new Date().toISOString();
  try {
    fs.appendFileSync(ERROR_LOG_PATH, `[${ts}] ${msg}\n`);
  } catch {
    /* swallow log error */
  }
  process.stderr.write(`${msg}\n`);
}

export interface McpAgentUpdate {
  type: "update_agent_status";
  pid: number;
  action: string;
  metadata: string;
  health_delta: number;
  ts: number;
}

export interface McpAgentCommand {
  type: "agent_command";
  pid: number;
  command: "attack" | "collect" | "heal_player" | "guard";
  note: string;
  ts: number;
}

export interface McpSubAgentUpdate {
  type: "update_subagent";
  parent_pid: number;
  task: "research" | "review" | "explore" | "build" | "debug" | "test";
  status: "spawning" | "working" | "returning" | "done";
  note: string;
  result_icon: string;
  ts: number;
}

export interface McpServerOptions {
  syncPath: string;
  name?: string;
  version?: string;
}

export async function runMcpServer(opts: McpServerOptions): Promise<void> {
  const nativeImport = new Function("m", "return import(m)") as <T>(
    m: string
  ) => Promise<T>;
  let serverMod: unknown;
  let stdioMod: unknown;
  let typesMod: unknown;
  try {
    serverMod = await nativeImport("@modelcontextprotocol/sdk/server/index.js");
    stdioMod = await nativeImport(
      "@modelcontextprotocol/sdk/server/stdio.js"
    );
    typesMod = await nativeImport("@modelcontextprotocol/sdk/types.js");
  } catch (err) {
    logError(
      `MCP SDK not installed or load failed: ${err instanceof Error ? err.message : String(err)}. Install: npm i @modelcontextprotocol/sdk`
    );
    process.exit(1);
  }

  const Server = (serverMod as { Server: new (...a: unknown[]) => unknown })
    .Server;
  const StdioServerTransport = (
    stdioMod as { StdioServerTransport: new () => unknown }
  ).StdioServerTransport;
  const types = typesMod as {
    ListToolsRequestSchema: unknown;
    CallToolRequestSchema: unknown;
  };

  const server = new Server(
    { name: opts.name ?? "agents-mini-rpg", version: opts.version ?? "0.1.1" },
    { capabilities: { tools: {} } }
  ) as {
    setRequestHandler: (schema: unknown, handler: Function) => void;
    connect: (transport: unknown) => Promise<void>;
  };

  server.setRequestHandler(types.ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "update_agent_status",
        description:
          "Actualiza el estado visual y log de un agente en el simulador RPG en tiempo real",
        inputSchema: {
          type: "object",
          properties: {
            pid: { type: "number", description: "Process ID" },
            action: { type: "string", description: "Action label" },
            metadata: { type: "string", description: "Description" },
            health_delta: {
              type: "number",
              description: "HP change — positive heals, negative damages",
            },
          },
          required: ["pid", "action", "metadata", "health_delta"],
        },
      },
      {
        name: "agent_attack",
        description: "Order linked agent to seek + attack nearest bug",
        inputSchema: {
          type: "object",
          properties: {
            pid: { type: "number" },
            note: { type: "string", description: "Reason for attack order" },
          },
          required: ["pid"],
        },
      },
      {
        name: "agent_collect",
        description: "Order linked agent to collect resource (weapon/food)",
        inputSchema: {
          type: "object",
          properties: {
            pid: { type: "number" },
            note: { type: "string" },
          },
          required: ["pid"],
        },
      },
      {
        name: "heal_player",
        description: "Have linked agent heal player +5 HP if adjacent",
        inputSchema: {
          type: "object",
          properties: {
            pid: { type: "number" },
            note: { type: "string" },
          },
          required: ["pid"],
        },
      },
      {
        name: "update_subagent",
        description:
          "Notify game about sub-agent task spawned by parent Claude PID. Visualizes Task tool invocations as orbiting mini-agents.",
        inputSchema: {
          type: "object",
          properties: {
            parent_pid: { type: "number", description: "Parent Claude PID" },
            task: {
              type: "string",
              enum: ["research", "review", "explore", "build", "debug", "test"],
              description: "Sub-agent task type",
            },
            status: {
              type: "string",
              enum: ["spawning", "working", "returning", "done"],
            },
            note: { type: "string" },
            result_icon: {
              type: "string",
              description: "Icon to show on completion: ✓ ✗ ⚠ etc",
            },
          },
          required: ["parent_pid", "task", "status"],
        },
      },
    ],
  }));

  server.setRequestHandler(
    types.CallToolRequestSchema,
    async (request: {
      params: { name: string; arguments: Record<string, unknown> };
    }) => {
      const { name, arguments: args } = request.params;
      if (name === "update_subagent") {
        const parent_pid = Number(args.parent_pid);
        if (!Number.isFinite(parent_pid)) throw new Error("parent_pid must be number");
        const sub: McpSubAgentUpdate = {
          type: "update_subagent",
          parent_pid,
          task: String(args.task ?? "research") as McpSubAgentUpdate["task"],
          status: String(args.status ?? "spawning") as McpSubAgentUpdate["status"],
          note: String(args.note ?? ""),
          result_icon: String(args.result_icon ?? ""),
          ts: Date.now(),
        };
        writeUpdate(opts.syncPath, sub);
        return {
          content: [
            { type: "text", text: `OK subagent parent=${parent_pid} task=${sub.task} status=${sub.status}` },
          ],
        };
      }
      const pid = Number(args.pid);
      if (!Number.isFinite(pid)) {
        throw new Error("pid must be a number");
      }
      if (name === "update_agent_status") {
        const update: McpAgentUpdate = {
          type: "update_agent_status",
          pid,
          action: String(args.action ?? ""),
          metadata: String(args.metadata ?? ""),
          health_delta: Number(args.health_delta ?? 0),
          ts: Date.now(),
        };
        writeUpdate(opts.syncPath, update);
        return {
          content: [
            { type: "text", text: `OK pid=${pid} action=${update.action} hp_delta=${update.health_delta}` },
          ],
        };
      }
      const cmdMap: Record<string, McpAgentCommand["command"] | undefined> = {
        agent_attack: "attack",
        agent_collect: "collect",
        heal_player: "heal_player",
        agent_guard: "guard",
      };
      const cmd = cmdMap[name];
      if (!cmd) throw new Error(`Unknown tool: ${name}`);
      const cmdPayload: McpAgentCommand = {
        type: "agent_command",
        pid,
        command: cmd,
        note: String(args.note ?? ""),
        ts: Date.now(),
      };
      writeUpdate(opts.syncPath, cmdPayload);
      return {
        content: [
          { type: "text", text: `OK cmd=${cmd} pid=${pid}` },
        ],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function writeUpdate(syncPath: string, update: McpAgentUpdate | McpAgentCommand | McpSubAgentUpdate): void {
  const payload = { mcp: true, ...update };
  try {
    fs.writeFileSync(syncPath, JSON.stringify(payload));
  } catch (err) {
    logError(
      `mcp write failed (${syncPath}): ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
