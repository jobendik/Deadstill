/**
 * The DEADSTILL simulation.
 *
 * One self-contained class owns the entire game state and advances it one
 * `step()` at a time. The defining trick: world time scales with how fast the
 * player is moving (`ts`), so standing still freezes everything. Layered on top
 * are dash, bullet-time, a style meter, and the rewind/temporal-echo system.
 *
 * The renderer reads this state but never mutates it.
 */

import {
  W,
  H,
  AX0,
  AY0,
  AX1,
  AY1,
  TAU,
  COL,
  inArena,
} from '../core/constants';
import {
  clamp,
  smooth,
  len,
  dist,
  rnd,
  rndi,
  pick,
  approach,
  angTo,
} from '../core/math';
import { GUNS, STYLE_RANKS, STYLE_THRESH, STYLE_COLS, type StyleRank } from './config';
import { audio } from '../systems/audio';
import type {
  Player,
  Enemy,
  EnemyType,
  PBullet,
  EBullet,
  GhostBullet,
  Pickup,
  Particle,
  Popup,
  Muzzle,
  Ghost,
  GhostFrame,
  Spawn,
  Command,
  KillFlags,
  HistorySnapshot,
  GameState,
  Shockwave,
  TrailNode,
} from '../core/types';

const ENEMY_COLORS: Record<EnemyType, string> = {
  gunner: COL.hot,
  rusher: COL.amber,
  sniper: COL.violet,
  timehunter: COL.gold,
  shield: COL.teal,
};

export class Game {
  state!: GameState;
  time!: number;
  /** Wall-clock seconds spent alive this run (for the game-over summary). */
  runTime!: number;
  clock!: number;
  ts!: number;
  fireCd!: number;
  player!: Player;
  invuln!: number;

  pbul!: PBullet[];
  ebul!: EBullet[];
  enemies!: Enemy[];
  pickups!: Pickup[];
  spawns!: Spawn[];
  particles!: Particle[];
  popups!: Popup[];
  muzzle!: Muzzle | null;

  score!: number;
  kills!: number;
  combo!: number;
  comboTimer!: number;
  wave!: number;
  waveActive!: boolean;
  interT!: number;

  charges!: number;
  maxCharge!: number;
  killSinceRewind!: number;

  shake!: number;
  hitstop!: number;
  deathBar!: number;
  bestStreak!: number;

  history!: HistorySnapshot[];
  posHistory!: GhostFrame[];
  justFired!: boolean;
  justThrew!: boolean;
  justFiredType!: import('../core/types').GunType | null;

  ghosts!: Ghost[];
  ghostBullets!: GhostBullet[];

  dashCd!: number;
  dashT!: number;
  dashVx!: number;
  dashVy!: number;

  btMeter!: number;
  btOn!: boolean;

  style!: number;
  styleDecayT!: number;
  lastStyleRank!: StyleRank;

  eliteT!: number;
  rewindFlash!: number;
  echoFlash!: number;
  btFlash!: number;

