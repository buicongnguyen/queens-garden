import assert from "node:assert/strict";
import test from "node:test";

import {
  CELL_STATE,
  SUPPORTED_SIZES,
  analyzePlayerBoard,
  countSolutions,
  createEmptyBoard,
  createFixedLevelPuzzle,
  createPuzzle,
  createProceduralPuzzle,
  createRandomLevelPuzzle,
  findHint,
  findDisconnectedRegion,
  formatSeed,
  solutionBoard,
  validateSolutionColumns,
} from "../src/engine.js";

test("every saved size exposes a solved, conflict-free board", () => {
  for (const size of SUPPORTED_SIZES) {
    const puzzle = createFixedLevelPuzzle(size, 1);
    const analysis = analyzePlayerBoard(puzzle, solutionBoard(puzzle));

    assert.equal(analysis.solved, true, `${size}x${size} should solve`);
    assert.equal(analysis.queenCount, size);
    assert.equal(analysis.conflicts.size, 0);
    assert.equal(analysis.rowViolations.size, 0);
    assert.equal(analysis.columnViolations.size, 0);
    assert.equal(analysis.regionViolations.size, 0);
  }
});

test("player analysis enforces row, column, region, and touching-diagonal rules", () => {
  const columnRegions = createTestPuzzle([
    [0, 1, 2, 3],
    [0, 1, 2, 3],
    [0, 1, 2, 3],
    [0, 1, 2, 3],
  ]);
  const latinRegions = createTestPuzzle([
    [0, 1, 2, 3],
    [1, 2, 3, 0],
    [2, 3, 0, 1],
    [3, 0, 1, 2],
  ]);

  assertConflict(columnRegions, [[0, 0], [0, 1]], "same row");
  assertConflict(columnRegions, [[0, 0], [1, 0]], "same column/region");
  assertConflict(latinRegions, [[0, 0], [1, 3]], "same region");
  assertConflict(columnRegions, [[0, 0], [1, 1]], "touching diagonal");

  const distantDiagonal = boardWithQueens(4, [[0, 0], [2, 2]]);
  assert.equal(
    analyzePlayerBoard(columnRegions, distantDiagonal).conflicts.size,
    0,
    "non-touching queens on the same long diagonal are allowed",
  );
});

test("a conflicting board asks the player to resolve conflicts before hinting", () => {
  const puzzle = createFixedLevelPuzzle(7, 1);
  const board = createEmptyBoard(7);
  board[0][0] = CELL_STATE.QUEEN;
  board[0][1] = CELL_STATE.QUEEN;

  assert.equal(findHint(puzzle, board).type, "resolve-conflicts");
});

test("hints reject globally impossible queens and marks on unique puzzles", () => {
  const puzzle = createFixedLevelPuzzle(7, 1);
  const wrongQueenBoard = createEmptyBoard(7);
  wrongQueenBoard[0][3] = CELL_STATE.QUEEN;

  assert.equal(
    analyzePlayerBoard(puzzle, wrongQueenBoard).conflicts.size,
    0,
    "the regression fixture must be locally conflict-free",
  );
  assert.equal(findHint(puzzle, wrongQueenBoard).type, "dead-end");

  const markedSolutionBoard = createEmptyBoard(7);
  markedSolutionBoard[0][puzzle.queens[0]] = CELL_STATE.MARK;
  assert.equal(findHint(puzzle, markedSolutionBoard).type, "dead-end");
});

test("forced row hints identify the exact missing queen for every size", () => {
  for (const size of SUPPORTED_SIZES) {
    const puzzle = createFixedLevelPuzzle(size, 1);
    const board = createEmptyBoard(size);
    const forcedColumn = puzzle.queens[0];

    for (let column = 0; column < size; column += 1) {
      if (column !== forcedColumn) {
        board[0][column] = CELL_STATE.MARK;
      }
    }

    const hint = findHint(puzzle, board);
    assert.equal(hint.type, "must-queen", `${size}x${size} should have a forced hint`);
    assert.equal(hint.row, 0);
    assert.equal(hint.column, forcedColumn);
  }
});

test("removing one queen from a solution forces that exact cell", () => {
  for (const size of SUPPORTED_SIZES) {
    const puzzle = createFixedLevelPuzzle(size, 1);
    const board = solutionBoard(puzzle);
    const missingColumn = puzzle.queens[0];
    board[0][missingColumn] = CELL_STATE.EMPTY;

    const hint = findHint(puzzle, board);
    assert.equal(hint.type, "must-queen", `${size}x${size} should restore the queen`);
    assert.equal(hint.row, 0);
    assert.equal(hint.column, missingColumn);
  }
});

