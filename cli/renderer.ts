import chalk from "chalk";
import { Game } from "../core/game";
import { Agent } from "../core/agent";
import { Player } from "../core/player";
import {
  NPC,
  QuestMarker,
  EnemyBug,
  Fairy,
  Weapon,
} from "../core/entity";
import { DIR_ARROW, DIR_EMOJI, Direction } from "../core/direction";
import { CLASS_SPECS, AuraColor, CharacterClass, canBypass } from "../core/avatars";
import { isAudioEnabled as isAudioEnabledShim } from "../core/audio";
import { isNotificationsEnabled, setNotificationsEnabled } from "../core/notifications";
import { Theme } from "../core/themes";
import { AgentRole, AgentState, Quest } from "../core/types";

const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const HOME = "\x1b[H";
const CLEAR = "\x1b[2J";
const CLEAR_EOL = "\x1b[K";
const RESET = "\x1b[0m";

function goto(row: number, col: number): string {
  return `\x1b[${row};${col}H`;
}

const VIEW_HEADER_ROW = 1;
const VIEW_MAP_TOP = 3;
const VIEW_MAP_HEIGHT = 24;
const VIEW_EVENTS_FROM_BOTTOM = 7;

const MIN_RENDER_COLS = 100;
const MIN_RENDER_ROWS = 28;
const REC_RENDER_COLS = 140;
const REC_RENDER_ROWS = 36;

function viewDashCol(mapWidth: number): number {
  return 1 + mapWidth * TILE_CELL_WIDTH + 3;
}

const TILE_TREE = "🌲";
const TILE_ROCK = "🪨";
const TILE_WOOD = "🪵";
const TILE_MEAT = "🥩";
const TILE_BRICK = "🧱";
const TILE_GOLD = "💰";
const TILE_CURE = "➕";
const TILE_HERB = "🌿";
const TILE_CHEST = "📦";
const TILE_DOOR = "🚪";

const ICON_PLAYER = "🧑";
const ICON_NPC = "🧝";
const ICON_FAIRY = "🧚";
const ICON_FAIRY_BUFF = "💖";
const ICON_BUG_L1 = "🐛";
const ICON_BUG_L2 = "🐜";
const ICON_BUG_L3 = "🦟";
const TREE_VARIANTS = ["🌲", "🌳", "🌴"];
const TILE_WATER = "🌊";
const ICON_WEAPON = "⚔️ ";

function iconCell(cls: CharacterClass, theme?: Theme): string {
  if (theme) {
    const av = theme.displayAvatars.find((a) => a.key === cls);
    if (av) return av.icon;
  }
  if (cls === "tech") return "🤖 ";
  return CLASS_SPECS[cls].icon;
}

function classLabel(cls: CharacterClass, theme?: Theme): string {
  if (theme) {
    const av = theme.displayAvatars.find((a) => a.key === cls);
    if (av) return av.label;
  }
  return CLASS_SPECS[cls].label;
}

function weaponIcon(bonus: number, mode: "adventure" | "bugs" = "adventure"): string {
  if (mode === "bugs") {
    if (bonus >= 3) return "🔨";
    return "📦";
  }
  if (bonus >= 3) return "🗡️ ";
  return "⚔️ ";
}

function bugIcon(level: number, game: Game): string {
  const e = game.theme.enemyIcons;
  if (level >= 3) return e.l3;
  if (level >= 2) return e.l2;
  return e.l1;
}

function bossIcon(level: number, game: Game): string {
  const e = game.theme.bossIcons;
  if (level >= 3) return e.l3;
  if (level >= 2) return e.l2;
  return e.l1;
}

const TILE_CELL_WIDTH = 2;
const DASH_WIDTH = 50;
const REASON_MAX = 30;
const ACTION_MAX = 30;
const SESSION_CARD_W = 48;

function strictTrunc(text: string, max: number = SESSION_CARD_W): string {
  if (text.length <= max) return text;
  return text.substring(0, Math.max(0, max - 3)) + "...";
}

const ROLE_ICON: Record<AgentRole, string> = {
  warrior: "🤖",
  mage: "🧙",
  worker: "🧑‍🌾",
  scout: "🏹",
};

const ROLE_COLOR: Record<AgentRole, (s: string) => string> = {
  warrior: chalk.cyanBright,
  mage: chalk.magenta,
  worker: chalk.yellow,
  scout: chalk.cyan,
};

const PID_COLORS: Array<(s: string) => string> = [
  chalk.red,
  chalk.green,
  chalk.yellow,
  chalk.blue,
  chalk.magenta,
  chalk.cyan,
  chalk.redBright,
  chalk.greenBright,
  chalk.yellowBright,
  chalk.blueBright,
  chalk.magentaBright,
  chalk.cyanBright,
];

function pidColor(pid: number | null): (s: string) => string {
  if (pid === null) return chalk.gray;
  return PID_COLORS[Math.abs(pid) % PID_COLORS.length];
}

const AURA_FN: Record<AuraColor, (s: string) => string> = {
  magenta: chalk.magentaBright,
  cyan: chalk.cyanBright,
  yellow: chalk.yellowBright,
  green: chalk.greenBright,
  blue: chalk.blueBright,
  red: chalk.redBright,
};

function classAura(color: AuraColor): (s: string) => string {
  return AURA_FN[color];
}

const STATE_COLOR: Record<AgentState, (s: string) => string> = {
  idle: chalk.gray,
  exploring: chalk.cyan,
  moving: chalk.green,
  working: chalk.yellow,
  fighting: chalk.redBright,
  talking: chalk.magenta,
  sleep: chalk.blueBright,
  thinking: chalk.cyanBright,
  zombie: chalk.red,
};

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function stripAnsiLen(s: string): number {
  return stripAnsi(s).length;
}

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

function visibleLen(s: string): number {
  return stripAnsi(s).length;
}

function padRight(s: string, w: number): string {
  const len = visibleLen(s);
  if (len >= w) return s;
  return s + " ".repeat(w - len);
}

function trunc(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 3)) + "...";
}

function bar(value: number, max: number, len: number = 5): string {
  const ratio = Math.max(0, Math.min(1, value / max));
  const filled = Math.round(ratio * len);
  return "█".repeat(filled) + "░".repeat(len - filled);
}

function hpBar(hp: number, max: number, len: number = 6): string {
  const ratio = Math.max(0, Math.min(1, hp / max));
  const color =
    ratio > 0.6 ? chalk.green : ratio > 0.3 ? chalk.yellow : chalk.red;
  return `[${color(bar(hp, max, len))}]`;
}

function atqBar(atq: number, baseline: number = 20, len: number = 6): string {
  return `[${chalk.redBright(bar(atq, baseline, len))}]`;
}

type FloatColorName = "red" | "green" | "cyan" | "yellow" | "magenta" | "white" | "orange" | "gray";

function floatStyler(c: FloatColorName, colorBlind: boolean): (s: string) => string {
  if (colorBlind) return chalk.bold.whiteBright;
  switch (c) {
    case "red":
      return chalk.bold.redBright;
    case "green":
      return chalk.bold.greenBright;
    case "cyan":
      return chalk.bold.cyanBright;
    case "magenta":
      return chalk.bold.magentaBright;
    case "white":
      return chalk.bold.whiteBright;
    case "orange":
      return chalk.bold.yellow;
    case "gray":
      return chalk.dim.gray;
    case "yellow":
    default:
      return chalk.bold.yellowBright;
  }
}

function bugHpMiniBar(hp: number, max: number, len: number = 4): string {
  const pct = Math.max(0, Math.min(1, hp / max));
  const filled = Math.round(pct * len);
  const empty = len - filled;
  const color = pct > 0.5 ? chalk.greenBright : pct > 0.25 ? chalk.yellow : chalk.redBright;
  return color("▓".repeat(filled)) + chalk.gray("░".repeat(empty));
}

export class Renderer {
  private inspectIndex = 0;
  private inspectMode = false;
  private flashMessage: string = "";
  private flashUntil: number = 0;
  private prevFacing: Map<string, Direction> = new Map();
  private rotatedThisFrame: Set<string> = new Set();
  colorBlind: boolean = false;
  settingsOpen: boolean = false;
  pendingMenuRequest: "mode" | "avatar" | null = null;
  eventFilter: "all" | "agents" | "tools" | "combat" | "system" = "all";
  private settingsCursor: number = 0;

  cycleEventFilter(): void {
    const order: Array<"all" | "agents" | "tools" | "combat" | "system"> = [
      "all", "agents", "tools", "combat", "system",
    ];
    const idx = order.indexOf(this.eventFilter);
    this.eventFilter = order[(idx + 1) % order.length];
  }

