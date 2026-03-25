// bot.js - Bot AI (state machine: roam, loot, fight, flee, zone)

import { distance, angle, randomRange, clamp, MAP_SIZE } from './utils.js';
import { Bullet } from './weapons.js';
import { resolveCircleRect } from './collision.js';
import { TANK_CLASSES } from './player.js';

const BOT_NAMES = [
    'Shadow', 'Viper', 'Ghost', 'Reaper', 'Storm', 'Blaze', 'Fury', 'Hawk',
    'Wolf', 'Cobra', 'Phantom', 'Titan', 'Rogue', 'Apex', 'Nova', 'Frost',
    'Bolt', 'Striker', 'Ace', 'Raptor', 'Dagger', 'Snipe', 'Tank', 'Flash',
    'Ranger', 'Scout', 'Bravo', 'Delta', 'Echo', 'Omega'
];

const STATES = {
    ROAMING: 'roaming',
    LOOTING: 'looting',
    FIGHTING: 'fighting',
    FLEEING: 'fleeing',
    ZONE_MOVING: 'zone_moving'
};

const DIFFICULTIES = {
    easy:   { accuracy: [0.4, 0.6], aggression: [0.2, 0.4], sightRange: [200, 300], speed: [140, 170], thinkTime: [0.5, 0.8], nameColor: '#ccc', fleeHP: 40 },
    medium: { accuracy: [0.6, 0.8], aggression: [0.4, 0.6], sightRange: [250, 400], speed: [160, 200], thinkTime: [0.3, 0.5], nameColor: '#fc4', fleeHP: 30 },
    hard:   { accuracy: [0.8, 0.95], aggression: [0.6, 0.9], sightRange: [350, 500], speed: [180, 220], thinkTime: [0.15, 0.3], nameColor: '#f44', fleeHP: 20 },
};

function pickDifficulty() {
    const r = Math.random();
    if (r < 0.4) return 'easy';
    if (r < 0.75) return 'medium';
    return 'hard';
}

function randBetween(arr) { return arr[0] + Math.random() * (arr[1] - arr[0]); }

export class Bot {
    constructor(x, y, index) {
        this.x = x;
        this.y = y;

        // Tank class (random: 40% medium, 30% light, 30% heavy)
        const classRoll = Math.random();
        this.tankClass = classRoll < 0.3 ? 'light' : classRoll < 0.7 ? 'medium' : 'heavy';
        const tc = TANK_CLASSES[this.tankClass];
        this.tankClassData = tc;
        this.radius = tc.radius;
        this.health = tc.hp;
        this.maxHealth = tc.hp;
        this.damageMult = tc.dmgMult;
        this.dmgReduction = tc.dmgReduction;
        this.alive = true;
        this.angle = Math.random() * Math.PI * 2;
        this.name = BOT_NAMES[index % BOT_NAMES.length];
        this.isPlayer = false;

        // Difficulty tier
        this.difficulty = pickDifficulty();
        const diff = DIFFICULTIES[this.difficulty];
        this.speed = tc.speed * (randBetween(diff.speed) / 180); // scale difficulty speed around class base
        this.accuracy = randBetween(diff.accuracy);
        this.aggression = randBetween(diff.aggression);
        this.sightRange = randBetween(diff.sightRange);
        this.thinkInterval = diff.thinkTime;
        this.nameColor = diff.nameColor;
        this.fleeHP = diff.fleeHP;

        this.weapons = [null, null];
        this.currentWeaponIdx = 0;
        this.lastFireTime = 0;
        this.reloading = false;
        this.reloadStartTime = 0;

        this.kills = 0;
        this.damageFlash = 0;

        // Armor system
        this.armor = 0;
        this.helmet = 0;

        // Backpack
        this.backpackLevel = 0;

        // Healing inventory (bots can accumulate and use)
        this.bandages = 0;
        this.medkits = 0;
        this.maxBandages = 10;
        this.maxMedkits = 3;
        this._healCooldown = 0; // prevent spamming heals

        // AI state
        this.state = STATES.ROAMING;
        this.targetX = x;
        this.targetY = y;
        this.targetEntity = null;
        this.stateTimer = 0;
        this.thinkTimer = 0;
    }

    get currentWeapon() {
        return this.weapons[this.currentWeaponIdx];
    }

    startReload(time) {
        if (this.currentWeapon && this.currentWeapon.ammo < this.currentWeapon.magSize) {
            this.reloading = true;
            this.reloadStartTime = time;
        }
    }

