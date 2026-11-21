const assert = require("node:assert/strict");
const test = require("node:test");
const { Round, SPOT_COUNT } = require("../dist/rules.js");

test("a round starts with one life, zero points and two seconds", () => {
  const round = new Round(() => 0.999);
  round.activate(100);
  assert.equal(round.target.spot, SPOT_COUNT - 1);
  assert.equal(round.target.color, "yellow");
  assert.equal(round.target.deadline, 2100);
  assert.equal(round.lives, 1);
  assert.equal(round.score, 0);
  assert.equal(round.expire(2099.99), null);
  assert.equal(round.expire(2100), "miss");
  assert.equal(round.lives, 0);
  assert.equal(round.score, 0);
  assert.equal(round.expire(2200), null);
});

test("hits increase score and lives, speed up the game and allow the same spot twice", () => {
  const round = new Round(() => 0);
  round.activate(0);
  assert.equal(round.tap(0, 100), "hit");
  assert.equal(round.target.spot, 0);
  assert.equal(round.tap(0, 101, 99), null);
  assert.equal(round.tap(0, 102), "hit");
  assert.equal(round.score, 2);
  assert.equal(round.lives, 3);
  assert.equal(round.hits, 2);
  assert.ok(Math.abs(round.duration - 2000 * 0.98 ** 2) < 1e-9);
});

test("wrong taps cost one point and one life while the current deadline stays in place", () => {
  const round = new Round(() => 0);
  round.activate(0);
  round.tap(0, 20);
  const target = round.target;
  assert.equal(round.tap(1, 30), "wrong");
  assert.equal(round.score, 0);
  assert.equal(round.lives, 1);
  assert.equal(round.hits, 1);
  assert.equal(round.duration, 1960);
  assert.equal(round.target, target);
  assert.equal(round.tap(1, 31), "wrong");
  assert.equal(round.score, 0);
  assert.equal(round.lives, 0);
  assert.equal(round.tap(0, 32), null);
});

test("a late tap costs only the expired life and preserves the score", () => {
  const round = new Round(() => 0);
  round.activate(0);
  round.tap(0, 50);
  assert.equal(round.tap(1, 2010), "miss");
  assert.equal(round.score, 1);
  assert.equal(round.lives, 1);
  assert.equal(round.target.deadline, 3970);
});

test("switching away freezes the remaining time and rejects background and stale input", () => {
  const round = new Round(() => 0);
  round.activate(0);
  round.suspend(1700);
  round.suspend(9000);
  assert.equal(round.tap(0, 5000), null);
  assert.equal(round.expire(6000), null);
  round.resume(10000);
  assert.equal(round.target.deadline, 10300);
  assert.equal(round.tap(0, 10001, 9999), null);
  assert.equal(round.tap(0, 10299), "hit");
});

test("very fast rounds have no speed floor and drain lives one expiry at a time", () => {
  const round = new Round(() => 0);
  round.activate(0);
  // Keep the synthetic clock at zero to exercise windows below real clock resolution.
  for (let hit = 1; hit <= 2500; hit += 1) assert.equal(round.tap(0, 0), "hit");
  assert.ok(round.duration < 1e-17);
  let now = 100000;
  for (let remaining = 2500; remaining >= 0; remaining -= 1) {
    assert.equal(round.expire(now), "miss");
    assert.equal(round.lives, remaining);
    now += 1;
  }
  assert.equal(round.target, null);
  assert.equal(round.score, 2500);
});
