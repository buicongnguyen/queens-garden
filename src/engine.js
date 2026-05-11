import {
  LEVEL_DATABASE,
  LEVELS_PER_SIZE as DATABASE_LEVELS_PER_SIZE,
} from "./level-db.js";

export const CELL_STATE = Object.freeze({
  EMPTY: 0,
  QUEEN: 1,
  MARK: 2,
});

export const SUPPORTED_SIZES = Object.freeze([7, 8, 9, 10, 11, 12, 13, 14, 15]);
export const LEVELS_PER_SIZE = DATABASE_LEVELS_PER_SIZE;

const ORTHOGONAL_STEPS = Object.freeze([
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]);
const DIAGONAL_STEPS = Object.freeze([
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
]);
const PUZZLE_CACHE = new WeakMap();
const PRESET_VARIANT_CACHE = new Map();

const SOLUTION_SEARCH_LIMIT = 65;
const LOCAL_SEARCH_MOVE_LIMIT = 30;
const SEARCH_BUDGETS = Object.freeze({
  7: { seedVariations: 5, generationAttempts: 14, regionAttempts: 12, localSearchIterations: 2200 },
  8: { seedVariations: 6, generationAttempts: 16, regionAttempts: 14, localSearchIterations: 3200 },
  9: { seedVariations: 8, generationAttempts: 18, regionAttempts: 18, localSearchIterations: 4800 },
  10: { seedVariations: 10, generationAttempts: 22, regionAttempts: 20, localSearchIterations: 6400 },
  11: { seedVariations: 12, generationAttempts: 26, regionAttempts: 22, localSearchIterations: 8200 },
  12: { seedVariations: 14, generationAttempts: 30, regionAttempts: 24, localSearchIterations: 10000 },
  13: { seedVariations: 16, generationAttempts: 34, regionAttempts: 26, localSearchIterations: 12000 },
  14: { seedVariations: 18, generationAttempts: 38, regionAttempts: 28, localSearchIterations: 13800 },
  15: { seedVariations: 20, generationAttempts: 42, regionAttempts: 30, localSearchIterations: 15600 },
});
const RANDOM_REGION_SHARE_MIN = 0.1;
const RANDOM_REGION_SHARE_MAX = 0.5;
const createRegionShapeTemplate = (family, minBoardSize, cells) =>
  Object.freeze({
    family,
    minBoardSize,
    cells: Object.freeze(cells.map(([row, column]) => Object.freeze([row, column]))),
  });
const REGION_SHAPE_LIBRARY = Object.freeze([
  createRegionShapeTemplate("I", 7, [[0, 0], [1, 0], [2, 0], [3, 0]]),
  createRegionShapeTemplate("I", 8, [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]),
  createRegionShapeTemplate("I", 10, [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]),
  createRegionShapeTemplate("I", 12, [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0]]),
  createRegionShapeTemplate("L", 7, [[0, 0], [1, 0], [2, 0], [2, 1]]),
  createRegionShapeTemplate("L", 8, [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]]),
  createRegionShapeTemplate("L", 10, [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [4, 1]]),
  createRegionShapeTemplate("L", 12, [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [5, 1]]),
  createRegionShapeTemplate("Z", 7, [[0, 0], [0, 1], [1, 1], [1, 2]]),
  createRegionShapeTemplate("Z", 8, [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]]),
  createRegionShapeTemplate("Z", 10, [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2], [2, 3]]),
  createRegionShapeTemplate("Z", 12, [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2], [2, 3], [3, 3]]),
  createRegionShapeTemplate("T", 7, [[0, 0], [0, 1], [0, 2], [1, 1]]),
  createRegionShapeTemplate("T", 8, [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]]),
  createRegionShapeTemplate("T", 10, [[0, 0], [0, 1], [0, 2], [0, 3], [1, 1], [2, 1]]),
  createRegionShapeTemplate("T", 12, [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [2, 2]]),
  createRegionShapeTemplate("U", 7, [[0, 0], [0, 1], [1, 0], [2, 0], [2, 1]]),
  createRegionShapeTemplate("U", 9, [[0, 0], [0, 1], [1, 0], [2, 0], [3, 0], [3, 1]]),
  createRegionShapeTemplate("U", 11, [[0, 0], [0, 1], [1, 0], [2, 0], [3, 0], [4, 0], [4, 1]]),
  createRegionShapeTemplate("V", 7, [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]]),
  createRegionShapeTemplate("V", 9, [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [3, 2]]),
  createRegionShapeTemplate("V", 11, [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [4, 1], [4, 2]]),
  createRegionShapeTemplate("cross", 7, [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]]),
  createRegionShapeTemplate("cross", 10, [[2, 0], [2, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [2, 3], [2, 4]]),
  createRegionShapeTemplate("cross", 13, [[3, 0], [3, 1], [3, 2], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [3, 4], [3, 5], [3, 6]]),
  createRegionShapeTemplate("ring", 9, [[0, 0], [0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1], [2, 2]]),
  createRegionShapeTemplate("ring", 12, [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [1, 3], [2, 0], [2, 3], [3, 0], [3, 1], [3, 2], [3, 3]]),
]);

