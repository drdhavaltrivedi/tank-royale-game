// camera.js - Camera follow with smooth lerp, shake, zoom, screen effects

import { clamp, lerp, MAP_SIZE } from './utils.js';

export class Camera {
    constructor(canvas) {
        this.canvas = canvas;
        this.x = 0;
        this.y = 0;
        this.targetX = 0;
        this.targetY = 0;
        this.shakeX = 0;
        this.shakeY = 0;
        this.shakeIntensity = 0;
        this.zoom = 1;
        this.targetZoom = 1;

        // Damage vignette
        this.vignetteIntensity = 0;
        this.vignetteColor = 'red';

        // Directional damage indicators
        this.damageIndicators = [];

        // Hit marker (crosshair flash when hitting enemy)
        this.hitMarkerAlpha = 0;

        // Kill confirmation flash
        this.killFlashAlpha = 0;

        // Smooth camera velocity for prediction
        this._prevTargetX = 0;
        this._prevTargetY = 0;
        this._velocityX = 0;
        this._velocityY = 0;
    }

    follow(target, leadFactor = 0.12) {
        const rawX = target.x - this.canvas.width / 2;
        const rawY = target.y - this.canvas.height / 2;

        // Predict movement for smoother feel
        this._velocityX = lerp(this._velocityX, rawX - this._prevTargetX, 0.1);
        this._velocityY = lerp(this._velocityY, rawY - this._prevTargetY, 0.1);
        this._prevTargetX = rawX;
        this._prevTargetY = rawY;

        this.targetX = clamp(rawX + this._velocityX * leadFactor * 60, 0, MAP_SIZE - this.canvas.width);
        this.targetY = clamp(rawY + this._velocityY * leadFactor * 60, 0, MAP_SIZE - this.canvas.height);
    }

    shake(intensity) {
        this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    }

    addDamageIndicator(fromX, fromY, playerX, playerY) {
        const angle = Math.atan2(fromY - playerY, fromX - playerX);
        this.damageIndicators.push({ angle, life: 1.5 });
    }

    flashVignette(intensity = 0.4, color = 'red') {
        this.vignetteIntensity = Math.max(this.vignetteIntensity, intensity);
        this.vignetteColor = color;
    }

    flashHitMarker() {
        this.hitMarkerAlpha = 1;
    }

    flashKill() {
        this.killFlashAlpha = 1;
    }

    setZoom(z) {
        this.targetZoom = z;
    }

    update(dt) {
        // Smooth camera follow (lerp) — slightly faster for responsive feel
        const lerpSpeed = 10;
        this.x = lerp(this.x, this.targetX, Math.min(1, lerpSpeed * dt));
        this.y = lerp(this.y, this.targetY, Math.min(1, lerpSpeed * dt));

        // Smooth zoom
        this.zoom = lerp(this.zoom, this.targetZoom, Math.min(1, 6 * dt));

        // Shake — improved with rotation component
        if (this.shakeIntensity > 0) {
            this.shakeX = (Math.random() - 0.5) * this.shakeIntensity;
            this.shakeY = (Math.random() - 0.5) * this.shakeIntensity;
            this.shakeIntensity *= 0.85;
            if (this.shakeIntensity < 0.2) this.shakeIntensity = 0;
        } else {
            this.shakeX = 0;
            this.shakeY = 0;
        }

        // Vignette decay
        if (this.vignetteIntensity > 0) {
            this.vignetteIntensity -= dt * 1.8;
            if (this.vignetteIntensity < 0) this.vignetteIntensity = 0;
        }

        // Hit marker decay
        if (this.hitMarkerAlpha > 0) {
            this.hitMarkerAlpha -= dt * 4;
            if (this.hitMarkerAlpha < 0) this.hitMarkerAlpha = 0;
        }

        // Kill flash decay
        if (this.killFlashAlpha > 0) {
            this.killFlashAlpha -= dt * 3;
            if (this.killFlashAlpha < 0) this.killFlashAlpha = 0;
        }

        // Damage indicators decay
        for (let i = this.damageIndicators.length - 1; i >= 0; i--) {
            this.damageIndicators[i].life -= dt;
            if (this.damageIndicators[i].life <= 0) this.damageIndicators.splice(i, 1);
        }
    }

