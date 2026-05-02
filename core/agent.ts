import { Entity, EnemyBug, Weapon } from "./entity";
import { FSM } from "./fsm";
import { bfs } from "./pathfinding";
import { World } from "./world";
import { Direction, directionFromTo, manhattan } from "./direction";
import { Brain, Decision, buildObservation, Operator } from "./brain";
import { CharacterClass, CLASS_SPECS, canBypass } from "./avatars";
import { ProcessMonitor } from "./process_monitor";
import {
  AgentRole,
  AgentState,
  AgentSnapshot,
  Position,
  AgentInventory,
} from "./types";

const MAX_LOG = 6;
const MAX_THOUGHT_STREAM = 5;

export interface AgentContext {
  weapons: Weapon[];
  bugs: EnemyBug[];
  tick: number;
  world: World;
  npcs: Array<{ name: string; pos: Position }>;
  brain: Brain;
  operator: Operator;
  monitor: ProcessMonitor;
  mcpConnected: boolean;
  mcpFresh: boolean;
  mcpLastAction: string;
}

const MCP_IDLE_RE = /idle|awaiting|wait|pending|ready/i;

export interface ThoughtEntry {
  tick: number;
  text: string;
  action: Decision["action"];
  tokens: number;
}

export class Agent extends Entity {
  name: string;
  role: AgentRole;
  fsm: FSM;
  hp: number;
  maxHp: number;
  atq: number;
  questId: string | null;
  path: Position[];
  workTicks: number;
  log: string[];
  inventory: AgentInventory;
  facing: Direction;
  reasoning: string;
  lastDamageTick: number;
  lastMoveTick: number;
  pickupFlashUntil: number;
  damageFlashUntil: number;
  processId: string;
  tokensUsed: number;
  decisionsMade: number;
  thoughtStream: ThoughtEntry[];
  pendingDecision: Promise<Decision> | null;
  currentDecision: Decision | null;
  autoDeploys: number;
  verification_token: string;
  lastExternalCommand: string | null;
  handshakeVerified: boolean;
  characterClass: CharacterClass;
  linkedPid: number | null;
  zombieTicks: number;
  kills: number;
  level: number;
  xp: number;
  def: number;
  deadSinceTick: number;
  deathCount: number;
  needsInputSinceMs: number;
  lastIdleNotifyMs: number;
  invulnUntilTick: number;
  actionHistory: Array<{ tick: number; icon: string; label: string }>;
  needsInput: boolean;
  errorState: boolean;
  bashActive: boolean;

  constructor(
    id: string,
    pos: Position,
    name: string,
    role: AgentRole,
    characterClass: CharacterClass = "tech"
  ) {
    super(id, pos, "A");
    this.name = name;
    this.role = role;
    this.fsm = new FSM("idle");
    this.characterClass = characterClass;
    const spec = CLASS_SPECS[characterClass];
    this.maxHp = Math.round(30 * spec.hpMult);
    this.hp = this.maxHp;
    this.atq = Math.min(10, characterClass === "wolf" ? 3 : 2);
    this.questId = null;
    this.path = [];
    this.workTicks = 0;
    this.log = [];
    this.inventory = {
      gold: 0,
      wood: 0,
      meat: 0,
      water: 0,
      weapons: 0,
      items: [],
    };
    this.facing = "down";
    this.reasoning = "spawned, awaiting first observation";
    this.lastDamageTick = -100;
    this.lastMoveTick = -100;
    this.pickupFlashUntil = -100;
    this.damageFlashUntil = -100;
    this.processId = `PID-${Math.floor(Math.random() * 9000 + 1000)}`;
    this.tokensUsed = 0;
    this.decisionsMade = 0;
    this.thoughtStream = [];
    this.pendingDecision = null;
    this.currentDecision = null;
    this.autoDeploys = 0;
    this.verification_token = "";
    this.lastExternalCommand = null;
    this.handshakeVerified = false;
    this.linkedPid = null;
    this.zombieTicks = 0;
    this.kills = 0;
    this.level = 1;
    this.xp = 0;
    this.def = spec.defStat;
    this.deadSinceTick = -1;
    this.deathCount = 0;
    this.needsInputSinceMs = 0;
    this.lastIdleNotifyMs = 0;
    this.invulnUntilTick = 0;
    this.actionHistory = [];
    this.needsInput = false;
    this.errorState = false;
    this.bashActive = false;
  }

