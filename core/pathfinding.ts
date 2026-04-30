import { Position } from "./types";
import { World } from "./world";
import { DIRECTIONS, DIR_DELTA } from "./direction";

interface Node {
  pos: Position;
  parent: Node | null;
}

export interface BfsOptions {
  bypass?: boolean;
}

export function bfs(
  world: World,
  start: Position,
  goal: Position,
  opts: BfsOptions = {}
): Position[] {
  if (start.x === goal.x && start.y === goal.y) return [];
  const walkable = (x: number, y: number): boolean => {
    if (!world.inBounds(x, y)) return false;
    if (opts.bypass) {
      const t = world.tiles[y][x];
      return t !== "B";
    }
    return world.isWalkable(x, y);
  };
  if (!walkable(goal.x, goal.y)) return [];

  const visited = new Set<string>();
  const key = (p: Position) => `${p.x},${p.y}`;
  const queue: Node[] = [{ pos: start, parent: null }];
  visited.add(key(start));

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node.pos.x === goal.x && node.pos.y === goal.y) {
      return reconstruct(node);
    }
    for (const dir of DIRECTIONS) {
      const d = DIR_DELTA[dir];
      const nx = node.pos.x + d.dx;
      const ny = node.pos.y + d.dy;
      const k = `${nx},${ny}`;
      if (visited.has(k)) continue;
      if (!walkable(nx, ny)) continue;
      visited.add(k);
      queue.push({ pos: { x: nx, y: ny }, parent: node });
    }
  }
  return [];
}

function reconstruct(end: Node): Position[] {
  const path: Position[] = [];
  let cur: Node | null = end;
  while (cur && cur.parent) {
    path.push(cur.pos);
    cur = cur.parent;
  }
  return path.reverse();
}
