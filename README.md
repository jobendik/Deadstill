<div align="center">

<img src="./public/favicon.svg" width="84" height="84" alt="DEADSTILL logo" />

# DEADSTILL — Rewind Edition

**Time only moves when you do.**

A time-bending, twin-stick arena shooter for the browser. Stand still and the
world freezes around you; move and time flows. Plan the perfect shot in frozen
time, then rewind death itself into a temporal echo of your past self that
fights at your side.

[**▶ Play it live**](https://jobendik.github.io/deadstill/) · Built with TypeScript + Vite + Canvas 2D

[![Deploy to GitHub Pages](https://github.com/jobendik/deadstill/actions/workflows/deploy.yml/badge.svg)](https://github.com/jobendik/deadstill/actions/workflows/deploy.yml)

</div>

---

## Gameplay

The core idea is a *"time moves when you move"* dilation mechanic. Holding still
slows the world to a near-stop, giving you room to read bullet patterns and line
up shots. The faster you move, the faster time runs — so every step is a
trade-off between safety and speed.

Layered on top of that are a handful of systems that reward aggressive,
stylish play:

| System | What it does |
| --- | --- |
| ⏪ **Rewind** | On death, spend a charge to rewind ~1.3s and keep fighting. Earn charges by chaining kills. |
| 👻 **Temporal Echoes** | Each rewind spawns a ghost that re-enacts your last moments — including your shots — fighting alongside you. |
| 🟢 **Bullet Time** | Hold to crush time to a crawl independent of movement, draining a regenerating meter. |
| 💨 **Dash** | A short i-frame dash that shreds enemies and deflects bullets on contact. |
| ✨ **Style Meter** | Ranks from D → SSS. Kills in frozen time, disarms, long shots, echo and dash kills all build it — and it multiplies your score. |
| 🔫 **Weapons** | Pistol, shotgun and rifle. Run dry? Throw your gun as a projectile, then grab another off the floor. |

### Enemies

- **Gunner** — keeps its distance and fires aimed shots.
- **Rusher** — charges straight at you; deadly on contact.
- **Sniper** — telegraphs a charged hitscan beam. Don't be standing in it.
- **Shield** — a frontal arc deflects bullets; flank it or throw a gun through it.
- **Time Hunter** — partly immune to time dilation, so it keeps moving even when the world is frozen. An elite version periodically hunts you down.

## Controls

**Keyboard & mouse**

| Action | Key |
| --- | --- |
| Move | `W` `A` `S` `D` / Arrows |
| Aim | Mouse |
| Shoot | Left mouse |
| Throw weapon | `Space` / Right mouse |
| Dash | `Shift` / `E` |
| Bullet time | Hold `Q` |
| Rewind (after death) | `R` / `Space` |
| Pause / settings | `Esc` / ⚙ |

**Touch** — twin virtual sticks (left = move, right = aim & fire), with on-screen
**Throw**, **Dash** and **Pause** buttons. The layout appears automatically on
touch devices.

## Tech stack

- **TypeScript** (strict) — fully typed simulation, rendering and UI.
- **Vite** — dev server, bundling and production build.
- **Canvas 2D** — all rendering is hand-rolled vector drawing; no asset files.
- **Web Audio API** — every sound effect and the background drone are synthesised at runtime.
- **Zero runtime dependencies** — the shipped bundle is ~15 kB gzipped.

## Getting started

```bash
# Install dependencies
npm install

# Start the dev server (hot-reload) at http://localhost:5173
npm run dev

# Type-check + production build into dist/
npm run build

# Preview the production build locally
npm run preview

# Type-check only
npm run typecheck
```

Requires Node.js 18+.

## Project structure

```
.
├── index.html              # App shell — loads src/main.ts
├── public/                 # Static assets copied verbatim (favicon, manifest)
├── src/
│   ├── main.ts             # Entry point: loop, app state machine, wiring
│   ├── style.css           # All UI styling
│   ├── core/               # Engine-agnostic primitives
│   │   ├── constants.ts    #   resolution, arena bounds, palette
│   │   ├── math.ts         #   clamp/lerp/rng/vector helpers
│   │   ├── color.ts        #   hex parsing, rgba, colour mixing
│   │   └── types.ts        #   all entity & state interfaces
│   ├── systems/            # Cross-cutting services
│   │   ├── audio.ts        #   procedural Web Audio engine
│   │   ├── input.ts        #   keyboard / mouse / touch + view transform
│   │   ├── settings.ts     #   persisted volume / shake / reduced-motion
│   │   └── sdk.ts          #   optional CrazyGames ads shim (degrades to no-op)
│   ├── game/               # Simulation
│   │   ├── Game.ts         #   the entire game state & step()
│   │   └── config.ts       #   weapons, style ranks, wave tuning
│   ├── render/             # Rendering (reads state, never mutates)
│   │   ├── render.ts       #   orchestrator + idle/menu background
│   │   ├── scene.ts        #   world pass (entities, FX, screen shake)
│   │   └── hud.ts          #   HUD, popups & overlays
│   └── ui/                 # DOM glue
│       ├── screens.ts      #   menu / pause / game-over / settings panels
│       └── touch.ts        #   on-screen touch controls
└── .github/workflows/      # CI: build & deploy to GitHub Pages
```

The architecture keeps a clean one-way data flow: **input → simulation → render**.
`Game` owns all state and is the single source of truth; the renderer is a pure
function of that state, and the UI/DOM layer only sends intents in and reads
summary stats out.

## Deployment

The site deploys to **GitHub Pages** automatically via GitHub Actions
(`.github/workflows/deploy.yml`) on every push to `main`. The workflow builds
with Vite and publishes `dist/`, and enables Pages on its first run
(`actions/configure-pages` with `enablement: true`).

> If your repository has never used Actions-based Pages before, you may need to
> confirm **Settings → Pages → Build and deployment → Source: GitHub Actions**
> once. After that it's hands-off.

Vite is configured with a relative `base` (`./`), so the build works unchanged
whether it's served from the project subpath
(`https://jobendik.github.io/deadstill/`) or a custom domain root.

## Accessibility & polish

- **Settings** panel (⚙) with master volume, screen-shake intensity, a
  reduced-motion toggle and mute — all persisted to `localStorage`.
- **Auto-pause** when the tab is hidden or loses focus.
- **DPI-aware rendering** — the canvas is drawn at device resolution so visuals
  stay crisp on high-density displays.
- **Installable** as a PWA via the web manifest.

## License

[MIT](./LICENSE) © jobendik
