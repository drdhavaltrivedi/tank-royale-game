// player.js - Player class (movement, shooting, health)

import { clamp, angle, MAP_SIZE } from './utils.js';
import { Bullet, WEAPON_TYPES } from './weapons.js';
import { resolveCircleRect } from './collision.js';
import { BACKPACK_LEVELS } from './loot.js';

// Movement states
const STANCE = { STANDING: 'standing', CROUCHING: 'crouching', PRONE: 'prone' };

export const TANK_CLASSES = {
    light:  { name: 'Light',  speed: 260, hp: 80,  dmgMult: 0.8, radius: 12, hullW: 14, hullH: 18, boostMult: 1.5, dmgReduction: 0, color: '#6aaa50', treadColor: '#4a7a30' },
    medium: { name: 'Medium', speed: 200, hp: 100, dmgMult: 1.0, radius: 14, hullW: 16, hullH: 22, boostMult: 1.3, dmgReduction: 0, color: '#5a8a40', treadColor: '#3a5a2a' },
    heavy:  { name: 'Heavy',  speed: 140, hp: 150, dmgMult: 1.2, radius: 16, hullW: 20, hullH: 26, boostMult: 1.15, dmgReduction: 0.25, color: '#4a7a3a', treadColor: '#2a4a1a' },
};

export class Player {
    constructor(x, y, tankClass = 'medium') {
        this.x = x;
        this.y = y;

        // Tank class
        this.tankClass = tankClass;
        const tc = TANK_CLASSES[tankClass] || TANK_CLASSES.medium;
        this.tankClassData = tc;
        this.radius = tc.radius;
        this.speed = tc.speed;
        this.health = tc.hp;
        this.maxHealth = tc.hp;
        this.damageMult = tc.dmgMult;
        this.dmgReduction = tc.dmgReduction;
        this.boostMult = tc.boostMult;

        this.alive = true;
        this.angle = 0;
        this.name = 'You';
        this.isPlayer = true;

        // Weapons: 2 slots - start with AR + Pistol
        const ar = WEAPON_TYPES.ar;
        const pistol = WEAPON_TYPES.pistol;
        this.weapons = [
            { ...ar, type: 'ar', ammo: ar.magSize },
            { ...pistol, type: 'pistol', ammo: pistol.magSize }
        ];
        // Reserve ammo per slot (ammo not yet in magazine)
        this.reserveAmmo = [90, 60]; // slot0=ar reserve, slot1=pistol reserve
        this.currentWeaponIdx = 0;
        this.lastFireTime = 0;
        this.reloading = false;
        this.reloadStartTime = 0;

        this.kills = 0;
        this.damageFlash = 0;

        // Armor system
        this.armor = 0;
        this.helmet = 0;

        // Recoil bloom
        this.currentSpread = 0;

        // Movement state
        this.stance = STANCE.STANDING;
        this.sprinting = false;
        this.stamina = 100;
        this.maxStamina = 100;
        this.inWater = false;

        // Footstep timer
        this.footstepTimer = 0;
        this.isMoving = false;

        // Bush hiding / building cover
        this.inBush = null;
        this.inBuilding = null;

        // Vehicle
        this.inVehicle = null;

        // Movement smoothing
        this.vx = 0;
        this.vy = 0;

        // Weapon sway
        this.swayAngle = 0;
        this.swayTime = 0;

        // Muzzle flash
        this.muzzleFlash = 0;

        // Backpack
        this.backpackLevel = 0;
        this.maxGrenades = 3;

        // Grenades
        this.grenades = 3;
        this.smokeGrenades = 2;

        // Mines
        this.mines = 2;
        this.maxMines = 5;

        // Kill upgrades (reset on death)
        this.killUpgradeLevel = 0;
        this.reloadMult = 1;
        this.speedBonus = 0;
        this.damageBonus = 0;

        // DBNO (Down But Not Out)
        this.isDBNO = false;
        this.dbnoTimer = 0;
        this.dbnoMaxTime = 15; // 15 seconds to be revived (bots auto-die)

        // Healing inventory (PUBG-style hold-to-heal)
        this.bandages = 0;
        this.medkits = 0;
        this.maxBandages = 10;
        this.maxMedkits = 3;

        // Healing state
        this.isHealing = false;
        this.healType = null;       // 'bandage' or 'medkit'
        this.healProgress = 0;      // 0 to 1
        this.healDuration = 0;      // seconds to complete
        this.healAmount = 0;        // HP to restore
        this.healMaxHP = 0;         // max HP this heal can reach
    }