  setEventFilter(
    f: "all" | "agents" | "tools" | "combat" | "system"
  ): void {
    this.eventFilter = f;
  }

  toggleColorBlind(): void {
    this.colorBlind = !this.colorBlind;
  }

  toggleSettings(): void {
    this.settingsOpen = !this.settingsOpen;
    this.settingsCursor = 0;
  }

  settingsCursorMove(dir: 1 | -1): void {
    const total = 8;
    this.settingsCursor = (this.settingsCursor + dir + total) % total;
  }

  settingsItems(game: Game): string[] {
    const aud = isAudioEnabledShim() ? "ON" : "OFF";
    const notif = isNotificationsEnabled() ? "ON" : "OFF";
    const cb = this.colorBlind ? "ON" : "OFF";
    const obs = game.observerMode ? "ON" : "OFF";
    const night = game.nightMode ? "🌙 NIGHT" : "☀ DAY";
    return [
      `Audio:         ${aud}`,
      `Notifications: ${notif}`,
      `Color blind:   ${cb}`,
      `Observer:      ${obs} (read-only)`,
      `Cycle:         ${night}`,
      `🔁 Restart game (R1)`,
      `🌐 Change mode (Adventure/Bugs)`,
      `🧝 Change avatar`,
    ];
  }

  settingsActivate(game: Game, audioToggle: () => void, observerToggle: () => void): void {
    if (this.settingsCursor === 0) audioToggle();
    else if (this.settingsCursor === 1) setNotificationsEnabled(!isNotificationsEnabled());
    else if (this.settingsCursor === 2) this.toggleColorBlind();
    else if (this.settingsCursor === 3) observerToggle();
    else if (this.settingsCursor === 4) {
      game.nightMode = !game.nightMode;
    } else if (this.settingsCursor === 5) {
      game.restart();
      this.settingsOpen = false;
    } else if (this.settingsCursor === 6) {
      this.pendingMenuRequest = "mode";
      this.settingsOpen = false;
    } else if (this.settingsCursor === 7) {
      this.pendingMenuRequest = "avatar";
      this.settingsOpen = false;
    }
  }

  init(): void {
    process.stdout.write(HIDE_CURSOR + CLEAR + HOME);
  }

  private renderSizeGate(w: number, h: number): void {
    const out: string[] = [];
    out.push(CLEAR + HOME);
    const okW = w >= MIN_RENDER_COLS;
    const okH = h >= MIN_RENDER_ROWS;
    const wTxt = okW ? chalk.green(String(w)) : chalk.red.bold(String(w));
    const hTxt = okH ? chalk.green(String(h)) : chalk.red.bold(String(h));
    const lines = [
      "",
      "  " + chalk.bgRed.white.bold("  ⚠ TERMINAL TOO SMALL — render paused  "),
      "",
      "  " + chalk.bold("Current size:    ") + `${wTxt} × ${hTxt}`,
      "  " + chalk.bold("Minimum:         ") + chalk.cyan(`${MIN_RENDER_COLS}×${MIN_RENDER_ROWS}`),
      "  " + chalk.bold("Recommended:     ") + chalk.gray(`${REC_RENDER_COLS}×${REC_RENDER_ROWS}`),
      "",
      "  " + chalk.gray("Resize terminal to resume render. Game still running."),
      "  " + chalk.gray("q quit"),
    ];
    out.push(lines.join("\n"));
    out.push(RESET);
    process.stdout.write(out.join(""));
  }

  shutdown(): void {
    process.stdout.write(SHOW_CURSOR + RESET + "\n");
  }

  toggleInspect(): void {
    this.inspectMode = !this.inspectMode;
  }

  cycleInspect(agentCount: number): void {
    this.inspectIndex = (this.inspectIndex + 1) % Math.max(1, agentCount);
  }

  flash(msg: string, ticks: number, currentTick: number): void {
    this.flashMessage = msg;
    this.flashUntil = currentTick + ticks;
  }

  selectedIndex(agentCount: number): number {
    if (agentCount === 0) return 0;
    return this.inspectIndex % agentCount;
  }

  private detectRotations(game: Game): void {
    this.rotatedThisFrame.clear();
    for (const a of game.agents) {
      const prev = this.prevFacing.get(a.id);
      if (prev !== undefined && prev !== a.facing) {
        this.rotatedThisFrame.add(a.id);
      }
      this.prevFacing.set(a.id, a.facing);
    }
    const prevP = this.prevFacing.get(game.player.id);
    if (prevP !== undefined && prevP !== game.player.facing) {
      this.rotatedThisFrame.add(game.player.id);
    }
    this.prevFacing.set(game.player.id, game.player.facing);
  }

