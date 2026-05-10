export const CELL_STATE = Object.freeze({
  EMPTY: 0,
  QUEEN: 1,
  MARK: 2,
});

export const SUPPORTED_SIZES = Object.freeze([7, 8, 9, 10, 11, 12, 13]);

const ORTHOGONAL_STEPS = Object.freeze([
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]);

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
});

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

export function createEmptyBoard(size) {
  return Array.from({ length: size }, () => Array(size).fill(CELL_STATE.EMPTY));
}

export function createPuzzle(size, seed = randomSeed()) {
  if (!SUPPORTED_SIZES.includes(size)) {
    throw new Error(`Unsupported board size: ${size}`);
  }

  const baseSeed = normalizeSeed(seed);
  const presetPuzzle = createPresetPuzzle(size, baseSeed);

  if (presetPuzzle) {
    return presetPuzzle;
  }

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
        const regions = generateRegions(
          size,
          queens,
          createRng(mixSeed(attemptSeed, regionAttempt + 101)),
        );

        if (!regions) {
          continue;
        }

        const palette = generatePalette(size, attemptSeed);
        const puzzle = {
          size,
          seed: attemptSeed,
          queens,
          regions,
          palette: palette.fills,
          outlinePalette: palette.edges,
        };

        const optimized = optimizeRegions(
          size,
          queens,
          regions,
          createRng(mixSeed(attemptSeed, regionAttempt + 409)),
          budget.localSearchIterations,
        );

        if (optimized.solutionCount === 1) {
          puzzle.regions = optimized.regions;
          return puzzle;
        }
      }
    }
  }

  throw new Error("Could not create a unique puzzle. Please try again.");
}

export function countSolutions(puzzle, limit = 2) {
  return countRegionSolutions(puzzle.size, puzzle.regions, limit);
}

function countRegionSolutions(size, regions, limit = 2) {
  const usedColumns = new Uint8Array(size);
  const usedRegions = new Uint8Array(size);
  const placements = new Int16Array(size);
  placements.fill(-1);

  let solutions = 0;

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

    candidates.sort((left, right) => left.region - right.region);
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
    if (solutions >= limit) {
      return;
    }

    if (placedCount === size) {
      solutions += 1;
      return;
    }

    const { row, candidates } = pickNextRow();

    if (candidates.length === 0) {
      return;
    }

    for (const candidate of candidates) {
      usedColumns[candidate.column] = 1;
      usedRegions[candidate.region] = 1;
      placements[row] = candidate.column;
      search(placedCount + 1);
      placements[row] = -1;
      usedColumns[candidate.column] = 0;
      usedRegions[candidate.region] = 0;

      if (solutions >= limit) {
        return;
      }
    }
  }

  search(0);
  return solutions;
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
  const rowCounts = Array(puzzle.size).fill(0);
  const columnCounts = Array(puzzle.size).fill(0);
  const regionCounts = Array(puzzle.size).fill(0);
  const rowMarks = Array(puzzle.size).fill(0);
  const columnMarks = Array(puzzle.size).fill(0);
  const queens = [];
  const queenKeys = new Set();

  for (let row = 0; row < puzzle.size; row += 1) {
    for (let column = 0; column < puzzle.size; column += 1) {
      if (board[row][column] === CELL_STATE.MARK) {
        rowMarks[row] += 1;
        columnMarks[column] += 1;
      }

      if (board[row][column] !== CELL_STATE.QUEEN) {
        continue;
      }

      const region = puzzle.regions[row][column];
      rowCounts[row] += 1;
      columnCounts[column] += 1;
      regionCounts[region] += 1;

      const key = cellKey(row, column);
      queens.push({ row, column, region, key });
      queenKeys.add(key);
    }
  }

  const conflicts = new Set();

  for (const queen of queens) {
    if (
      rowCounts[queen.row] > 1 ||
      columnCounts[queen.column] > 1 ||
      regionCounts[queen.region] > 1
    ) {
      conflicts.add(queen.key);
    }

    for (const diagonalColumnOffset of [-1, 1]) {
      const nextRow = queen.row + 1;
      const nextColumn = queen.column + diagonalColumnOffset;

      if (
        nextRow >= puzzle.size ||
        nextColumn < 0 ||
        nextColumn >= puzzle.size
      ) {
        continue;
      }

      const otherKey = cellKey(nextRow, nextColumn);

      if (queenKeys.has(otherKey)) {
        conflicts.add(queen.key);
        conflicts.add(otherKey);
      }
    }
  }

  const rowViolations = new Set();
  const columnViolations = new Set();

  for (let row = 0; row < puzzle.size; row += 1) {
    if (
      rowCounts[row] > 1 ||
      (rowCounts[row] === 0 && rowMarks[row] === puzzle.size)
    ) {
      rowViolations.add(row);
    }
  }

  for (let column = 0; column < puzzle.size; column += 1) {
    if (
      columnCounts[column] > 1 ||
      (columnCounts[column] === 0 && columnMarks[column] === puzzle.size)
    ) {
      columnViolations.add(column);
    }
  }

  const queenCount = queens.length;
  const solved =
    queenCount === puzzle.size &&
    conflicts.size === 0 &&
    rowCounts.every((count) => count === 1) &&
    columnCounts.every((count) => count === 1) &&
    regionCounts.every((count) => count === 1);

  return {
    queenCount,
    rowCounts,
    columnCounts,
    regionCounts,
    completedRegions: regionCounts.filter((count) => count === 1).length,
    conflicts,
    rowViolations,
    columnViolations,
    solved,
  };
}

