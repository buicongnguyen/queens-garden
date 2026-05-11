import {
  LEVELS_PER_SIZE,
  countSolutions,
  createFixedLevelPuzzle,
  createProceduralPuzzle,
  findDisconnectedRegion,
  getLevelCount,
  SUPPORTED_SIZES,
  validateSolutionColumns,
} from "../src/engine.js";

const PROCEDURAL_SIZES = [7, 8, 9];

for (const size of SUPPORTED_SIZES) {
  const levelCount = getLevelCount(size);
  const seenLayouts = new Set();

  if (levelCount !== LEVELS_PER_SIZE) {
    throw new Error(
      `Expected ${LEVELS_PER_SIZE} saved levels for size ${size}, found ${levelCount}.`,
    );
  }

  for (let levelIndex = 1; levelIndex <= levelCount; levelIndex += 1) {
    const puzzle = createFixedLevelPuzzle(size, levelIndex);
    const layoutKey = serializeRegions(puzzle.regions);
    const solutions = countSolutions(
      {
        ...puzzle,
        solutionCount: null,
      },
      2,
    );
    const validSolution = validateSolutionColumns(puzzle, puzzle.queens);
    const regionIssue = findDisconnectedRegion(puzzle.regions);

    if (solutions !== 1) {
      throw new Error(
        `Expected one solution for size ${size} level ${levelIndex}, found ${solutions}.`,
      );
    }

    if (!validSolution) {
      throw new Error(
        `Saved level ${levelIndex} failed queen validation for size ${size}.`,
      );
    }

    if (regionIssue) {
      throw new Error(
        `Saved level ${levelIndex} for size ${size} has disconnected region ${regionIssue.region}.`,
      );
    }

    if (seenLayouts.has(layoutKey)) {
      throw new Error(
        `Saved level ${levelIndex} for size ${size} duplicates an earlier layout.`,
      );
    }

    seenLayouts.add(layoutKey);

    console.log(
      `size ${size} level ${String(levelIndex).padStart(2, "0")} verified`,
    );
  }
}

for (const size of PROCEDURAL_SIZES) {
  const seed = size * 2000 + 91;
  const puzzle = createProceduralPuzzle(size, seed);
  const solutions = countSolutions(
    {
      ...puzzle,
      solutionCount: null,
    },
    2,
  );
  const validSolution = validateSolutionColumns(puzzle, puzzle.queens);
  const regionIssue = findDisconnectedRegion(puzzle.regions);

  if (solutions !== 1) {
    throw new Error(
      `Expected one procedural solution for size ${size}, found ${solutions}.`,
    );
  }

  if (!validSolution) {
    throw new Error(
      `Procedural solution failed validation for size ${size}.`,
    );
  }

  if (regionIssue) {
    throw new Error(
      `Procedural solution has disconnected region ${regionIssue.region} for size ${size}.`,
    );
  }

  console.log(
    `procedural size ${size} seed ${puzzle.seed.toString(16).toUpperCase()} verified`,
  );
}

console.log("All generated puzzles passed validation.");

function serializeRegions(regions) {
  return regions.map((row) => row.join(",")).join("|");
}
