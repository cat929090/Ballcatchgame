# Cursor Throw & Catch — CPU / Hotseat with Curve Throws

This repo now contains a small browser game where:

- You are player 1 (the left cursor). Move with the mouse.
- Hold left mouse to charge and release to throw a ball to the other player.
- Throws can curve (based on lateral movement while charging, or randomized for CPU).
- Player 2 can be either a CPU opponent (default) or a Hotseat keyboard player (selectable in the HUD).
- Player 2 (Hotseat) controls: WASD to move, Right Shift to charge, Enter to release, Space to catch.
- Catch the incoming ball by clicking it (player 1) or using the catch key (player 2 Hotseat).

How to run
1. Open `index.html` in a modern browser, or serve with a local static server (for example: `python -m http.server`).
2. Use the mode selector in the top-left HUD to switch between CPU and Hotseat modes.

Notes / next steps
- The Hotseat mode is local; true networked P2P play would require a signaling server / WebRTC implementation — I can add a basic WebRTC lobby if you want online play.
- Curve and AI parameters are tunable in `script.js` (curve strength, AI reaction/skill).

Files added/modified:
- `index.html` (already present)
- `style.css`
- `script.js`
- `README.md` (this file)

If you want, I can open a branch and a pull request instead of committing to `main`. I can also add sound effects, particles, or WebRTC-based online P2P play — tell me which next.