test("contradictory inferred queens produce a dead-end hint", () => {
  const puzzle = createFixedLevelPuzzle(7, 1);
  const board = parseBoard([
    "0200000",
    "0000220",
    "0000000",
    "2200002",
    "2222220",
    "2200000",
    "0022222",
  ]);

  assert.equal(findHint(puzzle, board).type, "dead-end");
});

test("fully marked colored regions are reported as impossible", () => {
  const puzzle = createFixedLevelPuzzle(7, 1);
  const board = createEmptyBoard(7);
  const region = puzzle.regions[0][5];

  for (let row = 0; row < puzzle.size; row += 1) {
    for (let column = 0; column < puzzle.size; column += 1) {
      if (puzzle.regions[row][column] === region) {
        board[row][column] = CELL_STATE.MARK;
      }
    }
  }

  const analysis = analyzePlayerBoard(puzzle, board);
  assert.equal(analysis.regionViolations.has(region), true);
  assert.equal(findHint(puzzle, board).type, "dead-end");
});

test("displayed random seeds reproduce layout, solution, and palette", () => {
  for (const size of SUPPORTED_SIZES) {
    const seed = (123456789 + size * 7919) >>> 0;
    const original = createRandomLevelPuzzle(size, seed);
    const replay = createRandomLevelPuzzle(size, formatSeed(original.seed));

    assert.equal(original.seed, seed);
    assert.equal(replay.seed, seed);
    assert.equal(replay.levelId, original.levelId);
    assert.deepEqual(replay.queens, original.queens);
    assert.deepEqual(replay.regions, original.regions);
    assert.deepEqual(replay.palette, original.palette);
  }
});

test("procedural puzzles preserve the caller seed", () => {
  const seed = 14091;
  const puzzle = createProceduralPuzzle(7, seed);
  const replay = createProceduralPuzzle(7, formatSeed(puzzle.seed));

  assert.equal(puzzle.seed, seed);
  assert.equal(replay.seed, seed);
  assert.deepEqual(replay.queens, puzzle.queens);
  assert.deepEqual(replay.regions, puzzle.regions);
  assert.deepEqual(replay.palette, puzzle.palette);
});

test("preset puzzles are valid for every size and do not leak cached state", () => {
  for (const size of SUPPORTED_SIZES) {
    for (let seed = 0; seed < 8; seed += 1) {
      const puzzle = createPuzzle(size, seed, { source: "preset" });

      assert.equal(findDisconnectedRegion(puzzle.regions), null);
      assert.equal(validateSolutionColumns(puzzle, puzzle.queens), true);
    }

    const puzzle = createPuzzle(size, 0, { source: "preset" });
    assert.equal(
      countSolutions({ ...puzzle, solutionCount: null }, 2),
      1,
      `${size}x${size} preset should be unique`,
    );
  }

  const first = createPuzzle(8, 0, { source: "preset" });
  const second = createPuzzle(8, 0, { source: "preset" });
  assert.notEqual(first.regions, second.regions);
  assert.notEqual(first.regions[0], second.regions[0]);

  const original = second.regions[0][0];
  first.regions[0][0] = 255;
  assert.equal(second.regions[0][0], original);
});

test("large procedural requests fail quickly instead of blocking the UI thread", () => {
  assert.throws(
    () => createProceduralPuzzle(10, 1),
    /supports sizes 7, 8, 9/,
  );
});

function createTestPuzzle(regions) {
  const size = regions.length;
  return {
    size,
    seed: 1,
    queens: Array.from({ length: size }, (_, row) => row),
    regions,
    palette: Array(size).fill("#fff"),
    outlinePalette: Array(size).fill("#000"),
    solutionCount: null,
  };
}

function boardWithQueens(size, coordinates) {
  const board = createEmptyBoard(size);
  for (const [row, column] of coordinates) {
    board[row][column] = CELL_STATE.QUEEN;
  }
  return board;
}

function assertConflict(puzzle, coordinates, label) {
  const analysis = analyzePlayerBoard(
    puzzle,
    boardWithQueens(puzzle.size, coordinates),
  );
  assert.equal(analysis.conflicts.size, coordinates.length, label);
}

function parseBoard(rows) {
  return rows.map((row) => [...row].map(Number));
}
