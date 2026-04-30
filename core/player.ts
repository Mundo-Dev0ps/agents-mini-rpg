import { Entity } from "./entity";
import { World } from "./world";
import { Position, TileType } from "./types";
import { Direction, DIR_DELTA, directionFromDelta } from "./direction";
import {
  CharacterClass,
  CLASS_SPECS,
  canBypass,
  canTurbo,
} from "./avatars";

export interface EquippedWeapon {
  name: string;
  bonus: number;
}

export class Player extends Entity {
  hp: number;
  maxHp: number;
  atq: number;
  baseAtq: number;
  def: number;
  spd: number;
  gold: number;
  questsHelped: number;
  facing: Direction;
  name: string;
  characterClass: CharacterClass;
  equipped: EquippedWeapon | null;
  abilityCooldown: number;
  turboActive: boolean;
  revealedResources: Set<string>;
  buffEndsAt: number;
  energy: number;
  maxEnergy: number;
  wood: number;
  meat: number;
  fish: number;
  plants: number;
  batteries: number;
  mana: number;
  lastFedAt: number;
  lastMoveTick: number;
  pickupFlashUntil: number;
  damageFlashUntil: number;
  xp: number;
  level: number;
  kills: number;
  lastDamageTick: number;
  berserkerEndsAt: number;
  berserkerCooldownUntil: number;
  lastRespawnTick: number;
  lastActivityTick: number;

  constructor(
    id: string,
    pos: Position,
    name: string = "player",
    characterClass: CharacterClass = "tech"
  ) {
    super(id, pos, "@");
    const spec = CLASS_SPECS[characterClass];
    this.maxHp = Math.round(15 * spec.hpMult);
    this.hp = this.maxHp;
    this.baseAtq = 1;
    this.atq = 1;
    this.def = spec.defStat;
    this.spd = spec.spdStat;
    this.gold = 0;
    this.questsHelped = 0;
    this.facing = "down";
    this.name = name;
    this.characterClass = characterClass;
    this.equipped = null;
    this.abilityCooldown = 0;
    this.turboActive = false;
    this.revealedResources = new Set();
    this.buffEndsAt = 0;
    this.energy = 0;
    this.maxEnergy = 100;
    this.wood = 0;
    this.meat = 0;
    this.fish = 0;
    this.plants = 0;
    this.batteries = 0;
    this.mana = 0;
    this.lastFedAt = Date.now();
    this.lastMoveTick = -100;
    this.pickupFlashUntil = -100;
    this.damageFlashUntil = -100;
    this.xp = 0;
    this.level = 1;
    this.kills = 0;
    this.lastDamageTick = -1000;
    this.berserkerEndsAt = -1000;
    this.berserkerCooldownUntil = 0;
    this.lastRespawnTick = -1000;
    this.lastActivityTick = -1000;
  }

  isBerserker(tick: number): boolean {
    return tick < this.berserkerEndsAt;
  }

  gainXp(amount: number): { leveled: boolean; newLevel: number } {
    this.xp += amount;
    const need = 20 * this.level;
    if (this.xp >= need) {
      this.xp -= need;
      this.level += 1;
      this.maxHp += 5;
      this.hp = this.maxHp;
      this.baseAtq += 1;
      this.atq = Math.min(20, this.atq + 1);
      this.def += 1;
      return { leveled: true, newLevel: this.level };
    }
    return { leveled: false, newLevel: this.level };
  }

  isFedRecently(windowMs: number = 30000): boolean {
    return this.lastFedAt > 0 && Date.now() - this.lastFedAt < windowMs;
  }

  gainEnergy(amount: number): number {
    const before = this.energy;
    this.energy = Math.min(this.maxEnergy, this.energy + amount);
    return this.energy - before;
  }

  isBuffed(): boolean {
    return Date.now() < this.buffEndsAt;
  }

  buffRemainingMs(): number {
    return Math.max(0, this.buffEndsAt - Date.now());
  }

  applyHealingBuff(durationMs: number): void {
    this.buffEndsAt = Date.now() + durationMs;
  }

  healBy(amount: number): number {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - before;
  }

  equip(name: string, bonus: number): void {
    this.equipped = { name, bonus };
    this.atq = Math.min(20, this.baseAtq + bonus);
  }

  pickupWeapon(bonus: number): { atqGain: number; defGain: number } {
    const before = this.atq;
    this.atq = Math.min(20, this.atq + bonus);
    const atqGain = this.atq - before;
    const overflow = bonus - atqGain;
    let defGain = 0;
    if (overflow > 0) {
      this.def += overflow;
      defGain = overflow;
    }
    return { atqGain, defGain };
  }

  totalAtq(): number {
    return this.atq;
  }

  bypassActive(): boolean {
    return canBypass(this.characterClass);
  }

  canTurbo(): boolean {
    return canTurbo(this.characterClass);
  }

  tickCooldown(): void {
    if (this.abilityCooldown > 0) this.abilityCooldown -= 1;
  }

  move(world: World, dir: Direction, blocked: Set<string>): boolean {
    const d = DIR_DELTA[dir];
    return this.stepBy(world, d.dx, d.dy, blocked);
  }

  tryMove(world: World, dx: number, dy: number, blocked: Set<string>): boolean {
    return this.stepBy(world, dx, dy, blocked);
  }

  private stepBy(
    world: World,
    dx: number,
    dy: number,
    blocked: Set<string>
  ): boolean {
    const dir = directionFromDelta(dx, dy);
    if (dir) this.facing = dir;
    const nx = this.pos.x + dx;
    const ny = this.pos.y + dy;
    if (!world.inBounds(nx, ny)) return false;
    if (!this.canEnter(world, nx, ny)) return false;
    const key = `${nx},${ny}`;
    if (blocked.has(key)) return false;
    this.pos = { x: nx, y: ny };
    return true;
  }

  private canEnter(world: World, x: number, y: number): boolean {
    if (this.bypassActive()) {
      if (world.isWalkable(x, y)) return true;
      const t = world.tiles[y][x];
      const passable: TileType[] = ["#", "%"];
      return passable.includes(t);
    }
    return world.isWalkable(x, y);
  }

  facingTile(): Position {
    const d = DIR_DELTA[this.facing];
    return { x: this.pos.x + d.dx, y: this.pos.y + d.dy };
  }

  isAt(p: Position): boolean {
    return this.pos.x === p.x && this.pos.y === p.y;
  }

  isAdjacent(p: Position): boolean {
    const dx = Math.abs(this.pos.x - p.x);
    const dy = Math.abs(this.pos.y - p.y);
    return dx + dy <= 1;
  }
}