// Preset layouts keep the larger boards instant to load while still allowing
// plenty of variety through seed-driven board symmetries and palette rotation.
const PRESET_LAYOUTS = Object.freeze({
  7: Object.freeze([
    Object.freeze([
      "EEEEEEF",
      "DDDDDEF",
      "DDDDDEF",
      "EEEEGGF",
      "CCCCGGF",
      "ABBCGGF",
      "AABCGGF",
    ]),
  ]),
  8: Object.freeze([
    Object.freeze([
      "HGGGGAAA",
      "HHHHGAGA",
      "HHHBGGGA",
      "HHHBEGGA",
      "DDBBEFFA",
      "DDBCEFAA",
      "DDACEFAA",
      "DAAAAAAA",
    ]),
  ]),
  9: Object.freeze([
    Object.freeze([
      "EEHHGFCFF",
      "EEHHGFFFF",
      "EEEGGGGFF",
      "GGGGFFFFF",
      "DDDGAIIII",
      "DDDDIICCC",
      "BBHHICCCC",
      "BBHHIHHHC",
      "BBBIIHHCC",
    ]),
  ]),
  10: Object.freeze([
    Object.freeze([
      "GEAAAAFIII",
      "GEEFFFFIGI",
      "GEEBBDFIGI",
      "GECBBDFIGI",
      "GECCDDFIGI",
      "GEEEEEEGGI",
      "GGGGGGGGGI",
      "HHHHHHHHGI",
      "HJJJJJJHHI",
      "JJJJJJJJHH",
    ]),
  ]),
  11: Object.freeze([
    Object.freeze([
      "AAAABJJJJJK",
      "JAAJBBBJJJK",
      "JAAJBCCCCJK",
      "JJAJBBCDDJK",
      "JJJJJJJJJJK",
      "EEEEEEEEEKK",
      "EFFGGGGGGKK",
      "EEHGGGGGGKK",
      "EEHHGGGGGKK",
      "EHHHHHHHIIK",
      "KKKKKKKKKKK",
    ]),
  ]),
  12: Object.freeze([
    Object.freeze([
      "AAAAABBCCCDD",
      "EEEABBCCCCDD",
      "EEEEFBBCCCCC",
      "EEGFFFCCCCCC",
      "EEEFFFCHHCCI",
      "EEFFFHHHHIII",
      "EHHHHHJHHIIK",
      "JJHJHJJKKIKK",
      "JJHJJJJJKIIK",
      "JJJJJJJJKKKK",
      "JJJJKKKKKKLK",
      "JJJJJJKKKKLL",
    ]),
  ]),
  13: Object.freeze([
    Object.freeze([
      "LBBBCDDDDDEEE",
      "BBBCCDDDDEEEE",
      "BBCCCDDDDEEEE",
      "CCCCDDEDEEEEE",
      "CCFFFDEEEEEEE",
      "CCCFDDEEEEEEE",
      "CCFFEEEHHGGGG",
      "FFFFEEEGGGGGG",
      "FFFFFFEGGIIGI",
      "FFFJJFFGKKIII",
      "MMFJJFKKKKKII",
      "MMMMJFFKKKAAA",
      "MMMMJJFFFKAAA",
    ]),
  ]),
  14: Object.freeze([
    Object.freeze([
      "ABBBBCCCCCCCDD",
      "AABEEECCCCCDDD",
      "AABEEEECFCCDDD",
      "AAAAGEEEFCCCDD",
      "AAAGGEEEEECCDD",
      "AAAGGGGEGEECDD",
      "AAAGGGGGGEEEDD",
      "AAAGGGGGGGHHDD",
      "AAAIGIIIGJJJJD",
      "AAAIIIIIGJJJKK",
      "AAAILLIIIMJJKK",
      "AALLLLIIIMJJJK",
      "AALLLLLNNNJJJJ",
      "AAALLLLLNNNNNJ",
    ]),
  ]),
  15: Object.freeze([
    Object.freeze([
      "AAAABBCCCCCCDDD",
      "AAABBBCCCCCDDDD",
      "AAABBBBCCECDDDD",
      "AAFBBBBCCEEEDDD",
      "AAFBBBBBCEEDDDD",
      "AFFBBFFBBBEEDDD",
      "AFFFFFFBBEEEDGD",
      "FFFFHHHBBEEGDGG",
      "FHHHHHHIEEEGGGG",
      "FJHHHHIIIIIGGKK",
      "JJJHIIIIIIGGKKK",
      "JJJLLLLIIIGKKKK",
      "MMJLLLIIIIGKKKK",
      "MMNNLOOOOIGKKKK",
      "MMMNNOOOOIIIKKK",
    ]),
  ]),
});
const PRESET_LAYOUT_SOLUTIONS = Object.freeze({
  7: Object.freeze([
    Object.freeze([4, 6, 1, 5, 3, 0, 2]),
  ]),
  8: Object.freeze([
    Object.freeze([7, 1, 6, 4, 2, 5, 3, 0]),
  ]),
  9: Object.freeze([
    Object.freeze([6, 1, 5, 8, 4, 2, 0, 7, 3]),
  ]),
  10: Object.freeze([
    Object.freeze([3, 6, 4, 2, 5, 1, 8, 0, 9, 7]),
  ]),
  11: Object.freeze([
    Object.freeze([4, 1, 5, 7, 9, 0, 2, 6, 3, 8, 10]),
  ]),
  12: Object.freeze([
    Object.freeze([1, 11, 5, 2, 6, 3, 0, 4, 9, 7, 10, 8]),
  ]),
  13: Object.freeze([
    Object.freeze([0, 2, 4, 7, 3, 6, 8, 10, 12, 9, 1, 11, 5]),
  ]),
  14: Object.freeze([
    Object.freeze([1, 6, 11, 8, 5, 0, 4, 10, 3, 12, 9, 2, 7, 13]),
  ]),
  15: Object.freeze([
    Object.freeze([3, 10, 14, 11, 2, 9, 13, 5, 7, 1, 12, 6, 0, 8, 4]),
  ]),
});

export function randomSeed() {
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return values[0];
  }

  return Math.floor(Math.random() * 0xffffffff);
}

export function formatSeed(seed) {
  return normalizeSeed(seed).toString(36).toUpperCase();
}

export function createFixedLevelSeed(size, levelIndex) {
  if (!SUPPORTED_SIZES.includes(size)) {
    throw new Error(`Unsupported board size: ${size}`);
  }

  if (
    !Number.isInteger(levelIndex) ||
    levelIndex < 1 ||
    levelIndex > getLevelCount(size)
  ) {
    throw new Error(`Unsupported level index: ${levelIndex}`);
  }

  return size * 1000 + (levelIndex - 1) * 17;
}

export function createEmptyBoard(size) {
  return Array.from({ length: size }, () => Array(size).fill(CELL_STATE.EMPTY));
}

export function getLevelCount(size) {
  if (!SUPPORTED_SIZES.includes(size)) {
    throw new Error(`Unsupported board size: ${size}`);
  }

  return LEVEL_DATABASE[String(size)]?.length ?? 0;
}

export function createFixedLevelPuzzle(size, levelIndex) {
  const entry = getDatabaseLevelEntry(size, levelIndex);
  return buildDatabasePuzzle(size, entry, entry.seed);
}

export function createRandomLevelPuzzle(size, seed = randomSeed()) {
  if (!SUPPORTED_SIZES.includes(size)) {
    throw new Error(`Unsupported board size: ${size}`);
  }

  const levels = LEVEL_DATABASE[String(size)] ?? [];

  if (levels.length === 0) {
    throw new Error(`No saved levels are available for size ${size}.`);
  }

  const baseSeed = normalizeSeed(seed);
  const entry = levels[baseSeed % levels.length];
  const paletteSeed = mixSeed(baseSeed, entry.seed);
  return buildDatabasePuzzle(size, entry, paletteSeed);
}

export function createPuzzle(size, seed = randomSeed(), options = {}) {
  if (!SUPPORTED_SIZES.includes(size)) {
    throw new Error(`Unsupported board size: ${size}`);
  }

  const baseSeed = normalizeSeed(seed);
  const source = options.source ?? "database";

  if (source === "database" || source === "auto") {
    return createRandomLevelPuzzle(size, baseSeed);
  }

  if (source === "preset") {
    const presetPuzzle = createPresetPuzzle(size, baseSeed);

    if (!presetPuzzle) {
      throw new Error("No preset puzzle is available for this board size.");
    }

    return presetPuzzle;
  }

  if (source === "procedural") {
    return createProceduralPuzzle(size, baseSeed);
  }

  throw new Error(`Unsupported puzzle source: ${source}`);
}

function getDatabaseLevelEntry(size, levelIndex) {
  if (!SUPPORTED_SIZES.includes(size)) {
    throw new Error(`Unsupported board size: ${size}`);
  }

  if (!Number.isInteger(levelIndex) || levelIndex < 1) {
    throw new Error(`Unsupported level index: ${levelIndex}`);
  }

  const levels = LEVEL_DATABASE[String(size)] ?? [];
  const entry = levels[levelIndex - 1];

  if (!entry) {
    throw new Error(`No saved level ${levelIndex} exists for size ${size}.`);
  }

  return entry;
}

function buildDatabasePuzzle(size, entry, paletteSeed) {
  const palette = generatePalette(size, paletteSeed);

  return {
    size,
    seed: paletteSeed,
    queens: [...entry.queens],
    regions: entry.regions.map((row) => [...row]),
    palette: palette.fills,
    outlinePalette: palette.edges,
    solutionCount: 1,
    levelId: entry.id,
  };
}

