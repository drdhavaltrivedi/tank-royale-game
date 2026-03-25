// airdrop.js - Airdrop system with rare/legendary loot

import { MAP_SIZE, randomRange, distance } from './utils.js';
import { RARITIES } from './loot.js';

const AIRDROP_LOOT = [
    { type: 'weapon', weaponType: 'sniper', weight: 25, color: '#c4c', rarity: 'legendary', label: 'Gold Sniper' },
    { type: 'weapon', weaponType: 'ar', weight: 25, color: '#48c', rarity: 'legendary', label: 'Gold AR' },
    { type: 'armor', amount: 100, weight: 15, color: '#48f', label: 'Legendary Armor', rarity: 'legendary' },
    { type: 'helmet', amount: 100, weight: 10, color: '#8cf', label: 'Legendary Helmet', rarity: 'legendary' },
    { type: 'health', amount: 50, weight: 15, color: '#e44', label: 'Large Medkit', rarity: 'epic' },
    { type: 'ammo', amount: 60, weight: 10, color: '#ec4', label: 'Ammo Crate', rarity: 'rare' },
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

export class AirdropSystem {
    constructor() {
        this.drops = [];         // Active airdrops (falling or landed)
        this.nextDropTime = 30;  // First drop at 30s
        this.dropInterval = 45;  // Every 45s after
        this.dropCount = 0;
    }

    update(dt, gameTime, zone, lootSystem, hud) {
        // Spawn new airdrop
        if (gameTime >= this.nextDropTime) {
            this.spawnDrop(zone, hud);
            this.nextDropTime = gameTime + this.dropInterval;
            this.dropCount++;
        }

        // Update existing drops
        for (const drop of this.drops) {
            if (drop.state === 'falling') {
                drop.altitude -= dt * 80;
                drop.smokeTimer -= dt;
                if (drop.smokeTimer <= 0) {
                    drop.smokeTimer = 0.1;
                    drop.smokeParticles.push({
                        x: drop.x + (Math.random() - 0.5) * 10,
                        y: drop.y - drop.altitude + (Math.random() - 0.5) * 10,
                        life: 1.0,
                        size: 3 + Math.random() * 4
                    });
                }
                if (drop.altitude <= 0) {
                    drop.altitude = 0;
                    drop.state = 'landed';
                    drop.landTime = gameTime;
                }
            }

            // Update smoke particles
            for (let i = drop.smokeParticles.length - 1; i >= 0; i--) {
                const p = drop.smokeParticles[i];
                p.life -= dt;
                p.y -= dt * 20;
                p.size += dt * 3;
                if (p.life <= 0) drop.smokeParticles.splice(i, 1);
            }
        }
    }

    spawnDrop(zone, hud) {
        // Drop inside zone
        const safe = zone.getSafeCenter();
        const r = zone.currentRadius * 0.6;
        const x = safe.x + (Math.random() - 0.5) * r;
        const y = safe.y + (Math.random() - 0.5) * r;

        // Generate 2-3 items for this drop
        const items = [];
        const itemCount = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < itemCount; i++) {
            items.push({ ...weightedRandom(AIRDROP_LOOT) });
        }

        this.drops.push({
            x, y,
            altitude: 300,
            state: 'falling',
            items,
            opened: false,
            landTime: 0,
            smokeTimer: 0,
            smokeParticles: [],
            pulseTime: 0
        });

        hud.addNotification('AIRDROP INCOMING!');
    }

    tryOpen(entity, lootSystem, gameTime) {
        for (const drop of this.drops) {
            if (drop.state !== 'landed' || drop.opened) continue;
            if (distance(entity.x, entity.y, drop.x, drop.y) < 50) {
                drop.opened = true;
                // Add items to loot system around the crate
                for (let i = 0; i < drop.items.length; i++) {
                    const angle = (i / drop.items.length) * Math.PI * 2;
                    lootSystem.items.push({
                        ...drop.items[i],
                        x: drop.x + Math.cos(angle) * 25,
                        y: drop.y + Math.sin(angle) * 25,
                        id: Math.random(),
                        bobOffset: Math.random() * Math.PI * 2
                    });
                }
                return true;
            }
        }
        return false;
    }

    draw(ctx, camera, gameTime) {
        for (const drop of this.drops) {
            if (!camera.isVisible(drop.x, drop.y, 60)) continue;

            // Smoke particles
            for (const p of drop.smokeParticles) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(200,200,200,${p.life * 0.4})`;
                ctx.fill();
            }

            if (drop.state === 'falling') {
                // Shadow on ground
                const shadowScale = 1 - drop.altitude / 300;
                ctx.beginPath();
                ctx.ellipse(drop.x, drop.y, 15 * shadowScale, 8 * shadowScale, 0, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                ctx.fill();

                // Parachute
                const crateY = drop.y - drop.altitude;
                ctx.beginPath();
                ctx.arc(drop.x, crateY - 30, 20, Math.PI, 0);
                ctx.fillStyle = 'rgba(255,100,50,0.8)';
                ctx.fill();
                // Strings
                ctx.beginPath();
                ctx.moveTo(drop.x - 18, crateY - 25);
                ctx.lineTo(drop.x - 8, crateY);
                ctx.moveTo(drop.x + 18, crateY - 25);
                ctx.lineTo(drop.x + 8, crateY);
                ctx.strokeStyle = '#888';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Crate
                ctx.fillStyle = '#fc4';
                ctx.fillRect(drop.x - 12, crateY - 8, 24, 16);
                ctx.strokeStyle = '#a80';
                ctx.lineWidth = 2;
                ctx.strokeRect(drop.x - 12, crateY - 8, 24, 16);
            } else {
                // Landed crate
                drop.pulseTime += 0.03;

                // Beacon pulse
                const pulse = Math.sin(drop.pulseTime * 3) * 0.3 + 0.3;
                if (!drop.opened) {
                    ctx.beginPath();
                    ctx.arc(drop.x, drop.y, 30 + Math.sin(drop.pulseTime * 2) * 5, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(255,204,68,${pulse * 0.15})`;
                    ctx.fill();
                }

                // Crate body
                ctx.fillStyle = drop.opened ? '#886' : '#fc4';
                ctx.fillRect(drop.x - 14, drop.y - 10, 28, 20);
                ctx.strokeStyle = drop.opened ? '#665' : '#a80';
                ctx.lineWidth = 2;
                ctx.strokeRect(drop.x - 14, drop.y - 10, 28, 20);

                // Cross on crate
                if (!drop.opened) {
                    ctx.strokeStyle = '#a80';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(drop.x - 6, drop.y);
                    ctx.lineTo(drop.x + 6, drop.y);
                    ctx.moveTo(drop.x, drop.y - 5);
                    ctx.lineTo(drop.x, drop.y + 5);
                    ctx.stroke();

                    // "Press F" hint
                    ctx.fillStyle = 'rgba(255,255,255,0.7)';
                    ctx.font = '9px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('[F] Open', drop.x, drop.y - 16);
                }
            }
        }
    }

    drawOnMinimap(ctx, mapX, mapY, scale) {
        for (const drop of this.drops) {
            if (drop.opened) continue;
            const dx = mapX + drop.x * scale;
            const dy = mapY + drop.y * scale;
            ctx.fillStyle = '#fc4';
            ctx.fillRect(dx - 2, dy - 2, 4, 4);
        }
    }
}
