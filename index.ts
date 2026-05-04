import chalk from "chalk";
import { Game } from "./core/game";
import { Renderer } from "./cli/renderer";
import { setupInput } from "./cli/input";
import { Bridge } from "./core/bridge";
import { setAudioEnabled, isAudioEnabled } from "./core/audio";
import {
  parseClass,
  randomClass,
  CLASS_SPECS,
  ALL_CLASSES,
  CharacterClass,
} from "./core/avatars";
import { GameMode, THEMES, Theme } from "./core/themes";

const DEFAULT_TICK_MS = 300;
const MIN_TICK_MS = 100;
const MAX_TICK_MS = 1000;
const STEP_MS = 50;

const MIN_COLS = 107;
const MIN_ROWS = 34;
const REC_COLS = 140;
const REC_ROWS = 42;

const ANSI_CLEAR = "\x1b[2J";
const ANSI_HOME = "\x1b[H";
const ANSI_HIDE = "\x1b[?25l";
const ANSI_SHOW = "\x1b[?25h";
const ANSI_RESET = "\x1b[0m";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function parseArgs(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.+))?$/);
    if (m) out[m[1]] = m[2] ?? "true";
  }
  return out;
}

function resolveClass(args: Record<string, string>): CharacterClass | null {
  const flag = args["class"] ?? args["player"];
  const env = process.env.PLAYER_CLASS;
  return parseClass(flag) ?? parseClass(env);
}

function resolveMode(args: Record<string, string>): GameMode | null {
  const flag = (args["mode"] ?? process.env.GAME_MODE ?? "").toLowerCase();
  if (flag === "a" || flag === "adventure") return "adventure";
  if (flag === "b" || flag === "bugs") return "bugs";
  return null;
}

interface MenuChoice {
  observer: boolean;
  cls: CharacterClass | null;
  back: boolean;
}

function drawSizeGate(): void {
  const w = process.stdout.columns || 80;
  const h = process.stdout.rows || 24;
  const okW = w >= MIN_COLS;
  const okH = h >= MIN_ROWS;
  const recOk = w >= REC_COLS && h >= REC_ROWS;

  const wTxt = okW ? chalk.greenBright.bold(String(w)) : chalk.redBright.bold(String(w));
  const hTxt = okH ? chalk.greenBright.bold(String(h)) : chalk.redBright.bold(String(h));
  const recTxt = recOk
    ? chalk.greenBright(`${REC_COLS}×${REC_ROWS} ✓`)
    : chalk.gray(`${REC_COLS}×${REC_ROWS}`);

  const content = [
    chalk.bgRed.white.bold(" ⚠  TERMINAL TOO SMALL — RESIZE TO CONTINUE "),
    "",
    `  Current:      ${wTxt} cols × ${hTxt} rows`,
    `  Required:     ${chalk.cyanBright(`${MIN_COLS} × ${MIN_ROWS}`)}`,
    `  Recommended:  ${recTxt}`,
    "",
    chalk.gray("  Drag terminal edge to resize — updates live."),
    chalk.gray("  Game is paused. Ctrl-C to quit."),
  ];

  const stripLen = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "").length;
  const maxLen = Math.max(...content.map(stripLen));
  const blank = " ".repeat(Math.max(0, w));
  const out: string[] = [ANSI_CLEAR + ANSI_HOME + ANSI_HIDE];

  const vPad = Math.max(0, Math.floor((h - content.length) / 2));
  for (let i = 0; i < vPad; i++) out.push(blank);
  for (const line of content) {
    const hPad = Math.max(0, Math.floor((w - maxLen) / 2));
    out.push(" ".repeat(hPad) + line);
  }
  for (let i = vPad + content.length; i < h; i++) out.push(blank);

  try { process.stdout.write(out.join("\n")); } catch { /* terminal too small to write */ }
}