export function createProceduralPuzzle(size, seed = randomSeed()) {
  if (!SUPPORTED_SIZES.includes(size)) {
    throw new Error(`Unsupported board size: ${size}`);
  }

  const baseSeed = normalizeSeed(seed);
  const budget = SEARCH_BUDGETS[size];

  for (let seedVariant = 0; seedVariant < budget.seedVariations; seedVariant += 1) {
    const variantSeed = mixSeed(baseSeed, seedVariant + 1);

    for (let attempt = 0; attempt < budget.generationAttempts; attempt += 1) {
      const attemptSeed = mixSeed(variantSeed, attempt + 1);
      const queenRng = createRng(attemptSeed);
      const queens = generateQueenPlacement(size, queenRng);

      if (!queens) {
        continue;
      }

      for (let regionAttempt = 0; regionAttempt < budget.regionAttempts; regionAttempt += 1) {
        const generatedRegions = generateRegions(
          size,
          queens,
          createRng(mixSeed(attemptSeed, regionAttempt + 101)),
        );

        if (!generatedRegions) {
          continue;
        }

        const palette = generatePalette(size, attemptSeed);
        const puzzle = {
          size,
          seed: attemptSeed,
          queens,
          regions: generatedRegions.regions,
          palette: palette.fills,
          outlinePalette: palette.edges,
          solutionCount: null,
        };

        const optimized = optimizeRegions(
          size,
          queens,
          generatedRegions.regions,
          generatedRegions.lockedCells,
          createRng(mixSeed(attemptSeed, regionAttempt + 409)),
          budget.localSearchIterations,
        );

        if (
          optimized.solutionCount === 1 &&
          !findDisconnectedRegion(optimized.regions)
        ) {
          puzzle.regions = optimized.regions;
          puzzle.solutionCount = 1;
          return puzzle;
        }
      }
    }
  }

  throw new Error("Could not create a unique puzzle. Please try again.");
}

export function countSolutions(puzzle, limit = 2) {
  if (Number.isInteger(puzzle.solutionCount)) {
    return Math.min(puzzle.solutionCount, limit);
  }

  return countRegionSolutions(puzzle.size, puzzle.regions, limit);
}

export function findDisconnectedRegion(regions) {
  const size = regions.length;
  const cellsByRegion = new Map();

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const region = regions[row][column];

      if (!cellsByRegion.has(region)) {
        cellsByRegion.set(region, []);
      }

      cellsByRegion.get(region).push({ row, column });
    }
  }

  for (const [region, cells] of cellsByRegion.entries()) {
    const seen = new Set();
    const stack = [cells[0]];
    seen.add(cellKey(cells[0].row, cells[0].column));

    while (stack.length > 0) {
      const current = stack.pop();

      for (const [rowStep, columnStep] of ORTHOGONAL_STEPS) {
        const nextRow = current.row + rowStep;
        const nextColumn = current.column + columnStep;

        if (
          nextRow < 0 ||
          nextColumn < 0 ||
          nextRow >= size ||
          nextColumn >= size ||
          regions[nextRow][nextColumn] !== region
        ) {
          continue;
        }

        const key = cellKey(nextRow, nextColumn);

        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        stack.push({ row: nextRow, column: nextColumn });
      }
    }

    if (seen.size !== cells.length) {
      return {
        region,
        visited: seen.size,
        total: cells.length,
      };
    }
  }

  return null;
}

function countRegionSolutions(size, regions, limit = 2) {
  const effectiveLimit = Math.max(1, Math.min(limit, Number.MAX_SAFE_INTEGER));
  const rowCandidates = Array.from({ length: size }, (_, row) =>
    Uint16Array.from(
      { length: size },
      (_, column) => column | (regions[row][column] << 5),
    ),
  );
  const maskBase = 1 << size;
  const stateBase = maskBase * maskBase;
  const rowBase = stateBase * (size + 1);
  const memo = new Map();

  function search(row, usedColumnsMask, usedRegionsMask, previousColumn) {
    const key =
      usedColumnsMask +
      usedRegionsMask * maskBase +
      (previousColumn + 1) * stateBase +
      row * rowBase;
    const cached = memo.get(key);

    if (cached !== undefined) {
      return cached;
    }

    if (row === size) {
      return 1;
    }

    let total = 0;
    const candidates = rowCandidates[row];

    for (let index = 0; index < candidates.length; index += 1) {
      const entry = candidates[index];
      const column = entry & 31;
      const region = entry >> 5;
      const columnBit = 1 << column;
      const regionBit = 1 << region;

      if ((usedColumnsMask & columnBit) || (usedRegionsMask & regionBit)) {
        continue;
      }

      if (previousColumn !== -1) {
        const difference = previousColumn - column;

        if (difference === 1 || difference === -1) {
          continue;
        }
      }

      total += search(
        row + 1,
        usedColumnsMask | columnBit,
        usedRegionsMask | regionBit,
        column,
      );

      if (total >= effectiveLimit) {
        memo.set(key, effectiveLimit);
        return effectiveLimit;
      }
    }

    memo.set(key, total);
    return total;
  }

  return search(0, 0, 0, -1);
}

export function validateSolutionColumns(puzzle, columns) {
  if (!Array.isArray(columns) || columns.length !== puzzle.size) {
    return false;
  }

  const usedColumns = new Set();
  const usedRegions = new Set();

  for (let row = 0; row < puzzle.size; row += 1) {
    const column = columns[row];

    if (!Number.isInteger(column) || column < 0 || column >= puzzle.size) {
      return false;
    }

    const region = puzzle.regions[row][column];

    if (usedColumns.has(column) || usedRegions.has(region)) {
      return false;
    }

    if (row > 0 && Math.abs(columns[row - 1] - column) === 1) {
      return false;
    }

    usedColumns.add(column);
    usedRegions.add(region);
  }

  return usedColumns.size === puzzle.size && usedRegions.size === puzzle.size;
}

export function analyzePlayerBoard(puzzle, board) {
  const size = puzzle.size;
  const puzzleCache = getPuzzleCache(puzzle);
  const rowCounts = new Uint8Array(size);
  const columnCounts = new Uint8Array(size);
  const regionCounts = new Uint8Array(size);
  const rowMarks = new Uint8Array(size);
  const columnMarks = new Uint8Array(size);
  const queenIndexes = [];
  const queenIndexSet = new Set();
  let queenCount = 0;
  let completedRegions = 0;

  for (let row = 0; row < size; row += 1) {
    const boardRow = board[row];

    for (let column = 0; column < size; column += 1) {
      const cellState = boardRow[column];
      const index = cellIndex(row, column, size);

      if (cellState === CELL_STATE.MARK) {
        rowMarks[row] += 1;
        columnMarks[column] += 1;
        continue;
      }

      if (cellState !== CELL_STATE.QUEEN) {
        continue;
      }

      const region = puzzleCache.regionByIndex[index];
      const nextRegionCount = regionCounts[region] + 1;

      queenCount += 1;
      rowCounts[row] += 1;
      columnCounts[column] += 1;
      regionCounts[region] = nextRegionCount;

      if (nextRegionCount === 1) {
        completedRegions += 1;
      } else if (nextRegionCount === 2) {
        completedRegions -= 1;
      }

      queenIndexes.push(index);
      queenIndexSet.add(index);
    }
  }

  const conflicts = new Set();

  for (const queenIndex of queenIndexes) {
    const row = rowFromIndex(queenIndex, size);
    const column = columnFromIndex(queenIndex, size);
    const region = puzzleCache.regionByIndex[queenIndex];

    if (
      rowCounts[row] > 1 ||
      columnCounts[column] > 1 ||
      regionCounts[region] > 1
    ) {
      addConflictIndex(conflicts, queenIndex, puzzleCache);
    }

    for (const diagonalIndex of puzzleCache.forwardDiagonalByIndex[queenIndex]) {
      if (queenIndexSet.has(diagonalIndex)) {
        addConflictIndex(conflicts, queenIndex, puzzleCache);
        addConflictIndex(conflicts, diagonalIndex, puzzleCache);
      }
    }
  }

  const rowViolations = new Set();
  const columnViolations = new Set();
  let rowsSolved = true;
  let columnsSolved = true;
  let regionsSolved = true;

  for (let row = 0; row < size; row += 1) {
    const rowCount = rowCounts[row];

    if (rowCount !== 1) {
      rowsSolved = false;
    }

    if (rowCount > 1 || (rowCount === 0 && rowMarks[row] === size)) {
      rowViolations.add(row);
    }
  }

  for (let column = 0; column < size; column += 1) {
    const columnCount = columnCounts[column];

    if (columnCount !== 1) {
      columnsSolved = false;
    }

    if (columnCount > 1 || (columnCount === 0 && columnMarks[column] === size)) {
      columnViolations.add(column);
    }
  }

  for (let region = 0; region < size; region += 1) {
    if (regionCounts[region] !== 1) {
      regionsSolved = false;
    }
  }

  const solved =
    queenCount === size &&
    conflicts.size === 0 &&
    rowsSolved &&
    columnsSolved &&
    regionsSolved;

  return {
    queenCount,
    rowCounts,
    columnCounts,
    regionCounts,
    completedRegions,
    conflicts,
    rowViolations,
    columnViolations,
    solved,
  };
}

