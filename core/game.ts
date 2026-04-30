import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Agent } from "./agent";
import {
  NPC,
  QuestMarker,
  Entity,
  EnemyBug,
  Fairy,
  Weapon,
  SubAgent,
  SubAgentTask,
  SubAgentState,
} from "./entity";
import { QuestBoard, makeQuest } from "./quest";
import { World } from "./world";
import { Player } from "./player";
import { Direction, manhattan } from "./direction";
import { Brain, makeBrain, Operator } from "./brain";
import {
  SystemIdentity,
  getSystemIdentity,
  getSystemStats,
  generateHandshakeToken,
} from "./identity";
import { Bridge, BridgePayload } from "./bridge";
import { ProcessMonitor, ProcessState } from "./process_monitor";
import { playNeedsInput, setAudioTheme } from "./audio";
import {
  CharacterClass,
  CLASS_SPECS,
  randomClass,
  canBypass,
  canEat,
  dietRefusal,
} from "./avatars";
import { GameMode, Theme, themeFor, themedLabel } from "./themes";
import { Position, Quest, TileType } from "./types";

export type EventSeverity =
  | "error"
  | "warn"
  | "info"
  | "combat"
  | "agent"
  | "system"
  | "debug";

export type EventSource = "game" | "mcp";

export interface EventEntry {
  text: string;
  tick: number;
  ts: number;
  severity: EventSeverity;
  pid: number | null;
  count: number;
  pinned: boolean;
  source: EventSource;
}

export type FloatColor =
  | "red"
  | "green"
  | "cyan"
  | "yellow"
  | "magenta"
  | "white"
  | "orange";

export interface GameOptions {
  width?: number;
  height?: number;
  winTarget?: number;
  brain?: Brain;
  bridge?: Bridge;
  playerClass?: CharacterClass;
  observerMode?: boolean;
  mode?: GameMode;
  pacifist?: boolean;
}

export interface InteractionResult {
  message: string;
}

const BUG_SPAWN_BASE = 35;
const WEAPON_SPAWN_INTERVAL = 20;
const MAX_WEAPONS = 6;
const FAIRY_HEAL_INTERVAL = 5;
const FAIRY_HEAL_RANGE = 3;
const FAIRY_HEAL_AMOUNT = 2;
const AUTO_DEPLOY_COST = 5;
const CRASH_RESET_MS = 3000;
const GOLD_DROP_VALUE = 3;

function tileLabel(t: string): string {
  if (t === "M") return "🥩";
  if (t === "E") return "🔋";
  if (t === "H") return "❤️";
  return t;
}

const BUG_NAMES = [
  "TimeoutError",
  "404_NotFound",
  "NullPointerException",
  "RaceCondition",
  "MemoryLeak",
  "StackOverflow",
  "TypeError",
  "DeadlockBug",
  "OffByOneError",
  "InfiniteLoop",
  "UnhandledRejection",
  "SegFault",
];

export class Game {
  world: World;
  board: QuestBoard;
  agents: Agent[];
  npcs: NPC[];
  markers: QuestMarker[];
  bugs: EnemyBug[];
  fairies: Fairy[];
  weapons: Weapon[];
  subAgents: SubAgent[];
  private subAgentSeq: number;
  player: Player;
  tick: number;
  paused: boolean;
  winTarget: number;
  events: EventEntry[];
  won: boolean;
  interactionCooldown: number;
  brain: Brain;
  bridge: Bridge | null;
  monitor: ProcessMonitor;
  connectionLost: boolean;
  engineOffline: boolean;
  floatingTexts: Array<{ text: string; pos: Position; expiresAt: number; bornAt: number; color?: FloatColor }>;
  mcpConnected: boolean;
  mcpLastUpdateAt: number;
  lastMcpAction: string;
  private writingTickStreak: number;
  private lastBuffSnapshot: boolean;
  private lastEngineOnline: boolean;
  private lastSeenPid: number | null;
  private lastMonitorState: string;
  private prevPidStates: Map<number, ProcessState>;
  bugsKilled: number;
  playerDeadAt: number;
  nextBossTick: number;
  nightMode: boolean;
  currentRound: number;
  totalRounds: number;
  roundEnemiesSpawned: number;
  roundEnemiesNeeded: number;
  roundBossSpawned: boolean;
  roundBossNeeded: boolean;
  roundState: "spawning" | "fighting" | "between";
  roundBetweenUntil: number;
  bossCooldownUntil: number;
  roundFightStartTick: number;
  agentDeathTicks: number[];
  deescalateUntil: number;
  weather: "clear" | "rain" | "fog";
  escalation: number;
  fogEnabled: boolean;
  revealed: Set<string>;
  fairyCooldownUntil: number;
  fairyDespawnAt: number;
  private despawnedPids: Set<number>;
  private killTicks: number[];
  private atqRegenTimer: number;
  private hungerDrainTimer: number;
  private idleSinceMs: number;
  private replayLogPath: string;
  private savePath: string;
  identity: SystemIdentity;
  expectedToken: string;
  handshakeVerified: boolean;
  lastExternalCommand: string | null;
  playerClass: CharacterClass;
  observerMode: boolean;
  pacifist: boolean;
  pacifistTickStart: number;
  mode: GameMode;
  theme: Theme;
  crashed: boolean;
  crashedAt: number;
  fairyOffline: boolean;
  private bugTimer: number;
  private weaponTimer: number;
  private bugSeq: number;
  private weaponSeq: number;
  private bugNameSeq: number;

  constructor(opts: GameOptions = {}) {
    const w = opts.width ?? 24;
    const h = opts.height ?? 20;
    this.world = new World(w, h, opts.mode ?? "bugs");
    this.board = new QuestBoard();
    this.agents = [];
    this.npcs = [];
    this.markers = [];
    this.bugs = [];
    this.fairies = [];
    this.weapons = [];
    this.subAgents = [];
    this.subAgentSeq = 0;
    this.tick = 0;
    this.paused = false;
    this.winTarget = opts.winTarget ?? 10;
    this.events = [];
    this.won = false;
    this.interactionCooldown = 0;
    this.brain = opts.brain ?? makeBrain();
    this.bridge = opts.bridge ?? null;
    this.monitor = new ProcessMonitor(["claude"]);
    this.connectionLost = false;
    this.engineOffline = true;
    this.floatingTexts = [];
    this.mcpConnected = false;
    this.mcpLastUpdateAt = 0;
    this.lastMcpAction = "";
    this.writingTickStreak = 0;
    this.lastBuffSnapshot = false;
    this.lastEngineOnline = false;
    this.lastSeenPid = null;
    this.lastMonitorState = "IDLE";
    this.prevPidStates = new Map();
    this.bugsKilled = 0;
    this.playerDeadAt = 0;
    this.nextBossTick = 600;
    this.nightMode = false;
    this.totalRounds = 5;
    this.currentRound = 1;
    this.roundEnemiesSpawned = 0;
    this.roundEnemiesNeeded = 5;
    this.roundBossSpawned = false;
    this.roundBossNeeded = false;
    this.roundState = "spawning";
    this.roundBetweenUntil = 0;
    this.bossCooldownUntil = 0;
    this.roundFightStartTick = 0;
    this.agentDeathTicks = [];
    this.deescalateUntil = 0;
    this.weather = "clear";
    this.escalation = 0;
    this.fogEnabled = true;
    this.revealed = new Set();
    this.fairyCooldownUntil = 0;
    this.fairyDespawnAt = 0;
    this.despawnedPids = new Set();
    this.killTicks = [];
    this.atqRegenTimer = 0;
    this.hungerDrainTimer = 0;
    this.idleSinceMs = 0;
    this.replayLogPath = path.join(os.homedir(), ".agent_rpg_replay.log");
    this.savePath = path.join(os.homedir(), ".agent_rpg_save.json");
    this.identity = getSystemIdentity();
    this.expectedToken = generateHandshakeToken();
    this.handshakeVerified = false;
    this.lastExternalCommand = null;
    this.playerClass = opts.playerClass ?? "tech";
    this.observerMode = opts.observerMode ?? false;
    this.pacifist = opts.pacifist ?? false;
    this.pacifistTickStart = 0;
    this.mode = opts.mode ?? "bugs";
    this.theme = themeFor(this.mode);
    setAudioTheme(this.mode);
    this.crashed = false;
    this.crashedAt = 0;
    this.fairyOffline = false;
    this.bugTimer = 0;
    this.weaponTimer = 0;
    this.bugSeq = 0;
    this.weaponSeq = 0;
    this.bugNameSeq = 0;

    const playerPos = this.world.randomWalkable();
    this.player = new Player(
      "p1",
      playerPos,
      this.identity.displayName,
      this.playerClass
    );
    this.world.clearArea(playerPos, 1);

    this.bootstrap();
    this.maybeAutoHandshake();

    if (this.bridge) {
      this.bridge.on((payload) => this.applyBridgePayload(payload));
    }
  }

  private applyBridgePayload(payload: BridgePayload): void {
    if (
      payload.mcp === true &&
      (payload as { type?: string }).type === "update_agent_status"
    ) {
      this.applyMcpUpdate(
        payload as unknown as {
          pid: number;
          action: string;
          metadata: string;
          health_delta: number;
        }
      );
      return;
    }
    if (
      payload.mcp === true &&
      (payload as { type?: string }).type === "agent_command"
    ) {
      this.applyMcpCommand(
        payload as unknown as {
          pid: number;
          command: "attack" | "collect" | "heal_player" | "guard";
          note: string;
        }
      );
      return;
    }
    if (
      payload.mcp === true &&
      (payload as { type?: string }).type === "update_subagent"
    ) {
      this.applySubAgentUpdate(
        payload as unknown as {
          parent_pid: number;
          task: SubAgentTask;
          status: SubAgentState;
          note: string;
          result_icon: string;
        }
      );
      return;
    }
    const prime = this.agents[0];
    if (!prime) return;
    const hpBoost = payload.power_up?.hp ?? 20;
    const atqBoost = payload.power_up?.atq ?? 5;
    prime.hp = Math.min(prime.maxHp, prime.hp + hpBoost);
    prime.atq += atqBoost;
    this.handshakeVerified = true;
    for (const a of this.agents) a.handshakeVerified = true;
    this.pushEvent(
      `⚡ Bridge sync — ${prime.name} +${hpBoost}HP +${atqBoost}ATQ`
    );
    if (payload.power_up?.note) {
      this.pushEvent(`bridge note: ${payload.power_up.note}`);
    } else if (payload.message) {
      this.pushEvent(`bridge: ${String(payload.message).slice(0, 60)}`);
    }
  }

  applyMcpUpdate(u: {
    pid: number;
    action: string;
    metadata: string;
    health_delta: number;
  }): void {
    const wasConnected = this.mcpConnected;
    this.mcpConnected = true;
    this.mcpLastUpdateAt = Date.now();
    this.lastMcpAction = u.action;
    this.handshakeVerified = true;
    if (!wasConnected) {
      this.pushEvent(
        `${this.helperIcon()} Receiving direct Claude telemetry... (MCP PROTOCOL)`
      );
    }
    const agent = this.agents.find((a) => a.linkedPid === u.pid);
    if (!agent) {
      this.pushEvent(`📡 MCP ${u.action} — no agent linked yet`, null, {
        source: "mcp",
      });
      return;
    }
    agent.reasoning = `[MCP/${u.action}] ${u.metadata}`;
    agent.handshakeVerified = true;
    if (u.health_delta > 0) {
      agent.healBy(u.health_delta);
    } else if (u.health_delta < 0) {
      agent.takeDamage(-u.health_delta, this.tick);
    }
    const actLower = u.action.toLowerCase();
    const isError = actLower.includes("error") || u.health_delta < 0;
    const isBash = /bash|terminal|shell|cmd|run/i.test(u.action + u.metadata);
    agent.errorState = isError;
    agent.bashActive = isBash;
    agent.needsInput = false;
    const icon = isError ? "🔴" : isBash ? "🖥️" : this.actionIcon(u.action);
    agent.pushAction(this.tick, icon, u.action);
    const sym = isError ? "⚠️" : "✨";
    this.pushFloatingText(`${sym} ${u.action}`, agent.pos, 800);
    const desc = this.describeAction(u.action, u.metadata);
    this.pushEvent(`${agent.name} ${icon} ${desc}`, u.pid, { source: "mcp" });
  }

  private describeAction(action: string, metadata: string): string {
    const a = action.toLowerCase();
    const meta = (metadata || "").trim();
    if (!meta) return action;
    if (/^edit$|^multiedit$|^write$/.test(a)) {
      return `editing ${this.shortPath(meta)}`;
    }
    if (/^read$|^view$/.test(a)) {
      return `reading ${this.shortPath(meta)}`;
    }
    if (/^grep$|search/.test(a)) {
      return `searching '${meta.slice(0, 40)}'`;
    }
    if (/^glob$/.test(a)) {
      return `globbing ${meta.slice(0, 50)}`;
    }
    if (/^bash$|terminal|shell/.test(a)) {
      return `bash ${meta.slice(0, 60)}`;
    }
    if (/^task$/.test(a)) {
      return `dispatching task: ${meta.slice(0, 50)}`;
    }
    if (/test/.test(a)) {
      return `testing ${this.shortPath(meta)}`;
    }
    if (/build|compile/.test(a)) {
      return `building ${this.shortPath(meta)}`;
    }
    return `${action}: ${meta.slice(0, 60)}`;
  }

  private shortPath(p: string): string {
    if (!p) return "";
    const parts = p.split("/").filter(Boolean);
    if (parts.length <= 2) return p;
    const file = parts[parts.length - 1];
    const parent = parts[parts.length - 2];
    return `…/${parent}/${file}`;
  }

  private actionIcon(action: string): string {
    const a = action.toLowerCase();
    if (/edit|write/.test(a)) return "✏️";
    if (/read|view/.test(a)) return "👀";
    if (/grep|search|find/.test(a)) return "🔍";
    if (/test/.test(a)) return "✅";
    if (/build|compile/.test(a)) return "🔨";
    if (/git|commit/.test(a)) return "📝";
    if (/bash|run|shell/.test(a)) return "🖥️";
    if (/agent|task/.test(a)) return "🧬";
    return "⚙";
  }

  helperIcon(): string {
    return this.mode === "bugs" ? "🛠️" : "🧚";
  }

