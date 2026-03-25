// loot.js - Loot spawning & pickup

import { WEAPON_TYPES } from './weapons.js';
import { randomRange, randomInt, distance, MAP_SIZE } from './utils.js';

// Rarity tiers with glow colors
export const RARITIES = {
    common:    { color: '#aaa', glowColor: 'rgba(170,170,170,0.2)', label: 'Common' },
    uncommon:  { color: '#4c4', glowColor: 'rgba(68,204,68,0.25)', label: 'Uncommon' },
    rare:      { color: '#48f', glowColor: 'rgba(68,136,255,0.3)', label: 'Rare' },
    epic:      { color: '#c4f', glowColor: 'rgba(204,68,255,0.35)', label: 'Epic' },
    legendary: { color: '#fc4', glowColor: 'rgba(255,204,68,0.4)', label: 'Legendary' },
};

export const BACKPACK_LEVELS = {
    0: { bandages: 10, medkits: 3, grenades: 3 },
    1: { bandages: 15, medkits: 5, grenades: 5 },
    2: { bandages: 20, medkits: 7, grenades: 7 },
    3: { bandages: 30, medkits: 10, grenades: 10 },
};

const LOOT_TYPES = [
    { type: 'weapon', weaponType: 'pistol', weight: 30, color: '#aaa', rarity: 'common' },
    { type: 'weapon', weaponType: 'shotgun', weight: 22, color: '#c84', rarity: 'uncommon' },
    { type: 'weapon', weaponType: 'ar', weight: 18, color: '#48c', rarity: 'rare' },
    { type: 'weapon', weaponType: 'sniper', weight: 6, color: '#c4c', rarity: 'epic' },
    { type: 'health', amount: 25, weight: 12, color: '#e44', label: 'Medkit', rarity: 'uncommon' },
    { type: 'bandage', amount: 15, weight: 18, color: '#f88', label: 'Bandage', rarity: 'common' },
    { type: 'ammo', amount: 30, weight: 25, color: '#ec4', rarity: 'common' },
    { type: 'armor', amount: 50, weight: 10, color: '#48f', label: 'Armor', rarity: 'rare' },
    { type: 'helmet', amount: 50, weight: 8, color: '#8cf', label: 'Helmet', rarity: 'rare' },
    { type: 'backpack', level: 1, weight: 8, color: '#a86', label: 'Backpack Lv.1', rarity: 'uncommon' },
    { type: 'backpack', level: 2, weight: 4, color: '#86a', label: 'Backpack Lv.2', rarity: 'rare' },
    { type: 'mine', amount: 1, weight: 6, color: '#555', label: 'Mine', rarity: 'uncommon' },
];

// Military-only loot (higher rarity)
const MILITARY_LOOT = [
    { type: 'weapon', weaponType: 'ar', weight: 30, color: '#48c', rarity: 'rare' },
    { type: 'weapon', weaponType: 'sniper', weight: 20, color: '#c4c', rarity: 'epic' },
    { type: 'armor', amount: 80, weight: 20, color: '#48f', label: 'Heavy Armor', rarity: 'epic' },
    { type: 'helmet', amount: 80, weight: 15, color: '#8cf', label: 'Heavy Helmet', rarity: 'epic' },
    { type: 'health', amount: 25, weight: 15, color: '#e44', label: 'Medkit', rarity: 'uncommon' },
    { type: 'backpack', level: 3, weight: 5, color: '#da6', label: 'Backpack Lv.3', rarity: 'epic' },
];

function weightedRandom(items) {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    let r = Math.random() * total;
    for (const item of items) {
        r -= item.weight;
        if (r <= 0) return item;
    }
    return items[items.length - 1];
}

export class LootSystem {
    constructor(gameMap) {
        this.items = [];
        this.pickupEffects = [];
        this.spawn(gameMap);
    }

