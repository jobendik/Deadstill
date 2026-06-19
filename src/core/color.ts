/** Colour helpers: hex parsing, rgba strings, and hex-to-hex mixing. */

import { clamp, lerp } from './math';

/** Parse a `#rrggbb` string into an [r, g, b] tuple. */
export function rgb(h: string): [number, number, number] {
  h = h.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/** Build an `rgba(...)` string from a hex colour and alpha. */
export function rgba(h: string, a: number): string {
  const c = rgb(h);
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

/** Mix two hex colours, returning a new `#rrggbb` string. */
export function mix(a: string, b: string, t: number): string {
  const A = rgb(a);
  const B = rgb(b);
  const f = (n: number): string => {
    const v = isFinite(n) ? Math.round(clamp(n, 0, 255)) : 0;
    return ('0' + v.toString(16)).slice(-2);
  };
  return (
    '#' +
    f(lerp(A[0], B[0], t)) +
    f(lerp(A[1], B[1], t)) +
    f(lerp(A[2], B[2], t))
  );
}
