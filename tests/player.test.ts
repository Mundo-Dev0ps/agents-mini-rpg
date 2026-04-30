import { test } from "node:test";
import { strict as assert } from "node:assert";
import { Player } from "../core/player";
import { World } from "../core/world";

function placeFloor(w: World): void {
  for (let y = 0; y < w.tiles.length; y++) {
    for (let x = 0; x < w.tiles[0].length; x++) {
      w.tiles[y][x] = ".";
    }
  }
}

test("flyer can step through wall via bypass", () => {
  const w = new World(20, 15, "adventure");
  placeFloor(w);
  w.tiles[5][6] = "#";
  const p = new Player("p1", { x: 5, y: 5 }, "Test", "flyer");
  const ok = p.move(w, "right", new Set());
  assert.equal(ok, true);
  assert.deepEqual(p.pos, { x: 6, y: 5 });
});

test("mage cannot step through wall", () => {
  const w = new World(20, 15, "adventure");
  placeFloor(w);
  w.tiles[5][6] = "#";
  const p = new Player("p1", { x: 5, y: 5 }, "Test", "mage");
  const ok = p.move(w, "right", new Set());
  assert.equal(ok, false);
  assert.deepEqual(p.pos, { x: 5, y: 5 });
});

test("flyer cannot step through brick (B)", () => {
  const w = new World(20, 15, "bugs");
  placeFloor(w);
  w.tiles[5][6] = "B";
  const p = new Player("p1", { x: 5, y: 5 }, "Test", "flyer");
  const ok = p.move(w, "right", new Set());
  assert.equal(ok, false);
});

test("blocked set rejects move", () => {
  const w = new World(20, 15, "bugs");
  placeFloor(w);
  const p = new Player("p1", { x: 5, y: 5 }, "Test", "wolf");
  const blocked = new Set<string>(["6,5"]);
  const ok = p.move(w, "right", blocked);
  assert.equal(ok, false);
});

test("player healBy clamps to maxHp", () => {
  const p = new Player("p1", { x: 0, y: 0 }, "T", "wolf");
  p.hp = 5;
  const healed = p.healBy(1000);
  assert.equal(p.hp, p.maxHp);
  assert.equal(healed, p.maxHp - 5);
});

test("flyer maxHp greater than mage", () => {
  const f = new Player("a", { x: 0, y: 0 }, "F", "flyer");
  const m = new Player("b", { x: 0, y: 0 }, "M", "mage");
  assert.ok(f.maxHp > m.maxHp);
});
