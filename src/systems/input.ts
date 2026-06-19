/**
 * Input layer: keyboard + mouse + touch state, plus the viewport transform
 * used to map client (CSS pixel) coordinates into the 960x600 logical space.
 *
 * Edge flags (`pressed`, `downEdge`, ...) are one-frame "just happened" signals
 * cleared by `endFrame()` at the end of every loop iteration.
 */

import { W, H } from '../core/constants';

interface Mouse {
  x: number;
  y: number;
  down: boolean;
  downEdge: boolean;
  rdown: boolean;
  rdownEdge: boolean;
}

interface TouchState {
  moveActive: boolean;
  mvx: number;
  mvy: number;
  aimActive: boolean;
  ax: number;
  ay: number;
  throwEdge: boolean;
  dashEdge: boolean;
}

interface View {
  scale: number;
  ox: number;
  oy: number;
}

const keys: Record<string, boolean> = Object.create(null);
const pressed: Record<string, boolean> = Object.create(null);
const mouse: Mouse = { x: W / 2, y: H / 2, down: false, downEdge: false, rdown: false, rdownEdge: false };
const view: View = { scale: 1, ox: 0, oy: 0 };
const touch: TouchState = {
  moveActive: false,
  mvx: 0,
  mvy: 0,
  aimActive: false,
  ax: 0,
  ay: 0,
  throwEdge: false,
  dashEdge: false,
};
let anyEdge = false;

function toLogical(cx: number, cy: number): { x: number; y: number } {
  return { x: (cx - view.ox) / view.scale, y: (cy - view.oy) / view.scale };
}

function setView(scale: number, ox: number, oy: number): void {
  view.scale = scale;
  view.ox = ox;
  view.oy = oy;
}

function bindKeyboard(): void {
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(k) >= 0) e.preventDefault();
    if (!keys[k]) pressed[k] = true;
    keys[k] = true;
    anyEdge = true;
  });
  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });
  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
  });
}

function bindMouse(cv: HTMLCanvasElement): void {
  cv.addEventListener('mousemove', (e) => {
    const p = toLogical(e.clientX, e.clientY);
    mouse.x = p.x;
    mouse.y = p.y;
  });
  cv.addEventListener('mousedown', (e) => {
    const p = toLogical(e.clientX, e.clientY);
    mouse.x = p.x;
    mouse.y = p.y;
    if (e.button === 0) {
      if (!mouse.down) mouse.downEdge = true;
      mouse.down = true;
    }
    if (e.button === 2) {
      if (!mouse.rdown) mouse.rdownEdge = true;
      mouse.rdown = true;
    }
    anyEdge = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
    if (e.button === 2) mouse.rdown = false;
  });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
}

function endFrame(): void {
  for (const k in pressed) delete pressed[k];
  mouse.downEdge = false;
  mouse.rdownEdge = false;
  touch.throwEdge = false;
  touch.dashEdge = false;
  anyEdge = false;
}

export const Input = {
  keys,
  pressed,
  mouse,
  touch,
  view,
  setView,
  toLogical,
  bindKeyboard,
  bindMouse,
  endFrame,
  consumedAnyEdge(): boolean {
    return anyEdge;
  },
  flagEdge(): void {
    anyEdge = true;
  },
};
