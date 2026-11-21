(function () {
  "use strict";

  const SPOT_COUNT = 15;
  const START_DURATION = 2000;
  const SPEED_FACTOR = 0.98;
  const COLORS = ["pink", "green", "yellow"];

  class Round {
    constructor(random = Math.random) {
      this.random = random;
      this.score = 0;
      this.lives = 1;
      this.hits = 0;
      this.duration = START_DURATION;
      this.target = null;
      this.remaining = null;
    }

    activate(now) {
      this.target = {
        spot: Math.floor(this.random() * SPOT_COUNT),
        color: COLORS[Math.floor(this.random() * COLORS.length)],
        startedAt: now,
        deadline: now + this.duration,
      };
    }

    tap(spot, now, inputTime = now) {
      if (!this.target || this.remaining !== null || inputTime < this.target.startedAt) return null;

      const expiry = this.expire(now);
      if (expiry) return expiry;

      if (spot === this.target.spot) {
        this.score += 1;
        this.lives += 1;
        this.hits += 1;
        this.duration *= SPEED_FACTOR;
        this.activate(now);
        return "hit";
      }

      this.score = Math.max(0, this.score - 1);
      this.loseLife();
      return "wrong";
    }

    expire(now) {
      if (!this.target || this.remaining !== null || now < this.target.deadline) return null;

      this.loseLife();
      if (this.lives > 0) this.activate(now);
      return "miss";
    }

    loseLife() {
      this.lives -= 1;
      if (this.lives === 0) this.target = null;
    }

    suspend(now) {
      const expiry = this.expire(now);
      if (this.target && this.remaining === null) this.remaining = this.target.deadline - now;
      return expiry;
    }

    resume(now) {
      if (!this.target || this.remaining === null) return;
      this.target.startedAt = now;
      this.target.deadline = now + this.remaining;
      this.remaining = null;
    }
  }

  const rules = { Round, SPOT_COUNT };
  if (typeof module === "object" && module.exports) module.exports = rules;
  else globalThis.WhackRules = rules;
})();
