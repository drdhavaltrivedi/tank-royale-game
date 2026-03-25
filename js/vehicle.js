// vehicle.js - Vehicle system (cars & bikes)

import { clamp, MAP_SIZE, distance } from './utils.js';
import { resolveCircleRect } from './collision.js';

export class Vehicle {
    constructor(x, y, type = 'car', id = null) {
        this.x = x;
        this.y = y;
        this.id = id || Math.random().toString(36).substring(2, 9);
        this.angle = Math.random() * Math.PI * 2;
        this.type = type;
        this.occupied = false;

        // Physics
        this.velocity = 0;
        this.maxSpeed = type === 'car' ? 400 : 500;
        this.acceleration = type === 'car' ? 300 : 400;
        this.braking = 500;
        this.friction = 150;
        this.turnSpeed = type === 'car' ? 2.5 : 3.5;

        // Health
        this.health = type === 'car' ? 200 : 100;
        this.maxHealth = this.health;
        this.alive = true;

        // Visual
        this.width = type === 'car' ? 36 : 24;
        this.length = type === 'car' ? 52 : 40;
        this.color = type === 'car'
            ? ['#4488cc', '#cc4444', '#44cc44', '#cccc44'][Math.floor(Math.random() * 4)]
            : '#888';

        // Tire track timer
        this.trackTimer = 0;
        this.tracks = [];
    }

    steer(input, dt) {
        if (Math.abs(this.velocity) > 10) {
            this.angle += input * this.turnSpeed * dt * Math.sign(this.velocity);
        }
    }

    accelerate(input, dt) {
        if (input > 0) {
            this.velocity += this.acceleration * input * dt;
        } else if (input < 0) {
            this.velocity += this.braking * input * dt;
        } else {
            // Friction
            if (this.velocity > 0) {
                this.velocity = Math.max(0, this.velocity - this.friction * dt);
            } else if (this.velocity < 0) {
                this.velocity = Math.min(0, this.velocity + this.friction * dt);
            }
        }
        this.velocity = clamp(this.velocity, -this.maxSpeed * 0.3, this.maxSpeed);
    }