    spawn(gameMap) {
        // Spawn loot around buildings - military buildings get better loot
        for (const obs of gameMap.obstacles) {
            if (obs.type !== 'building') continue;
            const count = randomInt(1, 4);
            const isMilitary = obs.locationType === 'military';
            const lootTable = isMilitary ? MILITARY_LOOT : LOOT_TYPES;
            for (let i = 0; i < count; i++) {
                const lootDef = weightedRandom(lootTable);
                this.items.push({
                    ...lootDef,
                    x: obs.x + randomRange(-20, obs.w + 20),
                    y: obs.y + randomRange(-20, obs.h + 20),
                    id: Math.random(),
                    bobOffset: Math.random() * Math.PI * 2
                });
            }
        }

        // Scatter some loot in open areas
        for (let i = 0; i < 40; i++) {
            const lootDef = weightedRandom(LOOT_TYPES);
            this.items.push({
                ...lootDef,
                x: randomRange(100, MAP_SIZE - 100),
                y: randomRange(100, MAP_SIZE - 100),
                id: Math.random(),
                bobOffset: Math.random() * Math.PI * 2
            });
        }
    }

    tryPickup(entity, time) {
        const PICKUP_RANGE = 40;
        let picked = null;

        for (let i = this.items.length - 1; i >= 0; i--) {
            const item = this.items[i];
            if (distance(entity.x, entity.y, item.x, item.y) < PICKUP_RANGE) {
                if (item.type === 'weapon') {
                    const weapon = WEAPON_TYPES[item.weaponType];
                    if (!entity.weapons[0]) {
                        entity.weapons[0] = { ...weapon, type: item.weaponType, ammo: weapon.magSize };
                        if (entity.reserveAmmo) entity.reserveAmmo[0] = weapon.magSize * 3;
                        entity.currentWeaponIdx = 0;
                    } else if (!entity.weapons[1]) {
                        entity.weapons[1] = { ...weapon, type: item.weaponType, ammo: weapon.magSize };
                        if (entity.reserveAmmo) entity.reserveAmmo[1] = weapon.magSize * 3;
                    } else {
                        const old = entity.weapons[entity.currentWeaponIdx];
                        this.items.push({
                            type: 'weapon', weaponType: old.type,
                            x: entity.x, y: entity.y, color: old.color,
                            id: Math.random(), weight: 0, bobOffset: 0
                        });
                        entity.weapons[entity.currentWeaponIdx] = { ...weapon, type: item.weaponType, ammo: weapon.magSize };
                        if (entity.reserveAmmo) entity.reserveAmmo[entity.currentWeaponIdx] = weapon.magSize * 3;
                    }
                    picked = item;
                } else if (item.type === 'health') {
                    // Medkit: instant heal if health is low, else add to inventory
                    if (entity.health < entity.maxHealth && entity.health <= 75) {
                        entity.health = Math.min(entity.maxHealth, entity.health + item.amount);
                        picked = item;
                    } else if (entity.medkits !== undefined) {
                        const maxMedkits = entity.maxMedkits || 3;
                        if (entity.medkits < maxMedkits) {
                            entity.medkits++;
                            picked = item;
                        } else {
                            // Inventory full – skip, return a special signal so caller can notify
                            picked = { ...item, _skipped: true, _reason: 'Medkit inventory full!' };
                        }
                    } else {
                        // Bot: instant heal fallback
                        if (entity.health < entity.maxHealth) {
                            entity.health = Math.min(entity.maxHealth, entity.health + item.amount);
                            picked = item;
                        }
                    }
                } else if (item.type === 'bandage') {
                    // Bandage: instant heal if health is low, else add to inventory
                    if (entity.health < 75) {
                        entity.health = Math.min(75, entity.health + item.amount);
                        picked = item;
                    } else if (entity.bandages !== undefined) {
                        const maxBandages = entity.maxBandages || 10;
                        if (entity.bandages < maxBandages) {
                            entity.bandages++;
                            picked = item;
                        } else {
                            picked = { ...item, _skipped: true, _reason: 'Bandage inventory full!' };
                        }
                    } else {
                        // Bot: instant heal fallback
                        if (entity.health < 75) {
                            entity.health = Math.min(75, entity.health + item.amount);
                            picked = item;
                        }
                    }
                } else if (item.type === 'ammo') {
                    // Add to reserve ammo for both weapon slots (any slot with the same type, or evenly)
                    const maxReserve = 200;
                    if (entity.reserveAmmo) {
                        // Fill reserve for all slots
                        let added = false;
                        for (let slot = 0; slot < entity.reserveAmmo.length; slot++) {
                            if (entity.weapons[slot] && entity.reserveAmmo[slot] < maxReserve) {
                                entity.reserveAmmo[slot] = Math.min(maxReserve, entity.reserveAmmo[slot] + item.amount);
                                added = true;
                            }
                        }
                        if (added) picked = item;
                    } else {
                        // Bot: fill current weapon ammo directly
                        const w = entity.weapons[entity.currentWeaponIdx];
                        if (w) {
                            w.ammo = Math.min(w.magSize, w.ammo + item.amount);
                            picked = item;
                        }
                    }
                } else if (item.type === 'armor') {
                    if (entity.armor !== undefined && entity.armor < 100) {
                        entity.armor = Math.min(100, entity.armor + item.amount);
                        picked = item;
                    } else if (entity.armor >= 100) {
                        picked = { ...item, _skipped: true, _reason: 'Armor is already full!' };
                    }
                } else if (item.type === 'helmet') {
                    if (entity.helmet !== undefined && entity.helmet < 100) {
                        entity.helmet = Math.min(100, entity.helmet + item.amount);
                        picked = item;
                    } else if (entity.helmet >= 100) {
                        picked = { ...item, _skipped: true, _reason: 'Helmet is already full!' };
                    }
                } else if (item.type === 'mine') {
                    if (entity.mines !== undefined && entity.mines < (entity.maxMines || 5)) {
                        entity.mines++;
                        picked = item;
                    }
                } else if (item.type === 'backpack') {
                    if (entity.backpackLevel !== undefined && entity.backpackLevel < item.level) {
                        const oldLevel = entity.backpackLevel;
                        if (entity.setBackpackLevel) entity.setBackpackLevel(item.level);
                        else entity.backpackLevel = item.level;
                        // Drop old backpack as loot
                        if (oldLevel > 0) {
                            this.items.push({
                                type: 'backpack', level: oldLevel,
                                color: oldLevel === 1 ? '#a86' : oldLevel === 2 ? '#86a' : '#da6',
                                label: `Backpack Lv.${oldLevel}`,
                                rarity: oldLevel === 1 ? 'uncommon' : oldLevel === 2 ? 'rare' : 'epic',
                                x: entity.x, y: entity.y,
                                id: Math.random(), weight: 0, bobOffset: 0
                            });
                        }
                        picked = item;
                    }
                }

                if (picked) {
                    // Only remove item and play effect if not skipped
                    if (!picked._skipped) {
                        this.items.splice(i, 1);
                        this.pickupEffects.push({ x: item.x, y: item.y, time, alpha: 1 });
                    }
                    return picked;
                }
            }
        }
        return null;
    }