export function findHint(puzzle, board, analysis = null) {
  const currentAnalysis = analysis ?? analyzePlayerBoard(puzzle, board);

  if (currentAnalysis.conflicts.size > 0) {
    return {
      type: "resolve-conflicts",
      message:
        "Resolve the red conflicts first. A hint only works when the current queens agree with the puzzle rules.",
    };
  }

  const deduction = deriveLogicalDeductions(puzzle, board);

  if (!deduction.consistent) {
    return {
      type: "dead-end",
      message:
        "Your current queens and marks leave no legal completion. Retry or remove a recent mark before asking for another hint.",
    };
  }

  if (deduction.forced.length > 0) {
    const choice = deduction.forced[0];
    return {
      type: "must-queen",
      row: choice.row,
      column: choice.column,
      message: describeForcedReason(choice.reason, choice.row, choice.column),
    };
  }

  if (deduction.impossible.length > 0) {
    const choice = deduction.impossible[0];
    return {
      type: "not-queen",
      row: choice.row,
      column: choice.column,
      blocker: choice.reason.blocker ?? null,
      message: describeImpossibleReason(
        choice.reason,
        choice.row,
        choice.column,
      ),
    };
  }

  return {
    type: "no-deduction",
    message:
      "No forced move appears from the current queens and marks yet. Try narrowing a row, column, or colored region a little more.",
  };
}

export function solutionBoard(puzzle) {
  const board = createEmptyBoard(puzzle.size);

  for (let row = 0; row < puzzle.size; row += 1) {
    board[row][puzzle.queens[row]] = CELL_STATE.QUEEN;
  }

  return board;
}

function createPresetPuzzle(size, seed) {
  const variant = getPresetVariant(size, seed);

  if (!variant) {
    return null;
  }

  if (findDisconnectedRegion(variant.regions)) {
    return null;
  }

  const palette = generatePalette(size, seed);
  return {
    size,
    seed,
    queens: variant.queens,
    regions: variant.regions,
    palette: palette.fills,
    outlinePalette: palette.edges,
    solutionCount: 1,
  };
}

function getPresetVariant(size, seed) {
  let variants = PRESET_VARIANT_CACHE.get(size);

  if (!variants) {
    variants = buildPresetVariantsForSize(size);
    PRESET_VARIANT_CACHE.set(size, variants);
  }

  if (variants.length === 0) {
    return null;
  }

  return variants[seed % variants.length];
}

function buildPresetVariantsForSize(size) {
  const layouts = PRESET_LAYOUTS[size];
  const solutions = PRESET_LAYOUT_SOLUTIONS[size];

  if (!layouts || layouts.length === 0) {
    return [];
  }

  if (!solutions || solutions.length !== layouts.length) {
    throw new Error(`Missing preset solutions for size ${size}.`);
  }

  const parsedLayouts = layouts.map((layout) => parsePresetLayout(layout));
  const variants = [];

  for (let transformIndex = 0; transformIndex < 8; transformIndex += 1) {
    for (let layoutIndex = 0; layoutIndex < layouts.length; layoutIndex += 1) {
      variants.push(
        Object.freeze({
          regions: transformRegions(parsedLayouts[layoutIndex], transformIndex),
          queens: transformQueenColumns(
            solutions[layoutIndex],
            size,
            transformIndex,
          ),
        }),
      );
    }
  }

  return variants;
}

function parsePresetLayout(layout) {
  const regionIds = new Map();
  let nextRegionId = 0;

  return layout.map((rowText) =>
    Array.from(rowText, (symbol) => {
      if (!regionIds.has(symbol)) {
        regionIds.set(symbol, nextRegionId);
        nextRegionId += 1;
      }

      return regionIds.get(symbol);
    }),
  );
}

function transformRegions(regions, transformIndex) {
  const size = regions.length;
  const transformed = Array.from({ length: size }, () => Array(size).fill(-1));

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const [nextRow, nextColumn] = mapTransformCoordinate(
        row,
        column,
        size,
        transformIndex % 8,
      );
      transformed[nextRow][nextColumn] = regions[row][column];
    }
  }

  return transformed;
}

function transformQueenColumns(queens, size, transformIndex) {
  const transformed = Array(size).fill(-1);

  for (let row = 0; row < size; row += 1) {
    const [nextRow, nextColumn] = mapTransformCoordinate(
      row,
      queens[row],
      size,
      transformIndex % 8,
    );
    transformed[nextRow] = nextColumn;
  }

  return Object.freeze(transformed);
}

function mapTransformCoordinate(row, column, size, transformIndex) {
  switch (transformIndex) {
    case 1:
      return [column, size - 1 - row];
    case 2:
      return [size - 1 - row, size - 1 - column];
    case 3:
      return [size - 1 - column, row];
    case 4:
      return [row, size - 1 - column];
    case 5:
      return [size - 1 - row, column];
    case 6:
      return [column, row];
    case 7:
      return [size - 1 - column, size - 1 - row];
    default:
      return [row, column];
  }
}

function solveRegionColumns(size, regions) {
  const usedColumns = new Uint8Array(size);
  const usedRegions = new Uint8Array(size);
  const placements = new Int16Array(size);
  placements.fill(-1);

  function collectCandidates(row) {
    const candidates = [];

    for (let column = 0; column < size; column += 1) {
      const region = regions[row][column];

      if (usedColumns[column] || usedRegions[region]) {
        continue;
      }

      if (row > 0 && placements[row - 1] !== -1 && Math.abs(placements[row - 1] - column) === 1) {
        continue;
      }

      if (
        row + 1 < size &&
        placements[row + 1] !== -1 &&
        Math.abs(placements[row + 1] - column) === 1
      ) {
        continue;
      }

      candidates.push({ column, region });
    }

    return candidates;
  }

  function pickNextRow() {
    let nextRow = -1;
    let nextCandidates = null;

    for (let row = 0; row < size; row += 1) {
      if (placements[row] !== -1) {
        continue;
      }

      const candidates = collectCandidates(row);

      if (candidates.length === 0) {
        return { row, candidates };
      }

      if (!nextCandidates || candidates.length < nextCandidates.length) {
        nextRow = row;
        nextCandidates = candidates;

        if (candidates.length === 1) {
          break;
        }
      }
    }

    return { row: nextRow, candidates: nextCandidates ?? [] };
  }

  function search(placedCount) {
    if (placedCount === size) {
      return true;
    }

    const { row, candidates } = pickNextRow();

    if (candidates.length === 0) {
      return false;
    }

    for (const candidate of candidates) {
      usedColumns[candidate.column] = 1;
      usedRegions[candidate.region] = 1;
      placements[row] = candidate.column;

      if (search(placedCount + 1)) {
        return true;
      }

      placements[row] = -1;
      usedColumns[candidate.column] = 0;
      usedRegions[candidate.region] = 0;
    }

    return false;
  }

  if (!search(0)) {
    return null;
  }

  return Array.from(placements);
}