function waitForTerminalSize(): Promise<void> {
  return new Promise((resolve) => {
    const ok = () => (process.stdout.columns || 80) >= MIN_COLS && (process.stdout.rows || 24) >= MIN_ROWS;
    if (ok()) { resolve(); return; }

    drawSizeGate();

    // setInterval keeps event loop alive (SIGWINCH alone does not ref the loop in all Node versions)
    // also refreshes the gate display live so current size updates as user drags
    const poll = setInterval(() => {
      if (ok()) {
        clearInterval(poll);
        process.removeListener("SIGWINCH", onResize);
        try { process.stdout.write(ANSI_CLEAR + ANSI_HOME + ANSI_SHOW + ANSI_RESET); } catch { /* ignore */ }
        resolve();
      } else {
        drawSizeGate();
      }
    }, 250);

    const onResize = () => {
      if (ok()) {
        clearInterval(poll);
        process.removeListener("SIGWINCH", onResize);
        try { process.stdout.write(ANSI_CLEAR + ANSI_HOME + ANSI_SHOW + ANSI_RESET); } catch { /* ignore */ }
        resolve();
      } else {
        drawSizeGate();
      }
    };
    process.on("SIGWINCH", onResize);
  });
}

type MenuTone = "magenta" | "cyan" | "yellow" | "green" | "blue" | "red" | "gray";

interface MenuItem {
  label: string;
  detail?: string;
  description?: string[];
  tone?: MenuTone;
  value: string;
}

function visibleLength(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, "").replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]/gu, "XX").length;
}

function padVisible(s: string, w: number): string {
  const len = visibleLength(s);
  if (len >= w) return s;
  return s + " ".repeat(w - len);
}

function toneColor(tone: MenuTone | undefined): (s: string) => string {
  switch (tone) {
    case "magenta": return chalk.magentaBright.bold;
    case "cyan": return chalk.cyanBright.bold;
    case "yellow": return chalk.yellowBright.bold;
    case "green": return chalk.greenBright.bold;
    case "blue": return chalk.blueBright.bold;
    case "red": return chalk.redBright.bold;
    default: return chalk.white.bold;
  }
}

function drawBoxMenu(title: string, footer: string, items: MenuItem[], cursor: number): void {
  const w = 64;
  const inner = w - 2;
  const horiz = "─".repeat(inner);
  const top = chalk.cyanBright("╔" + "═".repeat(inner) + "╗");
  const bot = chalk.cyanBright("╚" + "═".repeat(inner) + "╝");
  const sep = chalk.cyanBright("╟" + horiz + "╢");
  const side = chalk.cyanBright("║");
  const blank = side + " ".repeat(inner) + side;
  const titlePad = padVisible(` ${title} `, inner);
  const titleLine = side + chalk.bgBlue.whiteBright.bold(titlePad) + side;
  const footerPad = padVisible(` ${footer} `, inner);
  const footerLine = side + chalk.bgBlack.gray(footerPad) + side;

  const out: string[] = [];
  out.push(ANSI_CLEAR + ANSI_HOME + ANSI_HIDE);
  out.push("\n");
  out.push(top + "\n");
  out.push(titleLine + "\n");
  out.push(blank + "\n");

  items.forEach((it, i) => {
    const selected = i === cursor;
    const tone = toneColor(it.tone);
    const stripe = tone("▎");
    const arrow = selected ? tone("▶") : " ";
    const numTag = chalk.dim(`[${i + 1}]`);
    const labelText = selected
      ? chalk.bgWhite.black.bold(` ${arrow} ${stripe} ${numTag} ${it.label} `)
      : ` ${arrow} ${stripe} ${numTag} ${it.label} `;
    const padded = padVisible(labelText, inner);
    out.push(side + padded + side + "\n");
  });

  out.push(blank + "\n");
  out.push(sep + "\n");

  const sel = items[cursor];
  const descTitle = sel.detail
    ? `  ${toneColor(sel.tone)("◆")} ${chalk.bold.whiteBright(sel.detail)}`
    : `  ${toneColor(sel.tone)("◆")} ${chalk.bold.whiteBright(sel.label)}`;
  out.push(side + padVisible(descTitle, inner) + side + "\n");
  const lines = sel.description ?? [];
  if (lines.length === 0) {
    out.push(side + padVisible(`     ${chalk.gray("(no description)")}`, inner) + side + "\n");
  } else {
    for (const line of lines) {
      out.push(side + padVisible(`     ${chalk.gray(line)}`, inner) + side + "\n");
    }
  }
  out.push(blank + "\n");
  out.push(footerLine + "\n");
  out.push(bot + "\n");
  process.stdout.write(out.join(""));
}

