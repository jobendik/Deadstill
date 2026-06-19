/**
 * World rendering: everything inside the arena that participates in screen
 * shake — background, grid, entities, projectiles, echoes and the player.
 *
 * Reads game state but never mutates it. The whole pass is wrapped in a shake
 * transform whose magnitude respects the player's screen-shake setting.
 */

import { W, H, AX0, AY0, AX1, AY1, AW, AH, TAU, COL } from '../core/constants';
import { rgba, mix } from '../core/color';
import { clamp, lerp, len, smooth } from '../core/math';
import { GUNS } from '../game/config';
import { settings } from '../systems/settings';
import type { EnemyType } from '../core/types';
import type { Game } from '../game/Game';

const SPAWN_COLORS: Record<EnemyType, string> = {
  gunner: COL.hot,
  rusher: COL.amber,
  sniper: COL.violet,
  timehunter: COL.gold,
  shield: COL.teal,
};

/** Stylised gun glyph used for pickups (on the floor and in flight). */
export function drawGunIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ang: number,
  color: string,
  scale: number,
  glow: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.scale(scale, scale);
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  ctx.fillStyle = color;
  ctx.fillRect(-7, -3, 13, 6);
  ctx.fillRect(3, -1.5, 9, 3);
  ctx.fillRect(-7, 1, 4, 5);
  ctx.shadowBlur = 0;
  ctx.restore();
}

