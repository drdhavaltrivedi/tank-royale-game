// map.js - Realistic world map with biomes, roads, props, enhanced terrain

import { MAP_SIZE, randomRange, randomInt, distance, bezierPoint } from './utils.js';

const LOCATIONS = [
    { name: 'Tilted Town',    cx: 800,  cy: 800,  radius: 350, buildings: 8, type: 'town' },
    { name: 'Dusty Depot',    cx: 2000, cy: 600,  radius: 300, buildings: 6, type: 'depot' },
    { name: 'Military Base',  cx: 3200, cy: 900,  radius: 400, buildings: 10, type: 'military' },
    { name: 'Pleasant Park',  cx: 600,  cy: 2200, radius: 300, buildings: 5, type: 'town' },
    { name: 'Loot Lake',      cx: 2000, cy: 2000, radius: 350, buildings: 4, type: 'lake' },
    { name: 'Retail Row',     cx: 3400, cy: 2200, radius: 300, buildings: 7, type: 'town' },
    { name: 'Salty Springs',  cx: 800,  cy: 3200, radius: 280, buildings: 5, type: 'town' },
    { name: 'Fatal Fields',   cx: 2000, cy: 3400, radius: 350, buildings: 4, type: 'farm' },
    { name: 'Lonely Lodge',   cx: 3300, cy: 3300, radius: 250, buildings: 3, type: 'lodge' },
];

const ROAD_CONNECTIONS = [
    [0,1],[1,2],[0,3],[1,4],[2,5],[3,4],[4,5],[3,6],[4,7],[5,8],[6,7],[7,8]
];

export const MAP_THEMES = {
    green_valley: {
        name: 'Green Valley', grassColor: '#4a7a3a', gridColor: 'rgba(0,0,0,0.03)',
        treeLeafColor: [40, 80], treeTrunkColor: '#543',
        waterColor: ['rgba(120,180,220,0.5)','rgba(60,130,190,0.6)','rgba(30,90,160,0.7)'],
        buildingColors: ['#665544','#776655','#887766'],
        rockShade: [90, 130], decorGreen: [35, 65],
        biomes: {
            town:     { base: [74,122,58],  patches: [[65,115,50],[80,130,62],[70,110,55]] },
            depot:    { base: [138,122,90], patches: [[130,115,80],[145,130,95],[120,105,75]] },
            military: { base: [90,95,85],   patches: [[85,90,80],[95,100,90],[80,85,75]] },
            farm:     { base: [90,135,58],  patches: [[100,140,60],[85,125,50],[110,145,70]] },
            lake:     { base: [58,106,58],  patches: [[50,100,50],[65,115,60],[55,95,48]] },
            lodge:    { base: [50,80,40],   patches: [[45,75,35],[55,85,45],[40,70,30]] },
        }
    },
    desert_storm: {
        name: 'Desert Storm', grassColor: '#c4a85a', gridColor: 'rgba(0,0,0,0.02)',
        treeLeafColor: [60, 90], treeTrunkColor: '#865',
        waterColor: ['rgba(100,170,200,0.4)','rgba(50,120,170,0.5)','rgba(30,80,140,0.6)'],
        buildingColors: ['#a08060','#b09070','#907050'],
        rockShade: [140, 180], decorGreen: [80, 120],
        biomes: {
            town:     { base: [180,160,110], patches: [[170,150,100],[190,170,120],[175,155,105]] },
            depot:    { base: [160,140,100], patches: [[150,130,90],[170,150,110],[145,125,85]] },
            military: { base: [140,135,120], patches: [[135,130,115],[145,140,125],[130,125,110]] },
            farm:     { base: [170,155,100], patches: [[180,165,110],[165,145,90],[175,160,105]] },
            lake:     { base: [150,140,100], patches: [[140,130,90],[160,150,110],[145,135,95]] },
            lodge:    { base: [130,115,80],  patches: [[125,110,75],[135,120,85],[120,105,70]] },
        }
    },
    arctic_frost: {
        name: 'Arctic Frost', grassColor: '#d0dde8', gridColor: 'rgba(0,0,0,0.02)',
        treeLeafColor: [25, 50], treeTrunkColor: '#433',
        waterColor: ['rgba(160,200,230,0.5)','rgba(130,180,220,0.6)','rgba(100,160,210,0.7)'],
        buildingColors: ['#889098','#7a8290','#96a0aa'],
        rockShade: [160, 200], decorGreen: [170, 210],
        biomes: {
            town:     { base: [200,210,220], patches: [[190,200,210],[210,220,230],[195,205,215]] },
            depot:    { base: [180,190,200], patches: [[170,180,190],[190,200,210],[175,185,195]] },
            military: { base: [170,175,185], patches: [[165,170,180],[175,180,190],[160,165,175]] },
            farm:     { base: [195,205,215], patches: [[205,215,225],[190,200,210],[200,210,220]] },
            lake:     { base: [185,200,220], patches: [[175,190,210],[195,210,230],[180,195,215]] },
            lodge:    { base: [160,170,180], patches: [[155,165,175],[165,175,185],[150,160,170]] },
        }
    }
};

const BIOME_COLORS = MAP_THEMES.green_valley.biomes;

export class GameMap {
    constructor(themeName) {
        this.obstacles = [];
        this.trees = [];
        this.decorations = [];
        this.waterZones = [];
        this.doors = [];
        this.locations = LOCATIONS;
        this.biomePatches = [];
        this.dirtPatches = [];
        this.roads = [];
        this.props = [];
        this.bushes = [];
        this.flowerPatches = [];
        this.tireTracks = [];

        // Theme
        this.themeName = themeName || 'green_valley';
        this.theme = MAP_THEMES[this.themeName] || MAP_THEMES.green_valley;
        this.biomeColors = this.theme.biomes;

        this.generate();
    }

