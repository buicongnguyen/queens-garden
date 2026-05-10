import {
  countSolutions,
  createPuzzle,
  validateSolutionColumns,
} from "../src/engine.js";

const sizes = [7, 8, 9, 10, 11, 12, 13];

for (const size of sizes) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const seed = size * 1000 + attempt * 37;
    const puzzle = createPuzzle(size, seed);
    const solutions = countSolutions(puzzle, 2);
    const validSolution = validateSolutionColumns(puzzle, puzzle.queens);

    if (solutions !== 1) {
      throw new Error(`Expected one solution for size ${size}, found ${solutions}.`);
    }

    if (!validSolution) {
      throw new Error(`Generated solution failed validation for size ${size}.`);
    }

    console.log(
      `size ${size} seed ${puzzle.seed.toString(16).toUpperCase()} verified`,
    );
  }
}

console.log("All generated puzzles passed validation.");
