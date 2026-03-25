// grenade.js - Grenade/throwable system (frag + smoke)

import { distance } from './utils.js';

export class SmokeGrenade {
    constructor(x, y, angle, power, owner) {
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * power;
        this.vy = Math.sin(angle) * power;
        this.owner = owner;
        this.fuseTime = 1.5;
        this.alive = true;
        this.radius = 4;
        this.smokeRadius = 100;
        this.smokeDuration = 8;
        this.smokeTimer = 0;
        this.isSmoking = false;
        this.trail = [];
        this.smokeParticles = [];
    }

    update(dt) {
        if (!this.alive) return false;

        if (!this.isSmoking) {
            // Flying phase
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            this.vx *= 0.97;
            this.vy *= 0.97;
            this.trail.push({ x: this.x, y: this.y, life: 0.3 });
            if (this.trail.length > 15) this.trail.shift();
            for (let i = this.trail.length - 1; i >= 0; i--) {
                this.trail[i].life -= dt;
                if (this.trail[i].life <= 0) this.trail.splice(i, 1);
            }
            this.fuseTime -= dt;
            if (this.fuseTime <= 0) {
                this.isSmoking = true;
                this.smokeTimer = this.smokeDuration;
            }
        } else {
            // Smoking phase
            this.smokeTimer -= dt;
            // Generate smoke particles
            if (Math.random() < 0.3) {
                const angle = Math.random() * Math.PI * 2;
                const dist = Math.random() * this.smokeRadius;
                this.smokeParticles.push({
                    x: this.x + Math.cos(angle) * dist,
                    y: this.y + Math.sin(angle) * dist,
                    life: 1.5 + Math.random(),
                    size: 15 + Math.random() * 25,
                    alpha: 0.3 + Math.random() * 0.3
                });
            }
            // Update smoke particles
            for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
                this.smokeParticles[i].life -= dt;
                this.smokeParticles[i].y -= dt * 5; // drift up
                if (this.smokeParticles[i].life <= 0) this.smokeParticles.splice(i, 1);
            }
            if (this.smokeTimer <= 0) {
                this.alive = false;
                return true; // done
            }
        }
        return false;
    }

    isInSmoke(px, py) {
        if (!this.isSmoking) return false;
        return distance(px, py, this.x, this.y) < this.smokeRadius;
    }

    draw(ctx) {
        if (!this.alive) return;

        // Smoke cloud
        if (this.isSmoking) {
            for (const p of this.smokeParticles) {
                const fade = Math.min(1, p.life / 0.5);
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(200,200,200,${p.alpha * fade})`;
                ctx.fill();
            }
            // Outer boundary hint
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.smokeRadius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(180,180,180,${0.08 * (this.smokeTimer / this.smokeDuration)})`;
            ctx.fill();
        }

        // Trail (while flying)
        if (!this.isSmoking) {
            for (const t of this.trail) {
                ctx.beginPath();
                ctx.arc(t.x, t.y, 2, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(200,200,200,${t.life})`;
                ctx.fill();
            }
            // Body
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = '#aaa';
            ctx.fill();
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }
}

export class Grenade {
    constructor(x, y, angle, power, owner) {
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * power;
        this.vy = Math.sin(angle) * power;
        this.owner = owner;
        this.fuseTime = 2.5; // seconds until explosion
        this.alive = true;
        this.radius = 4;
        this.blastRadius = 120;
        this.damage = 80;
        this.trail = [];
    }

    update(dt) {
        if (!this.alive) return;

        // Move with friction
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vx *= 0.97;
        this.vy *= 0.97;

        // Trail
        this.trail.push({ x: this.x, y: this.y, life: 0.3 });
        if (this.trail.length > 15) this.trail.shift();

        // Fuse countdown
        this.fuseTime -= dt;
        if (this.fuseTime <= 0) {
            return true; // Signal explosion
        }

        // Update trail
        for (let i = this.trail.length - 1; i >= 0; i--) {
            this.trail[i].life -= dt;
            if (this.trail[i].life <= 0) this.trail.splice(i, 1);
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
        for (let i = 0; i < 20; i++) {
            const a = (i / 20) * Math.PI * 2;
            const speed = 80 + Math.random() * 120;
            particles.push({
                x: this.x, y: this.y,
                vx: Math.cos(a) * speed,
                vy: Math.sin(a) * speed,
                life: 0.6 + Math.random() * 0.3,
                color: Math.random() < 0.5 ? '#f84' : '#ff4',
                size: 3 + Math.random() * 3
            });
        }
        // Smoke
        for (let i = 0; i < 8; i++) {
            particles.push({
                x: this.x + (Math.random() - 0.5) * 20,
                y: this.y + (Math.random() - 0.5) * 20,
                vx: (Math.random() - 0.5) * 30,
                vy: (Math.random() - 0.5) * 30 - 20,
                life: 1.0 + Math.random() * 0.5,
                color: '#888',
                size: 5 + Math.random() * 5
            });
        }

        camera.shake(12);
    }

    draw(ctx) {
        if (!this.alive) return;

        // Trail
        for (const t of this.trail) {
            ctx.beginPath();
            ctx.arc(t.x, t.y, 2, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(200,200,200,${t.life})`;
            ctx.fill();
        }

        // Grenade body
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.fuseTime < 0.8 ? '#f44' : '#484';
        ctx.fill();
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Fuse indicator (blink when close)
        if (this.fuseTime < 1.5) {
            const blink = Math.sin(this.fuseTime * 15) > 0;
            if (blink) {
                ctx.beginPath();
                ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
                ctx.fillStyle = '#f44';
                ctx.fill();
            }
        }

        // Blast radius preview
        if (this.fuseTime < 0.5) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.blastRadius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255,100,50,${0.3 * (1 - this.fuseTime * 2)})`;
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }
}
