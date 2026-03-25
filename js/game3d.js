// game3d.js - Main 3D Battle Royale game using Three.js
import * as THREE from 'three';
import { createCharacter, createBuilding, createTree, createRock, createBush, createBulletMesh, createLootItem, createVehicleMesh, createMountain } from './models.js';
import { MAP_SIZE, distance, randomRange, randomInt, clamp, bezierPoint } from './utils.js';
import { WEAPON_TYPES, Bullet } from './weapons.js';
import { checkBulletHit, resolveCircleRect } from './collision.js';
import { AudioSystem } from './audio.js';

// ============ GAME CONSTANTS ============
const STATES = { MENU: 0, PLAYING: 1, DEAD: 2, SPECTATING: 3, WON: 4 };
const BOT_COUNT = 29;
const BOT_NAMES = ['Shadow','Viper','Ghost','Reaper','Storm','Blaze','Fury','Hawk','Wolf','Cobra','Phantom','Titan','Rogue','Apex','Nova','Frost','Bolt','Striker','Ace','Raptor','Dagger','Snipe','Tank','Flash','Ranger','Scout','Bravo','Delta','Echo','Omega'];
const AI_STATES = { ROAMING: 0, LOOTING: 1, FIGHTING: 2, FLEEING: 3, ZONE_MOVING: 4 };

const LOCATIONS = [
    { name: 'Tilted Town', cx: 800, cy: 800, radius: 350, buildings: 8, type: 'town' },
    { name: 'Dusty Depot', cx: 2000, cy: 600, radius: 300, buildings: 6, type: 'depot' },
    { name: 'Military Base', cx: 3200, cy: 900, radius: 400, buildings: 10, type: 'military' },
    { name: 'Pleasant Park', cx: 600, cy: 2200, radius: 300, buildings: 5, type: 'town' },
    { name: 'Loot Lake', cx: 2000, cy: 2000, radius: 350, buildings: 4, type: 'lake' },
    { name: 'Retail Row', cx: 3400, cy: 2200, radius: 300, buildings: 7, type: 'town' },
    { name: 'Salty Springs', cx: 800, cy: 3200, radius: 280, buildings: 5, type: 'town' },
    { name: 'Fatal Fields', cx: 2000, cy: 3400, radius: 350, buildings: 4, type: 'farm' },
    { name: 'Lonely Lodge', cx: 3300, cy: 3300, radius: 250, buildings: 3, type: 'lodge' },
];

const ROAD_CONNECTIONS = [[0,1],[1,2],[0,3],[1,4],[2,5],[3,4],[4,5],[3,6],[4,7],[5,8],[6,7],[7,8]];

const ZONE_PHASES = [
    { wait: 45, shrink: 30, targetPct: 0.85, dps: 1 },
    { wait: 30, shrink: 25, targetPct: 0.55, dps: 2 },
    { wait: 25, shrink: 20, targetPct: 0.30, dps: 5 },
    { wait: 15, shrink: 15, targetPct: 0.12, dps: 10 },
    { wait: 10, shrink: 10, targetPct: 0.02, dps: 20 },
];

// ============ LOOT DEFINITIONS ============
const LOOT_TYPES = [
    { type: 'weapon', weaponType: 'pistol', weight: 30, rarity: 'common' },
    { type: 'weapon', weaponType: 'shotgun', weight: 22, rarity: 'uncommon' },
    { type: 'weapon', weaponType: 'ar', weight: 18, rarity: 'rare' },
    { type: 'weapon', weaponType: 'sniper', weight: 6, rarity: 'epic' },
    { type: 'health', amount: 25, weight: 12, label: 'Medkit', rarity: 'uncommon' },
    { type: 'bandage', amount: 15, weight: 18, label: 'Bandage', rarity: 'common' },
    { type: 'ammo', amount: 30, weight: 25, rarity: 'common' },
    { type: 'armor', amount: 50, weight: 10, label: 'Armor', rarity: 'rare' },
    { type: 'helmet', amount: 50, weight: 8, label: 'Helmet', rarity: 'rare' },
];

function weightedRandom(items) {
    const total = items.reduce((s, i) => s + i.weight, 0);
    let r = Math.random() * total;
    for (const item of items) { r -= item.weight; if (r <= 0) return item; }
    return items[items.length - 1];
}

// ============ MAIN GAME CLASS ============
class Game3D {
    constructor() {
        this.state = STATES.MENU;
        this.audio = new AudioSystem();
        this.setupThreeJS();
        this.setupInput();
        this.setupUI();
        this.lastTime = 0;
        this.gameTime = 0;
        this.loop(0);
    }

    // ============ THREE.JS SETUP ============
    setupThreeJS() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // Sky blue
        this.scene.fog = new THREE.Fog(0x87CEEB, 600, 1500);

