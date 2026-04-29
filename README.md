# Queen's Garden

Queen's Garden is a browser puzzle inspired by Queens / 1-star Star Battle:

- Place exactly one queen in every row.
- Place exactly one queen in every column.
- Place exactly one queen in every colored region.
- Queens cannot touch diagonally.

## Run it

1. `npm run serve`
2. Open `http://localhost:4285`

## Verify puzzle generation

- `npm test`

## Deploy to GitHub Pages

- GitHub Actions deploys the site automatically from `main`.
- The workflow lives at `.github/workflows/deploy-pages.yml`.
- The live site is published at `https://buicongnguyen.github.io/queens-garden/`.

## Notes

- Boards are generated locally in the browser.
- Each generated board is checked so it has exactly one solution.
- The generated art lives in [assets](/C:/Users/n/OneDrive/Documents/New%20project%202/assets).
- The site is GitHub Pages friendly because it uses relative asset paths and includes `.nojekyll`.