    update(dt, entities, obstacles, zone, lootSystem, bullets, time, gameMap, smokeClouds, network = null) {
        if (!this.alive) return;
        this.network = network;
        this.inWater = gameMap && gameMap.isInWater(this.x, this.y);
        this._waterSpeedMult = this.inWater ? 0.5 : 1;

        // Reload check
        if (this.reloading && this.currentWeapon) {
            if (time - this.reloadStartTime >= this.currentWeapon.reloadTime / 1000) {
                this.currentWeapon.ammo = this.currentWeapon.magSize;
                this.reloading = false;
            }
        }

        // Auto-heal when low health (not in fight)
        this._healCooldown -= dt;
        if (this._healCooldown <= 0 && this.state !== STATES.FIGHTING) {
            if (this.health < 50 && this.medkits > 0) {
                this.health = Math.min(this.maxHealth, this.health + 25);
                this.medkits--;
                this._healCooldown = 6;
            } else if (this.health < 70 && this.bandages > 0) {
                this.health = Math.min(Math.min(this.maxHealth, 75), this.health + 15);
                this.bandages--;
                this._healCooldown = 3;
            }
        }

        // Damage flash decay
        if (this.damageFlash > 0) this.damageFlash -= dt * 5;

        // Track bush/building state
        this.inBush = gameMap && gameMap.isInBush(this.x, this.y);
        this.inBuilding = gameMap && gameMap.isInsideBuilding(this.x, this.y);

        if (gameMap && gameMap.doors) {
            for (const door of gameMap.doors) {
                if (door.alive && distance(this.x, this.y, door.x + door.w / 2, door.y + door.h / 2) < 25) {
                    door.alive = false;
                    if (this.network) this.network.sendDoorOpened(door.id);
                }
            }
        }

        // Think periodically
        this.thinkTimer -= dt;
        if (this.thinkTimer <= 0) {
            this.thinkTimer = randBetween(this.thinkInterval);
            this.think(entities, zone, lootSystem, time, gameMap, smokeClouds);
        }

        // Execute state
        switch (this.state) {
            case STATES.ROAMING: this.doRoam(dt); break;
            case STATES.LOOTING: this.doLoot(dt, lootSystem, time); break;
            case STATES.FIGHTING: this.doFight(dt, bullets, time); break;
            case STATES.FLEEING: this.doFlee(dt, zone); break;
            case STATES.ZONE_MOVING: this.doZoneMove(dt, zone); break;
        }

        // Collide with obstacles
        for (const obs of obstacles) {
            if (obs.type === 'building' && obs.walls) {
                for (const wall of obs.walls) {
                    const result = resolveCircleRect(this.x, this.y, this.radius, wall);
                    this.x = result.x;
                    this.y = result.y;
                }
            } else if (obs.type === 'rock' && obs.alive !== false) {
                const result = resolveCircleRect(this.x, this.y, this.radius, obs);
                this.x = result.x;
                this.y = result.y;
            }
        }

        // Collide with alive doors
        if (gameMap && gameMap.doors) {
            for (const door of gameMap.doors) {
                if (!door.alive) continue;
                const result = resolveCircleRect(this.x, this.y, this.radius, door);
                this.x = result.x;
                this.y = result.y;
            }
        }

        // Clamp
        this.x = clamp(this.x, this.radius, MAP_SIZE - this.radius);
        this.y = clamp(this.y, this.radius, MAP_SIZE - this.radius);
    }