        this.camera3d = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 3000);
        this.camera3d.position.set(0, 150, -200);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.getElementById('game-container').appendChild(this.renderer.domElement);

        // Lights
        const ambient = new THREE.AmbientLight(0x668899, 0.6);
        this.scene.add(ambient);

        this.sunLight = new THREE.DirectionalLight(0xffeedd, 1.0);
        this.sunLight.position.set(500, 800, 300);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.set(2048, 2048);
        this.sunLight.shadow.camera.left = -500;
        this.sunLight.shadow.camera.right = 500;
        this.sunLight.shadow.camera.top = 500;
        this.sunLight.shadow.camera.bottom = -500;
        this.sunLight.shadow.camera.far = 2000;
        this.scene.add(this.sunLight);

        // Hemisphere light for sky/ground bounce
        const hemi = new THREE.HemisphereLight(0x88bbff, 0x557733, 0.4);
        this.scene.add(hemi);

        window.addEventListener('resize', () => {
            this.camera3d.aspect = window.innerWidth / window.innerHeight;
            this.camera3d.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // Camera control
        this.cameraAngleY = 0;     // horizontal rotation
        this.cameraAngleX = 0.4;   // vertical tilt (radians)
        this.cameraDist = 180;
    }

    // ============ INPUT ============
    setupInput() {
        this.keys = {};
        this.justPressed = {};
        this.mouse = { x: 0, y: 0, prevX: 0, prevY: 0, dx: 0, dy: 0, down: false, clicked: false };

        // Keyboard on document level (works even without focus)
        document.addEventListener('keydown', e => {
            const k = e.key.toLowerCase();
            if (!this.keys[k]) this.justPressed[k] = true;
            this.keys[k] = true;
            if (this.state === STATES.PLAYING || this.state === STATES.SPECTATING) e.preventDefault();
        });
        document.addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });

        // Mouse - track position changes each frame (works without pointer lock)
        document.addEventListener('mousemove', e => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
            // Also capture movementX/Y for pointer lock mode
            if (e.movementX !== undefined) {
                this.mouse.dx += e.movementX;
                this.mouse.dy += e.movementY;
            }
        });

        // Pointer lock (optional - enhances experience but not required)
        const canvas = this.renderer.domElement;
        canvas.addEventListener('click', () => {
            if (this.state === STATES.PLAYING) {
                try { canvas.requestPointerLock(); } catch(e) {}
            }
        });
        document.addEventListener('pointerlockchange', () => {
            this.pointerLocked = document.pointerLockElement === canvas;
        });

        document.addEventListener('mousedown', e => { if (e.button === 0) { this.mouse.down = true; this.mouse.clicked = true; } });
        document.addEventListener('mouseup', e => { if (e.button === 0) this.mouse.down = false; });
        canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    isKey(k) { return !!this.keys[k]; }
    wasPressed(k) { return !!this.justPressed[k]; }
    resetInput() {
        this.justPressed = {};
        this.mouse.clicked = false;
        this.mouse.dx = 0;
        this.mouse.dy = 0;
    }

    // ============ UI SETUP ============
    setupUI() {
        document.addEventListener('startGame', () => this.startGame());
        document.addEventListener('spectate', () => this.enterSpectate());
        document.addEventListener('returnMenu', () => { this.state = STATES.MENU; this.showScreen('menu-screen'); });
    }

    showScreen(id) {
        ['menu-screen', 'death-screen', 'win-screen', 'hud'].forEach(s => {
            document.getElementById(s).style.display = s === id ? (s === 'hud' ? 'block' : 'flex') : 'none';
        });
    }

    notify(text) {
        const el = document.getElementById('notifications');
        const div = document.createElement('div');
        div.className = 'notification';
        div.textContent = text;
        el.appendChild(div);
        setTimeout(() => div.remove(), 2000);
    }

    addKillFeed(killer, victim, isPlayerInvolved) {
        const feed = document.getElementById('kill-feed');
        const div = document.createElement('div');
        div.className = 'kill-entry' + (isPlayerInvolved ? ' player-involved' : '');
        div.textContent = `${killer} killed ${victim}`;
        feed.prepend(div);
        setTimeout(() => div.remove(), 5000);
        if (feed.children.length > 6) feed.lastChild.remove();
    }

    // ============ START GAME ============
    startGame() {
        this.audio.resume();
        this.state = STATES.PLAYING;
        this.gameTime = 0;
        this.showScreen('hud');

        // Clear previous scene objects
        while (this.scene.children.length > 4) this.scene.children.pop(); // keep lights
        // Re-add lights
        this.setupThreeJS_lights();

        this.bullets = [];
        this.bulletMeshes = [];
        this.particles3d = [];
        this.grenades = [];
        this.stats = { damageDealt: 0, damageTaken: 0, shotsFired: 0, shotsHit: 0, headshotKills: 0, survivalTime: 0 };
        this.killedBy = null;

        // Build world
        this.buildTerrain();
        this.buildMap();
        this.spawnEntities();
        this.spawnLoot();
        this.initZone();

        this.spawnProtection = 5; // 5 seconds of invulnerability
        this.notify('Drop in! Find weapons and survive!');

        // Auto pointer lock after short delay
        setTimeout(() => {
            if (this.state === STATES.PLAYING) {
                this.renderer.domElement.requestPointerLock();
            }
        }, 300);
    }

    setupThreeJS_lights() {
        // Already added in setupThreeJS, but ensure shadow target follows player
    }

    // ============ BUILD WORLD ============
    buildTerrain() {
        // Ground plane
        const groundGeo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 64, 64);
        groundGeo.rotateX(-Math.PI / 2);
        // Add gentle hills
        const verts = groundGeo.attributes.position;
        for (let i = 0; i < verts.count; i++) {
            const x = verts.getX(i), z = verts.getZ(i);
            const h = Math.sin(x * 0.003) * 5 + Math.cos(z * 0.004) * 4 + Math.sin((x + z) * 0.002) * 3;
            verts.setY(i, h);
        }
        groundGeo.computeVertexNormals();
        const groundMat = new THREE.MeshLambertMaterial({ color: 0x4a8a3a });
        this.ground = new THREE.Mesh(groundGeo, groundMat);
        this.ground.receiveShadow = true;
        this.scene.add(this.ground);

        // Water planes
        this.waterZones = [
            { x: 2000, y: 2000, radius: 180 },
            { x: 600, y: 3400, radius: 80 },
            { x: 3500, y: 700, radius: 60 }
        ];
        for (const wz of this.waterZones) {
            const waterGeo = new THREE.CircleGeometry(wz.radius, 32);
            waterGeo.rotateX(-Math.PI / 2);
            const waterMat = new THREE.MeshLambertMaterial({ color: 0x2277bb, transparent: true, opacity: 0.6 });
            const water = new THREE.Mesh(waterGeo, waterMat);
            water.position.set(wz.x - MAP_SIZE / 2, 0.3, wz.y - MAP_SIZE / 2);
            this.scene.add(water);

            // Shore ring
            const shoreGeo = new THREE.RingGeometry(wz.radius, wz.radius + 15, 32);
            shoreGeo.rotateX(-Math.PI / 2);
            const shoreMat = new THREE.MeshLambertMaterial({ color: 0xccbb88, transparent: true, opacity: 0.5 });
            const shore = new THREE.Mesh(shoreGeo, shoreMat);
            shore.position.set(wz.x - MAP_SIZE / 2, 0.2, wz.y - MAP_SIZE / 2);
            this.scene.add(shore);
        }

        // Mountains at edges
        const mountainPositions = [
            [-200, -200], [1000, -300], [2500, -250], [4200, -200],
            [-300, 1000], [-250, 2500], [-200, 4200],
            [4200, 1000], [4300, 2500], [4200, 4200],
            [1000, 4300], [2500, 4200],
        ];
        for (const [mx, my] of mountainPositions) {
            const size = 100 + Math.random() * 150;
            const mountain = createMountain(size);
            mountain.position.set(mx - MAP_SIZE / 2, 0, my - MAP_SIZE / 2);
            this.scene.add(mountain);
        }

        // Roads
        this.buildRoads();
    }

    buildRoads() {
        for (const [i, j] of ROAD_CONNECTIONS) {
            const a = LOCATIONS[i], b = LOCATIONS[j];
            const points = [];
            for (let t = 0; t <= 1; t += 0.05) {
                const mx = (a.cx + b.cx) / 2, my = (a.cy + b.cy) / 2;
                const dx = b.cx - a.cx, dy = b.cy - a.cy;
                const len = Math.sqrt(dx * dx + dy * dy);
                const nx = -dy / len, ny = dx / len;
                const p = bezierPoint(t, a.cx, a.cy, mx + nx * 50, my + ny * 50, mx - nx * 20, my - ny * 20, b.cx, b.cy);
                points.push(new THREE.Vector3(p.x - MAP_SIZE / 2, 0.15, p.y - MAP_SIZE / 2));
            }
            // Road as extruded shape along path
            const curve = new THREE.CatmullRomCurve3(points);
            const roadGeo = new THREE.TubeGeometry(curve, 20, 12, 4, false);
            const roadMat = new THREE.MeshLambertMaterial({ color: 0x555550 });
            const road = new THREE.Mesh(roadGeo, roadMat);
            road.position.y = -10; // Flatten into ground
            road.scale.y = 0.02;
            road.receiveShadow = true;
            this.scene.add(road);
        }
    }

    buildMap() {
        this.obstacles = [];
        this.buildingMeshes = [];

        // Buildings per location
        for (const loc of LOCATIONS) {
            for (let i = 0; i < loc.buildings; i++) {
                const angle = (i / loc.buildings) * Math.PI * 2 + Math.random() * 0.5;
                const dist = randomRange(40, loc.radius * 0.7);
                const bx = loc.cx + Math.cos(angle) * dist;
                const by = loc.cy + Math.sin(angle) * dist;
                const bw = randomInt(30, 60);
                const bh = randomInt(30, 60);
                this.placeBuilding(bx, by, bw, bh, loc.type);
            }
        }

        // Scattered buildings
        for (let i = 0; i < 8; i++) {
            this.placeBuilding(randomRange(300, MAP_SIZE - 300), randomRange(300, MAP_SIZE - 300), randomInt(30, 50), randomInt(30, 50), 'random');
        }

        // Trees
        for (let i = 0; i < 250; i++) {
            const tx = randomRange(100, MAP_SIZE - 100);
            const ty = randomRange(100, MAP_SIZE - 100);
            let inWater = false;
            for (const wz of this.waterZones) { if (distance(tx, ty, wz.x, wz.y) < wz.radius + 10) { inWater = true; break; } }
            if (inWater) continue;
            const tree = createTree();
            tree.position.set(tx - MAP_SIZE / 2, 0, ty - MAP_SIZE / 2);
            this.scene.add(tree);
        }

        // Rocks
        for (let i = 0; i < 80; i++) {
            const rx = randomRange(100, MAP_SIZE - 100);
            const ry = randomRange(100, MAP_SIZE - 100);
            const w = randomInt(8, 20), h = randomInt(8, 20);
            const rock = createRock(w, h);
            rock.position.set(rx - MAP_SIZE / 2, 0, ry - MAP_SIZE / 2);
            this.scene.add(rock);
            this.obstacles.push({ type: 'rock', x: rx, y: ry, w: w * 2, h: h * 2 });
        }

        // Bushes
        for (let i = 0; i < 100; i++) {
            const bx = randomRange(100, MAP_SIZE - 100);
            const by = randomRange(100, MAP_SIZE - 100);
            const bush = createBush();
            bush.position.set(bx - MAP_SIZE / 2, 0, by - MAP_SIZE / 2);
            this.scene.add(bush);
        }
    }

    placeBuilding(x, y, w, h, locType) {
        // Collision check
        for (const obs of this.obstacles) {
            if (obs.type === 'building' && x < obs.x + obs.w + 20 && x + w + 20 > obs.x && y < obs.y + obs.h + 20 && y + h + 20 > obs.y) return;
        }
        for (const wz of this.waterZones || []) {
            if (distance(x + w / 2, y + h / 2, wz.x, wz.y) < wz.radius + 20) return;
        }

        const mesh = createBuilding(w, h, locType);
        mesh.position.set(x + w / 2 - MAP_SIZE / 2, 0, y + h / 2 - MAP_SIZE / 2);
        this.scene.add(mesh);
        this.buildingMeshes.push(mesh);
        this.obstacles.push({ type: 'building', x, y, w, h });
    }

    // ============ ENTITIES ============
    spawnEntities() {
        // Spawn points near center
        const pcx = MAP_SIZE / 2 + randomRange(-300, 300);
        const pcy = MAP_SIZE / 2 + randomRange(-300, 300);

        // Player
        this.player = this.createEntity(pcx, pcy, true, 'You');
        this.player.mesh = createCharacter(0xe8c840, true);
        this.player.mesh.position.set(pcx - MAP_SIZE / 2, 0, pcy - MAP_SIZE / 2);
        this.scene.add(this.player.mesh);

        // Bots
        this.bots = [];
        for (let i = 0; i < BOT_COUNT; i++) {
            const a = Math.random() * Math.PI * 2;
            const d = 600 + Math.random() * 1200;
            const bx = clamp(pcx + Math.cos(a) * d, 200, MAP_SIZE - 200);
            const by = clamp(pcy + Math.sin(a) * d, 200, MAP_SIZE - 200);
            const bot = this.createEntity(bx, by, false, BOT_NAMES[i % BOT_NAMES.length]);
            bot.mesh = createCharacter(0xcc4444);
            bot.mesh.position.set(bx - MAP_SIZE / 2, 0, by - MAP_SIZE / 2);
            this.scene.add(bot.mesh);

            // AI
            bot.aiState = AI_STATES.ROAMING;
            bot.targetX = bx; bot.targetY = by;
            bot.targetEntity = null;
            bot.thinkTimer = 0;
            bot.accuracy = 0.6 + Math.random() * 0.3;
            bot.aggression = 0.3 + Math.random() * 0.5;
            bot.sightRange = 250 + Math.random() * 150;

            this.bots.push(bot);
        }
    }

    createEntity(x, y, isPlayer, name) {
        const ar = WEAPON_TYPES.ar, pistol = WEAPON_TYPES.pistol;
        return {
            x, y, radius: 14, speed: isPlayer ? 200 : 160 + Math.random() * 40,
            health: 100, maxHealth: 100, alive: true, angle: 0, name, isPlayer,
            weapons: isPlayer ? [{ ...ar, type: 'ar', ammo: ar.magSize }, { ...pistol, type: 'pistol', ammo: pistol.magSize }] : [null, null],
            currentWeaponIdx: 0, lastFireTime: 0, reloading: false, reloadStartTime: 0,
            kills: 0, armor: 0, helmet: 0, stamina: 100, maxStamina: 100,
            grenades: isPlayer ? 3 : 0, stance: 'standing', sprinting: false,
            mesh: null, damageFlash: 0,
            get currentWeapon() { return this.weapons[this.currentWeaponIdx]; },
        };
    }

    // ============ LOOT ============
    spawnLoot() {
        this.lootItems = [];
        this.lootMeshes = [];

        for (const obs of this.obstacles) {
            if (obs.type !== 'building') continue;
            const count = randomInt(1, 3);
            for (let i = 0; i < count; i++) {
                const def = weightedRandom(LOOT_TYPES);
                const lx = obs.x + randomRange(0, obs.w);
                const ly = obs.y + randomRange(0, obs.h);
                this.addLootItem(def, lx, ly);
            }
        }
        for (let i = 0; i < 40; i++) {
            const def = weightedRandom(LOOT_TYPES);
            this.addLootItem(def, randomRange(100, MAP_SIZE - 100), randomRange(100, MAP_SIZE - 100));
        }
    }

    addLootItem(def, x, y) {
        const item = { ...def, x, y, id: Math.random() };
        const mesh = createLootItem(def.type);
        mesh.position.set(x - MAP_SIZE / 2, 0, y - MAP_SIZE / 2);
        this.scene.add(mesh);
        item.mesh = mesh;
        this.lootItems.push(item);
    }

    removeLootItem(index) {
        const item = this.lootItems[index];
        if (item.mesh) this.scene.remove(item.mesh);
        this.lootItems.splice(index, 1);
    }

    tryPickup(entity) {
        for (let i = this.lootItems.length - 1; i >= 0; i--) {
            const item = this.lootItems[i];
            if (distance(entity.x, entity.y, item.x, item.y) > 40) continue;
            let picked = false;

            if (item.type === 'weapon') {
                const w = WEAPON_TYPES[item.weaponType];
                if (!entity.weapons[0]) { entity.weapons[0] = { ...w, type: item.weaponType, ammo: w.magSize }; entity.currentWeaponIdx = 0; picked = true; }
                else if (!entity.weapons[1]) { entity.weapons[1] = { ...w, type: item.weaponType, ammo: w.magSize }; picked = true; }
                else {
                    const old = entity.weapons[entity.currentWeaponIdx];
                    this.addLootItem({ type: 'weapon', weaponType: old.type, weight: 0, rarity: old.rarity || 'common' }, entity.x, entity.y);
                    entity.weapons[entity.currentWeaponIdx] = { ...w, type: item.weaponType, ammo: w.magSize };
                    picked = true;
                }
            } else if (item.type === 'health' && entity.health < 100) {
                entity.health = Math.min(100, entity.health + item.amount); picked = true;
            } else if (item.type === 'bandage' && entity.health < 75) {
                entity.health = Math.min(75, entity.health + item.amount); picked = true;
            } else if (item.type === 'ammo' && entity.currentWeapon) {
                entity.currentWeapon.ammo = Math.min(entity.currentWeapon.magSize, entity.currentWeapon.ammo + item.amount); picked = true;
            } else if (item.type === 'armor' && entity.armor < 100) {
                entity.armor = Math.min(100, entity.armor + item.amount); picked = true;
            } else if (item.type === 'helmet' && entity.helmet < 100) {
                entity.helmet = Math.min(100, entity.helmet + item.amount); picked = true;
            }

            if (picked) {
                this.removeLootItem(i);
                return item;
            }
        }
        return null;
    }

    // ============ ZONE ============
    initZone() {
        this.zone = {
            centerX: MAP_SIZE / 2, centerY: MAP_SIZE / 2,
            currentRadius: MAP_SIZE * 0.6,
            targetCenterX: MAP_SIZE / 2, targetCenterY: MAP_SIZE / 2,
            targetRadius: MAP_SIZE * 0.6,
            startRadius: MAP_SIZE * 0.6,
            phase: 0, timer: ZONE_PHASES[0].wait, state: 'waiting',
            startCenterX: MAP_SIZE / 2, startCenterY: MAP_SIZE / 2,
            shrinkProgress: 0, dps: 1, damageTimer: 0,
        };
        // Zone mesh (blue transparent cylinder)
        this.zoneMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(this.zone.currentRadius, this.zone.currentRadius, 200, 64, 1, true),
            new THREE.MeshBasicMaterial({ color: 0x0066ff, transparent: true, opacity: 0.08, side: THREE.DoubleSide })
        );
        this.zoneMesh.position.set(0, 100, 0);
        this.scene.add(this.zoneMesh);
    }

    updateZone(dt) {
        const z = this.zone;
        z.timer -= dt;

        if (z.state === 'waiting' && z.timer <= 0) {
            const p = ZONE_PHASES[z.phase];
            z.state = 'shrinking';
            z.timer = p.shrink;
            z.startRadius = z.currentRadius;
            z.startCenterX = z.centerX;
            z.startCenterY = z.centerY;
            z.targetRadius = MAP_SIZE * 0.6 * p.targetPct;
            z.targetCenterX = z.centerX + (Math.random() - 0.5) * z.currentRadius * 0.3;
            z.targetCenterY = z.centerY + (Math.random() - 0.5) * z.currentRadius * 0.3;
            z.dps = p.dps;
            z.shrinkProgress = 0;
        } else if (z.state === 'shrinking') {
            const p = ZONE_PHASES[z.phase];
            z.shrinkProgress = 1 - (z.timer / p.shrink);
            z.currentRadius = z.startRadius + (z.targetRadius - z.startRadius) * z.shrinkProgress;
            z.centerX = z.startCenterX + (z.targetCenterX - z.startCenterX) * z.shrinkProgress;
            z.centerY = z.startCenterY + (z.targetCenterY - z.startCenterY) * z.shrinkProgress;

            if (z.timer <= 0) {
                z.phase++;
                if (z.phase < ZONE_PHASES.length) {
                    z.state = 'waiting';
                    z.timer = ZONE_PHASES[z.phase].wait;
                } else {
                    z.state = 'finished';
                }
            }
        }

        // Update zone mesh
        this.zoneMesh.geometry.dispose();
        this.zoneMesh.geometry = new THREE.CylinderGeometry(z.currentRadius, z.currentRadius, 200, 64, 1, true);
        this.zoneMesh.position.set(z.centerX - MAP_SIZE / 2, 100, z.centerY - MAP_SIZE / 2);

        // Damage
        z.damageTimer -= dt;
        if (z.damageTimer <= 0) {
            z.damageTimer = 1;
            for (const e of this.allEntities) {
                if (!e.alive) continue;
                if (distance(e.x, e.y, z.centerX, z.centerY) > z.currentRadius) {
                    this.damageEntity(e, z.dps, null, false);
                }
            }
        }
    }

    isInZone(x, y) { return distance(x, y, this.zone.centerX, this.zone.centerY) <= this.zone.currentRadius; }

    get allEntities() { return [this.player, ...this.bots]; }
    get aliveCount() { return this.allEntities.filter(e => e.alive).length; }

    // ============ DAMAGE ============
    damageEntity(entity, amount, attacker, isHeadshot) {
        if (!entity.alive) return 0;
        if (entity.isPlayer && this.spawnProtection > 0) return 0; // Spawn protection
        let dmg = amount;
        if (isHeadshot) {
            const red = entity.helmet > 0 ? Math.min(0.5, entity.helmet / 200) : 0;
            dmg *= (1 - red);
            if (entity.helmet > 0) entity.helmet = Math.max(0, entity.helmet - 15);
        } else {
            const red = entity.armor > 0 ? Math.min(0.5, entity.armor / 200) : 0;
            dmg *= (1 - red);
            if (entity.armor > 0) entity.armor = Math.max(0, entity.armor - 10);
        }
        entity.health -= dmg;
        entity.damageFlash = 1;

        if (entity.health <= 0) {
            entity.health = 0;
            entity.alive = false;
            if (attacker && attacker !== entity) {
                attacker.kills++;
                this.addKillFeed(attacker.name, entity.name, attacker.isPlayer || entity.isPlayer);
                if (entity.isPlayer) this.killedBy = attacker;
                if (attacker.isPlayer && isHeadshot) this.stats.headshotKills++;
            }
            if (entity.mesh) entity.mesh.visible = false;
            // Drop weapons
            for (const w of entity.weapons) {
                if (w) this.addLootItem({ type: 'weapon', weaponType: w.type, weight: 0, rarity: w.rarity || 'common' }, entity.x + randomRange(-15, 15), entity.y + randomRange(-15, 15));
            }
        }

        if (entity.isPlayer) { this.stats.damageTaken += dmg; this.flashDamage(); }
        if (attacker && attacker.isPlayer) this.stats.damageDealt += dmg;

        return dmg;
    }

    flashDamage() {
        const el = document.getElementById('damage-vignette');
        el.style.opacity = '1';
        setTimeout(() => el.style.opacity = '0', 200);
    }

    // ============ SHOOTING ============
    tryShoot(entity, time) {
        if (!entity.alive || !entity.currentWeapon || entity.reloading) return;
        if (entity.isPlayer && entity.sprinting) return;

        const w = entity.currentWeapon;
        if (time - entity.lastFireTime < w.fireRate / 1000) return;
        if (w.ammo <= 0) { this.startReload(entity, time); return; }

        entity.lastFireTime = time;
        w.ammo--;

        const muzzleX = entity.x + Math.cos(entity.angle) * 20;
        const muzzleY = entity.y + Math.sin(entity.angle) * 20;

        for (let i = 0; i < w.bulletsPerShot; i++) {
            const b = new Bullet(muzzleX, muzzleY, entity.angle, w, entity);
            this.bullets.push(b);

            // 3D bullet mesh
            const mesh = createBulletMesh();
            mesh.position.set(b.x - MAP_SIZE / 2, 8, b.y - MAP_SIZE / 2);
            this.scene.add(mesh);
            this.bulletMeshes.push(mesh);
        }

        // Muzzle flash
        if (entity.mesh && entity.mesh.userData.muzzleLight) {
            entity.mesh.userData.muzzleLight.intensity = 3;
        }

        if (entity.isPlayer) this.stats.shotsFired += w.bulletsPerShot;

        // Sound
        const dist = distance(this.player.x, this.player.y, entity.x, entity.y);
        const vol = entity.isPlayer ? 1 : Math.max(0.05, 1 - dist / 800);
        this.audio.playShoot(w.type, vol);
    }

    startReload(entity, time) {
        if (entity.currentWeapon && entity.currentWeapon.ammo < entity.currentWeapon.magSize) {
            entity.reloading = true;
            entity.reloadStartTime = time;
            if (entity.isPlayer) this.audio.playReload();
        }
    }

    // ============ UPDATE ============
    update(dt) {
        this.gameTime += dt;
        this.stats.survivalTime = this.gameTime;

        // Spawn protection countdown
        if (this.spawnProtection > 0) this.spawnProtection -= dt;

        this.updatePlayer(dt);
        this.updateBots(dt);
        this.updateBullets(dt);
        this.updateZone(dt);
        this.updateCamera();
        this.updateHUD();

        // Muzzle flash decay
        for (const e of this.allEntities) {
            if (e.mesh && e.mesh.userData.muzzleLight && e.mesh.userData.muzzleLight.intensity > 0) {
                e.mesh.userData.muzzleLight.intensity *= 0.8;
            }
        }

        // Loot bob animation
        for (const item of this.lootItems) {
            if (item.mesh) item.mesh.position.y = 1.5 + Math.sin(this.gameTime * 3 + item.id * 10) * 0.5;
        }

        // Win/lose
        if (!this.player.alive && this.state === STATES.PLAYING) {
            this.state = STATES.DEAD;
            this.showDeathScreen();
        }
        if (this.aliveCount === 1 && this.player.alive) {
            this.state = STATES.WON;
            this.showWinScreen();
        }
    }

    // ============ PLAYER UPDATE ============
    updatePlayer(dt) {
        const p = this.player;
        if (!p.alive) return;

        // Camera rotation from mouse
        // Use movementX/Y if pointer locked, otherwise use position delta
        let mdx = this.mouse.dx;
        let mdy = this.mouse.dy;
        if (!this.pointerLocked && this.mouse.down) {
            // Right-drag style: only rotate when mouse button held
            mdx = this.mouse.x - this.mouse.prevX;
            mdy = this.mouse.y - this.mouse.prevY;
        }
        // Arrow keys also rotate camera (fallback for no pointer lock)
        if (this.isKey('arrowleft')) mdx -= 5;
        if (this.isKey('arrowright')) mdx += 5;
        if (this.isKey('arrowup')) mdy -= 3;
        if (this.isKey('arrowdown')) mdy += 3;

        if (mdx !== 0 || mdy !== 0) {
            this.cameraAngleY -= mdx * 0.003;
            this.cameraAngleX = clamp(this.cameraAngleX + mdy * 0.002, 0.1, 1.2);
        }
        this.mouse.prevX = this.mouse.x;
        this.mouse.prevY = this.mouse.y;
        p.angle = this.cameraAngleY + Math.PI; // Face where camera looks

        // Movement relative to camera
        let mx = 0, mz = 0;
        if (this.isKey('w')) mz = 1;
        if (this.isKey('s')) mz = -1;
        if (this.isKey('a')) mx = -1;
        if (this.isKey('d')) mx = 1;
        if (mx !== 0 && mz !== 0) { mx *= 0.707; mz *= 0.707; }

        // Rotate movement by camera angle
        const cosA = Math.cos(this.cameraAngleY);
        const sinA = Math.sin(this.cameraAngleY);
        const worldMx = mx * cosA - mz * sinA;
        const worldMz = mx * sinA + mz * cosA;

        // Sprint
        const wantsSprint = this.isKey('shift');
        p.sprinting = wantsSprint && p.stamina > 0 && (worldMx !== 0 || worldMz !== 0);
        if (p.sprinting) { p.stamina -= dt * 25; if (p.stamina <= 0) { p.stamina = 0; p.sprinting = false; } }
        else { p.stamina = Math.min(p.maxStamina, p.stamina + dt * 15); }

        // Stance
        if (this.wasPressed('c')) p.stance = p.stance === 'crouching' ? 'standing' : 'crouching';
        if (this.wasPressed('z')) p.stance = p.stance === 'prone' ? 'standing' : 'prone';

        let speedMult = p.sprinting ? 1.5 : 1;
        if (p.stance === 'crouching') speedMult *= 0.55;
        if (p.stance === 'prone') speedMult *= 0.3;

        p.x += worldMx * p.speed * speedMult * dt;
        p.y += worldMz * p.speed * speedMult * dt;

        // Collision
        for (const obs of this.obstacles) {
            if (obs.type === 'building' || obs.type === 'rock') {
                const r = resolveCircleRect(p.x, p.y, p.radius, obs);
                p.x = r.x; p.y = r.y;
            }
        }
        p.x = clamp(p.x, 20, MAP_SIZE - 20);
        p.y = clamp(p.y, 20, MAP_SIZE - 20);

        // Reload
        if (this.wasPressed('r') && p.currentWeapon && !p.reloading) this.startReload(p, this.gameTime);
        if (p.reloading && p.currentWeapon) {
            if (this.gameTime - p.reloadStartTime >= p.currentWeapon.reloadTime / 1000) {
                p.currentWeapon.ammo = p.currentWeapon.magSize;
                p.reloading = false;
            }
        }

        // Weapon switch
        if (this.wasPressed('1')) p.currentWeaponIdx = 0;
        if (this.wasPressed('2')) p.currentWeaponIdx = 1;

        // Shoot
        if (this.mouse.down) this.tryShoot(p, this.gameTime);

        // Pickup
        if (this.wasPressed('f')) {
            const picked = this.tryPickup(p);
            if (picked) {
                this.audio.playPickup();
                this.notify(`Picked up ${picked.label || picked.weaponType || picked.type}`);
            }
        }

        // Grenade
        if (this.wasPressed('g') && p.grenades > 0) {
            p.grenades--;
            this.notify(`Grenade thrown! (${p.grenades} left)`);
            // Simple grenade: explode at aimed position after delay
            const gx = p.x + Math.cos(p.angle) * 150;
            const gy = p.y + Math.sin(p.angle) * 150;
            setTimeout(() => {
                for (const e of this.allEntities) {
                    if (!e.alive) continue;
                    const d = distance(gx, gy, e.x, e.y);
                    if (d < 120) this.damageEntity(e, 80 * (1 - d / 120), p, false);
                }
                this.audio.playExplosion();
            }, 2500);
        }

        // Update mesh
        p.mesh.position.set(p.x - MAP_SIZE / 2, 0, p.y - MAP_SIZE / 2);
        p.mesh.rotation.y = -p.angle + Math.PI / 2;

        // Shadow target follows player
        this.sunLight.target.position.copy(p.mesh.position);
        this.sunLight.position.set(p.x - MAP_SIZE / 2 + 300, 500, p.y - MAP_SIZE / 2 + 200);
    }

    // ============ BOT AI ============
    updateBots(dt) {
        for (const bot of this.bots) {
            if (!bot.alive) continue;

            // Reload
            if (bot.reloading && bot.currentWeapon) {
                if (this.gameTime - bot.reloadStartTime >= bot.currentWeapon.reloadTime / 1000) {
                    bot.currentWeapon.ammo = bot.currentWeapon.magSize;
                    bot.reloading = false;
                }
            }

            // Think
            bot.thinkTimer -= dt;
            if (bot.thinkTimer <= 0) {
                bot.thinkTimer = 0.3 + Math.random() * 0.3;
                this.botThink(bot);
            }

            // Execute state
            switch (bot.aiState) {
                case AI_STATES.ROAMING: this.botRoam(bot, dt); break;
                case AI_STATES.LOOTING: this.botLoot(bot, dt); break;
                case AI_STATES.FIGHTING: this.botFight(bot, dt); break;
                case AI_STATES.FLEEING: this.botFlee(bot, dt); break;
                case AI_STATES.ZONE_MOVING: this.botZoneMove(bot, dt); break;
            }

            // Collision
            for (const obs of this.obstacles) {
                if (obs.type === 'building' || obs.type === 'rock') {
                    const r = resolveCircleRect(bot.x, bot.y, bot.radius, obs);
                    bot.x = r.x; bot.y = r.y;
                }
            }
            bot.x = clamp(bot.x, 20, MAP_SIZE - 20);
            bot.y = clamp(bot.y, 20, MAP_SIZE - 20);

            // Update mesh
            if (bot.mesh) {
                bot.mesh.position.set(bot.x - MAP_SIZE / 2, 0, bot.y - MAP_SIZE / 2);
                bot.mesh.rotation.y = -bot.angle + Math.PI / 2;
            }
        }
    }

    botThink(bot) {
        // Zone check
        if (!this.isInZone(bot.x, bot.y)) {
            bot.aiState = AI_STATES.ZONE_MOVING;
            bot.targetX = this.zone.centerX + (Math.random() - 0.5) * this.zone.currentRadius * 0.5;
            bot.targetY = this.zone.centerY + (Math.random() - 0.5) * this.zone.currentRadius * 0.5;
            return;
        }

        // Find enemy
        let closest = null, closestDist = bot.sightRange;
        for (const e of this.allEntities) {
            if (e === bot || !e.alive) continue;
            const d = distance(bot.x, bot.y, e.x, e.y);
            if (d < closestDist) { closestDist = d; closest = e; }
        }

        if (closest && bot.currentWeapon) {
            if (bot.health < 30 && closestDist < 150) { bot.aiState = AI_STATES.FLEEING; bot.targetEntity = closest; return; }
            if (Math.random() < bot.aggression || closestDist < 100) { bot.aiState = AI_STATES.FIGHTING; bot.targetEntity = closest; return; }
        }

        // Loot
        if (!bot.currentWeapon) {
            let nearestLoot = null, nearestDist = 400;
            for (const item of this.lootItems) {
                const d = distance(bot.x, bot.y, item.x, item.y);
                if (d < nearestDist) { nearestDist = d; nearestLoot = item; }
            }
            if (nearestLoot) { bot.aiState = AI_STATES.LOOTING; bot.targetX = nearestLoot.x; bot.targetY = nearestLoot.y; return; }
        }

        // Roam
        if (bot.aiState !== AI_STATES.ROAMING || distance(bot.x, bot.y, bot.targetX, bot.targetY) < 30) {
            bot.aiState = AI_STATES.ROAMING;
            const r = this.zone.currentRadius * 0.7;
            bot.targetX = clamp(this.zone.centerX + (Math.random() - 0.5) * r, 50, MAP_SIZE - 50);
            bot.targetY = clamp(this.zone.centerY + (Math.random() - 0.5) * r, 50, MAP_SIZE - 50);
        }
    }

    botMoveTo(bot, tx, ty, dt, mult = 1) {
        const a = Math.atan2(ty - bot.y, tx - bot.x);
        bot.angle = a;
        bot.x += Math.cos(a) * bot.speed * mult * dt;
        bot.y += Math.sin(a) * bot.speed * mult * dt;
    }

    botRoam(bot, dt) { this.botMoveTo(bot, bot.targetX, bot.targetY, dt, 0.7); }
    botLoot(bot, dt) {
        if (distance(bot.x, bot.y, bot.targetX, bot.targetY) < 40) { this.tryPickup(bot); bot.aiState = AI_STATES.ROAMING; }
        else this.botMoveTo(bot, bot.targetX, bot.targetY, dt);
    }
    botFight(bot, dt) {
        if (!bot.targetEntity || !bot.targetEntity.alive) { bot.aiState = AI_STATES.ROAMING; return; }
        const d = distance(bot.x, bot.y, bot.targetEntity.x, bot.targetEntity.y);
        bot.angle = Math.atan2(bot.targetEntity.y - bot.y, bot.targetEntity.x - bot.x);
        // Strafe
        const strafeAngle = bot.angle + Math.PI / 2 * (Math.sin(this.gameTime * 2) > 0 ? 1 : -1);
        if (d > 80) { bot.x += Math.cos(bot.angle) * bot.speed * 0.5 * dt; bot.y += Math.sin(bot.angle) * bot.speed * 0.5 * dt; }
        bot.x += Math.cos(strafeAngle) * bot.speed * 0.3 * dt;
        bot.y += Math.sin(strafeAngle) * bot.speed * 0.3 * dt;
        // Shoot with inaccuracy
        if (bot.currentWeapon && !bot.reloading && d < bot.currentWeapon.range) {
            const inaccuracy = (1 - bot.accuracy) * 0.3;
            const origAngle = bot.angle;
            bot.angle += (Math.random() - 0.5) * inaccuracy;
            this.tryShoot(bot, this.gameTime);
            bot.angle = origAngle;
        }
    }
    botFlee(bot, dt) {
        if (!bot.targetEntity || !bot.targetEntity.alive || distance(bot.x, bot.y, bot.targetEntity.x, bot.targetEntity.y) > 300) { bot.aiState = AI_STATES.ROAMING; return; }
        const a = Math.atan2(bot.y - bot.targetEntity.y, bot.x - bot.targetEntity.x);
        bot.angle = a;
        bot.x += Math.cos(a) * bot.speed * 1.1 * dt;
        bot.y += Math.sin(a) * bot.speed * 1.1 * dt;
    }
    botZoneMove(bot, dt) {
        this.botMoveTo(bot, bot.targetX, bot.targetY, dt, 1.1);
        if (this.isInZone(bot.x, bot.y)) bot.aiState = AI_STATES.ROAMING;
    }

    // ============ BULLETS ============
    updateBullets(dt) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.update(dt);

            // Update 3D position
            if (this.bulletMeshes[i]) {
                this.bulletMeshes[i].position.set(b.x - MAP_SIZE / 2, 8, b.y - MAP_SIZE / 2);
            }

            if (!b.alive) {
                if (this.bulletMeshes[i]) this.scene.remove(this.bulletMeshes[i]);
                this.bullets.splice(i, 1);
                this.bulletMeshes.splice(i, 1);
                continue;
            }

            const hit = checkBulletHit(b, this.allEntities, this.obstacles);
            if (hit) {
                b.alive = false;
                if (this.bulletMeshes[i]) this.scene.remove(this.bulletMeshes[i]);
                this.bullets.splice(i, 1);
                this.bulletMeshes.splice(i, 1);

                if (hit.type === 'entity') {
                    const isHeadshot = (b.y - hit.target.y) < -hit.target.radius * 0.2;
                    const baseDmg = isHeadshot ? b.damage * 2 : b.damage;
                    this.damageEntity(hit.target, baseDmg, b.owner, isHeadshot);
                    if (b.owner.isPlayer) this.stats.shotsHit++;
                    if (isHeadshot && b.owner.isPlayer) this.notify('HEADSHOT!');

                    // React for bots
                    if (!hit.target.isPlayer && hit.target.alive && b.owner.alive) {
                        hit.target.targetEntity = b.owner;
                        hit.target.aiState = hit.target.health < 30 ? AI_STATES.FLEEING : AI_STATES.FIGHTING;
                    }
                }
            }
        }
    }

    // ============ CAMERA ============
    updateCamera() {
        const target = this.state === STATES.SPECTATING ? this.spectateTarget : this.player;
        if (!target) return;

        const tx = target.x - MAP_SIZE / 2;
        const tz = target.y - MAP_SIZE / 2;

        const camX = tx + Math.sin(this.cameraAngleY) * this.cameraDist * Math.cos(this.cameraAngleX);
        const camY = this.cameraDist * Math.sin(this.cameraAngleX);
        const camZ = tz + Math.cos(this.cameraAngleY) * this.cameraDist * Math.cos(this.cameraAngleX);

        this.camera3d.position.lerp(new THREE.Vector3(camX, camY, camZ), 0.1);
        this.camera3d.lookAt(tx, 10, tz);
    }

    // ============ HUD UPDATE ============
    updateHUD() {
        const p = this.player;
        document.getElementById('alive-count').textContent = `Alive: ${this.aliveCount}`;
        document.getElementById('kills-count').textContent = `Kills: ${p.kills}`;

        const z = this.zone;
        const timeLeft = Math.ceil(z.timer);
        document.getElementById('zone-timer').textContent = z.state === 'waiting' ? `Zone shrinks in ${timeLeft}s` : z.state === 'shrinking' ? 'Zone shrinking...' : '';

        // Health
        const hpPct = (p.health / p.maxHealth) * 100;
        const hpBar = document.getElementById('health-bar');
        hpBar.style.width = hpPct + '%';
        hpBar.className = 'bar ' + (hpPct > 50 ? 'green' : hpPct > 25 ? 'yellow' : 'red');
        document.getElementById('health-text').textContent = `${Math.ceil(p.health)} HP`;

        // Armor
        const armorEl = document.getElementById('armor-bar-container');
        if (p.armor > 0 || p.helmet > 0) {
            armorEl.style.display = 'block';
            document.getElementById('armor-bar').style.width = p.armor + '%';
            document.getElementById('armor-text').textContent = `Armor: ${Math.ceil(p.armor)} | Helmet: ${Math.ceil(p.helmet)}`;
        } else { armorEl.style.display = 'none'; }

        // Stamina
        const stamEl = document.getElementById('stamina-bar-container');
        if (p.stamina < p.maxStamina) {
            stamEl.style.display = 'block';
            document.getElementById('stamina-bar').style.width = (p.stamina / p.maxStamina * 100) + '%';
        } else { stamEl.style.display = 'none'; }

        // Weapons
        for (let i = 0; i < 2; i++) {
            const slot = document.getElementById(`weapon-slot-${i}`);
            slot.className = 'weapon-slot' + (i === p.currentWeaponIdx ? ' active' : '');
            const w = p.weapons[i];
            slot.querySelector('.weapon-name').textContent = w ? w.name : 'Empty';
            slot.querySelector('.weapon-ammo').textContent = w ? `${w.ammo}/${w.magSize}` : '';
        }
        document.getElementById('grenade-count').textContent = `G: Grenade x${p.grenades}`;

        // Minimap
        this.drawMinimap();
    }

    drawMinimap() {
        const canvas = document.getElementById('minimap-canvas');
        const ctx = canvas.getContext('2d');
        const size = 160, scale = size / MAP_SIZE;
        ctx.clearRect(0, 0, size, size);

        // Background
        ctx.fillStyle = 'rgba(40,60,30,0.8)';
        ctx.fillRect(0, 0, size, size);

        // Zone
        const zx = this.zone.centerX * scale, zy = this.zone.centerY * scale;
        const zr = this.zone.currentRadius * scale;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, size, size);
        ctx.arc(zx, zy, zr, 0, Math.PI * 2, true);
        ctx.fillStyle = 'rgba(0,100,255,0.3)';
        ctx.fill();
        ctx.restore();
        ctx.beginPath(); ctx.arc(zx, zy, zr, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,150,255,0.8)'; ctx.lineWidth = 1; ctx.stroke();

        // Bots
        for (const bot of this.bots) {
            if (!bot.alive) continue;
            ctx.fillStyle = '#f44';
            ctx.fillRect(bot.x * scale - 1, bot.y * scale - 1, 2, 2);
        }

        // Player
        if (this.player.alive) {
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(this.player.x * scale, this.player.y * scale, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ============ SPECTATE ============
    enterSpectate() {
        const alive = this.bots.filter(b => b.alive);
        if (!alive.length) { this.state = STATES.MENU; this.showScreen('menu-screen'); return; }
        this.state = STATES.SPECTATING;
        this.spectateIndex = 0;
        this.spectateTarget = alive[0];
        this.showScreen('hud');
    }

    updateSpectate(dt) {
        this.gameTime += dt;
        this.updateBots(dt);
        this.updateBullets(dt);
        this.updateZone(dt);
        this.updateCamera();

        if (this.wasPressed('d') || this.wasPressed('arrowright')) {
            const alive = this.bots.filter(b => b.alive);
            if (alive.length) { this.spectateIndex = (this.spectateIndex + 1) % alive.length; this.spectateTarget = alive[this.spectateIndex]; }
        }
        if (this.wasPressed('a') || this.wasPressed('arrowleft')) {
            const alive = this.bots.filter(b => b.alive);
            if (alive.length) { this.spectateIndex = (this.spectateIndex - 1 + alive.length) % alive.length; this.spectateTarget = alive[this.spectateIndex]; }
        }

        if (!this.spectateTarget || !this.spectateTarget.alive) {
            const alive = this.bots.filter(b => b.alive);
            if (alive.length) { this.spectateTarget = alive[0]; } else { this.state = STATES.MENU; this.showScreen('menu-screen'); }
        }
    }

    // ============ END SCREENS ============
    showDeathScreen() {
        this.showScreen('death-screen');
        document.getElementById('killed-by').textContent = this.killedBy ? `Killed by: ${this.killedBy.name}` : '';
        document.getElementById('placement').textContent = `#${this.aliveCount + 1} / 30`;
        document.getElementById('death-stats').innerHTML = this.getStatsHTML();
    }

    showWinScreen() {
        this.showScreen('win-screen');
        document.getElementById('win-stats').innerHTML = this.getStatsHTML();
    }

    getStatsHTML() {
        const s = this.stats;
        const acc = s.shotsFired > 0 ? Math.round(s.shotsHit / s.shotsFired * 100) + '%' : '0%';
        return [
            ['Kills', this.player.kills], ['Damage Dealt', Math.round(s.damageDealt)],
            ['Damage Taken', Math.round(s.damageTaken)], ['Accuracy', acc],
            ['Headshot Kills', s.headshotKills], ['Survival Time', Math.floor(s.survivalTime) + 's'],
        ].map(([k, v]) => `<div><span>${k}</span><span>${v}</span></div>`).join('');
    }

    // ============ GAME LOOP ============
    loop(timestamp) {
        const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
        this.lastTime = timestamp;

        if (this.state === STATES.PLAYING) {
            this.update(dt);
        } else if (this.state === STATES.SPECTATING) {
            this.updateSpectate(dt);
        }

        // Render 3D scene
        if (this.state !== STATES.MENU) {
            this.renderer.render(this.scene, this.camera3d);
        }

        this.resetInput();
        requestAnimationFrame(t => this.loop(t));
    }
}

// ============ START ============
new Game3D();