    generate() {
        this.generateWater();
        this.generateRoads();
        this.generateBiomes();

        for (const loc of this.locations) {
            this.generateLocation(loc);
        }
        for (let i = 0; i < 10; i++) {
            this.placeBuilding(randomRange(200, MAP_SIZE - 200), randomRange(200, MAP_SIZE - 200),
                randomInt(50, 100), randomInt(50, 100), 'random');
        }

        this.generateRocks();
        this.generateTrees();
        this.generateBushes();
        this.generateProps();
        this.generateGroundDetails();
        this.generateDecorations();
    }

    // === GENERATION METHODS ===

    generateWater() {
        this.waterZones.push({ x: 2000, y: 2000, radius: 180 });
        this.waterZones.push({ x: 600, y: 3400, radius: 80 });
        this.waterZones.push({ x: 3500, y: 700, radius: 60 });

        const riverPoints = [];
        for (let t = 0; t <= 1; t += 0.05) {
            riverPoints.push({
                x: 100 + t * (MAP_SIZE - 200),
                y: 1600 + Math.sin(t * Math.PI * 3) * 300
            });
        }
        this.riverPoints = riverPoints;

        // Shore details for each water zone
        for (const wz of this.waterZones) {
            wz.shoreRocks = [];
            wz.lilyPads = [];
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2 + Math.random() * 0.5;
                const r = wz.radius + randomRange(-5, 10);
                wz.shoreRocks.push({ x: wz.x + Math.cos(a) * r, y: wz.y + Math.sin(a) * r, size: randomRange(3, 6) });
            }
            for (let i = 0; i < 5; i++) {
                const a = Math.random() * Math.PI * 2;
                const r = wz.radius * randomRange(0.3, 0.8);
                wz.lilyPads.push({ x: wz.x + Math.cos(a) * r, y: wz.y + Math.sin(a) * r, size: randomRange(3, 5) });
            }
            wz.wavePhases = [];
            for (let i = 0; i < 10; i++) {
                wz.wavePhases.push(Math.random() * Math.PI * 2);
            }
        }
    }

    generateRoads() {
        for (const [i, j] of ROAD_CONNECTIONS) {
            const a = LOCATIONS[i], b = LOCATIONS[j];
            const mx = (a.cx + b.cx) / 2, my = (a.cy + b.cy) / 2;
            const dx = b.cx - a.cx, dy = b.cy - a.cy;
            const len = Math.sqrt(dx * dx + dy * dy);
            const nx = -dy / len, ny = dx / len;
            const offset = randomRange(-80, 80);
            const road = {
                x1: a.cx, y1: a.cy, x2: b.cx, y2: b.cy,
                cp1x: mx + nx * offset * 0.8, cp1y: my + ny * offset * 0.8,
                cp2x: mx - nx * offset * 0.3, cp2y: my - ny * offset * 0.3,
                width: 26, isMain: true,
                // Bounding box for culling
                minX: Math.min(a.cx, b.cx, mx + nx * offset) - 30,
                minY: Math.min(a.cy, b.cy, my + ny * offset) - 30,
                maxX: Math.max(a.cx, b.cx, mx + nx * offset) + 30,
                maxY: Math.max(a.cy, b.cy, my + ny * offset) + 30,
            };
            this.roads.push(road);
        }

        // Branch paths to some buildings (generated after buildings exist)
        this._pendingBranchPaths = true;
    }

    generateBiomes() {
        for (const loc of this.locations) {
            const colors = this.biomeColors[loc.type] || this.biomeColors.town;
            const count = 40 + randomInt(0, 20);
            for (let i = 0; i < count; i++) {
                const a = Math.random() * Math.PI * 2;
                const d = Math.random() * loc.radius * 1.2;
                const x = loc.cx + Math.cos(a) * d;
                const y = loc.cy + Math.sin(a) * d;
                const c = colors.patches[randomInt(0, colors.patches.length - 1)];
                const v = randomInt(-10, 10);
                this.biomePatches.push({
                    x, y, radius: randomRange(35, 100),
                    r: c[0] + v, g: c[1] + v, b: c[2] + v
                });
            }
        }
    }

    generateLocation(loc) {
        const buildingColors = {
            town: ['#665544', '#776655', '#887766'],
            depot: ['#556666', '#667777', '#5a5a5a'],
            military: ['#445544', '#4a5a4a', '#556655'],
            lake: ['#665544', '#776655'],
            farm: ['#886644', '#997755', '#775533'],
            lodge: ['#8B4513', '#A0522D', '#654321'],
        };
        const colors = buildingColors[loc.type] || buildingColors.town;

        for (let i = 0; i < loc.buildings; i++) {
            const angle = (i / loc.buildings) * Math.PI * 2 + Math.random() * 0.5;
            const dist = randomRange(40, loc.radius * 0.8);
            const bx = loc.cx + Math.cos(angle) * dist;
            const by = loc.cy + Math.sin(angle) * dist;
            const bw = loc.type === 'military' ? randomInt(60, 120) : randomInt(50, 110);
            const bh = loc.type === 'military' ? randomInt(60, 120) : randomInt(50, 110);
            this.placeBuilding(bx - bw / 2, by - bh / 2, bw, bh, loc.type, colors);
        }
    }

    placeBuilding(x, y, w, h, locType, colors) {
        for (const obs of this.obstacles) {
            if (obs.type === 'building' &&
                x < obs.x + obs.w + 30 && x + w + 30 > obs.x &&
                y < obs.y + obs.h + 30 && y + h + 30 > obs.y) return;
        }
        for (const wz of this.waterZones) {
            if (distance(x + w / 2, y + h / 2, wz.x, wz.y) < wz.radius + 20) return;
        }

        const defaultColors = this.theme.buildingColors || ['#665544', '#776655', '#887766'];
        const c = colors || defaultColors;
        const color = c[randomInt(0, c.length - 1)];
        const doorSide = randomInt(0, 3);

        // Parse color to get interior (lighter)
        const interiorColor = this.lightenColor(color, 40);

        // Generate windows
        const windows = [];
        for (let side = 0; side < 4; side++) {
            const count = randomInt(1, 3);
            for (let wi = 0; wi < count; wi++) {
                const t = (wi + 1) / (count + 1);
                let wx, wy, ww, wh;
                if (side === 0) { wx = x + w * t - 4; wy = y; ww = 8; wh = 5; }
                else if (side === 1) { wx = x + w - 5; wy = y + h * t - 4; ww = 5; wh = 8; }
                else if (side === 2) { wx = x + w * t - 4; wy = y + h - 5; ww = 8; wh = 5; }
                else { wx = x; wy = y + h * t - 4; ww = 5; wh = 8; }
                windows.push({ x: wx, y: wy, w: ww, h: wh });
            }
        }

        // Generate wall segments (thin rects) with gap at door
        const wallT = 5; // wall thickness
        const doorW = 22;
        const walls = [];
        for (let side = 0; side < 4; side++) {
            if (side === doorSide) {
                // Split wall with door gap
                if (side === 0) { // top
                    const mid = x + w / 2;
                    walls.push({ x: x, y: y, w: mid - doorW / 2 - x, h: wallT });
                    walls.push({ x: mid + doorW / 2, y: y, w: x + w - (mid + doorW / 2), h: wallT });
                } else if (side === 1) { // right
                    const mid = y + h / 2;
                    walls.push({ x: x + w - wallT, y: y, w: wallT, h: mid - doorW / 2 - y });
                    walls.push({ x: x + w - wallT, y: mid + doorW / 2, w: wallT, h: y + h - (mid + doorW / 2) });
                } else if (side === 2) { // bottom
                    const mid = x + w / 2;
                    walls.push({ x: x, y: y + h - wallT, w: mid - doorW / 2 - x, h: wallT });
                    walls.push({ x: mid + doorW / 2, y: y + h - wallT, w: x + w - (mid + doorW / 2), h: wallT });
                } else { // left
                    const mid = y + h / 2;
                    walls.push({ x: x, y: y, w: wallT, h: mid - doorW / 2 - y });
                    walls.push({ x: x, y: mid + doorW / 2, w: wallT, h: y + h - (mid + doorW / 2) });
                }
            } else {
                // Full wall
                if (side === 0) walls.push({ x: x, y: y, w: w, h: wallT });
                else if (side === 1) walls.push({ x: x + w - wallT, y: y, w: wallT, h: h });
                else if (side === 2) walls.push({ x: x, y: y + h - wallT, w: w, h: wallT });
                else walls.push({ x: x, y: y, w: wallT, h: h });
            }
        }

        this.obstacles.push({
            type: 'building', x, y, w, h, color, doorSide, hasDoor: true,
            locationType: locType, interiorColor, windows, walls,
            roofLines: randomInt(2, 3)
        });

        const door = this.createDoor(x, y, w, h, doorSide);
        if (door) this.doors.push(door);

        // Dirt patches around building
        for (let i = 0; i < randomInt(2, 4); i++) {
            const side = randomInt(0, 3);
            let dx, dy;
            if (side === 0) { dx = x + randomRange(0, w); dy = y - randomRange(5, 20); }
            else if (side === 1) { dx = x + w + randomRange(5, 20); dy = y + randomRange(0, h); }
            else if (side === 2) { dx = x + randomRange(0, w); dy = y + h + randomRange(5, 20); }
            else { dx = x - randomRange(5, 20); dy = y + randomRange(0, h); }
            this.dirtPatches.push({ x: dx, y: dy, radius: randomRange(10, 25) });
        }
    }

    lightenColor(hex, amount) {
        const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
        const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
        const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
        return `rgb(${r},${g},${b})`;
    }

    createDoor(bx, by, bw, bh, side) {
        const dW = 22, dH = 8;
        let dx, dy, dw, dh;
        switch (side) {
            case 0: dx = bx + bw / 2 - dW / 2; dy = by - dH / 2; dw = dW; dh = dH; break;
            case 1: dx = bx + bw - dH / 2; dy = by + bh / 2 - dW / 2; dw = dH; dh = dW; break;
            case 2: dx = bx + bw / 2 - dW / 2; dy = by + bh - dH / 2; dw = dW; dh = dH; break;
            case 3: dx = bx - dH / 2; dy = by + bh / 2 - dW / 2; dw = dH; dh = dW; break;
            default: return null;
        }
        return { id: Math.random().toString(36).substr(2, 9), x: dx, y: dy, w: dw, h: dh, health: 50, maxHealth: 50, alive: true, side };
    }

    generateRocks() {
        for (let i = 0; i < 100; i++) {
            const w = randomInt(15, 45), h = randomInt(15, 45);
            const baseShade = randomInt(90, 130);
            this.obstacles.push({
                type: 'rock',
                x: randomRange(50, MAP_SIZE - 50 - w),
                y: randomRange(50, MAP_SIZE - 50 - h),
                w, h,
                baseColor: `rgb(${baseShade},${baseShade - 5},${baseShade - 10})`,
                highlightColor: `rgb(${baseShade + 30},${baseShade + 25},${baseShade + 20})`,
                highlightAngle: Math.random() * Math.PI * 2,
                health: 60, alive: true
            });
        }
    }

    generateTrees() {
        for (let i = 0; i < 200; i++) {
            const tx = randomRange(50, MAP_SIZE - 50);
            const ty = randomRange(50, MAP_SIZE - 50);
            let inWater = false;
            for (const wz of this.waterZones) {
                if (distance(tx, ty, wz.x, wz.y) < wz.radius - 10) { inWater = true; break; }
            }
            if (inWater) continue;

            const baseShade = randomInt(40, 80);
            const foliage = [];
            // Small clustered leaf circles for realistic tree look
            const clusterCount = randomInt(4, 7);
            const crownRadius = randomRange(6, 10);
            for (let j = 0; j < clusterCount; j++) {
                const angle = (j / clusterCount) * Math.PI * 2 + randomRange(-0.3, 0.3);
                const dist = randomRange(2, crownRadius);
                foliage.push({
                    dx: Math.cos(angle) * dist,
                    dy: Math.sin(angle) * dist - 2,
                    r: randomRange(4, 8),
                    shade: baseShade + randomInt(-10, 10)
                });
            }
            // Center cluster
            foliage.push({ dx: 0, dy: -2, r: randomRange(5, 8), shade: baseShade + 5 });
            this.trees.push({
                x: tx, y: ty, foliage,
                trunkW: randomInt(3, 5), trunkH: randomInt(6, 10),
                health: 30, alive: true
            });
        }
    }

    generateBushes() {
        for (let i = 0; i < 100; i++) {
            const bx = randomRange(100, MAP_SIZE - 100);
            const by = randomRange(100, MAP_SIZE - 100);
            let inWater = false;
            for (const wz of this.waterZones) {
                if (distance(bx, by, wz.x, wz.y) < wz.radius) { inWater = true; break; }
            }
            if (inWater) continue;

            const circles = [];
            const count = randomInt(3, 5);
            for (let j = 0; j < count; j++) {
                circles.push({
                    dx: randomRange(-8, 8), dy: randomRange(-8, 8),
                    r: randomRange(4, 8),
                    shade: randomInt(30, 55)
                });
            }
            this.bushes.push({ x: bx, y: by, circles, health: 10, alive: true });
        }
    }

    generateProps() {
        for (const obs of this.obstacles) {
            if (obs.type !== 'building') continue;

            // Crates/barrels near buildings
            if (Math.random() < 0.6) {
                const side = randomInt(0, 3);
                let px, py;
                if (side === 0) { px = obs.x + randomRange(0, obs.w); py = obs.y - randomRange(15, 30); }
                else if (side === 1) { px = obs.x + obs.w + randomRange(15, 30); py = obs.y + randomRange(0, obs.h); }
                else if (side === 2) { px = obs.x + randomRange(0, obs.w); py = obs.y + obs.h + randomRange(15, 30); }
                else { px = obs.x - randomRange(15, 30); py = obs.y + randomRange(0, obs.h); }

                this.props.push({
                    type: Math.random() < 0.5 ? 'crate' : 'barrel',
                    x: px, y: py, w: randomInt(8, 14), h: randomInt(8, 14)
                });
            }

            // Sandbags at military
            if (obs.locationType === 'military' && Math.random() < 0.7) {
                for (let s = 0; s < randomInt(2, 4); s++) {
                    const a = obs.doorSide * Math.PI / 2 + randomRange(-0.5, 0.5);
                    const cx = obs.x + obs.w / 2 + Math.cos(a) * (Math.max(obs.w, obs.h) / 2 + 20);
                    const cy = obs.y + obs.h / 2 + Math.sin(a) * (Math.max(obs.w, obs.h) / 2 + 20);
                    this.props.push({ type: 'sandbag', x: cx + randomRange(-10, 10), y: cy + randomRange(-10, 10) });
                }
            }
        }

        // Fences between nearby building pairs
        const buildings = this.obstacles.filter(o => o.type === 'building');
        for (let i = 0; i < buildings.length; i++) {
            for (let j = i + 1; j < buildings.length; j++) {
                const a = buildings[i], b = buildings[j];
                const d = distance(a.x + a.w / 2, a.y + a.h / 2, b.x + b.w / 2, b.y + b.h / 2);
                if (d > 80 && d < 180 && Math.random() < 0.25) {
                    this.props.push({
                        type: 'fence',
                        x1: a.x + a.w / 2, y1: a.y + a.h / 2,
                        x2: b.x + b.w / 2, y2: b.y + b.h / 2
                    });
                }
            }
        }

        // Signs at road midpoints near locations
        for (let i = 0; i < Math.min(8, this.roads.length); i++) {
            const r = this.roads[i];
            const mid = bezierPoint(0.5, r.x1, r.y1, r.cp1x, r.cp1y, r.cp2x, r.cp2y, r.x2, r.y2);
            this.props.push({ type: 'sign', x: mid.x + randomRange(-20, 20), y: mid.y + randomRange(-20, 20) });
        }
    }

    generateGroundDetails() {
        // Flower patches
        for (let i = 0; i < 120; i++) {
            const fx = randomRange(100, MAP_SIZE - 100);
            const fy = randomRange(100, MAP_SIZE - 100);
            if (this.isInWater(fx, fy)) continue;
            const colors = ['#e55', '#ee5', '#e8e', '#55e', '#fa5'];
            const dots = [];
            for (let d = 0; d < randomInt(3, 6); d++) {
                dots.push({
                    dx: randomRange(-8, 8), dy: randomRange(-8, 8),
                    color: colors[randomInt(0, colors.length - 1)]
                });
            }
            this.flowerPatches.push({ x: fx, y: fy, dots });
        }

        // Tire tracks near roads
        for (const road of this.roads) {
            if (Math.random() < 0.4) continue;
            const points = [];
            for (let t = 0; t <= 1; t += 0.08) {
                const p = bezierPoint(t, road.x1, road.y1, road.cp1x, road.cp1y, road.cp2x, road.cp2y, road.x2, road.y2);
                points.push({ x: p.x + randomRange(-15, 15), y: p.y + randomRange(-15, 15) });
            }
            this.tireTracks.push(points);
        }
    }

    generateDecorations() {
        for (let i = 0; i < 200; i++) {
            this.decorations.push({
                x: randomRange(0, MAP_SIZE), y: randomRange(0, MAP_SIZE),
                radius: randomRange(30, 80), shade: randomInt(90, 110)
            });
        }
    }

    isInBush(x, y) {
        for (const bush of this.bushes) {
            if (!bush.alive) continue;
            if (distance(x, y, bush.x, bush.y) < 14) return bush;
        }
        return null;
    }

    isInsideBuilding(x, y) {
        for (const obs of this.obstacles) {
            if (obs.type !== 'building') continue;
            if (x > obs.x && x < obs.x + obs.w && y > obs.y && y < obs.y + obs.h) return obs;
        }
        return null;
    }

    isInWater(x, y) {
        for (const wz of this.waterZones) {
            if (distance(x, y, wz.x, wz.y) < wz.radius) return true;
        }
        if (this.riverPoints) {
            for (let i = 0; i < this.riverPoints.length - 1; i++) {
                const p1 = this.riverPoints[i], p2 = this.riverPoints[i + 1];
                const d = this._ptSegDist(x, y, p1.x, p1.y, p2.x, p2.y);
                if (d < 35) return true;
            }
        }
        return false;
    }

    _ptSegDist(px, py, ax, ay, bx, by) {
        const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
        if (len2 === 0) return distance(px, py, ax, ay);
        let t = ((px - ax) * dx + (py - ay) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        return distance(px, py, ax + t * dx, ay + t * dy);
    }

    damageDoor(door, amount) {
        if (!door.alive) return;
        door.health -= amount;
        if (door.health <= 0) { door.health = 0; door.alive = false; }
    }

    getSpawnPoints(count) {
        const points = [];
        const margin = 200;
        const playerX = MAP_SIZE / 2 + randomRange(-300, 300);
        const playerY = MAP_SIZE / 2 + randomRange(-300, 300);
        points.push({ x: playerX, y: playerY });
        for (let i = 1; i < count; i++) {
            let x, y, valid, attempts = 0;
            do {
                const a = Math.random() * Math.PI * 2;
                const dist = 400 + Math.random() * 1100;
                x = playerX + Math.cos(a) * dist;
                y = playerY + Math.sin(a) * dist;
                x = Math.max(margin, Math.min(MAP_SIZE - margin, x));
                y = Math.max(margin, Math.min(MAP_SIZE - margin, y));
                valid = true;
                for (const obs of this.obstacles) {
                    if (x > obs.x - 30 && x < obs.x + obs.w + 30 &&
                        y > obs.y - 30 && y < obs.y + obs.h + 30) { valid = false; break; }
                }
                if (valid && this.isInWater(x, y)) valid = false;
                attempts++;
            } while (!valid && attempts < 50);
            points.push({ x, y });
        }
        return points;
    }

    // === DRAW METHOD ===

    draw(ctx, camera, gameTime = 0) {
        // 1. Base ground
        ctx.fillStyle = this.theme.grassColor;
        ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

        // 2. Grid
        ctx.strokeStyle = this.theme.gridColor || 'rgba(0,0,0,0.04)';
        ctx.lineWidth = 1;
        const startX = Math.floor(camera.x / 64) * 64;
        const startY = Math.floor(camera.y / 64) * 64;
        for (let x = startX; x < camera.x + camera.canvas.width + 64; x += 64) {
            ctx.beginPath(); ctx.moveTo(x, camera.y); ctx.lineTo(x, camera.y + camera.canvas.height); ctx.stroke();
        }
        for (let y = startY; y < camera.y + camera.canvas.height + 64; y += 64) {
            ctx.beginPath(); ctx.moveTo(camera.x, y); ctx.lineTo(camera.x + camera.canvas.width, y); ctx.stroke();
        }

        // 3. Decorations (base grass variation)
        for (const d of this.decorations) {
            if (!camera.isVisible(d.x, d.y, d.radius)) continue;
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgb(${d.shade - 30}, ${d.shade + 20}, ${d.shade - 50})`;
            ctx.fill();
        }

        // 4. Biome patches
        for (const bp of this.biomePatches) {
            if (!camera.isVisible(bp.x, bp.y, bp.radius)) continue;
            ctx.beginPath();
            ctx.arc(bp.x, bp.y, bp.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${bp.r},${bp.g},${bp.b},0.4)`;
            ctx.fill();
        }

        // 5. Dirt patches
        for (const dp of this.dirtPatches) {
            if (!camera.isVisible(dp.x, dp.y, dp.radius)) continue;
            ctx.beginPath();
            ctx.arc(dp.x, dp.y, dp.radius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(120,100,70,0.3)';
            ctx.fill();
        }

        // 6. Tire tracks
        ctx.strokeStyle = 'rgba(80,60,30,0.12)';
        ctx.lineWidth = 3;
        for (const track of this.tireTracks) {
            if (!camera.isVisible(track[0].x, track[0].y, 200)) continue;
            ctx.beginPath();
            ctx.moveTo(track[0].x, track[0].y);
            for (let i = 1; i < track.length; i++) ctx.lineTo(track[i].x, track[i].y);
            ctx.stroke();
        }

        // 7. Roads
        for (const road of this.roads) {
            if (road.maxX < camera.x || road.minX > camera.x + camera.canvas.width ||
                road.maxY < camera.y || road.minY > camera.y + camera.canvas.height) continue;

            // Road edge
            ctx.beginPath();
            ctx.moveTo(road.x1, road.y1);
            ctx.bezierCurveTo(road.cp1x, road.cp1y, road.cp2x, road.cp2y, road.x2, road.y2);
            ctx.strokeStyle = '#5a5a4a';
            ctx.lineWidth = road.width + 4;
            ctx.lineCap = 'round';
            ctx.stroke();

            // Road body
            ctx.beginPath();
            ctx.moveTo(road.x1, road.y1);
            ctx.bezierCurveTo(road.cp1x, road.cp1y, road.cp2x, road.cp2y, road.x2, road.y2);
            ctx.strokeStyle = '#7a7a6a';
            ctx.lineWidth = road.width;
            ctx.stroke();

            // Center dash
            if (road.isMain) {
                ctx.beginPath();
                ctx.moveTo(road.x1, road.y1);
                ctx.bezierCurveTo(road.cp1x, road.cp1y, road.cp2x, road.cp2y, road.x2, road.y2);
                ctx.setLineDash([12, 12]);
                ctx.strokeStyle = 'rgba(255,255,255,0.25)';
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        // 8. Flower patches
        for (const fp of this.flowerPatches) {
            if (!camera.isVisible(fp.x, fp.y, 15)) continue;
            for (const dot of fp.dots) {
                ctx.beginPath();
                ctx.arc(fp.x + dot.dx, fp.y + dot.dy, 2, 0, Math.PI * 2);
                ctx.fillStyle = dot.color;
                ctx.fill();
            }
        }

        // 9. Water zones with gradient shore
        for (const wz of this.waterZones) {
            if (!camera.isVisible(wz.x, wz.y, wz.radius + 25)) continue;

            // Sand shore
            ctx.beginPath();
            ctx.arc(wz.x, wz.y, wz.radius + 15, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(180,160,120,0.5)';
            ctx.fill();

            // Shallow water
            ctx.beginPath();
            ctx.arc(wz.x, wz.y, wz.radius + 5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(60,140,210,0.35)';
            ctx.fill();

            // Deep water
            ctx.beginPath();
            ctx.arc(wz.x, wz.y, wz.radius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(30,100,180,0.55)';
            ctx.fill();

            // Animated wave lines
            ctx.strokeStyle = 'rgba(150,200,255,0.25)';
            ctx.lineWidth = 1.5;
            for (let i = 0; i < wz.wavePhases.length; i++) {
                const a = (i / wz.wavePhases.length) * Math.PI * 2;
                const waveR = wz.radius + Math.sin(gameTime * 2 + wz.wavePhases[i]) * 4;
                ctx.beginPath();
                ctx.arc(wz.x, wz.y, waveR, a - 0.3, a + 0.3);
                ctx.stroke();
            }

            // Shore rocks
            for (const sr of wz.shoreRocks) {
                ctx.beginPath();
                ctx.arc(sr.x, sr.y, sr.size, 0, Math.PI * 2);
                ctx.fillStyle = '#8a8a7a';
                ctx.fill();
            }

            // Lily pads
            for (const lp of wz.lilyPads) {
                ctx.beginPath();
                ctx.arc(lp.x, lp.y, lp.size, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(40,120,50,0.6)';
                ctx.fill();
            }
        }

        // River with gradient
        if (this.riverPoints && this.riverPoints.length > 1) {
            // Sand bank
            ctx.beginPath();
            ctx.moveTo(this.riverPoints[0].x, this.riverPoints[0].y);
            for (let i = 1; i < this.riverPoints.length; i++) ctx.lineTo(this.riverPoints[i].x, this.riverPoints[i].y);
            ctx.strokeStyle = 'rgba(180,160,120,0.4)';
            ctx.lineWidth = 82;
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.stroke();

            // Shallow
            ctx.beginPath();
            ctx.moveTo(this.riverPoints[0].x, this.riverPoints[0].y);
            for (let i = 1; i < this.riverPoints.length; i++) ctx.lineTo(this.riverPoints[i].x, this.riverPoints[i].y);
            ctx.strokeStyle = 'rgba(50,130,210,0.4)';
            ctx.lineWidth = 74;
            ctx.stroke();

            // Deep
            ctx.beginPath();
            ctx.moveTo(this.riverPoints[0].x, this.riverPoints[0].y);
            for (let i = 1; i < this.riverPoints.length; i++) ctx.lineTo(this.riverPoints[i].x, this.riverPoints[i].y);
            ctx.strokeStyle = 'rgba(30,100,180,0.5)';
            ctx.lineWidth = 66;
            ctx.stroke();
        }

        // Map border
        ctx.strokeStyle = '#f44';
        ctx.lineWidth = 4;
        ctx.strokeRect(0, 0, MAP_SIZE, MAP_SIZE);

        // 10. Rocks (enhanced)
        for (const obs of this.obstacles) {
            if (obs.type !== 'rock') continue;
            if (obs.alive === false) continue;
            if (!camera.isVisible(obs.x + obs.w / 2, obs.y + obs.h / 2, 60)) continue;
            const cx = obs.x + obs.w / 2, cy = obs.y + obs.h / 2;

            // Base
            ctx.beginPath();
            ctx.ellipse(cx, cy, obs.w / 2, obs.h / 2, 0, 0, Math.PI * 2);
            ctx.fillStyle = obs.baseColor || '#888';
            ctx.fill();

            // Highlight arc
            if (obs.highlightAngle !== undefined) {
                ctx.beginPath();
                ctx.ellipse(cx, cy, obs.w / 2 - 2, obs.h / 2 - 2, 0, obs.highlightAngle - 0.8, obs.highlightAngle + 0.8);
                ctx.strokeStyle = obs.highlightColor || 'rgba(200,200,200,0.3)';
                ctx.lineWidth = 3;
                ctx.stroke();
            }

            ctx.beginPath();
            ctx.ellipse(cx, cy, obs.w / 2, obs.h / 2, 0, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(0,0,0,0.25)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // 11. Props
        for (const prop of this.props) {
            if (prop.type === 'crate') {
                if (!camera.isVisible(prop.x, prop.y, 20)) continue;
                ctx.fillStyle = '#8a6a3a';
                ctx.fillRect(prop.x - prop.w / 2, prop.y - prop.h / 2, prop.w, prop.h);
                ctx.strokeStyle = '#6a4a2a';
                ctx.lineWidth = 1;
                ctx.strokeRect(prop.x - prop.w / 2, prop.y - prop.h / 2, prop.w, prop.h);
                // Cross
                ctx.beginPath();
                ctx.moveTo(prop.x - prop.w / 2, prop.y - prop.h / 2);
                ctx.lineTo(prop.x + prop.w / 2, prop.y + prop.h / 2);
                ctx.moveTo(prop.x + prop.w / 2, prop.y - prop.h / 2);
                ctx.lineTo(prop.x - prop.w / 2, prop.y + prop.h / 2);
                ctx.strokeStyle = 'rgba(0,0,0,0.15)';
                ctx.stroke();
            } else if (prop.type === 'barrel') {
                if (!camera.isVisible(prop.x, prop.y, 15)) continue;
                ctx.fillStyle = '#5a5a5a';
                ctx.beginPath();
                ctx.arc(prop.x, prop.y, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#3a3a3a';
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(prop.x, prop.y, 3, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                ctx.stroke();
            } else if (prop.type === 'sandbag') {
                if (!camera.isVisible(prop.x, prop.y, 15)) continue;
                ctx.fillStyle = '#a09070';
                ctx.fillRect(prop.x - 6, prop.y - 4, 12, 8);
                ctx.strokeStyle = '#807060';
                ctx.lineWidth = 1;
                ctx.strokeRect(prop.x - 6, prop.y - 4, 12, 8);
            } else if (prop.type === 'fence') {
                const mx = (prop.x1 + prop.x2) / 2, my = (prop.y1 + prop.y2) / 2;
                if (!camera.isVisible(mx, my, 120)) continue;
                ctx.beginPath();
                ctx.moveTo(prop.x1, prop.y1);
                ctx.lineTo(prop.x2, prop.y2);
                ctx.strokeStyle = '#8a7a5a';
                ctx.lineWidth = 2;
                ctx.stroke();
                // Posts
                const d = distance(prop.x1, prop.y1, prop.x2, prop.y2);
                const posts = Math.max(2, Math.floor(d / 30));
                for (let p = 0; p <= posts; p++) {
                    const t = p / posts;
                    const px = prop.x1 + (prop.x2 - prop.x1) * t;
                    const py = prop.y1 + (prop.y2 - prop.y1) * t;
                    ctx.fillStyle = '#6a5a3a';
                    ctx.fillRect(px - 2, py - 2, 4, 4);
                }
            } else if (prop.type === 'sign') {
                if (!camera.isVisible(prop.x, prop.y, 20)) continue;
                ctx.fillStyle = '#654';
                ctx.fillRect(prop.x - 1, prop.y - 2, 2, 14);
                ctx.fillStyle = '#ddd';
                ctx.fillRect(prop.x - 6, prop.y - 4, 12, 7);
                ctx.strokeStyle = '#888';
                ctx.lineWidth = 1;
                ctx.strokeRect(prop.x - 6, prop.y - 4, 12, 7);
            }
        }

        // 12. Buildings (enhanced)
        for (const obs of this.obstacles) {
            if (obs.type !== 'building') continue;
            if (!camera.isVisible(obs.x + obs.w / 2, obs.y + obs.h / 2, Math.max(obs.w, obs.h))) continue;

            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fillRect(obs.x + 6, obs.y + 6, obs.w, obs.h);

            // Interior floor
            ctx.fillStyle = obs.interiorColor || '#998877';
            ctx.fillRect(obs.x + 4, obs.y + 4, obs.w - 8, obs.h - 8);

            // Interior floor lines
            ctx.strokeStyle = 'rgba(0,0,0,0.06)';
            ctx.lineWidth = 1;
            for (let ly = obs.y + 12; ly < obs.y + obs.h - 4; ly += 12) {
                ctx.beginPath(); ctx.moveTo(obs.x + 4, ly); ctx.lineTo(obs.x + obs.w - 4, ly); ctx.stroke();
            }

            // Walls
            ctx.fillStyle = obs.color;
            ctx.fillRect(obs.x, obs.y, obs.w, obs.h);

            // Cut out interior to show floor
            ctx.fillStyle = obs.interiorColor || '#998877';
            ctx.fillRect(obs.x + 5, obs.y + 5, obs.w - 10, obs.h - 10);

            // Wall outline
            ctx.strokeStyle = 'rgba(0,0,0,0.45)';
            ctx.lineWidth = 2;
            ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);

            // Windows
            if (obs.windows) {
                for (const w of obs.windows) {
                    ctx.fillStyle = 'rgba(0,0,0,0.35)';
                    ctx.fillRect(w.x, w.y, w.w, w.h);
                    // Glass reflection
                    ctx.fillStyle = 'rgba(180,210,255,0.35)';
                    ctx.fillRect(w.x + 1, w.y + 1, Math.min(3, w.w - 2), Math.min(3, w.h - 2));
                }
            }

            // Roof lines
            if (obs.roofLines) {
                ctx.strokeStyle = 'rgba(0,0,0,0.08)';
                ctx.lineWidth = 1;
                for (let r = 1; r <= obs.roofLines; r++) {
                    const ry = obs.y + (obs.h / (obs.roofLines + 1)) * r;
                    ctx.beginPath(); ctx.moveTo(obs.x + 2, ry); ctx.lineTo(obs.x + obs.w - 2, ry); ctx.stroke();
                }
            }

            // Military camo stripes
            if (obs.locationType === 'military') {
                ctx.fillStyle = 'rgba(60,80,40,0.2)';
                for (let s = 0; s < 3; s++) {
                    ctx.fillRect(obs.x + 5, obs.y + 8 + s * (obs.h / 4), obs.w - 10, 4);
                }
            }
        }

        // 13. Doors
        for (const door of this.doors) {
            if (!door.alive) continue;
            if (!camera.isVisible(door.x + door.w / 2, door.y + door.h / 2, 30)) continue;
            const hpPct = door.health / door.maxHealth;
            const r = Math.floor(80 + (1 - hpPct) * 130);
            ctx.fillStyle = `rgb(${r},${Math.floor(50 * hpPct)},${Math.floor(25 * hpPct)})`;
            ctx.fillRect(door.x, door.y, door.w, door.h);
            ctx.strokeStyle = 'rgba(0,0,0,0.4)';
            ctx.lineWidth = 1;
            ctx.strokeRect(door.x, door.y, door.w, door.h);
        }

        // 14. Bushes
        for (const bush of this.bushes) {
            if (!bush.alive) continue;
            if (!camera.isVisible(bush.x, bush.y, 15)) continue;
            for (const c of bush.circles) {
                ctx.beginPath();
                ctx.arc(bush.x + c.dx, bush.y + c.dy, c.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgb(${c.shade - 5}, ${c.shade + 30}, ${c.shade - 15})`;
                ctx.fill();
            }
        }

        // 15. Trees (enhanced multi-circle)
        for (const tree of this.trees) {
            if (!tree.alive) {
                // Draw stump for dead trees
                if (camera.isVisible(tree.x, tree.y, 10)) {
                    ctx.fillStyle = '#5a3a1a';
                    ctx.beginPath();
                    ctx.arc(tree.x, tree.y, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
                continue;
            }
            if (!camera.isVisible(tree.x, tree.y, 30)) continue;

            // Shadow under tree
            ctx.beginPath();
            ctx.arc(tree.x + 2, tree.y + 3, 10, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.1)';
            ctx.fill();

            // Trunk (visible brown line)
            ctx.fillStyle = this.theme.treeTrunkColor || '#5a3a1a';
            ctx.fillRect(tree.x - tree.trunkW / 2, tree.y, tree.trunkW, tree.trunkH);
            // Trunk highlight
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.fillRect(tree.x - tree.trunkW / 2, tree.y, 1, tree.trunkH);

            // Foliage circles (small clusters = realistic crown)
            for (const f of tree.foliage) {
                ctx.beginPath();
                ctx.arc(tree.x + f.dx, tree.y + f.dy, f.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgb(${f.shade - 8}, ${f.shade + 35}, ${f.shade - 25})`;
                ctx.fill();
            }
            // Leaf highlights (lighter dots on top)
            for (let li = 0; li < 3; li++) {
                const f = tree.foliage[li % tree.foliage.length];
                ctx.beginPath();
                ctx.arc(tree.x + f.dx - 1, tree.y + f.dy - 1, f.r * 0.4, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${f.shade + 20}, ${f.shade + 60}, ${f.shade}, 0.4)`;
                ctx.fill();
            }
            // Crown outline
            ctx.beginPath();
            ctx.arc(tree.x, tree.y - 2, 10, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(0,0,0,0.08)';
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }

        // 16. Location names
        for (const loc of this.locations) {
            if (!camera.isVisible(loc.cx, loc.cy, loc.radius + 100)) continue;
            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.font = 'bold 15px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(loc.name, loc.cx + 1, loc.cy - loc.radius - 9);
            // Text
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.fillText(loc.name, loc.cx, loc.cy - loc.radius - 10);
        }
    }
}