function runBoxMenu(title: string, footer: string, items: MenuItem[], initialCursor: number = 0): Promise<string | null> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      resolve(items[initialCursor]?.value ?? null);
      return;
    }
    let cursor = initialCursor;
    drawBoxMenu(title, footer, items, cursor);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let buf = "";
    const onMenuResize = () => {
      const w = process.stdout.columns || 80;
      const h = process.stdout.rows || 24;
      if (w < MIN_COLS || h < MIN_ROWS) {
        drawSizeGate();
      } else {
        try { drawBoxMenu(title, footer, items, cursor); } catch { /* ignore */ }
      }
    };
    process.on("SIGWINCH", onMenuResize);
    const cleanup = () => {
      process.removeListener("SIGWINCH", onMenuResize);
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write(ANSI_RESET);
    };
    const onData = (key: string) => {
      buf += key;
      while (buf.length > 0) {
        let consumed = 0;
        let action: "up" | "down" | "enter" | "back" | "quit" | null = null;
        let directIndex = -1;
        if (buf.startsWith("\x1b[A")) { action = "up"; consumed = 3; }
        else if (buf.startsWith("\x1b[B")) { action = "down"; consumed = 3; }
        else if (buf.startsWith("\x1b") && buf.length === 1) { return; }
        else if (buf[0] === "\r" || buf[0] === "\n") { action = "enter"; consumed = 1; }
        else if (buf[0] === " ") { action = "enter"; consumed = 1; }
        else if (buf[0] === "\x03") { action = "quit"; consumed = 1; }
        else if (buf[0] === "\x1b") { action = "back"; consumed = 1; }
        else if (buf[0].toLowerCase() === "q") { action = "quit"; consumed = 1; }
        else if (buf[0].toLowerCase() === "b") { action = "back"; consumed = 1; }
        else if (buf[0] === "k") { action = "up"; consumed = 1; }
        else if (buf[0] === "j") { action = "down"; consumed = 1; }
        else if (buf[0] >= "1" && buf[0] <= "9") {
          directIndex = parseInt(buf[0], 10) - 1;
          consumed = 1;
        }
        else { consumed = 1; }
        buf = buf.slice(consumed);
        if (directIndex >= 0 && directIndex < items.length) {
          cleanup();
          resolve(items[directIndex].value);
          return;
        } else if (action === "up") {
          cursor = (cursor - 1 + items.length) % items.length;
          drawBoxMenu(title, footer, items, cursor);
        } else if (action === "down") {
          cursor = (cursor + 1) % items.length;
          drawBoxMenu(title, footer, items, cursor);
        } else if (action === "enter") {
          cleanup();
          resolve(items[cursor].value);
          return;
        } else if (action === "back") {
          cleanup();
          resolve(null);
          return;
        } else if (action === "quit") {
          cleanup();
          process.stdout.write(ANSI_SHOW);
          process.exit(0);
        }
      }
    };
    stdin.on("data", onData);
  });
}