  pushAction(tick: number, icon: string, label: string): void {
    this.actionHistory.push({ tick, icon, label: label.slice(0, 20) });
    if (this.actionHistory.length > 5) this.actionHistory.shift();
  }

  gainXp(amount: number): { leveled: boolean; newLevel: number } {
    this.xp += amount;
    const need = 15 * this.level;
    if (this.xp >= need) {
      this.xp -= need;
      this.level += 1;
      this.maxHp += 5;
      this.hp = this.maxHp;
      this.atq = Math.min(20, this.atq + 1);
      this.def = Math.min(20, this.def + 1);
      return { leveled: true, newLevel: this.level };
    }
    return { leveled: false, newLevel: this.level };
  }

  healBy(amount: number): number {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - before;
  }

  state(): AgentState {
    return this.fsm.current();
  }

  pushLog(msg: string): void {
    this.log.push(msg);
    if (this.log.length > MAX_LOG) this.log.shift();
  }

  takeDamage(amount: number, tick: number): void {
    this.hp = Math.max(0, this.hp - amount);
    this.lastDamageTick = tick;
    this.damageFlashUntil = tick + 3;
  }

  latestThought(): ThoughtEntry | null {
    return this.thoughtStream.length > 0
      ? this.thoughtStream[this.thoughtStream.length - 1]
      : null;
  }