    startHealing(type) {
        if (this.isHealing || !this.alive) return false;
        if (this.sprinting) return false;

        if (type === 'bandage') {
            if (this.bandages <= 0 || this.health >= 75) return false;
            this.healType = 'bandage';
            this.healDuration = 3;    // 3 seconds
            this.healAmount = 15;
            this.healMaxHP = 75;
            this.bandages--;
        } else if (type === 'medkit') {
            if (this.medkits <= 0 || this.health >= this.maxHealth) return false;
            this.healType = 'medkit';
            this.healDuration = 6;    // 6 seconds
            this.healAmount = 100;    // full heal
            this.healMaxHP = this.maxHealth;
            this.medkits--;
        } else {
            return false;
        }

        this.isHealing = true;
        this.healProgress = 0;
        return true;
    }

    cancelHealing() {
        if (!this.isHealing) return;
        // Refund the item
        if (this.healType === 'bandage') this.bandages++;
        else if (this.healType === 'medkit') this.medkits++;
        this.isHealing = false;
        this.healType = null;
        this.healProgress = 0;
    }

    updateHealing(dt) {
        if (!this.isHealing) return;

        // Cancel if sprinting or moving fast
        if (this.sprinting) { this.cancelHealing(); return; }

        this.healProgress += dt / this.healDuration;
        if (this.healProgress >= 1) {
            // Apply heal
            this.health = Math.min(this.healMaxHP, this.health + this.healAmount);
            this.isHealing = false;
            this.healType = null;
            this.healProgress = 0;
            return true; // completed
        }
        return false;
    }

    setBackpackLevel(level) {
        this.backpackLevel = level;
        const limits = BACKPACK_LEVELS[level] || BACKPACK_LEVELS[0];
        this.maxBandages = limits.bandages;
        this.maxMedkits = limits.medkits;
        this.maxGrenades = limits.grenades;
    }

    applyKillUpgrade() {
        this.killUpgradeLevel = Math.min(5, this.killUpgradeLevel + 1);
        const UPGRADES = [
            null, // 0 kills
            { name: 'Fast Reload', apply: () => { this.reloadMult = 0.8; } },
            { name: 'Reinforced', apply: () => { this.armor = Math.min(100, this.armor + 20); } },
            { name: 'Overcharge', apply: () => { this.damageBonus = 0.15; } },
            { name: 'Nitro Boost', apply: () => { this.speedBonus = this.speed * 0.15; } },
            { name: 'Juggernaut', apply: () => { this.maxHealth += 50; this.health += 50; this.reloadMult = 0.6; this.damageBonus = 0.3; this.speedBonus = this.speed * 0.3; } },
        ];
        const upgrade = UPGRADES[this.killUpgradeLevel];
        if (upgrade) {
            upgrade.apply();
            return upgrade.name;
        }
        return null;
    }

    get isHidden() {
        return this.inBush && this.stance !== 'standing';
    }

    get currentWeapon() {
        return this.weapons[this.currentWeaponIdx];
    }

    getSpeedMultiplier() {
        let mult = 1;

        // Stance modifiers
        if (this.stance === STANCE.CROUCHING) mult *= 0.55;
        else if (this.stance === STANCE.PRONE) mult *= 0.3;

        // Boost (uses class-specific boost multiplier)
        if (this.sprinting && this.stance === STANCE.STANDING) mult *= this.boostMult || 1.3;

        // Water
        if (this.inWater) mult *= 0.5;

        // Kill upgrade speed bonus
        if (this.speedBonus > 0) mult *= 1 + (this.speedBonus / this.speed);

        return mult;
    }