  applySubAgentUpdate(u: {
    parent_pid: number;
    task: SubAgentTask;
    status: SubAgentState;
    note: string;
    result_icon: string;
  }): void {
    this.mcpConnected = true;
    this.mcpLastUpdateAt = Date.now();
    const parent = this.agents.find((a) => a.linkedPid === u.parent_pid);
    if (!parent) {
      this.pushEvent(`📡 subagent no parent — drop`);
      return;
    }
    let sub = this.subAgents.find(
      (s) => s.parentAgentId === parent.id && s.task === u.task && s.state !== "done"
    );
    if (!sub) {
      this.subAgentSeq += 1;
      sub = new SubAgent(
        `sub${this.subAgentSeq}`,
        parent.id,
        parent.linkedPid,
        u.task,
        { x: parent.pos.x, y: parent.pos.y },
        this.tick
      );
      this.subAgents.push(sub);
      this.pushEvent(`✨ sub-agent ${sub.taskIcon()} ${u.task} spawned by ${parent.name}`);
    }
    sub.state = u.status;
    sub.note = u.note ?? "";
    if (u.result_icon) sub.resultIcon = u.result_icon;
    if (u.status === "done") {
      sub.doneTick = this.tick;
      this.pushEvent(`${sub.resultIcon || "✓"} ${parent.name} sub-agent ${u.task} done — ${sub.note.slice(0, 30)}`);
      this.pushFloatingText(`${sub.resultIcon || "✓"} ${u.task}`, parent.pos, 800, "cyan");
    }
  }

  spawnSubAgent(parentAgent: Agent, task: SubAgentTask): void {
    this.subAgentSeq += 1;
    const sub = new SubAgent(
      `sub${this.subAgentSeq}`,
      parentAgent.id,
      parentAgent.linkedPid,
      task,
      { x: parentAgent.pos.x, y: parentAgent.pos.y },
      this.tick
    );
    sub.state = "working";
    this.subAgents.push(sub);
    this.pushEvent(`✨ ${parentAgent.name} spawn sub-agent ${sub.taskIcon()} ${task}`);
  }

  private maybeSpawnFairy(): void {
    if (this.observerMode) return;
    if (this.fairies.length > 0) return;
    if (this.player.hp <= 0) return;
    if (Date.now() < this.fairyCooldownUntil) return;
    const hpPct = this.player.hp / this.player.maxHp;
    if (hpPct > 0.10) return;
    const pos = this.findNearWalkable(this.player.pos);
    this.fairies.push(new Fairy("f1", pos));
    this.fairyCooldownUntil = Date.now() + 5 * 60 * 1000;
    this.fairyDespawnAt = this.tick + 100;
    const label = this.mode === "bugs" ? "🛠️ HOTFIX DAEMON" : "🧚 FAIRY";
    this.pushEvent(`${label} spawned — emergency heal @ (${pos.x},${pos.y})`);
    this.pushFloatingText("HELP!", pos, 1500, "magenta");
  }

  private maybeDespawnFairy(): void {
    if (this.fairies.length === 0) return;
    if (this.tick < this.fairyDespawnAt) return;
    const hpPct = this.player.hp / this.player.maxHp;
    if (hpPct < 0.5) {
      this.fairyDespawnAt = this.tick + 30;
      return;
    }
    this.fairies = [];
    this.pushEvent(`${this.helperIcon()} despawned — player recovered`);
  }

  private updateSubAgents(): void {
    for (const sub of this.subAgents) {
      const parent = this.agents.find((a) => a.id === sub.parentAgentId);
      if (!parent || parent.hp <= 0 || parent.state() === "zombie") {
        sub.state = "done";
        sub.doneTick = this.tick;
        sub.resultIcon = "💀";
        continue;
      }
      const angle = (this.tick * 0.2 + sub.spawnTick * 0.7) % (Math.PI * 2);
      const r = 1.2;
      sub.pos = {
        x: Math.round(parent.pos.x + Math.cos(angle) * r),
        y: Math.round(parent.pos.y + Math.sin(angle) * r),
      };
      if (sub.state === "done" && sub.doneTick < 0) sub.doneTick = this.tick;
    }
    const validParentIds = new Set(this.agents.map((a) => a.id));
    this.subAgents = this.subAgents.filter((s) => {
      if (!validParentIds.has(s.parentAgentId)) return false;
      return s.state !== "done" || this.tick - s.doneTick < 6;
    });
  }

  applyMcpCommand(c: {
    pid: number;
    command: "attack" | "collect" | "heal_player" | "guard";
    note: string;
  }): void {
    this.mcpConnected = true;
    this.mcpLastUpdateAt = Date.now();
    const agent = this.agents.find((a) => a.linkedPid === c.pid);
    if (!agent) {
      this.pushEvent(`📡 cmd ${c.command} — no linked agent`);
      return;
    }
    if (c.command === "heal_player") {
      if (manhattan(agent.pos, this.player.pos) <= 1) {
        const healed = this.player.healBy(5);
        this.pushFloatingText(`+${healed} HP`, this.player.pos, 800, "green");
        this.pushEvent(`💚 ${agent.name} heals player +${healed} HP`);
      } else {
        this.pushEvent(`💚 ${agent.name} cmd heal_player — too far`);
      }
      return;
    }
    if (c.command === "attack") {
      const nearest = this.bugs
        .filter((b) => b.hp > 0)
        .sort((a, b) => manhattan(agent.pos, a.pos) - manhattan(agent.pos, b.pos))[0];
      if (nearest) {
        agent.currentDecision = {
          action: "ATTACK",
          target: nearest.pos,
          thought: `MCP order: attack ${nearest.name}`,
          tokensUsed: 0,
          source: "claude",
        };
        this.pushEvent(`⚔ ${agent.name} ordered to attack ${nearest.name}`);
      }
      return;
    }
    if (c.command === "collect") {
      const w = this.weapons[0];
      if (w) {
        agent.currentDecision = {
          action: "COLLECT",
          target: w.pos,
          thought: "MCP order: collect weapon",
          tokensUsed: 0,
          source: "claude",
        };
        this.pushEvent(`📦 ${agent.name} ordered to collect`);
      }
      return;
    }
    if (c.command === "guard") {
      agent.currentDecision = {
        action: "MOVE",
        target: this.player.pos,
        thought: "MCP order: guard player",
        tokensUsed: 0,
        source: "claude",
      };
      this.pushEvent(`🛡 ${agent.name} ordered to guard player`);
    }
  }

  mcpFresh(maxAgeMs: number = 5000): boolean {
    return (
      this.mcpConnected && Date.now() - this.mcpLastUpdateAt < maxAgeMs
    );
  }

  private operator(): Operator {
    return {
      username: this.identity.username,
      display_name: this.identity.displayName,
      hostname: this.identity.hostname,
    };
  }

  private maybeAutoHandshake(): void {
    const envToken = process.env.AGENT_HANDSHAKE_TOKEN;
    if (envToken) {
      this.receiveExternalCommand(`HANDSHAKE:${envToken}`);
      this.expectedToken = envToken;
      this.handshakeVerified = true;
      for (const a of this.agents) {
        a.handshakeVerified = true;
        a.verification_token = envToken;
      }
      return;
    }
    for (const a of this.agents) {
      a.verification_token = this.expectedToken;
    }
  }

  receiveExternalCommand(cmd: string): void {
    const ts = new Date().toISOString().slice(11, 19);
    this.lastExternalCommand = `[${ts}] ${cmd}`;
    for (const a of this.agents) a.lastExternalCommand = this.lastExternalCommand;
    const m = cmd.match(/^HANDSHAKE:(.+)$/);
    if (m && m[1].trim() === this.expectedToken) {
      this.handshakeVerified = true;
      for (const a of this.agents) a.handshakeVerified = true;
      this.pushEvent(`✅ HANDSHAKE verified — engine integrity OK`);
    } else if (cmd === "PING") {
      this.pushEvent(`📡 PING acknowledged`);
    } else if (m) {
      this.pushEvent(`⚠ HANDSHAKE token mismatch`);
    } else {
      this.pushEvent(`📡 external cmd: ${cmd.slice(0, 40)}`);
    }
  }

  lastSeenPidLabel(): string {
    return this.lastSeenPid !== null ? String(this.lastSeenPid) : "?";
  }

  triggerHandshake(): void {
    this.receiveExternalCommand(`HANDSHAKE:${this.expectedToken}`);
  }

  useAbility(): { used: boolean; message: string } {
    const cls = this.player.characterClass;
    const spec = CLASS_SPECS[cls];
    if (this.player.abilityCooldown > 0) {
      return {
        used: false,
        message: `${spec.abilityLabel} on cooldown ${this.player.abilityCooldown}t`,
      };
    }
    if (spec.ability === "remote_patch") {
      const target = this.findBugInRange(spec.range);
      if (!target) {
        return { used: false, message: "Remote Patch: no target in range" };
      }
      const dmg = this.player.atq + 5;
      target.takeDamage(dmg, this.tick);
      this.player.abilityCooldown = spec.cooldown;
      this.pushFloatingText(`⚡ -${dmg} PATCH`, target.pos, 1000, "magenta");
      this.pushFloatingText(`📡`, this.player.pos, 700, "magenta");
      this.pushEvent(`✨ Remote Patch hit ${target.name} (-${dmg})`);
      return { used: true, message: `Remote Patch → ${target.name}` };
    }
    if (spec.ability === "log_sniffer") {
      const found = this.scanResources(spec.range);
      this.player.abilityCooldown = spec.cooldown;
      for (const k of found) this.player.revealedResources.add(k);
      this.pushFloatingText(
        `🔍 SCAN r=${spec.range}`,
        this.player.pos,
        1200,
        "cyan"
      );
      const pingMax = Math.min(6, found.length);
      for (let i = 0; i < pingMax; i++) {
        const [sx, sy] = found[i].split(",").map(Number);
        this.pushFloatingText("·", { x: sx, y: sy }, 600, "cyan");
      }
      this.pushEvent(
        `🔍 Log Sniffer revealed ${found.length} resources (r=${spec.range})`
      );
      return {
        used: true,
        message: `Log Sniffer: ${found.length} resources mapped`,
      };
    }
    if (spec.ability === "turbo_deploy") {
      return {
        used: false,
        message: this.player.turboActive
          ? "Turbo-Deploy: passive ACTIVE (BUSY)"
          : "Turbo-Deploy passive — needs Claude BUSY",
      };
    }
    if (spec.ability === "bypass") {
      return { used: false, message: "Bypass: passive (walk through 🌲🪨)" };
    }
    return { used: false, message: "no ability" };
  }

  private findBugInRange(range: number): EnemyBug | null {
    let best: EnemyBug | null = null;
    let bestDist = Infinity;
    for (const bug of this.bugs) {
      if (bug.hp <= 0) continue;
      const d = manhattan(this.player.pos, bug.pos);
      if (d <= range && d < bestDist) {
        best = bug;
        bestDist = d;
      }
    }
    return best;
  }

  private scanResources(range: number): string[] {
    const out: string[] = [];
    const px = this.player.pos.x;
    const py = this.player.pos.y;
    for (let y = Math.max(0, py - range); y <= Math.min(this.world.height - 1, py + range); y++) {
      for (let x = Math.max(0, px - range); x <= Math.min(this.world.width - 1, px + range); x++) {
        if (Math.abs(x - px) + Math.abs(y - py) > range) continue;
        const t = this.world.tiles[y][x];
        if (t === "%" || t === "M") {
          out.push(`${x},${y}`);
        }
      }
    }
    return out;
  }

  reset(): void {
    this.world = new World(this.world.width, this.world.height, this.mode);
    this.board = new QuestBoard();
    this.agents = [];
    this.npcs = [];
    this.markers = [];
    this.bugs = [];
    this.fairies = [];
    this.weapons = [];
    this.subAgents = [];
    this.subAgentSeq = 0;
    this.tick = 0;
    this.events = [];
    this.won = false;
    this.crashed = false;
    this.crashedAt = 0;
    this.bugTimer = 0;
    this.weaponTimer = 0;
    this.bugSeq = 0;
    this.weaponSeq = 0;
    this.bugNameSeq = 0;
    const newPlayerPos = this.world.randomWalkable();
    this.player = new Player(
      "p1",
      newPlayerPos,
      this.identity.displayName,
      this.playerClass
    );
    this.world.clearArea(newPlayerPos, 1);
    this.fairyOffline = false;
    this.currentRound = 1;
    this.roundEnemiesSpawned = 0;
    this.roundBossSpawned = false;
    this.roundBossNeeded = false;
    this.roundState = "spawning";
    this.roundBetweenUntil = 0;
    this.bossCooldownUntil = 0;
    this.roundFightStartTick = 0;
    this.bugsKilled = 0;
    this.pacifistTickStart = 0;
    this.roundFightStartTick = 0;
    this.bossCooldownUntil = 0;
    this.escalation = 0;
    this.agentDeathTicks = [];
    this.deescalateUntil = 0;
    this.killTicks = [];
    this.bootstrap();
    this.maybeAutoHandshake();
    this.pushEvent(`SYSTEM REBOOT — fresh deploy for ${this.identity.displayName}`);
  }

  restart(): void {
    this.reset();
    this.pushEvent(`🔁 RESTART — Round 1 starting`);
  }

  private bootstrap(): void {
    /* initial weapon spawn removed — weapons drop only from bug deaths */
  }

