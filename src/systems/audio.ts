/**
 * Procedural audio engine built on the Web Audio API.
 *
 * Every sound is synthesised at runtime — there are no audio assets to load.
 * A low, filtered drone underscores the action and rises with time-tension.
 * Master volume and mute are driven by the shared settings module.
 */

import { clamp, lerp } from '../core/math';
import { settings, onSettingsChange } from './settings';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let droneGain: GainNode | null = null;
let droneFilt: BiquadFilterNode | null = null;

/** The effective master level given current mute/volume state. */
function targetLevel(): number {
  return settings.muted ? 0 : settings.volume;
}

function applyLevel(): void {
  if (master) master.gain.value = targetLevel();
}

function ensure(): void {
  if (ctx) return;
  if (typeof window === 'undefined') return;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = targetLevel();
    master.connect(ctx.destination);

    droneGain = ctx.createGain();
    droneGain.gain.value = 0;
    droneFilt = ctx.createBiquadFilter();
    droneFilt.type = 'lowpass';
    droneFilt.frequency.value = 420;

    const d = ctx.createOscillator();
    d.type = 'sawtooth';
    d.frequency.value = 46;
    const s = ctx.createOscillator();
    s.type = 'sine';
    s.frequency.value = 23;
    d.connect(droneFilt);
    s.connect(droneFilt);
    droneFilt.connect(droneGain);
    droneGain.connect(master);
    d.start();
    s.start();
  } catch {
    ctx = null;
  }
}

/** Resume the audio context after a user gesture (browsers require this). */
function unlock(): void {
  ensure();
  if (ctx && ctx.state === 'suspended') void ctx.resume();
}

/** A short pitched envelope (the core of most SFX). */
function env(type: OscillatorType, f0: number, f1: number, dur: number, vol: number): void {
  if (!ctx || !master || settings.muted) return;
  if (!isFinite(f0) || !isFinite(dur) || !isFinite(vol) || dur <= 0 || vol <= 0) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** A burst of filtered noise (impacts, dashes, shields). */
function noise(dur: number, vol: number, lp?: number): void {
  if (!ctx || !master || settings.muted) return;
  const t = ctx.currentTime;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ctx.createBufferSource();
  s.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lp || 1800;
  const g = ctx.createGain();
  g.gain.value = vol;
  s.connect(f);
  f.connect(g);
  g.connect(master);
  s.start(t);
}

const sfx: Record<string, (n?: number) => void> = {
  shoot() {
    env('square', 520, 180, 0.09, 0.18);
    noise(0.05, 0.1, 2600);
  },
  eshoot() {
    env('triangle', 300, 160, 0.1, 0.07);
  },
  kill() {
    noise(0.18, 0.3, 1200);
    env('sine', 180, 46, 0.22, 0.22);
  },
  hurt() {
    noise(0.3, 0.34, 900);
    env('sawtooth', 140, 40, 0.4, 0.25);
  },
  throwg() {
    env('triangle', 420, 120, 0.16, 0.12);
    noise(0.12, 0.08, 3000);
  },
  pickup() {
    env('square', 440, 880, 0.1, 0.12);
  },
  wave() {
    env('sine', 330, 494, 0.18, 0.14);
    setTimeout(() => env('sine', 494, 660, 0.2, 0.13), 90);
  },
  rewind() {
    env('sawtooth', 80, 1200, 0.55, 0.2);
  },
  echo() {
    env('triangle', 900, 200, 0.5, 0.16);
    setTimeout(() => env('triangle', 600, 150, 0.4, 0.1), 60);
  },
  combo(n?: number) {
    const k = isFinite(n ?? 0) ? Math.min(n ?? 0, 12) : 0;
    env('square', 440 + k * 40, 0, 0.06, 0.1);
  },
  over() {
    env('sawtooth', 300, 60, 0.7, 0.22);
  },
  dash() {
    noise(0.07, 0.14, 5000);
    env('square', 260, 520, 0.09, 0.1);
  },
  btstart() {
    env('sine', 160, 80, 0.35, 0.08);
  },
  shield() {
    noise(0.05, 0.08, 800);
  },
  ui() {
    env('square', 660, 880, 0.05, 0.08);
  },
  milestone(n?: number) {
    const k = isFinite(n ?? 0) ? Math.min((n ?? 0) / 5, 6) : 0;
    env('square', 520 + k * 60, 1040 + k * 80, 0.12, 0.12);
    setTimeout(() => env('sine', 780 + k * 80, 1300, 0.16, 0.1), 70);
  },
  graze() {
    env('sine', 1500, 2400, 0.05, 0.05);
    noise(0.04, 0.04, 5200);
  },
};

// Keep the audio graph in sync with live settings changes (volume slider, mute).
onSettingsChange(applyLevel);

export const audio = {
  unlock,
  play(name: string, arg?: number): void {
    ensure();
    const fn = sfx[name];
    if (fn) fn(arg);
  },
  /** Drive the background drone from the current time-tension (0..1). */
  tension(t: number): void {
    if (!droneGain || !droneFilt) return;
    const tt = clamp(t, 0, 1);
    droneGain.gain.value = lerp(droneGain.gain.value, 0.05 + tt * 0.13, 0.2);
    droneFilt.frequency.value = lerp(droneFilt.frequency.value, 300 + tt * 900, 0.2);
  },
  /** Re-apply mute/volume to the live graph. */
  refresh: applyLevel,
};
