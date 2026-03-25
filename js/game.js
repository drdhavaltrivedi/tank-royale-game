// game.js - Main game loop, state management

import { Input } from './input.js';
import { Camera } from './camera.js';
import { Player, TANK_CLASSES } from './player.js';
import { Bot } from './bot.js';
import { GameMap, MAP_THEMES } from './map.js';
import { Zone } from './zone.js';
import { LootSystem } from './loot.js';
import { Minimap } from './minimap.js';
import { HUD } from './hud.js';
import { AudioSystem } from './audio.js';
import { checkBulletHit } from './collision.js';
import { AirdropSystem } from './airdrop.js';
import { VehicleSystem } from './vehicle.js';
import { Inventory } from './inventory.js';
import { Grenade, SmokeGrenade } from './grenade.js';
import { Mine } from './mine.js';
import { WeatherSystem } from './weather.js';
import { distance } from './utils.js';
import { WEAPON_TYPES, Bullet } from './weapons.js';
import { RemotePlayer } from './remote_player.js';

const GAME_STATES = { MENU: 'menu', PLAYING: 'playing', DEAD: 'dead', SPECTATING: 'spectating', WON: 'won' };
const BOT_COUNT = 29;

export class Game {
    /**
     * @param {Network|null}  network         null = single player
     * @param {string}        playerName      display name
     * @param {string}        tankClass       'light'|'medium'|'heavy'
     * @param {object|null}   networkGameMsg  gameStart msg from server (mp mode)
     */
    constructor(network = null, playerName = 'Commander', tankClass = 'medium', networkGameMsg = null) {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.input = new Input(this.canvas);
        this.camera = new Camera(this.canvas);
        this.audio = new AudioSystem();
        this.minimap = new Minimap();
        this.hud = new HUD();

        // Multiplayer
        this.network       = network;
        this.isMultiplayer = !!network;
        this.playerName    = playerName || 'Commander';
        this.playerTankClass = tankClass || 'medium';
        this.remotePlayers = new Map();   // id → RemotePlayer
        this.networkBots   = [];          // bot states from server (non-host)

        this.state = GAME_STATES.MENU;
        this.lastTime = 0;
        this.gameTime = 0;
        this.bullets = [];
        this.particles = [];
        this.damageNumbers = [];
        this.inventory = new Inventory();
        this.occupiedVehicleIds = new Set(); // Track vehicles used by remote players

        // Map theme & game mode selection
        this.themeNames = Object.keys(MAP_THEMES);
        this.selectedTheme = 0;
        this.selectedMode = 0;
        this.gameModes = [
            { name: 'Classic Solo', botCount: 29, desc: '30 players, last one standing' },
            { name: 'Sniper Only', botCount: 29, desc: 'Snipers & pistols only', weaponFilter: ['sniper', 'pistol'] },
            { name: 'Blitz', botCount: 19, desc: 'Fast zone, more loot, 20 players', zoneSpeedMult: 3 },
        ];

        // Tank class selection
        this.tankClassNames = Object.keys(TANK_CLASSES);
        this.selectedClass = ['light','medium','heavy'].indexOf(tankClass);
        if (this.selectedClass < 0) this.selectedClass = 1;

        // Kill streak tracking
        this.killStreak = 0;
        this.lastKillTime = 0;
        this.KILL_STREAK_WINDOW = 5;

        // Stats tracking
        this.stats = { damageDealt: 0, damageTaken: 0, shotsFired: 0, shotsHit: 0, headshotKills: 0, survivalTime: 0 };

        // Spectate
        this.spectateTarget = null;
        this.spectateIndex = 0;

        // Kill cam info
        this.killedBy = null;

        // Ambient sound timer
        this.ambientTimer = 0;

        // Start menu click handler
        this.canvas.addEventListener('click', () => {
            this.canvas.focus();
            if (this.state === GAME_STATES.MENU) {
                this.startGame();
            } else if (this.state === GAME_STATES.DEAD) {
                this.enterSpectateMode();
            } else if (this.state === GAME_STATES.SPECTATING || this.state === GAME_STATES.WON) {
                this.state = GAME_STATES.MENU;
            }
        });
        this.canvas.focus();

        // If started from multiplayer lobby, jump straight into game
        if (this.isMultiplayer && networkGameMsg) {
            this.network.on('itemPickedUp', (msg) => {
                if (this.loot) {
                    const idx = this.loot.items.findIndex(i => i.id === msg.itemId);
                    if (idx !== -1) {
                        const item = this.loot.items[idx];
                        this.loot.items.splice(idx, 1);
                        // Optional: Could spawn a remote pickup effect at item.x, item.y
                        this.loot.pickupEffects.push({ x: item.x, y: item.y, time: this.gameTime, alpha: 1 });
                    }
                }
            });
            this.network.on('doorOpened', (msg) => {
                if (this.gameMap && this.gameMap.doors) {
                    const door = this.gameMap.doors.find(d => d.id === msg.doorId);
                    if (door) {
                        door.alive = false;
                        this.audio.playDoorOpen();
                    }
                }
            });
            this._startNetworkGame(networkGameMsg);
        }

        this.loop(0);
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    startGame() {
        this.audio.resume();
        const mode = this.gameModes[this.selectedMode];
        const themeName = this.themeNames[this.selectedTheme];
        const botCount = mode.botCount || BOT_COUNT;

        this.gameMap = new GameMap(themeName);
        this.currentMode = mode;
        this.zone = new Zone();
        if (mode.zoneSpeedMult) this.zone.speedMultiplier = mode.zoneSpeedMult;
        this.loot = new LootSystem(this.gameMap);

        const spawnPoints = this.gameMap.getSpawnPoints(botCount + 1);

        // Use player name + class from constructor (lobby)
        const selectedClassName = this.playerTankClass || this.tankClassNames[this.selectedClass];
        this.player = new Player(spawnPoints[0].x, spawnPoints[0].y, selectedClassName);
        this.player.name = this.playerName;
        // Sniper Only mode: give player sniper + pistol
        if (mode.weaponFilter) {
            this.player.weapons[0] = { ...WEAPON_TYPES.sniper, type: 'sniper', ammo: WEAPON_TYPES.sniper.magSize };
            this.player.weapons[1] = { ...WEAPON_TYPES.pistol, type: 'pistol', ammo: WEAPON_TYPES.pistol.magSize };
        }
        this.bots = [];
        for (let i = 0; i < botCount; i++) {
            this.bots.push(new Bot(spawnPoints[i + 1].x, spawnPoints[i + 1].y, i));
        }

        this.bullets = [];
        this.particles = [];
        this.damageNumbers = [];
        this.airdrop = new AirdropSystem();
        this.vehicles = new VehicleSystem(this.gameMap);
        this.grenades = [];
        this.smokeGrenades = [];
        this.activeMines = [];
        this.weather = new WeatherSystem();
        this.gameTime = 0;
        this.state = GAME_STATES.PLAYING;
        this.hud.killFeed = [];
        this.hud.notifications = [];
        this.hud.addNotification(`Welcome, ${this.playerName}! Find weapons and survive!`);
    }

    /** Start a multiplayer game from a server gameStart message */
    _startNetworkGame(msg) {
        this.audio.resume();
        const themeName = msg.mapTheme || 'grassland';
        const botCount  = msg.botCount || 0;
        const spawnPts  = msg.spawnPoints || [];
        const spawnIdx  = msg.spawnIndex  || 0;

        // --- Deterministic Generation for MP Sync ---
        const originalRandom = Math.random;
        let seed = msg.mapSeed || 0.12345;
        Math.random = function() {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };

        this.gameMap = new GameMap(themeName);
        this.currentMode = this.gameModes[0];
        this.zone = new Zone();
        this.loot = new LootSystem(this.gameMap);
        this.vehicles = new VehicleSystem(this.gameMap);

        // Restore randomness
        Math.random = originalRandom;
        // ---------------------------------------------

        // Player spawn at assigned index
        const sp = spawnPts[spawnIdx] || { x: 2000, y: 2000 };
        this.player = new Player(sp.x, sp.y, this.playerTankClass);
        this.player.name = this.playerName;

        // Build bots (only host runs AI; non-host bots are rendered from networkBots)
        this.bots = [];
        if (msg.isHost) {
            const botStart = Object.keys(msg.players || {}).length;
            for (let i = 0; i < botCount; i++) {
                const bp = spawnPts[botStart + i] || { x: 2000 + i*50, y: 2000 };
                this.bots.push(new Bot(bp.x, bp.y, i));
            }
        }

        // Build remote players from lobby info
        this.remotePlayers = new Map();
        if (msg.players) {
            Object.values(msg.players).forEach(info => {
                if (info.id === this.network.playerId) return; // skip self
                const bp = spawnPts[info.spawnIndex] || { x: 2000, y: 2000 };
                const rp = new RemotePlayer(info);
                rp.x = bp.x; rp.y = bp.y;
                this.remotePlayers.set(info.id, rp);
            });
        }

        this.networkBots = [];
        this.bullets = [];
        this.particles = [];
        this.damageNumbers = [];
        this.airdrop = new AirdropSystem();
        this.grenades = [];
        this.smokeGrenades = [];
        this.activeMines = [];
        this.weather = new WeatherSystem();
        this.gameTime = 0;
        this.state = GAME_STATES.PLAYING;
        this.hud.killFeed = [];
        this.hud.notifications = [];
        const playerNames = Object.values(msg.players || {}).map(p => p.name).join(', ');
        this.hud.addNotification(`Room ready! Players: ${playerNames}`);
    }

    /** Called from lobby script every server tick */
    applyNetworkTick(tick) {
        // Sync zone from server (server is authoritative in MP)
        if (tick.zone && this.zone) {
            const z = this.zone;
            Object.assign(z, tick.zone);
        }
        
        this.occupiedVehicleIds.clear(); // Fresh set every tick

        // Sync remote players
        if (tick.players) {
            Object.values(tick.players).forEach(st => {
                if (st.id === this.network.playerId) return; // skip self
                let rp = this.remotePlayers.get(st.id);
                if (!rp) {
                    rp = new RemotePlayer(st);
                    this.remotePlayers.set(st.id, rp);
                }
                rp.applyState(st);
                if (st.inVehicleId) this.occupiedVehicleIds.add(st.inVehicleId);
            });
        }

        // Non-host: update networkBots from server relay
        if (tick.bots && !this.network?.isHost) {
            this.networkBots = tick.bots;
        }
    }

    /** Spawn a visible bullet from a remote player firing event */
    spawnRemoteBullet(msg) {
        const w = WEAPON_TYPES[msg.weaponType] || WEAPON_TYPES.pistol;
        const rp = this.remotePlayers ? this.remotePlayers.get(msg.from) : null;
        const owner = rp || { name: 'Unknown', isPlayer: false, isRemote: true };
        
        if (this.bullets) {
            this.bullets.push(new Bullet(msg.x, msg.y, msg.angle, w, owner));
        }
    }

    /** Remove a remote player when they disconnect */
    removeRemotePlayer(id) {
        if (this.remotePlayers) this.remotePlayers.delete(id);
    }

    get allEntities() {
        const remotes = this.remotePlayers ? [...this.remotePlayers.values()] : [];
        return [this.player, ...this.bots, ...remotes];
    }

    get aliveCount() {
        return this.allEntities.filter(e => e.alive).length;
    }

    loop(timestamp) {
        const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
        this.lastTime = timestamp;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.state === GAME_STATES.MENU) {
            this.drawMenu();
        } else if (this.state === GAME_STATES.PLAYING) {
            this.gameTime += dt;
            this.stats.survivalTime = this.gameTime;
            this.update(dt);
            this.draw();
            // Inventory overlay
            if (this.inventory.isOpen) {
                this.inventory.draw(this.ctx, this.canvas, this.player);
            }
        } else if (this.state === GAME_STATES.DEAD) {
            this.draw();
            this.drawDeathScreen();
        } else if (this.state === GAME_STATES.SPECTATING) {
            this.gameTime += dt;
            this.updateSpectate(dt);
            this.draw();
            this.drawSpectateHUD();
        } else if (this.state === GAME_STATES.WON) {
            this.draw();
            this.drawWinScreen();
        }

        this.input.resetFrame();
        requestAnimationFrame((t) => this.loop(t));
    }