  private findNpcSpawn(): Position {
    const safeCells: Position[] = [];
    for (const k of this.world.safeZone) {
      const [xs, ys] = k.split(",");
      safeCells.push({ x: parseInt(xs, 10), y: parseInt(ys, 10) });
    }
    for (const c of safeCells) {
      for (let r = 1; r < 4; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const nx = c.x + dx;
            const ny = c.y + dy;
            if (this.world.isInSafeZone(nx, ny)) continue;
            if (this.world.isWalkable(nx, ny)) return { x: nx, y: ny };
          }
        }
      }
    }
    return this.world.randomWalkable();
  }

  respawnPlayer(): void {
    if (this.observerMode) return;
    const cooldown = 60;
    const elapsed = this.tick - this.player.lastRespawnTick;
    if (elapsed < cooldown) {
      const remain = Math.ceil((cooldown - elapsed) / 3.3);
      this.pushEvent(`⏳ respawn cooldown — ${remain}s left`);
      this.pushFloatingText(`WAIT ${remain}s`, this.player.pos, 800, "red");
      return;
    }
    let pos: Position | null = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      const c = this.world.randomWalkable();
      if (this.world.isInSafeZone(c.x, c.y)) {
        pos = c;
        break;
      }
    }
    if (!pos) pos = this.world.randomWalkable();
    this.player.pos = pos;
    this.player.facing = "down";
    const hpLoss = Math.max(1, Math.floor(this.player.maxHp * 0.40));
    this.player.hp = Math.max(1, this.player.hp - hpLoss);
    this.player.atq = this.player.baseAtq;
    const xpLoss = Math.min(this.player.xp, 5);
    this.player.xp -= xpLoss;
    this.player.lastRespawnTick = this.tick;
    this.pushFloatingText(`-${hpLoss} HP`, pos, 800, "red");
    this.pushFloatingText(`-${xpLoss} XP`, pos, 800, "cyan");
    this.pushEvent(
      `🔄 RESPAWN @ (${pos.x},${pos.y}) — penalty -${hpLoss}HP -${xpLoss}XP, ATQ→${this.player.baseAtq}`
    );
  }

  private findNearWalkable(p: Position): Position {
    for (let r = 1; r < 6; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = p.x + dx;
          const ny = p.y + dy;
          if (this.world.isWalkable(nx, ny)) return { x: nx, y: ny };
        }
      }
    }
    return this.world.randomWalkable();
  }

  private seedQuests(npcPos: Position): void {
    const collect1 = this.world.randomWalkable();
    const collect2 = this.world.randomWalkable();
    const patrol = [
      this.world.randomWalkable(),
      this.world.randomWalkable(),
    ];

    const q1 = makeQuest(
      "Gather Wood",
      `harvest at (${collect1.x},${collect1.y})`,
      "collect",
      collect1,
      10
    );
    const q2 = makeQuest(
      "Gather Meat",
      `harvest at (${collect2.x},${collect2.y})`,
      "collect",
      collect2,
      15
    );
    const q3 = makeQuest(
      "Speak Elder",
      `visit (${npcPos.x},${npcPos.y})`,
      "visit",
      npcPos,
      8,
      undefined,
      true
    );
    const q4 = makeQuest("Patrol", "secure perimeter", "patrol", patrol[0], 20, patrol);

    this.board.add(q1);
    this.board.add(q2);
    this.board.add(q3);
    this.board.add(q4);

    this.markers.push(new QuestMarker("m1", collect1, q1.id));
    this.markers.push(new QuestMarker("m2", collect2, q2.id));
  }

  togglePause(): void {
    this.paused = !this.paused;
  }

  pushFloatingText(
    text: string,
    pos: Position,
    durationMs: number = 1000,
    color: FloatColor = "yellow"
  ): void {
    const now = Date.now();
    const recentSamePos = this.floatingTexts.filter(
      (f) =>
        f.pos.x === pos.x &&
        f.pos.y === pos.y &&
        now - f.bornAt < 400
    ).length;
    const offsetX = recentSamePos > 0 ? Math.min(2, recentSamePos) : 0;
    this.floatingTexts.push({
      text,
      pos: { x: pos.x + offsetX, y: pos.y },
      expiresAt: now + durationMs,
      bornAt: now,
      color,
    });
    if (this.floatingTexts.length > 10) this.floatingTexts.shift();
  }

  activeFloatingTexts(): Array<{ text: string; pos: Position; offsetY: number; color: FloatColor }> {
    const now = Date.now();
    this.floatingTexts = this.floatingTexts.filter((f) => f.expiresAt > now);
    return this.floatingTexts.map((f) => ({
      text: f.text,
      pos: f.pos,
      offsetY: Math.min(3, Math.floor((now - f.bornAt) / 600)),
      color: f.color ?? "yellow",
    }));
  }

  pushEvent(
    msg: string,
    pid?: number | null,
    opts?: { pinned?: boolean; source?: EventSource }
  ): void {
    const ts = Date.now();
    const last = this.events[this.events.length - 1];
    if (last && last.text === msg && ts - last.ts < 10000) {
      last.count += 1;
      last.tick = this.tick;
      last.ts = ts;
      return;
    }
    let resolvedPid: number | null = null;
    if (pid !== undefined && pid !== null) {
      resolvedPid = pid;
    } else {
      const pidMatch = msg.match(/Claude-(\d+)|PID:(\d+)/);
      if (pidMatch) {
        resolvedPid = Number(pidMatch[1] ?? pidMatch[2]);
      } else {
        for (const a of this.agents) {
          if (a.linkedPid === null) continue;
          if (msg.includes(a.name)) {
            resolvedPid = a.linkedPid;
            break;
          }
        }
      }
    }
    let severity = this.classifyEvent(msg);
    if (resolvedPid !== null && severity !== "error" && severity !== "warn") {
      severity = "agent";
    }
    const pinned = opts?.pinned === true || severity === "error";
    const source: EventSource = opts?.source ?? "game";
    const entry: EventEntry = {
      text: msg,
      tick: this.tick,
      ts,
      severity,
      pid: resolvedPid,
      count: 1,
      pinned,
      source,
    };
    this.events.push(entry);
    if (this.events.length > 30) this.events.shift();
    try {
      fs.appendFileSync(this.replayLogPath, `${ts} t${this.tick} ${msg}\n`);
    } catch {
      /* swallow */
    }
  }

  private classifyEvent(msg: string): EventSeverity {
    const m = msg.toLowerCase();
    if (m.includes("error") || m.includes("disconnect") || m.includes("crash") || m.includes("fail")) return "error";
    if (m.includes("idle") || m.includes("waiting input") || m.includes("warn") || m.includes("stale")) return "warn";
    if (m.includes("conflict") || m.includes("⚔") || m.includes("hits") || m.includes("kill") || m.includes("boss") || m.includes("crit")) return "combat";
    if (m.includes("claude-") || m.includes("📡") || m.includes("mcp")) return "agent";
    if (m.includes("victory") || m.includes("clear") || m.includes("level") || m.includes("✓")) return "info";
    return "system";
  }

  loadPersistedState(): void {
    try {
      if (!fs.existsSync(this.savePath)) return;
      const raw = fs.readFileSync(this.savePath, "utf8");
      const data = JSON.parse(raw) as {
        xp?: number;
        level?: number;
        kills?: number;
        baseAtq?: number;
        maxHp?: number;
      };
      if (typeof data.level === "number" && data.level > 1) {
        this.player.level = data.level;
        this.player.xp = data.xp ?? 0;
        this.player.kills = data.kills ?? 0;
        if (typeof data.baseAtq === "number") this.player.baseAtq = data.baseAtq;
        if (typeof data.maxHp === "number") {
          this.player.maxHp = data.maxHp;
          this.player.hp = data.maxHp;
        }
        this.player.atq = this.player.baseAtq;
        this.pushEvent(`💾 Save loaded — level ${this.player.level}, ${this.player.kills} kills`);
      }
    } catch {
      /* swallow */
    }
  }

  savePersistedState(): void {
    try {
      const data = {
        xp: this.player.xp,
        level: this.player.level,
        kills: this.player.kills,
        baseAtq: this.player.baseAtq,
        maxHp: this.player.maxHp,
        ts: Date.now(),
      };
      fs.writeFileSync(this.savePath, JSON.stringify(data));
    } catch {
      /* swallow */
    }
  }

  movePlayer(dx: number, dy: number): boolean {
    if (this.paused || this.won) return false;
    const blocked = this.blockedCells();
    const ok = this.player.tryMove(this.world, dx, dy, blocked);
    if (ok) {
      this.player.lastMoveTick = this.tick;
      this.player.lastActivityTick = this.tick;
      this.applyWalkingBonus();
    }
    return ok;
  }

  private applyWalkingBonus(): void {
    if (this.observerMode) return;
    this.player.kills;
    if (this.tick > 0 && this.tick % 20 === 0) {
      const lvl = this.player.gainXp(2);
      this.pushFloatingText(`+2 XP`, this.player.pos, 800);
      if (lvl.leveled) {
        this.pushEvent(`⭐ LEVEL UP! L${lvl.newLevel} (walking bonus)`);
      }
    }
    if (this.world.isInSafeZone(this.player.pos.x, this.player.pos.y)) {
      const healed = this.player.healBy(1);
      if (healed > 0) {
        this.pushFloatingText(`+1`, this.player.pos, 800);
      }
    }
  }

  movePlayerDir(dir: Direction): boolean {
    if (this.paused || this.won) return false;
    const blocked = this.blockedCells();
    const ok = this.player.move(this.world, dir, blocked);
    if (ok) {
      this.player.lastMoveTick = this.tick;
      this.player.lastActivityTick = this.tick;
      this.applyWalkingBonus();
      if (
        this.player.bypassActive() &&
        !this.world.isWalkable(this.player.pos.x, this.player.pos.y)
      ) {
        this.pushFloatingText(
          "👻 BYPASS",
          this.player.pos,
          800,
          "cyan"
        );
      }
    }
    return ok;
  }

  private blockedCells(): Set<string> {
    const blocked = new Set<string>();
    for (const a of this.agents) blocked.add(`${a.pos.x},${a.pos.y}`);
    for (const b of this.bugs) blocked.add(`${b.pos.x},${b.pos.y}`);
    if (!this.player.bypassActive()) {
      for (const f of this.fairies) blocked.add(`${f.pos.x},${f.pos.y}`);
    }
    return blocked;
  }

  interact(): InteractionResult {
    if (this.won) return { message: "victory already" };
    if (this.observerMode) return { message: "observer mode — no player" };
    if (this.interactionCooldown > 0) return { message: "wait..." };

    const facing = this.player.facingTile();
    if (this.world.inBounds(facing.x, facing.y)) {
      const t = this.world.tiles[facing.y][facing.x];
      if (t === "%") {
        this.player.wood += 1;
        this.world.setTile(facing.x, facing.y, ".");
        const wIcon = this.theme.woodTile;
        this.pushFloatingText(`+1 ${wIcon}`, facing);
        this.player.pickupFlashUntil = this.tick + 2;
        this.pushEvent(`>> [PLAYER] picked up ${wIcon} (${facing.x},${facing.y})`);
        this.interactionCooldown = 1;
        /* sound removed */
        return { message: `Harvested wood (${this.player.wood})` };
      }
      if (t === "H") {
        const healed = this.player.healBy(10);
        this.world.setTile(facing.x, facing.y, ".");
        this.pushFloatingText(`+${healed} HP`, this.player.pos, 800, "green");
        this.player.pickupFlashUntil = this.tick + 2;
        this.pushEvent(`>> [PLAYER] +${healed} HP`);
        this.interactionCooldown = 1;
        /* sound removed */
        return { message: `+${healed} HP` };
      }
      if (t === "M" || t === "E") {
        const cls = this.player.characterClass;
        if (!canEat(cls, t)) {
          const refusal = dietRefusal(cls, this.player.name);
          this.pushEvent(refusal);
          this.pushFloatingText("✖ refused", facing, 800);
          return { message: refusal };
        }
        this.applyFoodEffect(t, facing);
        this.world.setTile(facing.x, facing.y, ".");
        this.player.lastFedAt = Date.now();
        this.player.pickupFlashUntil = this.tick + 2;
        const note = t === "E" ? "+HUNGER +ENG" : "+HUNGER";
        this.pushFloatingText(note, this.player.pos);
        this.interactionCooldown = 1;
        /* sound removed */
        this.pushEvent(`>> [PLAYER] ate ${tileLabel(t)} (hunger reset)`);
        return { message: `Hunger reset` };
      }
      const facingWeapon = this.weapons.find(
        (w) => w.pos.x === facing.x && w.pos.y === facing.y
      );
      if (facingWeapon) {
        const r = this.player.pickupWeapon(facingWeapon.bonus);
        this.weapons = this.weapons.filter((w) => w !== facingWeapon);
        this.player.pickupFlashUntil = this.tick + 2;
        if (r.atqGain > 0) {
          this.pushFloatingText(`+${r.atqGain} ATQ`, this.player.pos, 800, "orange");
        }
        if (r.defGain > 0) {
          this.pushFloatingText(`+${r.defGain} DEF`, this.player.pos, 800, "cyan");
        }
        const msg = r.defGain > 0 ? `+${r.atqGain}ATQ +${r.defGain}DEF` : `+${r.atqGain} ATQ`;
        this.pushEvent(`>> [PLAYER] ${msg} (atq ${this.player.atq}/20 def ${this.player.def})`);
        this.interactionCooldown = 1;
        return { message: msg };
      }
      if (t === "#") {
        this.pushFloatingText("✖ blocked", facing, 800);
        return { message: "Tree blocks path — go around" };
      }
      if (t === "~") {
        this.pushFloatingText("✖ blocked", facing, 800);
        return { message: "Rock blocks path — go around" };
      }
    }

    for (const bug of this.bugs) {
      if (bug.hp <= 0) continue;
      if (manhattan(this.player.pos, bug.pos) === 1) {
        this.player.lastActivityTick = this.tick;
        const berserk = this.player.isBerserker(this.tick);
        const rawAtq = berserk ? this.player.atq * 2 : this.player.atq;
        const baseDmg = Math.max(1, rawAtq - bug.def);
        const isCrit = Math.random() < 0.10;
        const dmg = isCrit ? baseDmg * 2 : baseDmg;
        bug.takeDamage(dmg, this.tick);
        if (bug.hp <= 0) {
          bug.killedBy = "player";
          bug.killerName = this.player.name;
        }
        this.applyKnockback(bug);
        const diff = this.player.atq - this.player.baseAtq;
        const wearChance = diff > 0 ? Math.min(0.85, 0.20 + diff * 0.05) : 0;
        const wear = Math.random() < wearChance ? 1 : 0;
        if (wear > 0) {
          this.player.atq = Math.max(this.player.baseAtq, this.player.atq - wear);
        }
        this.player.pickupFlashUntil = this.tick;
        if (isCrit) {
          this.pushFloatingText(`CRIT! -${dmg}`, bug.pos, 800, "magenta");
          /* sound removed */
        } else {
          this.pushFloatingText(`-${dmg}`, bug.pos, 800, "red");
        }
        const wearMsg = wear > 0 ? ` (wear -1 ATQ → ${this.player.atq})` : "";
        const critMsg = isCrit ? " ⚡CRIT" : "";
        this.pushEvent(`>> [PLAYER] -${dmg}${critMsg} ${bug.name}${wearMsg}`);
        this.interactionCooldown = 1;
        return { message: `Hit ${bug.name} -${dmg}${critMsg}${wearMsg}` };
      }
    }


    for (const fairy of this.fairies) {
      if (this.player.isAdjacent(fairy.pos) || this.player.isAt(fairy.pos)) {
        const a = this.agents[0];
        const t = a?.latestThought();
        const hint = t ? t.text : "Claude is silent...";
        this.interactionCooldown = 2;
        return { message: `${this.helperIcon()} logs: ${hint}` };
      }
    }

    for (const m of this.markers) {
      if (this.player.isAt(m.pos)) {
        const q = this.board.findById(m.questId);
        if (q && q.requiresPlayer && q.status === "active") {
          q.playerAssisted = true;
          const agent = this.agents.find((a) => a.id === q.assignedAgent);
          if (agent) {
            agent.triggerAssist();
            this.player.questsHelped += 1;
            this.player.gold += Math.floor(q.reward / 2);
            this.interactionCooldown = 2;
            this.pushEvent(`player assisted: ${q.title}`);
            return { message: `assisting on ${q.title}` };
          }
        }
      }
    }

    for (const agent of this.agents) {
      if (this.player.isAdjacent(agent.pos)) {
        const t = agent.latestThought();
        return {
          message: `${agent.name} thinks: ${t ? t.text : "(no thought yet)"}`,
        };
      }
    }

    return { message: "nothing here" };
  }

  step(): void {
    if (this.crashed) {
      if (Date.now() - this.crashedAt >= CRASH_RESET_MS) this.reset();
      return;
    }
    if (this.won) {
      if (Date.now() - this.crashedAt >= 5000) {
        const lvl = this.player.level;
        const xp = this.player.xp;
        const kills = this.player.kills;
        const baseAtq = this.player.baseAtq;
        const maxHp = this.player.maxHp;
        this.reset();
        this.player.level = lvl;
        this.player.xp = xp;
        this.player.kills = kills;
        this.player.baseAtq = baseAtq;
        this.player.maxHp = maxHp;
        this.player.hp = maxHp;
        this.player.atq = baseAtq;
        this.bugsKilled = 0;
        this.won = false;
        this.currentRound = 1;
        this.roundEnemiesSpawned = 0;
        this.roundBossSpawned = false;
        this.roundState = "spawning";
        this.bugs = [];
        this.pushEvent(`🔄 NEW CAMPAIGN — Round 1 begins`);
      }
      return;
    }
    if (this.paused) return;

    void this.monitor.sample();

    const stateNow = this.monitor.state();
    const freshWindow = this.observerMode ? 30000 : 5000;
    const mcpFresh = this.mcpFresh(freshWindow);
    const anyActive = this.monitor.processes.some(
      (p) => this.monitor.pidState(p.pid) === "ACTIVE"
    );
    const recentlyActive = this.monitor.anyRecentlyActive(
      this.observerMode ? 30000 : 10000
    );
    const allIdleOrStandby =
      this.monitor.processes.length > 0 &&
      this.monitor.processes.every((p) => {
        const s = this.monitor.pidState(p.pid);
        return s === "IDLE" || s === "STANDBY";
      });
    const frozenByEngine =
      !this.monitor.isConnected() ||
      (!this.observerMode &&
        !anyActive &&
        !recentlyActive &&
        !mcpFresh &&
        allIdleOrStandby);

    this.connectionLost = this.monitor.isDisconnected();
    this.engineOffline = frozenByEngine;
    if (frozenByEngine) {
      this.evaluateEngineState();
    }

    this.tick += 1;
    if (this.interactionCooldown > 0) this.interactionCooldown -= 1;
    this.tickAudioCues();
    this.tickPassiveXp();

    const occupied = this.buildOccupied();
    this.connectionLost = this.monitor.isDisconnected();
    this.evaluateEngineState();
    this.syncAgentsWithMonitor();

    this.player.tickCooldown();
    const turboBefore = this.player.turboActive;
    this.player.turboActive =
      this.player.canTurbo() && this.monitor.isBusy();
    if (!turboBefore && this.player.turboActive) {
      this.pushFloatingText("⚡ TURBO", this.player.pos, 1000, "green");
      this.pushEvent(`⚡ Turbo-Deploy ACTIVE — Claude BUSY`);
    } else if (turboBefore && !this.player.turboActive) {
      this.pushFloatingText("⚡ off", this.player.pos, 600, "white");
    }

    this.applyHunger();
    this.applySafeZoneRegen();
    this.applySlowHpRegen();
    this.applyAgentHealing();
    this.applyBerserker();
    this.revealAroundPlayer();
    this.applyAtqRegen();
    this.applyTrapDamage();
    /* random chaotic events disabled */
    this.maybePlayerRespawn();
    this.maybeAgentRespawn();
    this.maybeSpawnFairy();
    this.maybeDespawnFairy();
    this.updateSubAgents();
    this.unstickBosses();
    this.maybeBossWave();
    /* day/night cycle disabled */


    this.detectAgentDoneTransitions();
    this.tickIdleEscalation();

    this.clampEntitiesToBounds();

    const decayed = this.world.expireItems();
    if (decayed.length > 0) {
      this.pushEvent(`🍂 ${decayed.length} item(s) decayed`);
    }

    const proc = this.monitor.current;
    if (proc?.writing) {
      this.writingTickStreak += 1;
      if (!this.mcpFresh(10000) && this.writingTickStreak === 5) {
        this.pushEvent(
          `⚠ Claude PID ${proc.pid} writing — MCP hooks not active. Run: npm run install-mcp + restart Claude Code for tool details`
        );
      }
    } else {
      this.writingTickStreak = 0;
    }

    const ctx = {
      weapons: this.weapons,
      bugs: this.bugs,
      tick: this.tick,
      world: this.world,
      npcs: this.npcs.map((n) => ({ name: n.name, pos: n.pos })),
      brain: this.brain,
      operator: this.operator(),
      monitor: this.monitor,
      mcpConnected: this.mcpConnected,
      mcpFresh: this.mcpFresh(5000),
      mcpLastAction: this.lastMcpAction,
    };

    for (const agent of this.agents) {
      const before = agent.state();
      if (this.agentIsFrozen(agent)) {
        const after = agent.state();
        if (before !== after) {
          this.pushEvent(`${agent.name}: ${before} → ${after}`);
        }
        continue;
      }
      agent.update(this.world, occupied, ctx);
      const after = agent.state();
      if (before !== after) {
        this.pushEvent(`${agent.name}: ${before} → ${after}`);
      }
    }
    this.shambleZombies(occupied);

    const resourceTiles = this.world.findTiles("%", "M");
    const fairy = this.fairies[0];
    const huntable: { pos: Position }[] = [];
    if (!this.observerMode && this.player.hp > 0) huntable.push({ pos: this.player.pos });
    for (const ag of this.agents) {
      if (ag.hp <= 0) continue;
      if (this.agentIsFrozen(ag)) continue;
      if (this.agentIsInvulnerable(ag)) continue;
      huntable.push({ pos: ag.pos });
    }
    for (const bug of this.bugs) {
      const targets = [...resourceTiles];
      if (fairy && fairy.hp > 0) targets.push(fairy.pos);
      let nearest: Position | null = null;
      let nearestDist = Infinity;
      for (const h of huntable) {
        const d = manhattan(bug.pos, h.pos);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = h.pos;
        }
      }
      if (nearest && nearestDist <= 12) targets.push(nearest);
      bug.update(this.world, occupied, targets);
    }

    const fairyTarget = this.fairyFollowTarget();
    for (const fairy of this.fairies) {
      fairy.update(this.world, occupied, fairyTarget);
    }

    this.resolveFairyHeal();
    this.resolveCombat();
    this.resolveFairyCombat();
    this.refreshHandshakeFromBridge();
    this.resolveBugConsumption();
    this.resolveAgentPickups();
    this.resolvePlayerPickups();
    this.checkPlayerAssist();

    if (this.tick % 40 === 0) {
      const stats = getSystemStats();
      this.pushEvent(
        `${this.helperIcon()}: System stable, ${this.identity.displayName}. Free mem: ${stats.freeMemPct}% (${stats.totalMemMb}MB total, load ${stats.loadAvg.toFixed(2)})`
      );
    }

    this.bugTimer += 1;
    this.updateEscalation();
    /* weather rotation disabled */
    this.tickRounds();
    /* periodic weapon spawn disabled — weapons drop only from bug deaths */

    this.markers = this.markers.filter((m) => {
      const q = this.board.findById(m.questId);
      return q && q.status !== "completed";
    });


    if (this.pacifist) {
      const elapsed = this.tick - this.pacifistTickStart;
      if (this.player.kills > 0 && !this.won) {
        this.pushEvent(`☮ PACIFIST FAIL — kill counted, run reset`);
        this.player.kills = 0;
        this.bugsKilled = 0;
        this.pacifistTickStart = this.tick;
        return;
      } else if (elapsed >= 1000 && !this.won) {
        this.won = true;
        this.pushEvent(`☮ PACIFIST VICTORY — survived 1000 ticks no kills`);
        this.savePersistedState();
        this.crashedAt = Date.now();
      }
    }
  }

  private buildOccupied(): Set<string> {
    const occ = new Set<string>();
    for (const a of this.agents) occ.add(`${a.pos.x},${a.pos.y}`);
    for (const b of this.bugs) occ.add(`${b.pos.x},${b.pos.y}`);
    for (const f of this.fairies) occ.add(`${f.pos.x},${f.pos.y}`);
    occ.add(`${this.player.pos.x},${this.player.pos.y}`);
    return occ;
  }

  private applyFoodEffect(tile: string, _pos: Position): void {
    const p = this.player;
    if (tile === "M") {
      p.meat += 1;
    } else if (tile === "E") {
      p.batteries += 1;
      p.gainEnergy(15);
    }
  }

  private fairyFollowTarget(): Position {
    const top = this.monitor.topByCpu();
    if (top) {
      const a = this.agents.find((x) => x.linkedPid === top.pid && x.state() !== "zombie");
      if (a) return a.pos;
    }
    if (this.agents.length > 0) {
      const alive = this.agents.find((a) => a.state() !== "zombie");
      if (alive) return alive.pos;
    }
    return this.player.pos;
  }

  private evaluateEngineState(): void {
    const proc = this.monitor.current;
    const online = proc !== null && proc.cpu >= 0.1;
    this.engineOffline = !online;
    if (proc) this.lastSeenPid = proc.pid;
    const stateNow = this.monitor.state();

    if (this.lastEngineOnline && !online) {
      this.pushEvent(`CRITICAL: Engine Stopped`);
      this.pushEvent(`${this.helperIcon()} Monitoring suspended — awaiting signal`);
      /* sound removed */
    } else if (!this.lastEngineOnline && online && proc) {
      this.pushEvent(`✓ Engine ONLINE`);
      this.pushEvent(`${this.helperIcon()} Signal restored — resuming`);
    }

    if (this.lastMonitorState === "ACTIVE" && stateNow === "IDLE") {
      this.pushEvent(`✓ Claude finished task — IDLE`);
    }

    if (stateNow === "IDLE" && this.lastMonitorState !== "IDLE") {
      this.pushEvent(
        `${this.helperIcon()} System idle: Claude awaits input from ${this.identity.displayName}...`
      );
    }

    this.lastEngineOnline = online;
    this.lastMonitorState = stateNow;
  }

  private clampEntitiesToBounds(): void {
    const w = this.world.width;
    const h = this.world.height;
    const clampPos = (p: { x: number; y: number }) => {
      p.x = Math.max(1, Math.min(w - 2, p.x));
      p.y = Math.max(1, Math.min(h - 2, p.y));
    };
    clampPos(this.player.pos);
    for (const a of this.agents) clampPos(a.pos);
    for (const b of this.bugs) clampPos(b.pos);
    for (const f of this.fairies) clampPos(f.pos);
    for (const wp of this.weapons) clampPos(wp.pos);
  }

  private applyAtqRegen(): void {
    if (this.observerMode) return;
    if (!this.monitor.isBusy()) return;
    if (this.player.atq >= 20) return;
    this.atqRegenTimer += 1;
    if (this.atqRegenTimer < 30) return;
    this.atqRegenTimer = 0;
    this.player.atq = Math.min(20, this.player.atq + 1);
    this.pushFloatingText(`+1 ATQ (busy)`, this.player.pos);
  }

  private revealAroundPlayer(): void {
    if (!this.fogEnabled) return;
    if (this.observerMode) {
      for (let y = 0; y < this.world.height; y++) {
        for (let x = 0; x < this.world.width; x++) {
          this.revealed.add(`${x},${y}`);
        }
      }
      return;
    }
    const radius = 8;
    const px = this.player.pos.x;
    const py = this.player.pos.y;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const nx = px + dx;
        const ny = py + dy;
        if (!this.world.inBounds(nx, ny)) continue;
        this.revealed.add(`${nx},${ny}`);
      }
    }
  }

  isRevealed(x: number, y: number): boolean {
    if (!this.fogEnabled) return true;
    if (this.observerMode) return true;
    return this.revealed.has(`${x},${y}`);
  }

  toggleFog(): void {
    this.fogEnabled = !this.fogEnabled;
  }

  private maybeAgentRespawn(): void {
    const bosses = this.bugs.filter((b) => b.hp > 0 && b.bossLevel >= 10);
    const allBugs = this.bugs.filter((b) => b.hp > 0);
    const minDistFromBoss = 18;
    const minDistFromAnyBug = 6;
    for (const a of this.agents) {
      if (a.state() === "zombie") continue;
      if (a.hp <= 0) {
        if (a.deadSinceTick < 0) {
          a.deadSinceTick = this.tick;
          this.pushEvent(`💀 ${a.name} fell — respawn 4s`, a.linkedPid);
        }
        if (this.tick - a.deadSinceTick >= 12) {
          const farFromBoss = (p: Position): boolean =>
            bosses.every((b) => manhattan(p, b.pos) >= minDistFromBoss);
          const farFromBugs = (p: Position): boolean =>
            allBugs.every((b) => manhattan(p, b.pos) >= minDistFromAnyBug);
          let respawnPos: Position | null = null;
          for (let i = 0; i < 80; i++) {
            const c = this.world.randomWalkable();
            if (
              this.world.isInSafeZone(c.x, c.y) &&
              farFromBoss(c) &&
              farFromBugs(c)
            ) {
              respawnPos = c;
              break;
            }
          }
          if (!respawnPos) {
            for (let i = 0; i < 80; i++) {
              const c = this.world.randomWalkable();
              if (farFromBoss(c) && farFromBugs(c)) {
                respawnPos = c;
                break;
              }
            }
          }
          if (!respawnPos) {
            for (let i = 0; i < 60; i++) {
              const c = this.world.randomWalkable();
              if (farFromBoss(c)) {
                respawnPos = c;
                break;
              }
            }
          }
          if (!respawnPos) respawnPos = this.world.randomWalkable();
          a.deathCount = (a.deathCount ?? 0) + 1;
          const HP_CAP = 100;
          const ATQ_CAP = 12;
          const buffMult = 1 + Math.min(0.3, a.deathCount * 0.05);
          const newMax = Math.min(HP_CAP, Math.round(a.maxHp * buffMult));
          a.maxHp = newMax;
          a.atq = Math.min(
            ATQ_CAP,
            Math.round(a.atq * (1 + Math.min(0.2, a.deathCount * 0.03)))
          );
          a.pos = respawnPos;
          a.hp = Math.max(1, Math.floor(a.maxHp / 2));
          a.deadSinceTick = -1;
          a.invulnUntilTick = this.tick + 30;
          this.pushEvent(
            `✨ ${a.name} respawned (death#${a.deathCount}, HP+${Math.round((buffMult - 1) * 100)}% — invuln 30t)`,
            a.linkedPid
          );
        }
      } else {
        a.deadSinceTick = -1;
      }
    }
  }

  private applySlowHpRegen(): void {
    if (this.observerMode) return;
    if (this.player.hp <= 0) return;
    if (this.player.hp >= this.player.maxHp) return;
    if (this.tick - this.player.lastDamageTick < 30) return;
    if (this.world.isInSafeZone(this.player.pos.x, this.player.pos.y)) return;
    if (this.tick % 30 !== 0) return;
    const healed = this.player.healBy(1);
    if (healed > 0) this.pushFloatingText(`+${healed}`, this.player.pos, 800, "green");
  }

  private applyBerserker(): void {
    if (this.observerMode) return;
    if (this.player.hp <= 0) return;
    const pct = this.player.hp / this.player.maxHp;
    const active = this.player.isBerserker(this.tick);
    if (!active && pct < 0.20 && this.tick > this.player.berserkerCooldownUntil) {
      this.player.berserkerEndsAt = this.tick + 30;
      this.player.berserkerCooldownUntil = this.tick + 200;
      this.pushEvent(`🩸 BERSERKER MODE — atq x2, dodge x2 for 30 ticks`);
      this.pushFloatingText("BERSERK!", this.player.pos, 800, "red");
    }
  }

  private maybeRandomEvent(): void {
    if (this.tick === 0 || this.tick % 100 !== 0) return;
    if (this.observerMode) return;
    const r = Math.random();
    if (r < 0.33) this.eventGoldenBug();
    else if (r < 0.66) this.eventMeteorShower();
    else this.eventTrader();
  }

  private eventGoldenBug(): void {
    const pos = this.world.randomWalkable();
    if (this.world.isInSafeZone(pos.x, pos.y)) return;
    this.bugSeq += 1;
    const name = this.mode === "bugs" ? "GOLDEN_BUG" : "GOLDEN_BEAST";
    const icon = this.mode === "bugs" ? "🪲" : "🦌";
    const bug = new EnemyBug(`bug${this.bugSeq}`, pos, name);
    bug.maxHp = 4;
    bug.hp = 4;
    bug.atq = 1;
    bug.bossLevel = 0;
    bug.iconOverride = icon;
    this.bugs.push(bug);
    this.pushEvent(`✨ ${icon} ${name} appears @ (${pos.x},${pos.y}) — kill = +100 XP`);
    this.pushFloatingText("GOLDEN", pos, 800, "orange");
  }

  private eventMeteorShower(): void {
    const count = 1 + Math.floor(Math.random() * 2);
    let hits = 0;
    for (let i = 0; i < count; i++) {
      const x = Math.floor(Math.random() * this.world.width);
      const y = Math.floor(Math.random() * this.world.height);
      if (!this.world.inBounds(x, y)) continue;
      if (this.world.isInSafeZone(x, y)) continue;
      if (this.world.isWalkable(x, y)) {
        this.world.setTile(x, y, "T");
        hits += 1;
      }
    }
    if (hits > 0) {
      const label = this.mode === "bugs" ? "💥 GLITCH STORM" : "☄ METEOR SHOWER";
      this.pushEvent(`${label} — ${hits} new trap(s) (decay 90s)`);
    }
  }

  private eventTrader(): void {
    if (this.weapons.length >= 4) return;
    const p = this.world.randomWalkable();
    this.weaponSeq += 1;
    this.weapons.push(new Weapon(`wpn${this.weaponSeq}`, p, 2));
    const label = this.mode === "bugs" ? "📦 SUPPLY DROP" : "🎁 TRADER passed";
    const wIcon = this.mode === "bugs" ? "🔨" : "🗡️";
    this.pushEvent(`${label} — dropped ${wIcon} +2 ATK @ (${p.x},${p.y})`);
  }

  private applyTrapDamage(): void {
    if (!this.observerMode && this.player.hp > 0) {
      const t = this.world.tiles[this.player.pos.y]?.[this.player.pos.x];
      if (t === "T" && this.tick % 3 === 0) {
        const dmg = 3;
        this.player.hp = Math.max(0, this.player.hp - dmg);
        this.player.damageFlashUntil = this.tick + 3;
        this.pushFloatingText(`-${dmg} TRAP`, this.player.pos, 800, "red");
        this.pushEvent(`🕳️ TRAP -${dmg} HP`);
      }
    }
    for (const a of this.agents) {
      if (a.hp <= 0) continue;
      if (this.agentIsInvulnerable(a)) continue;
      const t = this.world.tiles[a.pos.y]?.[a.pos.x];
      if (t !== "T") continue;
      if (this.tick % 4 === 0) {
        const dmg = 2;
        a.takeDamage(dmg, this.tick);
        this.pushFloatingText(`-${dmg} TRAP`, a.pos, 800, "red");
        this.pushEvent(`🕳️ ${a.name} stepped on trap -${dmg} HP`, a.linkedPid);
      }
      this.escapeTrap(a);
    }
  }

  private escapeTrap(a: Agent): void {
    const occupied = new Set<string>();
    for (const ag of this.agents) {
      if (ag.id === a.id) continue;
      occupied.add(`${ag.pos.x},${ag.pos.y}`);
    }
    for (const b of this.bugs) occupied.add(`${b.pos.x},${b.pos.y}`);
    occupied.add(`${this.player.pos.x},${this.player.pos.y}`);
    const dirs = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    for (const d of dirs) {
      const nx = a.pos.x + d.dx;
      const ny = a.pos.y + d.dy;
      if (!this.world.inBounds(nx, ny)) continue;
      if (!this.world.isWalkable(nx, ny)) continue;
      const t = this.world.tiles[ny][nx];
      if (t === "T") continue;
      const key = `${nx},${ny}`;
      if (occupied.has(key)) continue;
      a.pos = { x: nx, y: ny };
      a.lastMoveTick = this.tick;
      return;
    }
  }

  private maybePlayerRespawn(): void {
    if (this.observerMode) return;
    if (this.player.hp > 0) return;
    if (this.playerDeadAt === 0) {
      this.playerDeadAt = Date.now();
      this.pushEvent(`💀 [PLAYER] down — respawn 3s...`);
      return;
    }
    if (Date.now() - this.playerDeadAt < 3000) return;
    const safe = this.findSafeRespawnPos();
    this.player.pos = safe;
    this.player.hp = Math.floor(this.player.maxHp / 2);
    this.player.lastFedAt = Date.now();
    this.playerDeadAt = 0;
    this.pushEvent(`✨ [PLAYER] respawn @ safe zone HP=${this.player.hp}`);
    this.pushFloatingText(`RESPAWN`, this.player.pos);
  }

  private findSafeRespawnPos(): Position {
    for (const k of this.world.safeZone) {
      const [xs, ys] = k.split(",");
      const x = parseInt(xs, 10);
      const y = parseInt(ys, 10);
      if (this.world.tiles[y]?.[x] === ".") return { x, y };
    }
    return this.world.randomWalkable();
  }

  private maybeBossWave(): void {
    return;
  }

  private maybeDeescalate(): void {
    const window = 60;
    this.agentDeathTicks = this.agentDeathTicks.filter(
      (t) => this.tick - t <= window
    );
    if (this.tick < this.deescalateUntil) return;
    if (this.agentDeathTicks.length < 3) return;
    this.deescalateUntil = this.tick + 100;
    const baseAtq = Math.max(2, Math.round(2 * Math.min(1.5, 1 + (this.currentRound - 1) * 0.15)));
    let resetCount = 0;
    for (const bug of this.bugs) {
      if (bug.bossLevel >= 10) continue;
      if (bug.hp <= 0) continue;
      if (bug.atq > baseAtq) {
        bug.atq = baseAtq;
        resetCount += 1;
      }
    }
    this.agentDeathTicks = [];
    this.pushEvent(
      `🛡️ DEESCALATE — 3+ agent deaths in 60t. Spawn paused 30s, ${resetCount} bug ATQ reset to ${baseAtq}`,
      null,
      { pinned: true }
    );
    this.pushFloatingText("🛡️ DEESCALATE", this.player.pos, 1500, "cyan");
  }

  roundsConfig(round: number): { enemies: number; boss: boolean; maxLevel: 1 | 2 | 3; concurrentMax: number } {
    if (round === 1) return { enemies: 5, boss: true, maxLevel: 1, concurrentMax: 4 };
    if (round === 2) return { enemies: 7, boss: true, maxLevel: 2, concurrentMax: 5 };
    if (round === 3) return { enemies: 8, boss: true, maxLevel: 2, concurrentMax: 6 };
    if (round === 4) return { enemies: 10, boss: true, maxLevel: 3, concurrentMax: 7 };
    return { enemies: 12, boss: true, maxLevel: 3, concurrentMax: 8 };
  }

  private tickRounds(): void {
    if (this.pacifist || this.won) return;
    const cfg = this.roundsConfig(this.currentRound);
    if (this.roundState === "between") {
      if (this.tick >= this.roundBetweenUntil) {
        this.startNextRound();
      }
      return;
    }
    if (this.roundState === "spawning") {
      let interval = 6;
      if (this.nightMode) interval = 4;
      if (this.weather === "fog") interval = Math.max(3, interval - 1);
      const aliveRegular = this.bugs.filter((b) => b.hp > 0 && b.bossLevel < 10).length;
      const inDeescalate = this.tick < this.deescalateUntil;
      const canSpawn =
        !inDeescalate &&
        aliveRegular < cfg.concurrentMax &&
        this.bugTimer >= interval &&
        this.roundEnemiesSpawned < cfg.enemies;
      if (canSpawn) {
        this.spawnRoundEnemy(cfg.maxLevel);
        this.roundEnemiesSpawned += 1;
        this.bugTimer = 0;
      }
      if (this.roundEnemiesSpawned >= cfg.enemies) {
        this.roundState = "fighting";
        this.roundBossNeeded = cfg.boss;
        this.roundFightStartTick = this.tick;
        this.pushEvent(`⏳ Round ${this.currentRound} — clear remaining enemies`);
      }
      return;
    }
    const fightDuration = this.tick - this.roundFightStartTick;
    if (fightDuration > 600) {
      let killed = 0;
      for (const b of this.bugs) {
        if (b.hp > 0) {
          b.hp = 0;
          b.killedBy = "timeout";
          b.killerName = "TIMEOUT";
          killed += 1;
        }
      }
      if (killed > 0) {
        this.pushEvent(`⚡ TIMEOUT — round force-cleared ${killed} stuck bugs`);
      }
    }
    const aliveRegular = this.bugs.filter((b) => b.hp > 0 && b.bossLevel < 10).length;
    const aliveBoss = this.bugs.filter((b) => b.hp > 0 && b.bossLevel >= 10).length;
    if (
      aliveRegular === 0 &&
      this.roundBossNeeded &&
      !this.roundBossSpawned &&
      this.tick >= this.bossCooldownUntil
    ) {
      this.spawnRoundBoss(cfg.maxLevel);
      this.roundBossSpawned = true;
    }
    const bossDone = !this.roundBossNeeded || (this.roundBossSpawned && aliveBoss === 0);
    if (aliveRegular === 0 && bossDone) {
      const bonusXp = this.currentRound * 10;
      const lvl = this.player.gainXp(bonusXp);
      this.pushEvent(`✅ ROUND ${this.currentRound}/${this.totalRounds} CLEAR — +${bonusXp} XP`);
      this.pushFloatingText(`+${bonusXp} XP`, this.player.pos, 800, "cyan");
      if (lvl.leveled) {
        this.pushEvent(`⭐ LEVEL UP! L${lvl.newLevel}`);
        this.pushFloatingText(`LV ${lvl.newLevel}!`, this.player.pos, 800, "orange");
      }
      if (this.roundBossSpawned) this.bossCooldownUntil = this.tick + 67;
      if (this.currentRound >= this.totalRounds) {
        this.won = true;
        this.pushEvent(`🏆 ALL ROUNDS CLEARED — VICTORY`);
        this.savePersistedState();
        this.crashedAt = Date.now();
      } else {
        this.roundState = "between";
        this.roundBetweenUntil = this.tick + 67;
        this.pushEvent(`⏸ Next round in 20s...`);
      }
    }
  }

  private startNextRound(): void {
    this.currentRound += 1;
    this.roundEnemiesSpawned = 0;
    this.roundBossSpawned = false;
    this.roundBossNeeded = false;
    this.roundState = "spawning";
    this.bugTimer = 0;
    const buffedAtq = Math.min(20, 3 + this.currentRound * 2);
    for (const a of this.agents) {
      a.atq = buffedAtq;
      a.hp = a.maxHp;
    }
    this.pushEvent(`⚔ ROUND ${this.currentRound}/${this.totalRounds} BEGINS — agents buffed atq=${buffedAtq}`);
  }

  private spawnRoundEnemy(maxLevel: 1 | 2 | 3): void {
    let pos: Position | null = null;
    for (let i = 0; i < 30; i++) {
      const c = this.world.randomWalkable();
      if (this.world.isInSafeZone(c.x, c.y)) continue;
      if (manhattan(c, this.player.pos) >= 6) {
        pos = c;
        break;
      }
    }
    if (!pos) {
      for (let i = 0; i < 30; i++) {
        const c = this.world.randomWalkable();
        if (!this.world.isInSafeZone(c.x, c.y)) {
          pos = c;
          break;
        }
      }
    }
    if (!pos) pos = this.world.randomWalkable();
    this.bugSeq += 1;
    this.bugNameSeq += 1;
    const pool = this.theme.enemyNames.length > 0 ? this.theme.enemyNames : BUG_NAMES;
    const fallback = pool[this.bugNameSeq % pool.length];
    const name =
      this.lastMcpAction && this.bugNameSeq % 2 === 0
        ? this.lastMcpAction
        : fallback;
    const bug = new EnemyBug(`bug${this.bugSeq}`, pos, name);
    let level: 1 | 2 | 3 = 1;
    const r = Math.random();
    if (maxLevel === 3) {
      if (r < 0.20) level = 3;
      else if (r < 0.55) level = 2;
      else level = 1;
    } else if (maxLevel === 2) {
      if (r < 0.40) level = 2;
      else level = 1;
    }
    const roundMult = Math.min(2.0, 1 + (this.currentRound - 1) * 0.4);
    const atqMult = Math.min(1.5, 1 + (this.currentRound - 1) * 0.15);
    if (level === 2) {
      bug.level = 2;
      bug.maxHp = Math.round(14 * roundMult);
      bug.atq = Math.round(4 * atqMult);
    } else if (level === 3) {
      bug.level = 3;
      bug.maxHp = Math.round(25 * roundMult);
      bug.atq = Math.round(6 * atqMult);
    } else {
      bug.maxHp = Math.round(8 * roundMult);
      bug.atq = Math.max(2, Math.round(2 * atqMult));
    }
    bug.hp = bug.maxHp;
    bug.bossLevel = 0;
    bug.spawnTick = this.tick;
    bug.lastDamageTick = this.tick;
    const variants = this.theme.enemyVariants[`l${level}` as "l1" | "l2" | "l3"];
    if (variants && variants.length > 0) {
      bug.iconOverride = variants[Math.floor(Math.random() * variants.length)];
    }
    this.bugs.push(bug);
  }

  private spawnRoundBoss(maxLevel: 1 | 2 | 3): void {
    let pos: Position | null = null;
    for (let i = 0; i < 30; i++) {
      const c = this.world.randomWalkable();
      if (!this.world.isInSafeZone(c.x, c.y)) {
        pos = c;
        break;
      }
    }
    if (!pos) pos = this.world.randomWalkable();
    this.bugSeq += 1;
    const action = this.lastMcpAction || "BOSS";
    const bug = new EnemyBug(`bug${this.bugSeq}`, pos, `BOSS_${action}`);
    bug.level = 3;
    const bossHp = 30 + this.currentRound * 18 + maxLevel * 4;
    bug.maxHp = Math.min(150, bossHp);
    bug.hp = bug.maxHp;
    bug.atq = 4;
    bug.def = 1;
    bug.bossLevel = 10;
    bug.spawnTick = this.tick;
    const bvar = this.theme.bossVariants;
    if (bvar.length > 0) {
      const idx = Math.min(this.currentRound - 1, bvar.length - 1);
      bug.iconOverride = bvar[idx];
    }
    this.bugs.push(bug);
    this.pushEvent(`👹 BOSS — ${bug.name} appears @ (${pos.x},${pos.y}) HP${bug.maxHp} ATQ${bug.atq}`);
  }

  private unstickBosses(): void {
    if (this.tick % 30 !== 0) return;
    for (const bug of this.bugs) {
      if (bug.hp <= 0) continue;
      const sinceSpawn = this.tick - bug.spawnTick;
      const sinceDamage = this.tick - bug.lastDamageTick;
      const threshold = bug.bossLevel >= 10 ? 100 : 80;
      if (sinceSpawn < threshold) continue;
      if (sinceDamage < threshold) continue;
      let target: Position | null = null;
      for (let r = 1; r < 5; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const nx = this.player.pos.x + dx;
            const ny = this.player.pos.y + dy;
            if (!this.world.inBounds(nx, ny)) continue;
            if (!this.world.isWalkable(nx, ny)) continue;
            if (this.world.isInSafeZone(nx, ny)) continue;
            if (this.player.pos.x === nx && this.player.pos.y === ny) continue;
            target = { x: nx, y: ny };
            break;
          }
          if (target) break;
        }
        if (target) break;
      }
      if (target) {
        bug.pos = target;
        bug.lastDamageTick = this.tick;
        this.pushEvent(`⚠ ${bug.name} unstuck — warped to (${target.x},${target.y})`);
      }
    }
  }

  private maybeToggleNight(): void {
    if (this.tick > 0 && this.tick % 120 === 0) {
      this.nightMode = !this.nightMode;
      this.pushEvent(
        this.nightMode
          ? `🌙 NIGHT FALLS — bugs +20% spawn, map dim`
          : `☀ DAWN — bugs return to normal`
      );
    }
  }

  private updateEscalation(): void {
    const window = 60;
    const cutoff = this.tick - window;
    this.killTicks = this.killTicks.filter((t) => t >= cutoff);
    const recent = this.killTicks.length;
    let target = 0;
    if (recent >= 12) target = 5;
    else if (recent >= 9) target = 4;
    else if (recent >= 6) target = 3;
    else if (recent >= 4) target = 2;
    else if (recent >= 2) target = 1;
    if (target > this.escalation) {
      this.escalation = target;
      this.pushEvent(`🔥 ESCALATION L${this.escalation} — bugs stronger + spawn faster`);
    } else if (target < this.escalation && this.tick % 30 === 0) {
      this.escalation -= 1;
      if (this.escalation === 0) this.pushEvent(`🌿 calm — escalation reset`);
    }
  }

  private tickPassiveXp(): void {
    if (this.observerMode) return;
    if (this.player.hp <= 0) return;
    if (this.tick === 0 || this.tick % 17 !== 0) return;
    const lvl = this.player.gainXp(1);
    if (lvl.leveled) {
      this.pushEvent(`⭐ LEVEL UP! L${lvl.newLevel}`);
      this.pushFloatingText(`LV ${lvl.newLevel}!`, this.player.pos, 1500, "orange");
    }
  }

  private tickAudioCues(): void {
    if (this.observerMode) return;
    /* heartbeat sound removed */
    if (this.tick % 80 === 0 && this.tick > 0) {
      /* sound removed */
    }
  }

  private shambleZombies(occupied: Set<string>): void {
    if (this.tick % 2 !== 0) return;
    if (this.observerMode) return;
    for (const ag of this.agents) {
      if (ag.state() !== "zombie") continue;
      const dx = Math.sign(this.player.pos.x - ag.pos.x);
      const dy = Math.sign(this.player.pos.y - ag.pos.y);
      const tries = Math.abs(dx) > Math.abs(dy)
        ? [[dx, 0], [0, dy], [0, -dy]]
        : [[0, dy], [dx, 0], [-dx, 0]];
      for (const [tx, ty] of tries) {
        if (tx === 0 && ty === 0) continue;
        const nx = ag.pos.x + tx;
        const ny = ag.pos.y + ty;
        if (!this.world.inBounds(nx, ny)) continue;
        if (!this.world.isWalkable(nx, ny)) continue;
        const key = `${nx},${ny}`;
        if (occupied.has(key)) continue;
        if (this.player.pos.x === nx && this.player.pos.y === ny) continue;
        occupied.delete(`${ag.pos.x},${ag.pos.y}`);
        ag.pos = { x: nx, y: ny };
        occupied.add(key);
        ag.lastMoveTick = this.tick;
        break;
      }
    }
  }

  private applyKnockback(bug: EnemyBug): void {
    const dx = Math.sign(bug.pos.x - this.player.pos.x);
    const dy = Math.sign(bug.pos.y - this.player.pos.y);
    const nx = bug.pos.x + dx;
    const ny = bug.pos.y + dy;
    if (!this.world.inBounds(nx, ny)) return;
    if (!this.world.isWalkable(nx, ny)) return;
    if (this.bugs.some((b) => b !== bug && b.hp > 0 && b.pos.x === nx && b.pos.y === ny)) return;
    if (this.player.pos.x === nx && this.player.pos.y === ny) return;
    bug.pos = { x: nx, y: ny };
  }

  private effectiveDodge(): number {
    const base = this.dodgeChance(this.player.characterClass);
    if (this.player.isBerserker(this.tick)) return Math.min(1, base * 2);
    return base;
  }

  private dodgeChance(cls: CharacterClass): number {
    if (cls === "flyer") return 0.25;
    if (cls === "scout") return 0.20;
    if (cls === "wolf") return 0.10;
    return 0.05;
  }

  private maybeRotateWeather(): void {
    if (this.tick === 0 || this.tick % 80 !== 0) return;
    const r = Math.random();
    let next: "clear" | "rain" | "fog";
    if (r < 0.55) next = "clear";
    else if (r < 0.8) next = "rain";
    else next = "fog";
    if (next === this.weather) return;
    this.weather = next;
    if (next === "rain") this.pushEvent(`🌧 RAIN — visibility reduced`);
    else if (next === "fog") this.pushEvent(`🌫 FOG — bugs harder to spot`);
    else this.pushEvent(`🌤 weather clears`);
  }

  private applySafeZoneRegen(): void {
    if (this.observerMode) return;
    if (this.tick % 5 !== 0) return;
    if (!this.world.isInSafeZone(this.player.pos.x, this.player.pos.y)) return;
    const healed = this.player.healBy(2);
    if (healed > 0 && this.tick % 15 === 0) {
      this.pushEvent(`+ Safe Zone regen +${healed} HP`);
    }
  }

  private applyHunger(): void {
    if (this.observerMode) return;
    if (this.player.hp <= 0) return;
    if (this.player.isFedRecently(120000)) return;
    const recentlyActive = this.tick - this.player.lastActivityTick < 30;
    if (!recentlyActive) return;
    const inSafe = this.world.isInSafeZone(this.player.pos.x, this.player.pos.y);
    let interval = 20;
    if (inSafe) interval = 60;
    if (this.tick % interval !== 0) return;
    this.player.hp = Math.max(0, this.player.hp - 1);
    if (this.tick % 60 === 0) {
      const cls = CLASS_SPECS[this.player.characterClass].label;
      const reason = inSafe ? " (safe zone slow drain)" : "";
      this.pushEvent(
        `${this.helperIcon()}: ¡${this.identity.displayName}, el ${cls} is hungry!${reason}`
      );
    }
  }

  private tickIdleEscalation(): void {
    const now = Date.now();
    const FIVE_MIN = 5 * 60 * 1000;
    const TEN_MIN = 10 * 60 * 1000;
    const NOTIFY_INTERVAL = 60 * 1000;
    const toRemove: string[] = [];
    for (const a of this.agents) {
      if (!a.needsInput || a.needsInputSinceMs === 0) continue;
      const idleMs = now - a.needsInputSinceMs;
      if (idleMs >= TEN_MIN) {
        toRemove.push(a.id);
        if (a.linkedPid !== null) this.despawnedPids.add(a.linkedPid);
        this.pushEvent(
          `👻 ${a.name} auto-despawn — 10min sin input`,
          a.linkedPid,
          { pinned: true }
        );
        playNeedsInput();
        continue;
      }
      if (idleMs >= FIVE_MIN) {
        if (now - a.lastIdleNotifyMs >= NOTIFY_INTERVAL) {
          a.lastIdleNotifyMs = now;
          const mins = Math.floor(idleMs / 60000);
          playNeedsInput();
          this.pushEvent(
            `🚨 ${a.name} idle ${mins}min — needs attention`,
            a.linkedPid,
            { pinned: true }
          );
        }
      }
    }
    if (toRemove.length > 0) {
      this.agents = this.agents.filter((a) => !toRemove.includes(a.id));
      for (const id of toRemove) {
        this.prevPidStates.forEach((_, pid) => {
          const stillExists = this.agents.some((a) => a.linkedPid === pid);
          if (!stillExists) this.prevPidStates.delete(pid);
        });
        void id;
      }
    }
  }

  private detectAgentDoneTransitions(): void {
    const livePids = new Set<number>();
    for (const a of this.agents) {
      if (a.linkedPid === null) continue;
      livePids.add(a.linkedPid);
      const cur = this.monitor.pidState(a.linkedPid);
      const prev = this.prevPidStates.get(a.linkedPid);
      if (prev !== cur) {
        if (prev === "ACTIVE" && cur === "IDLE") {
          playNeedsInput();
          a.needsInput = true;
          a.needsInputSinceMs = Date.now();
          a.bashActive = false;
          a.pushAction(this.tick, "🔔", "task done");
          this.pushEvent(
            `🔔 ${a.name} task done — waiting input`,
            a.linkedPid,
            { pinned: true }
          );
        } else if (cur === "ACTIVE") {
          a.needsInput = false;
          a.needsInputSinceMs = 0;
          a.lastIdleNotifyMs = 0;
          a.errorState = false;
          a.pushAction(this.tick, "🟢", "ACTIVE");
          /* state change event silenced — too noisy */
        } else if (cur === "IDLE" && prev !== undefined) {
          if (!a.needsInput) {
            playNeedsInput();
            a.pushAction(this.tick, "🟡", "IDLE wait");
            this.pushEvent(
              `🟡 ${a.name} IDLE — waiting your input`,
              a.linkedPid,
              { pinned: true }
            );
          }
          a.needsInput = true;
          if (a.needsInputSinceMs === 0) a.needsInputSinceMs = Date.now();
        } else if (cur === "STANDBY") {
          a.pushAction(this.tick, "⚪", "STANDBY");
          /* STANDBY chatter silenced */
        } else if (cur === "DISCONNECTED") {
          a.errorState = true;
          a.pushAction(this.tick, "🔴", "DC");
          this.pushEvent(`🔴 ${a.name} DISCONNECTED`, a.linkedPid);
        }
      }
      this.prevPidStates.set(a.linkedPid, cur);
    }
    for (const pid of [...this.prevPidStates.keys()]) {
      if (!livePids.has(pid)) this.prevPidStates.delete(pid);
    }
  }

  agentIsFrozen(agent: Agent): boolean {
    if (agent.linkedPid === null) return false;
    const s = this.monitor.pidState(agent.linkedPid);
    return s === "IDLE" || s === "STANDBY" || s === "DISCONNECTED";
  }

  agentIsInvulnerable(agent: Agent): boolean {
    return this.tick < agent.invulnUntilTick;
  }

  private applyAgentHealing(): void {
    if (this.tick % 15 !== 0) return;
    for (const healer of this.agents) {
      if (healer.hp <= 0) continue;
      if (this.agentIsFrozen(healer)) continue;
      if (healer.hp / healer.maxHp < 0.5) continue;
      const candidates: Array<{ target: "agent" | "player"; pos: Position; pct: number; ref: Agent | null }> = [];
      for (const ally of this.agents) {
        if (ally.id === healer.id) continue;
        if (ally.hp <= 0) continue;
        if (manhattan(healer.pos, ally.pos) > 2) continue;
        const pct = ally.hp / ally.maxHp;
        if (pct >= 0.7) continue;
        candidates.push({ target: "agent", pos: ally.pos, pct, ref: ally });
      }
      if (!this.observerMode && this.player.hp > 0) {
        const ppct = this.player.hp / this.player.maxHp;
        if (
          ppct < 0.5 &&
          manhattan(healer.pos, this.player.pos) <= 2
        ) {
          candidates.push({ target: "player", pos: this.player.pos, pct: ppct, ref: null });
        }
      }
      if (candidates.length === 0) continue;
      candidates.sort((a, b) => a.pct - b.pct);
      const pick = candidates[0];
      const healAmt = 3;
      if (pick.target === "agent" && pick.ref) {
        pick.ref.hp = Math.min(pick.ref.maxHp, pick.ref.hp + healAmt);
        this.pushFloatingText(`+${healAmt}`, pick.ref.pos, 700, "green");
        this.pushEvent(
          `💚 ${healer.name} heals ${pick.ref.name} +${healAmt}`,
          healer.linkedPid
        );
      } else if (pick.target === "player") {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + healAmt);
        this.pushFloatingText(`+${healAmt}`, this.player.pos, 700, "green");
        this.pushEvent(`💚 ${healer.name} heals player +${healAmt}`, healer.linkedPid);
      }
    }
  }

  private dropItemsAroundBug(bug: EnemyBug): number {
    let qty = 0;
    if (bug.bossLevel >= 10) {
      qty = 3 + Math.floor(Math.random() * 2);
    } else if (bug.level >= 2) {
      qty = 1 + Math.floor(Math.random() * 2);
    } else {
      qty = 1 + Math.floor(Math.random() * 2);
    }
    const baseFood: TileType = this.mode === "bugs" ? "E" : "M";
    type DropKind = "food" | "heart" | "weapon";
    const pool: DropKind[] = ["food", "food", "food", "heart", "heart", "weapon"];
    const candidates: Position[] = [];
    candidates.push(bug.pos);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = bug.pos.x + dx;
        const ny = bug.pos.y + dy;
        if (!this.world.inBounds(nx, ny)) continue;
        if (!this.world.isWalkable(nx, ny)) continue;
        candidates.push({ x: nx, y: ny });
      }
    }
    let placed = 0;
    for (let i = 0; i < qty && i < candidates.length; i++) {
      const pos = candidates[i];
      const cur = this.world.tiles[pos.y][pos.x];
      const kind = pool[Math.floor(Math.random() * pool.length)];
      if (kind === "weapon") {
        if (this.weapons.length >= MAX_WEAPONS) continue;
        if (this.world.isInSafeZone(pos.x, pos.y)) continue;
        this.weaponSeq += 1;
        const bonus = Math.random() < 0.85 ? 1 : 2;
        this.weapons.push(new Weapon(`wpn${this.weaponSeq}`, pos, bonus));
        placed += 1;
      } else {
        if (cur !== "." && cur !== baseFood && cur !== "H") continue;
        this.world.setTile(pos.x, pos.y, kind === "heart" ? "H" : baseFood);
        placed += 1;
      }
    }
    return placed;
  }

  isFrozen(): boolean {
    if (this.paused) return true;
    if (!this.monitor.isConnected()) return true;
    const freshWindow = this.observerMode ? 30000 : 5000;
    if (this.mcpFresh(freshWindow)) return false;
    const anyActive = this.monitor.processes.some(
      (p) => this.monitor.pidState(p.pid) === "ACTIVE"
    );
    if (anyActive) return false;
    if (this.monitor.anyRecentlyActive(this.observerMode ? 30000 : 10000)) {
      return false;
    }
    if (this.observerMode) return false;
    const s = this.monitor.state();
    return s === "IDLE" || s === "STANDBY";
  }

  private syncAgentsWithMonitor(): void {
    const roots = this.monitor.roots();
    const livePids = new Set(roots.map((r) => r.pid));
    const linkedPids = new Set<number>();
    let agentSeq = this.agents.length;
    for (const proc of roots) {
      if (this.despawnedPids.has(proc.pid)) {
        if (this.monitor.pidState(proc.pid) === "ACTIVE") {
          this.despawnedPids.delete(proc.pid);
          this.pushEvent(`✨ Claude PID ${proc.pid} resumed — re-spawning agent`);
        } else {
          continue;
        }
      }
      const existing = this.agents.find((a) => a.linkedPid === proc.pid);
      if (existing) {
        if (existing.state() === "zombie") {
          existing.fsm.force("idle");
          existing.zombieTicks = 0;
        }
        linkedPids.add(proc.pid);
      } else {
        agentSeq += 1;
        const pos = this.world.randomWalkable();
        const themeKeys = this.theme.displayAvatars.map((a) => a.key);
        const playerCls = this.player.characterClass;
        const noPlayer = themeKeys.filter((k) => k !== playerCls);
        const usedAgents = new Set<CharacterClass>(
          this.agents.map((ag) => ag.characterClass)
        );
        const fresh = noPlayer.filter((k) => !usedAgents.has(k));
        const cls =
          fresh.length > 0
            ? fresh[Math.floor(Math.random() * fresh.length)]
            : noPlayer.length > 0
            ? noPlayer[Math.floor(Math.random() * noPlayer.length)]
            : randomClass();
        const classLabelStr = themedLabel(cls, this.theme);
        const sameClassCount =
          this.agents.filter((ag) => ag.characterClass === cls).length + 1;
        const agentName =
          sameClassCount > 1
            ? `${classLabelStr}-${sameClassCount}`
            : classLabelStr;
        const a = new Agent(
          `a${agentSeq}`,
          pos,
          agentName,
          "warrior",
          cls
        );
        a.linkedPid = proc.pid;
        a.verification_token = this.expectedToken;
        a.handshakeVerified = this.handshakeVerified;
        this.agents.push(a);
        this.pushEvent(
          `🆕 Agent Claude-${proc.pid} spawned as ${CLASS_SPECS[cls].label} ${CLASS_SPECS[cls].icon}`
        );
      }
    }
    for (const a of this.agents) {
      if (a.linkedPid !== null && !livePids.has(a.linkedPid)) {
        if (a.state() !== "zombie") {
          a.fsm.force("zombie");
          a.zombieTicks = 0;
          this.pushEvent(`💀 Claude-${a.linkedPid} → ZOMBIE/DISCONNECTED`);
        }
      }
    }
    this.agents = this.agents.filter((a) => {
      if (a.state() !== "zombie") return true;
      if (a.zombieTicks > 30) {
        this.pushEvent(`Agent Claude-${a.linkedPid} despawned`);
        return false;
      }
      return true;
    });
  }

  private resolveFairyHeal(): void {
    if (this.tick % FAIRY_HEAL_INTERVAL !== 0) return;
    for (const fairy of this.fairies) {
      if (fairy.hp <= 0) continue;
      for (const agent of this.agents) {
        if (manhattan(fairy.pos, agent.pos) <= FAIRY_HEAL_RANGE) {
          const healed = agent.healBy(FAIRY_HEAL_AMOUNT);
          if (healed > 0) {
            fairy.lastHealTick = this.tick;
            this.pushEvent(
              `${this.helperIcon()} Helper aplicando hotfix (curación) +${healed} HP a ${agent.name}`
            );
          }
        }
      }
    }
  }

  private resolveFairyCombat(): void {
    for (const fairy of this.fairies) {
      if (fairy.hp <= 0) continue;
      for (const bug of this.bugs) {
        if (bug.hp <= 0) continue;
        if (manhattan(bug.pos, fairy.pos) !== 1) continue;
        const fdist = manhattan(bug.pos, fairy.pos);
        const pdist = manhattan(bug.pos, this.player.pos);
        if (fdist <= pdist) {
          fairy.takeDamage(bug.atq, this.tick);
          this.pushEvent(`🐛 ${bug.name} hits ${this.helperIcon()} (-${bug.atq} HP)`);
        }
      }
    }
    const before = this.fairies.length;
    this.fairies = this.fairies.filter((f) => f.hp > 0);
    if (this.fairies.length < before) {
      this.fairyOffline = true;
      this.pushEvent(`💔 DEBUGGER OFFLINE — heal buff lost`);
    }
  }

  private refreshHandshakeFromBridge(): void {
    if (!this.bridge) return;
    const fresh = this.bridge.isFresh(60000);
    if (fresh && !this.handshakeVerified) {
      this.handshakeVerified = true;
      for (const a of this.agents) a.handshakeVerified = true;
      this.pushEvent(`✅ Bridge VERIFIED — sync age ${this.bridge.ageSec()}s`);
    } else if (!fresh && this.handshakeVerified && this.bridge.lastSyncedAt > 0) {
      this.handshakeVerified = false;
      for (const a of this.agents) a.handshakeVerified = false;
      this.pushEvent(`⏱ Bridge stale (>60s) — engine unverified`);
    }
  }

  private resolveCombat(): void {
    for (const agent of this.agents) {
      if (agent.hp <= 0) continue;
      if (agent.state() === "zombie") continue;
      if (this.agentIsFrozen(agent)) continue;
      if (this.agentIsInvulnerable(agent)) continue;
      for (const bug of this.bugs) {
        if (bug.hp <= 0) continue;
        if (manhattan(agent.pos, bug.pos) === 1) {
          const dmgToBug = Math.max(1, agent.atq - bug.def);
          agent.takeDamage(bug.atq, this.tick);
          bug.takeDamage(dmgToBug, this.tick);
          if (bug.hp <= 0) {
            agent.kills += 1;
            bug.killedBy = "agent";
            bug.killerName = agent.name;
          }
          this.pushEvent(
            `${agent.name} ${bug.name}: -${bug.atq}HP / -${dmgToBug}HP`
          );
          agent.pushLog(`fought ${bug.name} -${bug.atq} hp`);
        }
      }
    }
    if (!this.observerMode && this.player.hp > 0) {
      for (const bug of this.bugs) {
        if (bug.hp <= 0) continue;
        if (manhattan(this.player.pos, bug.pos) === 1) {
          if (Math.random() < this.effectiveDodge()) {
            this.pushFloatingText("MISS", this.player.pos, 1000, "white");
            this.pushEvent(`✨ DODGE — ${bug.name} missed`);
            continue;
          }
          const rawDmg = Math.max(1, bug.atq - this.player.def);
          const dmgCap = Math.max(3, Math.ceil(this.player.maxHp * 0.5));
          const dmg = Math.min(rawDmg, dmgCap);
          this.player.hp = Math.max(0, this.player.hp - dmg);
          this.player.damageFlashUntil = this.tick + 3;
          this.player.lastDamageTick = this.tick;
          this.pushFloatingText(`-${dmg}`, this.player.pos, 800, "red");
          this.pushEvent(
            `⚔ ${bug.name} ataca [PLAYER] -${dmg} HP (hp ${this.player.hp}/${this.player.maxHp})`
          );
        }
      }
      for (const ag of this.agents) {
        if (ag.state() !== "zombie") continue;
        if (manhattan(this.player.pos, ag.pos) === 1) {
          if (Math.random() < this.effectiveDodge()) {
            this.pushFloatingText("MISS", this.player.pos, 1000, "white");
            continue;
          }
          const dmg = 2;
          this.player.hp = Math.max(0, this.player.hp - dmg);
          this.player.damageFlashUntil = this.tick + 3;
          this.player.lastDamageTick = this.tick;
          this.pushFloatingText(`-${dmg} ZOMBIE`, this.player.pos, 800, "red");
          this.pushEvent(`💀 zombie ${ag.name} bites player -${dmg}`);
        }
      }
    }
    for (const bug of this.bugs) {
      if (bug.hp <= 0) {
        if (
          bug.bossLevel >= 10 &&
          this.currentRound >= this.totalRounds &&
          !bug.revivedOnce
        ) {
          bug.revivedOnce = true;
          bug.hp = bug.maxHp;
          const REVIVE_ATQ_CAP = 5 + this.currentRound * 2;
          bug.atq = Math.min(REVIVE_ATQ_CAP, bug.atq + 2);
          bug.lastDamageTick = this.tick;
          bug.killedBy = null;
          bug.killerName = null;
          this.pushEvent(
            `🔥 ${bug.name} REVIVES — final boss enraged! HP${bug.hp} ATQ${bug.atq}`,
            null,
            { pinned: true }
          );
          this.pushFloatingText("REVIVE", bug.pos, 1500, "red");
          continue;
        }
        const dropTiles = this.dropItemsAroundBug(bug);
        this.bugsKilled += 1;
        this.killTicks.push(this.tick);
        let xpGain = bug.level * 5;
        if (bug.bossLevel >= 10) xpGain = 25 + this.currentRound * 5;
        if (bug.name === "GOLDEN_BUG" || bug.name === "GOLDEN_BEAST") xpGain = 50;
        if (bug.killedBy === "player") {
          this.player.kills += 1;
          const lvl = this.player.gainXp(xpGain);
          this.pushFloatingText(`+${xpGain} XP`, bug.pos, 800, "cyan");
          if (lvl.leveled) {
            this.pushEvent(`⭐ LEVEL UP! L${lvl.newLevel} (+5 maxHP +1 ATQ)`);
            this.pushFloatingText(`LV ${lvl.newLevel}!`, this.player.pos, 800, "orange");
          }
        } else if (bug.killedBy === "agent") {
          this.pushFloatingText(`+${xpGain} XP`, bug.pos, 800, "magenta");
          const killerAgent = bug.killerName
            ? this.agents.find((a) => a.name === bug.killerName)
            : null;
          if (killerAgent) {
            killerAgent.kills += 1;
            const lvl = killerAgent.gainXp(xpGain);
            if (lvl.leveled) {
              this.pushEvent(
                `⭐ ${killerAgent.name} LEVEL UP L${lvl.newLevel} (+5 HP +1 ATQ +1 DEF)`,
                killerAgent.linkedPid
              );
              this.pushFloatingText(
                `LV ${lvl.newLevel}!`,
                killerAgent.pos,
                1000,
                "orange"
              );
            }
          }
        }
        const credit = bug.killerName ? ` by ${bug.killerName}` : "";
        const tag = bug.bossLevel >= 10 ? "💀 BOSS" : `L${bug.level}`;
        this.pushEvent(
          `${bug.name} ${tag} drop ${dropTiles} items${credit} (R${this.currentRound} kills:${this.bugsKilled})`
        );
      }
    }
    this.bugs = this.bugs.filter((b) => b.hp > 0);

    for (const a of this.agents) {
      if (a.hp <= 0 && a.deadSinceTick < 0) {
        this.agentDeathTicks.push(this.tick);
        this.maybeDeescalate();
        const killer = this.bugs.find(
          (b) => b.hp > 0 && manhattan(b.pos, a.pos) === 1
        );
        if (killer) {
          if (killer.bossLevel >= 10) {
            const HP_CAP = 80 + this.currentRound * 10;
            const ATQ_CAP = 5 + this.currentRound * 2;
            const newMax = Math.min(HP_CAP, killer.maxHp + 5);
            const newAtq = Math.min(ATQ_CAP, killer.atq + 1);
            const grew = newMax > killer.maxHp || newAtq > killer.atq;
            killer.maxHp = newMax;
            killer.hp = killer.maxHp;
            killer.atq = newAtq;
            this.pushEvent(
              grew
                ? `💀 BOSS ${killer.name} mató ${a.name} → hp${killer.hp}/atq${killer.atq} (cap r${this.currentRound})`
                : `💀 BOSS ${killer.name} mató ${a.name} (capped r${this.currentRound})`
            );
          } else {
            const HP_CAP = 20 + this.currentRound * 5;
            const ATQ_CAP = 3 + this.currentRound;
            const newMax = Math.min(HP_CAP, killer.maxHp + 4);
            const newAtq = Math.min(ATQ_CAP, killer.atq + 2);
            const grew = newMax > killer.maxHp || newAtq > killer.atq;
            killer.maxHp = newMax;
            killer.hp = killer.maxHp;
            killer.atq = newAtq;
            this.pushEvent(
              grew
                ? `💀 ${killer.name} mató ${a.name} → hp${killer.hp}/atq${killer.atq} (cap r${this.currentRound})`
                : `💀 ${killer.name} mató ${a.name} (capped r${this.currentRound})`
            );
          }
        }
        a.lastDamageTick = this.tick;
        a.deadSinceTick = this.tick;
        if (a.autoDeploys > 0) {
          a.autoDeploys -= 1;
          a.deadSinceTick = this.tick - 28;
          this.pushEvent(
            `${a.name} ⚡ Auto-Deploy — fast relocate (${a.autoDeploys} left)`,
            a.linkedPid
          );
        } else {
          this.pushEvent(`💀 ${a.name} down — relocating in 10s`, a.linkedPid);
        }
      }
    }
  }

  private resolveBugConsumption(): void {
    const ATQ_CAP = 3 + this.currentRound;
    const HP_CAP = 20 + this.currentRound * 5;
    for (const bug of this.bugs) {
      if (bug.bossLevel >= 10) continue;
      const t = this.world.tiles[bug.pos.y][bug.pos.x];
      if (t === "M" || t === "E" || t === "H") {
        this.world.setTile(bug.pos.x, bug.pos.y, ".");
        if (bug.maxHp < HP_CAP) {
          bug.maxHp = Math.min(HP_CAP, bug.maxHp + 1);
        }
        bug.hp = Math.min(bug.maxHp, bug.hp + 2);
        if (bug.atq < ATQ_CAP && bug.resourcesConsumed % 3 === 2) {
          bug.atq = Math.min(ATQ_CAP, bug.atq + 1);
        }
        const evolved = bug.consumeResource();
        if (evolved) {
          const stage = bug.level === 3 ? "💀 BOSS" : "👾 evolved";
          this.pushEvent(
            `${bug.name} ${stage} — HP${bug.hp} ATQ${bug.atq}`
          );
        }
      }
    }
  }

  private resolveAgentPickups(): void {
    const remaining: Weapon[] = [];
    for (const w of this.weapons) {
      const picker = this.agents.find(
        (a) => a.pos.x === w.pos.x && a.pos.y === w.pos.y
      );
      if (picker) {
        picker.atq = Math.min(10, picker.atq + w.bonus);
        picker.inventory.weapons += 1;
        picker.pickupFlashUntil = this.tick + 2;
        this.pushFloatingText(`+${w.bonus} ATQ`, picker.pos);
        this.pushEvent(`${picker.name} recoge weapon (+${w.bonus} ATQ)`);
        picker.pushLog(`picked weapon +${w.bonus} ATQ`);
      } else {
        remaining.push(w);
      }
    }
    this.weapons = remaining;

    for (const agent of this.agents) {
      const t = this.world.tiles[agent.pos.y][agent.pos.x];
      const woodIcon = this.theme.woodTile;
      const foodIcon = this.mode === "bugs" ? "🔋" : "🥩";
      if (t === "%") {
        agent.inventory.wood += 1;
        this.world.setTile(agent.pos.x, agent.pos.y, ".");
        agent.pickupFlashUntil = this.tick + 2;
        this.pushFloatingText(`+${woodIcon}`, agent.pos);
        this.pushEvent(`${agent.name} collects ${woodIcon}`);
      } else if (t === "M" || t === "E") {
        agent.inventory.meat += 1;
        this.world.setTile(agent.pos.x, agent.pos.y, ".");
        agent.pickupFlashUntil = this.tick + 2;
        this.pushFloatingText(`+10 HP`, agent.pos);
        this.pushEvent(`${agent.name} collects ${foodIcon}`);
      } else if (t === "H") {
        const healed = agent.healBy(10);
        this.world.setTile(agent.pos.x, agent.pos.y, ".");
        agent.pickupFlashUntil = this.tick + 2;
        this.pushFloatingText(`+${healed} HP`, agent.pos);
        this.pushEvent(`${agent.name} collects ❤️ +${healed} HP`);
      }
    }
  }

  private resolvePlayerPickups(): void {
    const remaining: Weapon[] = [];
    for (const w of this.weapons) {
      if (this.player.pos.x === w.pos.x && this.player.pos.y === w.pos.y) {
        const r = this.player.pickupWeapon(w.bonus);
        this.player.pickupFlashUntil = this.tick + 2;
        if (r.atqGain > 0) {
          this.pushFloatingText(`+${r.atqGain} ATQ`, this.player.pos, 800, "orange");
        }
        if (r.defGain > 0) {
          this.pushFloatingText(`+${r.defGain} DEF`, this.player.pos, 800, "cyan");
        }
        this.pushEvent(
          `>> [PLAYER] +${r.atqGain}ATQ${r.defGain > 0 ? ` +${r.defGain}DEF` : ""} (atq ${this.player.atq}/20 def ${this.player.def})`
        );
        /* sound removed */
      } else {
        remaining.push(w);
      }
    }
    this.weapons = remaining;

    const tile = this.world.tiles[this.player.pos.y][this.player.pos.x];
    if (tile === "H") {
      const healed = this.player.healBy(10);
      this.world.setTile(this.player.pos.x, this.player.pos.y, ".");
      this.player.pickupFlashUntil = this.tick + 2;
      this.pushFloatingText(`+${healed} HP`, this.player.pos, 800, "green");
      this.pushEvent(`>> [PLAYER] +${healed} HP`);
      /* sound removed */
    } else if (tile === "M" || tile === "E") {
      this.applyFoodEffect(tile, this.player.pos);
      this.world.setTile(this.player.pos.x, this.player.pos.y, ".");
      const partial = 30000;
      this.player.lastFedAt = Math.max(this.player.lastFedAt, Date.now() - 60000) + partial;
      const healed = this.player.healBy(3);
      this.player.pickupFlashUntil = this.tick + 2;
      if (healed > 0) {
        this.pushFloatingText(`+${healed} HP`, this.player.pos, 800, "green");
      } else {
        this.pushFloatingText(`+hunger`, this.player.pos, 800, "yellow");
      }
      this.pushEvent(
        `>> [PLAYER] ate ${tile === "M" ? "🥩" : "🔋"} +${healed}HP +hunger`
      );
    }
  }

  private spawnBug(): void {
    let pos: Position | null = null;
    for (let i = 0; i < 30; i++) {
      const candidate = this.world.randomWalkable();
      if (this.world.isInSafeZone(candidate.x, candidate.y)) continue;
      if (manhattan(candidate, this.player.pos) >= 6) {
        pos = candidate;
        break;
      }
    }
    if (!pos) {
      for (let i = 0; i < 30; i++) {
        const c = this.world.randomWalkable();
        if (!this.world.isInSafeZone(c.x, c.y)) {
          pos = c;
          break;
        }
      }
    }
    if (!pos) pos = this.world.randomWalkable();
    this.bugSeq += 1;
    this.bugNameSeq += 1;
    const pool = this.theme.enemyNames.length > 0 ? this.theme.enemyNames : BUG_NAMES;
    const fallback = pool[this.bugNameSeq % pool.length];
    const name =
      this.lastMcpAction && this.bugNameSeq % 2 === 0
        ? this.lastMcpAction
        : fallback;
    const bug = new EnemyBug(`bug${this.bugSeq}`, pos, name);
    const scalingLevel = Math.floor(this.tick / 100) + this.escalation * 2;
    bug.maxHp += scalingLevel;
    bug.hp = bug.maxHp;
    bug.atq += Math.floor(scalingLevel / 2);
    bug.def += Math.floor(scalingLevel / 4);
    bug.bossLevel = scalingLevel;
    if (scalingLevel >= 10) {
      bug.level = 3;
      bug.maxHp = Math.max(bug.maxHp, 25);
      bug.hp = bug.maxHp;
      bug.atq = Math.max(bug.atq, 5);
      this.pushEvent(`👹 BOSS ${name} (lvl ${scalingLevel}) appeared at (${pos.x},${pos.y})`);
    } else {
      this.pushEvent(`${name} (lvl ${scalingLevel}) appeared at (${pos.x},${pos.y})`);
    }
    this.bugs.push(bug);
  }

  private spawnWeaponAt(pos: Position): void {
    if (this.world.isInSafeZone(pos.x, pos.y)) return;
    this.weaponSeq += 1;
    const bonus = Math.random() < 0.85 ? 1 : 2;
    this.weapons.push(new Weapon(`wpn${this.weaponSeq}`, pos, bonus));
    const tag = bonus === 2 ? "🗡️ MAGIC" : "⚔️ ";
    this.pushEvent(`${tag} weapon +${bonus} @ (${pos.x},${pos.y})`);
  }

  private checkPlayerAssist(): void {
    for (const q of this.board.active()) {
      if (!q.requiresPlayer || q.playerAssisted) continue;
      if (!this.player.isAt(q.target) && !this.player.isAdjacent(q.target)) continue;
      const agent = this.agents.find((a) => a.id === q.assignedAgent);
      if (!agent) continue;
      if (agent.state() === "working" || agent.state() === "talking") {
        q.playerAssisted = true;
        agent.triggerAssist();
        this.player.questsHelped += 1;
        this.pushEvent(`player at quest target → ${agent.name} resumes`);
      }
    }
  }

  private spawnSideQuest(): Quest {
    const target = this.world.randomWalkable();
    const q = makeQuest(
      "Lost Relic",
      `recover at (${target.x},${target.y})`,
      "collect",
      target,
      25,
      undefined,
      true
    );
    this.board.add(q);
    this.markers.push(new QuestMarker(`mn${this.tick}`, target, q.id));
    return q;
  }

  private replenishQuests(): void {
    const a = this.world.randomWalkable();
    const b = this.world.randomWalkable();
    const patrol = [
      this.world.randomWalkable(),
      this.world.randomWalkable(),
    ];
    const q1 = makeQuest("Scavenge", `at (${a.x},${a.y})`, "collect", a, 12);
    const q2 = makeQuest("Recon", "patrol route", "patrol", patrol[0], 18, patrol);
    const q3 = makeQuest(
      "Visit Outpost",
      `visit (${b.x},${b.y})`,
      "visit",
      b,
      10,
      undefined,
      true
    );
    this.board.add(q1);
    this.board.add(q2);
    this.board.add(q3);
    this.markers.push(new QuestMarker(`m${this.tick}a`, a, q1.id));
    this.markers.push(new QuestMarker(`m${this.tick}b`, b, q3.id));
  }

  entitiesAt(x: number, y: number): Entity[] {
    const out: Entity[] = [];
    for (const m of this.markers) if (m.pos.x === x && m.pos.y === y) out.push(m);
    for (const w of this.weapons) if (w.pos.x === x && w.pos.y === y) out.push(w);
    for (const n of this.npcs) if (n.pos.x === x && n.pos.y === y) out.push(n);
    for (const f of this.fairies) if (f.pos.x === x && f.pos.y === y) out.push(f);
    for (const b of this.bugs) if (b.pos.x === x && b.pos.y === y) out.push(b);
    for (const a of this.agents) if (a.pos.x === x && a.pos.y === y) out.push(a);
    if (this.player.pos.x === x && this.player.pos.y === y) out.push(this.player);
    return out;
  }
}
