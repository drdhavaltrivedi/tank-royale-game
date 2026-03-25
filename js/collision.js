// collision.js - Collision detection and resolution

import { circleRectIntersect, clamp } from './utils.js';

export function resolveCircleRect(cx, cy, cr, rect) {
    // Find closest point on rect to circle center
    const closestX = clamp(cx, rect.x, rect.x + rect.w);
    const closestY = clamp(cy, rect.y, rect.y + rect.h);
    const dx = cx - closestX;
    const dy = cy - closestY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < cr && dist > 0) {
        const overlap = cr - dist;
        const nx = dx / dist;
        const ny = dy / dist;
        return { x: cx + nx * overlap, y: cy + ny * overlap, hit: true };
    }
    return { x: cx, y: cy, hit: false };
}

export function lineRectIntersect(x1, y1, x2, y2, rect) {
    // Check if line segment intersects rectangle
    const left = lineLineIntersect(x1, y1, x2, y2, rect.x, rect.y, rect.x, rect.y + rect.h);
    const right = lineLineIntersect(x1, y1, x2, y2, rect.x + rect.w, rect.y, rect.x + rect.w, rect.y + rect.h);
    const top = lineLineIntersect(x1, y1, x2, y2, rect.x, rect.y, rect.x + rect.w, rect.y);
    const bottom = lineLineIntersect(x1, y1, x2, y2, rect.x, rect.y + rect.h, rect.x + rect.w, rect.y + rect.h);
    return left || right || top || bottom;
}

function lineLineIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (den === 0) return false;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

export function checkBulletHit(bullet, entities, obstacles, doors, trees, bushes) {
    // Check against entities (players/bots)
    for (const entity of entities) {
        if (!entity.alive || entity === bullet.owner) continue;
        const dx = bullet.x - entity.x;
        const dy = bullet.y - entity.y;
        if (dx * dx + dy * dy < (entity.radius + 3) * (entity.radius + 3)) {
            return { type: 'entity', target: entity };
        }
    }
    // Check against doors (destructible)
    if (doors) {
        for (const door of doors) {
            if (!door.alive) continue;
            if (circleRectIntersect(bullet.x, bullet.y, 3, door.x, door.y, door.w, door.h)) {
                return { type: 'door', target: door };
            }
        }
    }
    // Check against obstacles
    for (const obs of obstacles) {
        if (obs.type === 'building' && obs.walls) {
            for (const wall of obs.walls) {
                if (circleRectIntersect(bullet.x, bullet.y, 3, wall.x, wall.y, wall.w, wall.h)) {
                    return { type: 'obstacle', target: obs };
                }
            }
        } else if (obs.type === 'rock' && obs.alive !== false) {
            if (circleRectIntersect(bullet.x, bullet.y, 3, obs.x, obs.y, obs.w, obs.h)) {
                return { type: 'obstacle', target: obs };
            }
        }
    }
    // Check trees
    if (trees) {
        for (const tree of trees) {
            if (!tree.alive) continue;
            const dx = bullet.x - tree.x, dy = bullet.y - tree.y;
            if (dx * dx + dy * dy < 10 * 10) {
                return { type: 'tree', target: tree };
            }
        }
    }
    // Check bushes
    if (bushes) {
        for (const bush of bushes) {
            if (!bush.alive) continue;
            const dx = bullet.x - bush.x, dy = bullet.y - bush.y;
            if (dx * dx + dy * dy < 12 * 12) {
                return { type: 'bush', target: bush };
            }
        }
    }
    return null;
}
