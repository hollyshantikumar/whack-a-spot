"use strict";

const { Round, SPOT_COUNT } = globalThis.WhackRules;
const byId = (id) => document.getElementById(id);
const cabinet = byId("cabinet");
const board = byId("board");
const countdown = byId("countdown");
const motion = matchMedia("(prefers-reduced-motion: reduce)");
const storageKey = "whack-a-spot.v1";

function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey)) ?? {};
    return {
      best: Number.isSafeInteger(saved.best) && saved.best >= 0 ? saved.best : 0,
      sound: saved.sound !== false,
      vibration: saved.vibration !== false,
    };
  } catch {
    return { best: 0, sound: true, vibration: true };
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

const spots = Array.from({ length: SPOT_COUNT }, (_, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "spot";
  button.disabled = true;
  button.setAttribute("aria-label", `Spot ${index + 1}`);
  const disc = document.createElement("span");
  disc.className = "disc";
  button.append(disc);
  button.addEventListener("click", (event) => tap(index, event));
  return button;
});
board.append(...spots);

let round;
let phase = "home";
let paintedSpot = null;
let timer;
let audio;
let lastTone = -Infinity;

const feedback = {
  hit: { tones: [523, 784], vibration: 18 },
  wrong: { tones: [233, 147], vibration: 40 },
  miss: { tones: [196], vibration: 32 },
  over: { tones: [392, 294, 196], vibration: [45, 45, 90] },
};

function unlockAudio() {
  if (!preferences.sound) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!audio && Audio) audio = new Audio();
    audio?.resume().catch(() => {});
  } catch {
    // Browser audio availability does not affect gameplay.
  }
}

function signal(kind) {
  if (document.hidden) return;
  const now = performance.now();
  // Keep successive misses from stacking sound or haptic cues at very fast speeds.
  if (kind !== "over" && now - lastTone < 55) return;
  lastTone = now;
  const cue = feedback[kind];

  if (preferences.vibration) navigator.vibrate?.(cue.vibration);
  if (!preferences.sound || audio?.state !== "running") return;

  const start = audio.currentTime;
  cue.tones.forEach((frequency, index) => {
    const at = start + index * 0.07;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.001, at);
    gain.gain.exponentialRampToValueAtTime(0.12, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.1);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.105);
  });
}

function paintSpot(target) {
  if (paintedSpot !== null) {
    delete spots[paintedSpot].dataset.color;
    spots[paintedSpot].setAttribute("aria-label", `Spot ${paintedSpot + 1}`);
  }
  paintedSpot = target?.spot ?? null;
  if (paintedSpot !== null) {
    spots[paintedSpot].dataset.color = target.color;
    spots[paintedSpot].setAttribute("aria-label", `Active spot ${paintedSpot + 1}`);
  }
}

function show(screen) {
  cabinet.dataset.screen = screen;
  document.documentElement.classList.toggle("playing", screen === "game");
  for (const name of ["home", "settings", "results"]) byId(name).hidden = name !== screen;
  byId("readout").hidden = screen !== "game";
  countdown.hidden = true;
  setBoardEnabled(false);
  paintSpot(screen === "home" ? { spot: 7, color: "pink" } : null);
}

function setBoardEnabled(enabled) {
  for (const spot of spots) spot.disabled = !enabled;
}

function updateReadout() {
  byId("score").textContent = round.score;
  byId("lives").textContent = round.lives;
}

function home() {
  clearTimeout(timer);
  phase = "home";
  byId("home-best").textContent = preferences.best;
  show("home");
}

function start() {
  unlockAudio();
  round = new Round();
  show("game");
  updateReadout();
  startCountdown();
}

function startCountdown() {
  clearTimeout(timer);
  phase = "countdown";
  setBoardEnabled(false);
  paintSpot(null);
  countdown.hidden = false;
  const end = performance.now() + 3000;

  function tick() {
    if (phase !== "countdown" || document.hidden) return;
    const now = performance.now();
    const remaining = end - now;
    if (remaining <= 0) {
      phase = "playing";
      countdown.hidden = true;
      setBoardEnabled(true);
      if (round.target) round.resume(now);
      else round.activate(now);
      paintSpot(round.target);
      scheduleExpiry();
      return;
    }

    const number = Math.ceil(remaining / 1000);
    countdown.textContent = number;
    timer = setTimeout(tick, remaining - (number - 1) * 1000);
  }

  tick();
}

function scheduleExpiry() {
  clearTimeout(timer);
  timer = setTimeout(onExpiry, Math.max(0, Math.ceil(round.target.deadline - performance.now())));
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

function animateTap(spot, hit) {
  if (motion.matches || typeof spot.animate !== "function") return;
  const disc = spot.firstElementChild;
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
  if (result !== "wrong") paintSpot(round.target);
  if (index !== undefined && result !== "miss") animateTap(spots[index], result === "hit");
  signal(result);
  if (result !== "wrong") scheduleExpiry();
}

function finish() {
  clearTimeout(timer);
  phase = "results";
  const record = round.score > preferences.best;
  if (record) {
    preferences.best = round.score;
    savePreferences();
  }
  byId("final-score").textContent = round.score;
  byId("final-best").textContent = preferences.best;
  byId("record").hidden = !record;
  show("results");
  byId("results-title").focus({ preventScroll: true });
  signal("over");
}

function leavePage() {
  if (phase !== "playing" && phase !== "countdown") return;
  clearTimeout(timer);
  if (phase === "playing") {
    round.suspend(performance.now());
    if (round.lives === 0) {
      finish();
      return;
    }
    updateReadout();
  }
  phase = "away";
  setBoardEnabled(false);
  paintSpot(null);
  countdown.textContent = "";
  countdown.hidden = true;
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

for (const key of ["sound", "vibration"]) {
  updateSetting(key);
  byId(key).addEventListener("click", () => {
    preferences[key] = !preferences[key];
    updateSetting(key);
    savePreferences();
    if (key === "sound") unlockAudio();
  });
}

byId("play").addEventListener("click", start);
byId("again").addEventListener("click", start);
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
