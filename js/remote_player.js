// remote_player.js — Renders a networked real player from received state
import { TANK_CLASSES } from './player.js';

export class RemotePlayer {
    constructor(info) {
        this.id       = info.id;
        this.name     = info.name || 'Player';
        this.tankClass = info.tankClass || 'medium';
        this.tankClassData = TANK_CLASSES[this.tankClass] || TANK_CLASSES.medium;

        // Rendered state (interpolated from network ticks)
        this.x = 0; this.y = 0; this.angle = 0;
        this.health = 100; this.maxHealth = 100;
        this.alive = true; this.kills = 0;
        this.armor = 0; this.helmet = 0;
        this.weapons = [];
        this.stance = 'standing';
        this.muzzleFlash = 0;
        this.currentWeaponIdx = 0;
        this.damageFlash = 0;
        this.inVehicleType = null;
        this.inVehicleId = null;

        // Collision / zone compatibility
        this.radius = this.tankClassData.radius || 14;
        this.isPlayer = false;
        this.isRemote = true;

        // Smooth hull rotation
        this._hullAngle = 0;
    }

    get currentWeapon() {
        return this.weapons && this.weapons[this.currentWeaponIdx] || null;
    }

    /** Called every server tick with fresh state */
    applyState(st) {
        this.x     = st.x;     this.y     = st.y;
        this.angle = st.angle;
        this.health = st.health; this.maxHealth = st.maxHealth;
        this.alive = st.alive; this.kills = st.kills;
        this.armor = st.armor; this.helmet = st.helmet;
        this.weapons = st.weapons || this.weapons;
        this.stance  = st.stance || 'standing';
        this.muzzleFlash   = st.muzzleFlash   || 0;
        this.currentWeaponIdx = st.currentWeaponIdx || 0;
        this.damageFlash   = st.damageFlash   || 0;
        this.inVehicleType = st.inVehicleType || null;
        this.inVehicleId   = st.inVehicleId   || null;
        this.radius = this.tankClassData.radius || 14;
    }

    // Stub — damage display only; real hp is server-authoritative
    takeDamage(amount) {
        this.damageFlash = 0.6;
        return amount;
    }

    /** Decay per-frame smooth values (call with dt) */
    updateVisuals(dt) {
        if (this.damageFlash > 0) this.damageFlash -= dt * 5;
        if (this.muzzleFlash > 0) this.muzzleFlash -= dt * 15;

        // Hull tracks aim
        let ad = this.angle - this._hullAngle;
        while (ad >  Math.PI) ad -= Math.PI * 2;
        while (ad < -Math.PI) ad += Math.PI * 2;
        this._hullAngle += ad * 0.1;
    }

    draw(ctx) {
        if (!this.alive) return;

        if (this.inVehicleType) {
            this.drawVehicle(ctx);
            return;
        }

        const tc     = this.tankClassData;
        const hullW  = tc.hullW || 16;
        const hullH  = tc.hullH || 22;
        const flash  = Math.min(1, this.damageFlash);
        const aim    = this.angle;

        // Shadow
        ctx.save();
        ctx.translate(this.x + 3, this.y + 3);
        ctx.rotate(this._hullAngle + Math.PI / 2);
        ctx.fillStyle = 'rgba(0,0,0,0.14)';
        ctx.beginPath();
        ctx.roundRect(-hullW/2-2, -hullH/2, hullW+4, hullH, 3);
        ctx.fill();
        ctx.restore();

        // Hull
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this._hullAngle + Math.PI / 2);

        // Tint blue-ish to distinguish real players
        const hullColor = flash > 0 ? '#aaf' : '#4a6a9a';
        ctx.fillStyle = flash > 0 ? '#558' : '#2a3a5a';
        ctx.fillRect(-hullW/2-3, -hullH/2, 3, hullH);  // left tread
        ctx.fillRect( hullW/2,   -hullH/2, 3, hullH);  // right tread

        ctx.fillStyle = hullColor;
        ctx.beginPath();
        ctx.roundRect(-hullW/2, -hullH/2, hullW, hullH, 3);
        ctx.fill();
        // Blue outline = real player indicator
        ctx.strokeStyle = flash > 0 ? 'rgba(180,180,255,0.8)' : 'rgba(80,150,255,0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.restore();