function generateQueenPlacement(size, rng) {
  const columns = Array(size).fill(-1);
  const usedColumns = new Uint8Array(size);

  function place(row) {
    if (row === size) {
      return true;
    }

    const options = Array.from({ length: size }, (_, index) => index);
    shuffleInPlace(options, rng);

    for (const column of options) {
      if (usedColumns[column]) {
        continue;
      }

      if (row > 0 && Math.abs(columns[row - 1] - column) === 1) {
        continue;
      }

      columns[row] = column;
      usedColumns[column] = 1;

      if (place(row + 1)) {
        return true;
      }

      columns[row] = -1;
      usedColumns[column] = 0;
    }

    return false;
  }

  return place(0) ? columns : null;
}

function deriveLogicalDeductions(puzzle, board) {
  const size = puzzle.size;
  const queenOrigins = new Map();

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (board[row][column] === CELL_STATE.QUEEN) {
        queenOrigins.set(cellIndex(row, column, size), {
          kind: "placed",
          row,
          column,
        });
      }
    }
  }

  let changed = true;
  let finalBlockedReasons = null;

  while (changed) {
    changed = false;

    const scan = scanLogicalState(puzzle, board, queenOrigins);

    if (!scan.consistent) {
      return {
        consistent: false,
        forced: [],
        impossible: [],
      };
    }

    finalBlockedReasons = scan.blockedReasons;

    for (const forced of scan.forced) {
      const key = cellKey(forced.row, forced.column);

      if (queenOrigins.has(key)) {
        continue;
      }

      queenOrigins.set(key, forced.reason);
      changed = true;
    }
  }

  const forced = [];
  const impossible = [];

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const origin = queenOrigins.get(cellIndex(row, column, size));

      if (origin && board[row][column] !== CELL_STATE.QUEEN) {
        forced.push({
          row,
          column,
          reason: origin,
        });
        continue;
      }

      if (board[row][column] !== CELL_STATE.EMPTY) {
        continue;
      }

      const reason = finalBlockedReasons[row][column];

      if (!reason || reason.kind === "marked") {
        continue;
      }

      impossible.push({
        row,
        column,
        reason,
      });
    }
  }

  forced.sort(compareHintCells);
  impossible.sort(compareHintCells);

  return {
    consistent: true,
    forced,
    impossible,
  };
}

function scanLogicalState(puzzle, board, queenOrigins) {
  const size = puzzle.size;
  const puzzleCache = getPuzzleCache(puzzle);
  const rowQueens = Array(size).fill(null);
  const columnQueens = Array(size).fill(null);
  const regionQueens = Array(size).fill(null);
  const blockedReasons = Array.from({ length: size }, () =>
    Array(size).fill(null),
  );
  const rowOptionCounts = new Uint8Array(size);
  const columnOptionCounts = new Uint8Array(size);
  const regionOptionCounts = new Uint8Array(size);
  const rowOptionIndexes = new Int16Array(size);
  const columnOptionIndexes = new Int16Array(size);
  const regionOptionIndexes = new Int16Array(size);
  const forced = [];

  rowOptionIndexes.fill(-1);
  columnOptionIndexes.fill(-1);
  regionOptionIndexes.fill(-1);

  for (const [index, origin] of queenOrigins.entries()) {
    const row = rowFromIndex(index, size);
    const column = columnFromIndex(index, size);
    const region = puzzleCache.regionByIndex[index];
    rowQueens[row] = { row, column, origin };
    columnQueens[column] = { row, column, origin };
    regionQueens[region] = { row, column, origin };
  }

  for (let row = 0; row < size; row += 1) {
    const boardRow = board[row];
    const rowQueen = rowQueens[row];

    for (let column = 0; column < size; column += 1) {
      const index = cellIndex(row, column, size);

      if (queenOrigins.has(index)) {
        continue;
      }

      if (boardRow[column] === CELL_STATE.MARK) {
        blockedReasons[row][column] = { kind: "marked" };
        continue;
      }

      const region = puzzleCache.regionByIndex[index];
      const columnQueen = columnQueens[column];
      const regionQueen = regionQueens[region];
      const diagonalQueen = findDiagonalQueen(
        queenOrigins,
        puzzleCache.diagonalByIndex[index],
        puzzleCache,
      );

      if (rowQueen) {
        blockedReasons[row][column] = {
          kind: "row-queen",
          blocker: {
            row: rowQueen.row,
            column: rowQueen.column,
            origin: rowQueen.origin,
          },
        };
        continue;
      }

      if (columnQueen) {
        blockedReasons[row][column] = {
          kind: "column-queen",
          blocker: {
            row: columnQueen.row,
            column: columnQueen.column,
            origin: columnQueen.origin,
          },
        };
        continue;
      }

      if (regionQueen) {
        blockedReasons[row][column] = {
          kind: "region-queen",
          blocker: {
            row: regionQueen.row,
            column: regionQueen.column,
            origin: regionQueen.origin,
          },
        };
        continue;
      }

      if (diagonalQueen) {
        blockedReasons[row][column] = {
          kind: "diagonal-queen",
          blocker: diagonalQueen,
        };
        continue;
      }

      rowOptionCounts[row] += 1;
      columnOptionCounts[column] += 1;
      regionOptionCounts[region] += 1;
      rowOptionIndexes[row] = index;
      columnOptionIndexes[column] = index;
      regionOptionIndexes[region] = index;
    }
  }

  for (let row = 0; row < size; row += 1) {
    if (rowQueens[row]) {
      continue;
    }

    if (rowOptionCounts[row] === 0) {
      return {
        consistent: false,
        blockedReasons,
        forced: [],
      };
    }

    if (rowOptionCounts[row] === 1) {
      const onlyIndex = rowOptionIndexes[row];
      forced.push({
        row: rowFromIndex(onlyIndex, size),
        column: columnFromIndex(onlyIndex, size),
        reason: {
          kind: "row-single",
          row: rowFromIndex(onlyIndex, size),
          column: columnFromIndex(onlyIndex, size),
        },
      });
    }
  }

  for (let column = 0; column < size; column += 1) {
    if (columnQueens[column]) {
      continue;
    }

    if (columnOptionCounts[column] === 0) {
      return {
        consistent: false,
        blockedReasons,
        forced: [],
      };
    }

    if (columnOptionCounts[column] === 1) {
      const onlyIndex = columnOptionIndexes[column];
      forced.push({
        row: rowFromIndex(onlyIndex, size),
        column: columnFromIndex(onlyIndex, size),
        reason: {
          kind: "column-single",
          row: rowFromIndex(onlyIndex, size),
          column: columnFromIndex(onlyIndex, size),
        },
      });
    }
  }

  for (let region = 0; region < size; region += 1) {
    if (regionQueens[region]) {
      continue;
    }

    if (regionOptionCounts[region] === 0) {
      return {
        consistent: false,
        blockedReasons,
        forced: [],
      };
    }

    if (regionOptionCounts[region] === 1) {
      const onlyIndex = regionOptionIndexes[region];
      forced.push({
        row: rowFromIndex(onlyIndex, size),
        column: columnFromIndex(onlyIndex, size),
        reason: {
          kind: "region-single",
          row: rowFromIndex(onlyIndex, size),
          column: columnFromIndex(onlyIndex, size),
          region,
        },
      });
    }
  }

  return {
    consistent: true,
    blockedReasons,
    forced,
  };
}

function describeForcedReason(reason, row, column) {
  if (reason.kind === "row-single") {
    return `Hint: row ${row + 1} has only one legal square left, so column ${column + 1} must contain that queen.`;
  }

  if (reason.kind === "column-single") {
    return `Hint: column ${column + 1} has only one legal square left, so row ${row + 1} must contain that queen.`;
  }

  if (reason.kind === "region-single") {
    return `Hint: this colored region has only one legal square left, so row ${row + 1}, column ${column + 1} must be the queen.`;
  }

  return `Hint: row ${row + 1}, column ${column + 1} is forced by your current queens and marks.`;
}

