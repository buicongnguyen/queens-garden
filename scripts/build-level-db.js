import { writeFile } from "node:fs/promises";

import {
  SUPPORTED_SIZES,
  createProceduralPuzzle,
  createPuzzle,
  countSolutions,
  findDisconnectedRegion,
  validateSolutionColumns,
} from "../src/engine.js";

const DATABASE_LEVELS_PER_SIZE = 10;
const PROCEDURAL_DATABASE_SIZES = new Set([7, 8, 9]);
const OUTPUT_PATH = new URL("../src/level-db.js", import.meta.url);

const database = {};

for (const size of SUPPORTED_SIZES) {
  const entries = PROCEDURAL_DATABASE_SIZES.has(size)
    ? buildProceduralEntries(size, DATABASE_LEVELS_PER_SIZE)
    : buildPresetEntries(size, DATABASE_LEVELS_PER_SIZE);
  database[size] = entries;
  console.log(`built ${entries.length} level entries for ${size}x${size}`);
}

const output = `${serializeDatabaseModule(database)}\n`;
await writeFile(OUTPUT_PATH, output, "utf8");
console.log(`saved level database to ${OUTPUT_PATH.pathname}`);

function buildProceduralEntries(size, levelCount) {
  const entries = [];
  const seenLayouts = new Set();
  let attempt = 0;

  while (entries.length < levelCount) {
    const seed = size * 100000 + attempt * 7919 + 17;
    const puzzle = createProceduralPuzzle(size, seed);
    assertValidPuzzle(puzzle, `procedural size ${size} seed ${seed}`);
    const layoutKey = serializeRegions(puzzle.regions);

    if (seenLayouts.has(layoutKey)) {
      attempt += 1;
      continue;
    }

    seenLayouts.add(layoutKey);
    entries.push(createDatabaseEntry(size, entries.length + 1, puzzle));
    attempt += 1;

    if (attempt > 5000) {
      throw new Error(`Could not build ${levelCount} procedural levels for size ${size}.`);
    }
  }

  return entries;
}

function buildPresetEntries(size, levelCount) {
  const entries = [];
  const uniquePuzzles = [];
  const seenLayouts = new Set();
  let seed = 0;

  while (uniquePuzzles.length < Math.min(8, levelCount)) {
    const puzzle = createPuzzle(size, seed, { source: "preset" });
    assertValidPuzzle(puzzle, `preset size ${size} seed ${seed}`);
    const layoutKey = serializeRegions(puzzle.regions);

    if (!seenLayouts.has(layoutKey)) {
      seenLayouts.add(layoutKey);
      uniquePuzzles.push(puzzle);
      entries.push(createDatabaseEntry(size, entries.length + 1, puzzle));
    }

    seed += 1;

    if (seed > 256) {
      throw new Error(`Could not collect enough preset variants for size ${size}.`);
    }
  }

  let remixSalt = 1;

  while (entries.length < levelCount) {
    const template = uniquePuzzles[(entries.length - uniquePuzzles.length) % uniquePuzzles.length];
    const remixed = createRemixedPresetPuzzle(template, seenLayouts, remixSalt);

    if (!remixed) {
      remixSalt += 1;
      if (remixSalt > 2000) {
        throw new Error(`Could not build enough unique preset remixes for size ${size}.`);
      }
      continue;
    }

    assertValidPuzzle(remixed, `preset remix size ${size} salt ${remixSalt}`);
    seenLayouts.add(serializeRegions(remixed.regions));
    entries.push(createDatabaseEntry(size, entries.length + 1, remixed));
    remixSalt += 1;
  }

  return entries;
}

function createDatabaseEntry(size, levelIndex, puzzle) {
  return {
    id: `${size}-${String(levelIndex).padStart(2, "0")}`,
    seed: puzzle.seed,
    queens: [...puzzle.queens],
    regions: puzzle.regions.map((row) => [...row]),
  };
}

