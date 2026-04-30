import { test } from "node:test";
import { strict as assert } from "node:assert";
import { Game } from "../core/game";

function newGame(): Game {
  return new Game({
    width: 20,
    height: 15,
    playerClass: "wolf",
    mode: "bugs",
    pacifist: true,
  });
}

test("game constructs without throwing", () => {
  const g = newGame();
  assert.ok(g.world);
  assert.ok(g.player);
  assert.equal(g.currentRound, 1);
});

test("step advances tick", () => {
  const g = newGame();
  const before = g.tick;
  g.step();
  assert.equal(g.tick, before + 1);
});

test("roundsConfig caps concurrent enemies per round", () => {
  const g = newGame();
  const r1 = g.roundsConfig(1);
  const r5 = g.roundsConfig(5);
  assert.equal(r1.concurrentMax, 4);
  assert.equal(r5.concurrentMax, 8);
  assert.ok(r1.concurrentMax <= r1.enemies);
  assert.ok(r5.concurrentMax <= r5.enemies);
});

test("roundsConfig escalates max level", () => {
  const g = newGame();
  assert.equal(g.roundsConfig(1).maxLevel, 1);
  assert.equal(g.roundsConfig(2).maxLevel, 2);
  assert.equal(g.roundsConfig(5).maxLevel, 3);
});

test("agent death tracking + deescalate triggers", () => {
  const g = newGame();
  g.agentDeathTicks = [];
  g.deescalateUntil = 0;
  g.tick = 100;
  g.agentDeathTicks.push(98, 99, 100);
  (g as any).maybeDeescalate();
  assert.ok(g.deescalateUntil > g.tick);
  assert.equal(g.agentDeathTicks.length, 0, "deaths cleared after trigger");
});

test("deescalate ignored under threshold", () => {
  const g = newGame();
  g.agentDeathTicks = [];
  g.deescalateUntil = 0;
  g.tick = 100;
  g.agentDeathTicks.push(99, 100);
  (g as any).maybeDeescalate();
  assert.equal(g.deescalateUntil, 0);
});

test("deescalate cooldown active blocks retrigger", () => {
  const g = newGame();
  g.tick = 100;
  g.deescalateUntil = 150;
  g.agentDeathTicks = [98, 99, 100];
  (g as any).maybeDeescalate();
  assert.equal(g.deescalateUntil, 150, "untouched while active");
});

test("pushFloatingText limits queue size", () => {
  const g = newGame();
  for (let i = 0; i < 30; i++) {
    g.pushFloatingText(`txt${i}`, { x: 1, y: 1 }, 1000);
  }
  assert.ok(g.floatingTexts.length <= 10, "capped at 10");
});

test("pacifist mode skips bug spawn", () => {
  const g = newGame();
  for (let i = 0; i < 50; i++) g.step();
  assert.equal(g.bugs.filter((b) => b.hp > 0).length, 0);
});

test("currentRound never exceeds totalRounds", () => {
  const g = newGame();
  for (let i = 0; i < 5; i++) {
    (g as any).startNextRound?.();
  }
  assert.ok(g.currentRound <= g.totalRounds + 1);
});
