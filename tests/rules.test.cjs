const assert = require("node:assert/strict");
const test = require("node:test");
const { Round, SPOT_COUNT, MAX_LIVES, START_LIVES } = require("../dist/rules.js");

// Plain rounds: no bonus or trap spots unless a test asks for them.
function plainRound(random = () => 0, options = {}) {
  return new Round(random, { bonusChance: 0, trapChance: 0, ...options });
}

function firstTarget(round) {
  return round.targets[0];
}

function reachTwoSpots(round) {
  round.fillTargets(0);
  let now = 1;
  while (round.targets.length === 1) {
    assert.equal(round.tap(firstTarget(round).spot, now), "hit");
    now += 1;
  }
  // The 69th spot drops the window to 1,000ms or less, so the next fill brings two.
  assert.equal(round.hits, 69);
  assert.equal(round.shown, 71);
  assert.equal(round.targets.length, 2);
  return now - 1;
}

test("a round starts with three lives, zero points and two seconds", () => {
  const round = plainRound(() => 0.999);
  round.fillTargets(100);
  assert.equal(firstTarget(round).spot, SPOT_COUNT - 1);
  assert.equal(firstTarget(round).color, "cyan");
  assert.equal(round.deadline, 2100);
  assert.equal(round.lives, START_LIVES);
  assert.equal(round.score, 0);
  assert.equal(round.level, 1);
  assert.equal(round.expire(2099.99), null);
  assert.equal(round.expire(2100), "miss");
  assert.equal(round.lives, START_LIVES - 1);
  assert.equal(round.targets.length, 1);
});

test("each batch of three spots gets the same duration, and misses count toward the next batch", () => {
  const round = plainRound();
  round.fillTargets(0);
  assert.equal(round.tap(0, 100), "hit");
  assert.equal(round.deadline, 2100);
  assert.equal(round.expire(2100), "miss");
  assert.equal(round.shown, 3);
  assert.equal(round.deadline, 4100);
  assert.equal(round.tap(0, 2200), "hit");
  assert.equal(round.deadline, 2200 + 2000 * 0.97);
  assert.equal(round.score, 2);
  assert.equal(round.lives, START_LIVES - 1);
});

test("a repeated position changes colour and rejects queued input for the previous spot", () => {
  const round = plainRound();
  round.fillTargets(0);
  const color = firstTarget(round).color;
  assert.equal(round.tap(0, 100), "hit");
  assert.equal(firstTarget(round).spot, 0);
  assert.notEqual(firstTarget(round).color, color);
  assert.equal(round.tap(0, 101, 99), null);
  assert.equal(round.tap(0, 102), "hit");
});

test("wrong taps cost a point and a life without changing the targets or pace", () => {
  const round = plainRound();
  round.fillTargets(0);
  round.tap(0, 20);
  const target = firstTarget(round);
  assert.equal(round.tap(1, 30), "wrong");
  assert.equal(round.score, 0);
  assert.equal(round.lives, START_LIVES - 1);
  assert.equal(round.shown, 2);
  assert.equal(firstTarget(round), target);
  assert.equal(round.tap(1, 31), "wrong");
  assert.equal(round.tap(1, 32), "wrong");
  assert.equal(round.lives, 0);
  assert.equal(round.tap(0, 33), null);
});

test("every tenth hit earns a life, up to the cap", () => {
  const round = plainRound();
  round.fillTargets(0);
  for (let now = 1; now <= 30; now += 1) {
    assert.equal(round.tap(firstTarget(round).spot, now), "hit");
    assert.equal(round.lifeGained, now === 10 || now === 20);
  }
  assert.equal(round.lives, MAX_LIVES);
});

