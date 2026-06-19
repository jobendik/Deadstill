/**
 * Render orchestrator. Draws the world (with screen shake) then the HUD on top,
 * plus the animated idle background used behind the menus.
 */

import { W, H, AX0, AY0, AX1, AY1, AW, AH, TAU, COL } from '../core/constants';
import { rgba } from '../core/color';
import { drawScene } from './scene';
import { drawHud } from './hud';
import type { Game } from '../game/Game';

export function render(ctx: CanvasRenderingContext2D, g: Game, now: number): void {
  drawScene(ctx, g, now);
  drawHud(ctx, g);
}

/** Animated starfield/grid shown behind the title and menu screens. */
export function idleBackground(ctx: CanvasRenderingContext2D, now: number): void {
  const grd = ctx.createRadialGradient(W / 2, H * 0.4, 60, W / 2, H * 0.5, W * 0.7);
  grd.addColorStop(0, COL.bg2);
  grd.addColorStop(1, COL.bg);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = rgba(COL.cyan, 0.05);
  ctx.lineWidth = 1;
  const step = 40;
  const dr = (now * 10) % step;
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

  ctx.strokeStyle = rgba(COL.cyan, 0.4);
  ctx.lineWidth = 2;
  ctx.strokeRect(AX0, AY0, AW, AH);

  for (let i = 0; i < 14; i++) {
    const x = AX0 + ((i * 97 + now * 30) % AW);
    const y = AY0 + ((i * 53 + now * 16 + i * i) % AH);
    ctx.fillStyle = rgba(i % 2 ? COL.cyan : COL.violet, 0.25);
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, TAU);
    ctx.fill();
  }
}
