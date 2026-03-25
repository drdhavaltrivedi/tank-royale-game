// weather.js - Dynamic weather effects (rain, fog, dust storms)

export class WeatherSystem {
    constructor() {
        const r = Math.random();
        if (r < 0.3) this.type = 'rain';
        else if (r < 0.45) this.type = 'fog';
        else this.type = 'clear';

        this.intensity = this.type === 'clear' ? 0 : 0.3 + Math.random() * 0.5;
        this.raindrops = [];
        this.fogAlpha = 0;
        this.targetFogAlpha = this.type === 'fog' ? this.intensity * 0.15 : 0;
        this.lightning = 0;
        this.lightningTimer = 0;
        this.windAngle = Math.random() * 0.3 - 0.15; // slight wind offset

        // Pre-generate raindrops with varied properties
        if (this.type === 'rain') {
            for (let i = 0; i < 200; i++) {
                this.raindrops.push({
                    x: Math.random(),
                    y: Math.random(),
                    speed: 0.5 + Math.random() * 0.5,
                    length: 6 + Math.random() * 14,
                    width: 0.5 + Math.random() * 1,
                    layer: Math.random() < 0.3 ? 'far' : 'near'  // depth layers
                });
            }
        }

        // Transition timer — weather can change mid-game  
        this.transitionTimer = 120 + Math.random() * 180; // 2-5 min
    }

    update(dt) {
        // Fog fade in smoothly
        this.fogAlpha += (this.targetFogAlpha - this.fogAlpha) * dt * 0.5;

        // Wind variation
        this.windAngle += (Math.random() - 0.5) * 0.01 * dt;

        // Lightning (only in heavy rain)
        if (this.type === 'rain' && this.intensity > 0.5) {
            this.lightningTimer -= dt;
            if (this.lightningTimer <= 0) {
                this.lightningTimer = 8 + Math.random() * 15;
                this.lightning = 1;
            }
            if (this.lightning > 0) {
                this.lightning -= dt * 5;
            }
        }

        // Update raindrops
        for (const drop of this.raindrops) {
            const speedMult = drop.layer === 'far' ? 0.7 : 1;
            drop.y += drop.speed * speedMult * dt;
            drop.x += this.windAngle * dt * speedMult;
            if (drop.y > 1) {
                drop.y = -0.05;
                drop.x = Math.random();
            }
            if (drop.x > 1) drop.x = 0;
            if (drop.x < 0) drop.x = 1;
        }

        // Weather transitions
        this.transitionTimer -= dt;
        if (this.transitionTimer <= 0) {
            this.transitionTimer = 120 + Math.random() * 180;
            // Chance to shift intensity
            if (this.type !== 'clear') {
                this.intensity = Math.max(0.2, Math.min(0.8, this.intensity + (Math.random() - 0.5) * 0.3));
                if (this.type === 'fog') {
                    this.targetFogAlpha = this.intensity * 0.15;
                }
            }
        }
    }

    draw(ctx, canvas) {
        if (this.type === 'clear') return;

        if (this.type === 'rain') {
            // Far layer (smaller, dimmer)
            for (const drop of this.raindrops) {
                if (drop.layer !== 'far') continue;
                const rx = drop.x * canvas.width;
                const ry = drop.y * canvas.height;
                ctx.strokeStyle = `rgba(120,150,200,${this.intensity * 0.15})`;
                ctx.lineWidth = drop.width * 0.5;
                ctx.beginPath();
                ctx.moveTo(rx, ry);
                ctx.lineTo(rx + this.windAngle * 30, ry + drop.length * 0.6);
                ctx.stroke();
            }

            // Near layer (brighter, thicker)
            for (const drop of this.raindrops) {
                if (drop.layer !== 'near') continue;
                const rx = drop.x * canvas.width;
                const ry = drop.y * canvas.height;
                ctx.strokeStyle = `rgba(160,190,230,${this.intensity * 0.3})`;
                ctx.lineWidth = drop.width;
                ctx.beginPath();
                ctx.moveTo(rx, ry);
                ctx.lineTo(rx + this.windAngle * 50, ry + drop.length);
                ctx.stroke();
            }

            // Blue atmosphere tint
            ctx.fillStyle = `rgba(40,60,100,${this.intensity * 0.08})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Lightning flash
            if (this.lightning > 0) {
                ctx.fillStyle = `rgba(255,255,255,${this.lightning * 0.2})`;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        }

        if (this.type === 'fog') {
            // Fog with layered gradients for depth
            const gradient = ctx.createRadialGradient(
                canvas.width / 2, canvas.height / 2, 80,
                canvas.width / 2, canvas.height / 2, canvas.width * 0.55
            );
            gradient.addColorStop(0, `rgba(180,190,200,0)`);
            gradient.addColorStop(0.4, `rgba(180,190,200,${this.fogAlpha * 0.3})`);
            gradient.addColorStop(1, `rgba(180,190,200,${this.fogAlpha})`);
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Moving fog wisps (subtle)
            const t = performance.now() / 3000;
            const wispAlpha = this.fogAlpha * 0.3;
            ctx.fillStyle = `rgba(200,210,220,${wispAlpha})`;
            for (let i = 0; i < 3; i++) {
                const wx = canvas.width * (0.2 + 0.3 * i + Math.sin(t + i * 1.5) * 0.1);
                const wy = canvas.height * (0.4 + Math.cos(t * 0.7 + i) * 0.15);
                ctx.beginPath();
                ctx.ellipse(wx, wy, 200 + Math.sin(t + i) * 50, 60, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    getStatusText() {
        if (this.type === 'rain') return this.intensity > 0.5 ? '🌧 Heavy Rain' : '🌦 Light Rain';
        if (this.type === 'fog') return '🌫 Foggy';
        return '☀ Clear';
    }
}
