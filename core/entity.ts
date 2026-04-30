import { Position } from "./types";
import { World } from "./world";
import { bfs } from "./pathfinding";
import { manhattan } from "./direction";

export abstract class Entity {
  id: string;
  pos: Position;
  symbol: string;

  constructor(id: string, pos: Position, symbol: string) {
    this.id = id;
    this.pos = { ...pos };
    this.symbol = symbol;
  }
}

export class NPC extends Entity {
  name: string;
  dialogue: string;

  constructor(id: string, pos: Position, name: string, dialogue: string) {
    super(id, pos, "N");
    this.name = name;
    this.dialogue = dialogue;
  }
}

export class QuestMarker extends Entity {
  questId: string;
  constructor(id: string, pos: Position, questId: string) {
    super(id, pos, "Q");
    this.questId = questId;
  }
}

export class Weapon extends Entity {
  bonus: number;
  constructor(id: string, pos: Position, bonus: number = 5) {
    super(id, pos, "W");
    this.bonus = bonus;
  }
}

export type SubAgentTask =
  | "research"
  | "review"
  | "explore"
  | "build"
  | "debug"
  | "test";

export type SubAgentState = "spawning" | "working" | "returning" | "done";

export class SubAgent extends Entity {
  parentAgentId: string;
  parentPid: number | null;
  task: SubAgentTask;
  state: SubAgentState;
  spawnTick: number;
  doneTick: number;
  resultIcon: string;
  note: string;

  constructor(
    id: string,
    parentAgentId: string,
    parentPid: number | null,
    task: SubAgentTask,
    pos: Position,
    spawnTick: number
  ) {
    super(id, pos, "S");
    this.parentAgentId = parentAgentId;
    this.parentPid = parentPid;
    this.task = task;
    this.state = "spawning";
    this.spawnTick = spawnTick;
    this.doneTick = -1;
    this.resultIcon = "";
    this.note = "";
  }

  taskIcon(): string {
    switch (this.task) {
      case "research":
        return "🔍";
      case "review":
        return "📝";
      case "explore":
        return "🧭";
      case "build":
        return "🔨";
      case "debug":
        return "🐞";
      case "test":
        return "✅";
      default:
        return "✨";
    }
  }
}

export class Fairy extends Entity {
  hp: number;
  maxHp: number;
  lastDamageTick: number;
  lastBuffHealAt: number;
  lastHealTick: number;

  constructor(id: string, pos: Position) {
    super(id, pos, "F");
    this.hp = 30;
    this.maxHp = 30;
    this.lastDamageTick = -100;
    this.lastBuffHealAt = 0;
    this.lastHealTick = -100;
  }

  takeDamage(amount: number, tick: number): void {
    this.hp = Math.max(0, this.hp - amount);
    this.lastDamageTick = tick;
  }

  update(world: World, occupied: Set<string>, target: Position): void {
    if (manhattan(this.pos, target) <= 1) return;
    const path = bfs(world, this.pos, target);
    if (path.length <= 1) return;
    const next = path[0];
    const key = `${next.x},${next.y}`;
    if (occupied.has(key)) return;
    if (!world.isWalkable(next.x, next.y)) return;
    occupied.delete(`${this.pos.x},${this.pos.y}`);
    this.pos = next;
    occupied.add(key);
  }
}

export class EnemyBug extends Entity {
  hp: number;
  maxHp: number;
  atq: number;
  def: number;
  lastDamageTick: number;
  name: string;
  level: number;
  bossLevel: number;
  resourcesConsumed: number;
  iconOverride: string | null;
  spawnTick: number;
  killedBy: "player" | "agent" | "fairy" | "timeout" | null;
  killerName: string | null;
  revivedOnce: boolean;

  constructor(id: string, pos: Position, name: string = "GenericBug") {
    super(id, pos, "B");
    this.hp = 8;
    this.maxHp = 8;
    this.atq = 2;
    this.def = 0;
    this.lastDamageTick = -100;
    this.name = name;
    this.level = 1;
    this.bossLevel = 0;
    this.resourcesConsumed = 0;
    this.iconOverride = null;
    this.spawnTick = 0;
    this.killedBy = null;
    this.killerName = null;
    this.revivedOnce = false;
  }

  takeDamage(amount: number, tick: number): void {
    this.hp = Math.max(0, this.hp - amount);
    this.lastDamageTick = tick;
  }

  evolve(): boolean {
    let evolved = false;
    if (this.resourcesConsumed >= 5 && this.level < 3) {
      this.level = 3;
      this.maxHp = 25;
      this.hp = this.maxHp;
      this.atq = 6;
      evolved = true;
    } else if (this.resourcesConsumed >= 2 && this.level < 2) {
      this.level = 2;
      this.maxHp = 14;
      this.hp = this.maxHp;
      this.atq = 4;
      evolved = true;
    }
    return evolved;
  }

  consumeResource(): boolean {
    this.resourcesConsumed += 1;
    return this.evolve();
  }

  update(
    world: World,
    occupied: Set<string>,
    resourceTiles: Position[]
  ): void {
    if (resourceTiles.length > 0) {
      let nearest: Position | null = null;
      let nearestDist = Infinity;
      for (const t of resourceTiles) {
        const d = manhattan(this.pos, t);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = t;
        }
      }
      if (nearest && (this.pos.x !== nearest.x || this.pos.y !== nearest.y)) {
        const path = bfs(world, this.pos, nearest);
        if (path.length > 0) {
          const next = path[0];
          const key = `${next.x},${next.y}`;
          if (!occupied.has(key) && world.isWalkable(next.x, next.y)) {
            occupied.delete(`${this.pos.x},${this.pos.y}`);
            this.pos = next;
            occupied.add(key);
            return;
          }
        }
      }
    }
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
      const nx = this.pos.x + d.dx;
      const ny = this.pos.y + d.dy;
      const key = `${nx},${ny}`;
      if (occupied.has(key)) continue;
      if (!world.isWalkable(nx, ny)) continue;
      occupied.delete(`${this.pos.x},${this.pos.y}`);
      this.pos = { x: nx, y: ny };
      occupied.add(key);
      return;
    }
  }
}
