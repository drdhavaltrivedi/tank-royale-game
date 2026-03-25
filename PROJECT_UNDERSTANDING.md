# Tank Royale - Project Understanding

## Project Overview
**Tank Royale** is a high-performance, 2D top-down battle royale game built using vanilla JavaScript and HTML5 Canvas. The game features a shrinking zone, diverse tank classes, automated bots, loot systems, vehicles, and dynamic environments.

---

## Key Core Features

### 1. Game Mechanics
- **Battle Royale Loop**: 30 players (1 player + 29 bots) compete in a shrinking "Zone" until only one remains.
- **Tank Classes**:
  - **Light**: High speed, low health, high boost.
  - **Medium**: Balanced stats (default).
  - **Heavy**: High health, slow speed, damage reduction.
- **Movement & Stance**: Supports standing, crouching, and prone stances, each affecting speed, accuracy (spread), and visibility.
- **Combat**: Projectile-based shooting with recoil, spread bloom, headshot detection, and damage falloff.

### 2. Entity Systems
- **Player Controller**: Advanced WASD movement, mouse aiming, weapon switching (1/2), reloading (R), and inventory management (Tab).
- **Bot AI**: Sophisticated decision-making including looting, seeking cover, engaging enemies, and navigating toward the safe zone.
- **Vehicles**: Functional cars and bikes that players can enter/exit (E) to traverse the map quickly.
- **Loot System**: Weapons (AR, Sniper, SMG, Shotgun, Pistol), armor, helmets, backpacks, healing items (Bandages, Medkits), and ammo.
- **Airdrops**: Periodic loot drops containing high-tier gear.

### 3. Environment & UI
- **Map Themes**: Grassland, Desert, Snow, and more, featuring obstacles like rocks, trees, and buildings with interactable doors.
- **Weather System**: Dynamic weather effects (rain, fog) affecting visibility.
- **HUD & Minimap**: Real-time display of health, ammo, kill feed, notifications, and player/bot locations on a minimap.
- **Audio System**: Contextual sound effects for footsteps (surface-dependent), shooting, reloading, and ambient environment.

---

## Technical Architecture

### 📁 Directory Structure
- `index.html`: Main entry point and canvas setup.
- `js/`: Core game logic.
  - `game.js`: Main game loop, state management, and orchestration.
  - `player.js`: Player entity logic (movement, combat, stance).
  - `bot.js`: Automated AI logic.
  - `map.js`: Procedural or static map generation and rendering.
  - `collision.js`: Spatial partitioning and collision detection.
  - `hud.js` & `minimap.js`: Screen-space UI rendering.
  - `audio.js`: Sound management using Web Audio API or `<audio>` elements.
- `assets/`: Textures, sounds, and other media.

### 💡 Technologies Used
- **Language**: Vanilla ECMAScript 6+ (Modules).
- **Rendering**: HTML5 Canvas API (2D Context).
- **State Management**: Class-based architecture with a central `Game` loop.

---

## Deployment & Setup
To run the project locally:
1. Open `index.html` in a modern web browser.
2. Ensure all modules in `js/` are being served (using a local server like `live-server` or `python -m http.server` is recommended).

## Controls
- **WASD / Arrows**: Move
- **Mouse**: Aim & Shoot
- **1 / 2**: Switch Weapons
- **R**: Reload
- **C / Z**: Crouch / Prone
- **Shift**: Sprint
- **Tab**: Inventory
- **E**: Enter/Exit Vehicle
- **F**: Pickup / Open Door
- **G / H / M**: Grenade / Smoke / Mine
- **3 / 4**: Use Healing Items
