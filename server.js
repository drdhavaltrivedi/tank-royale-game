/**
 * Tank Royale - LAN Multiplayer Server
 * Serves static files AND handles WebSocket game rooms on one port.
 * Run: node server.js
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT     = 8080;
const MAP_SIZE = 4000;
const TICK_RATE       = 20;           // ticks per second
const MAX_PER_ROOM    = 8;            // max real players per room
const TOTAL_ENTITIES  = 30;           // players + bots = 30

const ZONE_PHASES = [
    { waitTime: 45, shrinkTime: 30, radiusPct: 0.85, damage: 1  },
    { waitTime: 30, shrinkTime: 25, radiusPct: 0.55, damage: 2  },
    { waitTime: 25, shrinkTime: 20, radiusPct: 0.30, damage: 5  },
    { waitTime: 15, shrinkTime: 15, radiusPct: 0.12, damage: 10 },
    { waitTime: 10, shrinkTime: 10, radiusPct: 0.02, damage: 20 },
];

const MIME = {
    '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
    '.png':'image/png',  '.jpg':'image/jpeg',      '.svg':'image/svg+xml',
    '.ico':'image/x-icon', '.woff2':'font/woff2',  '.woff':'font/woff',
};

// ── Static file server ──────────────────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.join(__dirname, urlPath);

    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
    });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function genRoomId() {
    let id;
    do { id = Math.random().toString(36).substring(2, 8).toUpperCase(); }
    while (rooms.has(id));
    return id;
}

function lerp(a, b, t) { return a + (b - a) * t; }

function genSpawnPoints(count) {
    const pts = [];
    const margin = 300;
    for (let i = 0; i < count; i++) {
        pts.push({
            x: margin + Math.random() * (MAP_SIZE - margin * 2),
            y: margin + Math.random() * (MAP_SIZE - margin * 2),
        });
    }
    return pts;
}

// ── Room class ────────────────────────────────────────────────────────────────
class Room {
    constructor(id) {
        this.id      = id;
        this.players = new Map();   // clientId → { ws, ...data }
        this.phase   = 'lobby';     // lobby | playing
        this.hostId  = null;
        this.bots    = [];          // last bot-state broadcast from host
        this.timer   = null;        // setInterval game-loop handle
        this.lastTick = Date.now();
        this.mapSeed  = Math.random();
        this.zone     = this._freshZone();
        this.spawnPoints = [];
    }

    _freshZone() {
        return {
            centerX: MAP_SIZE/2, centerY: MAP_SIZE/2,
            currentRadius: MAP_SIZE * 0.6,
            targetCenterX: MAP_SIZE/2, targetCenterY: MAP_SIZE/2,
            targetRadius:  MAP_SIZE * 0.6,
            startCenterX:  MAP_SIZE/2, startCenterY: MAP_SIZE/2,
            startRadius:   MAP_SIZE * 0.6,
            phase: 0, state: 'waiting',
            timer: ZONE_PHASES[0].waitTime,
            damage: ZONE_PHASES[0].damage,
            finished: false, shrinkProgress: 0,
        };
    }

    // Add a player and return whether they became host
    addPlayer(clientId, ws, name, tankClass) {
        const isFirst = this.players.size === 0;
        if (isFirst) this.hostId = clientId;
        this.players.set(clientId, {
            ws, id: clientId,
            name: (name || 'Player').substring(0, 20),
            tankClass: tankClass || 'medium',
            spawnIndex: this.players.size,
            isHost: isFirst,
            // runtime state (updated from client)
            x:0, y:0, angle:0,
            health:100, maxHealth:100,
            alive:false, kills:0,
            armor:0, helmet:0,
            weapons:[], stance:'standing',
            muzzleFlash:0, currentWeaponIdx:0, damageFlash:0,
            inVehicleType:null, inVehicleId:null,
        });
        return isFirst;
    }

    removePlayer(clientId) {
        this.players.delete(clientId);
        if (this.hostId === clientId && this.players.size > 0) {
            this.hostId = this.players.keys().next().value;
            const np = this.players.get(this.hostId);
            if (np) { np.isHost = true; this._send(this.hostId, { type:'promoted', isHost:true }); }
        }
    }

    _send(clientId, msg) {
        const p = this.players.get(clientId);
        if (p && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg));
    }

    broadcast(msg, excludeId=null) {
        const s = JSON.stringify(msg);
        this.players.forEach((p, id) => { if (id !== excludeId && p.ws.readyState === 1) p.ws.send(s); });
    }

    broadcastAll(msg) {
        const s = JSON.stringify(msg);
        this.players.forEach(p => { if (p.ws.readyState === 1) p.ws.send(s); });
    }

    playersInfo() {
        const info = {};
        this.players.forEach((p, id) => {
            info[id] = { id, name:p.name, tankClass:p.tankClass, spawnIndex:p.spawnIndex, isHost:p.isHost };
        });
        return info;
    }

    playerStates() {
        const st = {};
        this.players.forEach((p, id) => {
            st[id] = {
                id, name:p.name, tankClass:p.tankClass,
                x:p.x, y:p.y, angle:p.angle,
                health:p.health, maxHealth:p.maxHealth,
                alive:p.alive, kills:p.kills,
                armor:p.armor, helmet:p.helmet,
                weapons:p.weapons, stance:p.stance,
                muzzleFlash:p.muzzleFlash,
                currentWeaponIdx:p.currentWeaponIdx,
                damageFlash:p.damageFlash,
                inVehicleType:p.inVehicleType,
                inVehicleId:p.inVehicleId,
            };
        });
        return st;
    }

    startGame(mapTheme, gameMode) {
        if (this.phase !== 'lobby') return;
        this.phase = 'playing';
        this.zone  = this._freshZone();

        const botCount   = Math.max(0, TOTAL_ENTITIES - this.players.size);
        this.spawnPoints = genSpawnPoints(TOTAL_ENTITIES);

        let spawnIdx = 0;
        this.players.forEach((p, id) => {
            p.spawnIndex = spawnIdx++;
            p.alive = true;
            this._send(id, {
                type:'gameStart',
                spawnPoints: this.spawnPoints,
                spawnIndex:  p.spawnIndex,
                botCount,
                mapSeed:  this.mapSeed,
                mapTheme: mapTheme || 'grassland',
                gameMode: gameMode || 'Classic Solo',
                players:  this.playersInfo(),
                isHost:   id === this.hostId,
            });
        });

        this.lastTick = Date.now();
        this.timer = setInterval(() => this._tick(), 1000 / TICK_RATE);
    }

    _tick() {
        if (this.phase !== 'playing') return;
        const now = Date.now();
        const dt  = (now - this.lastTick) / 1000;
        this.lastTick = now;
        this._updateZone(dt);
        this.broadcastAll({
            type:'tick',
            zone:    this.zone,
            players: this.playerStates(),
            bots:    this.bots,
        });
    }

    _updateZone(dt) {
        const z = this.zone;
        if (z.finished) return;
        z.timer -= dt;
        const pd = ZONE_PHASES[z.phase];

        if (z.state === 'waiting') {
            if (z.timer <= 0) {
                z.state = 'shrinking';
                z.timer = pd.shrinkTime;
                z.shrinkProgress = 0;
                const off = z.currentRadius * 0.3;
                z.startCenterX = z.centerX; z.startCenterY = z.centerY; z.startRadius = z.currentRadius;
                z.targetCenterX = z.centerX + (Math.random()-.5)*off;
                z.targetCenterY = z.centerY + (Math.random()-.5)*off;
                z.targetRadius  = MAP_SIZE * pd.radiusPct;
                z.targetCenterX = Math.max(z.targetRadius, Math.min(MAP_SIZE-z.targetRadius, z.targetCenterX));
                z.targetCenterY = Math.max(z.targetRadius, Math.min(MAP_SIZE-z.targetRadius, z.targetCenterY));
            }
        } else if (z.state === 'shrinking') {
            z.shrinkProgress = 1 - (z.timer / pd.shrinkTime);
            z.centerX = lerp(z.startCenterX, z.targetCenterX, z.shrinkProgress);
            z.centerY = lerp(z.startCenterY, z.targetCenterY, z.shrinkProgress);
            z.currentRadius = lerp(z.startRadius, z.targetRadius, z.shrinkProgress);
            if (z.timer <= 0) {
                z.phase++;
                if (z.phase >= ZONE_PHASES.length) { z.finished = true; return; }
                z.state = 'waiting';
                z.timer  = ZONE_PHASES[z.phase].waitTime;
                z.damage = ZONE_PHASES[z.phase].damage;
            }
        }
    }

    stop() {
        if (this.timer) { clearInterval(this.timer); this.timer = null; }
        this.phase = 'lobby';
    }
}

// ── WebSocket server ──────────────────────────────────────────────────────────
const wss  = new WebSocketServer({ server: httpServer });
const rooms = new Map();          // roomId → Room
const clientRoom = new Map();     // ws    → roomId
const clientId   = new Map();     // ws    → id string
let   nextId = 1;

wss.on('connection', ws => {
    const myId = `p${nextId++}`;
    clientId.set(ws, myId);

    ws.on('message', raw => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        const rid  = clientRoom.get(ws);
        const room = rid ? rooms.get(rid) : null;
        const id   = clientId.get(ws);

        switch (msg.type) {

            case 'createRoom': {
                if (rid) break;
                const newRid = genRoomId();
                const r = new Room(newRid);
                rooms.set(newRid, r);
                r.addPlayer(id, ws, msg.name, msg.tankClass);
                clientRoom.set(ws, newRid);
                ws.send(JSON.stringify({ type:'roomCreated', roomId:newRid, playerId:id, isHost:true, players:r.playersInfo() }));
                console.log(`Room ${newRid} created by ${msg.name}`);
                break;
            }

            case 'joinRoom': {
                if (rid) break;
                const r = rooms.get((msg.roomId||'').toUpperCase());
                if (!r)                         { ws.send(JSON.stringify({type:'error',message:'Room not found!'})); break; }
                if (r.phase === 'playing')      { ws.send(JSON.stringify({type:'error',message:'Game already started!'})); break; }
                if (r.players.size >= MAX_PER_ROOM) { ws.send(JSON.stringify({type:'error',message:'Room is full!'})); break; }
                r.addPlayer(id, ws, msg.name, msg.tankClass);
                clientRoom.set(ws, r.id);
                ws.send(JSON.stringify({ type:'roomJoined', roomId:r.id, playerId:id, isHost:false, players:r.playersInfo() }));
                r.broadcast({ type:'playerJoined', player:{ id, name:msg.name, tankClass:msg.tankClass } }, id);
                console.log(`${msg.name} joined room ${r.id}`);
                break;
            }

            case 'startGame': {
                if (!room || room.hostId !== id) break;
                console.log(`Room ${room.id} game starting`);
                room.startGame(msg.mapTheme, msg.gameMode);
                break;
            }

            case 'playerState': {
                if (!room) break;
                const p = room.players.get(id);
                if (p) Object.assign(p, {
                    x:msg.x, y:msg.y, angle:msg.angle,
                    health:msg.health, maxHealth:msg.maxHealth,
                    alive:msg.alive, kills:msg.kills,
                    armor:msg.armor, helmet:msg.helmet,
                    weapons:msg.weapons, stance:msg.stance,
                    muzzleFlash:msg.muzzleFlash,
                    currentWeaponIdx:msg.currentWeaponIdx,
                    damageFlash:msg.damageFlash,
                    inVehicleType:msg.inVehicleType,
                    inVehicleId:msg.inVehicleId,
                });
                break;
            }

            case 'botState': {
                if (!room || room.hostId !== id) break;
                room.bots = msg.bots || [];
                break;
            }

            case 'bulletFired': {
                if (!room) break;
                room.broadcast({ type:'bulletFired', from:id, x:msg.x, y:msg.y, angle:msg.angle, weaponType:msg.weaponType }, id);
                break;
            }

            case 'playerHit': {
                if (!room) break;
                // Forward the damage exactly to the victim
                room._send(msg.targetId, { type: 'playerHit', damage: msg.damage, killerName: msg.killerName });
                break;
            }

            case 'itemPickedUp': {
                if (!room) break;
                room.broadcast({ type: 'itemPickedUp', itemId: msg.itemId, by: id }, id);
                break;
            }

            case 'doorOpened': {
                if (!room) break;
                room.broadcast({ type: 'doorOpened', doorId: msg.doorId }, id);
                break;
            }

            case 'playerDied': {
                if (!room) break;
                const p = room.players.get(id);
                if (p) p.alive = false;
                room.broadcast({ type:'playerDied', id, killerName:msg.killerName }, id);
                break;
            }

            case 'chatMessage': {
                if (!room) break;
                const p = room.players.get(id);
                room.broadcastAll({ type:'chatMessage', from: p?.name||'?', text:(msg.text||'').substring(0,100) });
                break;
            }
        }
    });

    ws.on('close', () => {
        const rid = clientRoom.get(ws);
        if (rid) {
            const r = rooms.get(rid);
            if (r) {
                const p = r.players.get(clientId.get(ws));
                r.removePlayer(clientId.get(ws));
                r.broadcast({ type:'playerLeft', id:clientId.get(ws), name:p?.name });
                if (r.players.size === 0) { r.stop(); rooms.delete(rid); console.log(`Room ${rid} removed`); }
            }
            clientRoom.delete(ws);
        }
        clientId.delete(ws);
    });

    ws.on('error', err => console.error('WS error:', err.message));
});

httpServer.listen(PORT, '0.0.0.0', () => {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    console.log(`\n🎮 Tank Royale Server running!\n`);
    console.log(`  Local:   http://localhost:${PORT}`);
    Object.values(nets).flat().filter(n => n.family==='IPv4' && !n.internal).forEach(n => {
        console.log(`  Network: http://${n.address}:${PORT}  ← share this for LAN play`);
    });
    console.log();
});
