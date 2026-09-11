# Queen's Garden

Queen's Garden is a browser puzzle inspired by Queens / 1-star Star Battle:

- Place exactly one queen in every row.
- Place exactly one queen in every column.
- Place exactly one queen in every colored region.
- Queens cannot touch diagonally.

## Run it

1. `npm run serve`
2. Open `http://localhost:4285`

## Verify the game

- `npm ci` installs the development-only browser testing tools.
- `npx playwright install chromium` installs the test browser.
- `npm run test:browser` checks undo/redo, daily selection, scoring, progression,
  responsive layout, 3D preview, and validates the downloadable glTF.
- To use an installed Edge on Windows: set `PLAYWRIGHT_CHANNEL=msedge` in the
  environment before running the browser tests.

- `npm test` checks JavaScript syntax, gameplay logic, hint deductions, seed replay,
  and every saved puzzle.
- `npm run build:levels` regenerates `src/level-db.js`.
- `npm run verify` also regenerates the level database in memory and fails if the
  committed file is stale.

## Deploy to GitHub Pages

- GitHub Actions deploys the site automatically from `main`.
- The workflow lives at `.github/workflows/deploy-pages.yml`.
- The live site is published at `https://buicongnguyen.github.io/queens-garden/`.

## Notes

- Version 0.4 adds a Blender-modeled porcelain, gold, and jade queen, a Cycles-rendered
  2D token, and a lazy-loaded Three.js PBR preview with reflections and shadows.
  Use **Inspect queen model** for a close-up; scene export always uses the real board.
  WebGL2 is required only for the preview, not gameplay or Blender export.
- Editable source: `assets/queen-source.blend`; portable model: `assets/queen-real.glb`.
  Rebuild assets with Blender 4.5: `blender --background --python scripts/create-queen.py`.
  Rebuild the committed browser bundle with `npm ci` then `npm run build:renderer`.
  Queen geometry/materials are shared with export; tile bevels and studio lighting
  are preview presentation effects, not exported scene geometry.

- Undo/Redo treats a swipe or right-drag as one move. Finished games are locked;
  Reset starts a new attempt. Hints flag an attempt as assisted and prevent a
  best-time record. Old records cannot be retroactively classified.
- Daily garden is a shared UTC-date-based 7×7 challenge. It cycles through the
  20 validated layouts and does not count toward random best-time records.
- Use Region numbers to identify regions without relying on color.
- Game → 3D garden shows the current position as a rotatable mesh scene. Download
  its `.gltf` and import it in Blender with File → Import → glTF 2.0. The export
  has embedded geometry/materials and cell metadata; it does not include the
  hidden solution. The 2D grid remains the playable board.
- See [the evaluated implementation plan](docs/IMPROVEMENT_PLAN.md) for design
  decisions, logic review, validation, and future suggestions.

- Board sizes now run from `7x7` through `15x15`.
- Procedural generation is intentionally limited to `7x7` through `9x9`; larger
  boards use the validated saved database so the browser stays responsive.
- Random games select from validated saved layouts and use the displayed seed for a reproducible palette and level choice.
- Each board is checked so it has exactly one solution.
- Some preset region layouts were adapted from the MIT-licensed community levels in
  `samimsu/queens-game`; see [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).
- Runtime and generated source artwork live in [`assets`](./assets).
- The site is GitHub Pages friendly because it uses relative asset paths and includes `.nojekyll`.
