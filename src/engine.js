export const CELL_STATE = Object.freeze({
  EMPTY: 0,
  QUEEN: 1,
  MARK: 2,
});

export const SUPPORTED_SIZES = Object.freeze([5, 6, 7, 8]);

const ORTHOGONAL_STEPS = Object.freeze([
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]);

const GENERATION_ATTEMPTS = 14;
const REGION_ATTEMPTS = 12;
const SOLUTION_SEARCH_LIMIT = 65;
const LOCAL_SEARCH_MOVE_LIMIT = 30;
const SEED_VARIATIONS = 5;
const LOCAL_SEARCH_ITERATIONS = Object.freeze({
  5: 700,
  6: 1400,
  7: 2200,
  8: 3000,
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

  for (let seedVariant = 0; seedVariant < SEED_VARIATIONS; seedVariant += 1) {
    const variantSeed = mixSeed(baseSeed, seedVariant + 1);

    for (let attempt = 0; attempt < GENERATION_ATTEMPTS; attempt += 1) {
      const attemptSeed = mixSeed(variantSeed, attempt + 1);
      const queenRng = createRng(attemptSeed);
      const queens = generateQueenPlacement(size, queenRng);

      if (!queens) {
        continue;
      }

      for (let regionAttempt = 0; regionAttempt < REGION_ATTEMPTS; regionAttempt += 1) {
        const regions = generateRegions(
          size,
          queens,
          createRng(mixSeed(attemptSeed, regionAttempt + 101)),
        );

        if (!regions) {
          continue;
        }

        const puzzle = {
          size,
          seed: attemptSeed,
          queens,
          regions,
          palette: generatePalette(size, attemptSeed),
        };

        const optimized = optimizeRegions(
          size,
          queens,
          regions,
          createRng(mixSeed(attemptSeed, regionAttempt + 409)),
          LOCAL_SEARCH_ITERATIONS[size],
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

  function search(row) {
    if (solutions >= limit) {
      return;
    }

    if (row === size) {
      solutions += 1;
      return;
    }

    const candidates = [];

    for (let column = 0; column < size; column += 1) {
      const region = regions[row][column];

      if (usedColumns[column] || usedRegions[region]) {
        continue;
      }

      if (row > 0 && Math.abs(placements[row - 1] - column) === 1) {
        continue;
      }

      candidates.push({ column, region });
    }

    candidates.sort((left, right) => left.region - right.region);

    for (const candidate of candidates) {
      usedColumns[candidate.column] = 1;
      usedRegions[candidate.region] = 1;
      placements[row] = candidate.column;
      search(row + 1);
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
  const queens = [];
  const queenKeys = new Set();

  for (let row = 0; row < puzzle.size; row += 1) {
    for (let column = 0; column < puzzle.size; column += 1) {
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
    solved,
  };
}

export function solutionBoard(puzzle) {
  const board = createEmptyBoard(puzzle.size);

  for (let row = 0; row < puzzle.size; row += 1) {
    board[row][puzzle.queens[row]] = CELL_STATE.QUEEN;
  }

  return board;
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
  const rng = createRng(mixSeed(seed, 0x6d2b79f5));
  const startHue = Math.floor(rng() * 360);
  const colors = [];

  for (let index = 0; index < size; index += 1) {
    const hue = (startHue + (360 / size) * index + rng() * 16) % 360;
    const saturation = 66 + Math.floor(rng() * 12);
    const lightness = 79 + Math.floor(rng() * 8);
    colors.push(
      `hsl(${Math.round(hue)} ${saturation}% ${lightness}%)`,
    );
  }

  return colors;
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
