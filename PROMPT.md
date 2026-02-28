# 3D Horror Game — "BioLab: Containment Breach"

Create a complete browser-based 3D horror game using Three.js (from CDN, no build tools needed).
The game should work on desktop AND mobile browsers. Just open index.html and play.

## Game Concept
- **Setting:** Abandoned underground biolab (Resident Evil / Umbrella Corp vibe)
- **Perspective:** First-person
- **Goal:** Find 3 keycards to unlock the exit while surviving monsters

## Technical Requirements
- **Single folder** with index.html + game.js + style.css (no npm, no bundler)
- **Three.js** loaded from CDN: `https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js`
- **Addons** from CDN: PointerLockControls
- Works by opening index.html directly in browser (file:// protocol) OR via simple HTTP server

## Game Features

### Environment (Procedural — no external assets needed!)
- Generate corridors, rooms, and doors using Three.js BoxGeometry
- Dark atmosphere — very low ambient light
- Player has a flashlight (SpotLight attached to camera)
- Flickering ceiling lights in some rooms (point lights that randomly toggle)
- Floor: dark concrete texture (procedural or colored material)
- Walls: dirty green/gray tiles (use MeshStandardMaterial with color variations)
- Blood splatter decals on some walls (red planes)
- Locked doors that need keycards (colored: Red, Blue, Green)

### Map Layout
- A grid-based map of connected corridors and rooms
- At least 15-20 rooms/corridors
- 3 keycard locations (randomized or set)
- Exit door at the far end
- Dead ends with supplies or scares

### Player
- WASD movement + mouse look (PointerLockControls)
- Sprint with Shift
- Health system (100 HP, displayed on HUD)
- Flashlight toggle (F key)
- Interaction with objects (E key) — pick up keycards, open doors
- Footstep sounds (procedural via Web Audio API — simple oscillator ticks)

### Enemies (2-3 types, simple geometry)
1. **Crawler** — low to ground, fast, follows player, made of merged boxes (organic shape)
2. **Stalker** — humanoid shape (cylinder body + sphere head), slow but appears suddenly
3. **Boss** — larger version, guards the exit

### Enemy AI
- Enemies patrol waypoints when player is far
- When player enters range, they chase
- Simple pathfinding (move toward player, avoid walls via raycasting)
- Attack when close (reduce player HP)
- Death animation (fall and dissolve)

### Audio (Web Audio API — no external files!)
- Ambient drone (low frequency oscillator)
- Footstep clicks when moving
- Monster growl when enemy spotted (noise oscillator)
- Heartbeat sound when HP < 30
- Door opening sound
- Keycard pickup chime
- Jump scare sound (loud burst)

### HUD (HTML overlay)
- Health bar (top left)
- Collected keycards (top right, colored icons)
- Crosshair (center)
- "Press E to interact" prompt
- Mini-map (optional, top corner)
- Messages ("Keycard collected!", "Door locked — need Blue Keycard")

### Mobile Support
- Virtual joystick (left side of screen) for movement
- Touch-drag right side for camera look
- Buttons for: Sprint, Flashlight, Interact
- Auto-detect mobile and show touch controls

### Jump Scares
- Random chance of: lights going out, monster face flash, sudden sound
- Triggered by entering certain rooms for first time
- Screen shake effect

### Game States
- **Title Screen** — "BioLab: Containment Breach" with "CLICK TO START"
- **Playing** — main gameplay
- **Death** — "YOU DIED" screen with restart button
- **Victory** — "YOU ESCAPED" with stats (time, HP remaining)

## Code Quality
- Well-organized, commented code
- Game loop with delta time
- Proper cleanup of Three.js resources
- Responsive design
- No console errors

## File Structure
```
3dgame/
├── index.html      (entry point, loads everything)
├── game.js         (all game logic — can be large, that's OK)
├── style.css       (HUD, menus, mobile controls)
└── README.md       (how to play)
```

Make it SCARY. Dark. Atmospheric. The player should feel tense.
