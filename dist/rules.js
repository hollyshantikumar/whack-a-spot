(function () {
  "use strict";

  const SPOT_COUNT = 15;
  const START_DURATION = 2000;
  const SPOTS_PER_SPEED_STEP = 3;
  const SPEED_FACTOR = 0.99;
  const TWO_SPOT_DURATION = 1000;
  const MIN_DURATION = 350;
  const COLORS = ["pink", "green", "yellow"];

  class Round {
    constructor(random = Math.random) {
      this.random = random;
      this.score = 0;
      this.lives = 1;
      this.shown = 0;
      this.targets = [];
      this.lastChangeAt = -Infinity;
      this.suspendedAt = null;
    }

    get duration() {
      const steps = Math.floor(this.shown / SPOTS_PER_SPEED_STEP);
      return Math.max(MIN_DURATION, START_DURATION * SPEED_FACTOR ** steps);
    }

    get deadline() {
      return Math.min(...this.targets.map((target) => target.deadline));
    }

    fillTargets(now, removed = []) {
      const count = this.duration <= TWO_SPOT_DURATION ? 2 : 1;
      while (this.targets.length < count) {
        const freeSpots = Array.from({ length: SPOT_COUNT }, (_, spot) => spot)
          .filter((spot) => !this.targets.some((target) => target.spot === spot));
        const spot = freeSpots[Math.floor(this.random() * freeSpots.length)];
        const previous = removed.find((target) => target.spot === spot);
        const colors = COLORS.filter((color) => color !== previous?.color);
        this.targets.push({
          spot,
          color: colors[Math.floor(this.random() * colors.length)],
          startedAt: now,
          deadline: now + this.duration,
        });
        this.shown += 1;
        this.lastChangeAt = now;
      }
    }

    tap(spot, now, inputTime = now) {
      if (!this.targets.length || this.suspendedAt !== null) return null;

      const tapped = this.targets.find((target) => target.spot === spot);
      const expiry = this.expire(now);
      if (this.lives === 0) return expiry;
      if (tapped) {
        if (now >= tapped.deadline || inputTime < tapped.startedAt) return expiry;
        this.score += 1;
        this.lives += 1;
        this.targets = this.targets.filter((target) => target !== tapped);
        this.fillTargets(now, [tapped]);
        return "hit";
      }

      if (expiry || inputTime < this.lastChangeAt) return expiry;

      this.score = Math.max(0, this.score - 1);
      this.loseLives(1);
      return "wrong";
    }

    expire(now) {
      if (this.suspendedAt !== null || now < this.deadline) return null;

      const expired = this.targets.filter((target) => now >= target.deadline);
      this.targets = this.targets.filter((target) => now < target.deadline);
      this.loseLives(expired.length);
      if (this.lives > 0) this.fillTargets(now, expired);
      return "miss";
    }

    loseLives(count) {
      this.lives = Math.max(0, this.lives - count);
      if (this.lives === 0) this.targets = [];
    }

    suspend(now) {
      if (this.suspendedAt !== null) return;
      this.expire(now);
      this.suspendedAt = now;
    }

    resume(now) {
      if (this.suspendedAt === null) return;
      const timeAway = now - this.suspendedAt;
      for (const target of this.targets) {
        target.startedAt = now;
        target.deadline += timeAway;
      }
      this.lastChangeAt = now;
      this.suspendedAt = null;
    }
  }

  const rules = { Round, SPOT_COUNT };
  if (typeof module === "object" && module.exports) module.exports = rules;
  else globalThis.WhackRules = rules;
})();