  render(game: Game, tickMs: number): void {
    this.detectRotations(game);

    const cols = process.stdout.columns ?? 120;
    const rows = process.stdout.rows ?? 30;

    if (cols < MIN_RENDER_COLS || rows < MIN_RENDER_ROWS) {
      this.renderSizeGate(cols, rows);
      return;
    }

    const eventHeaderRow = rows - VIEW_EVENTS_FROM_BOTTOM;
    const sepRow = eventHeaderRow;
    const mapBottom = Math.min(VIEW_MAP_TOP + game.world.height + 1, sepRow - 1);
    const footerRow = rows;

    const out: string[] = [];

    out.push(goto(VIEW_HEADER_ROW, 1) + RESET + this.header(game, tickMs) + CLEAR_EOL);
    const alerts = game.agents.filter((a) => a.needsInput || a.errorState);
    if (alerts.length > 0) {
      const blink = Math.floor(Date.now() / 500) % 2 === 0;
      const errorAg = alerts.find((a) => a.errorState);
      const a = errorAg ?? alerts[0];
      const tag = a.errorState ? "🔴 ERROR" : "🚨 INPUT NEEDED";
      const total = alerts.length > 1 ? ` (+${alerts.length - 1} more)` : "";
      const msg = ` ${tag} — ${a.name} (PID ${a.linkedPid ?? "—"})${total}`;
      const styled = blink
        ? chalk.bgRed.white.bold(msg)
        : chalk.bgYellow.black.bold(msg);
      out.push(goto(VIEW_HEADER_ROW + 1, 1) + styled + RESET + CLEAR_EOL);
    } else {
      out.push(goto(VIEW_HEADER_ROW + 1, 1) + CLEAR_EOL);
    }

    const mapLines = this.renderMapBordered(game);
    for (let i = 0; i < mapLines.length; i++) {
      const r = VIEW_MAP_TOP + i;
      if (r > mapBottom) break;
      const raw = mapLines[i];
      out.push(goto(r, 1) + raw + RESET + CLEAR_EOL);
    }

    const legendStartRow = VIEW_MAP_TOP + game.world.height + 2;
    const statusBadges = this.statusBadgesLine(game);
    const itemsLine = this.compactItemsLine(game);
    if (legendStartRow < sepRow) {
      out.push(goto(legendStartRow, 1) + " " + statusBadges + RESET + CLEAR_EOL);
    }
    if (legendStartRow + 1 < sepRow) {
      out.push(goto(legendStartRow + 1, 1) + " " + itemsLine + RESET + CLEAR_EOL);
    }
    for (let r = legendStartRow + 2; r < sepRow; r++) {
      out.push(goto(r, 1) + CLEAR_EOL);
    }

    const dashLines = this.renderDashboard(game);
    const dashHeight = sepRow - VIEW_MAP_TOP;
    for (let i = 0; i < dashHeight; i++) {
      const r = VIEW_MAP_TOP + i;
      const line = dashLines[i] ?? "";
      out.push(
        goto(r, viewDashCol(game.world.width)) + padRight(line, DASH_WIDTH) + RESET + CLEAR_EOL
      );
    }

    const sepLen = Math.max(40, Math.min(cols, 240));
    out.push(
      goto(sepRow, 1) + chalk.cyanBright("─".repeat(sepLen)) + RESET + CLEAR_EOL
    );

    const eventCount = 5;
    const innerWidth = Math.min(cols - 4, 200);
    const tabsLine = this.renderEventTabs(this.eventFilter);
    const top =
      chalk.cyanBright("╔═ ") + tabsLine + chalk.cyanBright(
        " " + "═".repeat(Math.max(0, innerWidth - stripAnsiLen(tabsLine) - 5)) + "╗"
      );
    const bot = chalk.cyanBright("╚" + "═".repeat(innerWidth) + "╝");
    out.push(goto(eventHeaderRow, 1) + top + RESET + CLEAR_EOL);

    const filtered = this.filterEvents(game.events, this.eventFilter);
    const pinned = filtered.filter((e) => e.pinned);
    const nonPinned = filtered.filter((e) => !e.pinned);
    const realAgent = nonPinned
      .filter((e) => e.pid !== null)
      .slice(-eventCount)
      .reverse();
    const mapEvents = nonPinned
      .filter((e) => e.pid === null)
      .slice(-eventCount)
      .reverse();
    const normal = [...realAgent, ...mapEvents];
    const slots = [...pinned.slice(0, 2), ...normal];
    for (let i = 0; i < eventCount; i++) {
      const r = eventHeaderRow + 1 + i;
      const ev = slots[i];
      let lineContent: string;
      if (!ev) {
        lineContent = chalk.gray("  ...");
      } else {
        lineContent = this.renderEventLine(ev, game, innerWidth - 4);
      }
      const padded = padRight(lineContent, innerWidth - 2);
      out.push(
        goto(r, 1) +
          chalk.cyanBright("║ ") +
          padded +
          chalk.cyanBright(" ║") +
          RESET +
          CLEAR_EOL
      );
    }
    out.push(goto(eventHeaderRow + eventCount + 1, 1) + bot + RESET + CLEAR_EOL);

    out.push(goto(footerRow, 1) + this.footer() + CLEAR_EOL);

    const drawTrail = (
      pos: { x: number; y: number },
      dir: Direction,
      age: number
    ) => {
      const dx = dir === "left" ? 1 : dir === "right" ? -1 : 0;
      const dy = dir === "up" ? 1 : dir === "down" ? -1 : 0;
      const px = pos.x + dx;
      const py = pos.y + dy;
      if (px <= 0 || py <= 0 || px >= game.world.width - 1 || py >= game.world.height - 1) return;
      const r = VIEW_MAP_TOP + py + 1;
      const c = 2 + px * TILE_CELL_WIDTH;
      if (r > mapBottom) return;
      const inSafe = game.world.isInSafeZone(px, py);
      let style: (s: string) => string;
      if (inSafe) style = age === 0 ? chalk.bgGreen.black.bold : chalk.greenBright;
      else style = age === 0 ? chalk.cyanBright.bold : chalk.gray;
      out.push(goto(r, c) + style(DIR_ARROW[dir] + " ") + RESET);
    };
    if (game.weather === "rain") {
      const drops = Math.floor(game.world.width * game.world.height * 0.025);
      const phase = Math.floor(game.tick / 3);
      for (let i = 0; i < drops; i++) {
        const seed = (phase * 137 + i * 31) % 9973;
        const x = seed % game.world.width;
        const y = Math.floor(seed / game.world.width) % game.world.height;
        if (!game.isRevealed(x, y)) continue;
        if (game.entitiesAt(x, y).length > 0) continue;
        const r = VIEW_MAP_TOP + y + 1;
        const c = 2 + x * TILE_CELL_WIDTH;
        if (r > mapBottom) continue;
        out.push(goto(r, c) + chalk.cyan("' ") + RESET);
      }
    }
    if (game.nightMode) {
      const stars = 8;
      for (let i = 0; i < stars; i++) {
        const seed = (Math.floor(game.tick / 5) * 53 + i * 17) % 8191;
        const x = seed % game.world.width;
        const y = Math.floor(seed / game.world.width) % game.world.height;
        if (!game.isRevealed(x, y)) continue;
        if (game.entitiesAt(x, y).length > 0) continue;
        const r = VIEW_MAP_TOP + y + 1;
        const c = 2 + x * TILE_CELL_WIDTH;
        if (r > mapBottom) continue;
        out.push(goto(r, c) + chalk.bold.yellow("· ") + RESET);
      }
    }

    const playerAge = game.tick - game.player.lastMoveTick;
    if (!game.observerMode && playerAge >= 0 && playerAge <= 1) {
      drawTrail(game.player.pos, game.player.facing, playerAge);
    }
    for (const ag of game.agents) {
      const a = game.tick - ag.lastMoveTick;
      if (a >= 0 && a <= 1) drawTrail(ag.pos, ag.facing, a);
    }

    for (const ag of game.agents) {
      let badge: string | null = null;
      let bgStyle: ((s: string) => string) | null = null;
      if (ag.errorState) {
        badge = "🔴";
        bgStyle = chalk.bgRed.white.bold;
      } else if (ag.needsInput) {
        badge = "⚠ ";
        bgStyle = (Math.floor(game.tick / 2) % 2 === 0
          ? chalk.bgYellow.black.bold
          : chalk.yellow.bold) as (s: string) => string;
      }
      if (badge && bgStyle) {
        const r = VIEW_MAP_TOP + ag.pos.y;
        const c = 2 + ag.pos.x * TILE_CELL_WIDTH;
        if (ag.pos.y > 0 && r > VIEW_MAP_TOP) {
          out.push(goto(r, c) + bgStyle(badge) + RESET);
        }
      }
    }

    if (!game.observerMode && game.player.turboActive) {
      const r = VIEW_MAP_TOP + game.player.pos.y;
      const c = 2 + game.player.pos.x * TILE_CELL_WIDTH;
      if (game.player.pos.y > 0 && r > VIEW_MAP_TOP) {
        const blink = Math.floor(game.tick / 2) % 2 === 0;
        const style = blink ? chalk.bgGreenBright.black.bold : chalk.greenBright.bold;
        out.push(goto(r, c) + style("⚡ ") + RESET);
      }
    }

    for (const ft of game.activeFloatingTexts()) {
      const r = VIEW_MAP_TOP + ft.pos.y - 1 - (ft.offsetY ?? 0);
      const c = 2 + ft.pos.x * TILE_CELL_WIDTH;
      if (r < eventHeaderRow && r >= VIEW_MAP_TOP) {
        const styler = floatStyler(ft.color, this.colorBlind);
        out.push(goto(r, c) + styler(ft.text) + RESET);
      }
    }


    const boss = game.bugs.find((b) => b.bossLevel >= 10 && b.hp > 0);
    if (boss) {
      const len = Math.min(40, game.world.width * TILE_CELL_WIDTH - 14);
      const bossBar = bugHpMiniBar(boss.hp, boss.maxHp, len);
      const label = chalk.bgRed.white.bold(` 👹 ${boss.name} `);
      out.push(goto(VIEW_HEADER_ROW + 1, 1) + label + " " + bossBar + ` ${boss.hp}/${boss.maxHp}` + RESET + CLEAR_EOL);
    }

    for (const sub of game.subAgents) {
      if (sub.state === "done") continue;
      if (!game.world.inBounds(sub.pos.x, sub.pos.y)) continue;
      if (game.entitiesAt(sub.pos.x, sub.pos.y).length > 0) continue;
      const r = VIEW_MAP_TOP + sub.pos.y + 1;
      const c = 2 + sub.pos.x * TILE_CELL_WIDTH;
      if (r > mapBottom) continue;
      const ic = sub.taskIcon();
      const wrapped = sub.state === "working" ? chalk.bgCyan(ic) : chalk.cyan(ic);
      out.push(goto(r, c) + wrapped + RESET);
    }

    if (!game.monitor.isConnected()) {
      const blink = Math.floor(Date.now() / 500) % 2 === 0;
      const banner = "SYSTEM SUSPENDED — Awaiting Claude Heartbeat...";
      const styled = blink
        ? chalk.bgYellow.black.bold(` ${banner} `)
        : chalk.yellow.bold(` ${banner} `);
      const overlayRow = Math.floor(
        (VIEW_MAP_TOP + Math.min(VIEW_MAP_TOP + VIEW_MAP_HEIGHT - 1, sepRow - 1)) /
          2
      );
      const innerCols = game.world.width * TILE_CELL_WIDTH;
      const startCol = Math.max(2, Math.floor((innerCols - banner.length) / 2));
      out.push(goto(overlayRow, startCol) + styled + RESET);
    }

    if (game.tick <= this.flashUntil && this.flashMessage) {
      out.push(
        goto(footerRow - 1, 1) +
          chalk.bgBlue.white.bold(` ${this.flashMessage} `) +
          RESET +
          CLEAR_EOL
      );
    }

    if (game.won) {
      out.push(
        goto(VIEW_HEADER_ROW, 1) +
          chalk.bgGreen.black.bold(
            `  🏆 VICTORY!  Round ${game.totalRounds}/${game.totalRounds} · ${game.player.kills} kills · LV ${game.player.level} · restart 5s  `
          ) +
          RESET +
          CLEAR_EOL
      );
    }

    if (this.settingsOpen) {
      const ovRow = VIEW_MAP_TOP + 4;
      const ovCol = 8;
      const items = this.settingsItems(game);
      const w = 44;
      const top = chalk.bgCyan.black("┌" + "─".repeat(w - 2) + "┐");
      const bot = chalk.bgCyan.black("└" + "─".repeat(w - 2) + "┘");
      const titleRaw = " ⚙ SETTINGS — ↑/↓ navigate, ↵ toggle, m close ";
      const titleLine = chalk.bgCyan.black.bold("│" + titleRaw.padEnd(w - 2) + "│");
      out.push(goto(ovRow, ovCol) + top + RESET);
      out.push(goto(ovRow + 1, ovCol) + titleLine + RESET);
      out.push(goto(ovRow + 2, ovCol) + chalk.bgCyan.black("│" + " ".repeat(w - 2) + "│") + RESET);
      items.forEach((it, i) => {
        const cursor = i === this.settingsCursor ? "▶ " : "  ";
        const label = `  ${cursor}${it}`.padEnd(w - 2);
        const styled = i === this.settingsCursor
          ? chalk.bgWhite.black.bold("│" + label + "│")
          : chalk.bgCyan.black("│" + label + "│");
        out.push(goto(ovRow + 3 + i, ovCol) + styled + RESET);
      });
      out.push(goto(ovRow + 3 + items.length, ovCol) + chalk.bgCyan.black("│" + " ".repeat(w - 2) + "│") + RESET);
      out.push(goto(ovRow + 4 + items.length, ovCol) + bot + RESET);
    }

    if (game.crashed) {
      const elapsed = Math.floor((Date.now() - game.crashedAt) / 1000);
      const remaining = Math.max(0, 3 - elapsed);
      out.push(
        goto(VIEW_HEADER_ROW, 1) +
          chalk.bgRed.white.bold(
            `  💥 SYSTEM CRASH — Claude-Prime terminated. Rebooting in ${remaining}s...  `
          ) +
          RESET +
          CLEAR_EOL
      );
    }

    if (game.connectionLost && !game.crashed) {
      out.push(
        goto(VIEW_HEADER_ROW, 1) +
          chalk.bgRed.white.bold(
            "  ⚠ CONNECTION LOST — Claude process terminated. Agent offline.  "
          ) +
          RESET +
          CLEAR_EOL
      );
    }

    out.push(goto(footerRow, 1));
    process.stdout.write("\x1b[H" + out.join(""));
  }

