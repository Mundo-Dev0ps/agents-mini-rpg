import { test } from "node:test";
import { strict as assert } from "node:assert";
import { Game } from "../core/game";
import { EnemyBug } from "../core/entity";

function newGame(cls: "mage" | "wolf" | "tech" | "scout" | "flyer"): Game {
  return new Game({
    width: 20,
    height: 15,
    playerClass: cls,
    mode: "bugs",
    pacifist: true,
  });
}

test("Remote Patch hits bug in range", () => {
  const g = newGame("mage");
  g.player.pos = { x: 5, y: 5 };
  const bug = new EnemyBug("b1", { x: 6, y: 5 }, "TestBug");
  bug.maxHp = 10;
  bug.hp = 10;
  g.bugs.push(bug);
  const r = g.useAbility();
  assert.equal(r.used, true);
  assert.ok(bug.hp < 10, "bug damaged");
});

test("Remote Patch fails out of range", () => {
  const g = newGame("mage");
  g.player.pos = { x: 5, y: 5 };
  const bug = new EnemyBug("b1", { x: 15, y: 15 }, "FarBug");
  g.bugs.push(bug);
  const r = g.useAbility();
  assert.equal(r.used, false);
});

test("Log Sniffer records reveals", () => {
  const g = newGame("wolf");
  g.player.pos = { x: 5, y: 5 };
  g.world.setTile(6, 5, "M");
  g.world.setTile(7, 6, "H");
  const r = g.useAbility();
  assert.equal(r.used, true);
});

test("ability cooldown blocks reuse", () => {
  const g = newGame("mage");
  g.player.pos = { x: 5, y: 5 };
  const bug = new EnemyBug("b1", { x: 6, y: 5 }, "B");
  bug.hp = 100;
  bug.maxHp = 100;
  g.bugs.push(bug);
  g.useAbility();
  const second = g.useAbility();
  assert.equal(second.used, false);
  assert.match(second.message, /cooldown/);
});

test("Turbo passive — useAbility returns passive message", () => {
  const g = newGame("tech");
  const r = g.useAbility();
  assert.equal(r.used, false);
  assert.match(r.message, /passive/);
});

test("Bypass passive — useAbility returns passive message", () => {
  const g = newGame("flyer");
  const r = g.useAbility();
  assert.equal(r.used, false);
  assert.match(r.message, /passive/);
});

test("Final boss revives once on last round", () => {
  const g = newGame("wolf");
  g.currentRound = g.totalRounds;
  const boss = new EnemyBug("boss", { x: 10, y: 10 }, "FinalBoss");
  boss.bossLevel = 10;
  boss.maxHp = 50;
  boss.hp = 0;
  g.bugs.push(boss);
  (g as any).resolveCombat();
  const survived = g.bugs.find((b) => b.id === "boss");
  assert.ok(survived, "boss still in list after revive");
  assert.ok(survived!.revivedOnce, "revive flag set");
  assert.ok(survived!.hp > 0, "boss revived with HP");
});
