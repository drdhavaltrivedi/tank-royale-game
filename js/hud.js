// hud.js - Health bar, kill feed, alive count, inventory UI — Premium polished HUD

export class HUD {
    constructor() {
        this.killFeed = [];
        this.notifications = [];
        this._notifY = []; // animated Y positions
    }

    addKill(killer, victim) {
        this.killFeed.unshift({
            killer: killer ? killer.name : 'Zone',
            victim: victim.name,
            time: Date.now(),
            isPlayer: killer && killer.isPlayer || victim.isPlayer
        });
        if (this.killFeed.length > 6) this.killFeed.pop();
    }

    addNotification(text) {
        this.notifications.push({ text, time: Date.now(), alpha: 1, scale: 1.3, offsetY: -20 });
    }

    update(dt) {
        const now = Date.now();
        this.killFeed = this.killFeed.filter(k => now - k.time < 5000);

        this.notifications = this.notifications.filter(n => {
            n.alpha -= dt * 0.35;
            // Animate in
            n.scale = Math.max(1, n.scale - dt * 3);
            n.offsetY = Math.max(0, (n.offsetY || 0) + dt * 60);
            return n.alpha > 0;
        });
    }

    _roundedRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
    }

    draw(ctx, canvas, player, aliveCount, zone) {
        const W = canvas.width, H = canvas.height;

        // -- Armor bar (bottom center, above health) --
        const hpBarW = 220;
        const hpX = W / 2 - hpBarW / 2;
        const armorBarH = 8;
        const armorY = H - 76;

        if (player.armor > 0 || player.helmet > 0) {
            this._roundedRect(ctx, hpX - 2, armorY - 2, hpBarW + 4, armorBarH + 4, 4);
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fill();
            ctx.fillStyle = '#222';
            ctx.fillRect(hpX, armorY, hpBarW, armorBarH);
            // Armor gradient
            const armorGrd = ctx.createLinearGradient(hpX, armorY, hpX + hpBarW * (player.armor / 100), armorY);
            armorGrd.addColorStop(0, '#36a');
            armorGrd.addColorStop(1, '#5af');
            ctx.fillStyle = armorGrd;
            ctx.fillRect(hpX, armorY, hpBarW * (player.armor / 100), armorBarH);

            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.font = '9px Rajdhani, Arial';
            ctx.textAlign = 'center';
            const armorText = [];
            if (player.armor > 0) armorText.push(`🛡 ${Math.ceil(player.armor)}`);
            if (player.helmet > 0) armorText.push(`⛑ ${Math.ceil(player.helmet)}`);
            ctx.fillText(armorText.join('  ·  '), W / 2, armorY + 7);
        }

        // -- Stamina bar (thin bar below armor, above health) --
        if (player.stamina < player.maxStamina) {
            const staminaY = H - 60;
            this._roundedRect(ctx, hpX, staminaY, hpBarW, 4, 2);
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fill();
            const stGrd = ctx.createLinearGradient(hpX, staminaY, hpX + hpBarW * (player.stamina / player.maxStamina), staminaY);
            stGrd.addColorStop(0, '#e90');
            stGrd.addColorStop(1, '#fc4');
            ctx.fillStyle = stGrd;
            ctx.fillRect(hpX, staminaY, hpBarW * (player.stamina / player.maxStamina), 4);
        }

        // -- Health bar (bottom center) — rounded with gradient --
        const hpBarH = 18;
        const hpY = H - 52;
        this._roundedRect(ctx, hpX - 2, hpY - 2, hpBarW + 4, hpBarH + 4, 5);
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();

        const hpPct = player.health / player.maxHealth;
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(hpX, hpY, hpBarW, hpBarH);
        const hpGrd = ctx.createLinearGradient(hpX, hpY, hpX + hpBarW * hpPct, hpY + hpBarH);
        if (hpPct > 0.5) {
            hpGrd.addColorStop(0, '#2a8');
            hpGrd.addColorStop(1, '#4d4');
        } else if (hpPct > 0.25) {
            hpGrd.addColorStop(0, '#c80');
            hpGrd.addColorStop(1, '#ec4');
        } else {
            hpGrd.addColorStop(0, '#a22');
            hpGrd.addColorStop(1, '#e44');
        }
        ctx.fillStyle = hpGrd;
        ctx.fillRect(hpX, hpY, hpBarW * hpPct, hpBarH);

        // HP text
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Rajdhani, Arial';
        ctx.textAlign = 'center';
        const hiddenLabel = player.isHidden ? ' [HIDDEN]' : '';
        const stanceLabel = player.sprinting ? ' ⚡BOOST' : player.stance === 'crouching' ? ' ▼HULL DOWN' : player.stance === 'prone' ? ' ▬SIEGE' : '';
        const bushLabel = hiddenLabel || stanceLabel;
        const vehicleLabel = player.inVehicle ? ` 🚗${player.inVehicle.type.toUpperCase()}` : '';
        ctx.fillText(`${Math.ceil(player.health)} / ${player.maxHealth} HP${bushLabel}${vehicleLabel}`, W / 2, hpY + 13);

        // -- Weapon slots (bottom right) — modernized --
        const slotW = 110;
        const slotH = 38;
        const slotX = W - slotW - 18;
        for (let i = 0; i < 2; i++) {
            const sy = H - 94 + i * 44;
            const isActive = i === player.currentWeaponIdx;

            this._roundedRect(ctx, slotX, sy, slotW, slotH, 6);
            ctx.fillStyle = isActive ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.55)';
            ctx.fill();
            ctx.strokeStyle = isActive ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)';
            ctx.lineWidth = isActive ? 1.5 : 0.5;
            ctx.stroke();

            const w = player.weapons[i];
            // Slot number
            ctx.font = '9px Rajdhani, Arial';
            ctx.fillStyle = isActive ? '#fc4' : '#666';
            ctx.textAlign = 'left';
            ctx.fillText(`${i + 1}`, slotX + 5, sy + 12);

            if (w) {
                ctx.fillStyle = w.color;
                ctx.font = 'bold 12px Rajdhani, Arial';
                ctx.fillText(w.name, slotX + 18, sy + 14);
                const reserve = player.reserveAmmo ? (player.reserveAmmo[i] || 0) : null;
                ctx.fillStyle = w.ammo > 0 ? '#bbb' : '#f44';
                ctx.font = '11px Rajdhani, Arial';
                const reserveStr = reserve !== null ? ` +${reserve}` : '';
                ctx.fillText(`${w.ammo}/${w.magSize}${reserveStr}`, slotX + 18, sy + 29);

                // Ammo bar
                if (isActive) {
                    const ammoBarW = slotW - 36;
                    const ammoPct = w.ammo / w.magSize;
                    ctx.fillStyle = 'rgba(0,0,0,0.3)';
                    ctx.fillRect(slotX + 18, sy + 32, ammoBarW, 2);
                    ctx.fillStyle = ammoPct > 0.3 ? 'rgba(255,200,80,0.6)' : 'rgba(255,80,80,0.8)';
                    ctx.fillRect(slotX + 18, sy + 32, ammoBarW * ammoPct, 2);
                }

                if (isActive && player.reloading) {
                    ctx.fillStyle = '#fc4';
                    ctx.font = 'bold 9px Rajdhani, Arial';
                    ctx.fillText('⟳ RELOAD', slotX + 72, sy + 14);
                }
                if (isActive && reserve === 0 && w.ammo === 0) {
                    ctx.fillStyle = '#f44';
                    ctx.font = 'bold 9px Rajdhani, Arial';
                    ctx.fillText('⊘ EMPTY', slotX + 72, sy + 29);
                }
            } else {
                ctx.fillStyle = '#444';
                ctx.font = '11px Rajdhani, Arial';
                ctx.fillText('Empty', slotX + 18, sy + 22);
            }
        }

        // -- Healing items (below weapons) --
        const healY = H - 94 + 2 * 44;
        this._roundedRect(ctx, slotX, healY, slotW, 44, 5);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fill();

        ctx.fillStyle = '#f88';
        ctx.font = '10px Rajdhani, Arial';
        ctx.textAlign = 'left';
        ctx.fillText('3', slotX + 5, healY + 14);
        ctx.fillStyle = player.bandages > 0 ? '#faa' : '#555';
        ctx.font = 'bold 11px Rajdhani, Arial';
        ctx.fillText(`Bandage ×${player.bandages || 0}`, slotX + 18, healY + 14);

        ctx.fillStyle = '#e44';
        ctx.font = '10px Rajdhani, Arial';
        ctx.fillText('4', slotX + 5, healY + 30);
        ctx.fillStyle = player.medkits > 0 ? '#f66' : '#555';
        ctx.font = 'bold 11px Rajdhani, Arial';
        ctx.fillText(`Medkit ×${player.medkits || 0}`, slotX + 18, healY + 30);

        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.font = '8px Rajdhani, Arial';
        ctx.fillText('Hold 3/4 to heal', slotX + 5, healY + 41);

        // -- Grenade count --
        let extraY = healY + 48;
        if (player.grenades !== undefined) {
            this._roundedRect(ctx, slotX, extraY, slotW, 22, 4);
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fill();
            ctx.fillStyle = '#5a5';
            ctx.font = '10px Rajdhani, Arial';
            ctx.textAlign = 'left';
            ctx.fillText('G', slotX + 5, extraY + 15);
            ctx.fillStyle = player.grenades > 0 ? '#8c8' : '#555';
            ctx.font = 'bold 11px Rajdhani, Arial';
            ctx.fillText(`Frag ×${player.grenades}`, slotX + 18, extraY + 15);
            extraY += 24;
        }

        if (player.smokeGrenades !== undefined) {
            this._roundedRect(ctx, slotX, extraY, slotW, 22, 4);
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fill();
            ctx.fillStyle = '#888';
            ctx.font = '10px Rajdhani, Arial';
            ctx.textAlign = 'left';
            ctx.fillText('H', slotX + 5, extraY + 15);
            ctx.fillStyle = player.smokeGrenades > 0 ? '#bbb' : '#555';
            ctx.font = 'bold 11px Rajdhani, Arial';
            ctx.fillText(`Smoke ×${player.smokeGrenades}`, slotX + 18, extraY + 15);
            extraY += 24;
        }

        if (player.mines !== undefined) {
            this._roundedRect(ctx, slotX, extraY, slotW, 22, 4);
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fill();
            ctx.fillStyle = '#666';
            ctx.font = '10px Rajdhani, Arial';
            ctx.textAlign = 'left';
            ctx.fillText('M', slotX + 5, extraY + 15);
            ctx.fillStyle = player.mines > 0 ? '#aaa' : '#555';
            ctx.font = 'bold 11px Rajdhani, Arial';
            ctx.fillText(`Mine ×${player.mines}`, slotX + 18, extraY + 15);
            extraY += 24;
        }

        if (player.backpackLevel !== undefined) {
            this._roundedRect(ctx, slotX, extraY, slotW, 20, 4);
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fill();
            const bpColors = ['#444', '#a86', '#86a', '#da6'];
            ctx.fillStyle = bpColors[player.backpackLevel] || '#444';
            ctx.font = 'bold 10px Rajdhani, Arial';
            ctx.textAlign = 'left';
            ctx.fillText(player.backpackLevel > 0 ? `🎒 Backpack Lv.${player.backpackLevel}` : '🎒 No Backpack', slotX + 5, extraY + 14);
        }

        // -- Healing progress bar (center screen) --
        if (player.isHealing) {
            const progW = 180;
            const progH = 16;
            const progX = W / 2 - progW / 2;
            const progY = H - 108;

            this._roundedRect(ctx, progX - 2, progY - 2, progW + 4, progH + 4, 6);
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(progX, progY, progW, progH);

            const healGrd = ctx.createLinearGradient(progX, progY, progX + progW * player.healProgress, progY);
            if (player.healType === 'medkit') {
                healGrd.addColorStop(0, '#c22');
                healGrd.addColorStop(1, '#f44');
            } else {
                healGrd.addColorStop(0, '#d66');
                healGrd.addColorStop(1, '#faa');
            }
            ctx.fillStyle = healGrd;
            ctx.fillRect(progX, progY, progW * player.healProgress, progH);

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px Rajdhani, Arial';
            ctx.textAlign = 'center';
            const healLabel = player.healType === 'medkit' ? '❤ Using Medkit...' : '🩹 Using Bandage...';
            const timeLeft = ((1 - player.healProgress) * player.healDuration).toFixed(1);
            ctx.fillText(`${healLabel} ${timeLeft}s`, W / 2, progY + 12);
        }

        // -- Alive count + kills (top center) — pill-shaped --
        const pillW = 160, pillH = 42;
        const pillX = W / 2 - pillW / 2, pillY = 10;
        this._roundedRect(ctx, pillX, pillY, pillW, pillH, 10);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 15px Rajdhani, Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`👤 ${aliveCount}  Alive`, W / 2, pillY + 18);

        ctx.fillStyle = '#fc4';
        ctx.font = 'bold 12px Rajdhani, Arial';
        ctx.fillText(`⚔ ${player.kills} Kills`, W / 2, pillY + 34);

        // -- Zone timer (below alive pill) --
        ctx.fillStyle = 'rgba(0,200,255,0.75)';
        ctx.font = '11px Rajdhani, Arial';
        ctx.fillText(zone.getStatusText(), W / 2, pillY + pillH + 15);

        // -- Kill feed (top right) — modernized cards --
        ctx.textAlign = 'right';
        for (let i = 0; i < this.killFeed.length; i++) {
            const k = this.killFeed[i];
            const fy = 54 + i * 24;
            const age = (Date.now() - k.time) / 5000;
            const alpha = Math.max(0, 1 - age);
            if (alpha <= 0) continue;

            const feedW = 200;
            const feedX = W - 15;

            this._roundedRect(ctx, feedX - feedW, fy - 8, feedW, 20, 4);
            ctx.fillStyle = k.isPlayer ? `rgba(40,20,0,${0.6 * alpha})` : `rgba(0,0,0,${0.5 * alpha})`;
            ctx.fill();

            ctx.font = '11px Rajdhani, Arial';
            ctx.fillStyle = k.isPlayer ? `rgba(255,200,50,${alpha})` : `rgba(200,200,200,${alpha})`;
            ctx.textAlign = 'right';
            ctx.fillText(`${k.killer} ⊳ ${k.victim}`, feedX - 6, fy + 5);
        }

        // -- Notifications (center, animated) --
        let nIdx = 0;
        for (const n of this.notifications) {
            const alpha = Math.min(1, n.alpha * 2);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.font = `bold ${Math.round(18 * n.scale)}px Rajdhani, Arial`;
            ctx.textAlign = 'center';
            // Outline
            ctx.strokeStyle = 'rgba(0,0,0,0.6)';
            ctx.lineWidth = 3;
            ctx.strokeText(n.text, W / 2, H / 2 - 60 + nIdx * 26);
            ctx.fillStyle = '#fff';
            ctx.fillText(n.text, W / 2, H / 2 - 60 + nIdx * 26);
            ctx.restore();
            nIdx++;
        }

        // -- Controls hint (bottom left, subtle) --
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.font = '10px Rajdhani, Arial';
        ctx.textAlign = 'left';
        ctx.fillText('WASD Move · Shift Boost · C Crouch · Z Prone · Q Swap · R Reload · F Pick · E Vehicle · G Frag · H Smoke · M Mine · 3 Bandage · 4 Medkit · Tab Inv', 10, H - 8);
    }

    drawKillFeedOnly(ctx, canvas) {
        ctx.textAlign = 'right';
        for (let i = 0; i < this.killFeed.length; i++) {
            const k = this.killFeed[i];
            const fy = 80 + i * 24;
            const age = (Date.now() - k.time) / 5000;
            const alpha = 1 - age;
            if (alpha <= 0) continue;
            const feedW = 200;
            const feedX = canvas.width - 15;
            ctx.beginPath();
            ctx.roundRect(feedX - feedW, fy - 8, feedW, 20, 4);
            ctx.fillStyle = `rgba(0,0,0,${0.5 * alpha})`;
            ctx.fill();
            ctx.font = '11px Rajdhani, Arial';
            ctx.fillStyle = `rgba(200,200,200,${alpha})`;
            ctx.fillText(`${k.killer} ⊳ ${k.victim}`, feedX - 6, fy + 5);
        }
    }
}
