/**
 * On-screen touch controls: twin virtual sticks (left = move, right = aim/fire)
 * plus throw, dash and pause buttons. Writes directly into the shared input
 * touch state; the rest of the game treats touch and keyboard identically.
 */

import { clamp } from '../core/math';
import { Input } from '../systems/input';
import { audio } from '../systems/audio';

interface TouchHandlers {
  /** Flag a "tap" edge (used to trigger rewind on the death screen). */
  setTapEdge: () => void;
  /** Toggle pause/resume from the on-screen pause button. */
  onPauseToggle: () => void;
}

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

export function bindTouch(handlers: TouchHandlers): void {
  const stickL = $('stickL');
  const stickR = $('stickR');
  const nubL = stickL.firstElementChild as HTMLElement;
  const nubR = stickR.firstElementChild as HTMLElement;
  let idL: number | null = null;
  let oxL = 0;
  let oyL = 0;
  let idR: number | null = null;
  let oxR = 0;
  let oyR = 0;
  const R = 52;

  function place(st: HTMLElement, x: number, y: number): void {
    st.style.left = x + 'px';
    st.style.top = y + 'px';
    st.style.display = 'block';
  }
  function moveNub(nub: HTMLElement, dx: number, dy: number): void {
    const l = Math.hypot(dx, dy) || 1;
    const c = Math.min(R, l);
    nub.style.transform = 'translate(' + (dx / l) * c + 'px,' + (dy / l) * c + 'px)';
  }

  $('padL').addEventListener(
    'pointerdown',
    (e) => {
      idL = e.pointerId;
      oxL = e.clientX;
      oyL = e.clientY;
      place(stickL, e.clientX, e.clientY);
      Input.touch.moveActive = true;
      audio.unlock();
      e.preventDefault();
    },
    { passive: false },
  );
  $('padR').addEventListener(
    'pointerdown',
    (e) => {
      idR = e.pointerId;
      oxR = e.clientX;
      oyR = e.clientY;
      place(stickR, e.clientX, e.clientY);
      Input.touch.aimActive = true;
      audio.unlock();
      handlers.setTapEdge();
      e.preventDefault();
    },
    { passive: false },
  );
  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerId === idL) {
        const dx = e.clientX - oxL;
        const dy = e.clientY - oyL;
        moveNub(nubL, dx, dy);
        Input.touch.mvx = clamp(dx / R, -1, 1);
        Input.touch.mvy = clamp(dy / R, -1, 1);
      }
      if (e.pointerId === idR) {
        const dx = e.clientX - oxR;
        const dy = e.clientY - oyR;
        const l = Math.hypot(dx, dy) || 1;
        moveNub(nubR, dx, dy);
        Input.touch.ax = dx / l;
        Input.touch.ay = dy / l;
      }
    },
    { passive: false },
  );
  function up(e: PointerEvent): void {
    if (e.pointerId === idL) {
      idL = null;
      Input.touch.moveActive = false;
      Input.touch.mvx = 0;
      Input.touch.mvy = 0;
      stickL.style.display = 'none';
      nubL.style.transform = '';
    }
    if (e.pointerId === idR) {
      idR = null;
      Input.touch.aimActive = false;
      stickR.style.display = 'none';
      nubR.style.transform = '';
    }
  }
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);

  $('throwBtn').addEventListener(
    'pointerdown',
    (e) => {
      Input.touch.throwEdge = true;
      e.preventDefault();
    },
    { passive: false },
  );
  $('dashBtn').addEventListener(
    'pointerdown',
    (e) => {
      Input.touch.dashEdge = true;
      e.preventDefault();
    },
    { passive: false },
  );
  $('pauseBtn').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handlers.onPauseToggle();
  });
}
