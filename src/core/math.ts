/** Small, allocation-free math helpers used throughout the game. */

/** Clamp `v` into the inclusive range [a, b]. */
export const clamp = (v: number, a: number, b: number): number =>
  v < a ? a : v > b ? b : v;

/** Linear interpolation between a and b by t. */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Smoothstep easing (clamped to 0..1). */
export const smooth = (t: number): number => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};

/** Vector length. */
export const len = (x: number, y: number): number => Math.hypot(x, y);

/** Distance between two points. */
export const dist = (ax: number, ay: number, bx: number, by: number): number =>
  Math.hypot(ax - bx, ay - by);

/** Random float. `rnd(n)` -> [0, n); `rnd(a, b)` -> [a, b). */
export function rnd(a = 1, b?: number): number {
  return b === undefined ? Math.random() * a : a + Math.random() * (b - a);
}

/** Random integer in the inclusive range [a, b]. */
export const rndi = (a: number, b: number): number =>
  (a + Math.random() * (b - a + 1)) | 0;

/** Pick a random element from an array. */
export const pick = <T>(a: readonly T[]): T => a[(Math.random() * a.length) | 0];

/** Move `v` toward target `t` by at most rate `r`. */
export const approach = (v: number, t: number, r: number): number =>
  v < t ? Math.min(t, v + r) : Math.max(t, v - r);

/** Angle (radians) from point A to point B. */
export function angTo(ax: number, ay: number, bx: number, by: number): number {
  return Math.atan2(by - ay, bx - ax);
}
