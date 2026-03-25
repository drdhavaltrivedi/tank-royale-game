// minimap.js - Enhanced minimap renderer with ping effects

import { MAP_SIZE } from './utils.js';

export class Minimap {
    constructor() {
        this.size = 180;
        this.margin = 15;
        this.scale = this.size / MAP_SIZE;
        this.pingEffects = []; // visual pings for gunfire
    }

    addPing(x, y, color = '#f44') {
        this.pingEffects.push({ x, y, color, life: 1 });
    }

    draw(ctx, canvas, player, bots, zone, airdrop, vehicles) {
        const x = canvas.width - this.size - this.margin;
        const y = this.margin;

        // Background with rounded corners and glass effect
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x - 1, y - 1, this.size + 2, this.size + 2, 8);
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Clip to minimap area
        ctx.beginPath();
        ctx.roundRect(x, y, this.size, this.size, 7);
        ctx.clip();

        // Zone area outside (blue tint)
        const zx = x + zone.centerX * this.scale;
        const zy = y + zone.centerY * this.scale;
        const zr = zone.currentRadius * this.scale;

        ctx.beginPath();
        ctx.rect(x, y, this.size, this.size);
        ctx.arc(zx, zy, zr, 0, Math.PI * 2, true);
        ctx.fillStyle = 'rgba(0, 80, 200, 0.3)';
        ctx.fill();

        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 0.5;
        const gridStep = this.size / 4;
        for (let gx = gridStep; gx < this.size; gx += gridStep) {
            ctx.beginPath();
            ctx.moveTo(x + gx, y);
            ctx.lineTo(x + gx, y + this.size);
            ctx.stroke();
        }
        for (let gy = gridStep; gy < this.size; gy += gridStep) {
            ctx.beginPath();
            ctx.moveTo(x, y + gy);
            ctx.lineTo(x + this.size, y + gy);
            ctx.stroke();
        }

        // Zone border (glowing)
        ctx.beginPath();
        ctx.arc(zx, zy, zr, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 150, 255, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Zone glow
        ctx.beginPath();
        ctx.arc(zx, zy, zr, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 200, 255, 0.3)';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Next zone — dashed white ring
        if (zone.state === 'waiting' && zone.targetRadius && zone.targetRadius < zone.currentRadius) {
            const tzx = x + zone.targetCenterX * this.scale;
            const tzy = y + zone.targetCenterY * this.scale;
            const tzr = zone.targetRadius * this.scale;
            ctx.beginPath();
            ctx.arc(tzx, tzy, tzr, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Bots  
        for (const bot of bots) {
            if (!bot.alive) continue;
            const bx = x + bot.x * this.scale;
            const by = y + bot.y * this.scale;
            const dx = player.x - bot.x;
            const dy = player.y - bot.y;
            const nearby = dx * dx + dy * dy < 500 * 500;
            const sz = nearby ? 3 : 2;
            const botColor = nearby
                ? (bot.difficulty === 'hard' ? '#f44' : bot.difficulty === 'medium' ? '#fa4' : '#f88')
                : '#a33';
            ctx.fillStyle = botColor;
            ctx.fillRect(bx - sz / 2, by - sz / 2, sz, sz);
        }

        // Vehicle markers
        if (vehicles) {
            vehicles.drawOnMinimap(ctx, x, y, this.scale);
        }

        // Airdrop markers
        if (airdrop) {
            airdrop.drawOnMinimap(ctx, x, y, this.scale);
        }

        // Ping effects (gunfire, explosions)
        for (let i = this.pingEffects.length - 1; i >= 0; i--) {
            const p = this.pingEffects[i];
            p.life -= 0.02;
            if (p.life <= 0) { this.pingEffects.splice(i, 1); continue; }
            const px = x + p.x * this.scale;
            const py = y + p.y * this.scale;
            const pr = (1 - p.life) * 8;
            ctx.beginPath();
            ctx.arc(px, py, pr, 0, Math.PI * 2);
            ctx.strokeStyle = p.color.replace(')', `,${p.life * 0.6})`).replace('rgb', 'rgba');
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Player (glowing arrow)
        if (player.alive) {
            const px = x + player.x * this.scale;
            const py = y + player.y * this.scale;

            // Player glow
            ctx.beginPath();
            ctx.arc(px, py, 5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fill();

            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(player.angle);
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.moveTo(6, 0);
            ctx.lineTo(-3, -3.5);
            ctx.lineTo(-1.5, 0);
            ctx.lineTo(-3, 3.5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        ctx.restore(); // Restore clip

        // Zone phase label (below map)
        ctx.fillStyle = 'rgba(0,200,255,0.7)';
        ctx.font = 'bold 8px Rajdhani, Arial';
        ctx.textAlign = 'left';
        ctx.fillText(zone.getStatusText(), x + 3, y + this.size + 11);

        // Compass directions
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = 'bold 8px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('N', x + this.size / 2, y + 8);
        ctx.fillText('S', x + this.size / 2, y + this.size - 2);
        ctx.textAlign = 'left';
        ctx.fillText('W', x + 2, y + this.size / 2 + 3);
        ctx.textAlign = 'right';
        ctx.fillText('E', x + this.size - 2, y + this.size / 2 + 3);
    }
}
