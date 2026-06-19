/**
 * Screen-space post-processing: an additive neon bloom and a soft vignette.
 *
 * Bloom is done the cheap-but-effective way for a dark, neon game: downscale the
 * rendered frame, blur it with the canvas `filter`, and add it back with the
 * `lighter` blend mode. Because the background is near-black, only the bright
 * vector shapes contribute meaningfully — giving everything a cohesive glow.
 *
 * Both passes are no-ops when disabled in settings or when `ctx.filter` is
 * unavailable, so they degrade gracefully.
 */

import { W, H } from '../core/constants';
import { settings } from '../systems/settings';

let bloomCanvas: HTMLCanvasElement | null = null;
let bloomCtx: CanvasRenderingContext2D | null = null;
let bw = 0;
let bh = 0;

let supported: boolean | null = null;
function bloomSupported(): boolean {
  if (supported !== null) return supported;
  try {
    const c = document.createElement('canvas');
    const cx = c.getContext('2d');
    supported = !!cx && typeof (cx as CanvasRenderingContext2D).filter === 'string';
  } catch {
    supported = false;
  }
  return supported;
}

/** Additive bloom over the current frame. Call after the world, before the HUD. */
export function applyBloom(ctx: CanvasRenderingContext2D): void {
  if (!settings.bloom || !bloomSupported()) return;
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  if (cw === 0 || ch === 0) return;

  // Half-resolution buffer keeps the blur cheap and naturally softer.
  const nw = Math.max(1, cw >> 1);
  const nh = Math.max(1, ch >> 1);
  if (!bloomCanvas) {
    bloomCanvas = document.createElement('canvas');
    bloomCtx = bloomCanvas.getContext('2d');
  }
  if (!bloomCtx) return;
  if (nw !== bw || nh !== bh) {
    bw = nw;
    bh = nh;
    bloomCanvas.width = bw;
    bloomCanvas.height = bh;
  }

  bloomCtx.setTransform(1, 0, 0, 1, 0, 0);
  bloomCtx.globalCompositeOperation = 'source-over';
  bloomCtx.clearRect(0, 0, bw, bh);
  bloomCtx.filter = 'blur(5px)';
  bloomCtx.drawImage(ctx.canvas, 0, 0, cw, ch, 0, 0, bw, bh);
  bloomCtx.filter = 'none';

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.8;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(bloomCanvas, 0, 0, bw, bh, 0, 0, cw, ch);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

/** Cinematic edge darkening. Drawn in logical space, under the HUD. */
export function applyVignette(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.36, W / 2, H / 2, W * 0.62);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.06)');
  g.addColorStop(1, 'rgba(2,4,8,0.46)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