function describeImpossibleReason(reason, row, column) {
  if (reason.kind === "row-queen") {
    return describeBlockedByStructure(
      reason.blocker,
      `Hint: row ${row + 1} already has its queen`,
      row,
      column,
    );
  }

  if (reason.kind === "column-queen") {
    return describeBlockedByStructure(
      reason.blocker,
      `Hint: column ${column + 1} already has its queen`,
      row,
      column,
    );
  }

  if (reason.kind === "region-queen") {
    return describeBlockedByStructure(
      reason.blocker,
      "Hint: this colored region already has its queen",
      row,
      column,
    );
  }

  if (reason.kind === "diagonal-queen") {
    return `Hint: row ${row + 1}, column ${column + 1} touches the queen at row ${reason.blocker.row + 1}, column ${reason.blocker.column + 1} diagonally, so it cannot be a queen.`;
  }

  return `Hint: row ${row + 1}, column ${column + 1} cannot be a queen with the current queens and marks.`;
}

function describeBlockedByStructure(blocker, prefix, row, column) {
  if (!blocker || !blocker.origin) {
    return `${prefix}, so row ${row + 1}, column ${column + 1} cannot be a queen.`;
  }

  if (blocker.origin.kind === "placed") {
    return `${prefix} at row ${blocker.row + 1}, column ${blocker.column + 1}, so row ${row + 1}, column ${column + 1} cannot be a queen.`;
  }

  if (blocker.origin.kind === "row-single") {
    return `${prefix} at row ${blocker.row + 1}, column ${blocker.column + 1}. That square is the only legal cell left in row ${blocker.origin.row + 1}, so row ${row + 1}, column ${column + 1} cannot be a queen.`;
  }

  if (blocker.origin.kind === "column-single") {
    return `${prefix} at row ${blocker.row + 1}, column ${blocker.column + 1}. That square is the only legal cell left in column ${blocker.origin.column + 1}, so row ${row + 1}, column ${column + 1} cannot be a queen.`;
  }

  if (blocker.origin.kind === "region-single") {
    return `${prefix} at row ${blocker.row + 1}, column ${blocker.column + 1}. That square is the only legal cell left in its colored region, so row ${row + 1}, column ${column + 1} cannot be a queen.`;
  }

  return `${prefix} at row ${blocker.row + 1}, column ${blocker.column + 1}, so row ${row + 1}, column ${column + 1} cannot be a queen.`;
}

function findDiagonalQueen(queenOrigins, diagonalIndexes, puzzleCache) {
  for (const index of diagonalIndexes) {
    if (!queenOrigins.has(index)) {
      continue;
    }

    return {
      row: puzzleCache.rowByIndex[index],
      column: puzzleCache.columnByIndex[index],
      origin: queenOrigins.get(index),
    };
  }

  return null;
}

function compareHintCells(left, right) {
  if (left.row !== right.row) {
    return left.row - right.row;
  }

  return left.column - right.column;
}

function createRegionProfiles(size, rng) {
  const profiles = Array.from({ length: size }, () => ({ kind: "organic" }));
  const availableTemplates = REGION_SHAPE_LIBRARY.filter(
    (template) => template.minBoardSize <= size && template.cells.length < size + 1,
  );

  if (availableTemplates.length === 0) {
    return profiles;
  }

  const familyMap = new Map();

  for (const template of availableTemplates) {
    if (!familyMap.has(template.family)) {
      familyMap.set(template.family, []);
    }

    familyMap.get(template.family).push(template);
  }

  const familyOrder = [...familyMap.keys()];
  const regionOrder = Array.from({ length: size }, (_, index) => index);
  const randomShare =
    RANDOM_REGION_SHARE_MIN +
    rng() * (RANDOM_REGION_SHARE_MAX - RANDOM_REGION_SHARE_MIN);
  const randomCount = Math.max(
    1,
    Math.min(size - 1, Math.round(size * randomShare)),
  );

  shuffleInPlace(familyOrder, rng);
  shuffleInPlace(regionOrder, rng);

  const patternedRegionIds = regionOrder.slice(randomCount);

  for (let index = 0; index < patternedRegionIds.length; index += 1) {
    const regionId = patternedRegionIds[index];
    const family = familyOrder[index % familyOrder.length];
    const templateOptions = familyMap.get(family);
    const template =
      templateOptions[Math.floor(rng() * templateOptions.length)];

    profiles[regionId] = {
      kind: "patterned",
      family,
      template,
    };
  }

  return profiles;
}

function seedPatternRegions(
  size,
  regions,
  regionCells,
  anchors,
  regionProfiles,
  lockedCells,
  rng,
) {
  const plannedRegions = regionProfiles
    .map((profile, regionId) => ({ profile, regionId }))
    .filter(({ profile }) => profile.kind === "patterned");

  shuffleInPlace(plannedRegions, rng);
  plannedRegions.sort(
    (left, right) =>
      right.profile.template.cells.length - left.profile.template.cells.length,
  );

  let assigned = 0;

  for (const { profile, regionId } of plannedRegions) {
    const placements = collectValidShapePlacements(
      regionId,
      profile.template,
      regions,
      anchors[regionId],
      size,
      rng,
    );

    if (placements.length === 0) {
      regionProfiles[regionId] = { kind: "organic" };
      continue;
    }

    placements.sort((left, right) => right.score - left.score);
    const choice = placements[Math.floor(rng() * Math.min(3, placements.length))];

    for (const cell of choice.cells) {
      regions[cell.row][cell.column] = regionId;
      regionCells[regionId].push(cell);
      lockedCells.add(cellIndex(cell.row, cell.column, size));
      assigned += 1;
    }
  }

  return assigned;
}

function collectValidShapePlacements(regionId, template, regions, anchor, size, rng) {
  const placements = [];

  for (const variant of getShapeVariants(template.cells)) {
    for (const [anchorRow, anchorColumn] of variant) {
      const rowOffset = anchor.row - anchorRow;
      const columnOffset = anchor.column - anchorColumn;
      const cells = [];
      let edgeTouches = 0;
      let valid = true;

      for (const [shapeRow, shapeColumn] of variant) {
        const row = rowOffset + shapeRow;
        const column = columnOffset + shapeColumn;

        if (row < 0 || row >= size || column < 0 || column >= size) {
          valid = false;
          break;
        }

        const currentRegion = regions[row][column];
        const isAnchor = row === anchor.row && column === anchor.column;

        if (currentRegion !== -1 && !(isAnchor && currentRegion === regionId)) {
          valid = false;
          break;
        }

        if (row === 0 || row === size - 1 || column === 0 || column === size - 1) {
          edgeTouches += 1;
        }

        if (!isAnchor) {
          cells.push({ row, column });
        }
      }

      if (!valid || cells.length === 0) {
        continue;
      }

      placements.push({
        cells,
        score:
          cells.length * 3.2 -
          edgeTouches * 0.3 -
          (Math.abs(anchor.row - size / 2) + Math.abs(anchor.column - size / 2)) * 0.04 +
          rng(),
      });
    }
  }

  return placements;
}