  private renderEventTabs(active: string): string {
    const tabs: Array<[string, string]> = [
      ["all",    "[1]ALL"      ],
      ["agents", "[2]🤖agents" ],
      ["tools",  "[3]✏️tools"  ],
      ["combat", "[4]⚔combat" ],
      ["system", "[5]📋system" ],
    ];
    return tabs
      .map(([key, lbl]) =>
        key === active ? chalk.bgCyan.black.bold(` ${lbl} `) : chalk.gray(` ${lbl} `)
      )
      .join("");
  }

  private filterEvents(
    events: import("../core/game").EventEntry[],
    filter: string
  ): import("../core/game").EventEntry[] {
    if (filter === "all") return events;
    if (filter === "agents")
      return events.filter(
        (e) => (e.severity === "agent" || e.pid !== null) && e.source !== "mcp"
      );
    if (filter === "tools") return events.filter((e) => e.source === "mcp");
    if (filter === "combat") return events.filter((e) => e.severity === "combat");
    if (filter === "system") return events.filter(
      (e) => e.severity === "system" || e.severity === "info" || e.severity === "error" || e.severity === "warn"
    );
    return events;
  }

  private pidColorChalk(pid: number | null): (s: string) => string {
    return pidColor(pid);
  }

  private renderEventLine(
    ev: import("../core/game").EventEntry,
    game: Game,
    maxWidth: number
  ): string {
    const sevColor = (() => {
      switch (ev.severity) {
        case "error":
          return chalk.redBright;
        case "warn":
          return chalk.yellow;
        case "combat":
          return chalk.red;
        case "agent":
          return ev.pid !== null ? this.pidColorChalk(ev.pid) : chalk.cyan;
        case "info":
          return chalk.greenBright;
        default:
          return chalk.gray;
      }
    })();
    const borderBar = ev.pinned ? chalk.redBright("📌") : sevColor("▌");
    const ageMs = Date.now() - ev.ts;
    const ageSec = Math.floor(ageMs / 1000);
    const ageStr =
      ageMs < 1000 ? "now" : ageSec < 60 ? `${ageSec}s` : `${Math.floor(ageSec / 60)}m`;
    const time = chalk.gray(ageStr.padStart(3));
    const countTag = ev.count > 1 ? chalk.yellowBright(` ×${ev.count}`) : "";
    let avatarPart = "";
    let nameLabel = "";
    let cleanText = ev.text;
    if (ev.pid !== null) {
      const ag = game.agents.find((a) => a.linkedPid === ev.pid);
      if (ag) {
        avatarPart = iconCell(ag.characterClass, game.theme);
        nameLabel = this.pidColorChalk(ev.pid)(`[${ag.name}]`);
        const re = new RegExp(`Claude-${ev.pid}\\s*[:]?\\s*|PID:${ev.pid}\\s*[:]?\\s*`, "g");
        cleanText = ev.text.replace(re, "").trim();
        if (!cleanText) cleanText = ev.text;
      } else {
        nameLabel = this.pidColorChalk(ev.pid)(`[Agent]`);
      }
    } else if (ev.text.includes("[PLAYER]")) {
      avatarPart = iconCell(game.player.characterClass, game.theme);
      nameLabel = chalk.bold.yellowBright(`[${game.player.name}]`);
      cleanText = ev.text.replace(">> [PLAYER]", "").replace("[PLAYER]", "").trim();
    }
    const textStyle: (s: string) => string =
      ev.severity === "error"
        ? (s: string) => chalk.bold(sevColor(s))
        : sevColor;
    const avatarPrefix = avatarPart ? `${avatarPart}` : "";
    const namePart = nameLabel ? `${nameLabel} ` : "";
    const prefixLen =
      stripAnsiLen(`${borderBar} ${ageStr} ${avatarPrefix}${namePart}`) + 1;
    const budget = Math.max(20, maxWidth - prefixLen);
    const truncated = trunc(cleanText, budget);
    return `${borderBar} ${time} ${avatarPrefix}${namePart}${textStyle(truncated)}${countTag}`;
  }

  private enrichEventWithAvatar(formatted: string, game: Game): string {
    const stripped = stripAnsi(formatted);
    if (stripped.includes("[PLAYER]")) {
      const ic = iconCell(game.player.characterClass, game.theme);
      return `${ic} ${formatted}`;
    }
    const claudeMatch = stripped.match(/Claude-(\d+)/);
    if (claudeMatch) {
      const pid = Number(claudeMatch[1]);
      const ag = game.agents.find((a) => a.linkedPid === pid);
      if (ag) {
        const ic = iconCell(ag.characterClass, game.theme);
        return `${ic} ${formatted}`;
      }
    }
    if (stripped.includes("ROUND")) return `⚔ ${formatted}`;
    if (stripped.includes("BOSS")) return `👹 ${formatted}`;
    if (stripped.includes("MCP")) return `📡 ${formatted}`;
    return formatted;
  }

  private formatEvent(e: string, game: Game, maxCols: number): string {
    const prefix = chalk.gray(`[SYSTEM@${game.identity.hostname}]`);
    const visiblePrefixLen = `[SYSTEM@${game.identity.hostname}] `.length;
    const budget = Math.max(20, maxCols - visiblePrefixLen - 2);
    const isDestroyed = e.includes("destroyed") || e.includes("destruyó");
    const effectiveBudget = isDestroyed ? Math.floor(budget / 2) : budget;
    const content = trunc(e, effectiveBudget);
    const colored = e.includes("CONFLICTO")
      ? chalk.redBright.bold(content)
      : e.includes("VICTORY")
      ? chalk.greenBright.bold(content)
      : e.includes("HANDSHAKE")
      ? chalk.greenBright(content)
      : e.includes(">> [PLAYER]") || e.includes("★ PLAYER")
      ? chalk.bold.yellowBright(content)
      : e.includes("decayed") || e.includes("🍂")
      ? chalk.dim.gray(content)
      : chalk.gray(content);
    return `${prefix} ${colored}`;
  }

