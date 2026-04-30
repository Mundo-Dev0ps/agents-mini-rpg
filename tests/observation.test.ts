import { test } from "node:test";
import { strict as assert } from "node:assert";
import { buildObservation } from "../core/brain";
import { World } from "../core/world";

test("observation includes heart H tile", () => {
  const w = new World(20, 15, "bugs");
  for (let y = 0; y < 15; y++) for (let x = 0; x < 20; x++) w.tiles[y][x] = ".";
  w.tiles[5][6] = "H";
  const obs = buildObservation(
    {
      id: "a1",
      processId: "p1",
      name: "Test",
      pos: { x: 5, y: 5 },
      hp: 10,
      maxHp: 10,
      atq: 2,
      inventory: { wood: 0, meat: 0, weapons: 0 },
    },
    w,
    [],
    [],
    [],
    0,
    { username: "u", display_name: "U", hostname: "h" }
  );
  const heart = obs.nearby_entities.resources.find((r) => r.kind === "heart");
  assert.ok(heart, "heart resource detected");
  assert.deepEqual(heart!.pos, { x: 6, y: 5 });
});

test("observation includes energy E + cure +", () => {
  const w = new World(20, 15, "bugs");
  for (let y = 0; y < 15; y++) for (let x = 0; x < 20; x++) w.tiles[y][x] = ".";
  w.tiles[5][6] = "E";
  w.tiles[5][7] = "+";
  const obs = buildObservation(
    {
      id: "a1",
      processId: "p1",
      name: "Test",
      pos: { x: 5, y: 5 },
      hp: 10,
      maxHp: 10,
      atq: 2,
      inventory: { wood: 0, meat: 0, weapons: 0 },
    },
    w,
    [],
    [],
    [],
    0,
    { username: "u", display_name: "U", hostname: "h" }
  );
  const energy = obs.nearby_entities.resources.find((r) => r.kind === "energy");
  const cure = obs.nearby_entities.resources.find((r) => r.kind === "cure");
  assert.ok(energy, "energy detected");
  assert.ok(cure, "cure detected");
});

test("observation excludes resources beyond vision radius", () => {
  const w = new World(40, 30, "bugs");
  for (let y = 0; y < 30; y++) for (let x = 0; x < 40; x++) w.tiles[y][x] = ".";
  w.tiles[20][20] = "H";
  const obs = buildObservation(
    {
      id: "a1",
      processId: "p1",
      name: "Test",
      pos: { x: 0, y: 0 },
      hp: 10,
      maxHp: 10,
      atq: 2,
      inventory: { wood: 0, meat: 0, weapons: 0 },
    },
    w,
    [],
    [],
    [],
    0,
    { username: "u", display_name: "U", hostname: "h" }
  );
  const heart = obs.nearby_entities.resources.find((r) => r.kind === "heart");
  assert.equal(heart, undefined, "far heart NOT in observation");
});
