import { Position } from "./types";

export type Direction = "up" | "down" | "left" | "right";

export interface Delta {
  dx: number;
  dy: number;
}

export const DIRECTIONS: Direction[] = ["up", "right", "down", "left"];

export const DIR_DELTA: Record<Direction, Delta> = {
  up: { dx: 0, dy: -1 },
  right: { dx: 1, dy: 0 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
};

export const DIR_ARROW: Record<Direction, string> = {
  up: "↑",
  right: "→",
  down: "↓",
  left: "←",
};

export const DIR_EMOJI: Record<Direction, string> = {
  up: "⬆️ ",
  right: "➡️ ",
  down: "⬇️ ",
  left: "⬅️ ",
};

export function deltaFor(dir: Direction): Delta {
  return DIR_DELTA[dir];
}

export function directionFromDelta(dx: number, dy: number): Direction | null {
  for (const d of DIRECTIONS) {
    const v = DIR_DELTA[d];
    if (v.dx === dx && v.dy === dy) return d;
  }
  return null;
}

export function directionFromTo(a: Position, b: Position): Direction | null {
  return directionFromDelta(b.x - a.x, b.y - a.y);
}

export function manhattan(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export interface Neighbor {
  dir: Direction;
  x: number;
  y: number;
}

export function getNeighbors(x: number, y: number): Neighbor[] {
  return DIRECTIONS.map((dir) => {
    const d = DIR_DELTA[dir];
    return { dir, x: x + d.dx, y: y + d.dy };
  });
}
