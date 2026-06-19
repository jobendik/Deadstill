/**
 * Player-facing settings, persisted to localStorage.
 *
 * Kept as a single mutable module-level object so any system (audio, renderer,
 * UI) can read the current values cheaply without prop-drilling. Mutate through
 * the exported setters so changes are saved and broadcast.
 */

export interface Settings {
  /** Master volume 0..1. */
  volume: number;
  /** Mute toggle (independent of volume). */
  muted: boolean;
  /** Screen-shake intensity multiplier 0..1. */
  screenShake: number;
  /** Reduce flashes/full-screen effects for comfort & accessibility. */
  reducedMotion: boolean;
}

const KEY = 'deadstill.settings';

const DEFAULTS: Settings = {
  volume: 0.5,
  muted: false,
  screenShake: 1,
  reducedMotion: false,
};

function load(): Settings {
  const s: Settings = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(s, JSON.parse(raw));
    // Migrate the legacy standalone mute flag.
    if (localStorage.getItem('deadstill.mute') === '1') s.muted = true;
  } catch {
    /* ignore corrupt/unavailable storage */
  }
  s.volume = Math.min(1, Math.max(0, s.volume));
  s.screenShake = Math.min(1, Math.max(0, s.screenShake));
  return s;
}

export const settings: Settings = load();

type Listener = (s: Settings) => void;
const listeners = new Set<Listener>();

/** Subscribe to settings changes. Returns an unsubscribe function. */
export function onSettingsChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Persist and broadcast the current settings. */
export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
  for (const fn of listeners) fn(settings);
}

export function setVolume(v: number): void {
  settings.volume = Math.min(1, Math.max(0, v));
  saveSettings();
}

export function setMuted(m: boolean): void {
  settings.muted = m;
  saveSettings();
}

export function setScreenShake(v: number): void {
  settings.screenShake = Math.min(1, Math.max(0, v));
  saveSettings();
}

export function setReducedMotion(v: boolean): void {
  settings.reducedMotion = v;
  saveSettings();
}
