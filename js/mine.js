// mine.js - Land mine system

import { distance } from './utils.js';

export class Mine {
    constructor(x, y, owner) {
        this.x = x;
        this.y = y;
        this.owner = owner;
        this.alive = true;
        this.armTimer = 1.0; // seconds before active
        this.lifeTimer = 30; // despawn after 30s
        this.triggerRadius = 20;
        this.blastRadius = 80;
        this.damage = 60;
    }

    get isArmed() {
        return this.armTimer <= 0;
    }

    update(dt, entities, particles, damageNumbers, camera, audio) {
        if (!this.alive) return false;

        this.armTimer -= dt;
        this.lifeTimer -= dt;

        if (this.lifeTimer <= 0) {
            this.alive = false;
            return false;
        }

        // Check trigger
        if (this.isArmed) {
            for (const e of entities) {
                if (!e.alive || e === this.owner) continue;
                if (distance(e.x, e.y, this.x, this.y) < this.triggerRadius) {
                    this.explode(entities, particles, damageNumbers, camera, audio);
                    return true; // exploded
                }
            }
        }

        return false;
    }

    explode(entities, particles, damageNumbers, camera, audio) {
        this.alive = false;

        // Damage entities in blast radius
        for (const entity of entities) {
            if (!entity.alive) continue;
            const d = distance(this.x, this.y, entity.x, entity.y);
            if (d < this.blastRadius) {
                const falloff = 1 - (d / this.blastRadius);
                const dmg = this.damage * falloff;
                const actual = entity.takeDamage(dmg, this.owner);
                damageNumbers.push({
                    x: entity.x + (Math.random() - 0.5) * 10,
                    y: entity.y - 20,
                    value: Math.round(actual || dmg),
                    isHeadshot: false,
                    life: 1.0,
                    vy: -40
                });
            }
        }

        // Explosion particles
        for (let i = 0; i < 15; i++) {
            const a = (i / 15) * Math.PI * 2;
            const speed = 60 + Math.random() * 100;
            particles.push({
                x: this.x, y: this.y,
                vx: Math.cos(a) * speed,
                vy: Math.sin(a) * speed,
                life: 0.5 + Math.random() * 0.3,
                color: Math.random() < 0.4 ? '#f84' : '#ff4',
                size: 2 + Math.random() * 3
            });
        }
        // Dirt/debris
        for (let i = 0; i < 8; i++) {
            particles.push({
                x: this.x + (Math.random() - 0.5) * 20,
                y: this.y + (Math.random() - 0.5) * 20,
                vx: (Math.random() - 0.5) * 50,
                vy: (Math.random() - 0.5) * 50,
                life: 0.8 + Math.random() * 0.3,
                color: '#654',
                size: 2 + Math.random() * 2
            });
        }

        if (camera) camera.shake(8);
        if (audio) audio.playExplosion();
    }

    draw(ctx) {
        if (!this.alive) return;

        const alpha = this.isArmed ? 0.6 : 0.3;

        // Mine body - small dark circle
        ctx.beginPath();
        ctx.arc(this.x, this.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(60,60,60,${alpha})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(30,30,30,${alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Center dot (red when armed)
        if (this.isArmed) {
            const blink = Math.sin(Date.now() * 0.005) > 0;
            if (blink) {
                ctx.beginPath();
                ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,50,50,0.7)';
                ctx.fill();
            }
        }

        // Trigger radius hint (very faint)
        if (this.isArmed) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.triggerRadius, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,50,50,0.05)';
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }
    }
}