async function promptMode(): Promise<GameMode> {
  await waitForTerminalSize();
  if (!process.stdin.isTTY) return "bugs";
  const items: MenuItem[] = [
    {
      label: `🌲  ${THEMES.adventure.label}`,
      detail: `Agents Aventure — ${THEMES.adventure.blurb}`,
      description: [
        "Forest fantasy world: NPCs, quests, hunts.",
        "Trees, rocks, water tiles. Bugs replaced by beasts.",
        "Avatars: Elf 🧝, Wizard 🧙, Fairy 🧚, Knight 🛡️.",
      ],
      tone: "green",
      value: "adventure",
    },
    {
      label: `🤖  ${THEMES.bugs.label}`,
      detail: `Cyber-Tech — ${THEMES.bugs.blurb}`,
      description: [
        "Defend codebase from bugs + bosses (5 rounds).",
        "Bricks, chains, circuits. Final boss revives once.",
        "Avatars: Robot 🤖, Drone 🛰️, Firewall 🛡️, Debugger 🔧.",
      ],
      tone: "magenta",
      value: "bugs",
    },
  ];
  while (true) {
    const v = await runBoxMenu(
      "🎮  GAME MODE",
      "↑/↓ move  ·  ↵ select  ·  1-2 quick  ·  q quit",
      items
    );
    if (v === "adventure" || v === "bugs") return v;
  }
}

async function promptMenu(theme: Theme): Promise<MenuChoice> {
  await waitForTerminalSize();
  if (!process.stdin.isTTY) {
    return { observer: false, cls: randomClass(), back: false };
  }
  const avatars = theme.displayAvatars;
  const items: MenuItem[] = avatars.map((a) => {
    const spec = CLASS_SPECS[a.key];
    const stats = `HP×${spec.hpMult}  ATQ×${spec.atqMult}  DEF ${spec.defStat}  SPD ${spec.spdStat}`;
    const range = spec.range > 0 ? `  RNG ${spec.range}` : "";
    const cd = spec.cooldown > 0 ? `  CD ${spec.cooldown}` : "";
    return {
      label: `${a.icon}  ${a.label}  ${chalk.dim("·")}  ${a.abilityLabel}`,
      detail: `${a.label} — ${a.blurb}`,
      description: [
        `Ability: ${a.abilityLabel}`,
        `Stats: ${stats}${range}${cd}`,
        `Aura: ${spec.auraColor}  ·  Theme: ${a.blurb}`,
      ],
      tone: spec.auraColor as MenuTone,
      value: `cls:${a.key}`,
    };
  });
  items.push({
    label: "👁   Observer Mode",
    detail: "Observer — read-only spectator",
    description: [
      "No player on map.",
      "Game runs, agents act, world ticks.",
      "Useful to watch Claude processes work.",
    ],
    tone: "cyan",
    value: "observer",
  });
  items.push({
    label: "←   Back to mode select",
    detail: "Return to game-mode picker",
    description: ["Switch between Agents Aventure and Cyber-Tech themes."],
    tone: "gray",
    value: "back",
  });
  const v = await runBoxMenu(
    `${theme.label.toUpperCase()}  —  CHOOSE AVATAR`,
    "↑/↓ move  ·  ↵ select  ·  1-6 quick  ·  b back  ·  q quit",
    items
  );
  if (v === null || v === "back") return { observer: false, cls: null, back: true };
  if (v === "observer") return { observer: true, cls: null, back: false };
  if (v && v.startsWith("cls:")) {
    return { observer: false, cls: v.slice(4) as CharacterClass, back: false };
  }
  return { observer: false, cls: null, back: true };
}

function printSelector(): void {
  process.stdout.write("\nAvailable classes:\n");
  for (const c of ALL_CLASSES) {
    const s = CLASS_SPECS[c];
    process.stdout.write(
      `  ${c.padEnd(10)} ${s.icon}  ${s.label.padEnd(8)} ${s.abilityLabel.padEnd(14)} — ${s.blurb}\n`
    );
  }
  process.stdout.write("Use --class=<key> or PLAYER_CLASS=<key>\n\n");
}