  private header(game: Game, tickMs: number): string {
    const procState = game.monitor.state();
    if (procState === "DISCONNECTED" || game.engineOffline) {
      const blink = Math.floor(Date.now() / 500) % 2 === 0;
      const banner = "!!! ENGINE OFFLINE !!!";
      const flashing = blink
        ? chalk.bgRed.white.bold(` ${banner} `)
        : chalk.redBright.bold(` ${banner} `);
      const lastPid = game.lastSeenPidLabel();
      return `${flashing}   ${chalk.gray(`last PID: ${lastPid}`)}   tick ${game.tick}   ${tickMs}ms`;
    }
    if (procState === "IDLE" && game.monitor.isConnected()) {
      const banner = "⏸ SYSTEM IDLE — Claude awaiting input";
      const lbl = chalk.bgYellow.black.bold(` ${banner} `);
      return `${lbl}   tick ${game.tick}   ${tickMs}ms`;
    }
    const status = game.paused
      ? chalk.yellow("⏸ PAUSED")
      : game.won
      ? chalk.bgGreen.black.bold(" WON ")
      : chalk.green("▶ RUNNING");
    const remaining = game.bugs.filter((b) => b.hp > 0).length;
    const roundLbl = chalk.bgMagenta.white.bold(
      ` ROUND ${game.currentRound}/${game.totalRounds} `
    );
    let phase = "";
    if (game.roundState === "spawning") phase = chalk.cyan(" ⏳ spawning");
    else if (game.roundState === "fighting") phase = chalk.red(" ⚔ fight");
    else if (game.roundState === "between") {
      const left = Math.max(0, game.roundBetweenUntil - game.tick);
      phase = chalk.yellow(` ⏸ next in ${Math.ceil(left / 3.3)}s`);
    }
    const title = game.theme.mode === "adventure" ? "🌲 Agent Adventure" : "🤖 Agents vs Bugs";
    return `${chalk.bold.white(title)}   ${status}   ${roundLbl}${phase}   bugs ${chalk.red(String(remaining))}   t${game.tick}`;
  }

  private footer(): string {
    return (
      chalk.gray(" ↑↓←→ move ") +
      chalk.bold.greenBright("[Space/Enter] Attack") +
      chalk.gray(" | ") +
      chalk.cyanBright("r=respawn n=new [1-5]=filter") +
      chalk.gray(" | m=settings q=quit")
    );
  }

  private compactItemsLine(game: Game): string {
    const t = game.theme;
    const food = t.mode === "bugs" ? "🔋" : "🥩";
    const w1 = t.mode === "bugs" ? "📦" : "⚔️";
    const w2 = t.mode === "bugs" ? "🔨" : "🗡️";
    const sep = chalk.cyanBright(" │ ");
    return (
      chalk.cyanBright("📖 ") +
      [
        `${food} ${chalk.gray("hung")}`,
        `❤️  ${chalk.gray("+10")}`,
        `${w1} ${chalk.gray("+1")}`,
        `${w2} ${chalk.gray("+2")}`,
        `🕳️  ${chalk.gray("-3")}`,
        chalk.greenBright("+") + chalk.gray(" safe"),
      ].join(sep)
    );
  }

  private statusBadgesLine(game: Game): string {
    const day = game.nightMode
      ? chalk.bgBlue.white.bold(" 🌙 NIGHT ")
      : chalk.bgYellow.black(" ☀ DAY ");
    const wx =
      game.weather === "rain"
        ? chalk.bgBlue.white(" 🌧 RAIN ")
        : game.weather === "fog"
        ? chalk.bgGray.white(" 🌫 FOG ")
        : chalk.bgGreen.black(" ☁ CLEAR ");
    const parts: string[] = [day, wx];
    if (game.escalation > 0) parts.push(chalk.bgRed.white.bold(` 🔥L${game.escalation} `));
    if (game.player.isBerserker(game.tick)) parts.push(chalk.bgRed.white.bold(" 🩸BERS "));
    if (game.pacifist) parts.push(chalk.bgGreen.black.bold(" ☮PAC "));
    if (!game.fogEnabled) parts.push(chalk.bgWhite.black(" 👁ALL "));
    const compass = this.compassHint(game);
    if (compass) parts.push(compass);
    return parts.join(" ");
  }

  private legendVertical(game: Game): string[] {
    const t = game.theme;
    const lines: string[] = [];
    const food = t.mode === "bugs" ? "🔋" : "🥩";
    const w1 = t.mode === "bugs" ? "📦" : "⚔️";
    const w2 = t.mode === "bugs" ? "🔨" : "🗡️";
    const day = game.nightMode
      ? chalk.bgBlue.white.bold(" 🌙 NIGHT ")
      : chalk.bgYellow.black(" ☀ DAY  ");
    const wx =
      game.weather === "rain"
        ? chalk.bgBlue.white(" 🌧 RAIN ")
        : game.weather === "fog"
        ? chalk.bgGray.white(" 🌫 FOG  ")
        : chalk.bgGreen.black(" ☁ CLEAR");
    lines.push(`${day} ${wx}`);
    const flags: string[] = [];
    if (game.escalation > 0) flags.push(chalk.bgRed.white.bold(` 🔥L${game.escalation} `));
    if (game.player.isBerserker(game.tick)) flags.push(chalk.bgRed.white.bold(" 🩸BERS "));
    if (game.pacifist) flags.push(chalk.bgGreen.black.bold(" ☮PAC "));
    if (!game.fogEnabled) flags.push(chalk.bgWhite.black(" 👁ALL "));
    if (flags.length > 0) lines.push(flags.join(" "));
    const compass = this.compassHint(game);
    if (compass) lines.push(` ${compass}`);
    lines.push(`${food}  ${chalk.gray("hunger refill")}`);
    lines.push(`❤️  ${chalk.gray("+10 HP")}`);
    lines.push(`${w1}  ${chalk.gray("+1 ATK weapon")}`);
    lines.push(`${w2}  ${chalk.gray("+2 ATK rare")}`);
    lines.push(`🕳️  ${chalk.gray("-3 HP trap")}`);
    lines.push(`${chalk.greenBright("+")}   ${chalk.gray("Safe zone heal")}`);
    return lines;
  }

  private legendLines(game: Game): [string, string] {
    const t = game.theme;
    const compass = this.compassHint(game);
    const dayLabel = game.nightMode ? chalk.bgBlue.white.bold(" 🌙 ") : chalk.bgYellow.black(" ☀ ");
    const wxLabel =
      game.weather === "rain"
        ? chalk.bgBlue.white(" 🌧 ")
        : game.weather === "fog"
        ? chalk.bgGray.white(" 🌫 ")
        : chalk.bgGreen.black(" ☁ ");
    const escLabel = game.escalation > 0 ? chalk.bgRed.white.bold(` 🔥L${game.escalation} `) : "";
    const berserkLabel = game.player.isBerserker(game.tick) ? chalk.bgRed.white.bold(" 🩸BERS ") : "";
    const pacifistLabel = game.pacifist ? chalk.bgGreen.black.bold(" ☮PAC ") : "";
    const fogLabel = !game.fogEnabled ? chalk.bgWhite.black(" 👁ALL ") : "";
    const sep = chalk.gray(" · ");
    const safe = chalk.greenBright("+") + chalk.gray("Safe");
    const trap = chalk.gray("🕳️-3");
    const heart = chalk.gray("❤️+10");
    const statusLine = ` ${dayLabel}${wxLabel}${escLabel}${berserkLabel}${pacifistLabel}${fogLabel} ${compass}`;
    let itemsLine: string;
    if (t.mode === "bugs") {
      itemsLine = ` ${chalk.gray("🔋+hung")}${sep}${heart}${sep}${chalk.gray("📦+1ATK")}${sep}${chalk.gray("🔨+2ATK")}${sep}${trap}${sep}${safe}`;
    } else {
      itemsLine = ` ${chalk.gray("🥩+hung")}${sep}${heart}${sep}${chalk.gray("⚔️+1ATK")}${sep}${chalk.gray("🗡️+2ATK")}${sep}${trap}${sep}${safe}`;
    }
    return [statusLine, itemsLine];
  }

