/**
 * DOM overlay management: the title/menu, pause, game-over and settings panels,
 * plus the top-right utility buttons. Action buttons are wired to the supplied
 * handlers; the settings controls are wired straight to the settings module and
 * audio engine so changes take effect (and persist) immediately.
 */

import {
  settings,
  setVolume,
  setMuted,
  setScreenShake,
  setReducedMotion,
} from '../systems/settings';
import { audio } from '../systems/audio';

export interface ScreenHandlers {
  onPlay: () => void;
  onResume: () => void;
  onQuit: () => void;
  onMenu: () => void;
  onAgain: () => void;
  onRevive: () => void;
}

export interface GameOverStats {
  score: number;
  best: number;
  wave: number;
  kills: number;
  bestStreak: number;
  runTime: number;
  newBest: boolean;
  showRevive: boolean;
}

const MUTE_ON = '♪';
const MUTE_OFF = '♪̸';

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return m + ':' + String(s % 60).padStart(2, '0');
}

export function createScreens(handlers: ScreenHandlers) {
  const elMenu = $('menu');
  const elPause = $('pause');
  const elOver = $('over');
  const elSettings = $('settings');
  const elLoading = $('loading');

  let settingsReturn: (() => void) | null = null;

  function showPanel(el: HTMLElement): void {
    el.classList.add('on');
    el.style.display = 'flex';
  }
  function hidePanel(el: HTMLElement): void {
    el.classList.remove('on');
    el.style.display = 'none';
  }
  function hideOverlays(): void {
    for (const el of [elMenu, elPause, elOver, elSettings]) hidePanel(el);
  }

  // ---- Action buttons ----
  $('playBtn').onclick = handlers.onPlay;
  $('againBtn').onclick = handlers.onAgain;
  $('resumeBtn').onclick = handlers.onResume;
  $('quitBtn').onclick = handlers.onQuit;
  $('menuBtn').onclick = handlers.onMenu;
  $('reviveBtn').onclick = handlers.onRevive;

  // ---- Mute icon ----
  const muteBtn = $('muteBtn');
  function syncMute(): void {
    muteBtn.textContent = settings.muted ? MUTE_OFF : MUTE_ON;
    const mc = $('setMute') as HTMLInputElement;
    if (mc) mc.checked = settings.muted;
  }
  muteBtn.onclick = () => {
    setMuted(!settings.muted);
    audio.unlock();
    syncMute();
  };

  // ---- Settings controls ----
  const volEl = $('setVol') as HTMLInputElement;
  const shakeEl = $('setShake') as HTMLInputElement;
  const reduceEl = $('setReduce') as HTMLInputElement;
  const muteEl = $('setMute') as HTMLInputElement;

  function syncSettingsControls(): void {
    volEl.value = String(Math.round(settings.volume * 100));
    shakeEl.value = String(Math.round(settings.screenShake * 100));
    reduceEl.checked = settings.reducedMotion;
    muteEl.checked = settings.muted;
  }
  volEl.addEventListener('input', () => {
    setVolume(Number(volEl.value) / 100);
    audio.unlock();
  });
  shakeEl.addEventListener('input', () => setScreenShake(Number(shakeEl.value) / 100));
  reduceEl.addEventListener('change', () => setReducedMotion(reduceEl.checked));
  muteEl.addEventListener('change', () => {
    setMuted(muteEl.checked);
    syncMute();
  });

  function openSettings(returnTo: (() => void) | null): void {
    settingsReturn = returnTo;
    syncSettingsControls();
    hideOverlays();
    showPanel(elSettings);
    audio.play('ui');
  }
  function closeSettings(): void {
    hidePanel(elSettings);
    const back = settingsReturn;
    settingsReturn = null;
    if (back) back();
  }
  $('settingsClose').onclick = closeSettings;

  syncMute();

  return {
    elLoading,
    showMenu(): void {
      hideOverlays();
      showPanel(elMenu);
    },
    showPause(): void {
      showPanel(elPause);
    },
    hidePause(): void {
      hidePanel(elPause);
    },
    hideOverlays,
    openSettings,
    closeSettings,
    isSettingsOpen(): boolean {
      return elSettings.classList.contains('on');
    },
    setMenuBest(n: number): void {
      $('menuBest').textContent = n.toLocaleString();
    },
    showGameOver(stats: GameOverStats): void {
      ($('ovScore') as HTMLElement).textContent = stats.score.toLocaleString();
      ($('ovBest') as HTMLElement).textContent = stats.best.toLocaleString();
      ($('ovWave') as HTMLElement).textContent = String(stats.wave);
      ($('ovKills') as HTMLElement).textContent = String(stats.kills);
      ($('ovStreak') as HTMLElement).textContent = String(stats.bestStreak);
      ($('ovTime') as HTMLElement).textContent = fmtTime(stats.runTime);
      ($('menuBest') as HTMLElement).textContent = stats.best.toLocaleString();
      $('ovNew').classList.toggle('hidden', !stats.newBest);
      $('reviveBtn').classList.toggle('hidden', !stats.showRevive);
      showPanel(elOver);
    },
    /** Open settings from the global gear, remembering where to return. */
    openSettingsFor(returnTo: (() => void) | null): void {
      openSettings(returnTo);
    },
  };
}

export type Screens = ReturnType<typeof createScreens>;