  // Juice & gamefeel (cosmetic — not snapshotted)
  shockwaves!: Shockwave[];
  trail!: TrailNode[];
  zoomPunch!: number;
  aimX!: number;
  aimY!: number;
  killFlash!: number;
  grazeT!: number;
  grazeChain!: number;
  grazeIdle!: number;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.state = 'play';
    this.time = 0;
    this.runTime = 0;
    this.clock = 0;
    this.ts = 0.04;
    this.fireCd = 0;
    this.player = { x: W / 2, y: H / 2, r: 11, ang: 0, speed: 260, gun: { type: 'pistol', ammo: 10 } };
    this.invuln = 1.0;
    this.pbul = [];
    this.ebul = [];
    this.enemies = [];
    this.pickups = [];
    this.spawns = [];
    this.particles = [];
    this.popups = [];
    this.muzzle = null;
    this.score = 0;
    this.kills = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.wave = 0;
    this.waveActive = false;
    this.interT = 0.6;
    this.charges = 2;
    this.maxCharge = 3;
    this.killSinceRewind = 0;
    this.shake = 0;
    this.hitstop = 0;
    this.deathBar = 0;
    this.bestStreak = 0;
    // History
    this.history = [];
    this.posHistory = [];
    this.justFired = false;
    this.justThrew = false;
    this.justFiredType = null;
    // Temporal echoes
    this.ghosts = [];
    this.ghostBullets = [];
    // Dash
    this.dashCd = 0;
    this.dashT = 0;
    this.dashVx = 0;
    this.dashVy = 0;
    // Bullet time
    this.btMeter = 1.0;
    this.btOn = false;
    // Style
    this.style = 0;
    this.styleDecayT = 0;
    this.lastStyleRank = 'D';
    // Timers & FX
    this.eliteT = 42;
    this.rewindFlash = 0;
    this.echoFlash = 0;
    this.btFlash = 0;
    // Juice & gamefeel
    this.shockwaves = [];
    this.trail = [];
    this.zoomPunch = 0;
    this.aimX = W / 2;
    this.aimY = H / 2 - 1;
    this.killFlash = 0;
    this.grazeT = 0;
    this.grazeChain = 0;
    this.grazeIdle = 0;
    this.wave = 1;
    this.spawnWave(1);
    this.waveActive = true;
  }

  // ---- Juice helpers ----------------------------------------------------
  /** Spawn an expanding ring of light at a point. */
  shock(x: number, y: number, maxR: number, color: string, life = 0.4, width = 3): void {
    this.shockwaves.push({ x, y, r: 0, maxR, life, max: life, color, width });
    if (this.shockwaves.length > 24) this.shockwaves.shift();
  }

  /** Add a camera zoom-punch impulse (decays back to 0). */
  punch(amt: number): void {
    this.zoomPunch = Math.min(0.08, this.zoomPunch + amt);
  }

  // ---- Wave director ----------------------------------------------------
  edgePoint(): { x: number; y: number } {
    const s = rndi(0, 3);
    const m = 44;
    if (s === 0) return { x: rnd(AX0 + m, AX1 - m), y: AY0 + m };
    if (s === 1) return { x: rnd(AX0 + m, AX1 - m), y: AY1 - m };
    if (s === 2) return { x: AX0 + m, y: rnd(AY0 + m, AY1 - m) };
    return { x: AX1 - m, y: rnd(AY0 + m, AY1 - m) };
  }

  spawnWave(wv: number): void {
    const total = clamp(2 + Math.floor(wv * 1.15), 3, 20);
    const bag: EnemyType[] = [];
    for (let i = 0; i < 5; i++) bag.push('gunner');
    if (wv >= 2) for (let i = 0; i < 1 + Math.min(wv, 4); i++) bag.push('rusher');
    if (wv >= 3) for (let i = 0; i < 1 + (wv - 3); i++) bag.push('sniper');
    if (wv >= 4) bag.push('shield');
    if (wv >= 5) bag.push('timehunter');
    let t = 0.2;
    for (let i = 0; i < total; i++) {
      const type = pick(bag);
      const p = this.edgePoint();
      t += rnd(0.6, 1.1);
      this.spawns.push({ type, x: p.x, y: p.y, delay: t });
    }
  }

  nextWave(): void {
    this.wave++;
    this.spawnWave(this.wave);
    this.waveActive = true;
    this.popup(W / 2, 116, 'WAVE ' + this.wave, COL.cyan);
    audio.play('wave');
  }

  makeEnemy(type: EnemyType, x: number, y: number): Enemy {
    const e: Enemy = { type, x, y, ang: 0, alive: true, bornT: 0, vx: 0, vy: 0, invuln: 0, beam: 0, r: 12 };
    if (type === 'gunner') {
      e.r = 13;
      e.cd = rnd(1.1, 1.9);
      e.desired = 262;
      e.strafe = pick([-1, 1]);
    } else if (type === 'rusher') {
      e.r = 12;
    } else if (type === 'sniper') {
      e.r = 14;
      e.desired = 330;
      e.phase = 'rest';
      e.cd = rnd(1.0, 2.2);
      e.chargeT = 0;
      e.dirAng = 0;
      e.fromX = x;
      e.fromY = y;
    } else if (type === 'timehunter') {
      e.r = 14;
    } else if (type === 'shield') {
      e.r = 15;
      e.shieldAng = 0;
      e.strafe = pick([-1, 1]);
      e.cd = rnd(2.0, 3.5);
    }
    return e;
  }

  // ---- Player actions ---------------------------------------------------
  fire(p: Player): void {
    if (!p.gun) return;
    const g = GUNS[p.gun.type];
    const a = p.ang;
    for (let k = 0; k < g.pellets; k++) {
      const ang = a + (g.pellets > 1 ? (k / (g.pellets - 1) - 0.5) * g.spread : 0) + rnd(-0.012, 0.012);
      this.pbul.push({
        x: p.x + Math.cos(a) * 15,
        y: p.y + Math.sin(a) * 15,
        vx: Math.cos(ang) * g.speed,
        vy: Math.sin(ang) * g.speed,
        life: 1.3,
        type: p.gun.type,
        px: p.x,
        py: p.y,
      });
    }
    p.gun.ammo--;
    this.fireCd = g.cd;
    const mscale = p.gun.type === 'shotgun' ? 1.5 : p.gun.type === 'rifle' ? 1.25 : 1;
    this.muzzle = { x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16, ang: a, life: 0.07, scale: mscale };
    this.shake = Math.min(this.shake + 3.2 * mscale, 10);
    this.punch(0.006 * mscale);
    audio.play('shoot');
  }

  throwGun(p: Player): void {
    if (!p.gun) return;
    const a = p.ang;
    const sp = 760;
    const g = p.gun.type;
    this.pickups.push({
      type: g,
      x: p.x + Math.cos(a) * 16,
      y: p.y + Math.sin(a) * 16,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      thrown: true,
      spin: rnd(0, TAU),
      life: 9999,
    });
    p.gun = null;
    this.shake = Math.min(this.shake + 2, 9);
    audio.play('throwg');
  }

  tryPickup(p: Player): void {
    if (p.gun) return;
    let best: Pickup | null = null;
    let bd = 1e9;
    for (const k of this.pickups) {
      if (k.thrown) continue;
      const d = dist(k.x, k.y, p.x, p.y);
      if (d < p.r + 15 && d < bd) {
        bd = d;
        best = k;
      }
    }
    if (best) {
      p.gun = { type: best.type, ammo: GUNS[best.type].ammo };
      best.dead = true;
      audio.play('pickup');
    }
  }

  // ---- Enemy shooting ---------------------------------------------------
  enemyShoot(e: Enemy, p: Player): void {
    const a = angTo(e.x, e.y, p.x, p.y) + rnd(-0.05, 0.05);
    const es = 205 + this.wave * 4;
    this.ebul.push({
      x: e.x + Math.cos(a) * 15,
      y: e.y + Math.sin(a) * 15,
      vx: Math.cos(a) * es,
      vy: Math.sin(a) * es,
      life: 3.2,
    });
    audio.play('eshoot');
  }

  sniperFire(e: Enemy, p: Player): void {
    const dir = e.dirAng ?? 0;
    if (this.invuln <= 0 && this.state === 'play') {
      const ca = Math.cos(dir);
      const sa = Math.sin(dir);
      const proj = (p.x - e.x) * ca + (p.y - e.y) * sa;
      const perp = Math.abs((p.x - e.x) * -sa + (p.y - e.y) * ca);
      if (proj > 0 && perp < p.r + 9) this.hurtPlayer();
    }
    for (let i = 0; i < 10; i++) {
      const r = i * 60;
      this.particles.push({
        x: e.x + Math.cos(dir) * r,
        y: e.y + Math.sin(dir) * r,
        vx: Math.cos(dir) * rnd(20, 80),
        vy: Math.sin(dir) * rnd(20, 80),
        life: 0.3,
        max: 0.3,
        color: COL.violet,
        kind: 'spark',
      });
    }
    this.shock(e.x, e.y, 40, COL.violet, 0.25, 2);
    this.shake = Math.min(this.shake + 5, 11);
  }

  // ---- Temporal Echo system ---------------------------------------------
  stepGhosts(dt: number): void {
    for (const gh of this.ghosts) {
      if (gh.idx >= gh.script.length) continue;
      const fr = gh.script[gh.idx];
      gh.x = fr.x;
      gh.y = fr.y;
      gh.ang = fr.ang;
      // Ghost fires bullets (replays original shots)
      if (fr.fired && fr.firedType && GUNS[fr.firedType]) {
        const gd = GUNS[fr.firedType];
        for (let k = 0; k < gd.pellets; k++) {
          const ang = fr.ang + (gd.pellets > 1 ? (k / (gd.pellets - 1) - 0.5) * gd.spread : 0) + rnd(-0.015, 0.015);
          this.ghostBullets.push({
            x: gh.x + Math.cos(fr.ang) * 14,
            y: gh.y + Math.sin(fr.ang) * 14,
            px: gh.x + Math.cos(fr.ang) * 14,
            py: gh.y + Math.sin(fr.ang) * 14,
            vx: Math.cos(ang) * gd.speed,
            vy: Math.sin(ang) * gd.speed,
            life: 1.2,
          });
        }
      }
      // Ghost throw -> fast bolt
      if (fr.threw) {
        const a = fr.ang;
        this.ghostBullets.push({
          x: gh.x + Math.cos(a) * 16,
          y: gh.y + Math.sin(a) * 16,
          px: gh.x + Math.cos(a) * 16,
          py: gh.y + Math.sin(a) * 16,
          vx: Math.cos(a) * 820,
          vy: Math.sin(a) * 820,
          life: 1.4,
          big: true,
        });
      }
      gh.idx++;
    }
    // Move ghost bullets in real-time (echoes transcend game-time)
    for (const b of this.ghostBullets) {
      b.px = b.x;
      b.py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
    }
    // Ghost bullets -> enemies
    for (const b of this.ghostBullets) {
      if (b.life <= 0) continue;
      for (const e of this.enemies) {
        if (!e.alive || e.bornT < 0.4 || e.invuln > 0) continue;
        if (dist(b.x, b.y, e.x, e.y) < (b.big ? e.r + 10 : e.r + 3)) {
          this.killEnemy(e, { ghost: true });
          b.life = 0;
          this.addStyle(18, 'ECHO');
          break;
        }
      }
    }
  }

  // ---- Style meter ------------------------------------------------------
  addStyle(amt: number, _tag?: string): void {
    this.style = Math.min(100, this.style + amt);
    this.styleDecayT = 3.6;
    const rank = this.getStyleRank();
    if (rank !== this.lastStyleRank) {
      this.popup(this.player.x, this.player.y - 50, rank, STYLE_COLS[rank] || COL.white);
      this.lastStyleRank = rank;
    }
  }

  getStyleRank(): StyleRank {
    for (let i = STYLE_THRESH.length - 1; i >= 0; i--) {
      if (this.style >= STYLE_THRESH[i]) return STYLE_RANKS[i];
    }
    return 'D';
  }

  styleMult(): number {
    return 1 + STYLE_RANKS.indexOf(this.getStyleRank()) * 0.5;
  }

  // ---- Damage / death ---------------------------------------------------
  hurtPlayer(): void {
    if (this.invuln > 0 || this.state !== 'play') return;
    this.onDeath();
  }

  onDeath(): void {
    this.state = 'dead';
    this.deathBar = this.charges > 0 ? 3.0 : 2.4;
    this.combo = 0;
    this.shake = 15;
    this.hitstop = 0.14;
    const p = this.player;
    for (let i = 0; i < 26; i++) {
      const a = rnd(0, TAU);
      const s = rnd(40, 260);
      this.particles.push({
        x: p.x,
        y: p.y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rnd(0.4, 0.9),
        max: 0.9,
        color: i % 3 ? COL.white : COL.cyan,
        kind: 'gib',
      });
    }
    this.shock(p.x, p.y, 180, COL.hot, 0.6, 5);
    this.shock(p.x, p.y, 90, COL.white, 0.4, 3);
    this.punch(0.06);
    this.killFlash = 0.5;
    audio.play('hurt');
  }

  killEnemy(e: Enemy, flags?: KillFlags): void {
    if (!e.alive) return;
    e.alive = false;
    flags = flags || {};
    const c = ENEMY_COLORS[e.type] || COL.white;
    for (let i = 0; i < 13; i++) {
      const a = rnd(0, TAU);
      const s = rnd(50, 260);
      this.particles.push({
        x: e.x,
        y: e.y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rnd(0.3, 0.7),
        max: 0.7,
        color: i % 2 ? c : COL.white,
        kind: 'gib',
      });
    }
    // Impact: bright pop + expanding shockwave; elites hit harder.
    const elite = e.isElite || e.type === 'timehunter';
    this.shock(e.x, e.y, e.r + (elite ? 60 : 26), c, elite ? 0.5 : 0.32, elite ? 4 : 2.5);
    this.shock(e.x, e.y, e.r + 10, COL.white, 0.22, 2);
    this.punch(elite ? 0.03 : 0.004);
    if (e.type !== 'rusher' && e.type !== 'timehunter') {
      const d = Math.random() < 0.16 ? 'shotgun' : Math.random() < 0.08 ? 'rifle' : 'pistol';
      this.pickups.push({ type: d, x: e.x, y: e.y, vx: 0, vy: 0, thrown: false, spin: rnd(0, TAU), life: 9999 });
    }
    this.combo++;
    this.comboTimer = 2.4;
    if (this.combo > this.bestStreak) this.bestStreak = this.combo;
    let bonus = 0;
    const tags: string[] = [];
    if (this.ts < 0.18) {
      bonus += 50;
      tags.push('ICE');
    }
    if (flags.disarm) {
      bonus += 75;
      tags.push('DISARM');
    }
    if (flags.longshot) {
      bonus += 40;
      tags.push('LONG');
    }
    if (flags.ghost) {
      bonus += 80;
      tags.push('ECHO');
    }
    if (flags.dash) {
      bonus += 60;
      tags.push('DASH');
    }
    if (this.btOn) {
      bonus += 30;
      tags.push('BT');
    }
    const pts = Math.round((100 + (this.combo - 1) * 25 + bonus) * this.styleMult());
    this.score += pts;
    this.popup(e.x, e.y - 15, '+' + pts + (this.combo > 1 ? ' x' + this.combo : ''), tags.length ? COL.gold : COL.white);
    if (tags.length) this.popup(e.x, e.y - 34, tags.join(' '), COL.amber);
    this.kills++;
    this.killSinceRewind++;
    if (this.killSinceRewind >= 10 && this.charges < this.maxCharge) {
      this.charges++;
      this.killSinceRewind = 0;
      this.popup(this.player.x, this.player.y - 28, 'REWIND +1', COL.violet);
    }
    // Combo milestones — escalating feedback every 5 chained kills.
    if (this.combo > 0 && this.combo % 5 === 0) {
      this.popup(this.player.x, this.player.y - 64, 'COMBO ×' + this.combo, COL.gold);
      this.shock(this.player.x, this.player.y, 130, COL.gold, 0.5, 3);
      this.punch(0.02);
      audio.play('milestone', this.combo);
    }
    this.btMeter = Math.min(1, this.btMeter + 0.12);
    this.shake = Math.min(this.shake + 4, 10);
    // Brief hitstop scaled by combo for a satisfying "crunch" on big chains.
    this.hitstop = Math.max(this.hitstop, 0.04 + Math.min(this.combo, 8) * 0.004);
    audio.play('kill');
    audio.play('combo', this.combo);
  }

  popup(x: number, y: number, text: string, color: string): void {
    this.popups.push({ x, y, text, color, life: 0.95, max: 0.95 });
    if (this.popups.length > 36) this.popups.shift();
  }

  // ---- Rewind & echo creation -------------------------------------------
  snap(): void {
    const p = this.player;
    const cE = this.enemies.map((e) => ({
      type: e.type,
      x: e.x,
      y: e.y,
      ang: e.ang,
      bornT: e.bornT,
      vx: e.vx,
      vy: e.vy,
      r: e.r,
      cd: e.cd,
      desired: e.desired,
      strafe: e.strafe,
      phase: e.phase,
      chargeT: e.chargeT,
      dirAng: e.dirAng,
      fromX: e.fromX,
      fromY: e.fromY,
      beam: e.beam,
      shieldAng: e.shieldAng,
      invuln: e.invuln,
    }));
    const cB = this.ebul.map((b) => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, life: b.life }));
    const cK = this.pickups.map((k) => ({
      type: k.type,
      x: k.x,
      y: k.y,
      vx: k.vx,
      vy: k.vy,
      thrown: k.thrown,
      spin: k.spin,
      life: k.life,
    }));
    const cS = this.spawns.map((s) => ({ type: s.type, x: s.x, y: s.y, delay: s.delay }));
    this.history.push({
      px: p.x,
      py: p.y,
      pang: p.ang,
      gun: p.gun ? { type: p.gun.type, ammo: p.gun.ammo } : null,
      enemies: cE,
      ebul: cB,
      pickups: cK,
      spawns: cS,
      score: this.score,
      combo: this.combo,
      comboTimer: this.comboTimer,
      wave: this.wave,
      waveActive: this.waveActive,
      interT: this.interT,
      kills: this.kills,
      killSinceRewind: this.killSinceRewind,
      ts: this.ts,
      eliteT: this.eliteT,
    });
    if (this.history.length > 150) this.history.shift();
    // Record frame for ghost replay (aligned with history)
    this.posHistory.push({
      x: p.x,
      y: p.y,
      ang: p.ang,
      fired: this.justFired,
      firedType: this.justFiredType,
      threw: this.justThrew,
    });
    if (this.posHistory.length > 150) this.posHistory.shift();
  }

  restore(h: HistorySnapshot): void {
    const p = this.player;
    p.x = h.px;
    p.y = h.py;
    p.ang = h.pang;
    p.gun = h.gun ? { type: h.gun.type, ammo: h.gun.ammo } : null;
    this.enemies = h.enemies.map((e) => {
      const n = this.makeEnemy(e.type, e.x, e.y);
      n.ang = e.ang;
      n.bornT = e.bornT;
      n.vx = e.vx;
      n.vy = e.vy;
      n.r = e.r;
      n.cd = e.cd;
      n.desired = e.desired;
      n.strafe = e.strafe;
      n.phase = e.phase;
      n.chargeT = e.chargeT;
      n.dirAng = e.dirAng;
      n.fromX = e.fromX;
      n.fromY = e.fromY;
      n.beam = e.beam || 0;
      n.shieldAng = e.shieldAng || 0;
      n.invuln = e.invuln || 0;
      return n;
    });
    this.ebul = h.ebul.map((b) => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, life: b.life }));
    this.pickups = h.pickups.map((k) => ({
      type: k.type,
      x: k.x,
      y: k.y,
      vx: k.vx,
      vy: k.vy,
      thrown: k.thrown,
      spin: k.spin,
      life: k.life,
    }));
    this.spawns = h.spawns.map((s) => ({ type: s.type, x: s.x, y: s.y, delay: s.delay }));
    this.score = h.score;
    this.combo = h.combo;
    this.comboTimer = h.comboTimer;
    this.wave = h.wave;
    this.waveActive = h.waveActive;
    this.interT = h.interT;
    this.kills = h.kills;
    this.killSinceRewind = h.killSinceRewind;
    this.ts = h.ts;
    this.eliteT = h.eliteT || 40;
    this.pbul = [];
    this.particles = [];
    this.popups = [];
    this.muzzle = null;
    this.fireCd = 0;
    this.shockwaves = [];
    this.trail = [];
    this.killFlash = 0;
  }

  requestRewind(): boolean {
    if (this.state !== 'dead' || this.charges <= 0 || this.history.length === 0) return false;
    const snapIdx = Math.max(0, this.history.length - 1 - 80);
    // Create a temporal echo from the timeline we are about to overwrite.
    if (this.posHistory.length > 0 && this.ghosts.length < 3) {
      const script = this.posHistory.slice(snapIdx);
      if (script.length > 2) {
        const gs = this.history[snapIdx];
        this.ghosts.push({
          x: gs ? gs.px : this.player.x,
          y: gs ? gs.py : this.player.y,
          ang: gs ? gs.pang : this.player.ang,
          script,
          idx: 0,
        });
        audio.play('echo');
        this.echoFlash = 0.38;
      }
    } else if (this.ghosts.length >= 3) {
      const script = this.posHistory.slice(snapIdx);
      if (script.length > 2) {
        const gs = this.history[snapIdx];
        this.ghosts[0] = {
          x: gs ? gs.px : this.player.x,
          y: gs ? gs.py : this.player.y,
          ang: gs ? gs.pang : this.player.ang,
          script,
          idx: 0,
        };
        audio.play('echo');
        this.echoFlash = 0.38;
      }
    }
    this.restore(this.history[snapIdx]);
    this.history.length = snapIdx + 1;
    this.posHistory.length = snapIdx + 1;
    this.charges--;
    this.invuln = 1.15;
    this.state = 'play';
    this.shake = 10;
    this.rewindFlash = 0.5;
    this.shock(this.player.x, this.player.y, 220, COL.violet, 0.7, 4);
    this.punch(0.05);
    audio.play('rewind');
    return true;
  }

  grantRewind(): void {
    this.charges = Math.min(this.maxCharge, this.charges + 1);
  }

  reviveFromAd(): boolean {
    if (this.history.length === 0) return false;
    const i = Math.max(0, this.history.length - 1 - 80);
    this.restore(this.history[i]);
    this.history.length = i + 1;
    this.posHistory.length = i + 1;
    this.invuln = 1.5;
    this.state = 'play';
    this.shake = 9;
    this.rewindFlash = 0.4;
    this.shock(this.player.x, this.player.y, 220, COL.violet, 0.7, 4);
    this.punch(0.05);
    audio.play('rewind');
    return true;
  }

  giveUp(): void {
    this.state = 'over';
  }

  /** Advance cosmetic juice (shockwaves, trail, camera punch) in real time. */
  updateJuice(dt: number): void {
    for (const s of this.shockwaves) {
      s.life -= dt;
      s.r += (s.maxR - s.r) * Math.min(1, dt * 11);
    }
    this.shockwaves = this.shockwaves.filter((s) => s.life > 0);
    for (const t of this.trail) t.life -= dt;
    this.trail = this.trail.filter((t) => t.life > 0);
    this.zoomPunch = approach(this.zoomPunch, 0, dt * 0.55);
    this.killFlash = Math.max(0, this.killFlash - dt);
  }

  decayFx(dt: number): void {
    for (const q of this.particles) {
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= 0.9;
      q.vy *= 0.9;
      q.life -= dt;
    }
    this.particles = this.particles.filter((q) => q.life > 0);
    for (const u of this.popups) {
      u.y -= 14 * dt;
      u.life -= dt;
    }
    this.popups = this.popups.filter((u) => u.life > 0);
    this.shake = approach(this.shake, 0, dt * 34);
    if (this.muzzle) {
      this.muzzle.life -= dt;
      if (this.muzzle.life <= 0) this.muzzle = null;
    }
    this.updateJuice(dt);
  }

  // ---- Main step --------------------------------------------------------
  step(dt: number, cmd: Command | null): void {
    dt = Math.min(dt, 1 / 30);
    this.time += dt;
    if (this.state !== 'play') {
      this.decayFx(dt);
      if (this.state === 'dead') {
        this.deathBar -= dt;
        if (this.deathBar <= 0) this.state = 'over';
      }
      return;
    }
    this.runTime += dt;
    this.justFired = false;
    this.justThrew = false;
    this.justFiredType = null;
    const c = cmd;
    const p = this.player;
    const mx = clamp(c?.mx ?? 0, -1, 1);
    const my = clamp(c?.my ?? 0, -1, 1);
    const ax = c?.ax == null ? p.x + Math.cos(p.ang) : c.ax;
    const ay = c?.ay == null ? p.y + Math.sin(p.ang) : c.ay;
    this.aimX = ax;
    this.aimY = ay;
    const fire = !!c?.fire;
    const thrw = !!c?.thrw;
    const dash = !!c?.dash;
    const btHeld = !!c?.bt;

    // Bullet time
    if (btHeld && this.btMeter > 0) {
      if (!this.btOn) {
        audio.play('btstart');
        this.btFlash = 0.2;
      }
      this.btOn = true;
      this.btMeter = Math.max(0, this.btMeter - dt * 0.34);
      if (this.btMeter === 0) this.btOn = false;
    } else {
      this.btOn = false;
      this.btMeter = Math.min(1, this.btMeter + dt * 0.13);
    }
    this.btFlash = Math.max(0, this.btFlash - dt);

    // Time scale
    const mvmag = clamp(len(mx, my), 0, 1);
    let targetTs = 0.04 + 0.96 * smooth(mvmag);
    if (this.btOn) targetTs = Math.min(targetTs, 0.08);
    if (this.dashT > 0) targetTs = 1.0;
    this.ts += (targetTs - this.ts) * (1 - Math.exp(-(targetTs > this.ts ? 22 : 10) * dt));
    const gdt = this.ts * dt;
    this.clock += gdt;

    // Elite spawn (Time Hunter)
    this.eliteT -= dt;
    if (this.eliteT <= 0) {
      this.eliteT = rnd(34, 50);
      const ep = this.edgePoint();
      const el = this.makeEnemy('timehunter', ep.x, ep.y);
      el.isElite = true;
      el.r = 17;
      this.enemies.push(el);
      this.popup(W / 2, H * 0.36, '⚠ TIME HUNTER ⚠', COL.gold);
      this.shock(el.x, el.y, 70, COL.gold, 0.6, 4);
      this.punch(0.03);
      audio.play('wave');
    }

    // Dash
    this.dashCd = Math.max(0, this.dashCd - dt);
    if (this.dashT > 0) {
      this.dashT -= dt;
      p.x = clamp(p.x + this.dashVx * dt, AX0 + p.r, AX1 - p.r);
      p.y = clamp(p.y + this.dashVy * dt, AY0 + p.r, AY1 - p.r);
      for (const e of this.enemies) {
        if (!e.alive || e.bornT < 0.8) continue;
        if (dist(p.x, p.y, e.x, e.y) < p.r + e.r + 5) {
          this.killEnemy(e, { dash: true });
          this.addStyle(22);
        }
      }
      for (const b of this.ebul) {
        if (dist(p.x, p.y, b.x, b.y) < p.r + 10) {
          b.life = 0;
          this.addStyle(14);
        }
      }
    } else if (dash && this.dashCd <= 0) {
      const dl = len(mx, my);
      if (dl > 0.1) {
        this.dashVx = (mx / dl) * 530;
        this.dashVy = (my / dl) * 530;
        this.dashT = 0.13;
        this.dashCd = 0.72;
        this.invuln = Math.max(this.invuln, 0.18);
        this.shock(p.x, p.y, 60, COL.cyan, 0.3, 2.5);
        audio.play('dash');
      }
    }

    // Player movement
    if (this.dashT <= 0) {
      p.x = clamp(p.x + mx * p.speed * dt, AX0 + p.r, AX1 - p.r);
      p.y = clamp(p.y + my * p.speed * dt, AY0 + p.r, AY1 - p.r);
    }
    p.ang = angTo(p.x, p.y, ax, ay);
    if (this.invuln > 0) this.invuln -= dt;

    // Motion trail — denser while time flows / dashing, for a speed read.
    const speedFrac = this.dashT > 0 ? 1 : clamp(mvmag, 0, 1);
    if (speedFrac > 0.35) {
      this.trail.push({ x: p.x, y: p.y, ang: p.ang, life: 0.22 });
      if (this.trail.length > 18) this.trail.shift();
    }
    this.updateJuice(dt);

    // Fire / throw / pickup
    this.fireCd -= dt;
    if (fire && p.gun && p.gun.ammo > 0 && this.fireCd <= 0) {
      this.justFiredType = p.gun.type;
      this.fire(p);
      this.justFired = true;
      if (this.btOn) this.addStyle(8);
      if (this.ts < 0.12) this.addStyle(6);
    }
    if (thrw && p.gun) {
      this.throwGun(p);
      this.justThrew = true;
      this.addStyle(12);
    }
    this.tryPickup(p);

    // Muzzle / popups
    if (this.muzzle) {
      this.muzzle.life -= dt;
      if (this.muzzle.life <= 0) this.muzzle = null;
    }
    for (const u of this.popups) {
      u.y -= 14 * dt;
      u.life -= dt;
    }
    this.popups = this.popups.filter((u) => u.life > 0);

    // Style decay
    if (this.styleDecayT > 0) this.styleDecayT -= dt;
    else {
      this.style = Math.max(0, this.style - dt * 6);
      this.lastStyleRank = this.getStyleRank();
    }
    this.rewindFlash = Math.max(0, this.rewindFlash - dt);
    this.echoFlash = Math.max(0, this.echoFlash - dt);
    // Graze throttle + chain decay
    this.grazeT = Math.max(0, this.grazeT - dt);
    this.grazeIdle += dt;
    if (this.grazeIdle > 1.2) this.grazeChain = 0;

    // World advances by gdt
    for (const b of this.pbul) {
      b.px = b.x;
      b.py = b.y;
      b.x += b.vx * gdt;
      b.y += b.vy * gdt;
      b.life -= gdt;
    }
    for (const b of this.ebul) {
      b.x += b.vx * gdt;
      b.y += b.vy * gdt;
      b.life -= gdt;
    }
    for (const k of this.pickups) {
      if (k.thrown) {
        k.x += k.vx * gdt;
        k.y += k.vy * gdt;
        const f = Math.exp(-2.4 * gdt);
        k.vx *= f;
        k.vy *= f;
        k.spin += 12 * gdt;
        if (k.x < AX0 + 8) {
          k.x = AX0 + 8;
          k.vx *= -0.4;
        }
        if (k.x > AX1 - 8) {
          k.x = AX1 - 8;
          k.vx *= -0.4;
        }
        if (k.y < AY0 + 8) {
          k.y = AY0 + 8;
          k.vy *= -0.4;
        }
        if (k.y > AY1 - 8) {
          k.y = AY1 - 8;
          k.vy *= -0.4;
        }
        if (len(k.vx, k.vy) < 120) k.thrown = false;
      }
    }
    for (const q of this.particles) {
      q.x += q.vx * gdt;
      q.y += q.vy * gdt;
      q.vx *= Math.exp(-2.2 * gdt);
      q.vy *= Math.exp(-2.2 * gdt);
      q.life -= gdt;
    }
    for (const s of this.spawns) s.delay -= gdt;
    const rdy = this.spawns.filter((s) => s.delay <= 0);
    if (rdy.length) {
      for (const s of rdy) this.enemies.push(this.makeEnemy(s.type, s.x, s.y));
      this.spawns = this.spawns.filter((s) => s.delay > 0);
    }
    if (this.comboTimer > 0) {
      this.comboTimer -= gdt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    this.stepEnemies(dt, gdt);
    this.resolveCollisions();

    // Ghost step
    this.stepGhosts(dt);

    // Cull
    this.pbul = this.pbul.filter((b) => b.life > 0 && inArena(b.x, b.y, -30));
    this.ebul = this.ebul.filter((b) => b.life > 0 && inArena(b.x, b.y, -30));
    this.enemies = this.enemies.filter((e) => e.alive);
    this.pickups = this.pickups.filter((k) => !k.dead);
    if (this.pickups.length > 18) {
      const ex = this.pickups.filter((k) => !k.thrown);
      while (this.pickups.length > 18 && ex.length) {
        const victim = ex.shift();
        if (victim) victim.dead = true;
        this.pickups = this.pickups.filter((k) => !k.dead);
      }
    }
    this.particles = this.particles.filter((q) => q.life > 0);
    this.ghostBullets = this.ghostBullets.filter((b) => b.life > 0 && inArena(b.x, b.y, -30));
    this.ghosts = this.ghosts.filter((g) => g.idx < g.script.length);

    // Wave flow
    if (this.waveActive && this.spawns.length === 0 && this.enemies.length === 0) {
      this.waveActive = false;
      this.interT = 1.4;
    }
    if (!this.waveActive) {
      this.interT -= gdt;
      if (this.interT <= 0) this.nextWave();
    }

    // Shake + snapshot
    this.shake = approach(this.shake, 0, dt * 30);
    if (this.state === 'play') this.snap();
  }

  // ---- Enemy AI ---------------------------------------------------------
  private stepEnemies(dt: number, gdt: number): void {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.bornT < 1) e.bornT = Math.min(1, e.bornT + gdt * 4);
      e.beam = Math.max(0, (e.beam || 0) - dt);
      if (e.invuln > 0) e.invuln -= dt;

      if (e.type === 'gunner') {
        const d = dist(e.x, e.y, p.x, p.y);
        const a = angTo(e.x, e.y, p.x, p.y);
        e.ang = a;
        let vx = 0;
        let vy = 0;
        const desired = e.desired ?? 262;
        if (d > desired) {
          vx = Math.cos(a);
          vy = Math.sin(a);
        } else {
          const strafe = e.strafe ?? 1;
          vx = Math.cos(a + Math.PI / 2) * strafe;
          vy = Math.sin(a + Math.PI / 2) * strafe;
          if (d < desired - 70) {
            vx -= Math.cos(a) * 0.7;
            vy -= Math.sin(a) * 0.7;
          }
        }
        const sp = 90 + this.wave * 2;
        e.x = clamp(e.x + vx * sp * gdt, AX0 + e.r, AX1 - e.r);
        e.y = clamp(e.y + vy * sp * gdt, AY0 + e.r, AY1 - e.r);
        e.cd = (e.cd ?? 0) - gdt;
        if (e.cd <= 0 && e.bornT >= 1) {
          this.enemyShoot(e, p);
          e.cd = Math.max(0.7, rnd(1.4, 2.1) - this.wave * 0.04);
          e.strafe = pick([-1, 1]);
        }
      } else if (e.type === 'rusher') {
        const a = angTo(e.x, e.y, p.x, p.y);
        e.ang = a;
        e.vx += Math.cos(a) * 440 * gdt;
        e.vy += Math.sin(a) * 440 * gdt;
        const mxs = 165 + this.wave * 4;
        const s = len(e.vx, e.vy);
        if (s > mxs) {
          e.vx = (e.vx / s) * mxs;
          e.vy = (e.vy / s) * mxs;
        }
        e.x += e.vx * gdt;
        e.y += e.vy * gdt;
        if (e.x < AX0 + e.r) {
          e.x = AX0 + e.r;
          e.vx *= -0.5;
        }
        if (e.x > AX1 - e.r) {
          e.x = AX1 - e.r;
          e.vx *= -0.5;
        }
        if (e.y < AY0 + e.r) {
          e.y = AY0 + e.r;
          e.vy *= -0.5;
        }
        if (e.y > AY1 - e.r) {
          e.y = AY1 - e.r;
          e.vy *= -0.5;
        }
        if (e.bornT >= 1 && dist(e.x, e.y, p.x, p.y) < p.r + e.r) this.hurtPlayer();
      } else if (e.type === 'sniper') {
        const d = dist(e.x, e.y, p.x, p.y);
        const a = angTo(e.x, e.y, p.x, p.y);
        const desired = e.desired ?? 330;
        let vx = 0;
        let vy = 0;
        if (d < desired - 30) {
          vx = -Math.cos(a);
          vy = -Math.sin(a);
        } else if (d > desired + 90) {
          vx = Math.cos(a) * 0.5;
          vy = Math.sin(a) * 0.5;
        }
        e.x = clamp(e.x + vx * 70 * gdt, AX0 + e.r, AX1 - e.r);
        e.y = clamp(e.y + vy * 70 * gdt, AY0 + e.r, AY1 - e.r);
        if (e.phase === 'rest') {
          e.ang = a;
          e.cd = (e.cd ?? 0) - gdt;
          if (e.cd <= 0 && e.bornT >= 1) {
            e.phase = 'charge';
            e.chargeT = Math.max(0.55, 0.95 - this.wave * 0.02);
            e.dirAng = angTo(e.x, e.y, p.x, p.y);
            e.fromX = e.x;
            e.fromY = e.y;
          }
        } else {
          e.chargeT = (e.chargeT ?? 0) - gdt;
          e.ang = e.dirAng ?? e.ang;
          if (e.chargeT <= 0) {
            this.sniperFire(e, p);
            e.phase = 'rest';
            e.cd = rnd(1.7, 2.6);
            e.beam = 0.15;
          }
        }
      } else if (e.type === 'timehunter') {
        // Partially immune to time dilation
        const effGdt = gdt + (dt - gdt) * (e.isElite ? 0.65 : 0.45);
        const a = angTo(e.x, e.y, p.x, p.y);
        e.ang = a;
        e.vx = (e.vx || 0) + Math.cos(a) * (e.isElite ? 480 : 380) * effGdt;
        e.vy = (e.vy || 0) + Math.sin(a) * (e.isElite ? 480 : 380) * effGdt;
        const mxs = (e.isElite ? 240 : 195) + this.wave * 4;
        const s = len(e.vx, e.vy);
        if (s > mxs) {
          e.vx = (e.vx / s) * mxs;
          e.vy = (e.vy / s) * mxs;
        }
        e.x += e.vx * effGdt;
        e.y += e.vy * effGdt;
        if (e.x < AX0 + e.r) {
          e.x = AX0 + e.r;
          e.vx *= -0.5;
        }
        if (e.x > AX1 - e.r) {
          e.x = AX1 - e.r;
          e.vx *= -0.5;
        }
        if (e.y < AY0 + e.r) {
          e.y = AY0 + e.r;
          e.vy *= -0.5;
        }
        if (e.y > AY1 - e.r) {
          e.y = AY1 - e.r;
          e.vy *= -0.5;
        }
        if (e.bornT >= 1 && dist(e.x, e.y, p.x, p.y) < p.r + e.r) this.hurtPlayer();
      } else if (e.type === 'shield') {
        const a = angTo(e.x, e.y, p.x, p.y);
        e.ang = a;
        e.shieldAng = a;
        const strafe = e.strafe ?? 1;
        e.x = clamp(e.x + Math.cos(a + Math.PI / 2) * strafe * 72 * gdt, AX0 + e.r, AX1 - e.r);
        e.y = clamp(e.y + Math.sin(a + Math.PI / 2) * strafe * 72 * gdt, AY0 + e.r, AY1 - e.r);
        const d = dist(e.x, e.y, p.x, p.y);
        if (d > 240) {
          e.x += Math.cos(a) * 42 * gdt;
          e.y += Math.sin(a) * 42 * gdt;
        }
        e.cd = (e.cd ?? 0) - gdt;
        if (e.cd <= 0) {
          e.strafe = strafe * -1;
          e.cd = rnd(2.0, 3.5);
        }
        if (e.bornT >= 1 && d < p.r + e.r + 2) this.hurtPlayer();
      }
    }
  }

  // ---- Collision resolution ---------------------------------------------
  private resolveCollisions(): void {
    const p = this.player;
    // Player bullets -> enemies
    for (const b of this.pbul) {
      if (b.life <= 0) continue;
      for (const e of this.enemies) {
        if (!e.alive || e.bornT < 0.4 || e.invuln > 0) continue;
        if (e.type === 'shield') {
          const ba = angTo(e.x, e.y, b.x, b.y);
          const diff = Math.abs((((ba - (e.shieldAng ?? 0)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          if (diff < 1.05) {
            b.life = 0;
            for (let i = 0; i < 5; i++) {
              const ra = rnd(0, TAU);
              this.particles.push({
                x: b.x,
                y: b.y,
                vx: Math.cos(ra) * rnd(50, 130),
                vy: Math.sin(ra) * rnd(50, 130),
                life: 0.25,
                max: 0.25,
                color: COL.teal,
                kind: 'spark',
              });
            }
            audio.play('shield');
            break;
          }
        }
        if (dist(b.x, b.y, e.x, e.y) < e.r + 3) {
          this.killEnemy(e, { longshot: dist(p.x, p.y, e.x, e.y) > 360 });
          b.life = 0;
          break;
        }
      }
    }
    // Thrown pickups -> enemies
    for (const k of this.pickups) {
      if (!k.thrown) continue;
      for (const e of this.enemies) {
        if (!e.alive || e.bornT < 0.4) continue;
        if (dist(k.x, k.y, e.x, e.y) < e.r + 9) this.killEnemy(e, { disarm: true });
      }
    }
    // Enemy bullets -> player (with graze: reward skilful near-misses).
    if (this.invuln <= 0) {
      const grazeR = p.r + 22;
      for (const b of this.ebul) {
        if (b.life <= 0) continue;
        const d = dist(b.x, b.y, p.x, p.y);
        if (d < p.r + 3) {
          b.life = 0;
          this.hurtPlayer();
          break;
        } else if (d < grazeR && !b.grazed) {
          b.grazed = true;
          this.onGraze(b);
        }
      }
    }
  }

  /** A bullet slipped past within a hair — reward style and a flick of feedback. */
  private onGraze(b: EBullet): void {
    this.grazeChain = Math.min(this.grazeChain + 1, 99);
    this.addStyle(4 + Math.min(this.grazeChain, 6));
    this.btMeter = Math.min(1, this.btMeter + 0.03);
    this.grazeIdle = 0;
    const ga = angTo(this.player.x, this.player.y, b.x, b.y);
    for (let i = 0; i < 3; i++) {
      const sa = ga + rnd(-0.5, 0.5);
      this.particles.push({
        x: b.x,
        y: b.y,
        vx: Math.cos(sa) * rnd(40, 110),
        vy: Math.sin(sa) * rnd(40, 110),
        life: 0.22,
        max: 0.22,
        color: COL.cyan,
        kind: 'spark',
      });
    }
    if (this.grazeT <= 0) {
      this.popup(this.player.x, this.player.y - 40, this.grazeChain > 2 ? 'GRAZE ×' + this.grazeChain : 'GRAZE', COL.cyan);
      this.grazeT = 0.45;
      audio.play('graze');
    }
  }
}