function buildRegionTargetSizes(size, regionCells, regionProfiles, rng) {
  const baseSizes = regionCells.map((cells) => cells.length);
  const targetSizes = [...baseSizes];
  const remaining =
    size * size - baseSizes.reduce((total, value) => total + value, 0);

  if (remaining <= 0) {
    return targetSizes;
  }

  const weights = regionProfiles.map((profile, regionId) => {
    const baseWeight = 0.75 + rng() * 1.15;
    const patternBoost = profile.kind === "patterned" ? 0.18 : 0;
    const seedBoost = Math.max(0, regionCells[regionId].length - 1) * 0.08;
    return baseWeight + patternBoost + seedBoost;
  });
  const totalWeight = weights.reduce((total, value) => total + value, 0);
  const rawExtras = weights.map((weight) => (remaining * weight) / totalWeight);
  const extraFloors = rawExtras.map((value) => Math.floor(value));
  let leftover =
    remaining - extraFloors.reduce((total, value) => total + value, 0);
  const rankedRemainders = rawExtras
    .map((value, regionId) => ({
      regionId,
      remainder: value - extraFloors[regionId] + rng() * 0.001,
    }))
    .sort((left, right) => right.remainder - left.remainder);

  for (let regionId = 0; regionId < size; regionId += 1) {
    targetSizes[regionId] += extraFloors[regionId];
  }

  for (let index = 0; index < rankedRemainders.length && leftover > 0; index += 1) {
    targetSizes[rankedRemainders[index].regionId] += 1;
    leftover -= 1;
  }

  return targetSizes;
}

function generateRegions(size, queens, rng) {
  const regions = Array.from({ length: size }, () => Array(size).fill(-1));
  const anchors = queens.map((column, row) => ({ row, column }));
  const regionCells = anchors.map((anchor) => [anchor]);
  const regionProfiles = createRegionProfiles(size, rng);
  const lockedCells = new Set();
  let assigned = 0;

  for (let row = 0; row < size; row += 1) {
    const column = queens[row];
    regions[row][column] = row;
    assigned += 1;
  }

  assigned += seedPatternRegions(
    size,
    regions,
    regionCells,
    anchors,
    regionProfiles,
    lockedCells,
    rng,
  );
  const targetSizes = buildRegionTargetSizes(
    size,
    regionCells,
    regionProfiles,
    rng,
  );

  while (assigned < size * size) {
    let placed = false;
    const regionOrder = Array.from({ length: size }, (_, index) => index);
    shuffleInPlace(regionOrder, rng);
    regionOrder.sort(
      (left, right) =>
        regionCells[left].length / targetSizes[left] -
          regionCells[right].length / targetSizes[right] ||
        regionCells[left].length - regionCells[right].length,
    );

    for (const regionId of regionOrder) {
      const candidates = collectExpansionCandidates(
        regionId,
        regions,
        regionCells[regionId],
        anchors[regionId],
        size,
        regionProfiles[regionId],
        targetSizes[regionId],
        rng,
      );

      if (candidates.length === 0) {
        continue;
      }

      candidates.sort((left, right) => right.score - left.score);
      const poolSize = Math.min(3, candidates.length);
      const choice = candidates[Math.floor(rng() * poolSize)];

      regions[choice.row][choice.column] = regionId;
      regionCells[regionId].push({
        row: choice.row,
        column: choice.column,
      });
      assigned += 1;
      placed = true;
      break;
    }

    if (!placed) {
      return null;
    }
  }

  return { regions, lockedCells };
}

function optimizeRegions(size, queens, initialRegions, lockedCells, rng, maxIterations) {
  let regions = cloneRegions(initialRegions);
  let bestRegions = cloneRegions(initialRegions);
  let bestCount = countRegionSolutions(size, regions, SOLUTION_SEARCH_LIMIT);
  let currentCount = bestCount;
  let stagnant = 0;

  if (bestCount === 1) {
    return { regions: bestRegions, solutionCount: bestCount };
  }

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const moves = collectCandidateMoves(
      size,
      queens,
      regions,
      lockedCells,
      rng,
      LOCAL_SEARCH_MOVE_LIMIT,
    );

    let chosenMove = null;
    let chosenRegions = null;
    let chosenCount = currentCount;

    for (const move of moves) {
      const nextRegions = applyMove(regions, move);
      const score = countRegionSolutions(
        size,
        nextRegions,
        Math.min(chosenCount, SOLUTION_SEARCH_LIMIT),
      );

      if (score < chosenCount) {
        chosenMove = move;
        chosenRegions = nextRegions;
        chosenCount = score;

        if (score === 1) {
          break;
        }
      }
    }

    if (!chosenMove) {
      stagnant += 1;
      const randomMoves = collectCandidateMoves(
        size,
        queens,
        regions,
        lockedCells,
        rng,
        8,
      );

      if (randomMoves.length === 0) {
        break;
      }

      regions = applyMove(regions, randomMoves[0]);
      currentCount = countRegionSolutions(size, regions, SOLUTION_SEARCH_LIMIT);
    } else {
      regions = chosenRegions;
      currentCount = chosenCount;

      if (currentCount < bestCount) {
        bestCount = currentCount;
        bestRegions = cloneRegions(regions);
        stagnant = 0;
      } else {
        stagnant += 1;
      }
    }

    if (bestCount === 1 || currentCount === 1) {
      return { regions: cloneRegions(regions), solutionCount: 1 };
    }

    if (stagnant > 18) {
      break;
    }
  }

  return {
    regions: bestRegions,
    solutionCount: bestCount,
  };
}

function collectCandidateMoves(size, queens, regions, lockedCells, rng, maxMoves) {
  const moves = [];
  const coordinates = Array.from({ length: size * size }, (_, index) => index);
  shuffleInPlace(coordinates, rng);

  for (const coordinate of coordinates) {
    const row = Math.floor(coordinate / size);
    const column = coordinate % size;

    if (queens[row] === column || lockedCells.has(coordinate)) {
      continue;
    }

    const fromRegion = regions[row][column];

    if (!isRegionConnectedAfterRemoval(regions, fromRegion, row, column)) {
      continue;
    }

    const targets = [];
    const seenTargets = new Set();

    for (const [rowStep, columnStep] of ORTHOGONAL_STEPS) {
      const nextRow = row + rowStep;
      const nextColumn = column + columnStep;

      if (
        nextRow < 0 ||
        nextRow >= size ||
        nextColumn < 0 ||
        nextColumn >= size
      ) {
        continue;
      }

      const targetRegion = regions[nextRow][nextColumn];

      if (targetRegion === fromRegion || seenTargets.has(targetRegion)) {
        continue;
      }

      seenTargets.add(targetRegion);
      targets.push(targetRegion);
    }

    shuffleInPlace(targets, rng);

    for (const targetRegion of targets) {
      moves.push({
        row,
        column,
        targetRegion,
      });

      if (moves.length >= maxMoves) {
        return moves;
      }
    }
  }

  return moves;
}