function assertValidPuzzle(puzzle, label) {
  const solutions = countSolutions(
    {
      ...puzzle,
      solutionCount: null,
    },
    2,
  );

  if (solutions !== 1) {
    throw new Error(`${label} is not unique. Found ${solutions} solutions.`);
  }

  if (!validateSolutionColumns(puzzle, puzzle.queens)) {
    throw new Error(`${label} failed queen validation.`);
  }

  const regionIssue = findDisconnectedRegion(puzzle.regions);

  if (regionIssue) {
    throw new Error(
      `${label} has disconnected region ${regionIssue.region} ` +
        `(${regionIssue.visited} / ${regionIssue.total} cells connected).`,
    );
  }
}

function serializeRegions(regions) {
  return regions.map((row) => row.join(",")).join("|");
}

function createRemixedPresetPuzzle(basePuzzle, seenLayouts, salt) {
  const candidateMoves = collectRegionMoves(basePuzzle);

  if (candidateMoves.length === 0) {
    return null;
  }

  const startIndex = salt % candidateMoves.length;

  for (let offset = 0; offset < candidateMoves.length; offset += 1) {
    const move = candidateMoves[(startIndex + offset) % candidateMoves.length];
    const nextRegions = applyRegionMove(basePuzzle.regions, move);
    const layoutKey = serializeRegions(nextRegions);

    if (seenLayouts.has(layoutKey) || findDisconnectedRegion(nextRegions)) {
      continue;
    }

    const remixed = {
      ...basePuzzle,
      seed: basePuzzle.seed + salt * 8191,
      regions: nextRegions,
      solutionCount: null,
    };

    if (countSolutions(remixed, 2) !== 1) {
      continue;
    }

    return remixed;
  }

  return null;
}

function collectRegionMoves(puzzle) {
  const size = puzzle.size;
  const moves = [];

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (puzzle.queens[row] === column) {
        continue;
      }

      const fromRegion = puzzle.regions[row][column];

      if (!isRegionConnectedAfterRemoval(puzzle.regions, fromRegion, row, column)) {
        continue;
      }

      const seenTargets = new Set();

      for (const [rowStep, columnStep] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nextRow = row + rowStep;
        const nextColumn = column + columnStep;

        if (
          nextRow < 0 ||
          nextColumn < 0 ||
          nextRow >= size ||
          nextColumn >= size
        ) {
          continue;
        }

        const targetRegion = puzzle.regions[nextRow][nextColumn];

        if (targetRegion === fromRegion || seenTargets.has(targetRegion)) {
          continue;
        }

        seenTargets.add(targetRegion);
        moves.push({
          row,
          column,
          targetRegion,
        });
      }
    }
  }

  return moves;
}

function isRegionConnectedAfterRemoval(regions, regionId, removeRow, removeColumn) {
  const size = regions.length;
  const remainingCells = [];

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (
        regions[row][column] === regionId &&
        !(row === removeRow && column === removeColumn)
      ) {
        remainingCells.push({ row, column });
      }
    }
  }

  if (remainingCells.length === 0) {
    return false;
  }

  const stack = [remainingCells[0]];
  const seen = new Set([`${remainingCells[0].row}:${remainingCells[0].column}`]);

  while (stack.length > 0) {
    const current = stack.pop();

    for (const [rowStep, columnStep] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nextRow = current.row + rowStep;
      const nextColumn = current.column + columnStep;

      if (
        nextRow < 0 ||
        nextColumn < 0 ||
        nextRow >= size ||
        nextColumn >= size ||
        (nextRow === removeRow && nextColumn === removeColumn) ||
        regions[nextRow][nextColumn] !== regionId
      ) {
        continue;
      }

      const key = `${nextRow}:${nextColumn}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      stack.push({ row: nextRow, column: nextColumn });
    }
  }

  return seen.size === remainingCells.length;
}

function applyRegionMove(regions, move) {
  const nextRegions = regions.map((row) => [...row]);
  nextRegions[move.row][move.column] = move.targetRegion;
  return nextRegions;
}

function serializeDatabaseModule(databaseObject) {
  return [
    `export const LEVELS_PER_SIZE = ${DATABASE_LEVELS_PER_SIZE};`,
    `export const LEVEL_DATABASE = ${JSON.stringify(databaseObject, null, 2)};`,
  ].join("\n\n");
}
