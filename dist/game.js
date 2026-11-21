"use strict";

const { Round, MODES, MAX_LIVES } = globalThis.WhackRules;
const byId = (id) => document.getElementById(id);
const cabinet = byId("cabinet");
const arena = byId("arena");
const board = byId("board");
const countdown = byId("countdown");
const pauseButton = byId("pause");
const callout = byId("callout");
const backgroundMusic = new Audio("background-music.mp3");
backgroundMusic.loop = true;
backgroundMusic.preload = "auto";
const countdownTick = new Audio("countdown-tick.wav");
countdownTick.preload = "auto";
const goSound = new Audio("go.wav");
goSound.preload = "auto";
const hitSound = new Audio("hit.wav");
hitSound.preload = "auto";
const wrongSpotSound = new Audio("wrong-spot.wav");
wrongSpotSound.preload = "auto";
const timeoutSound = new Audio("timeout.wav");
timeoutSound.preload = "auto";
const twoSpotSound = new Audio("two-spots.wav");
twoSpotSound.preload = "auto";
const gameOverSound = new Audio("game-over.wav");
gameOverSound.preload = "auto";
const motion = matchMedia("(prefers-reduced-motion: reduce)");
const storageKey = "whack-a-spot.v1";
const SVG_NS = "http://www.w3.org/2000/svg";

// Physical key positions, so the three keyboard rows match the three board rows on any layout.
const KEY_CODES = [
  "KeyQ", "KeyW", "KeyE", "KeyR", "KeyT",
  "KeyA", "KeyS", "KeyD", "KeyF", "KeyG",
  "KeyZ", "KeyX", "KeyC", "KeyV", "KeyB",
];
const HARD_KEY_CODES = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", ...KEY_CODES];
const GLYPHS = { bonus: "★", trap: "✕" };

function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey)) ?? {};
    return {
      best: Number.isSafeInteger(saved.best) && saved.best >= 0 ? saved.best : 0,
      hardBest: Number.isSafeInteger(saved.hardBest) && saved.hardBest >= 0 ? saved.hardBest : 0,
      sound: saved.sound !== false,
      music: saved.music !== false,
      vibration: saved.vibration !== false,
    };
  } catch {
    return { best: 0, hardBest: 0, sound: true, music: true, vibration: true };
  }
}

const preferences = loadPreferences();

function savePreferences() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(preferences));
  } catch {
    // The current session remains playable when browser storage is unavailable.
  }
}

const spots = Array.from({ length: MODES.hard.spotCount }, (_, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "spot";
  button.disabled = true;
  button.setAttribute("aria-label", `Spot ${index + 1}`);

  const ring = document.createElementNS(SVG_NS, "svg");
  ring.setAttribute("class", "ring");
  ring.setAttribute("viewBox", "0 0 100 100");
  ring.setAttribute("aria-hidden", "true");
  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", "50");
  circle.setAttribute("cy", "50");
  circle.setAttribute("r", "46");
  circle.setAttribute("pathLength", "100");
  ring.append(circle);

  const disc = document.createElement("span");
  disc.className = "disc";
  const glyph = document.createElement("span");
  glyph.className = "glyph";
  glyph.setAttribute("aria-hidden", "true");
  disc.append(glyph);

  const key = document.createElement("span");
  key.className = "key";
  key.setAttribute("aria-hidden", "true");

  button.append(ring, disc, key);
  button.addEventListener("click", (event) => tap(index, event));
  return button;
});
board.append(...spots);

let round;
let mode = "classic";
let phase = "home";
let timer;
let goTimer;
let lastFeedbackAt = -Infinity;
let twoSpotsAnnounced = false;
let lastLevel = 1;

const feedback = {
  hit: { clip: hitSound, vibration: 18 },
  bonus: { clip: hitSound, vibration: [18, 30, 18] },
  wrong: { clip: wrongSpotSound, vibration: 40 },
  trap: { clip: wrongSpotSound, vibration: [40, 30, 40] },
  miss: { clip: timeoutSound, vibration: 32 },
  over: { clip: gameOverSound, vibration: [45, 45, 90] },
};

function playClip(clip) {
  if (!preferences.sound) return;
  clip.currentTime = 0;
  clip.play().catch(() => {});
}

function playBackgroundMusic() {
  if (!preferences.music || document.hidden || !backgroundMusic.paused) return;
  backgroundMusic.play().catch(() => {});
}

function signal(kind) {
  const cue = feedback[kind];
  if (!cue || document.hidden) return;
  const now = performance.now();
  // Keep successive misses from stacking sound or haptic cues at very fast speeds.
  if (kind !== "over" && now - lastFeedbackAt < 55) return;
  lastFeedbackAt = now;

  if (preferences.vibration) navigator.vibrate?.(cue.vibration);
  playClip(cue.clip);
}

