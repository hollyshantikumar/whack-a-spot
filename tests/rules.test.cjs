const assert = require("node:assert/strict");
const test = require("node:test");
const { Round, SPOT_COUNT } = require("../dist/rules.js");

function firstTarget(round) {
  return round.targets[0];
}

function reachTwoSpots(round) {
  round.fillTargets(0);
  for (let now = 1; now < 207; now += 1) {
    assert.equal(round.targets.length, 1);
    assert.equal(round.tap(firstTarget(round).spot, now), "hit");
  }
  assert.equal(round.shown, 207);
  assert.equal(round.tap(firstTarget(round).spot, 207), "hit");
  assert.equal(round.shown, 209);
  assert.equal(round.targets.length, 2);
}

test("a round starts with one life, zero points and two seconds", () => {
  const round = new Round(() => 0.999);
  round.fillTargets(100);
  assert.equal(firstTarget(round).spot, SPOT_COUNT - 1);
  assert.equal(firstTarget(round).color, "yellow");
  assert.equal(round.deadline, 2100);
  assert.equal(round.lives, 1);
  assert.equal(round.score, 0);
  assert.equal(round.expire(2099.99), null);
  assert.equal(round.expire(2100), "miss");
  assert.equal(round.lives, 0);
  assert.equal(round.score, 0);
  assert.equal(round.expire(2200), null);
});

test("each batch of three spots gets the same duration, and misses count toward the next batch", () => {
  const round = new Round(() => 0);
  round.fillTargets(0);
  assert.equal(round.tap(0, 100), "hit");
  assert.equal(round.deadline, 2100);
  assert.equal(round.expire(2100), "miss");
  assert.equal(round.shown, 3);
  assert.equal(round.deadline, 4100);
  assert.equal(round.tap(0, 2200), "hit");
  assert.equal(round.deadline, 4180);
  assert.equal(round.score, 2);
  assert.equal(round.lives, 2);
});

test("a repeated position changes colour and rejects queued input for the previous spot", () => {
  const round = new Round(() => 0);
  round.fillTargets(0);
  const color = firstTarget(round).color;
  assert.equal(round.tap(0, 100), "hit");
  assert.equal(firstTarget(round).spot, 0);
  assert.notEqual(firstTarget(round).color, color);
  assert.equal(round.tap(0, 101, 99), null);
  assert.equal(round.tap(0, 102), "hit");
});

test("wrong taps cost a point and a life without changing the targets or pace", () => {
  const round = new Round(() => 0);
  round.fillTargets(0);
  round.tap(0, 20);
  const target = firstTarget(round);
  assert.equal(round.tap(1, 30), "wrong");
  assert.equal(round.score, 0);
  assert.equal(round.lives, 1);
  assert.equal(round.shown, 2);
  assert.equal(firstTarget(round), target);
  assert.equal(round.tap(1, 31), "wrong");
  assert.equal(round.score, 0);
  assert.equal(round.lives, 0);
  assert.equal(round.tap(0, 32), null);
});

test("two different spots stay active and replacing one leaves the other deadline intact", () => {
  const round = new Round(() => 0);
  reachTwoSpots(round);
  const [left, right] = round.targets;
  const deadline = 207 + 2000 * 0.99 ** 69;
  assert.notEqual(left.spot, right.spot);
  assert.equal(left.deadline, deadline);
  assert.equal(right.deadline, deadline);
  assert.equal(round.tap(left.spot, 400), "hit");
  assert.equal(round.targets.length, 2);
  assert.equal(round.targets[0], right);
  assert.equal(right.deadline, deadline);
  assert.equal(round.deadline, deadline);
  const replacement = round.targets[1];
  const lives = round.lives;
  const score = round.score;
  assert.equal(round.tap(right.spot, deadline), "miss");
  assert.equal(round.lives, lives - 1);
  assert.equal(round.score, score);
  assert.equal(round.targets.length, 2);
  assert.equal(round.targets[0], replacement);
});

test("each simultaneous expiry costs a life, and a valid tap can score while the other expires", () => {
  const round = new Round(() => 0);
  reachTwoSpots(round);
  let lives = round.lives;
  assert.equal(round.expire(round.deadline), "miss");
  assert.equal(round.lives, lives - 2);
  const earliest = round.deadline;
  round.tap(firstTarget(round).spot, earliest - 100);
  const newer = round.targets[1];
  lives = round.lives;
  const score = round.score;
  assert.equal(round.tap(newer.spot, earliest), "hit");
  assert.equal(round.lives, lives);
  assert.equal(round.score, score + 1);
  assert.equal(round.targets.length, 2);
});

test("switching away preserves the individual time left on both spots", () => {
  const round = new Round(() => 0);
  reachTwoSpots(round);
  round.tap(firstTarget(round).spot, 400);
  const deadlines = round.targets.map((target) => target.deadline);
  round.suspend(500);
  round.suspend(9000);
  assert.equal(round.tap(0, 5000), null);
  assert.equal(round.expire(6000), null);
  round.resume(10000);
  assert.deepEqual(round.targets.map((target) => target.deadline), deadlines.map((deadline) => deadline + 9500));
  assert.equal(round.tap(firstTarget(round).spot, 10001, 9999), null);
  assert.equal(round.tap(firstTarget(round).spot, 10002), "hit");
});

test("the game can keep going at the 350ms floor", () => {
  const round = new Round(() => 0);
  reachTwoSpots(round);
  for (let now = 208; now < 2500; now += 1) {
    const target = round.targets.reduce((earlier, later) => earlier.deadline <= later.deadline ? earlier : later);
    assert.equal(round.tap(target.spot, now), "hit");
  }
  assert.equal(round.duration, 350);
  assert.equal(round.targets.length, 2);
  for (const target of round.targets) assert.equal(target.deadline - target.startedAt, 350);
});
