// weapons.js - Weapon definitions and bullet physics

export const WEAPON_TYPES = {
    pistol: {
        name: 'MG',
        damage: 15,
        fireRate: 300,
        bulletSpeed: 600,
        range: 400,
        spread: 0.05,
        magSize: 15,
        reloadTime: 1500,
        color: '#aaa',
        rarity: 'common',
        bulletsPerShot: 1,
        recoil: 0.03,
        spreadIncrease: 0.01
    },
    shotgun: {
        name: 'Scatter',
        damage: 10,
        fireRate: 800,
        bulletSpeed: 500,
        range: 200,
        spread: 0.2,
        magSize: 5,
        reloadTime: 2500,
        color: '#c84',
        rarity: 'common',
        bulletsPerShot: 5,
        recoil: 0.08,
        spreadIncrease: 0
    },
    ar: {
        name: 'Cannon',
        damage: 20,
        fireRate: 120,
        bulletSpeed: 800,
        range: 500,
        spread: 0.08,
        magSize: 30,
        reloadTime: 2000,
        color: '#48c',
        rarity: 'uncommon',
        bulletsPerShot: 1,
        recoil: 0.04,
        spreadIncrease: 0.015
    },
    sniper: {
        name: 'Railgun',
        damage: 70,
        fireRate: 1500,
        bulletSpeed: 1200,
        range: 800,
        spread: 0.01,
        magSize: 5,
        reloadTime: 3000,
        color: '#c4c',
        rarity: 'rare',
        bulletsPerShot: 1,
        recoil: 0.12,
        spreadIncrease: 0
    }
};

export class Bullet {
    constructor(x, y, angle, weapon, owner, customSpread = null) {
        const spread = customSpread !== null ? customSpread : weapon.spread;
        const actualAngle = angle + (Math.random() - 0.5) * spread * 2;
        this.x = x;
        this.y = y;
        this.startX = x;
        this.startY = y;
        this.angle = actualAngle;
        this.vx = Math.cos(actualAngle) * weapon.bulletSpeed;
        this.vy = Math.sin(actualAngle) * weapon.bulletSpeed;
        this.damage = weapon.damage;
        this.range = weapon.range;
        this.distTraveled = 0;
        this.alive = true;
        this.owner = owner;
        this.weapon = weapon;

        // Bullet visuals by weapon type
        const isSniper = weapon === WEAPON_TYPES.sniper || weapon.name === 'Railgun';
        const isAR = weapon === WEAPON_TYPES.ar || weapon.name === 'Cannon';
        const isShotgun = weapon === WEAPON_TYPES.shotgun || weapon.name === 'Scatter';
        this.color = isSniper ? '#ff0' : isAR ? '#fca' : isShotgun ? '#fa8' : '#ffa';
        this.size = isSniper ? 4 : isShotgun ? 2 : 3;
        this.trailLength = isSniper ? 12 : isShotgun ? 3 : 6;
        this.trail = [];
        this.glowSize = isSniper ? 8 : 4;
    }

    update(dt) {
        const moveX = this.vx * dt;
        const moveY = this.vy * dt;
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > this.trailLength) this.trail.shift();
        this.x += moveX;
        this.y += moveY;
        this.distTraveled += Math.sqrt(moveX * moveX + moveY * moveY);
        if (this.distTraveled >= this.range) {
            this.alive = false;
        }
    }

    draw(ctx) {
        // Trail with gradient fade
        if (this.trail.length > 1) {
            for (let i = 1; i < this.trail.length; i++) {
                const alpha = (i / this.trail.length) * 0.4;
                const width = (i / this.trail.length) * (this.size - 0.5);
                ctx.beginPath();
                ctx.moveTo(this.trail[i - 1].x, this.trail[i - 1].y);
                ctx.lineTo(this.trail[i].x, this.trail[i].y);
                ctx.strokeStyle = `rgba(255,255,200,${alpha})`;
                ctx.lineWidth = Math.max(0.5, width);
                ctx.stroke();
            }
            // Connect last trail to bullet
            if (this.trail.length > 0) {
                const last = this.trail[this.trail.length - 1];
                ctx.beginPath();
                ctx.moveTo(last.x, last.y);
                ctx.lineTo(this.x, this.y);
                ctx.strokeStyle = `rgba(255,255,200,0.5)`;
                ctx.lineWidth = this.size - 0.5;
                ctx.stroke();
            }
        }

        // Bullet glow
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.glowSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,200,100,0.15)`;
        ctx.fill();

        // Bullet core
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
    }
}
