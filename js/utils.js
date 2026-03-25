// utils.js - Math helpers and utility functions

export function distance(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

export function angle(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

export function randomRange(min, max) {
    return Math.random() * (max - min) + min;
}

export function randomInt(min, max) {
    return Math.floor(randomRange(min, max + 1));
}

export function pointInRect(px, py, rx, ry, rw, rh) {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

export function pointInCircle(px, py, cx, cy, r) {
    return distance(px, py, cx, cy) <= r;
}

export function rectIntersect(r1, r2) {
    return r1.x < r2.x + r2.w && r1.x + r1.w > r2.x &&
           r1.y < r2.y + r2.h && r1.y + r1.h > r2.y;
}

export function circleRectIntersect(cx, cy, cr, rx, ry, rw, rh) {
    const closestX = clamp(cx, rx, rx + rw);
    const closestY = clamp(cy, ry, ry + rh);
    return distance(cx, cy, closestX, closestY) <= cr;
}

export function normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}

export function bezierPoint(t, p0x, p0y, cp1x, cp1y, cp2x, cp2y, p1x, p1y) {
    const u = 1 - t;
    const x = u*u*u*p0x + 3*u*u*t*cp1x + 3*u*t*t*cp2x + t*t*t*p1x;
    const y = u*u*u*p0y + 3*u*u*t*cp1y + 3*u*t*t*cp2y + t*t*t*p1y;
    return { x, y };
}

export const MAP_SIZE = 4000;
export const TILE_SIZE = 64;
