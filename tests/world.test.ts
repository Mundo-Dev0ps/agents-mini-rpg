import { test } from "node:test";
import { strict as assert } from "node:assert";
import { World } from "../core/world";

test("world isWalkable for floor + items", () => {
  const w = new World(20, 15, "bugs");
  w.tiles[5][5] = ".";
  assert.equal(w.isWalkable(5, 5), true);
  w.tiles[5][5] = "H";
  assert.equal(w.isWalkable(5, 5), true);
  w.tiles[5][5] = "M";
  assert.equal(w.isWalkable(5, 5), true);
  w.tiles[5][5] = "T";
  assert.equal(w.isWalkable(5, 5), true);
});

test("world isWalkable false for obstacles", () => {
  const w = new World(20, 15, "bugs");
  w.tiles[5][5] = "#";
  assert.equal(w.isWalkable(5, 5), false);
  w.tiles[5][5] = "%";
  assert.equal(w.isWalkable(5, 5), false);
  w.tiles[5][5] = "B";
  assert.equal(w.isWalkable(5, 5), false);
  w.tiles[5][5] = "~";
  assert.equal(w.isWalkable(5, 5), false);
});

test("world out-of-bounds is not walkable", () => {
  const w = new World(20, 15, "bugs");
  assert.equal(w.isWalkable(-1, 5), false);
  assert.equal(w.isWalkable(20, 5), false);
  assert.equal(w.isWalkable(5, -1), false);
  assert.equal(w.isWalkable(5, 15), false);
});

test("world generation produces dimensions", () => {
  const w = new World(30, 20, "adventure");
  assert.equal(w.tiles.length, 20);
  assert.equal(w.tiles[0].length, 30);
});
