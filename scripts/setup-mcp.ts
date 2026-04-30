import * as os from "os";
import * as path from "path";
import * as fs from "fs";

interface ConfigCandidate {
  path: string;
  label: string;
  exists: boolean;
}

interface McpServersBlock {
  [key: string]: {
    command: string;
    args: string[];
    env?: Record<string, string>;
  };
}

interface HookEntry {
  type: "command";
  command: string;
}

interface HookMatcher {
  matcher?: string;
  hooks: HookEntry[];
}

interface HooksBlock {
  PreToolUse?: HookMatcher[];
  SubagentStop?: HookMatcher[];
  [key: string]: HookMatcher[] | undefined;
}

interface ClaudeConfig {
  mcpServers?: McpServersBlock;
  hooks?: HooksBlock;
  [key: string]: unknown;
}

function candidatePaths(): ConfigCandidate[] {
  const home = os.homedir();
  const platform = os.platform();
  const out: ConfigCandidate[] = [];

  const cliPath = path.join(home, ".claude", "config.json");
  out.push({
    path: cliPath,
    label: "Claude Code CLI",
    exists: fs.existsSync(cliPath),
  });

  if (platform === "darwin") {
    const macDesktop = path.join(
      home,
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json"
    );
    out.push({
      path: macDesktop,
      label: "Claude Desktop (macOS)",
      exists: fs.existsSync(macDesktop),
    });
  } else if (platform === "win32") {
    const appdata = process.env.APPDATA;
    if (appdata) {
      const winDesktop = path.join(
        appdata,
        "Claude",
        "claude_desktop_config.json"
      );
      out.push({
        path: winDesktop,
        label: "Claude Desktop (Windows)",
        exists: fs.existsSync(winDesktop),
      });
    }
  } else {
    const linuxDesktop = path.join(
      home,
      ".config",
      "Claude",
      "claude_desktop_config.json"
    );
    out.push({
      path: linuxDesktop,
      label: "Claude Desktop (Linux)",
      exists: fs.existsSync(linuxDesktop),
    });
  }

  return out;
}

function pickTarget(forceLabel?: string): ConfigCandidate {
  const cands = candidatePaths();
  if (forceLabel) {
    const m = cands.find((c) => c.label.toLowerCase().includes(forceLabel.toLowerCase()));
    if (m) return m;
  }
  const existing = cands.find((c) => c.exists);
  if (existing) return existing;
  return cands[0];
}

function readConfig(p: string): ClaudeConfig {
  if (!fs.existsSync(p)) return { mcpServers: {} };
  try {
    const raw = fs.readFileSync(p, "utf8");
    if (!raw.trim()) return { mcpServers: {} };
    return JSON.parse(raw) as ClaudeConfig;
  } catch (err) {
    const backup = `${p}.bak.${Date.now()}`;
    fs.copyFileSync(p, backup);
    process.stderr.write(
      `⚠ Could not parse existing config (${err instanceof Error ? err.message : String(err)}). Backed up to ${backup}\n`
    );
    return { mcpServers: {} };
  }
}

function writeConfig(p: string, cfg: ClaudeConfig): void {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n");
}

function printBanner(target: ConfigCandidate, projectRoot: string): void {
  const banner = `
   ┌──────────────────────────────────────────────────────────┐
   │                                                          │
   │     █▀█ █▀▀ █▀▀ █▄ █ ▀█▀   █▀▄▀█ █ █▄ █ █   ▀█▀         │
   │     █▀█ █▄█ ██▄ █ ▀█  █    █ ▀ █ █ █ ▀█ █    █          │
   │                                                          │
   │     ░░░░░░░░░░░░░░░  R P G  ░░░░░░░░░░░░░░░░░░░          │
   │                                                          │
   └──────────────────────────────────────────────────────────┘
`;
  process.stdout.write(banner);
  process.stdout.write(`\n  ✓ Target: ${target.label}\n`);
  process.stdout.write(`  ✓ Config: ${target.path}\n`);
  process.stdout.write(`  ✓ Project root: ${projectRoot}\n`);
  process.stdout.write(
    `\n  ✅ Claude-Code vinculado con éxito. Reinicia tu terminal para ver la magia.\n\n`
  );
  process.stdout.write(`  Hooks installed:\n`);
  process.stdout.write(`    - PreToolUse(Task)        → notify-subagent.sh working\n`);
  process.stdout.write(`    - SubagentStop            → notify-subagent.sh done\n`);
  process.stdout.write(`    - PreToolUse(Edit|Write|Bash|Read|Grep|Glob|MultiEdit) → notify-tool.sh\n\n`);
  process.stdout.write(`  Next steps:\n`);
  process.stdout.write(`    1. npm run build\n`);
  process.stdout.write(`    2. Restart Claude Code\n`);
  process.stdout.write(`    3. Run TUI: agent-rpg  (or: node dist/index.js)\n`);
  process.stdout.write(`    4. Use Claude Code Task tool — sub-agents appear in game\n\n`);
}

function main(): void {
  const projectRoot = path.resolve(process.cwd());
  const distEntry = path.resolve(projectRoot, "dist", "mcp-server.js");

  const forceLabel = process.argv
    .slice(2)
    .find((a) => a.startsWith("--target="))
    ?.slice(9);
  const target = pickTarget(forceLabel);

  const cfg = readConfig(target.path);
  if (!cfg.mcpServers) cfg.mcpServers = {};

  cfg.mcpServers["agent-mini-rpg"] = {
    command: "node",
    args: [distEntry],
  };

  const hookScript = path.resolve(projectRoot, "bin", "notify-subagent.sh");
  const toolScript = path.resolve(projectRoot, "bin", "notify-tool.sh");
  if (!cfg.hooks) cfg.hooks = {};
  installHook(cfg.hooks, "PreToolUse", "Task", `${hookScript} working`);
  installHook(cfg.hooks, "SubagentStop", undefined, `${hookScript} done`);
  installHook(
    cfg.hooks,
    "PreToolUse",
    "Edit|Write|Bash|Read|Grep|Glob|MultiEdit",
    toolScript
  );

  writeConfig(target.path, cfg);
  printBanner(target, projectRoot);
}

function installHook(
  hooks: HooksBlock,
  event: string,
  matcher: string | undefined,
  command: string
): void {
  if (!hooks[event]) hooks[event] = [];
  const arr = hooks[event] as HookMatcher[];
  const existing = arr.find((m) =>
    matcher ? m.matcher === matcher : m.matcher === undefined
  );
  if (existing) {
    const has = existing.hooks.some((h) => h.command === command);
    if (!has) existing.hooks.push({ type: "command", command });
    return;
  }
  arr.push({
    matcher,
    hooks: [{ type: "command", command }],
  });
}

main();