        // Turret
        const tr = 6;
        ctx.beginPath();
        ctx.arc(this.x, this.y, tr, 0, Math.PI * 2);
        ctx.fillStyle = flash > 0 ? '#ccf' : '#3a5a8a';
        ctx.fill();
        ctx.strokeStyle = 'rgba(80,150,255,0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Barrel
        const blen = 20;
        ctx.beginPath();
        ctx.moveTo(this.x + Math.cos(aim)*tr, this.y + Math.sin(aim)*tr);
        ctx.lineTo(this.x + Math.cos(aim)*blen, this.y + Math.sin(aim)*blen);
        const w = this.currentWeapon;
        ctx.strokeStyle = w ? (w.color || '#8af') : '#8af';
        ctx.lineWidth = 3;
        ctx.stroke();
        // barrel tip
        ctx.beginPath();
        ctx.arc(this.x + Math.cos(aim)*blen, this.y + Math.sin(aim)*blen, 2, 0, Math.PI*2);
        ctx.fillStyle = '#222'; ctx.fill();

        // Muzzle flash
        if (this.muzzleFlash > 0) {
            const bx = this.x + Math.cos(aim) * blen;
            const by = this.y + Math.sin(aim) * blen;
            ctx.beginPath();
            ctx.arc(bx, by, 5 + this.muzzleFlash*8, 0, Math.PI*2);
            ctx.fillStyle = `rgba(255,200,50,${this.muzzleFlash*0.8})`;
            ctx.fill();
        }

        this.drawHUD(ctx);
    }

    drawVehicle(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        if (this.inVehicleType === 'car') {
            const length = 52, width = 36;
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fillRect(-length / 2 + 3, -width / 2 + 3, length, width);
            ctx.fillStyle = '#4488cc'; // Default color for remote car
            ctx.fillRect(-length / 2, -width / 2, length, width);
            ctx.fillStyle = 'rgba(150,200,255,0.6)';
            ctx.fillRect(length / 2 - 14, -width / 2 + 4, 10, width - 8);
            ctx.fillStyle = '#333';
            ctx.fillRect(-length / 2 + 4, -width / 2 - 3, 10, 4);
            ctx.fillRect(-length / 2 + 4, width / 2 - 1, 10, 4);
            ctx.fillRect(length / 2 - 14, -width / 2 - 3, 10, 4);
            ctx.fillRect(length / 2 - 14, width / 2 - 1, 10, 4);
            ctx.strokeStyle = 'rgba(0,0,0,0.4)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(-length / 2, -width / 2, length, width);
        } else {
            const length = 40, width = 24;
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.fillRect(-length / 2 + 2, -width / 2 + 2, length, width);
            ctx.fillStyle = '#888';
            ctx.fillRect(-length / 2, -width / 2, length, width);
            ctx.fillStyle = '#333';
            ctx.beginPath(); ctx.arc(-length / 2 + 6, 0, 5, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(length / 2 - 6, 0, 5, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.4)';
            ctx.lineWidth = 1;
            ctx.strokeRect(-length / 2, -width / 2, length, width);
        }
        ctx.restore();

        this.drawHUD(ctx);
    }

    drawHUD(ctx) {
        // [P] badge above name
        ctx.textAlign = 'center';
        ctx.font = 'bold 7px Arial';
        ctx.fillStyle = 'rgba(100,160,255,0.9)';
        ctx.fillText('[PLAYER]', this.x, this.y - 30);

        // Name tag
        ctx.font = 'bold 11px Arial';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 2.5;
        ctx.strokeText(this.name, this.x, this.y - 22);
        ctx.fillStyle = '#8cf';
        ctx.fillText(this.name, this.x, this.y - 22);

        // Health bar
        const bw = 32, bh = 4, by2 = this.y - 18;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(this.x - bw/2, by2, bw, bh);
        const pct = this.health / this.maxHealth;
        ctx.fillStyle = pct > 0.5 ? '#4c4' : pct > 0.25 ? '#cc4' : '#c44';
        ctx.fillRect(this.x - bw/2, by2, bw * pct, bh);
    }
}
