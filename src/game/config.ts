/** Tunable gameplay configuration: weapons, the style system, and wave pacing. */

import { COL } from '../core/constants';
import type { GunSpec, GunType } from '../core/types';

/** Weapon definitions. */
export const GUNS: Record<GunType, GunSpec> = {
  pistol: { ammo: 10, pellets: 1, spread: 0.0, speed: 780, cd: 0.14, color: COL.cyan },
  shotgun: { ammo: 6, pellets: 5, spread: 0.3, speed: 640, cd: 0.42, color: COL.amber },
  rifle: { ammo: 5, pellets: 1, spread: 0.0, speed: 1340, cd: 0.4, color: COL.good },
};

/** Style meter ranks from lowest to highest. */
export const STYLE_RANKS = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'] as const;
export type StyleRank = (typeof STYLE_RANKS)[number];

/** Minimum style value required to reach each rank (parallel to STYLE_RANKS). */
export const STYLE_THRESH = [0, 14, 30, 50, 70, 85, 95] as const;

/** Colour used to display each rank. */
export const STYLE_COLS: Record<StyleRank, string> = {
  D: COL.muted,
  C: COL.white,
  B: COL.cyan,
  A: COL.good,
  S: COL.amber,
  SS: COL.hot,
  SSS: COL.violet,
};