function startRing(button, target) {
  const circle = button.querySelector("circle");
  for (const animation of circle.getAnimations()) animation.cancel();
  if (!target?.deadline || typeof circle.animate !== "function") {
    delete button.dataset.timed;
    return;
  }
  button.dataset.timed = "";
  const remaining = Math.max(0, target.deadline - performance.now());
  const from = Math.min(100, Math.max(0, 100 * (1 - remaining / target.total)));
  circle.animate(
    [{ strokeDashoffset: `${from}` }, { strokeDashoffset: "100" }],
    { duration: remaining, easing: "linear", fill: "forwards" },
  );
}

function paintTargets(targets = []) {
  spots.forEach((button, index) => {
    const target = targets.find((item) => item.spot === index);
    const signature = target ? `${target.kind}|${target.color}|${target.deadline}` : "";
    if ((button.dataset.signature ?? "") === signature) return;
    button.dataset.signature = signature;
    if (target) {
      button.dataset.color = target.color;
      button.dataset.kind = target.kind;
    } else {
      delete button.dataset.color;
      delete button.dataset.kind;
    }
    button.querySelector(".glyph").textContent = GLYPHS[target?.kind] ?? "";
    const label = !target ? "Spot" : target.kind === "bonus" ? "Gold spot" : target.kind === "trap" ? "Trap spot, do not tap" : "Active spot";
    button.setAttribute("aria-label", `${label} ${index + 1}`);
    startRing(button, target);
  });
  const real = targets.filter((target) => target.kind !== "trap").length;
  if (phase === "playing" && real === 2 && !twoSpotsAnnounced) {
    twoSpotsAnnounced = true;
    playClip(twoSpotSound);
    announce("TWO SPOTS!", "hot");
  }
}

function announce(text, tone = "") {
  callout.textContent = text;
  callout.className = `callout show ${tone}`;
  for (const animation of callout.getAnimations()) animation.cancel();
  const frames = motion.matches
    ? [{ opacity: 1 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }]
    : [
        { opacity: 0, transform: "translate(-50%, -50%) scale(.6)" },
        { opacity: 1, transform: "translate(-50%, -50%) scale(1.08)", offset: 0.15 },
        { opacity: 1, transform: "translate(-50%, -50%) scale(1)", offset: 0.75 },
        { opacity: 0, transform: "translate(-50%, -50%) scale(1)" },
      ];
  callout.animate(frames, { duration: 1100, easing: "ease-out", fill: "forwards" });
}

function clearCallout() {
  for (const animation of callout.getAnimations()) animation.cancel();
  callout.className = "callout";
  callout.textContent = "";
}

function floatText(index, text, tone) {
  const spot = spots[index];
  const spotBox = spot.getBoundingClientRect();
  const arenaBox = arena.getBoundingClientRect();
  const label = document.createElement("span");
  label.className = `float ${tone}`;
  label.setAttribute("aria-hidden", "true");
  label.textContent = text;
  label.style.left = `${spotBox.left - arenaBox.left + spotBox.width / 2}px`;
  label.style.top = `${spotBox.top - arenaBox.top + spotBox.height / 2}px`;
  arena.append(label);
  const rise = motion.matches ? "0px" : "-38px";
  const animation = label.animate(
    [
      { opacity: 1, transform: "translate(-50%, -50%)" },
      { opacity: 0, transform: `translate(-50%, calc(-50% + ${rise}))` },
    ],
    { duration: 650, easing: "ease-out", fill: "forwards" },
  );
  animation.onfinish = () => label.remove();
}

function jolt(strong) {
  if (typeof arena.animate !== "function") return;
  arena.animate(
    [{ borderColor: "#FF3B5C" }, { borderColor: "var(--line)" }],
    { duration: 380, easing: "ease-out" },
  );
  if (!strong || motion.matches) return;
  arena.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-7px)" },
      { transform: "translateX(6px)" },
      { transform: "translateX(-4px)" },
      { transform: "translateX(2px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 260, easing: "ease-out" },
  );
}

function show(screen) {
  cabinet.dataset.screen = screen;
  const hardScreen = mode === "hard" && (screen === "game" || screen === "results");
  cabinet.dataset.mode = hardScreen ? "hard" : "classic";
  byId("game-title").textContent = hardScreen ? "HARD MODE" : "WHACK-A-SPOT";
  document.documentElement.classList.toggle("playing", screen === "game");
  for (const name of ["home", "instructions", "settings", "results"]) byId(name).hidden = name !== screen;
  byId("readout").hidden = screen !== "game";
  pauseButton.hidden = screen !== "game";
  clearTimeout(goTimer);
  countdown.classList.remove("go", "paused");
  countdown.hidden = true;
  clearCallout();
  setBoardEnabled(false);
  const keyCodes = hardScreen ? HARD_KEY_CODES : KEY_CODES;
  const { spotCount } = MODES[cabinet.dataset.mode];
  board.setAttribute("aria-label", `${spotCount} spots`);
  spots.forEach((spot, index) => {
    spot.hidden = index >= spotCount;
    spot.querySelector(".key").textContent = keyCodes[index]?.replace(/^(Key|Digit)/, "") ?? "";
  });
  paintTargets(screen === "home" ? [{ spot: 7, color: "pink", kind: "normal" }] : []);
}