    findNearestLoot(x, y, maxRange = 300) {
        let nearest = null;
        let nearestDist = maxRange;
        for (const item of this.items) {
            const d = distance(x, y, item.x, item.y);
            if (d < nearestDist) {
                nearestDist = d;
                nearest = item;
            }
        }
        return nearest;
    }

    update(time) {
        this.pickupEffects = this.pickupEffects.filter(e => {
            e.alpha -= 0.02;
            return e.alpha > 0;
        });
    }

    draw(ctx, camera, time) {
        for (const item of this.items) {
            if (!camera.isVisible(item.x, item.y, 20)) continue;
            const bob = Math.sin(time * 3 + item.bobOffset) * 3;

            // Rarity glow
            const rarityInfo = item.rarity ? RARITIES[item.rarity] : null;
            const glowSize = rarityInfo && item.rarity !== 'common' ? 18 : 14;
            ctx.beginPath();
            ctx.arc(item.x, item.y + bob, glowSize, 0, Math.PI * 2);
            ctx.fillStyle = rarityInfo ? rarityInfo.glowColor : 'rgba(255,255,255,0.1)';
            ctx.fill();
            // Rarity ring for uncommon+
            if (rarityInfo && item.rarity !== 'common') {
                ctx.beginPath();
                ctx.arc(item.x, item.y + bob, glowSize + 2, 0, Math.PI * 2);
                ctx.strokeStyle = rarityInfo.color;
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            // Item
            if (item.type === 'weapon') {
                ctx.fillStyle = item.color;
                ctx.fillRect(item.x - 10, item.y - 4 + bob, 20, 8);
                ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                ctx.lineWidth = 1;
                ctx.strokeRect(item.x - 10, item.y - 4 + bob, 20, 8);
            } else if (item.type === 'health') {
                // Medkit - red cross
                ctx.fillStyle = '#fff';
                ctx.fillRect(item.x - 8, item.y - 8 + bob, 16, 16);
                ctx.fillStyle = '#e44';
                ctx.fillRect(item.x - 6, item.y - 2 + bob, 12, 4);
                ctx.fillRect(item.x - 2, item.y - 6 + bob, 4, 12);
            } else if (item.type === 'bandage') {
                // Bandage - pink roll
                ctx.fillStyle = '#f88';
                ctx.beginPath();
                ctx.arc(item.x, item.y + bob, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fcc';
                ctx.beginPath();
                ctx.arc(item.x, item.y + bob, 3, 0, Math.PI * 2);
                ctx.fill();
            } else if (item.type === 'ammo') {
                ctx.fillStyle = '#ec4';
                ctx.fillRect(item.x - 5, item.y - 5 + bob, 10, 10);
                ctx.fillStyle = '#a84';
                ctx.fillRect(item.x - 3, item.y - 3 + bob, 6, 6);
            } else if (item.type === 'armor') {
                // Armor - blue shield
                ctx.fillStyle = '#48f';
                ctx.beginPath();
                ctx.moveTo(item.x, item.y - 8 + bob);
                ctx.lineTo(item.x + 8, item.y - 2 + bob);
                ctx.lineTo(item.x + 5, item.y + 7 + bob);
                ctx.lineTo(item.x, item.y + 10 + bob);
                ctx.lineTo(item.x - 5, item.y + 7 + bob);
                ctx.lineTo(item.x - 8, item.y - 2 + bob);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = '#26a';
                ctx.lineWidth = 1;
                ctx.stroke();
            } else if (item.type === 'helmet') {
                // Helmet - cyan dome
                ctx.fillStyle = '#8cf';
                ctx.beginPath();
                ctx.arc(item.x, item.y + bob, 7, Math.PI, 0);
                ctx.fill();
                ctx.fillRect(item.x - 8, item.y + bob, 16, 3);
                ctx.strokeStyle = '#46a';
                ctx.lineWidth = 1;
                ctx.stroke();
            } else if (item.type === 'mine') {
                ctx.fillStyle = '#555';
                ctx.beginPath();
                ctx.arc(item.x, item.y + bob, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.strokeStyle = '#f44';
                ctx.beginPath();
                ctx.moveTo(item.x - 3, item.y - 3 + bob); ctx.lineTo(item.x + 3, item.y + 3 + bob);
                ctx.moveTo(item.x + 3, item.y - 3 + bob); ctx.lineTo(item.x - 3, item.y + 3 + bob);
                ctx.stroke();
            } else if (item.type === 'backpack') {
                // Backpack - bag shape
                const c = item.color;
                ctx.fillStyle = c;
                ctx.fillRect(item.x - 6, item.y - 7 + bob, 12, 14);
                ctx.beginPath();
                ctx.arc(item.x, item.y - 7 + bob, 6, Math.PI, 0);
                ctx.fill();
                ctx.strokeStyle = 'rgba(0,0,0,0.4)';
                ctx.lineWidth = 1;
                ctx.strokeRect(item.x - 6, item.y - 7 + bob, 12, 14);
                // Level number
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 8px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(item.level, item.x, item.y + 3 + bob);
            }
        }

        // Pickup effects
        for (const e of this.pickupEffects) {
            ctx.beginPath();
            ctx.arc(e.x, e.y, 20 * (1 - e.alpha), 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255,255,255,${e.alpha})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }
}
