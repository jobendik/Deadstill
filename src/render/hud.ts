/**
 * Heads-up display and full-screen overlays: score, combo, wave banner, style
 * rank, ammo, bullet-time/rewind meters, floating popups and the death screen.
 *
 * Drawn after the shake transform is restored, so the HUD never jitters.
 */

import { W, H, TAU, COL } from '../core/constants';
import { rgba } from '../core/color';
import { clamp } from '../core/math';
import { GUNS, STYLE_COLS } from '../game/config';
import { settings } from '../systems/settings';
import type { Game } from '../game/Game';

export function drawHud(ctx: CanvasRenderingContext2D, g: Game, now: number): void {
  // Aim reticle — sits at the cursor/aim point, breathing and recoiling.
  if (g.state === 'play' && g.player.gun) {
    const c = GUNS[g.player.gun.type].color;
    const recoil = clamp(g.fireCd / GUNS[g.player.gun.type].cd, 0, 1);
    const rr = 9 + recoil * 7 + Math.sin(now * 4) * 0.8;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(c, 0.5);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(g.aimX, g.aimY, rr, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    for (const d of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      ctx.moveTo(g.aimX + Math.cos(d) * (rr + 2), g.aimY + Math.sin(d) * (rr + 2));
      ctx.lineTo(g.aimX + Math.cos(d) * (rr + 6), g.aimY + Math.sin(d) * (rr + 6));
    }
    ctx.stroke();
    ctx.fillStyle = rgba(c, 0.9);
    ctx.beginPath();
    ctx.arc(g.aimX, g.aimY, 1.3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Score
  ctx.fillStyle = COL.white;
  ctx.font = '900 34px ui-monospace,monospace';
  ctx.fillText(g.score.toLocaleString(), 24, 50);
  ctx.fillStyle = COL.muted;
  ctx.font = '700 11px ui-monospace,monospace';
  ctx.fillText('SCORE', 26, 66);
  if (g.combo > 1) {
    const cl = clamp(g.comboTimer / 2.4, 0, 1);
    // Punch the counter right after a kill (comboTimer freshly reset to 2.4).
    const punch = clamp((g.comboTimer - 2.05) / 0.35, 0, 1);
    const cz = 22 + punch * 9;
    ctx.fillStyle = COL.gold;
    ctx.shadowColor = COL.gold;
    ctx.shadowBlur = 6 + punch * 12;
    ctx.font = '900 ' + cz.toFixed(0) + 'px ui-monospace,monospace';
    ctx.fillText('x' + g.combo, 24, 92);
    ctx.shadowBlur = 0;
    ctx.fillStyle = rgba(COL.gold, 0.25);
    ctx.fillRect(24, 98, 90, 4);
    ctx.fillStyle = COL.gold;
    ctx.fillRect(24, 98, 90 * cl, 4);
  }

  // Wave
  ctx.textAlign = 'center';
  ctx.fillStyle = rgba(COL.cyan, 0.9);
  ctx.font = '800 16px ui-monospace,monospace';
  ctx.fillText('WAVE ' + g.wave, W / 2, 34);
  if (!g.waveActive && g.state === 'play') {
    ctx.fillStyle = rgba(COL.muted, 0.8);
    ctx.font = '700 12px ui-monospace,monospace';
    ctx.fillText('clear — keep moving', W / 2, 52);
  }

  // Style rank (top right)
  const rank = g.getStyleRank();
  const rc = STYLE_COLS[rank] || COL.white;
  ctx.textAlign = 'right';
  ctx.fillStyle = rgba(rc, 0.92);
  ctx.font = '900 ' + (rank.length > 2 ? '34' : '42') + 'px ui-monospace,monospace';
  ctx.shadowColor = rc;
  ctx.shadowBlur = rank === 'SSS' ? 28 : rank === 'SS' ? 16 : 8;
  ctx.fillText(rank, W - 24, 56);
  ctx.shadowBlur = 0;
  const sbw = 108;
  const sbx = W - 132;
  const sby = 66;
  ctx.fillStyle = rgba(rc, 0.12);
  ctx.fillRect(sbx, sby, sbw, 4);
  const styleGrad = ctx.createLinearGradient(sbx, 0, sbx + sbw, 0);
  styleGrad.addColorStop(0, rgba(rc, 0.5));
  styleGrad.addColorStop(1, rc);
  ctx.fillStyle = styleGrad;
  ctx.fillRect(sbx, sby, sbw * (g.style / 100), 4);
  // tick marks at rank thresholds
  ctx.fillStyle = rgba(COL.bg, 0.6);
  for (const thr of [14, 30, 50, 70, 85, 95]) {
    ctx.fillRect(sbx + sbw * (thr / 100), sby, 1, 4);
  }
  ctx.fillStyle = rgba(COL.muted, 0.5);
  ctx.font = '700 9px ui-monospace,monospace';
  ctx.textAlign = 'right';
  ctx.fillText('STYLE', sbx - 3, sby + 4);

  // Ghost count
  if (g.ghosts.length > 0) {
    ctx.fillStyle = rgba(COL.echo, 0.8);
    ctx.font = '800 12px ui-monospace,monospace';
    ctx.fillText('ECHO ×' + g.ghosts.length, W - 24, 86);
  }

  // Ammo (bottom left)
  ctx.textAlign = 'left';
  const p = g.player;
  if (p.gun) {
    const g2 = GUNS[p.gun.type];
    ctx.fillStyle = g2.color;
    ctx.font = '800 13px ui-monospace,monospace';
    ctx.fillText(p.gun.type.toUpperCase(), 24, H - 38);
    for (let i = 0; i < g2.ammo; i++) {
      ctx.fillStyle = i < p.gun.ammo ? g2.color : rgba(g2.color, 0.18);
      ctx.fillRect(24 + i * 11, H - 30, 7, 12);
    }
  } else {
    ctx.fillStyle = COL.amber;
    ctx.font = '800 13px ui-monospace,monospace';
    ctx.fillText('UNARMED — grab a gun', 24, H - 24);
  }

  // BT meter (above ammo)
  const btmx = 24;
  const btmy = H - 52;
  const btmw = 72;
  ctx.fillStyle = rgba(COL.good, 0.14);
  ctx.fillRect(btmx, btmy, btmw, 4);
  ctx.fillStyle = g.btOn ? rgba(COL.good, 1) : rgba(COL.good, 0.55);
  ctx.fillRect(btmx, btmy, btmw * g.btMeter, 4);
  ctx.fillStyle = rgba(COL.good, g.btOn ? 0.9 : 0.35);
  ctx.font = '700 9px ui-monospace,monospace';
  ctx.textAlign = 'left';
  ctx.fillText('Q·BT', btmx, btmy - 2);

  // Rewind charges (bottom right)
  for (let i = 0; i < g.maxCharge; i++) {
    const on = i < g.charges;
    ctx.fillStyle = on ? COL.violet : rgba(COL.violet, 0.18);
    ctx.shadowColor = on ? COL.violet : 'transparent';
    ctx.shadowBlur = on ? 8 : 0;
    ctx.beginPath();
    ctx.arc(W - 24 - (g.maxCharge - 1 - i) * 16 - 6, H - 30, 5, 0, TAU);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.textAlign = 'right';
  ctx.fillStyle = COL.violet;
  ctx.font = '800 12px ui-monospace,monospace';
  ctx.fillText('REWIND', W - 24 - g.maxCharge * 16 - 8, H - 26);

  // Time status
  ctx.textAlign = 'center';
  ctx.fillStyle = rgba(g.btOn ? COL.good : COL.muted, g.ts < 0.12 || g.btOn ? 0.9 : 0.4);
  ctx.font = '700 10px ui-monospace,monospace';
  ctx.fillText(
    g.btOn
      ? '· BULLET TIME ·'
      : g.dashT > 0
        ? '· DASH ·'
        : g.ts < 0.12
          ? '· TIME FROZEN ·'
          : g.ts > 0.8
            ? '· TIME FLOWING ·'
            : '· · ·',
    W / 2,
    H - 12,
  );

  // Hit flash
  if (g.hitstop > 0) {
    ctx.fillStyle = rgba(COL.white, clamp(g.hitstop / 0.14, 0, 1) * 0.1);
    ctx.fillRect(0, 0, W, H);
  }
  // Death flash — a hard red punch the instant you go down.
  if (g.killFlash > 0) {
    const kf = clamp(g.killFlash / 0.5, 0, 1) * (settings.reducedMotion ? 0.4 : 1);
    ctx.fillStyle = rgba(COL.hot, kf * 0.28);
    ctx.fillRect(0, 0, W, H);
  }

  // Popups
  for (const u of g.popups) {
    const a = clamp(u.life / u.max, 0, 1);
    ctx.fillStyle = rgba(u.color, a);
    ctx.font = '800 14px ui-monospace,monospace';
    ctx.textAlign = 'center';
    ctx.fillText(u.text, u.x, u.y);
  }

  // Rewind / echo text bursts
  const flashMul = settings.reducedMotion ? 0.6 : 1;
  if (g.rewindFlash > 0) {
    const ra = clamp(g.rewindFlash / 0.5, 0, 1);
    ctx.textAlign = 'center';
    ctx.fillStyle = rgba(COL.violet, ra * 0.9 * flashMul);
    ctx.font = '900 52px ui-monospace,monospace';
    ctx.shadowColor = COL.violet;
    ctx.shadowBlur = 30 * ra;
    ctx.fillText('REWIND', W / 2, H * 0.28);
    ctx.shadowBlur = 0;
  }
  if (g.echoFlash > 0) {
    const ea = clamp(g.echoFlash / 0.38, 0, 1);
    ctx.textAlign = 'center';
    ctx.fillStyle = rgba(COL.echo, ea * 0.9 * flashMul);
    ctx.font = '900 34px ui-monospace,monospace';
    ctx.shadowColor = COL.echo;
    ctx.shadowBlur = 20 * ea;
    ctx.fillText('ECHO CREATED', W / 2, H * 0.22);
    ctx.shadowBlur = 0;
  }

  // Death screen
  if (g.state === 'dead') {
    ctx.fillStyle = rgba('#000000', 0.5);
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = COL.hot;
    ctx.font = '900 56px ui-monospace,monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DOWN', W / 2, H / 2 - 26);
    const can = g.charges > 0;
    ctx.fillStyle = can ? COL.violet : COL.gold;
    ctx.font = '800 20px ui-monospace,monospace';
    ctx.fillText(
      can ? 'REWIND  —  R / Space  (' + g.charges + ' left)' : 'WATCH AD TO REWIND',
      W / 2,
      H / 2 + 18,
    );
    const bw = 260;
    const bx = W / 2 - bw / 2;
    const t = clamp(g.deathBar / (can ? 3.0 : 2.4), 0, 1);
    ctx.fillStyle = rgba(COL.white, 0.15);
    ctx.fillRect(bx, H / 2 + 36, bw, 6);
    ctx.fillStyle = can ? COL.violet : COL.gold;
    ctx.fillRect(bx, H / 2 + 36, bw * t, 6);
    ctx.fillStyle = rgba(COL.muted, 0.8);
    ctx.font = '700 12px ui-monospace,monospace';
    ctx.fillText('Esc to end run', W / 2, H / 2 + 66);
  }
  if (g.state === 'over') {
    ctx.fillStyle = rgba('#000000', 0.55);
    ctx.fillRect(0, 0, W, H);
  }
}