    think(entities, zone, lootSystem, time, gameMap, smokeClouds) {
        // Priority 1: Zone safety
        if (!zone.isInZone(this.x, this.y)) {
            this.state = STATES.ZONE_MOVING;
            const safe = zone.getSafeCenter();
            this.targetX = safe.x + (Math.random() - 0.5) * zone.currentRadius * 0.5;
            this.targetY = safe.y + (Math.random() - 0.5) * zone.currentRadius * 0.5;
            return;
        }

        // Priority 2: Find enemies
        let closestEnemy = null;
        let closestDist = this.sightRange;
        for (const e of entities) {
            if (e === this || !e.alive) continue;
            const d = distance(this.x, this.y, e.x, e.y);

            // Smoke blocks vision: if target is in smoke, can't see them
            if (smokeClouds) {
                let inSmoke = false;
                for (const sg of smokeClouds) {
                    if (sg.isInSmoke && sg.isInSmoke(e.x, e.y)) { inSmoke = true; break; }
                }
                if (inSmoke && d > 50) continue;
            }

            // Bush hiding: hidden targets only detectable within 40px
            if (e.inBush && e.stance && e.stance !== 'standing' && d > 40) continue;

            // Building cover: can't see targets inside buildings unless bot is in same building
            if (gameMap && e.inBuilding) {
                const targetBldg = gameMap.isInsideBuilding(e.x, e.y);
                const botBldg = this.inBuilding;
                if (targetBldg && targetBldg !== botBldg) continue;
            }

            if (d < closestDist) {
                closestDist = d;
                closestEnemy = e;
            }
        }

        if (closestEnemy && this.currentWeapon) {
            // Flee if low health (threshold varies by difficulty)
            if (this.health < this.fleeHP && closestDist < 150) {
                this.state = STATES.FLEEING;
                this.targetEntity = closestEnemy;
                // Hard bots seek cover instead of random flee
                if (this.difficulty === 'hard' && gameMap) {
                    this._seekCover(gameMap);
                }
                return;
            }
            // Fight
            if (Math.random() < this.aggression || closestDist < 100) {
                this.state = STATES.FIGHTING;
                this.targetEntity = closestEnemy;
                return;
            }
        }

        // Priority 3: Loot — smarter weapon priority for harder bots
        if (!this.currentWeapon || (this.currentWeapon && this.currentWeapon.ammo <= 0)) {
            const loot = lootSystem.findNearestLoot(this.x, this.y, 400);
            if (loot) {
                this.state = STATES.LOOTING;
                this.targetX = loot.x;
                this.targetY = loot.y;
                return;
            }
        }
        // Hard bots also seek weapon upgrades
        if (this.difficulty === 'hard' && this.currentWeapon) {
            const weaponRank = { pistol: 1, shotgun: 2, ar: 3, sniper: 4 };
            const myRank = weaponRank[this.currentWeapon.type] || 0;
            if (myRank < 3) { // Don't have AR or better
                const loot = lootSystem.findNearestLoot(this.x, this.y, 300);
                if (loot && loot.type === 'weapon' && (weaponRank[loot.weaponType] || 0) > myRank) {
                    this.state = STATES.LOOTING;
                    this.targetX = loot.x;
                    this.targetY = loot.y;
                    return;
                }
            }
        }

        // Default: Roam
        if (this.state !== STATES.ROAMING || distance(this.x, this.y, this.targetX, this.targetY) < 30) {
            this.state = STATES.ROAMING;
            // Pick random point within zone
            const safe = zone.getSafeCenter();
            const r = zone.currentRadius * 0.7;
            this.targetX = safe.x + (Math.random() - 0.5) * r;
            this.targetY = safe.y + (Math.random() - 0.5) * r;
            this.targetX = clamp(this.targetX, 50, MAP_SIZE - 50);
            this.targetY = clamp(this.targetY, 50, MAP_SIZE - 50);
        }
    }

    moveToward(tx, ty, dt, speedMult = 1) {
        const a = angle(this.x, this.y, tx, ty);
        this.angle = a;
        const wm = this._waterSpeedMult || 1;
        this.x += Math.cos(a) * this.speed * speedMult * wm * dt;
        this.y += Math.sin(a) * this.speed * speedMult * wm * dt;
    }

    doRoam(dt) {
        this.moveToward(this.targetX, this.targetY, dt, 0.7);
    }

    doLoot(dt, lootSystem, time) {
        const d = distance(this.x, this.y, this.targetX, this.targetY);
        if (d < 40) {
            const picked = lootSystem.tryPickup(this, time);
            if (picked && !picked._skipped && this.network) {
                this.network.sendItemPickedUp(picked.id);
            }
            this.state = STATES.ROAMING;
        } else {
            this.moveToward(this.targetX, this.targetY, dt);
        }
    }

    doFight(dt, bullets, time) {
        if (!this.targetEntity || !this.targetEntity.alive) {
            this.state = STATES.ROAMING;
            return;
        }

        const d = distance(this.x, this.y, this.targetEntity.x, this.targetEntity.y);
        this.angle = angle(this.x, this.y, this.targetEntity.x, this.targetEntity.y);

        // Strafe
        const strafeAngle = this.angle + Math.PI / 2 * (Math.sin(time * 2) > 0 ? 1 : -1);
        if (d > 80) {
            // Move closer
            this.x += Math.cos(this.angle) * this.speed * 0.5 * dt;
            this.y += Math.sin(this.angle) * this.speed * 0.5 * dt;
        }
        // Strafe movement
        this.x += Math.cos(strafeAngle) * this.speed * 0.3 * dt;
        this.y += Math.sin(strafeAngle) * this.speed * 0.3 * dt;

        // Shoot
        if (this.currentWeapon && !this.reloading && d < this.currentWeapon.range) {
            const w = this.currentWeapon;
            if (time - this.lastFireTime >= w.fireRate / 1000) {
                if (w.ammo <= 0) {
                    this.startReload(time);
                    return;
                }
                this.lastFireTime = time;
                w.ammo--;

                // Add inaccuracy based on bot accuracy stat
                const inaccuracy = (1 - this.accuracy) * 0.3;
                const aimAngle = this.angle + (Math.random() - 0.5) * inaccuracy;
                const muzzleX = this.x + Math.cos(aimAngle) * 20;
                const muzzleY = this.y + Math.sin(aimAngle) * 20;

                for (let i = 0; i < w.bulletsPerShot; i++) {
                    bullets.push(new Bullet(muzzleX, muzzleY, aimAngle, w, this));
                }
            }
        }
    }

