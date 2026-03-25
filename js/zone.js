// zone.js - Shrinking zone logic & damage

import { MAP_SIZE, distance, lerp } from './utils.js';

const ZONE_PHASES = [
    { waitTime: 45, shrinkTime: 30, radiusPct: 0.85, damage: 1 },
    { waitTime: 30, shrinkTime: 25, radiusPct: 0.55, damage: 2 },
    { waitTime: 25, shrinkTime: 20, radiusPct: 0.30, damage: 5 },
    { waitTime: 15, shrinkTime: 15, radiusPct: 0.12, damage: 10 },
    { waitTime: 10, shrinkTime: 10, radiusPct: 0.02, damage: 20 },
];

export class Zone {
    constructor() {
        this.centerX = MAP_SIZE / 2;
        this.centerY = MAP_SIZE / 2;
        this.currentRadius = MAP_SIZE * 0.6;

        this.targetCenterX = MAP_SIZE / 2;
        this.targetCenterY = MAP_SIZE / 2;
        this.targetRadius = MAP_SIZE * 0.6;

        this.startCenterX = this.centerX;
        this.startCenterY = this.centerY;
        this.startRadius = this.currentRadius;

        this.phase = 0;
        this.state = 'waiting'; // 'waiting', 'shrinking'
        this.timer = ZONE_PHASES[0].waitTime;
        this.shrinkProgress = 0;
        this.damage = ZONE_PHASES[0].damage;
        this.damageTimer = 0;
        this.finished = false;
    }

    update(dt) {
        if (this.finished) return;

        this.timer -= dt;
        const phaseData = ZONE_PHASES[this.phase];

        if (this.state === 'waiting') {
            if (this.timer <= 0) {
                this.state = 'shrinking';
                this.timer = phaseData.shrinkTime;
                this.shrinkProgress = 0;

                // Set next target
                const maxOffset = this.currentRadius * 0.3;
                this.startCenterX = this.centerX;
                this.startCenterY = this.centerY;
                this.startRadius = this.currentRadius;
                this.targetCenterX = this.centerX + (Math.random() - 0.5) * maxOffset;
                this.targetCenterY = this.centerY + (Math.random() - 0.5) * maxOffset;
                this.targetRadius = MAP_SIZE * phaseData.radiusPct;

                // Keep center in bounds
                this.targetCenterX = Math.max(this.targetRadius, Math.min(MAP_SIZE - this.targetRadius, this.targetCenterX));
                this.targetCenterY = Math.max(this.targetRadius, Math.min(MAP_SIZE - this.targetRadius, this.targetCenterY));
            }
        } else if (this.state === 'shrinking') {
            this.shrinkProgress = 1 - (this.timer / phaseData.shrinkTime);
            this.centerX = lerp(this.startCenterX, this.targetCenterX, this.shrinkProgress);
            this.centerY = lerp(this.startCenterY, this.targetCenterY, this.shrinkProgress);
            this.currentRadius = lerp(this.startRadius, this.targetRadius, this.shrinkProgress);

            if (this.timer <= 0) {
                this.phase++;
                if (this.phase >= ZONE_PHASES.length) {
                    this.finished = true;
                    return;
                }
                this.state = 'waiting';
                this.timer = ZONE_PHASES[this.phase].waitTime;
                this.damage = ZONE_PHASES[this.phase].damage;
            }
        }
    }

    isInZone(x, y) {
        return distance(x, y, this.centerX, this.centerY) <= this.currentRadius;
    }

    applyDamage(entities, dt) {
        this.damageTimer += dt;
        if (this.damageTimer >= 1) {
            this.damageTimer = 0;
            for (const e of entities) {
                if (e.alive && !this.isInZone(e.x, e.y)) {
                    e.takeDamage(this.damage, null);
                }
            }
        }
    }

    getStatusText() {
        if (this.finished) return 'Final Zone';
        const phase = ZONE_PHASES[this.phase];
        if (this.state === 'waiting') {
            return `Zone shrinks in ${Math.ceil(this.timer)}s`;
        }
        return `Zone shrinking... ${Math.ceil(this.timer)}s`;
    }

    getSafeCenter() {
        if (this.state === 'shrinking') {
            return { x: this.targetCenterX, y: this.targetCenterY };
        }
        return { x: this.centerX, y: this.centerY };
    }

    draw(ctx) {
        const t = performance.now() / 1000;

        // Draw zone boundary using path subtraction
        ctx.save();

        // Dark overlay outside zone — radial gradient for depth
        ctx.beginPath();
        ctx.rect(0, 0, MAP_SIZE, MAP_SIZE);
        ctx.arc(this.centerX, this.centerY, this.currentRadius, 0, Math.PI * 2, true);
        const dangerGrd = ctx.createRadialGradient(
            this.centerX, this.centerY, this.currentRadius * 0.8,
            this.centerX, this.centerY, this.currentRadius * 1.5
        );
        dangerGrd.addColorStop(0, 'rgba(0, 80, 200, 0.1)');
        dangerGrd.addColorStop(1, 'rgba(0, 60, 180, 0.25)');
        ctx.fillStyle = dangerGrd;
        ctx.fill();

        // Animated electric zone border
        const pulse = (Math.sin(t * 4) + 1) * 0.5;
        ctx.beginPath();
        ctx.arc(this.centerX, this.centerY, this.currentRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, ${140 + pulse * 60}, 255, ${0.5 + pulse * 0.3})`;
        ctx.lineWidth = 2 + pulse;
        ctx.stroke();

        // Outer glow ring
        ctx.beginPath();
        ctx.arc(this.centerX, this.centerY, this.currentRadius + 2, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 200, 255, ${0.1 + pulse * 0.1})`;
        ctx.lineWidth = 8;
        ctx.stroke();

        // Inner subtle glow
        ctx.beginPath();
        ctx.arc(this.centerX, this.centerY, this.currentRadius - 3, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 180, 255, 0.08)';
        ctx.lineWidth = 12;
        ctx.stroke();

        // Target zone (animated dashed ring) when waiting
        if (this.state === 'waiting' && this.phase < ZONE_PHASES.length) {
            const nextRadius = MAP_SIZE * ZONE_PHASES[this.phase].radiusPct;
            const dashOffset = t * 20;
            ctx.beginPath();
            ctx.arc(this.targetCenterX, this.targetCenterY, nextRadius, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([8, 8]);
            ctx.lineDashOffset = dashOffset;
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.lineDashOffset = 0;
        }

        // Shrinking warning — pulsing ring during shrink
        if (this.state === 'shrinking') {
            const shrinkPulse = (Math.sin(t * 8) + 1) * 0.5;
            ctx.beginPath();
            ctx.arc(this.centerX, this.centerY, this.currentRadius + 6, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 50, 50, ${shrinkPulse * 0.3})`;
            ctx.lineWidth = 3;
            ctx.stroke();
        }

        ctx.restore();
    }
}
