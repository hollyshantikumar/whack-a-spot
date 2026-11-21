(function () {
  "use strict";

  const SPOT_COUNT = 15;
  const MODES = {
    classic: { spotCount: SPOT_COUNT, minDuration: 350 },
    hard: { spotCount: 20, minDuration: 280 },
  };
  const START_DURATION = 2000;
  const SPOTS_PER_SPEED_STEP = 3;
  const SPEED_FACTOR = 0.97;
  const TWO_SPOT_DURATION = 1000;
  const START_LIVES = 3;
  const MAX_LIVES = 5;
  const HITS_PER_LIFE = 10;
  const SPOTS_PER_LEVEL = 15;
  const BONUS_POINTS = 3;
  const BONUS_FROM_SPOT = 5;
  const BONUS_CHANCE = 0.12;
  const TRAP_FROM_LEVEL = 2;
  const TRAP_CHANCE = 0.2;
  const COLORS = ["pink", "green", "cyan"];

  class Round {
    constructor(random = Math.random, { bonusChance = BONUS_CHANCE, trapChance = TRAP_CHANCE, mode = "classic" } = {}) {
      this.random = random;
      this.config = MODES[mode];
      this.bonusChance = bonusChance;
      this.trapChance = trapChance;
      this.score = 0;
      this.lives = START_LIVES;
      this.hits = 0;
      this.streak = 0;
      this.bestStreak = 0;
      this.lifeGained = false;
      this.shown = 0;
      this.targets = [];
      this.lastChangeAt = -Infinity;
      this.suspendedAt = null;
    }

    get duration() {
      const steps = Math.floor(this.shown / SPOTS_PER_SPEED_STEP);
      return Math.max(this.config.minDuration, START_DURATION * SPEED_FACTOR ** steps);
    }

    get level() {
      return Math.floor(this.shown / SPOTS_PER_LEVEL) + 1;
    }

    get deadline() {
      return Math.min(...this.targets.map((target) => target.deadline));
    }

    get realTargets() {
      return this.targets.filter((target) => target.kind !== "trap");
    }

    chance(probability) {
      return probability > 0 && this.random() < probability;
    }

    spawn(now, kind, removed) {
      const freeSpots = Array.from({ length: this.config.spotCount }, (_, spot) => spot)
        .filter((spot) => !this.targets.some((target) => target.spot === spot));
      const spot = freeSpots[Math.floor(this.random() * freeSpots.length)];
      let color = kind;
      if (kind === "normal") {
        const previous = removed.find((target) => target.spot === spot);
        const colors = COLORS.filter((option) => option !== previous?.color);
        color = colors[Math.floor(this.random() * colors.length)];
      }
      const total = this.duration;
      this.targets.push({ spot, kind, color, startedAt: now, total, deadline: now + total });
      this.lastChangeAt = now;
    }

    fillTargets(now, removed = []) {
      const count = this.duration <= TWO_SPOT_DURATION ? 2 : 1;
      while (this.realTargets.length < count) {
        const bonus = this.shown >= BONUS_FROM_SPOT && this.chance(this.bonusChance);
        this.spawn(now, bonus ? "bonus" : "normal", removed);
        this.shown += 1;
        const trapActive = this.targets.some((target) => target.kind === "trap");
        if (this.level >= TRAP_FROM_LEVEL && !trapActive && this.chance(this.trapChance)) {
          this.spawn(now, "trap", removed);
        }
      }
    }

    tap(spot, now, inputTime = now) {
      this.lifeGained = false;
      if (!this.targets.length || this.suspendedAt !== null) return null;

      const tapped = this.targets.find((target) => target.spot === spot);
      const expiry = this.expire(now);
      if (this.lives === 0) return expiry;
      if (tapped) {
        if (now >= tapped.deadline || inputTime < tapped.startedAt) return expiry;
        this.targets = this.targets.filter((target) => target !== tapped);
        if (tapped.kind === "trap") {
          this.penalise();
          return "trap";
        }
        this.score += tapped.kind === "bonus" ? BONUS_POINTS : 1;
        this.hits += 1;
        this.streak += 1;
        this.bestStreak = Math.max(this.bestStreak, this.streak);
        if (this.hits % HITS_PER_LIFE === 0 && this.lives < MAX_LIVES) {
          this.lives += 1;
          this.lifeGained = true;
        }
        this.fillTargets(now, [tapped]);
        return tapped.kind === "bonus" ? "bonus" : "hit";
      }

      if (expiry === "miss" || inputTime < this.lastChangeAt) return expiry;

      this.penalise();
      return "wrong";
    }

    penalise() {
      this.score = Math.max(0, this.score - 1);
      this.streak = 0;
      this.loseLives(1);
    }

    expire(now) {
      if (this.suspendedAt !== null || now < this.deadline) return null;

      const expired = this.targets.filter((target) => now >= target.deadline);
      const missed = expired.filter((target) => target.kind !== "trap").length;
      this.targets = this.targets.filter((target) => now < target.deadline);
      if (missed) {
        this.streak = 0;
        this.loseLives(missed);
      }
      if (this.lives > 0) this.fillTargets(now, expired);
      return missed ? "miss" : "fade";
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

  const rules = { Round, MODES, SPOT_COUNT, MAX_LIVES, START_LIVES, START_DURATION, TWO_SPOT_DURATION };
  if (typeof module === "object" && module.exports) module.exports = rules;
  else globalThis.WhackRules = rules;
})();