    _seekCover(gameMap) {
        // Find nearest building or rock to hide behind
        let nearestCover = null, nearestDist = 500;
        for (const obs of gameMap.obstacles) {
            if (obs.type !== 'building' && obs.type !== 'rock') continue;
            const cx = obs.x + (obs.w || 0) / 2, cy = obs.y + (obs.h || 0) / 2;
            const d = distance(this.x, this.y, cx, cy);
            if (d < nearestDist) {
                nearestDist = d;
                nearestCover = obs;
            }
        }
        if (nearestCover) {
            this.targetX = nearestCover.x + (nearestCover.w || 0) / 2;
            this.targetY = nearestCover.y + (nearestCover.h || 0) / 2;
        }
    }

    doFlee(dt, zone) {
        if (this.targetEntity && this.targetEntity.alive) {
            // Hard bots: flee toward cover target if set
            if (this.difficulty === 'hard' && this.targetX && this.targetY) {
                const d = distance(this.x, this.y, this.targetX, this.targetY);
                if (d > 20) {
                    this.moveToward(this.targetX, this.targetY, dt, 1.2);
                } else {
                    this.state = STATES.ROAMING; // reached cover
                }
            } else {
                // Run away from enemy
                const a = angle(this.targetEntity.x, this.targetEntity.y, this.x, this.y);
                const safe = zone.getSafeCenter();
                const toSafe = angle(this.x, this.y, safe.x, safe.y);
                const fleeAngle = (a + toSafe) / 2;
                this.angle = fleeAngle;
                this.x += Math.cos(fleeAngle) * this.speed * 1.1 * dt;
                this.y += Math.sin(fleeAngle) * this.speed * 1.1 * dt;
            }
        } else {
            this.state = STATES.ROAMING;
        }

        // Stop fleeing after some distance
        if (this.targetEntity && distance(this.x, this.y, this.targetEntity.x, this.targetEntity.y) > 300) {
            this.state = STATES.ROAMING;
        }
    }

    doZoneMove(dt, zone) {
        this.moveToward(this.targetX, this.targetY, dt, 1.1);
        if (zone.isInZone(this.x, this.y)) {
            this.state = STATES.ROAMING;
        }
    }

    takeDamage(amount, attacker, isHeadshot = false) {
        if (!this.alive) return;
        let finalDamage = amount;

        // Tank class damage reduction
        if (this.dmgReduction > 0) finalDamage *= (1 - this.dmgReduction);

        if (isHeadshot) {
            const helmetReduction = this.helmet > 0 ? Math.min(0.5, this.helmet / 200) : 0;
            finalDamage = amount * (1 - helmetReduction);
            if (this.helmet > 0) this.helmet = Math.max(0, this.helmet - 15);
        } else {
            const armorReduction = this.armor > 0 ? Math.min(0.5, this.armor / 200) : 0;
            finalDamage = amount * (1 - armorReduction);
            if (this.armor > 0) this.armor = Math.max(0, this.armor - 10);
        }

        this.health -= finalDamage;
        this.damageFlash = 1;

        // React to being shot
        if (attacker && attacker.alive && attacker !== this) {
            this.targetEntity = attacker;
            if (this.health < 30) {
                this.state = STATES.FLEEING;
            } else if (this.currentWeapon) {
                this.state = STATES.FIGHTING;
            }
        }

        if (this.health <= 0) {
            this.health = 0;
            this.alive = false;
            if (attacker && attacker !== this) attacker.kills++;
        }
        return finalDamage;
    }