export function findHint(puzzle, board) {
  const analysis = analyzePlayerBoard(puzzle, board);

  if (analysis.conflicts.size > 0) {
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
  const layouts = PRESET_LAYOUTS[size];

  if (!layouts || layouts.length === 0) {
    return null;
  }

  const layout = layouts[seed % layouts.length];
  const transformIndex = Math.floor(seed / layouts.length) % 8;
  const regions = transformRegions(parsePresetLayout(layout), transformIndex);
  const queens = solveRegionColumns(size, regions);

  if (!queens) {
    return null;
  }

  const palette = generatePalette(size, seed);
  return {
    size,
    seed,
    queens,
    regions,
    palette: palette.fills,
    outlinePalette: palette.edges,
  };
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
  const queenOrigins = new Map();

  for (let row = 0; row < puzzle.size; row += 1) {
    for (let column = 0; column < puzzle.size; column += 1) {
      if (board[row][column] === CELL_STATE.QUEEN) {
        queenOrigins.set(cellKey(row, column), {
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

  for (let row = 0; row < puzzle.size; row += 1) {
    for (let column = 0; column < puzzle.size; column += 1) {
      const key = cellKey(row, column);
      const origin = queenOrigins.get(key);

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
  const rowQueens = Array(puzzle.size).fill(null);
  const columnQueens = Array(puzzle.size).fill(null);
  const regionQueens = Array(puzzle.size).fill(null);
  const blockedReasons = Array.from({ length: puzzle.size }, () =>
    Array(puzzle.size).fill(null),
  );
  const candidates = Array.from({ length: puzzle.size }, () =>
    Array(puzzle.size).fill(false),
  );
  const forced = [];

  for (const [key, origin] of queenOrigins.entries()) {
    const [rowText, columnText] = key.split(":");
    const row = Number(rowText);
    const column = Number(columnText);
    const region = puzzle.regions[row][column];
    rowQueens[row] = { row, column, origin };
    columnQueens[column] = { row, column, origin };
    regionQueens[region] = { row, column, origin };
  }

  for (let row = 0; row < puzzle.size; row += 1) {
    for (let column = 0; column < puzzle.size; column += 1) {
      const key = cellKey(row, column);

      if (queenOrigins.has(key)) {
        candidates[row][column] = true;
        continue;
      }

      if (board[row][column] === CELL_STATE.MARK) {
        blockedReasons[row][column] = { kind: "marked" };
        continue;
      }

      const region = puzzle.regions[row][column];
      const rowQueen = rowQueens[row];
      const columnQueen = columnQueens[column];
      const regionQueen = regionQueens[region];
      const diagonalQueen = findDiagonalQueen(queenOrigins, row, column);

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

      candidates[row][column] = true;
    }
  }

  for (let row = 0; row < puzzle.size; row += 1) {
    if (rowQueens[row]) {
      continue;
    }

    const options = [];

    for (let column = 0; column < puzzle.size; column += 1) {
      if (candidates[row][column]) {
        options.push({ row, column });
      }
    }

    if (options.length === 0) {
      return {
        consistent: false,
        blockedReasons,
        forced: [],
      };
    }

    if (options.length === 1) {
      forced.push({
        row: options[0].row,
        column: options[0].column,
        reason: {
          kind: "row-single",
          row: options[0].row,
          column: options[0].column,
        },
      });
    }
  }

  for (let column = 0; column < puzzle.size; column += 1) {
    if (columnQueens[column]) {
      continue;
    }

    const options = [];

    for (let row = 0; row < puzzle.size; row += 1) {
      if (candidates[row][column]) {
        options.push({ row, column });
      }
    }

    if (options.length === 0) {
      return {
        consistent: false,
        blockedReasons,
        forced: [],
      };
    }

    if (options.length === 1) {
      forced.push({
        row: options[0].row,
        column: options[0].column,
        reason: {
          kind: "column-single",
          row: options[0].row,
          column: options[0].column,
        },
      });
    }
  }

  for (let region = 0; region < puzzle.size; region += 1) {
    if (regionQueens[region]) {
      continue;
    }

    const options = [];

    for (let row = 0; row < puzzle.size; row += 1) {
      for (let column = 0; column < puzzle.size; column += 1) {
        if (
          puzzle.regions[row][column] === region &&
          candidates[row][column]
        ) {
          options.push({ row, column });
        }
      }
    }

    if (options.length === 0) {
      return {
        consistent: false,
        blockedReasons,
        forced: [],
      };
    }

    if (options.length === 1) {
      forced.push({
        row: options[0].row,
        column: options[0].column,
        reason: {
          kind: "region-single",
          row: options[0].row,
          column: options[0].column,
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

function findDiagonalQueen(queenOrigins, row, column) {
  for (const [rowStep, columnStep] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ]) {
    const nextRow = row + rowStep;
    const nextColumn = column + columnStep;
    const key = cellKey(nextRow, nextColumn);

    if (!queenOrigins.has(key)) {
      continue;
    }

    return {
      row: nextRow,
      column: nextColumn,
      origin: queenOrigins.get(key),
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

function generateRegions(size, queens, rng) {
  const regions = Array.from({ length: size }, () => Array(size).fill(-1));
  const anchors = queens.map((column, row) => ({ row, column }));
  const regionCells = anchors.map((anchor) => [anchor]);
  let assigned = 0;

  for (let row = 0; row < size; row += 1) {
    const column = queens[row];
    regions[row][column] = row;
    assigned += 1;
  }

  while (assigned < size * size) {
    let placed = false;
    const regionOrder = Array.from({ length: size }, (_, index) => index);
    shuffleInPlace(regionOrder, rng);
    regionOrder.sort(
      (left, right) => regionCells[left].length - regionCells[right].length,
    );

    for (const regionId of regionOrder) {
      const candidates = collectExpansionCandidates(
        regionId,
        regions,
        regionCells[regionId],
        anchors[regionId],
        size,
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

  return regions;
}

function optimizeRegions(size, queens, initialRegions, rng, maxIterations) {
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
      const randomMoves = collectCandidateMoves(size, queens, regions, rng, 8);

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

function collectCandidateMoves(size, queens, regions, rng, maxMoves) {
  const moves = [];
  const coordinates = Array.from({ length: size * size }, (_, index) => index);
  shuffleInPlace(coordinates, rng);

  for (const coordinate of coordinates) {
    const row = Math.floor(coordinate / size);
    const column = coordinate % size;

    if (queens[row] === column) {
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

function collectExpansionCandidates(regionId, regions, cells, anchor, size, rng) {
  const candidates = [];
  const seen = new Set();
  const shuffledCells = [...cells];
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
          matchingNeighbors * 2.6 -
          distance * 0.28 +
          foreignNeighbors * 0.12 +
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

function cellKey(row, column) {
  return `${row}:${column}`;
}