function setBoardEnabled(enabled) {
  for (const spot of spots) spot.disabled = !enabled || spot.hidden;
}

function updateReadout() {
  byId("score").textContent = round.score;
  const lives = byId("lives");
  lives.textContent = "♥".repeat(round.lives) + "♡".repeat(Math.max(0, MAX_LIVES - round.lives));
  lives.setAttribute("aria-label", `${round.lives} ${round.lives === 1 ? "life" : "lives"}`);
  byId("level").textContent = round.level;
}

function home() {
  clearTimeout(timer);
  gameOverSound.pause();
  phase = "home";
  byId("home-best").textContent = preferences.best;
  byId("hard-best").textContent = preferences.hardBest;
  show("home");
}

function start(selectedMode = "classic") {
  mode = selectedMode;
  gameOverSound.pause();
  playBackgroundMusic();
  round = new Round(Math.random, { mode });
  twoSpotsAnnounced = false;
  lastLevel = 1;
  show("game");
  updateReadout();
  startCountdown();
}

function startCountdown() {
  clearTimeout(timer);
  clearTimeout(goTimer);
  phase = "countdown";
  pauseButton.textContent = "PAUSE";
  setBoardEnabled(false);
  paintTargets();
  countdown.classList.remove("go", "paused");
  countdown.hidden = false;
  const end = performance.now() + 3000;
  let previousNumber;

  function tick() {
    if (phase !== "countdown" || document.hidden) return;
    const now = performance.now();
    const remaining = end - now;
    if (remaining <= 0) {
      phase = "playing";
      countdown.textContent = "GO!";
      countdown.classList.add("go");
      goTimer = setTimeout(() => {
        countdown.hidden = true;
        countdown.classList.remove("go");
      }, 320);
      setBoardEnabled(true);
      if (round.targets.length) round.resume(now);
      else round.fillTargets(now);
      paintTargets(round.targets);
      playBackgroundMusic();
      playClip(goSound);
      scheduleExpiry();
      return;
    }

    const number = Math.ceil(remaining / 1000);
    if (number !== previousNumber) {
      previousNumber = number;
      countdown.textContent = number;
      playClip(countdownTick);
    }
    timer = setTimeout(tick, remaining - (number - 1) * 1000);
  }

  tick();
}

function scheduleExpiry() {
  clearTimeout(timer);
  timer = setTimeout(onExpiry, Math.max(0, Math.ceil(round.deadline - performance.now())));
}

function onExpiry() {
  if (phase !== "playing" || document.hidden) return;
  const result = round.expire(performance.now());
  if (result) renderOutcome(result);
  else scheduleExpiry();
}

function tap(index, event) {
  if (phase !== "playing" || document.hidden) return;
  const now = performance.now();
  const inputTime = event.timeStamp > 0 && event.timeStamp <= now ? event.timeStamp : now;
  const result = round.tap(index, now, inputTime);
  if (result) renderOutcome(result, index);
}

board.addEventListener("keydown", (event) => {
  // Holding a key counts as one press on a focused spot.
  if (event.repeat && (event.key === "Enter" || event.key === " ")) event.preventDefault();
});

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  if (phase === "playing" || phase === "countdown") {
    const keyCodes = mode === "hard" ? HARD_KEY_CODES : KEY_CODES;
    const index = keyCodes.indexOf(event.code);
    if (index === -1) return;
    event.preventDefault();
    if (!event.repeat) tap(index, event);
    return;
  }

  if ((phase === "home" || phase === "results") && (event.key === "Enter" || event.key === " ")) {
    // A focused button handles its own Enter and Space.
    if (document.activeElement?.tagName === "BUTTON") return;
    event.preventDefault();
    start(phase === "results" ? mode : "classic");
    return;
  }

  if ((phase === "settings" || phase === "instructions") && event.key === "Escape") {
    const opener = byId(`${phase}-open`);
    home();
    opener.focus({ preventScroll: true });
  }
});

function animateTap(spot, hit) {
  if (motion.matches || typeof spot.animate !== "function") return;
  const disc = spot.querySelector(".disc");
  for (const animation of disc.getAnimations()) animation.cancel();
  const frames = hit
    ? [{ transform: "scale(.84)" }, { transform: "scale(1.12)", offset: 0.55 }, { transform: "scale(1)" }]
    : [{ outline: "3px solid #FF739C", outlineOffset: "2px" }, { outline: "3px solid transparent", outlineOffset: "5px" }];
  disc.animate(frames, { duration: hit ? 130 : 175, easing: "ease-out" });
}