    getEffectiveRadius() {
        if (this.stance === STANCE.CROUCHING) return 11;
        if (this.stance === STANCE.PRONE) return 8;
        return 14;
    }

    update(dt, input, camera, obstacles, time, gameMap) {
        if (!this.alive) return;

        // Vehicle handling
        if (this.inVehicle) {
            this.updateInVehicle(dt, input, camera, obstacles, gameMap);
            return;
        }

        // Stance changes (toggle on press)
        if (input.wasPressed('c')) {
            if (this.stance !== STANCE.CROUCHING) {
                this.stance = STANCE.CROUCHING;
                this.sprinting = false;
            } else {
                this.stance = STANCE.STANDING;
            }
        }
        if (input.wasPressed('z')) {
            if (this.stance !== STANCE.PRONE) {
                this.stance = STANCE.PRONE;
                this.sprinting = false;
            } else {
                this.stance = STANCE.STANDING;
            }
        }

        // Sprint (only when standing and moving forward)
        const wantsSprint = input.isKeyDown('shift');
        if (wantsSprint && this.stance === STANCE.STANDING && this.stamina > 0) {
            this.sprinting = true;
        } else {
            this.sprinting = false;
        }

        // Stamina
        if (this.sprinting && this.isMoving) {
            this.stamina -= dt * 25;
            if (this.stamina <= 0) {
                this.stamina = 0;
                this.sprinting = false;
            }
        } else {
            this.stamina = Math.min(this.maxStamina, this.stamina + dt * 15);
        }

        // Movement
        let mx = 0, my = 0;
        if (input.isKeyDown('w') || input.isKeyDown('arrowup')) my = -1;
        if (input.isKeyDown('s') || input.isKeyDown('arrowdown')) my = 1;
        if (input.isKeyDown('a') || input.isKeyDown('arrowleft')) mx = -1;
        if (input.isKeyDown('d') || input.isKeyDown('arrowright')) mx = 1;

        if (input.joystick.active) {
            mx = input.joystick.dx;
            my = input.joystick.dy;
        }

        if (mx !== 0 && my !== 0 && !input.joystick.active) {
            mx *= 0.707;
            my *= 0.707;
        }

        this.isMoving = mx !== 0 || my !== 0;

        // Water check
        this.inWater = gameMap && gameMap.isInWater(this.x, this.y);
        this.inBush = gameMap && gameMap.isInBush(this.x, this.y);
        this.inBuilding = gameMap && gameMap.isInsideBuilding(this.x, this.y);
        const speedMult = this.getSpeedMultiplier();
        this.radius = this.getEffectiveRadius();

        // Smooth acceleration/deceleration
        const targetVx = mx * this.speed * speedMult;
        const targetVy = my * this.speed * speedMult;
        const accel = this.isMoving ? 12 : 18; // faster deceleration
        this.vx += (targetVx - this.vx) * Math.min(1, accel * dt);
        this.vy += (targetVy - this.vy) * Math.min(1, accel * dt);

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Weapon sway
        this.swayTime += dt;
        if (this.isMoving) {
            const swaySpeed = this.sprinting ? 8 : 4;
            const swayAmount = this.sprinting ? 0.03 : 0.015;
            this.swayAngle = Math.sin(this.swayTime * swaySpeed) * swayAmount;
        } else {
            this.swayAngle *= 0.9; // settle
        }

        // Collide with obstacles
        for (const obs of obstacles) {
            if (obs.type === 'building' && obs.walls) {
                // Collide with wall segments instead of solid building
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

        // Clamp to map
        this.x = clamp(this.x, this.radius, MAP_SIZE - this.radius);
        this.y = clamp(this.y, this.radius, MAP_SIZE - this.radius);

        // Aiming
        const mouseWorld = input.getMouseWorld(camera);
        this.angle = angle(this.x, this.y, mouseWorld.x, mouseWorld.y);

        // Weapon switch
        if (input.isKeyDown('1')) this.currentWeaponIdx = 0;
        if (input.isKeyDown('2')) this.currentWeaponIdx = 1;
        if (input.wasPressed('q')) {
            this.currentWeaponIdx = this.currentWeaponIdx === 0 ? 1 : 0;
        }
        if (input.mouse.wheel !== 0) {
            this.currentWeaponIdx = this.currentWeaponIdx === 0 ? 1 : 0;
            input.mouse.wheel = 0; // Consume the wheel input
        }

        // Reload
        if (input.isKeyDown('r') && this.currentWeapon && !this.reloading) {
            this.startReload(time);
        }
        if (this.reloading && this.currentWeapon) {
            if (time - this.reloadStartTime >= this.currentWeapon.reloadTime / 1000) {
                const w = this.currentWeapon;
                const reserve = this.reserveAmmo ? (this.reserveAmmo[this.currentWeaponIdx] || 0) : Infinity;
                const needed = w.magSize - w.ammo;
                const take = Math.min(needed, reserve);
                w.ammo += take;
                if (this.reserveAmmo) {
                    this.reserveAmmo[this.currentWeaponIdx] = Math.max(0, reserve - take);
                }
                this.reloading = false;
            }
        }

        // Damage flash decay
        if (this.damageFlash > 0) this.damageFlash -= dt * 5;

        // Muzzle flash decay
        if (this.muzzleFlash > 0) this.muzzleFlash -= dt * 15;

        // Recoil bloom recovery (faster when crouching)
        const bloomRecovery = this.stance === STANCE.CROUCHING ? 0.25 : this.stance === STANCE.PRONE ? 0.35 : 0.15;
        if (this.currentSpread > 0) this.currentSpread = Math.max(0, this.currentSpread - dt * bloomRecovery);

        // Healing update
        this.updateHealing(dt);

        // Footstep timer
        if (this.isMoving) {
            const stepInterval = this.sprinting ? 0.25 : this.stance === STANCE.CROUCHING ? 0.6 : this.stance === STANCE.PRONE ? 0.8 : 0.4;
            this.footstepTimer -= dt;
            if (this.footstepTimer <= 0) {
                this.footstepTimer = stepInterval;
                this._footstepReady = true;
            }
        }
    }

    updateInVehicle(dt, input, camera, obstacles, gameMap) {
        const v = this.inVehicle;

        // Steering
        let turnInput = 0;
        if (input.isKeyDown('a') || input.isKeyDown('arrowleft')) turnInput = -1;
        if (input.isKeyDown('d') || input.isKeyDown('arrowright')) turnInput = 1;

        // Accelerate/brake
        let accelInput = 0;
        if (input.isKeyDown('w') || input.isKeyDown('arrowup')) accelInput = 1;
        if (input.isKeyDown('s') || input.isKeyDown('arrowdown')) accelInput = -0.5;

        // Update vehicle
        v.steer(turnInput, dt);
        v.accelerate(accelInput, dt);
        v.update(dt, obstacles, gameMap);

        // Sync player position to vehicle
        this.x = v.x;
        this.y = v.y;
        this.angle = v.angle;
        this.sprinting = false; // Need this so we can shoot!

        // Exit vehicle (E key)
        if (input.wasPressed('e')) {
            // Place player beside vehicle
            const exitAngle = v.angle + Math.PI / 2;
            this.x = v.x + Math.cos(exitAngle) * 30;
            this.y = v.y + Math.sin(exitAngle) * 30;
            v.occupied = false;
            this.inVehicle = null;
            input.justPressed['e'] = false; // Consume input to prevent instant re-entry
        }

        // Aiming from vehicle
        const mouseWorld = input.getMouseWorld(camera);
        this.angle = angle(this.x, this.y, mouseWorld.x, mouseWorld.y);

        // Clamp
        this.x = clamp(this.x, 30, MAP_SIZE - 30);
        this.y = clamp(this.y, 30, MAP_SIZE - 30);
    }

    startReload(time) {
        const w = this.currentWeapon;
        const reserve = this.reserveAmmo ? (this.reserveAmmo[this.currentWeaponIdx] || 0) : Infinity;
        if (w && w.ammo < w.magSize && reserve > 0) {
            this.reloading = true;
            this.reloadStartTime = time;
        }
    }

    tryShoot(input, time, bullets, camera) {
        if (!this.alive || !this.currentWeapon || this.reloading) return;
        // Can't shoot while sprinting
        if (this.sprinting) return;

        if (input.mouse.down || input.isButtonPressed('fire')) {
            const w = this.currentWeapon;
            if (time - this.lastFireTime >= w.fireRate / 1000) {
                if (w.ammo <= 0) {
                    const reserve = this.reserveAmmo ? (this.reserveAmmo[this.currentWeaponIdx] || 0) : 0;
                    if (reserve > 0) {
                        this.startReload(time);
                    } else {
                        // Auto-switch weapon if current is empty and no reserve
                        const otherIdx = this.currentWeaponIdx === 0 ? 1 : 0;
                        const otherW = this.weapons[otherIdx];
                        if (otherW && (otherW.ammo > 0 || (this.reserveAmmo && this.reserveAmmo[otherIdx] > 0))) {
                            this.currentWeaponIdx = otherIdx;
                        } else {
                             this.startReload(time); // Try anyway
                        }
                    }
                    return;
                }
                this.lastFireTime = time;
                w.ammo--;

                const aimAngle = this.angle + this.swayAngle;
                const muzzleX = this.x + Math.cos(aimAngle) * 20;
                const muzzleY = this.y + Math.sin(aimAngle) * 20;

                // Muzzle flash
                this.muzzleFlash = 1;

                // Stance affects accuracy
                let stanceSpreadMult = 1;
                if (this.stance === STANCE.CROUCHING) stanceSpreadMult = 0.6;
                if (this.stance === STANCE.PRONE) stanceSpreadMult = 0.4;

                const totalSpread = (w.spread + this.currentSpread) * stanceSpreadMult;
                for (let i = 0; i < w.bulletsPerShot; i++) {
                    bullets.push(new Bullet(muzzleX, muzzleY, aimAngle, w, this, totalSpread));
                }

                this.currentSpread += w.spreadIncrease || 0;
                this.currentSpread = Math.min(this.currentSpread, 0.15);
                if (camera && w.recoil) camera.shake(w.recoil * 30 * stanceSpreadMult);
            }
        }
    }

    takeDamage(amount, attacker, isHeadshot = false) {
        if (!this.alive) return;
        // Cancel healing when hit
        if (this.isHealing) this.cancelHealing();
        let finalDamage = amount;

        // Stance reduces damage
        if (this.stance === STANCE.PRONE) finalDamage *= 0.85;
        else if (this.stance === STANCE.CROUCHING) finalDamage *= 0.92;

        // Tank class damage reduction (Heavy)
        if (this.dmgReduction > 0) finalDamage *= (1 - this.dmgReduction);

        if (isHeadshot) {
            const helmetReduction = this.helmet > 0 ? Math.min(0.5, this.helmet / 200) : 0;
            finalDamage = finalDamage * (1 - helmetReduction);
            if (this.helmet > 0) this.helmet = Math.max(0, this.helmet - 15);
        } else {
            const armorReduction = this.armor > 0 ? Math.min(0.5, this.armor / 200) : 0;
            finalDamage = finalDamage * (1 - armorReduction);
            if (this.armor > 0) this.armor = Math.max(0, this.armor - 10);
        }

        this.health -= finalDamage;
        this.damageFlash = 1;
        if (this.health <= 0) {
            this.health = 0;
            this.alive = false;
            if (attacker && attacker !== this) attacker.kills++;
        }
        return finalDamage;
    }

    draw(ctx) {
        if (!this.alive) return;

        // Hidden in bush - reduce opacity
        if (this.isHidden) {
            ctx.save();
            ctx.globalAlpha = 0.4;
        }

        // Vehicle synchronization: we draw the vehicle ourselves if we are in it
        if (this.inVehicle) {
            this.inVehicle.draw(ctx);
            // Player dot on vehicle
            ctx.beginPath();
            ctx.arc(this.x, this.y, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#e8c840';
            ctx.fill();
            return;
        }

        const r = this.radius;
        const flash = this.damageFlash > 0 ? Math.min(1, this.damageFlash) : 0;
        const aimAngle = this.angle + this.swayAngle;
        const isSiege = this.stance === STANCE.PRONE;
        const isHullDown = this.stance === STANCE.CROUCHING;

        // Hull direction = movement direction (smooth toward aim)
        if (!this._hullAngle) this._hullAngle = aimAngle;
        let angleDiff = aimAngle - this._hullAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        this._hullAngle += angleDiff * 0.08;

        const tc = this.tankClassData;
        const hullW = isHullDown ? tc.hullW - 2 : tc.hullW;
        const hullH = isHullDown ? tc.hullH - 2 : tc.hullH;

        // === SHADOW ===
        ctx.save();
        ctx.translate(this.x + 3, this.y + 3);
        ctx.rotate(this._hullAngle + Math.PI / 2);
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.roundRect(-hullW / 2 - 2, -hullH / 2, hullW + 4, hullH, 3);
        ctx.fill();
        ctx.restore();

        // === HULL (rotated to hull direction) ===
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this._hullAngle + Math.PI / 2);

        const hullColor = flash > 0 ? '#ffa' : (this.armor > 0 ? '#4a7a5a' : tc.color);

        // Treads (left & right)
        ctx.fillStyle = flash > 0 ? '#aa8' : tc.treadColor;
        ctx.fillRect(-hullW / 2 - 3, -hullH / 2, 3, hullH);  // left tread
        ctx.fillRect(hullW / 2, -hullH / 2, 3, hullH);        // right tread
        // Tread detail lines
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
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
        ctx.roundRect(-hullW / 2, -hullH / 2, hullW, hullH, 3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Hull front detail (arrow shape)
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.beginPath();
        ctx.moveTo(0, -hullH / 2 + 2);
        ctx.lineTo(hullW / 2 - 2, -hullH / 2 + 8);
        ctx.lineTo(-hullW / 2 + 2, -hullH / 2 + 8);
        ctx.closePath();
        ctx.fill();

        // Armor indicator (blue stripe when armored)
        if (this.armor > 0) {
            ctx.fillStyle = `rgba(60,120,200,${0.2 + this.armor / 300})`;
            ctx.fillRect(-hullW / 2 + 2, -hullH / 2 + 1, hullW - 4, 3);
        }

        // Storage rack on back (backpack)
        if (this.backpackLevel > 0) {
            const rackW = 6 + this.backpackLevel * 2;
            ctx.fillStyle = this.backpackLevel === 3 ? '#da6' : this.backpackLevel === 2 ? '#86a' : '#a86';
            ctx.fillRect(-rackW / 2, hullH / 2 - 5, rackW, 4);
            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(-rackW / 2, hullH / 2 - 5, rackW, 4);
        }

        // Hull-down indicator
        if (isHullDown) {
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(-hullW / 2 - 1, -hullH / 2 - 1, hullW + 2, hullH + 2, 4);
            ctx.stroke();
        }

        ctx.restore();

        // === TURRET (rotated to aim direction) ===
        ctx.save();
        ctx.translate(this.x, this.y);

        // Turret base
        const turretR = this.helmet > 0 ? 7 : 6;
        ctx.beginPath();
        ctx.arc(0, 0, turretR, 0, Math.PI * 2);
        ctx.fillStyle = flash > 0 ? '#ee8' : '#4a6a30';
        ctx.fill();
        ctx.strokeStyle = this.helmet > 0 ? '#3a6a8a' : 'rgba(0,0,0,0.3)';
        ctx.lineWidth = this.helmet > 0 ? 2 : 1;
        ctx.stroke();

        // Turret center dot
        ctx.beginPath();
        ctx.arc(0, 0, 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fill();

        ctx.restore();

        // === BARREL (world space, aim direction) ===
        const barrelLen = isSiege ? 24 : 20;
        const barrelW = isSiege ? 4 : 3;
        const barrelStartDist = turretR - 1;
        const bsx = this.x + Math.cos(aimAngle) * barrelStartDist;
        const bsy = this.y + Math.sin(aimAngle) * barrelStartDist;
        const bex = this.x + Math.cos(aimAngle) * barrelLen;
        const bey = this.y + Math.sin(aimAngle) * barrelLen;

        ctx.beginPath();
        ctx.moveTo(bsx, bsy);
        ctx.lineTo(bex, bey);
        ctx.strokeStyle = this.currentWeapon ? this.currentWeapon.color : '#555';
        ctx.lineWidth = barrelW;
        ctx.stroke();
        // Barrel tip
        ctx.beginPath();
        ctx.arc(bex, bey, barrelW / 2 + 0.5, 0, Math.PI * 2);
        ctx.fillStyle = '#333';
        ctx.fill();

        // === MUZZLE FLASH ===
        if (this.muzzleFlash > 0) {
            const flashSize = 5 + this.muzzleFlash * 8;
            const fx = bex + Math.cos(aimAngle) * 3;
            const fy = bey + Math.sin(aimAngle) * 3;
            ctx.beginPath();
            ctx.arc(fx, fy, flashSize, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,200,50,${this.muzzleFlash * 0.8})`;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(fx, fy, flashSize * 0.4, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,200,${this.muzzleFlash})`;
            ctx.fill();
        }

        // === EXHAUST when sprinting ===
        if (this.sprinting && this.isMoving) {
            const backAngle = this._hullAngle + Math.PI;
            for (let i = 0; i < 3; i++) {
                const ox = (Math.random() - 0.5) * 6;
                const sx = this.x + Math.cos(backAngle) * (r + 5) + Math.cos(backAngle + Math.PI / 2) * ox;
                const sy = this.y + Math.sin(backAngle) * (r + 5) + Math.sin(backAngle + Math.PI / 2) * ox;
                ctx.beginPath();
                ctx.arc(sx, sy, 2 + Math.random() * 2, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(100,100,100,0.3)';
                ctx.fill();
            }
        }

        // Name tag
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        const nameY = this.stance === STANCE.PRONE ? this.y - 16 : this.y - 22;
        ctx.fillText(this.name, this.x, nameY);

        // Stance indicator
        if (this.stance !== STANCE.STANDING) {
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = '8px Arial';
            ctx.fillText(this.stance === STANCE.CROUCHING ? 'CROUCH' : 'PRONE', this.x, nameY - 10);
        }

        // Armor bar
        const barW = 30;
        const barH = 3;
        const barBaseY = this.stance === STANCE.PRONE ? this.y - 12 : this.y - 18;

        if (this.armor > 0) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(this.x - barW / 2, barBaseY - 4, barW, barH);
            ctx.fillStyle = '#48f';
            ctx.fillRect(this.x - barW / 2, barBaseY - 4, barW * (this.armor / 100), barH);
        }

        if (this.helmet > 0) {
            ctx.fillStyle = '#8cf';
            ctx.font = 'bold 8px Arial';
            ctx.textAlign = 'right';
            ctx.fillText('H', this.x + barW / 2 + 8, barBaseY);
        }

        // Health bar
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(this.x - barW / 2, barBaseY, barW, barH + 1);
        const hpPct = this.health / this.maxHealth;
        ctx.fillStyle = hpPct > 0.5 ? '#4c4' : hpPct > 0.25 ? '#cc4' : '#c44';
        ctx.fillRect(this.x - barW / 2, barBaseY, barW * hpPct, barH + 1);

        // Restore alpha if hidden
        if (this.isHidden) {
            ctx.restore();
        }
    }
}
