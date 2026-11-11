# Garbage Can Race: agent instructions

Workspace rules come first: `E:\projects\AGENTS.md`.

Garbage Can Race is a VR and browser game: a rider in a garbage can rolls down a procedural
town hill, alone or with others through the lobby. This repository owns the game's world,
rules, data and persistence. Nothing else lives here.

## Boundaries

- Halo (`@rb/halo`) owns the scene rig, frame loop, navigation, input, WebGL HUD and WebXR.
  A capability another game would want is a Halo ticket, not code here.
- Halo is pinned to a release tag in `package.json` (`github:Rick-Boardman/vr-halo#vX.Y.Z`).
  Source imports it as `@rb/halo` or `@rb/halo/src/...`. In the browser, `index.html`'s import
  map resolves those names into `node_modules`. In Node, the package's `exports` resolve them.
- Only the import map names `node_modules`. No source or test imports
  `../node_modules/...`, a sibling checkout (`../halo`, `../lattice`) or a `file:` dependency.
  No `?v=` cache-busting on library imports: one module instance per source file.
- `three` and `troika-three-text` match Halo's peer versions and load through the same import
  map, so there is one Three.js instance.
- `npm start` proxies `/api/play/*` to Magna's local play API on `PLAY_API_PORT` (default 4339). That
  server is not in this repository. Without it the lobby says it is not running and offers
  solo play. `PLAY_API_URL` selects an existing API origin instead. Magna's pinned lobby
  lives in `vendor/magna-play/`; `config/play-game.json` is the target site's game policy.

## Verify

- `npm run check`: relative imports resolve. Halo comes from a pinned tag through the import
  map, and nothing imports a `node_modules` path or a sibling checkout.
- `npm test`: the unit tests in `tests/`.
- `npm start`: serves the game at http://127.0.0.1:8090 (`PORT` changes it).
- `npm run look`: an optional headless browser pass with screenshots in `dist/shots/`.
  `playwright` is not a dependency. Install it with `npm i --no-save playwright` and
  `npx playwright install chromium`.