    applyTransform(ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (this.zoom !== 1) {
            const cx = this.canvas.width / 2;
            const cy = this.canvas.height / 2;
            ctx.translate(cx, cy);
            ctx.scale(this.zoom, this.zoom);
            ctx.translate(-cx, -cy);
        }
        ctx.translate(-this.x + this.shakeX, -this.y + this.shakeY);
    }

    resetTransform(ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    drawOverlays(ctx, canvas) {
        // Damage vignette
        if (this.vignetteIntensity > 0) {
            const alpha = this.vignetteIntensity * 0.5;
            const gradient = ctx.createRadialGradient(
                canvas.width / 2, canvas.height / 2, canvas.width * 0.25,
                canvas.width / 2, canvas.height / 2, canvas.width * 0.7
            );
            if (this.vignetteColor === 'red') {
                gradient.addColorStop(0, 'rgba(200,0,0,0)');
                gradient.addColorStop(1, `rgba(200,0,0,${alpha})`);
            } else {
                gradient.addColorStop(0, 'rgba(0,100,200,0)');
                gradient.addColorStop(1, `rgba(0,100,200,${alpha})`);
            }
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Kill flash — gold border pulse
        if (this.killFlashAlpha > 0) {
            const a = this.killFlashAlpha * 0.3;
            const grd = ctx.createRadialGradient(
                canvas.width / 2, canvas.height / 2, canvas.width * 0.3,
                canvas.width / 2, canvas.height / 2, canvas.width * 0.65
            );
            grd.addColorStop(0, 'rgba(255,200,0,0)');
            grd.addColorStop(1, `rgba(255,200,0,${a})`);
            ctx.fillStyle = grd;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Hit marker crosshair
        if (this.hitMarkerAlpha > 0) {
            const cx = canvas.width / 2;
            const cy = canvas.height / 2;
            const a = this.hitMarkerAlpha;
            const size = 8 + (1 - a) * 4;
            ctx.strokeStyle = `rgba(255,255,255,${a})`;
            ctx.lineWidth = 2;
            // Four short lines forming an X
            const gap = 4;
            ctx.beginPath();
            ctx.moveTo(cx - gap, cy - gap); ctx.lineTo(cx - size, cy - size);
            ctx.moveTo(cx + gap, cy - gap); ctx.lineTo(cx + size, cy - size);
            ctx.moveTo(cx - gap, cy + gap); ctx.lineTo(cx - size, cy + size);
            ctx.moveTo(cx + gap, cy + gap); ctx.lineTo(cx + size, cy + size);
            ctx.stroke();
        }

        // Directional damage indicators - improved with gradient
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const indicatorDist = Math.min(cx, cy) - 40;

        for (const d of this.damageIndicators) {
            const alpha = Math.min(1, d.life);
            const ix = cx + Math.cos(d.angle) * indicatorDist;
            const iy = cy + Math.sin(d.angle) * indicatorDist;

            ctx.save();
            ctx.translate(ix, iy);
            ctx.rotate(d.angle);

            // Arrow shape — larger and more visible
            ctx.beginPath();
            ctx.moveTo(14, 0);
            ctx.lineTo(-6, -8);
            ctx.lineTo(-3, 0);
            ctx.lineTo(-6, 8);
            ctx.closePath();
            ctx.fillStyle = `rgba(255, 50, 50, ${alpha * 0.85})`;
            ctx.fill();
            // Outline
            ctx.strokeStyle = `rgba(255,200,200,${alpha * 0.4})`;
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.restore();
        }

        // Ambient vignette for atmosphere (always on, subtle)
        const ambGrd = ctx.createRadialGradient(
            canvas.width / 2, canvas.height / 2, canvas.width * 0.35,
            canvas.width / 2, canvas.height / 2, canvas.width * 0.75
        );
        ambGrd.addColorStop(0, 'rgba(0,0,0,0)');
        ambGrd.addColorStop(1, 'rgba(0,0,0,0.18)');
        ctx.fillStyle = ambGrd;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    isVisible(x, y, margin = 100) {
        return x > this.x - margin && x < this.x + this.canvas.width + margin &&
               y > this.y - margin && y < this.y + this.canvas.height + margin;
    }
}
