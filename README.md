# Tank Royale 🏆

A fast-paced, 2D top-down Battle Royale game built with Vanilla JavaScript and HTML5 Canvas.

![Tank Royale Screenshot](assets/screenshot.png) <!-- Replace with actual screenshot if available -->

## 🕹️ Game Features
- **30 Players Battle Royale**: Last tank standing wins!
- **Dynamic Zone**: A shrinking circle that forces players together.
- **Tank Classes**: Choose between Light, Medium, and Heavy tanks with unique stats.
- **Weapon Looting**: Find ARs, Snipers, Shotguns, and more across the map.
- **Smart Bots**: AI bots that can loot, drive, and fight tactically.
- **Vehicles & Airdrops**: Drive cars and bikes, or hunt for high-tier loot in airdrops.
- **Weather & Environment**: Fog, rain, and interactable buildings/doors.
- **Multiplayer**: High-performance, synchronized WebSockets multiplayer on LAN or remote servers!

## 🚀 Deployment

### 1. Multiplayer Backend (Crucial)
Multiplayer mode uses WebSockets (`ws`). WebSockets require a persistent server, which Serverless platforms like Vercel or Netlify do **not** support.
For multiplayer to work in production, you must deploy this codebase to a stateful host like [Railway](https://railway.app/). 
Deploying on **Railway** is as simple as creating a new project from your GitHub repo. Railway will automatically detect `package.json`, install dependencies, run `npm start`, and expose the server.

### 2. Vercel Deployment (Frontend Only)
You can deploy this repository on **Vercel** to host the static assets (HTML/JS/CSS) perfectly. You will be able to play the **Single Player (Bot)** mode without any issues. 

However, since Vercel drops long-lived port connections, players will **not** be able to connect to the Multiplayer WebSocket server if the game is hosted *solely* on Vercel. 

To use Vercel for the frontend while keeping multiplayer functional:
1. Deploy `server.js` on Railway.
2. Update the `wsUrl` connection logic in `index.html` block (`const isLocal = window.location.hostname === ...`) to hardcode your Railway deployment URL.
3. Deploy the frontend on Vercel.

## 🚀 Getting Started locally
1. Clone the repository.
2. Open `index.html` in your favorite web browser.
3. *Note: For the best experience, host with a local development server.*

## ⌨️ Controls
| Action | Key |
|---|---|
| Move | WASD / Arrows |
| Aim & Shoot | Mouse |
| Switch Weapon | 1 & 2 |
| Reload | R |
| Crouch / Prone | C / Z |
| Sprint | Shift |
| Inventory | Tab |
| Interact (Vehicle/Loot/Door) | E / F |
| Healing | 3 / 4 |
| Throwables (Grenade/Smoke/Mine) | G / H / M |

## 🛠️ Built With
- **Language**: Vanilla JavaScript (ES6+ Modules)
- **Rendering**: HTML5 Canvas API
- **Styling**: Minimalist CSS for fullscreen optimization
- **AI**: Custom steering and state-machine-based bot logic
