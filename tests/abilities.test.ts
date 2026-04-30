import { test } from "node:test";
import { strict as assert } from "node:assert";
import { canBypass, canTurbo, CLASS_SPECS, ALL_CLASSES, parseClass } from "../core/avatars";

test("canBypass true for bypass classes", () => {
  assert.equal(canBypass("flyer"), true);
  assert.equal(canBypass("scout"), true);
});

test("canBypass false for non-bypass classes", () => {
  assert.equal(canBypass("mage"), false);
  assert.equal(canBypass("tech"), false);
  assert.equal(canBypass("wolf"), false);
});

test("canTurbo true only for tech", () => {
  assert.equal(canTurbo("tech"), true);
  assert.equal(canTurbo("mage"), false);
  assert.equal(canTurbo("wolf"), false);
  assert.equal(canTurbo("scout"), false);
  assert.equal(canTurbo("flyer"), false);
});

test("each class has unique ability spec", () => {
  for (const c of ALL_CLASSES) {
    const s = CLASS_SPECS[c];
    assert.ok(s.icon.length > 0, `${c} has icon`);
    assert.ok(s.label.length > 0, `${c} has label`);
    assert.ok(s.hpMult > 0, `${c} hpMult > 0`);
    assert.ok(s.atqMult > 0, `${c} atqMult > 0`);
  }
});

test("parseClass aliases resolve", () => {
  assert.equal(parseClass("wizard"), "mage");
  assert.equal(parseClass("dog"), "wolf");
  assert.equal(parseClass("rabbit"), "scout");
  assert.equal(parseClass("engineer"), "tech");
  assert.equal(parseClass("unknown"), null);
  assert.equal(parseClass(undefined), null);
});

test("flyer buffed stats", () => {
  const f = CLASS_SPECS.flyer;
  assert.ok(f.hpMult >= 1.3, "hpMult buffed");
  assert.equal(f.atqMult, 1.0);
  assert.ok(f.spdStat >= 12, "spdStat buffed");
});