    update(dt, obstacles, gameMap) {
        if (!this.alive) return;

        // Move
        this.x += Math.cos(this.angle) * this.velocity * dt;
        this.y += Math.sin(this.angle) * this.velocity * dt;

        // Water slowdown
        if (gameMap && gameMap.isInWater(this.x, this.y)) {
            this.velocity *= 0.95;
        }

        // Obstacle collision (simplified - treat as circle)
        const collRadius = this.length / 2;
        for (const obs of obstacles) {
            if (obs.type === 'building' || obs.type === 'rock') {
                const result = resolveCircleRect(this.x, this.y, collRadius, obs);
                if (result.hit) {
                    this.x = result.x;
                    this.y = result.y;
                    this.velocity *= 0.3; // Bounce/slow on collision
                }
            }
        }

        // Map bounds
        this.x = clamp(this.x, 30, MAP_SIZE - 30);
        this.y = clamp(this.y, 30, MAP_SIZE - 30);

        // Tire tracks
        if (Math.abs(this.velocity) > 30) {
            this.trackTimer -= dt;
            if (this.trackTimer <= 0) {
                this.trackTimer = 0.05;
                this.tracks.push({ x: this.x, y: this.y, life: 3 });
                if (this.tracks.length > 60) this.tracks.shift();
            }
        }

        // Fade tracks
        for (let i = this.tracks.length - 1; i >= 0; i--) {
            this.tracks[i].life -= dt;
            if (this.tracks[i].life <= 0) this.tracks.splice(i, 1);
        }
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            this.health = 0;
            this.alive = false;
        }
    }

    draw(ctx) {
        if (!this.alive) return;

        // Tire tracks
        for (const t of this.tracks) {
            ctx.fillStyle = `rgba(80,60,40,${t.life / 3 * 0.3})`;
            ctx.fillRect(t.x - 1, t.y - 1, 2, 2);
        }

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        if (this.type === 'car') {
            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fillRect(-this.length / 2 + 3, -this.width / 2 + 3, this.length, this.width);

            // Body
            ctx.fillStyle = this.color;
            ctx.fillRect(-this.length / 2, -this.width / 2, this.length, this.width);

            // Windshield
            ctx.fillStyle = 'rgba(150,200,255,0.6)';
            ctx.fillRect(this.length / 2 - 14, -this.width / 2 + 4, 10, this.width - 8);

            // Wheels
            ctx.fillStyle = '#333';
            ctx.fillRect(-this.length / 2 + 4, -this.width / 2 - 3, 10, 4);
            ctx.fillRect(-this.length / 2 + 4, this.width / 2 - 1, 10, 4);
            ctx.fillRect(this.length / 2 - 14, -this.width / 2 - 3, 10, 4);
            ctx.fillRect(this.length / 2 - 14, this.width / 2 - 1, 10, 4);

            // Outline
            ctx.strokeStyle = 'rgba(0,0,0,0.4)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(-this.length / 2, -this.width / 2, this.length, this.width);
        } else {
            // Bike
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.fillRect(-this.length / 2 + 2, -this.width / 2 + 2, this.length, this.width);

            ctx.fillStyle = this.color;
            ctx.fillRect(-this.length / 2, -this.width / 2, this.length, this.width);

            // Wheels
            ctx.fillStyle = '#333';
            ctx.beginPath();
            ctx.arc(-this.length / 2 + 6, 0, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(this.length / 2 - 6, 0, 5, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(0,0,0,0.4)';
            ctx.lineWidth = 1;
            ctx.strokeRect(-this.length / 2, -this.width / 2, this.length, this.width);
        }

        ctx.restore();

        // Health bar (only when damaged)
        if (this.health < this.maxHealth) {
            const barW = this.length;
            const hpPct = this.health / this.maxHealth;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(this.x - barW / 2, this.y - this.width / 2 - 8, barW, 3);
            ctx.fillStyle = hpPct > 0.5 ? '#4c4' : hpPct > 0.25 ? '#cc4' : '#c44';
            ctx.fillRect(this.x - barW / 2, this.y - this.width / 2 - 8, barW * hpPct, 3);
        }

        // Enter prompt
        if (!this.occupied) {
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = '9px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`[E] ${this.type === 'car' ? 'Drive' : 'Ride'}`, this.x, this.y - this.width / 2 - 12);
        }
    }
}

export class VehicleSystem {
    constructor(gameMap) {
        this.vehicles = [];
        this.spawnVehicles(gameMap);
    }

    spawnVehicles(gameMap) {
        // Spawn 5-8 vehicles around the map, near roads/locations
        // Use a consistent seed for spawn counts if possible, but at least use a deterministic counter for IDs
        const count = 5 + Math.floor(Math.random() * 4);
        for (let i = 0; i < count; i++) {
            const vId = `v-${gameMap.theme}-${i}`; // Deterministic ID based on spawn index
            const type = Math.random() < 0.6 ? 'car' : 'bike';
            let x, y, valid;
            let attempts = 0;
            do {
                x = 300 + Math.random() * (MAP_SIZE - 600);
                y = 300 + Math.random() * (MAP_SIZE - 600);
                valid = true;
                // Don't spawn on buildings
                for (const obs of gameMap.obstacles) {
                    if (obs.type === 'building' &&
                        x > obs.x - 40 && x < obs.x + obs.w + 40 &&
                        y > obs.y - 40 && y < obs.y + obs.h + 40) {
                        valid = false;
                        break;
                    }
                }
                // Don't spawn in water
                if (valid && gameMap.isInWater(x, y)) valid = false;
                attempts++;
            } while (!valid && attempts < 30);

            if (valid) {
                this.vehicles.push(new Vehicle(x, y, type, vId));
            }
        }
    }

    tryEnter(player) {
        for (const v of this.vehicles) {
            if (!v.alive || v.occupied) continue;
            if (distance(player.x, player.y, v.x, v.y) < 50) {
                v.occupied = true;
                player.inVehicle = v;
                return v;
            }
        }
        return null;
    }

    update(dt, obstacles, gameMap) {
        for (const v of this.vehicles) {
            if (!v.occupied) continue;
            // Vehicle physics updated by player
        }
    }

    draw(ctx, camera, occupiedIds = new Set()) {
        for (const v of this.vehicles) {
            if (!camera.isVisible(v.x, v.y, 40)) continue;
            // Skip drawing if person is in it (the player/remote player draws a more accurate sync version)
            if (occupiedIds.has(v.id)) continue;
            v.draw(ctx);
        }
    }

    drawOnMinimap(ctx, mapX, mapY, scale) {
        for (const v of this.vehicles) {
            if (!v.alive) continue;
            const vx = mapX + v.x * scale;
            const vy = mapY + v.y * scale;
            ctx.fillStyle = v.occupied ? '#ff0' : '#0cf';
            ctx.fillRect(vx - 2, vy - 1, 4, 2);
        }
    }
}