  snapshot(): AgentSnapshot {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      state: this.state(),
      pos: { ...this.pos },
      facing: this.facing,
      hp: this.hp,
      maxHp: this.maxHp,
      atq: this.atq,
      questId: this.questId,
      log: [...this.log],
      inventory: { ...this.inventory, items: [...this.inventory.items] },
    };
  }

  update(world: World, occupied: Set<string>, ctx: AgentContext): void {
    if (this.state() === "zombie") {
      this.zombieTicks += 1;
      this.path = [];
      return;
    }
    if (this.linkedPid !== null) {
      const proc = ctx.monitor.getByPid(this.linkedPid);
      if (!proc) {
        this.fsm.force("zombie");
        this.reasoning = `💀 PID ${this.linkedPid} terminated — ZOMBIE`;
        this.path = [];
        this.currentDecision = null;
        this.pendingDecision = null;
        return;
      }
      const pidState = ctx.monitor.pidState(proc.pid);
      if (pidState === "ACTIVE") {
        // CPU evidence — proceed regardless of MCP staleness
      } else if (pidState === "STANDBY") {
        // STANDBY = CPU activity 1-15%, treat as alive
      } else if (ctx.mcpConnected && ctx.mcpFresh) {
        if (MCP_IDLE_RE.test(ctx.mcpLastAction)) {
          this.fsm.force("sleep");
          this.reasoning = `💤 MCP says "${ctx.mcpLastAction}" — sitting`;
          this.path = [];
          return;
        }
      } else {
        this.fsm.force("sleep");
        this.reasoning = `💤 idle... PID ${proc.pid} cpu ${proc.cpu.toFixed(1)}%`;
        this.path = [];
        return;
      }
    } else {
      if (ctx.monitor.processes.length === 0) {
        this.fsm.force("sleep");
        this.reasoning = "💤 No claude processes — SLEEP";
        this.path = [];
        this.currentDecision = null;
        return;
      }
    }
    this.maybeRequestDecision(ctx);
    this.actOnDecision(world, occupied, ctx);
  }

  private maybeRequestDecision(ctx: AgentContext): void {
    if (this.pendingDecision || this.currentDecision) return;
    const obs = buildObservation(
      {
        id: this.id,
        processId: this.processId,
        name: this.name,
        pos: this.pos,
        hp: this.hp,
        maxHp: this.maxHp,
        atq: this.atq,
        inventory: this.inventory,
      },
      ctx.world,
      ctx.bugs,
      ctx.weapons,
      ctx.npcs,
      ctx.tick,
      ctx.operator
    );
    const promise = ctx.brain.decide(obs);
    this.pendingDecision = promise;
    this.reasoning = "thinking...";
    promise
      .then((d) => {
        this.currentDecision = d;
        this.pendingDecision = null;
        this.tokensUsed += d.tokensUsed;
        this.decisionsMade += 1;
        this.thoughtStream.push({
          tick: ctx.tick,
          text: d.thought,
          action: d.action,
          tokens: d.tokensUsed,
        });
        if (this.thoughtStream.length > MAX_THOUGHT_STREAM) {
          this.thoughtStream.shift();
        }
        this.reasoning = `[${d.action}] ${d.thought}`;
        this.pushLog(`${d.action}: ${d.thought.slice(0, 40)}`);
      })
      .catch((err) => {
        this.pendingDecision = null;
        this.reasoning = `decision error: ${err}`;
      });
  }

  private actOnDecision(
    world: World,
    occupied: Set<string>,
    ctx: AgentContext
  ): void {
    const d = this.currentDecision;
    if (!d) {
      this.fsm.force("idle");
      return;
    }

    if (d.action === "WAIT") {
      this.fsm.force("idle");
      this.currentDecision = null;
      return;
    }

    if (d.action === "BUILD") {
      if (this.inventory.wood > 3) {
        const tile = ctx.world.tiles[this.pos.y][this.pos.x];
        if (tile === ".") {
          ctx.world.setTile(this.pos.x, this.pos.y, "B");
          this.inventory.wood -= 3;
          this.fsm.force("working");
          this.pushLog(`built 🧱 at (${this.pos.x},${this.pos.y})`);
        }
      } else {
        this.pushLog(`BUILD failed: insufficient wood`);
      }
      this.currentDecision = null;
      return;
    }

    if (!d.target) {
      this.fsm.force("idle");
      this.currentDecision = null;
      return;
    }

    if (!this.targetStillRelevant(d, ctx)) {
      this.currentDecision = null;
      return;
    }

    const target = d.target;
    const adjacent = manhattan(this.pos, target) === 1;
    const onTarget = this.pos.x === target.x && this.pos.y === target.y;

    if (d.action === "ATTACK") {
      if (adjacent) {
        const dir = directionFromTo(this.pos, target);
        if (dir) this.facing = dir;
        this.fsm.force("fighting");
        return;
      }
      this.fsm.force("moving");
      this.recomputePath(world, target);
      this.stepPath(world, occupied, ctx.tick);
      if (this.path.length === 0 && !adjacent) {
        this.currentDecision = null;
      }
      return;
    }

    if (d.action === "COLLECT") {
      if (onTarget) {
        this.fsm.force("working");
        this.currentDecision = null;
        return;
      }
      this.fsm.force("moving");
      this.recomputePath(world, target);
      this.stepPath(world, occupied, ctx.tick);
      return;
    }

    if (d.action === "MOVE") {
      if (onTarget) {
        this.currentDecision = null;
        this.fsm.force("idle");
        return;
      }
      this.fsm.force("moving");
      this.recomputePath(world, target);
      this.stepPath(world, occupied, ctx.tick);
      if (this.path.length === 0) {
        this.currentDecision = null;
      }
    }
  }

  private targetStillRelevant(d: Decision, ctx: AgentContext): boolean {
    if (!d.target) return false;
    if (d.action === "ATTACK") {
      return ctx.bugs.some(
        (b) => b.pos.x === d.target!.x && b.pos.y === d.target!.y && b.hp > 0
      );
    }
    if (d.action === "COLLECT") {
      const weapon = ctx.weapons.some(
        (w) => w.pos.x === d.target!.x && w.pos.y === d.target!.y
      );
      if (weapon) return true;
      const t = ctx.world.tiles[d.target!.y]?.[d.target!.x];
      return (
        t === "%" ||
        t === "M" ||
        t === "E" ||
        t === "$" ||
        t === "H"
      );
    }
    return true;
  }

  private recomputePath(world: World, target: Position): void {
    if (this.path.length > 0) {
      const last = this.path[this.path.length - 1];
      if (last.x === target.x && last.y === target.y) return;
    }
    this.path = bfs(world, this.pos, target, {
      bypass: canBypass(this.characterClass),
    });
  }

  private stepPath(world: World, occupied: Set<string>, tick: number): void {
    if (this.path.length === 0) return;
    const next = this.path[0];
    const key = `${next.x},${next.y}`;
    if (occupied.has(key)) {
      if (Math.random() < 0.3) this.path = [];
      return;
    }
    const bypass = canBypass(this.characterClass);
    const tile = world.tiles[next.y]?.[next.x];
    const passable = bypass
      ? world.inBounds(next.x, next.y) && tile !== "B"
      : world.isWalkable(next.x, next.y);
    if (!passable) {
      this.path = [];
      return;
    }
    const dir = directionFromTo(this.pos, next);
    if (dir) this.facing = dir;
    occupied.delete(`${this.pos.x},${this.pos.y}`);
    this.pos = next;
    occupied.add(key);
    this.path.shift();
    this.lastMoveTick = tick;
  }

  triggerAssist(): void {
    if (this.workTicks > 1) this.workTicks = 1;
  }
}