function renderOutcome(result, index) {
  updateReadout();
  if (round.lives === 0) {
    finish();
    return;
  }
  paintTargets(round.targets);
  scheduleExpiry();
  if (result === "fade") return;

  const scored = result === "hit" || result === "bonus";
  const penalised = result === "wrong" || result === "trap";
  if (index !== undefined && (scored || penalised)) animateTap(spots[index], scored);

  if (scored) {
    floatText(index, result === "bonus" ? "+3" : "+1", result === "bonus" ? "gold" : "good");
  } else if (penalised) {
    floatText(index, "−1", "bad");
  }
  if (penalised || result === "miss") jolt(penalised);

  if (round.level !== lastLevel) {
    lastLevel = round.level;
    announce(`LEVEL ${round.level}`, "level");
  }
  if (scored && round.streak > 0 && round.streak % 5 === 0) announce(`${round.streak} STREAK!`, "hot");
  if (round.lifeGained) announce("+1 LIFE ♥", "life");

  signal(result);
}

function finish() {
  clearTimeout(timer);
  backgroundMusic.pause();
  phase = "results";
  const bestKey = mode === "hard" ? "hardBest" : "best";
  const previousBest = preferences[bestKey];
  const record = round.score > previousBest;
  if (record) {
    preferences[bestKey] = round.score;
    savePreferences();
  }
  byId("final-score").textContent = round.score;
  byId("final-best").textContent = preferences[bestKey];
  byId("final-streak").textContent = round.bestStreak;
  byId("final-level").textContent = round.level;

  const note = byId("record");
  const gap = previousBest - round.score;
  note.classList.toggle("new", record);
  if (record) note.textContent = "NEW PERSONAL BEST!";
  else if (gap === 0) note.textContent = "YOU MATCHED YOUR BEST!";
  else note.textContent = `${gap} POINT${gap === 1 ? "" : "S"} OFF YOUR BEST`;
  note.hidden = previousBest === 0 && round.score === 0;

  show("results");
  byId("results-title").focus({ preventScroll: true });
  signal("over");
}

function suspendGame(nextPhase) {
  if (phase !== "playing" && phase !== "countdown") return;
  clearTimeout(timer);
  clearTimeout(goTimer);
  backgroundMusic.pause();
  countdownTick.pause();
  goSound.pause();
  hitSound.pause();
  wrongSpotSound.pause();
  timeoutSound.pause();
  twoSpotSound.pause();
  if (phase === "playing") {
    round.suspend(performance.now());
    if (round.lives === 0) {
      finish();
      return;
    }
    updateReadout();
  }
  phase = nextPhase;
  setBoardEnabled(false);
  paintTargets();
  clearCallout();
  countdown.classList.remove("go");
  const paused = phase === "paused";
  countdown.classList.toggle("paused", paused);
  countdown.textContent = paused ? "PAUSED" : "";
  countdown.hidden = !paused;
  pauseButton.textContent = paused ? "RESUME" : "PAUSE";
}

function leavePage() {
  gameOverSound.pause();
  suspendGame("away");
}

function returnToPage() {
  if (phase === "away" && !document.hidden) startCountdown();
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) leavePage();
  else returnToPage();
});
window.addEventListener("pagehide", leavePage);
window.addEventListener("pageshow", returnToPage);

function updateSetting(key) {
  const toggle = byId(key);
  toggle.setAttribute("aria-checked", String(preferences[key]));
  toggle.textContent = preferences[key] ? "ON" : "OFF";
}

for (const key of ["sound", "music", "vibration"]) {
  updateSetting(key);
  byId(key).addEventListener("click", () => {
    preferences[key] = !preferences[key];
    updateSetting(key);
    savePreferences();
  });
}

byId("play").addEventListener("click", () => start());
byId("hard-play").addEventListener("click", () => start("hard"));
byId("again").addEventListener("click", () => start(mode));
pauseButton.addEventListener("click", () => {
  if (phase === "paused") {
    startCountdown();
    return;
  }
  suspendGame("paused");
});
byId("instructions-open").addEventListener("click", () => {
  phase = "instructions";
  show("instructions");
  byId("instructions-title").focus();
});
byId("instructions-home").addEventListener("click", () => {
  home();
  byId("instructions-open").focus();
});
byId("settings-open").addEventListener("click", () => {
  phase = "settings";
  show("settings");
  byId("sound").focus({ preventScroll: true });
});
for (const id of ["settings-home", "results-home"]) {
  byId(id).addEventListener("click", () => {
    home();
    byId("play").focus({ preventScroll: true });
  });
}
home();