test("streaks count consecutive hits and reset on a wrong tap or a miss", () => {
  const round = plainRound();
  round.fillTargets(0);
  for (let now = 1; now <= 4; now += 1) round.tap(firstTarget(round).spot, now);
  assert.equal(round.streak, 4);
  assert.equal(round.tap(14, 10), "wrong");
  assert.equal(round.streak, 0);
  round.tap(firstTarget(round).spot, 11);
  assert.equal(round.streak, 1);
  assert.equal(round.expire(round.deadline), "miss");
  assert.equal(round.streak, 0);
  assert.equal(round.bestStreak, 4);
});

test("bonus spots start after five spots and are worth three points", () => {
  const round = plainRound(() => 0, { bonusChance: 1 });
  round.fillTargets(0);
  for (let now = 1; now <= 5; now += 1) {
    assert.equal(firstTarget(round).kind, "normal");
    round.tap(firstTarget(round).spot, now);
  }
  assert.equal(firstTarget(round).kind, "bonus");
  assert.equal(round.tap(firstTarget(round).spot, 6), "bonus");
  assert.equal(round.score, 8);
});

test("trap spots appear from level 2, cost a life when tapped and vanish harmlessly", () => {
  const round = plainRound(() => 0, { trapChance: 1 });
  round.fillTargets(0);
  let now = 1;
  while (round.targets.length === 1) round.tap(round.realTargets[0].spot, now++);
  assert.equal(round.level, 2);
  assert.equal(round.shown, 15);
  const trap = round.targets.find((target) => target.kind === "trap");
  assert.notEqual(trap.spot, round.realTargets[0].spot);

  const lives = round.lives;
  const score = round.score;
  assert.equal(round.tap(trap.spot, now++), "trap");
  assert.equal(round.lives, lives - 1);
  assert.equal(round.score, score - 1);
  assert.equal(round.targets.length, 1);

  // The next real spot brings a new trap; replace the real spot so only the trap runs out.
  round.tap(round.realTargets[0].spot, now++);
  const nextTrap = round.targets.find((target) => target.kind === "trap");
  round.tap(round.realTargets[0].spot, now++);
  assert.equal(round.expire(nextTrap.deadline), "fade");
  assert.equal(round.lives, lives - 1);
  assert.equal(round.realTargets.length, 1);
});

test("a wrong tap still costs a point and a life when only a trap expires", () => {
  const round = plainRound(() => 0, { trapChance: 1 });
  round.fillTargets(0);
  for (let now = 1; now <= 15; now += 1) {
    assert.equal(round.tap(round.realTargets[0].spot, now), "hit");
  }
  const trap = round.targets.find((target) => target.kind === "trap");
  const active = round.realTargets[0];
  const empty = SPOT_COUNT - 1;
  assert.ok(active.deadline > trap.deadline);
  assert.ok(round.targets.every((target) => target.spot !== empty));

  const { lives, score } = round;
  assert.equal(round.tap(empty, trap.deadline), "wrong");
  assert.equal(round.lives, lives - 1);
  assert.equal(round.score, score - 1);
  assert.deepEqual(round.targets, [active]);
  assert.equal(round.deadline, active.deadline);
});

test("two different spots stay active and replacing one leaves the other deadline intact", () => {
  const round = plainRound();
  const reachedAt = reachTwoSpots(round);
  const [left, right] = round.targets;
  const deadline = reachedAt + 2000 * 0.97 ** 23;
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
  const round = plainRound();
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
  assert.equal(round.score, score + 1);
  assert.equal(round.targets.length, 2);
});

test("switching away preserves the individual time left on both spots", () => {
  const round = plainRound();
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
  const round = plainRound();
  const reachedAt = reachTwoSpots(round);
  for (let now = reachedAt + 1; now < 2500; now += 1) {
    const target = round.targets.reduce((earlier, later) => earlier.deadline <= later.deadline ? earlier : later);
    assert.equal(round.tap(target.spot, now), "hit");
  }
  assert.equal(round.duration, 350);
  assert.equal(round.targets.length, 2);
  for (const target of round.targets) assert.equal(target.deadline - target.startedAt, 350);
});