export function drawScene(ctx: CanvasRenderingContext2D, g: Game, now: number): void {
  const warm = clamp((g.ts - 0.1) / 0.9, 0, 1);
  const btP = g.btOn ? 0.5 + 0.5 * Math.sin(now * 22) : 0;
  const flashMul = settings.reducedMotion ? 0.4 : 1;

  // Background
  const grd = ctx.createRadialGradient(W / 2, H * 0.42, 60, W / 2, H * 0.5, W * 0.7);
  grd.addColorStop(0, mix(COL.bg2, g.btOn ? COL.good : COL.hot, g.btOn ? btP * 0.07 : warm * 0.1));
  grd.addColorStop(1, COL.bg);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  const sh = g.shake * settings.screenShake;
  const sx = (Math.random() * 2 - 1) * sh;
  const sy = (Math.random() * 2 - 1) * sh;
  ctx.save();
  ctx.translate(sx, sy);

  // Grid
  ctx.strokeStyle = rgba(g.btOn ? COL.good : COL.cyan, g.btOn ? 0.06 : 0.035 + warm * 0.04);
  ctx.lineWidth = 1;
  const step = 40;
  const dr = (now * 16 * g.ts) % step;
  ctx.beginPath();
  for (let x = AX0 - (dr | 0); x <= AX1; x += step) {
    ctx.moveTo(x, AY0);
    ctx.lineTo(x, AY1);
  }
  for (let y = AY0; y <= AY1; y += step) {
    ctx.moveTo(AX0, y);
    ctx.lineTo(AX1, y);
  }
  ctx.stroke();

  // Arena border
  const bc = g.btOn ? mix(COL.good, COL.cyan, btP) : mix(COL.cyan, COL.hot, warm);
  ctx.strokeStyle = rgba(bc, 0.5);
  ctx.lineWidth = 2;
  ctx.shadowColor = rgba(bc, 0.4);
  ctx.shadowBlur = 14;
  ctx.strokeRect(AX0, AY0, AW, AH);
  ctx.shadowBlur = 0;

  // BT flash
  if (g.btFlash > 0) {
    ctx.fillStyle = rgba(COL.good, g.btFlash * 0.14 * flashMul);
    ctx.fillRect(AX0, AY0, AW, AH);
  }
  // Rewind flash
  if (g.rewindFlash > 0) {
    const ra = clamp(g.rewindFlash / 0.5, 0, 1);
    ctx.fillStyle = rgba(COL.violet, ra * 0.2 * flashMul);
    ctx.fillRect(AX0, AY0, AW, AH);
    if (!settings.reducedMotion) {
      ctx.strokeStyle = rgba(COL.violet, ra * 0.35);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = AY0; y < AY1; y += 4) {
        ctx.moveTo(AX0, y);
        ctx.lineTo(AX1, y);
      }
      ctx.stroke();
    }
  }
  // Echo flash
  if (g.echoFlash > 0) {
    const ea = clamp(g.echoFlash / 0.38, 0, 1);
    ctx.fillStyle = rgba(COL.echo, ea * 0.16 * flashMul);
    ctx.fillRect(AX0, AY0, AW, AH);
  }

  // Spawn warnings
  for (const s of g.spawns) {
    if (s.delay < 0.8) {
      const t = (0.8 - s.delay) / 0.8;
      const r = lerp(42, 16, t);
      const c = SPAWN_COLORS[s.type] || COL.white;
      ctx.strokeStyle = rgba(c, 0.4 + 0.4 * Math.sin(now * 16));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = rgba(c, 0.8);
      ctx.font = '800 16px ui-monospace,monospace';
      ctx.textAlign = 'center';
      ctx.fillText('!', s.x, s.y + 5);
    }
  }

  // Pickups (on floor)
  for (const k of g.pickups) {
    if (k.thrown) continue;
    const c = GUNS[k.type].color;
    ctx.globalAlpha = 0.85;
    drawGunIcon(ctx, k.x, k.y, 0.5, c, 1.0, 8);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = rgba(c, 0.25);
    ctx.beginPath();
    ctx.arc(k.x, k.y, 15, 0, TAU);
    ctx.stroke();
  }

  // Sniper laser
  for (const e of g.enemies) {
    if (e.type !== 'sniper') continue;
    const dir = e.dirAng ?? 0;
    if (e.phase === 'charge') {
      const t = 1 - clamp((e.chargeT ?? 0) / 0.8, 0, 1);
      const ex = e.x + Math.cos(dir) * 1600;
      const ey = e.y + Math.sin(dir) * 1600;
      ctx.strokeStyle = rgba(COL.violet, 0.15 + 0.5 * t);
      ctx.lineWidth = 1 + 3 * t;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    if (e.beam > 0) {
      const ex = e.x + Math.cos(dir) * 1600;
      const ey = e.y + Math.sin(dir) * 1600;
      ctx.strokeStyle = rgba(COL.white, clamp(e.beam / 0.15, 0, 1));
      ctx.lineWidth = 6;
      ctx.shadowColor = COL.violet;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  // Enemy bullets
  for (const b of g.ebul) {
    const l = len(b.vx, b.vy) || 1;
    ctx.strokeStyle = rgba(COL.hot, 0.5);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - (b.vx / l) * 10, b.y - (b.vy / l) * 10);
    ctx.stroke();
    ctx.fillStyle = mix(COL.hot, COL.white, 0.3);
    ctx.shadowColor = COL.hot;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3.4, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Ghost bullets (blue echo bullets)
  for (const b of g.ghostBullets) {
    ctx.strokeStyle = rgba(COL.echo, 0.65);
    ctx.lineWidth = b.big ? 3 : 2;
    ctx.shadowColor = COL.echo;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(b.px, b.py);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.fillStyle = b.big ? COL.violet : COL.echo;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.big ? 4 : 2.4, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Enemies
  for (const e of g.enemies) {
    const sc = 0.4 + 0.6 * smooth(e.bornT);
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(sc, sc);
    if (e.type === 'gunner') {
      ctx.rotate(e.ang);
      ctx.fillStyle = COL.hot;
      ctx.shadowColor = COL.hot;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(13, 0);
      ctx.lineTo(-9, -10);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-9, 10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = mix(COL.hot, COL.white, 0.4);
      ctx.fillRect(6, -2, 10, 4);
      ctx.shadowBlur = 0;
    } else if (e.type === 'rusher') {
      ctx.rotate(e.ang);
      ctx.fillStyle = COL.amber;
      ctx.shadowColor = COL.amber;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(13, 0);
      ctx.lineTo(-7, -9);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-7, 9);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba(COL.white, 0.5);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-2, 0);
      ctx.lineTo(8, 0);
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (e.type === 'sniper') {
      ctx.strokeStyle = COL.violet;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = COL.violet;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.lineTo(-7, 0);
      ctx.moveTo(7, 0);
      ctx.lineTo(16, 0);
      ctx.moveTo(0, -16);
      ctx.lineTo(0, -7);
      ctx.moveTo(0, 7);
      ctx.lineTo(0, 16);
      ctx.stroke();
      ctx.fillStyle = COL.violet;
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (e.type === 'timehunter') {
      // Diamond, rotates in REAL time (unfazed by time dilation)
      ctx.restore();
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(sc, sc);
      const pulse = 0.7 + 0.3 * Math.sin(now * 8);
      ctx.rotate(now * 2.5);
      ctx.fillStyle = mix(COL.hot, COL.gold, 0.4);
      ctx.shadowColor = COL.gold;
      ctx.shadowBlur = 18 * pulse;
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.lineTo(13, 0);
      ctx.lineTo(0, 16);
      ctx.lineTo(-13, 0);
      ctx.closePath();
      ctx.fill();
      if (e.isElite) {
        ctx.strokeStyle = rgba(COL.gold, 0.8 * pulse);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, TAU);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    } else if (e.type === 'shield') {
      // Hexagon body
      ctx.fillStyle = COL.teal;
      ctx.shadowColor = COL.teal;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU - Math.PI / 6;
        ctx.lineTo(Math.cos(a) * 12, Math.sin(a) * 12);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(sc, sc);
      // Shield arc (in world space)
      ctx.strokeStyle = rgba(COL.teal, 0.85);
      ctx.lineWidth = 4;
      ctx.shadowColor = COL.teal;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(0, 0, 18, (e.shieldAng ?? 0) - 1.05, (e.shieldAng ?? 0) + 1.05);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  // Player bullets
  for (const b of g.pbul) {
    const c = GUNS[b.type] ? GUNS[b.type].color : COL.cyan;
    ctx.strokeStyle = rgba(mix(c, COL.white, 0.4), 0.85);
    ctx.lineWidth = 2.4;
    ctx.shadowColor = c;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(b.px, b.py);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.fillStyle = COL.white;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 2.6, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Thrown pickups
  for (const k of g.pickups) {
    if (!k.thrown) continue;
    const c = GUNS[k.type].color;
    ctx.strokeStyle = rgba(c, 0.4);
    ctx.lineWidth = 2;
    const l = len(k.vx, k.vy) || 1;
    ctx.beginPath();
    ctx.moveTo(k.x, k.y);
    ctx.lineTo(k.x - (k.vx / l) * 16, k.y - (k.vy / l) * 16);
    ctx.stroke();
    drawGunIcon(ctx, k.x, k.y, k.spin, mix(c, COL.white, 0.3), 1.1, 14);
  }

  // Temporal echoes (ghosts)
  for (const gh of g.ghosts) {
    if (gh.idx >= gh.script.length) continue;
    ctx.save();
    ctx.globalAlpha = 0.44;
    ctx.shadowColor = COL.echo;
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#2244bb';
    ctx.beginPath();
    ctx.arc(gh.x, gh.y, 11, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = rgba(COL.echo, 0.9);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(gh.x, gh.y);
    ctx.lineTo(gh.x + Math.cos(gh.ang) * 20, gh.y + Math.sin(gh.ang) * 20);
    ctx.stroke();
    ctx.strokeStyle = rgba(COL.echo, 0.35);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(gh.x, gh.y, 16 + Math.sin(now * 6) * 2, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Particles
  for (const q of g.particles) {
    const a = clamp(q.life / q.max, 0, 1);
    if (q.kind === 'spark') {
      ctx.strokeStyle = rgba(q.color, a);
      ctx.lineWidth = 2;
      const l = len(q.vx, q.vy) || 1;
      ctx.beginPath();
      ctx.moveTo(q.x, q.y);
      ctx.lineTo(q.x - (q.vx / l) * 6, q.y - (q.vy / l) * 6);
      ctx.stroke();
    } else {
      ctx.fillStyle = rgba(q.color, a * 0.95);
      ctx.beginPath();
      ctx.arc(q.x, q.y, 1.4 + 2.2 * a, 0, TAU);
      ctx.fill();
    }
  }

  // Muzzle flash
  if (g.muzzle) {
    const a = clamp(g.muzzle.life / 0.06, 0, 1);
    ctx.save();
    ctx.translate(g.muzzle.x, g.muzzle.y);
    ctx.rotate(g.muzzle.ang);
    ctx.fillStyle = rgba(COL.white, a * 0.9);
    ctx.shadowColor = COL.cyan;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(16, -6);
    ctx.lineTo(24, 0);
    ctx.lineTo(16, 6);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // Player
  const p = g.player;
  if (g.state === 'play' || g.state === 'dead') {
    const pc = COL.cyan;
    const blink = g.invuln > 0 && Math.floor(now * 20) % 2 === 0;
    ctx.globalAlpha = blink ? 0.4 : 1;
    if (g.dashT > 0) {
      ctx.strokeStyle = rgba(COL.cyan, 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 8 + g.dashT * 55, 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = p.gun ? mix(pc, COL.white, 0.2) : mix(pc, COL.dim, 0.4);
    ctx.shadowColor = pc;
    ctx.shadowBlur = g.dashT > 0 ? 22 : 16;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (p.gun) {
      ctx.strokeStyle = mix(pc, COL.white, 0.5);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(p.ang) * 20, p.y + Math.sin(p.ang) * 20);
      ctx.stroke();
    } else {
      ctx.strokeStyle = rgba(COL.amber, 0.7);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 6 + Math.sin(now * 6) * 2, 0, TAU);
      ctx.stroke();
    }
    // Dash cooldown arc
    if (g.dashCd > 0) {
      ctx.strokeStyle = rgba(COL.cyan, 0.55);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 9, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - g.dashCd / 0.72));
      ctx.stroke();
    }
    // BT ring
    if (g.btOn) {
      ctx.strokeStyle = rgba(COL.good, 0.5 + 0.3 * Math.sin(now * 18));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 14, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore(); // end shake
}
