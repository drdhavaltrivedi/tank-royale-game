// inventory.js - Inventory screen (Tab key)

import { WEAPON_TYPES } from './weapons.js';

export class Inventory {
    constructor() {
        this.isOpen = false;
        this.hoveredSlot = -1;
        this.dragItem = null;
        this.dragFromSlot = -1;
    }

    toggle() {
        this.isOpen = !this.isOpen;
        this.dragItem = null;
        this.dragFromSlot = -1;
    }

    handleMouse(mouseX, mouseY, mouseDown, clicked, player) {
        if (!this.isOpen) return;

        const slots = this.getSlotRects(player);
        this.hoveredSlot = -1;

        for (let i = 0; i < slots.length; i++) {
            const s = slots[i];
            if (mouseX >= s.x && mouseX <= s.x + s.w && mouseY >= s.y && mouseY <= s.y + s.h) {
                this.hoveredSlot = i;
                break;
            }
        }

        if (clicked && this.hoveredSlot >= 0) {
            const slot = slots[this.hoveredSlot];

            // Weapon slots (0, 1): click to switch
            if (this.hoveredSlot <= 1 && player.weapons[this.hoveredSlot]) {
                player.currentWeaponIdx = this.hoveredSlot;
            }

            // Drop button slots (2, 3): drop weapon from slot 0 or 1
            if (this.hoveredSlot === 2 && player.weapons[0]) {
                return { action: 'drop', slot: 0 };
            }
            if (this.hoveredSlot === 3 && player.weapons[1]) {
                return { action: 'drop', slot: 1 };
            }

            // Use healing items action
            if (slot.type === 'heal') {
                return { action: 'heal' };
            }
        }

        return null;
    }

    getSlotRects(player) {
        const cx = 325; // center x of inventory
        const baseY = 120;
        const slotW = 180;
        const slotH = 50;
        const gap = 8;

        const slots = [];

        // Weapon slot 1
        slots.push({ x: cx - slotW - gap / 2, y: baseY, w: slotW, h: slotH, type: 'weapon', idx: 0 });
        // Weapon slot 2
        slots.push({ x: cx + gap / 2, y: baseY, w: slotW, h: slotH, type: 'weapon', idx: 1 });
        // Drop buttons
        slots.push({ x: cx - slotW - gap / 2, y: baseY + slotH + 4, w: slotW, h: 24, type: 'drop', idx: 0 });
        slots.push({ x: cx + gap / 2, y: baseY + slotH + 4, w: slotW, h: 24, type: 'drop', idx: 1 });

        return slots;
    }

    draw(ctx, canvas, player) {
        if (!this.isOpen) return;

        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const panelW = 420;
        const panelH = 380;
        const panelX = cx - panelW / 2;
        const panelY = cy - panelH / 2;

        // Dark overlay
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Panel background
        ctx.fillStyle = 'rgba(20,20,30,0.95)';
        ctx.fillRect(panelX, panelY, panelW, panelH);
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 2;
        ctx.strokeRect(panelX, panelY, panelW, panelH);

        // Title
        ctx.fillStyle = '#ec4';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('INVENTORY', cx, panelY + 30);

        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '10px Arial';
        ctx.fillText('Press TAB to close', cx, panelY + 48);

        // Weapon slots
        const slotY = panelY + 65;
        const slotW = 180;
        const slotH = 50;

        for (let i = 0; i < 2; i++) {
            const sx = panelX + 15 + i * (slotW + 10);
            const isActive = i === player.currentWeaponIdx;
            const isHovered = this.hoveredSlot === i;

            // Slot background
            ctx.fillStyle = isActive ? 'rgba(255,200,50,0.15)' : isHovered ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)';
            ctx.fillRect(sx, slotY, slotW, slotH);
            ctx.strokeStyle = isActive ? '#ec4' : 'rgba(255,255,255,0.2)';
            ctx.lineWidth = isActive ? 2 : 1;
            ctx.strokeRect(sx, slotY, slotW, slotH);

            // Slot label
            ctx.fillStyle = '#888';
            ctx.font = '9px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(`SLOT ${i + 1}${isActive ? ' (ACTIVE)' : ''}`, sx + 8, slotY + 14);

            const w = player.weapons[i];
            if (w) {
                // Weapon icon bar
                ctx.fillStyle = w.color;
                ctx.fillRect(sx + 8, slotY + 20, 40, 6);
                ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                ctx.lineWidth = 1;
                ctx.strokeRect(sx + 8, slotY + 20, 40, 6);

                // Weapon name
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 13px Arial';
                ctx.fillText(w.name, sx + 55, slotY + 27);

                // Ammo
                ctx.fillStyle = '#aaa';
                ctx.font = '11px Arial';
                ctx.fillText(`Ammo: ${w.ammo}/${w.magSize}`, sx + 8, slotY + 42);

                // Rarity
                ctx.fillStyle = w.rarity === 'rare' ? '#48f' : w.rarity === 'epic' ? '#c4f' : w.rarity === 'legendary' ? '#fc4' : '#aaa';
                ctx.font = '9px Arial';
                ctx.textAlign = 'right';
                ctx.fillText(w.rarity ? w.rarity.toUpperCase() : 'COMMON', sx + slotW - 8, slotY + 42);
                ctx.textAlign = 'left';
            } else {
                ctx.fillStyle = '#555';
                ctx.font = '12px Arial';
                ctx.fillText('Empty', sx + 8, slotY + 32);
            }

            // Drop button
            const dropY = slotY + slotH + 4;
            const dropHovered = this.hoveredSlot === (i + 2);
            if (w) {
                ctx.fillStyle = dropHovered ? 'rgba(255,80,80,0.3)' : 'rgba(255,80,80,0.1)';
                ctx.fillRect(sx, dropY, slotW, 22);
                ctx.strokeStyle = 'rgba(255,80,80,0.4)';
                ctx.lineWidth = 1;
                ctx.strokeRect(sx, dropY, slotW, 22);
                ctx.fillStyle = '#f88';
                ctx.font = '10px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('DROP', sx + slotW / 2, dropY + 15);
                ctx.textAlign = 'left';
            }
        }

        // Stats section
        const statsY = slotY + slotH + 40;

        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(panelX + 15, statsY, panelW - 30, 130);

        ctx.fillStyle = '#ec4';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('STATS', panelX + 25, statsY + 18);

        const statItems = [
            { label: 'Health', value: `${Math.ceil(player.health)} / ${player.maxHealth}`, color: player.health > 50 ? '#4c4' : '#c44' },
            { label: 'Armor', value: `${Math.ceil(player.armor)}`, color: '#48f' },
            { label: 'Helmet', value: `${Math.ceil(player.helmet)}`, color: '#8cf' },
            { label: 'Stamina', value: `${Math.ceil(player.stamina)} / ${player.maxStamina}`, color: '#fc4' },
            { label: 'Kills', value: `${player.kills}`, color: '#f44' },
            { label: 'Backpack', value: player.backpackLevel > 0 ? `Lv.${player.backpackLevel}` : 'None', color: '#a86' },
        ];

        for (let i = 0; i < statItems.length; i++) {
            const s = statItems[i];
            const row = Math.floor(i / 2);
            const col = i % 2;
            const sx = panelX + 25 + col * 190;
            const sy = statsY + 35 + row * 28;

            ctx.fillStyle = '#888';
            ctx.font = '11px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(s.label, sx, sy);

            ctx.fillStyle = s.color;
            ctx.font = 'bold 11px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(s.value, sx + 160, sy);
        }

        // Key hints
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Click weapon slot to equip | Click DROP to discard', cx, panelY + panelH - 15);
    }
}
