/** Shared type definitions for every entity the simulation tracks. */

export type GunType = 'pistol' | 'shotgun' | 'rifle';

/** Static configuration for a weapon. */
export interface GunSpec {
  ammo: number;
  pellets: number;
  spread: number;
  speed: number;
  cd: number;
  color: string;
}

/** A weapon instance held by the player (or lying on the floor). */
export interface PlayerGun {
  type: GunType;
  ammo: number;
}

export interface Player {
  x: number;
  y: number;
  r: number;
  ang: number;
  speed: number;
  gun: PlayerGun | null;
}

export type EnemyType = 'gunner' | 'rusher' | 'sniper' | 'timehunter' | 'shield';

/** A live enemy. Fields beyond the core set are per-archetype and optional. */
export interface Enemy {
  type: EnemyType;
  x: number;
  y: number;
  ang: number;
  alive: boolean;
  bornT: number;
  vx: number;
  vy: number;
  invuln: number;
  beam: number;
  r: number;
  // archetype-specific
  cd?: number;
  desired?: number;
  strafe?: number;
  phase?: 'rest' | 'charge';
  chargeT?: number;
  dirAng?: number;
  fromX?: number;
  fromY?: number;
  shieldAng?: number;
  isElite?: boolean;
}

/** Player projectile (carries its previous position for trail rendering). */
export interface PBullet {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  life: number;
  type: GunType;
}

/** Enemy projectile. */
export interface EBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

/** Projectile fired by a temporal echo. */
export interface GhostBullet {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  life: number;
  big?: boolean;
}

/** A weapon pickup on the floor or in flight (thrown). */
export interface Pickup {
  type: GunType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  thrown: boolean;
  spin: number;
  life: number;
  dead?: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  kind: 'gib' | 'spark';
}

export interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  max: number;
}

export interface Muzzle {
  x: number;
  y: number;
  ang: number;
  life: number;
}

/** A single recorded frame of the player's past, replayed by an echo. */
export interface GhostFrame {
  x: number;
  y: number;
  ang: number;
  fired: boolean;
  firedType: GunType | null;
  threw: boolean;
}

/** A temporal echo: a recording of the player's past that re-enacts its run. */
export interface Ghost {
  x: number;
  y: number;
  ang: number;
  script: GhostFrame[];
  idx: number;
}

export interface Spawn {
  type: EnemyType;
  x: number;
  y: number;
  delay: number;
}

/** Per-frame player intent, produced by the input layer. */
export interface Command {
  mx: number;
  my: number;
  ax: number;
  ay: number;
  fire: boolean;
  thrw: boolean;
  dash: boolean;
  bt: boolean;
}

/** Style/score bonus tags applied when an enemy dies. */
export interface KillFlags {
  ghost?: boolean;
  disarm?: boolean;
  longshot?: boolean;
  dash?: boolean;
}

/** Frozen copy of an enemy used inside a rewind snapshot. */
export interface EnemySnapshot {
  type: EnemyType;
  x: number;
  y: number;
  ang: number;
  bornT: number;
  vx: number;
  vy: number;
  r: number;
  cd?: number;
  desired?: number;
  strafe?: number;
  phase?: 'rest' | 'charge';
  chargeT?: number;
  dirAng?: number;
  fromX?: number;
  fromY?: number;
  beam?: number;
  shieldAng?: number;
  invuln?: number;
}

/** One frame of full game state, kept so the player can rewind into it. */
export interface HistorySnapshot {
  px: number;
  py: number;
  pang: number;
  gun: PlayerGun | null;
  enemies: EnemySnapshot[];
  ebul: EBullet[];
  pickups: Pickup[];
  spawns: Spawn[];
  score: number;
  combo: number;
  comboTimer: number;
  wave: number;
  waveActive: boolean;
  interT: number;
  kills: number;
  killSinceRewind: number;
  ts: number;
  eliteT: number;
}

export type GameState = 'play' | 'dead' | 'over';
