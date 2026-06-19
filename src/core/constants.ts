/**
 * Core constants: the fixed logical resolution the game is authored against,
 * the playable arena bounds, and the shared colour palette.
 *
 * The game always simulates and draws in a 960x600 logical coordinate space.
 * The canvas backing store is scaled to the device for crisp rendering, but the
 * gameplay never has to think about pixels — only these logical units.
 */

/** Logical game width. */
export const W = 960;
/** Logical game height. */
export const H = 600;
/** Arena padding from the canvas edge. */
export const PAD = 26;

/** Arena bounds (inclusive playfield rectangle). */
export const AX0 = PAD;
export const AY0 = PAD;
export const AX1 = W - PAD;
export const AY1 = H - PAD;
export const AW = AX1 - AX0;
export const AH = AY1 - AY0;

/** Two pi — used constantly for arcs and angles. */
export const TAU = Math.PI * 2;

/** True when a point sits inside the arena, optionally inset by `m`. */
export function inArena(x: number, y: number, m = 0): boolean {
  return x > AX0 + m && x < AX1 - m && y > AY0 + m && y < AY1 - m;
}

/** Shared colour palette (hex strings). Mirrors the CSS custom properties. */
export const COL = {
  bg: '#05070d',
  bg2: '#0a0f1c',
  white: '#eaf2ff',
  muted: '#7e93ad',
  dim: '#3c4b60',
  cyan: '#5fe6ff',
  hot: '#ff4d4d',
  amber: '#ffb13d',
  violet: '#b98cff',
  good: '#66ffb2',
  gold: '#ffd45e',
  teal: '#3dffd0',
  echo: '#6688ff',
} as const;

export type ColorKey = keyof typeof COL;
