import { TileType, Position } from "./types";
import { Neighbor, getNeighbors as gridNeighbors } from "./direction";
import { GameMode } from "./themes";

const SAFE_ZONE_COUNT = 4;

export interface WorldDistribution {
  treesAndRocksPct: number;
  woodPct: number;
  meatPct: number;
}

const DEFAULT_DIST: WorldDistribution = {
  treesAndRocksPct: 0.15,
  woodPct: 0.05,
  meatPct: 0.03,
};

const ITEM_TILES: ReadonlySet<TileType> = new Set<TileType>([
  "M",
  "G",
  "F",
  "E",
  "L",
  "H",
]);

const ITEM_TTL_MS = 90000;
const DENSITY_FACTOR = 0.25;

export class World {
  width: number;
  height: number;
  tiles: TileType[][];
  dist: WorldDistribution;
  itemExpiry: Map<string, number>;
  mode: GameMode;
  safeZone: Set<string>;

  constructor(
    width: number,
    height: number,
    mode: GameMode = "bugs",
    dist: WorldDistribution = DEFAULT_DIST
  ) {
    this.width = width;
    this.height = height;
    this.mode = mode;
    this.dist = dist;
    this.itemExpiry = new Map();
    this.safeZone = new Set();
    let attempt = 0;
    do {
      this.tiles = this.generate();
      attempt += 1;
    } while (!this.allWalkableConnected() && attempt < 6);
    if (!this.allWalkableConnected()) this.carveConnectivity();
    /* ensureMinResources removed — items now drop from kills only */
    this.drawSafeZone();
    this.registerInitialItems();
  }

