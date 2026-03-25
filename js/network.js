// network.js — Client-side WebSocket manager for Tank Royale multiplayer

export class Network {
    constructor() {
        this.ws        = null;
        this.connected = false;
        this.playerId  = null;
        this.roomId    = null;
        this.isHost    = false;
        this._handlers = {};
        this._syncInterval = null;
    }

    connect(url) {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(url);
            } catch (e) { reject(e); return; }
            this.ws.onopen    = () => { this.connected = true; resolve(); };
            this.ws.onerror   = (e) => reject(new Error('WebSocket connection failed'));
            this.ws.onmessage = (e) => {
                try { this._dispatch(JSON.parse(e.data)); } catch {}
            };
            this.ws.onclose = () => {
                this.connected = false;
                this._dispatch({ type: 'disconnected' });
            };
            // Timeout
            setTimeout(() => { if (!this.connected) reject(new Error('Connection timed out')); }, 5000);
        });
    }

    on(type, fn) { this._handlers[type] = fn; }

    _dispatch(msg) {
        const h = this._handlers[msg.type];
        if (h) h(msg);
        const any = this._handlers['*'];
        if (any) any(msg);
    }

    _send(msg) {
        if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    // ── Lobby actions ──────────────────────────────────────────────────────────
    createRoom(name, tankClass) { this._send({ type:'createRoom', name, tankClass }); }
    joinRoom(roomId, name, tankClass) { this._send({ type:'joinRoom', roomId, name, tankClass }); }
    startGame(mapTheme, gameMode) { this._send({ type:'startGame', mapTheme, gameMode }); }

    // ── In-game actions ────────────────────────────────────────────────────────
    sendPlayerState(player) {
        if (!this.connected) return;
        this._send({
            type: 'playerState',
            x: player.x, y: player.y, angle: player.angle,
            health: player.health, maxHealth: player.maxHealth,
            alive: player.alive, kills: player.kills,
            armor: player.armor, helmet: player.helmet,
            weapons: (player.weapons || []).map(w => w ? {
                type: w.type, ammo: w.ammo, magSize: w.magSize,
                color: w.color, name: w.name
            } : null),
            stance: player.stance,
            muzzleFlash: player.muzzleFlash,
            currentWeaponIdx: player.currentWeaponIdx,
            damageFlash: player.damageFlash,
            inVehicleType: player.inVehicle ? player.inVehicle.type : null,
            inVehicleId: player.inVehicle ? player.inVehicle.id : null,
        });
    }

    sendBotStates(bots) {
        if (!this.connected || !this.isHost) return;
        this._send({
            type: 'botState',
            bots: bots.filter(b => b.alive).map(b => ({
                id: b.name,
                x: b.x, y: b.y, angle: b.angle,
                health: b.health, maxHealth: b.maxHealth,
                alive: b.alive, kills: b.kills,
                name: b.name,
                difficulty: b.difficulty,
                tankClass: b.tankClass,
                currentWeapon: b.currentWeapon
                    ? { type: b.currentWeapon.type, color: b.currentWeapon.color, name: b.currentWeapon.name }
                    : null,
            })),
        });
    }

    sendBulletFired(x, y, angle, weaponType) {
        this._send({ type:'bulletFired', x, y, angle, weaponType });
    }

    sendPlayerDamage(targetId, damage, killerName) {
        this._send({ type:'playerHit', targetId, damage, killerName });
    }

    sendPlayerDied(killerName) {
        this._send({ type:'playerDied', killerName });
    }

    sendItemPickedUp(itemId) {
        this._send({ type:'itemPickedUp', itemId });
    }

    sendDoorOpened(doorId) {
        this._send({ type:'doorOpened', doorId });
    }

    sendChat(text) {
        this._send({ type:'chatMessage', text });
    }

    // Start syncing player state 20x/second
    startSync(getPlayer, getBots) {
        this.stopSync();
        this._syncInterval = setInterval(() => {
            const player = getPlayer();
            if (player) this.sendPlayerState(player);
            if (this.isHost) {
                const bots = getBots();
                if (bots) this.sendBotStates(bots);
            }
        }, 50);
    }

    stopSync() {
        if (this._syncInterval) { clearInterval(this._syncInterval); this._syncInterval = null; }
    }

    disconnect() {
        this.stopSync();
        if (this.ws) { this.ws.close(); this.ws = null; }
        this.connected = false;
    }
}