  private compassHint(game: Game): string {
    if (game.observerMode) return "";
    const px = game.player.pos.x;
    const py = game.player.pos.y;
    const targets: Array<{ x: number; y: number; tag: string }> = [];
    for (let y = 0; y < game.world.height; y++) {
      for (let x = 0; x < game.world.width; x++) {
        const t = game.world.tiles[y][x];
        if (t === "H") targets.push({ x, y, tag: "❤️" });
        else if (t === "M" || t === "E") targets.push({ x, y, tag: t === "M" ? "🥩" : "🔋" });
      }
    }
    for (const w of game.weapons) targets.push({ x: w.pos.x, y: w.pos.y, tag: "⚔" });
    if (targets.length === 0) return chalk.gray("[ no items ]");
    let best = targets[0];
    let bestD = Math.abs(best.x - px) + Math.abs(best.y - py);
    for (const t of targets) {
      const d = Math.abs(t.x - px) + Math.abs(t.y - py);
      if (d < bestD) {
        best = t;
        bestD = d;
      }
    }
    const dx = best.x - px;
    const dy = best.y - py;
    const arrow = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "→" : "←") : dy > 0 ? "↓" : "↑";
    return chalk.cyanBright(`[ ${best.tag} ${arrow} ${bestD} ]`);
  }

  private renderMapBordered(game: Game): string[] {
    const w = game.world.width;
    const h = game.world.height;
    const inner = w * TILE_CELL_WIDTH;
    const frozen = game.isFrozen();
    const night = game.nightMode;
    const border = frozen
      ? chalk.dim.cyanBright
      : night
      ? chalk.blueBright
      : chalk.cyanBright;
    const horiz = night ? "═" : "─";
    const top = border((night ? "╔" : "┌") + horiz.repeat(inner) + (night ? "╗" : "┐"));
    const bot = border((night ? "╚" : "└") + horiz.repeat(inner) + (night ? "╝" : "┘"));
    const sideChar = night ? "║" : "│";
    const selected = game.agents[this.selectedIndex(game.agents.length)];
    const lines: string[] = [top];
    const rightCol = 2 + inner;
    for (let y = 0; y < h; y++) {
      const cells: string[] = [];
      for (let x = 0; x < w; x++) {
        const col = 2 + x * TILE_CELL_WIDTH;
        let cellContent = this.cell(game, x, y, selected);
        if (frozen) cellContent = chalk.dim.gray(stripAnsi(cellContent));
        else if (game.weather === "fog") cellContent = chalk.dim.gray(cellContent);
        else if (night) cellContent = chalk.dim(cellContent);
        cells.push(`\x1b[${col}G` + cellContent);
      }
      lines.push(`${border(sideChar)}${cells.join("")}${RESET}\x1b[${rightCol}G${border(sideChar)}`);
    }
    lines.push(bot);
    return lines;
  }

  private groundTile(): string {
    return "  ";
  }

  private cell(
    game: Game,
    x: number,
    y: number,
    selected: Agent | undefined
  ): string {
    const ents = game.entitiesAt(x, y);

    let player: Player | undefined;
    let agent: Agent | undefined;
    let npc: NPC | undefined;
    let marker: QuestMarker | undefined;
    let bug: EnemyBug | undefined;
    let fairy: Fairy | undefined;
    let weapon: Weapon | undefined;
    for (const e of ents) {
      if (e instanceof Player) player = e;
      else if (e instanceof Agent) agent = e;
      else if (e instanceof NPC) npc = e;
      else if (e instanceof QuestMarker) marker = e;
      else if (e instanceof EnemyBug) bug = e;
      else if (e instanceof Fairy) fairy = e;
      else if (e instanceof Weapon) weapon = e;
    }

    if (!game.isRevealed(x, y) && !agent && !fairy) {
      return chalk.bgBlack.gray("░░");
    }

    if (player) {
      if (game.observerMode) return this.groundTile();
      if (player.hp <= 0) return chalk.bgGray.dim("💀") + RESET;
      const icon = iconCell(player.characterClass, game.theme);
      const justMoved = game.tick - player.lastMoveTick <= 1;
      let wrapped: string;
      if (game.tick < player.damageFlashUntil) wrapped = chalk.bgRed.bold(icon);
      else if (game.tick < player.pickupFlashUntil) wrapped = chalk.bgWhite.black.bold(icon);
      else if (justMoved) wrapped = chalk.bgCyan.bold(icon);
      else wrapped = chalk.bgYellowBright.black.bold(icon);
      return wrapped + RESET;
    }
    if (agent) {
      const isSel = selected && agent.id === selected.id;
      const st = agent.state();
      const sleeping = st === "sleep";
      const zombie = st === "zombie";
      const proc =
        agent.linkedPid !== null
          ? game.monitor.getByPid(agent.linkedPid)
          : null;
      const busy = proc ? proc.cpu > 1.0 : false;
      const aura = pidColor(agent.linkedPid);
      const justMoved = game.tick - agent.lastMoveTick <= 1;
      const hasWorkingSubs = game.subAgents.some(
        (s) => s.parentAgentId === agent.id && s.state === "working"
      );
      const subPulseOn = hasWorkingSubs && Math.floor(game.tick / 4) % 2 === 0;
      const flying =
        canBypass(agent.characterClass) &&
        !game.world.isWalkable(agent.pos.x, agent.pos.y);
      const flyPulseOn = flying && Math.floor(game.tick / 2) % 2 === 0;
      let icon: string;
      if (agent.hp <= 0 && agent.deadSinceTick >= 0) icon = "💀";
      else if (game.engineOffline) icon = "⚠️ ";
      else if (zombie) icon = "💤";
      else icon = iconCell(agent.characterClass, game.theme);
      let colored: string;
      if (agent.hp <= 0 && agent.deadSinceTick >= 0) colored = chalk.bgGray.dim(icon);
      else if (game.engineOffline) colored = chalk.bgRed.white(icon);
      else if (zombie) colored = chalk.bgRed.dim(icon);
      else if (game.tick < agent.damageFlashUntil) colored = chalk.bgRed.bold(icon);
      else if (game.tick < agent.pickupFlashUntil) colored = chalk.bgWhite.black.bold(icon);
      else if (justMoved) colored = chalk.bgCyan.bold(icon);
      else if (subPulseOn) colored = chalk.bgCyanBright.bold(icon);
      else if (flying) colored = (flyPulseOn ? chalk.bgBlueBright : chalk.bgBlue).bold(icon);
      else if (sleeping) colored = chalk.dim(icon);
      else if (busy) colored = chalk.bgMagenta(aura(icon));
      else colored = aura(icon);
      const wrapped = isSel && game.tick >= agent.damageFlashUntil ? chalk.bgWhite(colored) : colored;
      return wrapped + RESET;
    }
    if (bug) {
      const damaged = game.tick - bug.lastDamageTick <= 1;
      const isBoss = bug.bossLevel >= 10;
      const baseIc = bug.iconOverride
        ? bug.iconOverride
        : isBoss
        ? bossIcon(bug.level, game)
        : bugIcon(bug.level, game);
      let icon: string;
      if (damaged) icon = chalk.bgRed.bold(baseIc);
      else if (isBoss) icon = chalk.bgRed(baseIc);
      else icon = baseIc;
      return icon + RESET;
    }
    if (fairy) {
      const damaged = game.tick - fairy.lastDamageTick <= 1;
      const healing = game.tick - fairy.lastHealTick <= 1;
      const baseIcon = game.theme.mode === "bugs" ? "🛠️ " : "🧚";
      let ic: string;
      if (damaged) ic = chalk.bgRed(baseIcon);
      else if (healing) ic = chalk.bgGreen.bold(baseIcon);
      else ic = baseIcon;
      return ic + RESET;
    }
    if (weapon) return weaponIcon(weapon.bonus, game.theme.mode) + RESET;
    if (npc) return game.theme.npcIcon;
    if (marker) {
      const q = game.board.findById(marker.questId);
      return this.markerTile(q);
    }

    const t = game.world.tiles[y][x];
    if (t === "#") return game.theme.treeVariants[game.world.treeVariantAt(x, y)];
    if (t === "~") return game.theme.rockTile;
    if (t === "%") return game.theme.woodTile;
    if (t === "M") return game.theme.mode === "bugs" ? "🔋" : TILE_MEAT;
    if (t === "B") return game.theme.brickTile;
    if (t === "+") return chalk.greenBright(TILE_CURE) + RESET;
    if (t === "E") return game.theme.mode === "bugs" ? "🔋" : "🥩";
    if (t === "H") return "❤️ ";
    if (t === "T") return "🕳️ ";
    if (t === "$") return TILE_GOLD;
    return this.groundTile();
  }

  private markerTile(q: Quest | undefined): string {
    if (!q) return TILE_CHEST;
    if (q.kind === "collect") return TILE_HERB;
    if (q.kind === "visit") return TILE_DOOR;
    return TILE_CHEST;
  }

  private questTargetIcon(q: Quest): string {
    if (q.kind === "collect") return TILE_HERB;
    if (q.kind === "visit") return ICON_NPC;
    if (q.kind === "patrol") return TILE_DOOR;
    return TILE_CHEST;
  }

  private describeAction(game: Game, a: Agent): string {
    const st = a.state();
    const quest = a.questId ? game.board.findById(a.questId) : null;
    let raw: string;
    if (st === "fighting") raw = "⚔ engaging 🐛";
    else if (quest) {
      const icon = this.questTargetIcon(quest);
      const coord = `(${quest.target.x},${quest.target.y})`;
      if (st === "moving") {
        const verb =
          quest.kind === "collect"
            ? "collect"
            : quest.kind === "visit"
            ? "talk to"
            : "patrol";
        raw = `→ ${verb} ${icon} ${coord}`;
      } else if (st === "working") raw = `collecting ${icon} ${coord}`;
      else if (st === "talking") raw = `talking to ${icon} ${coord}`;
      else raw = `at ${icon} ${coord}`;
    } else if (st === "moving") raw = "→ priority target";
    else if (st === "exploring") raw = "→ exploring";
    else raw = "idle";
    return trunc(raw, ACTION_MAX);
  }

  private themeHudLine(game: Game): string {
    const hud = game.theme.hud;
    if (game.theme.mode === "adventure") {
      const elapsed = Math.floor((Date.now() - game.player.lastFedAt) / 1000);
      const hunger = Math.max(0, 120 - elapsed);
      const hungerColor =
        hunger < 30 ? chalk.bgRed.white.bold : hunger < 60 ? chalk.yellowBright : chalk.greenBright;
      const blink = hunger < 30 && game.tick % 2 === 0;
      const hungerStr = blink ? ` HUNGRY ${hunger}s ` : ` ${hunger}/120s `;
      const safe = game.world.isInSafeZone(game.player.pos.x, game.player.pos.y)
        ? chalk.bgGreen.black.bold(" SAFE ")
        : "";
      return `${hud.primaryIcon}${chalk.gray(hud.primaryLabel.padEnd(7))} ${hungerColor(hungerStr)}  ${safe}`;
    }
    const battery = String(game.player.batteries).padEnd(4);
    const heat = game.monitor.current ? Math.round(game.monitor.current.cpu) : 0;
    const heatColor = heat > 60 ? chalk.redBright : heat > 25 ? chalk.yellowBright : chalk.greenBright;
    const heatStr = `${heat}%`.padEnd(5);
    return `${hud.primaryIcon}${chalk.gray(hud.primaryLabel.padEnd(8))} ${chalk.cyanBright(battery)}  ${hud.secondaryIcon}${chalk.gray(hud.secondaryLabel.padEnd(9))} ${heatColor(heatStr)}`;
  }

  private classInventoryLine(game: Game): string {
    const p = game.player;
    const fed = p.isFedRecently()
      ? chalk.green("✓fed")
      : chalk.gray("hungry");
    const wood = `${game.theme.woodTile}${p.wood}`;
    if (game.theme.mode === "bugs") {
      return `${wood} 🔋${p.batteries} ⚡${p.energy} ${fed}`;
    }
    return `${wood} 🥩${p.meat} ${fed}`;
  }

  private compactStateBadge(
    a: import("../core/agent").Agent,
    proc: { cpu: number } | null
  ): string {
    const st = a.state();
    if (st === "zombie") return chalk.bgRed.white(" ZOMB ");
    if (!proc) return chalk.bgGray.white(" SLEEP ");
    if (proc.cpu > 1.0) return chalk.bgGreen.black(" ACT  ");
    return chalk.bgYellow.black(" IDLE ");
  }

  private dashHeader(label: string): string {
    const inner = ` ${label} `;
    const dashCount = Math.max(2, DASH_WIDTH - inner.length - 4);
    return chalk.bold.cyanBright(`┤${inner}├${"─".repeat(dashCount)}`);
  }

  private doubleHeader(title: string, color: (s: string) => string = chalk.cyanBright): string {
    const inner = ` ${title} `;
    const dashes = Math.max(2, DASH_WIDTH - inner.length - 4);
    return color(`╔═[`) + chalk.bold.whiteBright(inner) + color(`]${"═".repeat(dashes)}╗`);
  }

  private doubleFooter(color: (s: string) => string = chalk.cyanBright): string {
    return color(`╚${"═".repeat(DASH_WIDTH - 2)}╝`);
  }

  private sectionHeader(title: string, color: (s: string) => string = chalk.cyanBright): string {
    const inner = ` ${title} `;
    const dashes = Math.max(2, DASH_WIDTH - inner.length - 4);
    return color(`┌─[`) + chalk.bold.whiteBright(inner) + color(`]${"─".repeat(dashes)}┐`);
  }

  private sectionFooter(color: (s: string) => string = chalk.cyanBright): string {
    return color(`└${"─".repeat(DASH_WIDTH - 2)}┘`);
  }

  private boxSection(title: string, contentLines: string[]): string[] {
    const innerWidth = DASH_WIDTH - 2;
    const titleStr = ` ${title} `;
    const titleVis = titleStr.length;
    const remaining = Math.max(0, innerWidth - titleVis - 1);
    const out: string[] = [];
    out.push(
      chalk.cyan("┌─") +
        chalk.bold.whiteBright(titleStr) +
        chalk.cyan("─".repeat(remaining) + "┐")
    );
    for (const line of contentLines) {
      const padded = padRight(line, innerWidth);
      out.push(chalk.cyan("│") + padded + chalk.cyan("│"));
    }
    out.push(chalk.cyan("└" + "─".repeat(innerWidth) + "┘"));
    return out;
  }

  private sessionCard(
    game: Game,
    idx: number,
    sel: number,
    topPid: number | null
  ): string[] {
    const a = game.agents[idx];
    const proc = a.linkedPid !== null ? game.monitor.getByPid(a.linkedPid) : null;
    const aura = pidColor(a.linkedPid);
    /* pid label removed for cleaner UI */
    const isTop = topPid !== null && a.linkedPid === topPid;
    const marker = idx === sel ? chalk.whiteBright("›") : " ";
    const pidStateLabel =
      proc && a.linkedPid !== null ? game.monitor.pidState(a.linkedPid) : null;
    const isActive = pidStateLabel === "ACTIVE";
    const isIdle = pidStateLabel === "IDLE" || pidStateLabel === "STANDBY";
    const isZombie = a.state() === "zombie";
    const stateBadge = isActive
      ? chalk.bgGreen.black(" ⚡ACT ")
      : pidStateLabel === "STANDBY"
      ? chalk.bgYellow.black(" ⚡STB ")
      : pidStateLabel === "IDLE"
      ? chalk.bgYellow.black(" 💤IDL ")
      : isZombie
      ? chalk.bgRed.white(" 💀ZMB ")
      : chalk.bgGray.white(" 💤SLP ");
    const innerW = SESSION_CARD_W - 2;
    const nameStr = `[${a.name}]`;
    const hpPct = Math.round((a.hp / a.maxHp) * 100);
    const hpBarRaw = hpBar(a.hp, a.maxHp, 6);
    const hpBarStyled = isIdle ? chalk.dim(hpBarRaw) : hpBarRaw;
    const cpu = proc ? `${proc.cpu.toFixed(0)}%` : "—";
    const topMark = isTop ? chalk.yellowBright(" ★") : "";

    // Top border with state badge + avatar + name + PID inlined
    const headerInner = ` ${stateBadge} ${iconCell(a.characterClass, game.theme)}${chalk.bold.whiteBright(nameStr)}${topMark} `;
    const headerVis = stripAnsiLen(headerInner);
    const dashCount = Math.max(2, innerW - headerVis - 2);
    const topLine =
      aura(`${marker}╭─[`) + headerInner + aura(`]${"─".repeat(dashCount)}╮`);

    // Line 2: HP bar + ATQ + kills + CPU
    const statsRaw = ` ${chalk.gray("HP")} ${hpBarStyled} ${chalk.cyanBright(`${hpPct}%`)} ${chalk.gray("AT")} ${chalk.redBright(String(a.atq))} ${chalk.gray("K")} ${chalk.yellowBright(String(a.kills))} ${chalk.gray("CPU")} ${chalk.greenBright(cpu)}`;
    const lineStats = padRight(strictTrunc(statsRaw, innerW), innerW);

    // Line 3: thought
    const recent = a.thoughtStream.slice(-1);
    const mcpFresh = game.mcpFresh(5000);
    const thoughtRaw =
      recent.length > 0
        ? recent[0].text
        : mcpFresh
        ? a.reasoning || "(idle)"
        : "[SEARCHING SIGNAL...]";
    const thoughtLine = ` 🧠 ${strictTrunc(thoughtRaw, innerW - 5)}`;
    const lineThink = padRight(thoughtLine, innerW);

    // Line 4: timeline + sub-agents inline
    const subs = game.subAgents.filter(
      (s) => s.parentAgentId === a.id && s.state !== "done"
    );
    const subPart = subs.length === 0 ? "" : ` 🧬${subs.length}`;
    const recentActions = a.actionHistory.slice(-5).reverse();
    const timelinePart =
      recentActions.length > 0
        ? recentActions.map((x) => `${x.icon}${x.label.slice(0, 5)}`).join(" ")
        : chalk.gray("no actions yet");
    const timelineRaw = ` ⏱ ${timelinePart}${subPart}`;
    const lineTimeline = padRight(strictTrunc(timelineRaw, innerW), innerW);

    const bar = aura("│");
    const bot = aura("╰" + "─".repeat(innerW) + "╯");
    return [
      topLine,
      `${bar}${lineStats}${bar}`,
      `${bar}${lineThink}${bar}`,
      `${bar}${lineTimeline}${bar}`,
      bot,
    ];
  }

  private renderDashboard(game: Game): string[] {
    const lines: string[] = [];
    const sel = this.selectedIndex(game.agents.length);

    const proc = game.monitor.current;
    const procState = game.monitor.state();
    const totalProcs = game.monitor.processes.length;
    const activeCount = game.monitor.processes.filter(
      (p) => game.monitor.pidState(p.pid) === "ACTIVE"
    ).length;
    const stateBadge =
      procState === "ACTIVE"
        ? chalk.bgGreen.black.bold(" ⚡ ACTIVE ")
        : procState === "STANDBY"
        ? chalk.bgYellow.black(" ⚡ STANDBY ")
        : procState === "IDLE"
        ? chalk.bgYellow.black(" 💤 IDLE ")
        : chalk.bgGray.white(" — DISCONN ");
    const cpuStr = proc ? `${proc.cpu.toFixed(0)}%` : "—";
    const mcpOk = game.mcpConnected && game.mcpFresh(5000);
    const mcpDot = mcpOk
      ? chalk.greenBright("●")
      : game.mcpConnected
      ? chalk.yellowBright("●")
      : chalk.gray("●");
    const syncFresh = game.bridge && game.bridge.isFresh(60000);
    const syncDot = syncFresh ? chalk.greenBright("●") : chalk.gray("●");
    const tokenDot = game.handshakeVerified ? chalk.greenBright("●") : chalk.yellow("●");

    lines.push(this.sectionHeader("Engine Status", chalk.greenBright));
    lines.push(
      ` ${stateBadge} ${chalk.gray("CPU")} ${chalk.greenBright(cpuStr.padStart(4))}  ${chalk.gray("Procs")} ${chalk.cyanBright(`${activeCount}/${totalProcs}`)}`
    );
    lines.push(
      ` ${tokenDot} ${chalk.gray("Token")}   ${mcpDot} ${chalk.gray("MCP")}   ${syncDot} ${chalk.gray("Sync")}${game.bridge ? chalk.gray(` #${game.bridge.syncCount}`) : ""}`
    );
    lines.push(this.sectionFooter(chalk.greenBright));

    if (game.observerMode) {
      lines.push("");
      lines.push(
        chalk.bgMagenta.white.bold(" OBSERVER MODE — Player hidden ")
      );
      lines.push(chalk.gray(" Camera follows top-CPU agent"));
    } else {
    lines.push("");
    lines.push(this.sectionHeader("Player", chalk.yellowBright));
    const pFace = chalk.greenBright(DIR_ARROW[game.player.facing]);
    const pIcon = iconCell(game.player.characterClass, game.theme);
    const cls = classLabel(game.player.characterClass, game.theme);
    lines.push(
      ` ${chalk.bgGreen(pIcon)}${pFace} ${chalk.bold.white(trunc(game.player.name, 12))} ${chalk.gray("[" + cls + "]")}`
    );
    const xpNeed = 20 * game.player.level;
    const lvStr = chalk.bold.yellowBright(`L${game.player.level}`);
    const xpStr = chalk.cyanBright(`${game.player.xp}/${xpNeed}`);
    const killStr = chalk.redBright(`${game.player.kills}k`);
    lines.push(
      ` ${lvStr} ${chalk.gray("xp")} ${xpStr} ${chalk.gray("·")} ${killStr}`
    );
    lines.push(
      ` ${chalk.gray("HP")} ${hpBar(game.player.hp, game.player.maxHp, 8)} ${game.player.hp}/${game.player.maxHp}`
    );
    lines.push(
      ` ${chalk.gray("AT")} ${atqBar(game.player.atq, 20, 8)} ${game.player.atq}  ${chalk.gray("DF")} ${chalk.cyanBright(String(game.player.def))}  ${chalk.gray("SP")} ${chalk.greenBright(String(game.player.spd))}`
    );
    lines.push(` ${chalk.gray(`(${game.player.pos.x},${game.player.pos.y})`)} ${this.themeHudLine(game)}`);
    lines.push(this.sectionFooter(chalk.yellowBright));

    } // end !observerMode

    lines.push("");
    lines.push(this.sectionHeader(`Session Cluster (${game.agents.length})`, chalk.cyanBright));
    if (game.agents.length === 0) {
      lines.push(chalk.gray("   (no claude processes detected)"));
    } else {
      const topPid = game.monitor.topByCpu()?.pid ?? null;
      for (let i = 0; i < game.agents.length; i++) {
        const card = this.sessionCard(game, i, sel, topPid);
        for (const ln of card) lines.push(ln);
      }
    }
    lines.push(this.sectionFooter(chalk.cyanBright));

    if (game.agents.length > 0 && !game.observerMode) {
      lines.push("");
      lines.push(this.sectionHeader("Leaderboard", chalk.magentaBright));
      const ranked = [...game.agents].sort((a, b) => b.kills - a.kills).slice(0, 8);
      const playerRank = `   ${chalk.bold.yellowBright("👤 YOU")}  ${chalk.gray("kills")} ${chalk.redBright(String(game.player.kills))}  ${chalk.gray("LV")} ${chalk.cyanBright(String(game.player.level))}`;
      lines.push(playerRank);
      for (let i = 0; i < ranked.length; i++) {
        const a = ranked[i];
        const icon = iconCell(a.characterClass, game.theme);
        const cls = classLabel(a.characterClass, game.theme);
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
        const pidStr = a.linkedPid !== null ? `pid${a.linkedPid}` : "—";
        const subCount = game.subAgents.filter(
          (s) => s.parentAgentId === a.id && s.state !== "done"
        ).length;
        const subBadge = subCount > 0 ? chalk.cyanBright(` 🧬${subCount}`) : "";
        lines.push(
          `   ${medal} ${icon} ${chalk.gray(cls.padEnd(7))} ${chalk.gray(pidStr.padEnd(8))} ${chalk.redBright(`${a.kills}k`)}${subBadge}`
        );
      }
      lines.push(this.sectionFooter(chalk.magentaBright));
    }

    if (this.inspectMode && game.agents.length > 0) {
      const a = game.agents[sel];
      lines.push("");
      lines.push(chalk.bold.white(`Inspect ${trunc(a.name, 20)}`));
      lines.push(` role ${a.role}  state ${chalk.cyanBright(a.state())}`);
      const pidStr = a.linkedPid !== null ? String(a.linkedPid) : "—";
      const pidState = a.linkedPid !== null ? game.monitor.pidState(a.linkedPid) : "n/a";
      lines.push(` pid ${chalk.gray(pidStr)}  pidState ${chalk.yellow(pidState)}`);
      const mcpStr = game.mcpConnected ? (game.mcpFresh(5000) ? "fresh" : "stale") : "off";
      lines.push(` mcp ${chalk.gray(mcpStr)}  lastAct ${chalk.gray(trunc(game.lastMcpAction || "-", 24))}`);
      lines.push(` ${chalk.gray("why:")} ${chalk.white(trunc(a.reasoning || "-", REASON_MAX))}`);
      if (a.log.length > 0) {
        lines.push(chalk.gray(" recent:"));
        for (const l of a.log) {
          lines.push(chalk.gray(`  • ${trunc(l, REASON_MAX)}`));
        }
      }
    }

    return lines;
  }

  private questLine(game: Game, q: Quest, active: boolean): string {
    const owner = q.assignedAgent
      ? game.agents.find((x) => x.id === q.assignedAgent)?.name ?? "?"
      : null;
    const titleRaw = trunc(q.title, 16);
    const title = active ? chalk.yellow(titleRaw) : chalk.cyan(titleRaw);
    const star = q.requiresPlayer ? chalk.greenBright("★") : " ";
    const tgt = chalk.greenBright(`(${q.target.x},${q.target.y})`);
    const meta = active
      ? chalk.gray(`→ ${trunc(owner ?? "-", 12)}`)
      : chalk.gray(q.kind);
    return ` ${star}${title} ${tgt} ${meta}`;
  }

}
