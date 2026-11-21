# Whack-a-Spot

A buildless browser game. The playable files are in `dist` and have no runtime dependencies.

## Play locally

Double-click `dist/index.html` to play on your computer. A web server gives your browser a stable origin for the saved score and settings.

From this folder, run the following with Python 3 installed:

```powershell
python -m http.server 8765 --bind 0.0.0.0 --directory dist
```

Open `http://localhost:8765` on your computer. To test on an iPhone or Android phone, connect it to the same Wi-Fi network, find your computer's Wi-Fi IPv4 address with `ipconfig`, and open `http://YOUR-IP-ADDRESS:8765` in the phone's browser. Your computer's firewall and Wi-Fi network must allow local device connections. Stop the server with Ctrl+C.

## Run the tests

```powershell
node --test tests/rules.test.cjs
```

For a manual check, play through the countdown, hit a spot, tap a wrong spot, and let a target time out. Reload after game over to verify the saved best score. Toggle both settings independently and reload to verify they persist. Switch tabs during a round and return to check the fresh countdown and remaining reaction time.

## Customize

| File | Controls |
| --- | --- |
| `dist/styles.css` | The palette at the top of the file, the 55px `--spot-size`, touch targets, and responsive layout |
| `dist/rules.js` | The 2,000ms starting window, 3% decrease every three spots shown, 1,000ms two-spot threshold (about 70 spots in), 350ms minimum, 3 starting lives (max 5, +1 every 10 hits), levels every 15 spots, gold bonus spots (+3) and trap spots from level 2 |
| `dist/game.js` | The countdown and GO!, keyboard controls (Q–T / A–G / Z–B rows, Enter to start), timer rings, pop-ups and banners, arcade sound cues, vibration, and local storage |
| `dist/index.html` | The screen structure and visible game text |

Classic uses 15 spots with a 350ms minimum. Hard Mode uses 20 spots with a 280ms minimum. Both modes start at two seconds, and each has its own best score. Phones held upright use three columns in Classic and four in Hard Mode, with five rows in either mode.

Hits and misses both advance the pace (trap spots do not) because both cause new spots to appear. Each active spot keeps its own deadline. At the two-spot threshold, hitting or missing one spot replaces it while the other continues counting down.

Use PAUSE to freeze the board and its timers. RESUME starts a fresh countdown before the remaining reaction time runs again. HOME ends the run immediately without saving its score, whether the game is active or paused.

Sound and vibration default to ON. Vibration depends on the device and browser. Best scores and preferences are local to each browser profile and site address.