    draw(ctx) {
        if (!this.alive) return;

        const flash = this.damageFlash > 0 ? Math.min(1, this.damageFlash) : 0;
        const tc = this.tankClassData;
        const hullW = tc.hullW - 1, hullH = tc.hullH - 2;

        // Hull angle (smooth toward movement)
        if (!this._hullAngle) this._hullAngle = this.angle;
        let ad = this.angle - this._hullAngle;
        while (ad > Math.PI) ad -= Math.PI * 2;
        while (ad < -Math.PI) ad += Math.PI * 2;
        this._hullAngle += ad * 0.08;

        // Difficulty-based colors
        const hullColors = { easy: '#8a8a80', medium: '#6a6a60', hard: '#8a3030' };
        const treadColors = { easy: '#5a5a50', medium: '#4a4a40', hard: '#5a2020' };
        const turretColors = { easy: '#7a7a70', medium: '#5a5a50', hard: '#6a2020' };
        const hullColor = flash > 0 ? '#fcc' : (this.armor > 0 ? '#5a6a7a' : hullColors[this.difficulty]);
        const treadColor = flash > 0 ? '#daa' : treadColors[this.difficulty];
        const turretColor = flash > 0 ? '#ebb' : turretColors[this.difficulty];

        // Shadow
        ctx.save();
        ctx.translate(this.x + 3, this.y + 3);
        ctx.rotate(this._hullAngle + Math.PI / 2);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.beginPath();
        ctx.roundRect(-hullW / 2 - 2, -hullH / 2, hullW + 4, hullH, 3);
        ctx.fill();
        ctx.restore();

        // Hull
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this._hullAngle + Math.PI / 2);

        // Treads
        ctx.fillStyle = treadColor;
        ctx.fillRect(-hullW / 2 - 3, -hullH / 2, 3, hullH);
        ctx.fillRect(hullW / 2, -hullH / 2, 3, hullH);
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 0.5;
        for (let ty = -hullH / 2 + 3; ty < hullH / 2; ty += 4) {
            ctx.beginPath();
            ctx.moveTo(-hullW / 2 - 3, ty); ctx.lineTo(-hullW / 2, ty);
            ctx.moveTo(hullW / 2, ty); ctx.lineTo(hullW / 2 + 3, ty);
            ctx.stroke();
        }

        // Hull body
        ctx.fillStyle = hullColor;
        ctx.beginPath();
        ctx.roundRect(-hullW / 2, -hullH / 2, hullW, hullH, 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Front detail
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.beginPath();
        ctx.moveTo(0, -hullH / 2 + 2);
        ctx.lineTo(hullW / 2 - 2, -hullH / 2 + 7);
        ctx.lineTo(-hullW / 2 + 2, -hullH / 2 + 7);
        ctx.closePath();
        ctx.fill();

        ctx.restore();

        // Turret
        const turretR = this.helmet > 0 ? 6.5 : 5.5;
        ctx.beginPath();
        ctx.arc(this.x, this.y, turretR, 0, Math.PI * 2);
        ctx.fillStyle = turretColor;
        ctx.fill();
        ctx.strokeStyle = this.helmet > 0 ? '#3a5a6a' : 'rgba(0,0,0,0.25)';
        ctx.lineWidth = this.helmet > 0 ? 1.5 : 0.8;
        ctx.stroke();

        // Hard bot turret mark
        if (this.difficulty === 'hard') {
            ctx.beginPath();
            ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
            ctx.fillStyle = '#f44';
            ctx.fill();
        }

        // Barrel
        const barrelLen = this.difficulty === 'hard' ? 20 : 18;
        const barrelW = this.difficulty === 'hard' ? 3.5 : this.difficulty === 'easy' ? 2 : 2.5;
        const bex = this.x + Math.cos(this.angle) * barrelLen;
        const bey = this.y + Math.sin(this.angle) * barrelLen;
        ctx.beginPath();
        ctx.moveTo(this.x + Math.cos(this.angle) * (turretR - 1), this.y + Math.sin(this.angle) * (turretR - 1));
        ctx.lineTo(bex, bey);
        ctx.strokeStyle = this.currentWeapon ? this.currentWeapon.color : '#555';
        ctx.lineWidth = barrelW;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(bex, bey, barrelW / 2 + 0.5, 0, Math.PI * 2);
        ctx.fillStyle = '#333';
        ctx.fill();

        // Name (color-coded by difficulty)
        ctx.fillStyle = this.nameColor || '#faa';
        ctx.font = this.difficulty === 'hard' ? 'bold 10px Arial' : '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.name, this.x, this.y - 22);

        // Health bar
        const barBW = 26, barBH = 3;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(this.x - barBW / 2, this.y - 18, barBW, barBH);
        const hpPct = this.health / this.maxHealth;
        ctx.fillStyle = hpPct > 0.5 ? '#4c4' : hpPct > 0.25 ? '#cc4' : '#c44';
        ctx.fillRect(this.x - barBW / 2, this.y - 18, barBW * hpPct, barBH);
    }
}
