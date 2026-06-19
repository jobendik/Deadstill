/**
 * Application shell.
 *
 * Owns the canvas, the fixed-timestep-ish animation loop, the high-level app
 * state machine (menu / playing / paused / over) and all the glue between the
 * simulation, renderer, input, audio, settings UI and the optional ads SDK.
 */

import './style.css';

import { W, H } from './core/constants';
import { len } from './core/math';
import { Game } from './game/Game';
import { render, idleBackground } from './render/render';
import { Input } from './systems/input';
import { audio } from './systems/audio';
import { SDK } from './systems/sdk';
import { bindTouch } from './ui/touch';
import { createScreens, type GameOverStats } from './ui/screens';
import type { Command } from './core/types';

const cv = document.getElementById('game') as HTMLCanvasElement;
const ctx = cv.getContext('2d') as CanvasRenderingContext2D;

const hasAds = !!(window as unknown as { CrazyGames?: unknown }).CrazyGames;

type App = 'menu' | 'playing' | 'paused' | 'over';
let app: App = 'menu';
let game: Game | null = null;
let last = performance.now();
let lastWave = 1;
let revived = false;
let tapEdge = false;
let lastOverStats: GameOverStats | null = null;

// ---- Best score persistence ----
let best = 0;
try {
  best = parseInt(localStorage.getItem('deadstill.best') || '0', 10) || 0;
} catch {
  /* storage unavailable */
}

// ---- Screens / UI ----
const screens = createScreens({
  onPlay: startGame,
  onAgain: startGame,
  onResume: doResume,
  onQuit: toMenu,
  onMenu: toMenu,
  onRevive: doRevive,
});
screens.setMenuBest(best);

// Contextual settings access from the global gear button.
function openSettingsContextual(): void {
  if (app === 'playing' && game && game.state === 'play') {
    doPause();
    screens.openSettingsFor(() => screens.showPause());
  } else if (app === 'paused') {
    screens.openSettingsFor(() => screens.showPause());
  } else if (app === 'over' && lastOverStats) {
    const stats = lastOverStats;
    screens.openSettingsFor(() => screens.showGameOver(stats));
  } else {
    screens.openSettingsFor(() => screens.showMenu());
  }
}
(document.getElementById('settingsBtn') as HTMLElement).onclick = openSettingsContextual;
(document.getElementById('settingsFromPause') as HTMLElement).onclick = () =>
  screens.openSettingsFor(() => screens.showPause());

// ---- Viewport (crisp, DPI-aware sizing) ----
function updateView(): void {
  const maxW = window.innerWidth;
  const maxH = window.innerHeight;
  const ar = W / H;
  let w = maxW;
  let h = w / ar;
  if (h > maxH) {
    h = maxH;
    w = h * ar;
  }
  cv.style.width = w + 'px';
  cv.style.height = h + 'px';
  // Render at device resolution (capped) so vectors stay sharp on hi-DPI.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const r = cv.getBoundingClientRect();
  Input.setView(r.width / W, r.left, r.top);
}
window.addEventListener('resize', updateView);
window.addEventListener('scroll', updateView, { passive: true });

// ---- Input wiring ----
Input.bindKeyboard();
Input.bindMouse(cv);
cv.addEventListener('pointerdown', () => {
  audio.unlock();
  tapEdge = true;
});

const isTouch =
  'ontouchstart' in window ||
  navigator.maxTouchPoints > 0 ||
  (window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
if (isTouch) (document.getElementById('mob') as HTMLElement).classList.add('show');

bindTouch({
  setTapEdge: () => {
    if (app !== 'playing') tapEdge = true;
  },
  onPauseToggle: () => {
    if (app === 'playing' && game && game.state === 'play') doPause();
    else if (app === 'paused') doResume();
  },
});

// Auto-pause when the tab loses focus or is hidden — a small pro touch.
window.addEventListener('blur', () => {
  if (app === 'playing' && game && game.state === 'play') doPause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && app === 'playing' && game && game.state === 'play') doPause();
});

// ---- Command building (keyboard + mouse + touch unified) ----
function buildCmd(): Command {
  const k = Input.keys;
  let mvx = (k['d'] || k['arrowright'] ? 1 : 0) - (k['a'] || k['arrowleft'] ? 1 : 0);
  let mvy = (k['s'] || k['arrowdown'] ? 1 : 0) - (k['w'] || k['arrowup'] ? 1 : 0);
  if (Input.touch.moveActive) {
    mvx += Input.touch.mvx;
    mvy += Input.touch.mvy;
  }
  const l = len(mvx, mvy);
  if (l > 1) {
    mvx /= l;
    mvy /= l;
  }
  let ax: number;
  let ay: number;
  let fire: boolean;
  if (Input.touch.aimActive && game) {
    const p = game.player;
    ax = p.x + Input.touch.ax * 220;
    ay = p.y + Input.touch.ay * 220;
    fire = true;
  } else {
    ax = Input.mouse.x;
    ay = Input.mouse.y;
    fire = Input.mouse.down;
  }
  const thrw = !!(Input.pressed[' '] || Input.mouse.rdownEdge || Input.touch.throwEdge);
  const dash = !!(Input.pressed['shift'] || Input.pressed['e'] || Input.touch.dashEdge);
  const bt = !!Input.keys['q'];
  return { mx: mvx, my: mvy, ax, ay, fire, thrw, dash, bt };
}

