/**
 * Thin, defensive shim around the optional CrazyGames SDK.
 *
 * Every method degrades gracefully: if the SDK is absent (which it is when the
 * game runs on GitHub Pages or locally), ad requests resolve immediately and
 * lifecycle hooks become no-ops. The game never depends on it being present.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnySDK = any;

let s: AnySDK = null;
let ready = false;
let adActive = false;

async function init(): Promise<void> {
  try {
    const cg = (window as any).CrazyGames;
    if (cg && cg.SDK) {
      s = cg.SDK;
      await s.init();
      ready = true;
    }
  } catch {
    /* SDK unavailable — run standalone */
  }
}

const has = (): boolean => ready && s && s.ad && s.game;

export const SDK = {
  init,
  isAdActive(): boolean {
    return adActive;
  },
  loadingStart(): void {
    try {
      if (has()) s.game.sdkGameLoadingStart();
    } catch {
      /* noop */
    }
  },
  loadingStop(): void {
    try {
      if (has()) s.game.sdkGameLoadingStop();
    } catch {
      /* noop */
    }
  },
  gameplayStart(): void {
    try {
      if (has()) s.game.gameplayStart();
    } catch {
      /* noop */
    }
  },
  gameplayStop(): void {
    try {
      if (has()) s.game.gameplayStop();
    } catch {
      /* noop */
    }
  },
  happytime(): void {
    try {
      if (has()) s.game.happytime();
    } catch {
      /* noop */
    }
  },
  midgame(done?: () => void): void {
    if (!has()) {
      done && done();
      return;
    }
    adActive = true;
    try {
      s.ad.requestAd('midgame', {
        adFinished: () => {
          adActive = false;
          done && done();
        },
        adError: () => {
          adActive = false;
          done && done();
        },
        adStarted: () => {},
      });
    } catch {
      adActive = false;
      done && done();
    }
  },
  rewarded(onReward?: () => void, onFail?: () => void): void {
    if (!has()) {
      onFail && onFail();
      return;
    }
    adActive = true;
    try {
      s.ad.requestAd('rewarded', {
        adFinished: () => {
          adActive = false;
          onReward && onReward();
        },
        adError: () => {
          adActive = false;
          onFail && onFail();
        },
        adStarted: () => {},
      });
    } catch {
      adActive = false;
      onFail && onFail();
    }
  },
};