    update(dt) {
        // Inventory toggle
        if (this.input.wasPressed('tab')) {
            this.inventory.toggle();
        }
        // Inventory click handling
        if (this.inventory.isOpen) {
            const action = this.inventory.handleMouse(
                this.input.mouse.x, this.input.mouse.y,
                this.input.mouse.down, this.input.mouse.clicked, this.player
            );
            if (action && action.action === 'drop') {
                const w = this.player.weapons[action.slot];
                if (w) {
                    this.loot.items.push({
                        type: 'weapon', weaponType: w.type,
                        x: this.player.x + (Math.random() - 0.5) * 30,
                        y: this.player.y + (Math.random() - 0.5) * 30,
                        color: w.color, id: Math.random(), weight: 0, bobOffset: 0, rarity: w.rarity
                    });
                    this.player.weapons[action.slot] = null;
                    this.hud.addNotification(`Dropped ${w.name}`);
                }
            }
            return; // Don't update game while inventory is open
        }

        // Ambient sounds
        this.ambientTimer -= dt;
        if (this.ambientTimer <= 0) {
            this.ambientTimer = 8 + Math.random() * 12;
            this.audio.playAmbient();
        }

        // Player
        this.player.update(dt, this.input, this.camera, this.gameMap.obstacles, this.gameTime, this.gameMap);

        // Enter/exit vehicle (E key)
        if (this.input.wasPressed('e') && !this.player.inVehicle) {
            const v = this.vehicles.tryEnter(this.player);
            if (v) {
                this.hud.addNotification(`Entered ${v.type === 'car' ? 'Car' : 'Bike'} - WASD to drive, E to exit`);
            }
        }

        // Grenade throw (G key)
        if (this.input.wasPressed('g') && this.player.grenades > 0 && !this.player.inVehicle) {
            this.player.grenades--;
            const mouseWorld = this.input.getMouseWorld(this.camera);
            const throwAngle = Math.atan2(mouseWorld.y - this.player.y, mouseWorld.x - this.player.x);
            this.grenades.push(new Grenade(this.player.x, this.player.y, throwAngle, 300, this.player));
            this.hud.addNotification(`Grenade thrown! (${this.player.grenades} left)`);
        }

        // Smoke grenade throw (H key)
        if (this.input.wasPressed('h') && this.player.smokeGrenades > 0 && !this.player.inVehicle) {
            this.player.smokeGrenades--;
            const mouseWorld = this.input.getMouseWorld(this.camera);
            const throwAngle = Math.atan2(mouseWorld.y - this.player.y, mouseWorld.x - this.player.x);
            this.smokeGrenades.push(new SmokeGrenade(this.player.x, this.player.y, throwAngle, 250, this.player));
            this.hud.addNotification(`Smoke thrown! (${this.player.smokeGrenades} left)`);
        }

        // Mine placement (M key)
        if (this.input.wasPressed('m') && this.player.mines > 0 && !this.player.inVehicle) {
            this.player.mines--;
            this.activeMines.push(new Mine(this.player.x, this.player.y, this.player));
            this.hud.addNotification(`Mine placed! (${this.player.mines} left)`);
        }

        // Healing (hold 3 for bandage, 4 for medkit)
        if (this.input.isKeyDown('3') && !this.player.isHealing) {
            if (this.player.startHealing('bandage')) {
                this.hud.addNotification('Using Bandage... hold still!');
            }
        } else if (this.input.isKeyDown('4') && !this.player.isHealing) {
            if (this.player.startHealing('medkit')) {
                this.hud.addNotification('Using Medkit... hold still!');
            }
        }

        // Cancel healing if shooting or switching weapons
        if (this.player.isHealing && (this.input.mouse.down || this.input.wasPressed('1') || this.input.wasPressed('2'))) {
            this.player.cancelHealing();
            this.hud.addNotification('Healing cancelled!');
        }

        // Check heal completion
        if (this.player.isHealing) {
            const completed = this.player.updateHealing(0); // dt already applied in player.update
            if (completed) {
                this.audio.playHealComplete();
                this.hud.addNotification('Healed!');
            }
        }

        // Sniper scope zoom (right mouse or when aiming sniper)
        if (this.player.currentWeapon && this.player.currentWeapon.type === 'sniper' && this.input.mouse.down) {
            this.camera.setZoom(1.4);
        } else {
            this.camera.setZoom(1);
        }

        // Footstep sounds
        if (this.player._footstepReady && this.player.isMoving && !this.player.inVehicle) {
            this.player._footstepReady = false;
            const surface = this.player.inWater ? 'water' : 'grass';
            this.audio.playFootstep(surface);
        }

        // Player pickup / door open (F key)
        if (this.input.isKeyDown('f')) {
            // Try open nearby door first
            let doorOpened = false;
            for (const door of this.gameMap.doors) {
                if (door.alive && distance(this.player.x, this.player.y, door.x + door.w / 2, door.y + door.h / 2) < 40) {
                    door.alive = false;
                    doorOpened = true;
                    this.audio.playDoorOpen();
                    this.hud.addNotification('Door opened');
                    if (this.network?.connected) this.network.sendDoorOpened(door.id);
                    break;
                }
            }

            if (!doorOpened) {
                // Try open airdrop
                const opened = this.airdrop.tryOpen(this.player, this.loot, this.gameTime);
                if (opened) {
                    this.audio.playPickup();
                    this.hud.addNotification('Airdrop opened! Grab the loot!');
                } else {
                    const picked = this.loot.tryPickup(this.player, this.gameTime);
                    if (picked) {
                        if (picked._skipped) {
                            // Item was near but could not be picked up
                            this.hud.addNotification(picked._reason || 'Cannot pick up!');
                        } else {
                            if (this.network?.connected) this.network.sendItemPickedUp(picked.id);
                            this.audio.playPickup();
                            const rarityLabel = picked.rarity && picked.rarity !== 'common' ? `[${picked.rarity.toUpperCase()}] ` : '';
                            let label = picked.label || (picked.type === 'weapon' ? picked.weaponType.toUpperCase() : picked.type);
                            // Show reserve ammo count after ammo pickup
                            if (picked.type === 'ammo') {
                                const reserve0 = this.player.reserveAmmo ? this.player.reserveAmmo[0] : '?';
                                const reserve1 = this.player.reserveAmmo ? this.player.reserveAmmo[1] : '?';
                                this.hud.addNotification(`Picked up Ammo (+${picked.amount}) | Reserve: ${reserve0} / ${reserve1}`);
                            } else {
                                this.hud.addNotification(`Picked up ${rarityLabel}${label}`);
                            }
                        }
                    }
                }
            }
        }

        // Reload sound
        const wasReloading = this.player.reloading;

        // Player shoot
        // Shoot
        const beforeBullets = this.bullets.length;
        this.player.tryShoot(this.input, this.gameTime, this.bullets, this.camera);
        
        // Broadcast new bullets fired by local player
        if (this.isMultiplayer && this.network && this.bullets.length > beforeBullets) {
            for (let i = beforeBullets; i < this.bullets.length; i++) {
                const b = this.bullets[i];
                if (b.owner === this.player) {
                    this.network.sendBulletFired(b.x, b.y, b.angle, b.weapon.type);
                }
            }
        }
        if (this.bullets.length > beforeBullets && this.player.currentWeapon) {
            this.audio.playShoot(this.player.currentWeapon.type);
            this.stats.shotsFired += this.bullets.length - beforeBullets;
            // Minimap gunfire ping
            if (this.minimap) this.minimap.addPing(this.player.x, this.player.y, 'rgb(255,200,50)');
        }
        if (!wasReloading && this.player.reloading) {
            this.audio.playReload();
        }

        // Bots
        for (const bot of this.bots) {
            if (!bot.alive) continue;
            const prevCount = this.bullets.length;
            bot.update(dt, this.allEntities, this.gameMap.obstacles, this.zone, this.loot, this.bullets, this.gameTime, this.gameMap, this.smokeGrenades, this.network);
            // Distance-based bot shooting sound
            if (this.bullets.length > prevCount && bot.currentWeapon) {
                const target = this.state === GAME_STATES.SPECTATING ? this.spectateTarget : this.player;
                if (target) {
                    const d = distance(target.x, target.y, bot.x, bot.y);
                    if (d < 800) {
                        const vol = Math.max(0.05, 1 - d / 800);
                        this.audio.playShoot(bot.currentWeapon.type, vol);
                    }
                }
            }
        }
        this.bots = this.bots.filter(b => b.alive);

        // Bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            bullet.update(dt);

            if (!bullet.alive) {
                this.bullets.splice(i, 1);
                continue;
            }

            const hit = checkBulletHit(bullet, this.allEntities, this.gameMap.obstacles, this.gameMap.doors, this.gameMap.trees, this.gameMap.bushes);
            if (hit) {
                bullet.alive = false;
                this.bullets.splice(i, 1);
                if (hit.type === 'entity') {
                    const wasAlive = hit.target.alive;

                    // Headshot detection: hit in upper 40% of body circle
                    const hitY = bullet.y;
                    const headZoneTop = hit.target.y - hit.target.radius;
                    const headZoneBottom = hit.target.y - hit.target.radius * 0.2;
                    const isHeadshot = hitY >= headZoneTop && hitY <= headZoneBottom;
                    const baseDamage = isHeadshot ? bullet.damage * 2 : bullet.damage;

                    const actualDamage = hit.target.takeDamage(baseDamage, bullet.owner, isHeadshot);
                    
                    // Route damage to actual victim if it's a remote player
                    if (this.isMultiplayer && this.network && hit.target.isRemote) {
                        const killerName = bullet.owner ? (bullet.owner.name || 'Unknown') : 'Zone';
                        this.network.sendPlayerDamage(hit.target.id, baseDamage, killerName);
                    }

                    if (isHeadshot) this.audio.playHeadshot();
                    else this.audio.playHit();
                    this.camera.shake(isHeadshot ? 6 : 3);

                    // Stats + hit feedback
                    if (bullet.owner === this.player) {
                        this.stats.shotsHit++;
                        this.stats.damageDealt += actualDamage || baseDamage;
                        this.camera.flashHitMarker();  // crosshair hit marker
                    }
                    if (hit.target === this.player) {
                        this.stats.damageTaken += actualDamage || baseDamage;
                        this.killedBy = bullet.owner;
                        this.camera.addDamageIndicator(bullet.owner.x, bullet.owner.y, this.player.x, this.player.y);
                        this.camera.flashVignette(0.5);
                    }

                    // Floating damage number
                    this.damageNumbers.push({
                        x: hit.target.x + (Math.random() - 0.5) * 10,
                        y: hit.target.y - 20,
                        value: Math.round(actualDamage || baseDamage),
                        isHeadshot,
                        life: 1.0,
                        vy: -40
                    });

                    // Enhanced blood particles
                    const particleCount = isHeadshot ? 10 : 6;
                    const speed = isHeadshot ? 150 : 100;
                    for (let p = 0; p < particleCount; p++) {
                        this.particles.push({
                            x: hit.target.x, y: hit.target.y,
                            vx: (Math.random() - 0.5) * speed,
                            vy: (Math.random() - 0.5) * speed,
                            life: isHeadshot ? 0.8 : 0.5,
                            color: isHeadshot ? '#ff4' : '#c33',
                            size: isHeadshot ? 3 : 2
                        });
                    }

                    // Headshot notification for player kills
                    if (isHeadshot && bullet.owner === this.player) {
                        this.hud.addNotification('HEADSHOT!');
                    }

                    if (wasAlive && !hit.target.alive) {
                        this.hud.addKill(bullet.owner, hit.target);
                        this.audio.playDeath();
                        if (bullet.owner === this.player) {
                            this.audio.playKill();
                            this.camera.flashKill(); // gold kill flash
                            // Kill upgrade
                            const upgradeName = this.player.applyKillUpgrade();
                            if (upgradeName) this.hud.addNotification(`UPGRADE: ${upgradeName}!`);
                            // Kill streak tracking
                            const now = this.gameTime;
                            if (now - this.lastKillTime < this.KILL_STREAK_WINDOW) {
                                this.killStreak++;
                                const streakNames = ['', '', 'DOUBLE KILL!', 'TRIPLE KILL!', 'QUAD KILL!', 'RAMPAGE!'];
                                if (this.killStreak >= 2 && this.killStreak < streakNames.length) {
                                    this.hud.addNotification(streakNames[this.killStreak]);
                                } else if (this.killStreak >= streakNames.length) {
                                    this.hud.addNotification('UNSTOPPABLE!');
                                }
                            } else {
                                this.killStreak = 1;
                            }
                            this.lastKillTime = now;
                        }
                        if (bullet.owner === this.player && isHeadshot) this.stats.headshotKills++;
                        // Death marker
                        this.particles.push({
                            x: hit.target.x, y: hit.target.y,
                            vx: 0, vy: 0, life: 5, color: '#f44', size: 0, isDeathMarker: true
                        });

                        // Drop loot from dead entity
                        const dx = hit.target.x, dy = hit.target.y;
                        const rOff = () => (Math.random() - 0.5) * 30;
                        // Drop weapons
                        for (const w of hit.target.weapons) {
                            if (w) {
                                this.loot.items.push({
                                    type: 'weapon', weaponType: w.type,
                                    x: dx + rOff(), y: dy + rOff(),
                                    color: w.color, id: Math.random(),
                                    weight: 0, bobOffset: 0, rarity: w.rarity || 'common'
                                });
                            }
                        }
                        // Drop bandages
                        const bandCount = hit.target.bandages || 0;
                        if (bandCount > 0) {
                            this.loot.items.push({
                                type: 'bandage', amount: 15, label: 'Bandage',
                                x: dx + rOff(), y: dy + rOff(),
                                color: '#f88', id: Math.random(), weight: 0, bobOffset: 0, rarity: 'common'
                            });
                        }
                        // Drop medkits
                        const medCount = hit.target.medkits || 0;
                        if (medCount > 0) {
                            this.loot.items.push({
                                type: 'health', amount: 25, label: 'Medkit',
                                x: dx + rOff(), y: dy + rOff(),
                                color: '#e44', id: Math.random(), weight: 0, bobOffset: 0, rarity: 'uncommon'
                            });
                        }
                        // Drop backpack
                        if (hit.target.backpackLevel > 0) {
                            const lvl = hit.target.backpackLevel;
                            this.loot.items.push({
                                type: 'backpack', level: lvl,
                                label: `Backpack Lv.${lvl}`,
                                x: dx + rOff(), y: dy + rOff(),
                                color: lvl === 1 ? '#a86' : lvl === 2 ? '#86a' : '#da6',
                                id: Math.random(), weight: 0, bobOffset: 0,
                                rarity: lvl === 1 ? 'uncommon' : lvl === 2 ? 'rare' : 'epic'
                            });
                        }
                        // Drop ammo
                        this.loot.items.push({
                            type: 'ammo', amount: 30,
                            x: dx + rOff(), y: dy + rOff(),
                            color: '#ec4', id: Math.random(), weight: 0, bobOffset: 0, rarity: 'common'
                        });

                        // Death burst particles
                        for (let p = 0; p < 12; p++) {
                            const a = (p / 12) * Math.PI * 2;
                            this.particles.push({
                                x: hit.target.x, y: hit.target.y,
                                vx: Math.cos(a) * 120,
                                vy: Math.sin(a) * 120,
                                life: 0.7,
                                color: '#f84',
                                size: 3
                            });
                        }
                    }
                } else if (hit.type === 'door') {
                    // Hit a door - damage it
                    this.gameMap.damageDoor(hit.target, bullet.damage);
                    // Wood splinter particles
                    for (let p = 0; p < 4; p++) {
                        this.particles.push({
                            x: bullet.x, y: bullet.y,
                            vx: (Math.random() - 0.5) * 80,
                            vy: (Math.random() - 0.5) * 80,
                            life: 0.4,
                            color: '#a74',
                            size: 2
                        });
                    }
                    if (!hit.target.alive) {
                        // Door destroyed burst
                        for (let p = 0; p < 8; p++) {
                            this.particles.push({
                                x: hit.target.x + hit.target.w / 2,
                                y: hit.target.y + hit.target.h / 2,
                                vx: (Math.random() - 0.5) * 120,
                                vy: (Math.random() - 0.5) * 120,
                                life: 0.6,
                                color: '#864',
                                size: 3
                            });
                        }
                    }
                } else if (hit.type === 'tree') {
                    hit.target.health -= bullet.damage;
                    // Wood particles
                    for (let p = 0; p < 3; p++) {
                        this.particles.push({
                            x: bullet.x, y: bullet.y,
                            vx: (Math.random() - 0.5) * 60,
                            vy: (Math.random() - 0.5) * 60,
                            life: 0.4, color: '#874', size: 2
                        });
                    }
                    if (hit.target.health <= 0) {
                        hit.target.alive = false;
                        // Destruction burst
                        for (let p = 0; p < 8; p++) {
                            this.particles.push({
                                x: hit.target.x, y: hit.target.y,
                                vx: (Math.random() - 0.5) * 100,
                                vy: (Math.random() - 0.5) * 100,
                                life: 0.6, color: Math.random() < 0.5 ? '#6a4' : '#874', size: 3
                            });
                        }
                    }
                } else if (hit.type === 'bush') {
                    hit.target.health -= bullet.damage;
                    if (hit.target.health <= 0) {
                        hit.target.alive = false;
                        for (let p = 0; p < 5; p++) {
                            this.particles.push({
                                x: hit.target.x, y: hit.target.y,
                                vx: (Math.random() - 0.5) * 60,
                                vy: (Math.random() - 0.5) * 60,
                                life: 0.4, color: '#5a3', size: 2
                            });
                        }
                    }
                } else if (hit.type === 'obstacle' && hit.target.type === 'rock' && hit.target.health !== undefined) {
                    hit.target.health -= bullet.damage;
                    // Spark particles
                    for (let p = 0; p < 4; p++) {
                        this.particles.push({
                            x: bullet.x, y: bullet.y,
                            vx: (Math.random() - 0.5) * 80,
                            vy: (Math.random() - 0.5) * 80,
                            life: 0.3, color: '#ff8', size: 2
                        });
                    }
                    if (hit.target.health <= 0) {
                        hit.target.alive = false;
                        for (let p = 0; p < 10; p++) {
                            this.particles.push({
                                x: hit.target.x + hit.target.w / 2, y: hit.target.y + hit.target.h / 2,
                                vx: (Math.random() - 0.5) * 120,
                                vy: (Math.random() - 0.5) * 120,
                                life: 0.5, color: '#888', size: 3
                            });
                        }
                    }
                } else {
                    // Hit obstacle - spark particles
                    for (let p = 0; p < 5; p++) {
                        const bounceAngle = Math.atan2(bullet.vy, bullet.vx) + Math.PI + (Math.random() - 0.5) * 1.5;
                        this.particles.push({
                            x: bullet.x, y: bullet.y,
                            vx: Math.cos(bounceAngle) * (40 + Math.random() * 60),
                            vy: Math.sin(bounceAngle) * (40 + Math.random() * 60),
                            life: 0.4, color: '#ff8', size: 2
                        });
                    }
                }
            }
        }

        // Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= 0.94;
            p.vy *= 0.94;
            if (!p.isDeathMarker) p.vy += 60 * dt; // gravity
            if (p.size > 0.5) p.size *= 0.98;      // size decay
            p.life -= dt;
            if (p.life <= 0) this.particles.splice(i, 1);
        }

        // Damage numbers
        for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
            const d = this.damageNumbers[i];
            d.y += d.vy * dt;
            d.vy *= 0.95;
            d.life -= dt;
            if (d.life <= 0) this.damageNumbers.splice(i, 1);
        }

        // Zone
        this.zone.update(dt);
        this.zone.applyDamage(this.allEntities, dt);

        // Grenades
        for (let i = this.grenades.length - 1; i >= 0; i--) {
            const g = this.grenades[i];
            const shouldExplode = g.update(dt);
            if (shouldExplode) {
                g.explode(this.allEntities, this.particles, this.damageNumbers, this.camera, this.audio);
                this.grenades.splice(i, 1);
            }
        }

        // Mines
        for (let i = this.activeMines.length - 1; i >= 0; i--) {
            const exploded = this.activeMines[i].update(dt, this.allEntities, this.particles, this.damageNumbers, this.camera, this.audio);
            if (!this.activeMines[i].alive) this.activeMines.splice(i, 1);
        }

        // Smoke grenades
        for (let i = this.smokeGrenades.length - 1; i >= 0; i--) {
            const done = this.smokeGrenades[i].update(dt);
            if (done) this.smokeGrenades.splice(i, 1);
        }

        // Weather
        this.weather.update(dt);

        // Airdrop
        this.airdrop.update(dt, this.gameTime, this.zone, this.loot, this.hud);

        // Loot
        this.loot.update(this.gameTime);

        // Camera
        this.camera.follow(this.player);
        this.camera.update(dt);

        // HUD
        this.hud.update(dt);

        // Check death from zone for kill feed
        for (const e of this.allEntities) {
            if (!e.alive && e._prevAlive) {
                // Already handled in takeDamage
            }
            e._prevAlive = e.alive;
        }

        // Win/lose check
        if (!this.player.alive && this.state !== GAME_STATES.DEAD) {
            this.state = GAME_STATES.DEAD;
            this.deathTime = this.gameTime;
            if (this.isMultiplayer && this.network) {
                this.network.sendPlayerDied(this.killedBy?.name || 'Zone');
            }
        } else if (this.aliveCount === 1 && this.player.alive && this.state === GAME_STATES.PLAYING) {
            this.state = GAME_STATES.WON;
        }
    }

    draw() {
        this.camera.applyTransform(this.ctx);

        // Map
        this.gameMap.draw(this.ctx, this.camera, this.gameTime);

        // Loot
        this.loot.draw(this.ctx, this.camera, this.gameTime);

        // Vehicles
        const allOccupied = new Set(this.occupiedVehicleIds);
        if (this.player.inVehicle) allOccupied.add(this.player.inVehicle.id);
        this.vehicles.draw(this.ctx, this.camera, allOccupied);

        // Airdrops
        this.airdrop.draw(this.ctx, this.camera, this.gameTime);

        // Zone
        this.zone.draw(this.ctx);

        // Bullets
        for (const b of this.bullets) {
            if (this.camera.isVisible(b.x, b.y, 10)) {
                b.draw(this.ctx);
            }
        }

        // Particles
        for (const p of this.particles) {
            if (p.isDeathMarker) {
                // Draw X skull marker
                this.ctx.globalAlpha = Math.min(1, p.life * 0.4);
                this.ctx.strokeStyle = '#f44';
                this.ctx.lineWidth = 2;
                const s = 6;
                this.ctx.beginPath();
                this.ctx.moveTo(p.x - s, p.y - s); this.ctx.lineTo(p.x + s, p.y + s);
                this.ctx.moveTo(p.x + s, p.y - s); this.ctx.lineTo(p.x - s, p.y + s);
                this.ctx.stroke();
                continue;
            }
            // Glow for large particles (headshot debris)
            if (p.size > 2.5 && p.life > 0.3) {
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, (p.size || 2) + 3, 0, Math.PI * 2);
                this.ctx.fillStyle = `rgba(255,200,100,${Math.max(0, p.life * 0.15)})`;
                this.ctx.fill();
            }
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, Math.max(0.3, p.size || 2), 0, Math.PI * 2);
            this.ctx.fillStyle = p.color;
            this.ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2.5));
            this.ctx.fill();
        }
        this.ctx.globalAlpha = 1;

        // Damage numbers (world space) — animated scale
        for (const d of this.damageNumbers) {
            const alpha = Math.max(0, d.life);
            const scale = d.life > 0.7 ? 1 + (d.life - 0.7) * 3 : 1; // pop-in effect
            this.ctx.globalAlpha = alpha;
            this.ctx.save();
            this.ctx.translate(d.x, d.y);
            this.ctx.scale(scale, scale);
            this.ctx.font = d.isHeadshot ? 'bold 16px Rajdhani, Arial' : 'bold 13px Rajdhani, Arial';
            this.ctx.textAlign = 'center';
            this.ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            this.ctx.lineWidth = 3;
            this.ctx.strokeText(`-${d.value}`, 0, 0);
            this.ctx.fillStyle = d.isHeadshot ? '#ff4' : '#fff';
            this.ctx.fillText(`-${d.value}`, 0, 0);
            if (d.isHeadshot) {
                this.ctx.font = 'bold 9px Rajdhani, Arial';
                this.ctx.fillStyle = '#fc4';
                this.ctx.fillText('💀 HEADSHOT', 0, -16);
            }
            this.ctx.restore();
        }
        this.ctx.globalAlpha = 1;

        // Bots (local AI — always for SP, only for host in MP)
        for (const bot of this.bots) {
            if (this.camera.isVisible(bot.x, bot.y, 30)) {
                bot.draw(this.ctx);
            }
        }

        // Network bots (non-host clients: rendered from server relay)
        if (this.networkBots && !this.network?.isHost) {
            for (const bd of this.networkBots) {
                if (!bd.alive) continue;
                if (!this.camera.isVisible(bd.x, bd.y, 30)) continue;
                // Simplified bot rendering from broadcast data
                const tc = bd.tankClass ? (TANK_CLASSES[bd.tankClass] || {}) : {};
                const hw = tc.hullW || 14, hh = tc.hullH || 20;
                this.ctx.save();
                this.ctx.translate(bd.x, bd.y);
                this.ctx.rotate((bd.angle || 0) + Math.PI/2);
                const diffColors = { easy:'#8a8a80', medium:'#6a6a60', hard:'#8a3030' };
                this.ctx.fillStyle = diffColors[bd.difficulty] || '#777';
                this.ctx.beginPath();
                this.ctx.roundRect(-hw/2, -hh/2, hw, hh, 2); this.ctx.fill();
                this.ctx.restore();
                // Barrel
                const blen = 18;
                const w = bd.currentWeapon;
                this.ctx.beginPath();
                this.ctx.moveTo(bd.x, bd.y);
                this.ctx.lineTo(bd.x + Math.cos(bd.angle)*blen, bd.y + Math.sin(bd.angle)*blen);
                this.ctx.strokeStyle = w ? (w.color || '#555') : '#555';
                this.ctx.lineWidth = 2.5; this.ctx.stroke();
                // Name + HP bar
                const nameColors = { easy:'#ccc', medium:'#fc4', hard:'#f44' };
                this.ctx.fillStyle = nameColors[bd.difficulty] || '#ccc';
                this.ctx.font = '10px Arial'; this.ctx.textAlign = 'center';
                this.ctx.fillText(bd.name||'Bot', bd.x, bd.y - 22);
                const bw = 26;
                const pct = bd.health / (bd.maxHealth || 100);
                this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
                this.ctx.fillRect(bd.x-bw/2, bd.y-18, bw, 3);
                this.ctx.fillStyle = pct > 0.5 ? '#4c4' : '#c44';
                this.ctx.fillRect(bd.x-bw/2, bd.y-18, bw*pct, 3);
            }
        }

        // Remote real players
        if (this.remotePlayers) {
            for (const rp of this.remotePlayers.values()) {
                rp.updateVisuals(1/60);
                if (this.camera.isVisible(rp.x, rp.y, 40)) {
                    rp.draw(this.ctx);
                }
            }
        }

        // Grenades
        for (const g of this.grenades) {
            g.draw(this.ctx);
        }
        // Smoke grenades
        for (const sg of this.smokeGrenades) {
            sg.draw(this.ctx);
        }
        // Mines
        for (const mine of this.activeMines) {
            mine.draw(this.ctx);
        }

        // Player
        this.player.draw(this.ctx);

        // HUD (screen space)
        this.camera.resetTransform(this.ctx);

        // Camera overlays (vignette, damage indicators)
        this.camera.drawOverlays(this.ctx, this.canvas);

        // Low HP red pulse
        if (this.player.alive && this.player.health < 30) {
            const pulse = (Math.sin(this.gameTime * 4) + 1) * 0.5;
            const alpha = 0.1 + pulse * 0.15;
            this.ctx.fillStyle = `rgba(255, 0, 0, ${alpha})`;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        // Zone outside warning — pulsing blue edges
        if (this.player.alive && !this.zone.isInZone(this.player.x, this.player.y)) {
            const pulse = (Math.sin(this.gameTime * 6) + 1) * 0.5;
            const edgeAlpha = 0.25 + pulse * 0.25;
            // Blue vignette edge flash
            const grd = this.ctx.createRadialGradient(
                this.canvas.width / 2, this.canvas.height / 2, this.canvas.height * 0.3,
                this.canvas.width / 2, this.canvas.height / 2, this.canvas.height * 0.8
            );
            grd.addColorStop(0, 'rgba(0,100,255,0)');
            grd.addColorStop(1, `rgba(0,100,255,${edgeAlpha})`);
            this.ctx.fillStyle = grd;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            // Direction arrow toward zone center (screen-space)
            const zoneCenter = this.zone.getSafeCenter();
            const screenCX = (zoneCenter.x - this.camera.x) * this.camera.zoom + this.canvas.width / 2;
            const screenCY = (zoneCenter.y - this.camera.y) * this.camera.zoom + this.canvas.height / 2;
            const arrowAngle = Math.atan2(screenCY - this.canvas.height / 2, screenCX - this.canvas.width / 2);
            const arrowDist = Math.min(this.canvas.width, this.canvas.height) * 0.38;
            const ax = this.canvas.width / 2 + Math.cos(arrowAngle) * arrowDist;
            const ay = this.canvas.height / 2 + Math.sin(arrowAngle) * arrowDist;

            this.ctx.save();
            this.ctx.translate(ax, ay);
            this.ctx.rotate(arrowAngle);
            this.ctx.fillStyle = `rgba(0,200,255,${0.6 + pulse * 0.4})`;
            this.ctx.beginPath();
            this.ctx.moveTo(18, 0);
            this.ctx.lineTo(-10, -9);
            this.ctx.lineTo(-6, 0);
            this.ctx.lineTo(-10, 9);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.restore();

            // Warning text
            this.ctx.fillStyle = `rgba(0,200,255,${0.8 + pulse * 0.2})`;
            this.ctx.font = 'bold 15px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('⚠ OUTSIDE SAFE ZONE — TAKING DAMAGE ⚠', this.canvas.width / 2, 95);
        }

        // Nearby loot pickup prompt (press F)
        if (this.player.alive && this.loot) {
            const PROMPT_RANGE = 55;
            let nearestItem = null, nearestDist = PROMPT_RANGE;
            for (const item of this.loot.items) {
                // Convert item world pos to screen pos
                const screenX = (item.x - this.camera.x) * this.camera.zoom + this.canvas.width / 2;
                const screenY = (item.y - this.camera.y) * this.camera.zoom + this.canvas.height / 2;
                const dx = item.x - this.player.x;
                const dy = item.y - this.player.y;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < nearestDist) {
                    nearestDist = d;
                    nearestItem = { item, screenX, screenY };
                }
            }
            if (nearestItem) {
                const { item, screenX, screenY } = nearestItem;
                const label = item.label || (item.type === 'weapon' ? item.weaponType.toUpperCase() : item.type.charAt(0).toUpperCase() + item.type.slice(1));
                const pulse = (Math.sin(this.gameTime * 4) + 1) * 0.5;
                const alpha = 0.7 + pulse * 0.3;
                this.ctx.save();
                this.ctx.font = 'bold 11px Arial';
                this.ctx.textAlign = 'center';
                const text = `[F] ${label}`;
                const tw = this.ctx.measureText(text).width;
                this.ctx.fillStyle = `rgba(0,0,0,${0.5 * alpha})`;
                this.ctx.fillRect(screenX - tw / 2 - 5, screenY - 34, tw + 10, 18);
                this.ctx.fillStyle = `rgba(255,230,80,${alpha})`;
                this.ctx.fillText(text, screenX, screenY - 21);
                this.ctx.restore();
            }
        }

        // Weather overlay
        this.weather.draw(this.ctx, this.canvas);
        this.hud.draw(this.ctx, this.canvas, this.player, this.aliveCount, this.zone);
        this.minimap.draw(this.ctx, this.canvas, this.player, this.bots, this.zone, this.airdrop, this.vehicles);

        // --- Dynamic Crosshair ---
        if (this.player.alive && !this.player.inVehicle) {
            const cx = this.input.mouse.x;
            const cy = this.input.mouse.y;
            const w = this.player.currentWeapon;
            const spread = w ? (w.spread + (w._currentSpread || 0)) * 100 : 8;
            const baseGap = 4 + spread;
            const lineLen = 6;
            const lineW = 1.5;

            this.ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            this.ctx.lineWidth = lineW;
            // Top
            this.ctx.beginPath();
            this.ctx.moveTo(cx, cy - baseGap);
            this.ctx.lineTo(cx, cy - baseGap - lineLen);
            this.ctx.stroke();
            // Bottom
            this.ctx.beginPath();
            this.ctx.moveTo(cx, cy + baseGap);
            this.ctx.lineTo(cx, cy + baseGap + lineLen);
            this.ctx.stroke();
            // Left
            this.ctx.beginPath();
            this.ctx.moveTo(cx - baseGap, cy);
            this.ctx.lineTo(cx - baseGap - lineLen, cy);
            this.ctx.stroke();
            // Right
            this.ctx.beginPath();
            this.ctx.moveTo(cx + baseGap, cy);
            this.ctx.lineTo(cx + baseGap + lineLen, cy);
            this.ctx.stroke();
            // Center dot
            this.ctx.beginPath();
            this.ctx.arc(cx, cy, 1, 0, Math.PI * 2);
            this.ctx.fillStyle = 'rgba(255,255,255,0.5)';
            this.ctx.fill();
        }
    }

    enterSpectateMode() {
        const aliveBots = this.bots.filter(b => b.alive);
        if (aliveBots.length === 0) {
            this.state = GAME_STATES.MENU;
            return;
        }
        this.state = GAME_STATES.SPECTATING;
        this.spectateIndex = 0;
        this.spectateTarget = aliveBots[0];
    }

    updateSpectate(dt) {
        // Continue game simulation
        for (const bot of this.bots) {
            const prevCount = this.bullets.length;
            bot.update(dt, this.allEntities, this.gameMap.obstacles, this.zone, this.loot, this.bullets, this.gameTime, this.gameMap, this.smokeGrenades, this.network);
            if (this.bullets.length > prevCount && bot.currentWeapon) {
                if (this.spectateTarget && distance(this.spectateTarget.x, this.spectateTarget.y, bot.x, bot.y) < 600) {
                    this.audio.playShoot(bot.currentWeapon.type);
                }
            }
        }

        // Bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            bullet.update(dt);
            if (!bullet.alive) { this.bullets.splice(i, 1); continue; }
            const hit = checkBulletHit(bullet, this.allEntities, this.gameMap.obstacles, this.gameMap.doors, this.gameMap.trees, this.gameMap.bushes);
            if (hit) {
                bullet.alive = false;
                this.bullets.splice(i, 1);
                if (hit.type === 'entity') {
                    const wasAlive = hit.target.alive;
                    hit.target.takeDamage(bullet.damage, bullet.owner);
                    if (wasAlive && !hit.target.alive) {
                        this.hud.addKill(bullet.owner, hit.target);
                    }
                }
            }
        }

        // Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt; p.y += p.vy * dt;
            p.vx *= 0.95; p.vy *= 0.95; p.life -= dt;
            if (p.life <= 0) this.particles.splice(i, 1);
        }

        this.zone.update(dt);
        this.zone.applyDamage(this.allEntities, dt);
        this.airdrop.update(dt, this.gameTime, this.zone, this.loot, this.hud);
        this.loot.update(this.gameTime);
        this.hud.update(dt);

        // Switch spectate target with left/right arrow or A/D
        if (this.input.wasPressed('arrowright') || this.input.wasPressed('d')) {
            this.cycleSpectate(1);
        }
        if (this.input.wasPressed('arrowleft') || this.input.wasPressed('a')) {
            this.cycleSpectate(-1);
        }

        // Follow spectate target
        if (this.spectateTarget && this.spectateTarget.alive) {
            this.camera.follow(this.spectateTarget);
        } else {
            this.cycleSpectate(1);
        }
        this.camera.update(dt);

        // Game over check
        if (this.bots.filter(b => b.alive).length <= 1) {
            this.state = GAME_STATES.MENU;
        }
    }

    cycleSpectate(dir) {
        const aliveBots = this.bots.filter(b => b.alive);
        if (aliveBots.length === 0) return;
        this.spectateIndex = (this.spectateIndex + dir + aliveBots.length) % aliveBots.length;
        this.spectateTarget = aliveBots[this.spectateIndex];
    }

    drawSpectateHUD() {
        const ctx = this.ctx;
        const cx = this.canvas.width / 2;

        // Top bar
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, this.canvas.width, 45);

        ctx.fillStyle = '#8cf';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('SPECTATING', cx, 20);

        if (this.spectateTarget) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px Arial';
            ctx.fillText(this.spectateTarget.name, cx, 38);

            // Target health
            const barW = 120;
            const hpPct = this.spectateTarget.health / this.spectateTarget.maxHealth;
            ctx.fillStyle = '#333';
            ctx.fillRect(cx - barW / 2, 42, barW, 6);
            ctx.fillStyle = hpPct > 0.5 ? '#4c4' : '#c44';
            ctx.fillRect(cx - barW / 2, 42, barW * hpPct, 6);
        }

        // Alive count
        ctx.fillStyle = '#aaa';
        ctx.font = '12px Arial';
        ctx.fillText(`Alive: ${this.aliveCount}`, cx, 60);

        // Controls
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '11px Arial';
        ctx.fillText('A/D or Arrow Keys: Switch Player  |  Click: Return to Menu', cx, this.canvas.height - 15);

        // Kill feed
        this.hud.drawKillFeedOnly(ctx, this.canvas);
    }

    updateMenu() {
        // Theme cycle with left/right
        if (this.input.wasPressed('arrowleft') || this.input.wasPressed('a')) {
            this.selectedTheme = (this.selectedTheme - 1 + this.themeNames.length) % this.themeNames.length;
        }
        if (this.input.wasPressed('arrowright') || this.input.wasPressed('d')) {
            this.selectedTheme = (this.selectedTheme + 1) % this.themeNames.length;
        }
        // Class cycle with Q/E
        if (this.input.wasPressed('q')) {
            this.selectedClass = (this.selectedClass - 1 + this.tankClassNames.length) % this.tankClassNames.length;
        }
        if (this.input.wasPressed('e')) {
            this.selectedClass = (this.selectedClass + 1) % this.tankClassNames.length;
        }
        // Mode cycle with up/down
        if (this.input.wasPressed('arrowup') || this.input.wasPressed('w')) {
            this.selectedMode = (this.selectedMode - 1 + this.gameModes.length) % this.gameModes.length;
        }
        if (this.input.wasPressed('arrowdown') || this.input.wasPressed('s')) {
            this.selectedMode = (this.selectedMode + 1) % this.gameModes.length;
        }
    }

    drawMenu() {
        this.updateMenu();
        const ctx = this.ctx;
        const W = this.canvas.width, H = this.canvas.height;
        const cx = W / 2, cy = H / 2;

        // Deep dark background
        ctx.fillStyle = '#0a0a15';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#0d0d1f';
        ctx.fillRect(0, 0, W, H);

        // Animated hex grid overlay
        const t = performance.now() / 1000;
        ctx.strokeStyle = 'rgba(0,200,255,0.04)';
        ctx.lineWidth = 1;
        const gridSize = 50;
        for (let gx = 0; gx < W + gridSize; gx += gridSize) {
            for (let gy = 0; gy < H + gridSize; gy += gridSize) {
                ctx.beginPath();
                ctx.arc(gx + Math.sin(t * 0.3 + gy * 0.01) * 5, gy + Math.cos(t * 0.3 + gx * 0.01) * 5, 1, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
        for (let gx = 0; gx < W; gx += gridSize) {
            ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H);
            ctx.strokeStyle = 'rgba(0,200,255,0.02)'; ctx.stroke();
        }
        for (let gy = 0; gy < H; gy += gridSize) {
            ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy);
            ctx.strokeStyle = 'rgba(0,200,255,0.02)'; ctx.stroke();
        }

        // Glowing title
        const titlePulse = (Math.sin(t * 1.5) + 1) * 0.5;
        ctx.save();
        ctx.shadowColor = `rgba(255,200,0,${0.6 + titlePulse * 0.4})`;
        ctx.shadowBlur = 30 + titlePulse * 20;
        ctx.fillStyle = '#f5c842';
        ctx.font = `bold 64px Orbitron, Arial`;
        ctx.textAlign = 'center';
        ctx.fillText('TANK ROYALE', cx, cy - 140);
        ctx.restore();

        // Subtitle
        ctx.fillStyle = 'rgba(0,200,255,0.7)';
        ctx.font = '14px Rajdhani, Arial';
        ctx.textAlign = 'center';
        ctx.fillText('BATTLE UNTIL ONE REMAINS', cx, cy - 108);

        // Horizontal divider
        ctx.strokeStyle = 'rgba(255,200,0,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 200, cy - 95);
        ctx.lineTo(cx + 200, cy - 95);
        ctx.stroke();

        // Map theme selector
        const theme = MAP_THEMES[this.themeNames[this.selectedTheme]];
        ctx.fillStyle = '#5af';
        ctx.font = 'bold 16px Rajdhani, Arial';
        ctx.fillText(`◀  MAP: ${theme.name}  ▶`, cx, cy - 72);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '11px Rajdhani, Arial';
        ctx.fillText('A / D  ·  Change Map', cx, cy - 54);

        // Game mode selector
        const mode = this.gameModes[this.selectedMode];
        ctx.fillStyle = '#fca';
        ctx.font = 'bold 16px Rajdhani, Arial';
        ctx.fillText(`◀  MODE: ${mode.name}  ▶`, cx, cy - 26);
        ctx.fillStyle = '#aaa';
        ctx.font = '12px Rajdhani, Arial';
        ctx.fillText(mode.desc, cx, cy - 10);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '11px Rajdhani, Arial';
        ctx.fillText('W / S  ·  Change Mode', cx, cy + 6);

        // Tank class selector
        const className = this.tankClassNames[this.selectedClass];
        const classData = TANK_CLASSES[className];
        const classColors = { light: '#6aaa50', medium: '#5a8a40', heavy: '#4a7a3a' };
        ctx.fillStyle = classColors[className] || '#6c8';
        ctx.font = 'bold 16px Rajdhani, Arial';
        ctx.fillText(`◀  CLASS: ${classData.name.toUpperCase()}  ▶`, cx, cy + 30);
        ctx.fillStyle = '#888';
        ctx.font = '11px Rajdhani, Arial';
        ctx.fillText(`Speed: ${classData.speed}  |  HP: ${classData.hp}  |  Dmg: ${classData.dmgMult}x  |  Reduce: ${(classData.dmgReduction * 100) | 0}%`, cx, cy + 46);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillText('Q / E  ·  Change Class', cx, cy + 60);

        // Play button — animated gradient
        const btnW = 240, btnH = 54;
        const btnX = cx - btnW / 2;
        const btnY = cy + 76;
        const btnGrd = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY + btnH);
        const btnPulse = (Math.sin(t * 2.5) + 1) * 0.5;
        btnGrd.addColorStop(0, `rgba(220,100,0,${0.8 + btnPulse * 0.2})`);
        btnGrd.addColorStop(1, `rgba(255,170,0,${0.8 + btnPulse * 0.2})`);
        ctx.save();
        ctx.shadowColor = `rgba(255,140,0,${0.5 + btnPulse * 0.5})`;
        ctx.shadowBlur = 20 + btnPulse * 15;
        ctx.fillStyle = btnGrd;
        ctx.beginPath();
        ctx.roundRect(btnX, btnY, btnW, btnH, 6);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 22px Orbitron, Arial';
        ctx.textAlign = 'center';
        ctx.fillText('▶  DEPLOY', cx, btnY + 35);

        // Player count info
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '12px Rajdhani, Arial';
        ctx.fillText(`${mode.botCount + 1} Players  ·  Last One Standing Wins`, cx, cy + 150);
        ctx.fillText('WASD: Move  ·  Mouse: Aim & Fire  ·  F: Interact  ·  R: Reload  ·  Tab: Inventory', cx, cy + 168);
    }

    drawDeathScreen() {
        const ctx = this.ctx;
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;

        // Full dark overlay
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Red radial vignette
        const redGrd = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(cx, cy));
        redGrd.addColorStop(0.4, 'rgba(180,0,0,0)');
        redGrd.addColorStop(1, 'rgba(180,0,0,0.4)');
        ctx.fillStyle = redGrd;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // ELIMINATED title
        ctx.save();
        ctx.shadowColor = 'rgba(255,50,50,0.8)';
        ctx.shadowBlur = 30;
        ctx.fillStyle = '#f44';
        ctx.font = 'bold 52px Orbitron, Arial';
        ctx.textAlign = 'center';
        ctx.fillText('ELIMINATED', cx, cy - 90);
        ctx.restore();

        // Killed by
        if (this.killedBy && this.killedBy.name) {
            ctx.fillStyle = '#faa';
            ctx.font = '16px Rajdhani, Arial';
            ctx.fillText(`Eliminated by  ${this.killedBy.name}`, cx, cy - 58);
        }

        // Placement
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 30px Orbitron, Arial';
        ctx.fillText(`#${this.aliveCount + 1} of 30`, cx, cy - 22);

        // Stats panel
        const panelW = 340;
        const panelX = cx - panelW / 2;
        const panelY = cy - 8;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.roundRect(panelX, panelY, panelW, 140, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(244,68,68,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();

        const stats = [
            ['Kills', this.player.kills],
            ['Damage Dealt', Math.round(this.stats.damageDealt)],
            ['Damage Taken', Math.round(this.stats.damageTaken)],
            ['Accuracy', this.stats.shotsFired > 0 ? Math.round(this.stats.shotsHit / this.stats.shotsFired * 100) + '%' : '0%'],
            ['Headshot Kills', this.stats.headshotKills],
            ['Survival Time', Math.floor(this.stats.survivalTime) + 's'],
        ];

        ctx.font = '13px Rajdhani, Arial';
        for (let i = 0; i < stats.length; i++) {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const sx = panelX + 18 + col * 160;
            const sy = panelY + 26 + row * 34;
            ctx.fillStyle = '#888';
            ctx.textAlign = 'left';
            ctx.fillText(stats[i][0], sx, sy);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 13px Rajdhani, Arial';
            ctx.textAlign = 'right';
            ctx.fillText(stats[i][1], sx + 140, sy);
            ctx.font = '13px Rajdhani, Arial';
        }

        // Spectate prompt
        const btnPulse = (Math.sin(performance.now() / 400) + 1) * 0.5;
        ctx.fillStyle = `rgba(60,180,255,${0.7 + btnPulse * 0.3})`;
        ctx.font = 'bold 14px Rajdhani, Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Click to SPECTATE remaining players', cx, cy + 163);
    }

    drawWinScreen() {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Gold radial glow
        const t = performance.now() / 1000;
        const glow = (Math.sin(t * 2) + 1) * 0.5;
        const goldGrd = ctx.createRadialGradient(
            this.canvas.width / 2, this.canvas.height / 2, 0,
            this.canvas.width / 2, this.canvas.height / 2, Math.max(this.canvas.width, this.canvas.height) * 0.5
        );
        goldGrd.addColorStop(0, `rgba(255,200,0,${0.15 + glow * 0.1})`);
        goldGrd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = goldGrd;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;

        ctx.save();
        ctx.shadowColor = `rgba(255,210,0,${0.8 + glow * 0.2})`;
        ctx.shadowBlur = 40 + glow * 30;
        ctx.fillStyle = '#f5c842';
        ctx.font = 'bold 52px Orbitron, Arial';
        ctx.textAlign = 'center';
        ctx.fillText('WINNER', cx, cy - 90);
        ctx.fillText('WINNER!', cx, cy - 35);
        ctx.restore();

        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = '16px Rajdhani, Arial';
        ctx.fillText('CHICKEN DINNER', cx, cy - 5);

        // Stats
        const panelW = 320;
        const panelX = cx - panelW / 2;
        const panelY = cy + 12;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.roundRect(panelX, panelY, panelW, 120, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,200,0,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();

        const stats = [
            ['Kills', this.player.kills],
            ['Damage Dealt', Math.round(this.stats.damageDealt)],
            ['Accuracy', this.stats.shotsFired > 0 ? Math.round(this.stats.shotsHit / this.stats.shotsFired * 100) + '%' : '0%'],
            ['Headshot Kills', this.stats.headshotKills],
            ['Survival Time', Math.floor(this.stats.survivalTime) + 's'],
        ];

        ctx.font = '14px Rajdhani, Arial';
        for (let i = 0; i < stats.length; i++) {
            const sy = panelY + 24 + i * 20;
            ctx.fillStyle = '#aaa';
            ctx.textAlign = 'left';
            ctx.fillText(stats[i][0], panelX + 18, sy);
            ctx.fillStyle = '#f5c842';
            ctx.font = 'bold 14px Rajdhani, Arial';
            ctx.textAlign = 'right';
            ctx.fillText(stats[i][1], panelX + panelW - 18, sy);
            ctx.font = '14px Rajdhani, Arial';
        }

        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = '14px Rajdhani, Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Click to return to menu', cx, cy + 152);
    }
}