async function main(): Promise<void> {
  // Suppress EPIPE — stdout write fails silently when terminal shrinks
  process.stdout.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code !== "EPIPE") throw err;
  });
  process.stderr.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code !== "EPIPE") throw err;
  });
  // SIGHUP — sent by some terminals on aggressive resize or detach; ignore to stay alive
  process.on("SIGHUP", () => {});

  const args = parseArgs();
  if (args["help"] === "classes" || args["list-classes"] !== undefined) {
    printSelector();
    process.exit(0);
  }
  await waitForTerminalSize();

  const observerFlag =
    args["observer"] !== undefined || process.env.OBSERVER_MODE === "1";

  let mode = resolveMode(args);
  if (!mode) mode = await promptMode();

  let playerClass = resolveClass(args);
  let observerMode = observerFlag;
  if (!observerMode && !playerClass) {
    while (true) {
      const choice = await promptMenu(THEMES[mode]);
      if (choice.back) {
        mode = await promptMode();
        continue;
      }
      observerMode = choice.observer;
      playerClass = choice.cls;
      break;
    }
  }
  if (!playerClass) playerClass = mode === "adventure" ? "wolf" : "tech";

  await waitForTerminalSize();
  const termWidth = process.stdout.columns || 80;
  const termHeight = process.stdout.rows || 24;

  const bridge = new Bridge();

  const dashCols = 52;
  const mapWidth = Math.min(
    72,
    Math.max(20, Math.floor((termWidth - dashCols) / 2))
  );
  const mapHeight = Math.min(20, Math.max(12, termHeight - 12));

  const game = new Game({
    width: mapWidth,
    height: mapHeight,
    winTarget: 10,
    bridge,
    playerClass,
    observerMode,
    mode,
    pacifist: args["pacifist"] !== undefined,
  });

  bridge.start();

  const renderer = new Renderer();
  renderer.init();

  let resizePaused = false;
  process.on("SIGWINCH", () => {
    const w = process.stdout.columns || 80;
    const h = process.stdout.rows || 24;
    if (w < MIN_COLS || h < MIN_ROWS) {
      resizePaused = true;
      drawSizeGate();
      return;
    }
    if (resizePaused) {
      resizePaused = false;
      try { renderer.render(game, tickMs); } catch { /* ignore */ }
    }
    renderer.flash(`📐 ${w}×${h}`, 6, game.tick);
  });

  let running = true;
  let tickMs = DEFAULT_TICK_MS;

  const teardown = setupInput((key) => {
    if (renderer.settingsOpen) {
      if (key === "m" || key === "escape" || key === "q") {
        renderer.toggleSettings();
        return;
      }
      if (key === "up") {
        renderer.settingsCursorMove(-1);
        return;
      }
      if (key === "down") {
        renderer.settingsCursorMove(1);
        return;
      }
      if (key === "return" || key === "space") {
        renderer.settingsActivate(
          game,
          () => setAudioEnabled(!isAudioEnabled()),
          () => {
            game.observerMode = !game.observerMode;
          }
        );
        return;
      }
      return;
    }
    if (key === "q" || key === "escape") {
      running = false;
      return;
    }
    if (key === "m") {
      renderer.toggleSettings();
      return;
    }
    if (key === "r") {
      game.respawnPlayer();
      renderer.flash("RESPAWN", 6, game.tick);
      return;
    }
    if (key === "1") {
      renderer.setEventFilter("all");
      return;
    }
    if (key === "2") {
      renderer.setEventFilter("agents");
      return;
    }
    if (key === "3") {
      renderer.setEventFilter("tools");
      return;
    }
    if (key === "4") {
      renderer.setEventFilter("combat");
      return;
    }
    if (key === "5") {
      renderer.setEventFilter("system");
      return;
    }
    if (key === "n") {
      game.restart();
      renderer.flash("RESTART", 6, game.tick);
      return;
    }
    if (key === "p") {
      game.togglePause();
      return;
    }
    if (key === "i") {
      renderer.toggleInspect();
      return;
    }
    if (key === "tab") {
      renderer.cycleInspect(game.agents.length);
      return;
    }
    if (key === "+" || key === "=") {
      tickMs = clamp(tickMs - STEP_MS, MIN_TICK_MS, MAX_TICK_MS);
      return;
    }
    if (key === "-" || key === "_") {
      tickMs = clamp(tickMs + STEP_MS, MIN_TICK_MS, MAX_TICK_MS);
      return;
    }
    if (game.observerMode) return;
    if (key === "up") {
      game.movePlayerDir("up");
      if (game.player.turboActive) game.movePlayerDir("up");
      return;
    }
    if (key === "down") {
      game.movePlayerDir("down");
      if (game.player.turboActive) game.movePlayerDir("down");
      return;
    }
    if (key === "left") {
      game.movePlayerDir("left");
      if (game.player.turboActive) game.movePlayerDir("left");
      return;
    }
    if (key === "right") {
      game.movePlayerDir("right");
      if (game.player.turboActive) game.movePlayerDir("right");
      return;
    }
    if (key === "space" || key === "return") {
      const r = game.interact();
      renderer.flash(r.message, 6, game.tick);
      renderer.render(game, tickMs);
      return;
    }
    if (key === "a") {
      const r = game.useAbility();
      renderer.flash(r.message, 6, game.tick);
      renderer.render(game, tickMs);
      return;
    }
    if (key === "v") {
      game.triggerHandshake();
      renderer.flash("HANDSHAKE sent", 6, game.tick);
      renderer.render(game, tickMs);
      return;
    }
    if (key === "s") {
      setAudioEnabled(!isAudioEnabled());
      renderer.flash(`Audio ${isAudioEnabled() ? "ON" : "OFF"}`, 6, game.tick);
      renderer.render(game, tickMs);
      return;
    }
  });

  const fullShutdown = () => {
    try {
      game.savePersistedState();
    } catch {
      /* swallow */
    }
    teardown();
    bridge.stop();
    renderer.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", fullShutdown);
  process.on("SIGTERM", fullShutdown);

  const exitReason: { reason: "quit" | "mode" | "avatar" } = { reason: "quit" };

  await new Promise<void>((resolve) => {
    const loop = () => {
      if (resizePaused) {
        setTimeout(loop, 200);
        return;
      }
      if (renderer.pendingMenuRequest) {
        exitReason.reason = renderer.pendingMenuRequest;
        renderer.pendingMenuRequest = null;
        running = false;
      }
      if (!running) {
        teardown();
        bridge.stop();
        renderer.shutdown();
        resolve();
        return;
      }
      try {
        game.step();
        renderer.render(game, tickMs);
      } catch { /* swallow render errors — e.g. terminal shrunk mid-frame */ }
      setTimeout(loop, tickMs);
    };
    renderer.render(game, tickMs);
    setTimeout(loop, tickMs);
  });

  if (exitReason.reason === "mode") {
    const newMode = await promptMode();
    while (true) {
      const choice = await promptMenu(THEMES[newMode]);
      if (choice.back) {
        const m2 = await promptMode();
        return relaunch(m2, choice.cls, choice.observer, args);
      }
      return relaunch(newMode, choice.cls, choice.observer, args);
    }
  }
  if (exitReason.reason === "avatar") {
    while (true) {
      const choice = await promptMenu(THEMES[mode]);
      if (choice.back) {
        const m2 = await promptMode();
        return relaunch(m2, choice.cls, choice.observer, args);
      }
      return relaunch(mode, choice.cls, choice.observer, args);
    }
  }
  process.exit(0);
}

async function relaunch(
  mode: GameMode,
  cls: CharacterClass | null,
  observer: boolean,
  prevArgs: Record<string, string>
): Promise<void> {
  if (cls) prevArgs["class"] = cls;
  if (observer) prevArgs["observer"] = "true";
  prevArgs["mode"] = mode;
  process.argv = [
    process.argv[0],
    process.argv[1],
    ...Object.entries(prevArgs).map(([k, v]) =>
      v === "true" ? `--${k}` : `--${k}=${v}`
    ),
  ];
  await main();
}

main();
