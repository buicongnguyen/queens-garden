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

- `npm test` checks JavaScript syntax, gameplay logic, hint deductions, seed replay,
  and every saved puzzle.
- `npm run build:levels` regenerates `src/level-db.js`.

## Deploy to GitHub Pages

- GitHub Actions deploys the site automatically from `main`.
- The workflow lives at `.github/workflows/deploy-pages.yml`.
- The live site is published at `https://buicongnguyen.github.io/queens-garden/`.

## Notes

- Board sizes now run from `7x7` through `15x15`.
- Random games select from validated saved layouts and use the displayed seed for a reproducible palette and level choice.
- Each board is checked so it has exactly one solution.
- Some preset region layouts were adapted from the MIT-licensed community levels in
  `samimsu/queens-game`; see [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).
- Runtime and generated source artwork live in [`assets`](./assets).
- The site is GitHub Pages friendly because it uses relative asset paths and includes `.nojekyll`.
