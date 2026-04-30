import { test } from "node:test";
import { strict as assert } from "node:assert";
import { Agent } from "../core/agent";

function newAgent(): Agent {
  return new Agent("a1", { x: 0, y: 0 }, "Tester", "warrior", "wolf");
}

test("agent starts at level 1 xp 0", () => {
  const a = newAgent();
  assert.equal(a.level, 1);
  assert.equal(a.xp, 0);
});

test("agent gainXp under threshold no level up", () => {
  const a = newAgent();
  const r = a.gainXp(5);
  assert.equal(r.leveled, false);
  assert.equal(a.xp, 5);
  assert.equal(a.level, 1);
});

test("agent gainXp triggers level up + heal + stats", () => {
  const a = newAgent();
  a.hp = 1;
  const beforeMax = a.maxHp;
  const beforeAtq = a.atq;
  const beforeDef = a.def;
  const r = a.gainXp(15);
  assert.equal(r.leveled, true);
  assert.equal(a.level, 2);
  assert.equal(a.maxHp, beforeMax + 5);
  assert.equal(a.hp, a.maxHp, "healed full on level up");
  assert.equal(a.atq, beforeAtq + 1);
  assert.equal(a.def, beforeDef + 1);
});

test("agent gainXp carries excess to next level", () => {
  const a = newAgent();
  a.gainXp(20);
  assert.equal(a.level, 2);
  assert.equal(a.xp, 5);
});

test("agent multiple level-ups consecutive", () => {
  const a = newAgent();
  a.gainXp(15);
  assert.equal(a.level, 2);
  a.gainXp(30);
  assert.equal(a.level, 3);
});

test("agent atq capped at 20 on level-up spam", () => {
  const a = newAgent();
  for (let i = 0; i < 50; i++) a.gainXp(100);
  assert.ok(a.atq <= 20);
  assert.ok(a.def <= 20);
});

test("agent def initialized from class spec", () => {
  const a = new Agent("a", { x: 0, y: 0 }, "T", "warrior", "tech");
  assert.equal(a.def, 15);
  const f = new Agent("b", { x: 0, y: 0 }, "F", "warrior", "flyer");
  assert.equal(f.def, 10);
});