  private drawSafeZone(): void {
    let placed = 0;
    let attempts = 0;
    while (placed < SAFE_ZONE_COUNT && attempts < 80) {
      attempts += 1;
      const size = Math.random() < 0.5 ? 1 : 2;
      const cx =
        2 + Math.floor(Math.random() * (this.width - 4 - size));
      const cy =
        2 + Math.floor(Math.random() * (this.height - 4 - size));
      const cells: Array<[number, number]> = [];
      let collision = false;
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (this.safeZone.has(`${nx},${ny}`)) {
            collision = true;
            break;
          }
          cells.push([nx, ny]);
        }
        if (collision) break;
      }
      if (collision) continue;
      for (const [nx, ny] of cells) {
        this.safeZone.add(`${nx},${ny}`);
        this.tiles[ny][nx] = "+";
        this.itemExpiry.delete(`${nx},${ny}`);
      }
      placed += 1;
    }
  }

  isInSafeZone(x: number, y: number): boolean {
    return this.safeZone.has(`${x},${y}`);
  }

  private ensureMinResources(minCount: number): void {
    const itemTypes: TileType[] = ["M", "E", "H"];
    let count = 0;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (itemTypes.includes(this.tiles[y][x])) count += 1;
      }
    }
    if (count >= minCount) return;
    const needed = minCount - count;
    const fillTypes: TileType[] = this.mode === "bugs" ? ["E", "H"] : ["M", "H"];
    let placed = 0;
    let attempts = 0;
    while (placed < needed && attempts < needed * 50) {
      attempts += 1;
      const x = 1 + Math.floor(Math.random() * (this.width - 2));
      const y = 1 + Math.floor(Math.random() * (this.height - 2));
      if (this.safeZone.has(`${x},${y}`)) continue;
      if (this.tiles[y][x] === ".") {
        const t = fillTypes[Math.floor(Math.random() * fillTypes.length)];
        this.tiles[y][x] = t;
        placed += 1;
      }
    }
  }

  private generate(): TileType[][] {
    const grid: TileType[][] = [];
    for (let y = 0; y < this.height; y++) {
      const row: TileType[] = [];
      for (let x = 0; x < this.width; x++) {
        if (
          x === 0 ||
          y === 0 ||
          x === this.width - 1 ||
          y === this.height - 1
        ) {
          row.push("#");
        } else {
          row.push(".");
        }
      }
      grid.push(row);
    }

    const totalInterior = (this.width - 2) * (this.height - 2);

    const forestCount = Math.max(1, Math.floor(totalInterior / 110));
    this.scatterForests(grid, forestCount);

    if (this.mode !== "adventure") {
      const lakeCount = Math.max(1, Math.floor(totalInterior / 120));
      this.scatterLakes(grid, lakeCount);
    }

    const rocks = Math.floor(
      totalInterior * this.dist.treesAndRocksPct * 0.4 * DENSITY_FACTOR
    );
    this.scatter(grid, "~", rocks);

    /* M/E/H scatter removed — items only drop from bug deaths */
    this.scatter(grid, "T", 2);
    if (this.mode !== "adventure") {
      this.scatterFishInWater(
        grid,
        Math.max(1, Math.floor(totalInterior * 0.015 * DENSITY_FACTOR))
      );
    }

    return grid;
  }

  private scatterForests(grid: TileType[][], count: number): void {
    for (let i = 0; i < count; i++) {
      const cx = 2 + Math.floor(Math.random() * (this.width - 4));
      const cy = 2 + Math.floor(Math.random() * (this.height - 4));
      const radius = 2 + Math.floor(Math.random() * 2);
      const density = 0.6 + Math.random() * 0.2;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > radius + 1) continue;
          if (Math.random() > density) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (
            nx <= 0 ||
            ny <= 0 ||
            nx >= this.width - 1 ||
            ny >= this.height - 1
          )
            continue;
          if (grid[ny][nx] === ".") grid[ny][nx] = "#";
        }
      }
    }
  }

  private scatterLakes(grid: TileType[][], count: number): void {
    for (let i = 0; i < count; i++) {
      const cx = 3 + Math.floor(Math.random() * (this.width - 6));
      const cy = 3 + Math.floor(Math.random() * (this.height - 6));
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (
            nx <= 0 ||
            ny <= 0 ||
            nx >= this.width - 1 ||
            ny >= this.height - 1
          )
            continue;
          grid[ny][nx] = "w";
        }
      }
      const extra = 2 + Math.floor(Math.random() * 4);
      for (let j = 0; j < extra; j++) {
        const dx = Math.floor(Math.random() * 5) - 2;
        const dy = Math.floor(Math.random() * 5) - 2;
        const nx = cx + dx;
        const ny = cy + dy;
        if (
          nx <= 0 ||
          ny <= 0 ||
          nx >= this.width - 1 ||
          ny >= this.height - 1
        )
          continue;
        if (grid[ny][nx] === ".") grid[ny][nx] = "w";
      }
    }
  }

  private scatterFishInWater(grid: TileType[][], count: number): void {
    const waterCells: Array<[number, number]> = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (grid[y][x] === "w") waterCells.push([x, y]);
      }
    }
    const target = Math.min(count, waterCells.length);
    for (let i = 0; i < target; i++) {
      const idx = Math.floor(Math.random() * waterCells.length);
      const [x, y] = waterCells[idx];
      grid[y][x] = "F";
      waterCells.splice(idx, 1);
    }
  }

  private registerInitialItems(): void {
    const now = Date.now();
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (ITEM_TILES.has(this.tiles[y][x])) {
          this.itemExpiry.set(`${x},${y}`, now + ITEM_TTL_MS);
        }
      }
    }
  }

  expireItems(now: number = Date.now()): Position[] {
    const expired: Position[] = [];
    for (const [k, exp] of this.itemExpiry) {
      if (exp <= now) {
        const [xs, ys] = k.split(",");
        const x = parseInt(xs, 10);
        const y = parseInt(ys, 10);
        const t = this.tiles[y]?.[x];
        if (t && ITEM_TILES.has(t)) {
          this.tiles[y][x] = ".";
          expired.push({ x, y });
        }
        this.itemExpiry.delete(k);
      }
    }
    return expired;
  }

  maybeSpawnCure(_probability: number = 0.01): Position | null {
    return null;
  }

  private scatter(grid: TileType[][], tile: TileType, count: number): void {
    let placed = 0;
    let attempts = 0;
    const maxAttempts = count * 25;
    while (placed < count && attempts < maxAttempts) {
      attempts += 1;
      const x = 1 + Math.floor(Math.random() * (this.width - 2));
      const y = 1 + Math.floor(Math.random() * (this.height - 2));
      if (grid[y][x] === ".") {
        grid[y][x] = tile;
        placed += 1;
      }
    }
  }

  clearArea(center: Position, radius: number): void {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = center.x + dx;
        const ny = center.y + dy;
        if (!this.inBounds(nx, ny)) continue;
        if (
          nx === 0 ||
          ny === 0 ||
          nx === this.width - 1 ||
          ny === this.height - 1
        )
          continue;
        this.tiles[ny][nx] = ".";
        this.itemExpiry.delete(`${nx},${ny}`);
      }
    }
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  isWalkable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const t = this.tiles[y][x];
    return (
      t === "." ||
      t === "M" ||
      t === "+" ||
      t === "L" ||
      t === "F" ||
      t === "G" ||
      t === "E" ||
      t === "H" ||
      t === "T" ||
      t === "w"
    );
  }

  tileAt(p: Position): TileType {
    return this.tiles[p.y][p.x];
  }

  randomWalkable(rand: () => number = Math.random): Position {
    for (let i = 0; i < 500; i++) {
      const x = Math.floor(rand() * this.width);
      const y = Math.floor(rand() * this.height);
      if (this.isWalkable(x, y)) return { x, y };
    }
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.isWalkable(x, y)) return { x, y };
      }
    }
    return { x: 1, y: 1 };
  }

  getNeighbors(x: number, y: number): Neighbor[] {
    return gridNeighbors(x, y);
  }

  walkableNeighbors(x: number, y: number): Neighbor[] {
    return gridNeighbors(x, y).filter((n) => this.isWalkable(n.x, n.y));
  }

  findTiles(...types: TileType[]): Position[] {
    const out: Position[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (types.includes(this.tiles[y][x])) out.push({ x, y });
      }
    }
    return out;
  }

  setTile(x: number, y: number, tile: TileType): void {
    if (!this.inBounds(x, y)) return;
    this.tiles[y][x] = tile;
    const k = `${x},${y}`;
    if (ITEM_TILES.has(tile)) {
      this.itemExpiry.set(k, Date.now() + ITEM_TTL_MS);
    } else {
      this.itemExpiry.delete(k);
    }
  }

  treeVariantAt(x: number, y: number): number {
    return Math.abs((x * 73856093) ^ (y * 19349663)) % 3;
  }

  allWalkableConnected(): boolean {
    let start: Position | null = null;
    let total = 0;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.isWalkable(x, y)) {
          total += 1;
          if (!start) start = { x, y };
        }
      }
    }
    if (!start || total === 0) return true;
    const visited = new Set<string>();
    const stack: Position[] = [start];
    visited.add(`${start.x},${start.y}`);
    while (stack.length > 0) {
      const p = stack.pop()!;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = p.x + dx;
        const ny = p.y + dy;
        const k = `${nx},${ny}`;
        if (visited.has(k)) continue;
        if (!this.isWalkable(nx, ny)) continue;
        visited.add(k);
        stack.push({ x: nx, y: ny });
      }
    }
    return visited.size === total;
  }

  private carveConnectivity(): void {
    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        const t = this.tiles[y][x];
        if (t !== "." && t !== "%" && t !== "M" && t !== "G" && t !== "+") {
          if ((x + y) % 3 === 0) this.tiles[y][x] = ".";
        }
      }
    }
  }
}