// ---- App state transitions ----
function toMenu(): void {
  app = 'menu';
  screens.showMenu();
  SDK.gameplayStop();
}
function startGame(): void {
  screens.hideOverlays();
  audio.unlock();
  game = new Game();
  lastWave = 1;
  revived = false;
  app = 'playing';
  SDK.gameplayStart();
}
function doPause(): void {
  if (app !== 'playing' || !game || game.state !== 'play') return;
  app = 'paused';
  screens.showPause();
  SDK.gameplayStop();
}
function doResume(): void {
  if (app !== 'paused') return;
  if (screens.isSettingsOpen()) screens.closeSettings();
  app = 'playing';
  screens.hidePause();
  SDK.gameplayStart();
}
function doRevive(): void {
  if (!game) return;
  revived = true;
  SDK.rewarded(
    () => {
      if (game && game.reviveFromAd()) {
        app = 'playing';
        screens.hideOverlays();
        SDK.gameplayStart();
      }
    },
    () => {},
  );
}
function toGameOver(): void {
  if (!game) return;
  app = 'over';
  const newBest = game.score > best;
  if (newBest) {
    best = game.score;
    try {
      localStorage.setItem('deadstill.best', String(best));
    } catch {
      /* ignore */
    }
  }
  lastOverStats = {
    score: game.score,
    best,
    wave: game.wave,
    kills: game.kills,
    bestStreak: game.bestStreak,
    runTime: game.runTime,
    newBest,
    showRevive: hasAds && !revived,
  };
  screens.showGameOver(lastOverStats);
  SDK.gameplayStop();
  audio.play('over');
}

// ---- Main loop ----
function loop(t: number): void {
  let dt = (t - last) / 1000;
  if (dt > 0.05) dt = 0.05;
  last = t;

  // Base transform maps the 960x600 logical space onto the DPI-scaled canvas.
  ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);

  // Allow Escape to back out of the settings overlay from anywhere.
  if (Input.pressed['escape'] && screens.isSettingsOpen()) {
    screens.closeSettings();
  }

  if (app === 'playing' && game) {
    if (SDK.isAdActive()) {
      render(ctx, game, t / 1000);
      Input.endFrame();
      tapEdge = false;
      requestAnimationFrame(loop);
      return;
    }
    if (game.wave > lastWave) {
      const w = game.wave;
      lastWave = w;
      if (w > 1 && w % 4 === 1) SDK.midgame(() => {});
    }
    if (game.state === 'play') {
      if (Input.pressed['escape']) doPause();
      else if (game.hitstop > 0) game.hitstop -= dt;
      else game.step(dt, buildCmd());
    } else if (game.state === 'dead') {
      if (Input.pressed['escape']) game.giveUp();
      else {
        const wantR =
          Input.pressed[' '] || Input.pressed['r'] || Input.mouse.downEdge || tapEdge;
        if (wantR) {
          if (game.charges > 0) game.requestRewind();
          else if (hasAds)
            SDK.rewarded(
              () => {
                game!.grantRewind();
                game!.requestRewind();
              },
              () => {},
            );
        }
      }
      if (game.hitstop > 0) game.hitstop -= dt;
      else game.step(dt, null);
    } else {
      game.step(dt, null);
    }
    audio.tension(game.state === 'play' ? game.ts : 0);
    if (game.state === 'over') toGameOver();
    render(ctx, game, t / 1000);
  } else if (app === 'paused') {
    if (game) render(ctx, game, t / 1000);
    audio.tension(0);
  } else if (app === 'over') {
    if (game) render(ctx, game, t / 1000);
  } else {
    idleBackground(ctx, t / 1000);
  }

  Input.endFrame();
  tapEdge = false;
  requestAnimationFrame(loop);
}

// ---- Boot ----
updateView();
screens.showMenu();
requestAnimationFrame(loop);

SDK.loadingStart();
SDK.init()
  .then(() => {
    SDK.loadingStop();
    screens.elLoading.style.display = 'none';
  })
  .catch(() => {
    screens.elLoading.style.display = 'none';
  });
setTimeout(() => {
  screens.elLoading.style.display = 'none';
}, 1400);