function isRegionConnectedAfterRemoval(regions, regionId, removeRow, removeColumn) {
  const remainingCells = [];

  for (let row = 0; row < regions.length; row += 1) {
    for (let column = 0; column < regions.length; column += 1) {
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
  const visited = new Set([cellKey(remainingCells[0].row, remainingCells[0].column)]);

  while (stack.length > 0) {
    const current = stack.pop();

    for (const [rowStep, columnStep] of ORTHOGONAL_STEPS) {
      const nextRow = current.row + rowStep;
      const nextColumn = current.column + columnStep;

      if (
        nextRow < 0 ||
        nextRow >= regions.length ||
        nextColumn < 0 ||
        nextColumn >= regions.length ||
        (nextRow === removeRow && nextColumn === removeColumn) ||
        regions[nextRow][nextColumn] !== regionId
      ) {
        continue;
      }

      const key = cellKey(nextRow, nextColumn);

      if (visited.has(key)) {
        continue;
      }

      visited.add(key);
      stack.push({ row: nextRow, column: nextColumn });
    }
  }

  return visited.size === remainingCells.length;
}

function applyMove(regions, move) {
  const nextRegions = cloneRegions(regions);
  nextRegions[move.row][move.column] = move.targetRegion;
  return nextRegions;
}

function cloneRegions(regions) {
  return regions.map((row) => [...row]);
}

function collectExpansionCandidates(
  regionId,
  regions,
  cells,
  anchor,
  size,
  profile,
  targetSize,
  rng,
) {
  const candidates = [];
  const seen = new Set();
  const shuffledCells = [...cells];
  const isPatterned = profile.kind === "patterned";
  const growthPressure = 1 - cells.length / targetSize;
  shuffleInPlace(shuffledCells, rng);

  for (const cell of shuffledCells) {
    for (const [rowStep, columnStep] of ORTHOGONAL_STEPS) {
      const row = cell.row + rowStep;
      const column = cell.column + columnStep;

      if (row < 0 || row >= size || column < 0 || column >= size) {
        continue;
      }

      if (regions[row][column] !== -1) {
        continue;
      }

      const key = cellKey(row, column);

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      const matchingNeighbors = countMatchingNeighbors(
        regions,
        row,
        column,
        regionId,
        size,
      );
      const foreignNeighbors = countAssignedNeighbors(regions, row, column, size);
      const distance =
        Math.abs(anchor.row - row) + Math.abs(anchor.column - column);

      candidates.push({
        row,
        column,
        score:
          matchingNeighbors * (isPatterned ? 3.05 : 2.45) -
          distance * (isPatterned ? 0.34 : 0.24) +
          foreignNeighbors * (isPatterned ? 0.08 : 0.16) +
          growthPressure * (isPatterned ? 0.75 : 0.42) +
          rng(),
      });
    }
  }

  return candidates;
}

function countMatchingNeighbors(regions, row, column, regionId, size) {
  let matches = 0;

  for (const [rowStep, columnStep] of ORTHOGONAL_STEPS) {
    const nextRow = row + rowStep;
    const nextColumn = column + columnStep;

    if (
      nextRow < 0 ||
      nextRow >= size ||
      nextColumn < 0 ||
      nextColumn >= size
    ) {
      continue;
    }

    if (regions[nextRow][nextColumn] === regionId) {
      matches += 1;
    }
  }

  return matches;
}

function countAssignedNeighbors(regions, row, column, size) {
  let assigned = 0;

  for (const [rowStep, columnStep] of ORTHOGONAL_STEPS) {
    const nextRow = row + rowStep;
    const nextColumn = column + columnStep;

    if (
      nextRow < 0 ||
      nextRow >= size ||
      nextColumn < 0 ||
      nextColumn >= size
    ) {
      continue;
    }

    if (regions[nextRow][nextColumn] !== -1) {
      assigned += 1;
    }
  }

  return assigned;
}

function generatePalette(size, seed) {
  const swatches = [
    { fill: "hsl(12 82% 60%)", edge: "hsl(12 74% 28%)" },
    { fill: "hsl(40 84% 58%)", edge: "hsl(40 78% 26%)" },
    { fill: "hsl(82 52% 58%)", edge: "hsl(82 54% 24%)" },
    { fill: "hsl(144 48% 55%)", edge: "hsl(144 56% 24%)" },
    { fill: "hsl(198 62% 58%)", edge: "hsl(198 72% 28%)" },
    { fill: "hsl(246 58% 64%)", edge: "hsl(246 60% 30%)" },
    { fill: "hsl(302 44% 61%)", edge: "hsl(302 52% 28%)" },
    { fill: "hsl(340 66% 62%)", edge: "hsl(340 70% 30%)" },
    { fill: "hsl(24 78% 60%)", edge: "hsl(24 76% 28%)" },
    { fill: "hsl(174 40% 56%)", edge: "hsl(174 50% 24%)" },
    { fill: "hsl(220 68% 60%)", edge: "hsl(220 72% 28%)" },
    { fill: "hsl(274 48% 62%)", edge: "hsl(274 54% 28%)" },
    { fill: "hsl(356 58% 65%)", edge: "hsl(356 62% 30%)" },
    { fill: "hsl(110 46% 58%)", edge: "hsl(110 52% 26%)" },
    { fill: "hsl(286 42% 60%)", edge: "hsl(286 48% 28%)" },
  ];
  const offset = normalizeSeed(seed) % swatches.length;
  const fills = [];
  const edges = [];

  for (let index = 0; index < size; index += 1) {
    const swatch = swatches[(offset + index) % swatches.length];
    fills.push(swatch.fill);
    edges.push(swatch.edge);
  }

  return { fills, edges };
}

function createRng(seed) {
  let state = normalizeSeed(seed) || 0x9e3779b9;

  return function next() {
    state += 0x6d2b79f5;
    let result = state;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace(items, rng) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }

  return items;
}

function mixSeed(seed, salt) {
  let value = normalizeSeed(seed) ^ normalizeSeed(salt);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

function normalizeSeed(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value >>> 0;
  }

  const text = String(value);
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function getShapeVariants(cells) {
  const variants = [];
  const seen = new Set();

  for (let rotation = 0; rotation < 4; rotation += 1) {
    for (const mirrored of [false, true]) {
      const transformed = cells.map(([row, column]) =>
        transformShapeCell(row, column, rotation, mirrored),
      );
      const minRow = Math.min(...transformed.map(([row]) => row));
      const minColumn = Math.min(...transformed.map(([, column]) => column));
      const normalized = transformed
        .map(([row, column]) => [row - minRow, column - minColumn])
        .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
      const key = normalized.map(([row, column]) => `${row}:${column}`).join("|");

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      variants.push(normalized);
    }
  }

  return variants;
}

function transformShapeCell(row, column, rotation, mirrored) {
  let nextRow = row;
  let nextColumn = mirrored ? -column : column;

  for (let step = 0; step < rotation; step += 1) {
    [nextRow, nextColumn] = [nextColumn, -nextRow];
  }

  return [nextRow, nextColumn];
}

function cellKey(row, column) {
  return `${row}:${column}`;
}

function getPuzzleCache(puzzle) {
  if (PUZZLE_CACHE.has(puzzle)) {
    return PUZZLE_CACHE.get(puzzle);
  }

  const size = puzzle.size;
  const totalCells = size * size;
  const regionByIndex = new Uint8Array(totalCells);
  const rowByIndex = new Uint8Array(totalCells);
  const columnByIndex = new Uint8Array(totalCells);
  const keyByIndex = Array(totalCells);
  const diagonalByIndex = Array.from({ length: totalCells }, () => []);
  const forwardDiagonalByIndex = Array.from({ length: totalCells }, () => []);

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const index = cellIndex(row, column, size);

      regionByIndex[index] = puzzle.regions[row][column];
      rowByIndex[index] = row;
      columnByIndex[index] = column;
      keyByIndex[index] = cellKey(row, column);

      for (const [rowStep, columnStep] of DIAGONAL_STEPS) {
        const nextRow = row + rowStep;
        const nextColumn = column + columnStep;

        if (
          nextRow < 0 ||
          nextRow >= size ||
          nextColumn < 0 ||
          nextColumn >= size
        ) {
          continue;
        }

        const nextIndex = cellIndex(nextRow, nextColumn, size);
        diagonalByIndex[index].push(nextIndex);

        if (rowStep === 1) {
          forwardDiagonalByIndex[index].push(nextIndex);
        }
      }
    }
  }

  const cache = {
    regionByIndex,
    rowByIndex,
    columnByIndex,
    keyByIndex,
    diagonalByIndex,
    forwardDiagonalByIndex,
  };

  PUZZLE_CACHE.set(puzzle, cache);
  return cache;
}

function cellIndex(row, column, size) {
  return row * size + column;
}

function rowFromIndex(index, size) {
  return Math.floor(index / size);
}

function columnFromIndex(index, size) {
  return index % size;
}

function addConflictIndex(conflicts, index, puzzleCache) {
  conflicts.add(puzzleCache.keyByIndex[index]);
}
