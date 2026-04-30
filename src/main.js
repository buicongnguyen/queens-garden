import {
  CELL_STATE,
  SUPPORTED_SIZES,
  analyzePlayerBoard,
  createEmptyBoard,
  createPuzzle,
  findHint,
  formatSeed,
  randomSeed,
  solutionBoard,
} from "./engine.js";

const QUEEN_ICON_PATH = "./assets/queen-token-192.png";

const sizeSelect = document.querySelector("#size-select");
const boardElement = document.querySelector("#board");
const newGameButton = document.querySelector("#new-game-button");
const resetButton = document.querySelector("#reset-button");
const hintButton = document.querySelector("#hint-button");
const revealButton = document.querySelector("#reveal-button");
const statusText = document.querySelector("#status-text");
const hintText = document.querySelector("#hint-text");
const queensStats = [...document.querySelectorAll("[data-queens-stat]")];
const regionsStats = [...document.querySelectorAll("[data-regions-stat]")];
const conflictsStats = [...document.querySelectorAll("[data-conflicts-stat]")];
const seedLabels = [...document.querySelectorAll("[data-seed-label]")];
const toolButtons = [...document.querySelectorAll("[data-tool]")];
const mobileTapQuery = window.matchMedia("(max-width: 820px)");

const state = {
  puzzle: null,
  board: [],
  analysis: null,
  cellElements: [],
  tokenElements: [],
  renderedPuzzleSeed: null,
  size: 7,
  activeTool: "queen",
  hint: null,
  mobileTapMode: mobileTapQuery.matches,
  loading: false,
  revealedBySystem: false,
};

for (const size of SUPPORTED_SIZES) {
  const option = document.createElement("option");
  option.value = String(size);
  option.textContent = `${size} x ${size}`;
  if (size === state.size) {
    option.selected = true;
  }
  sizeSelect.append(option);
}

for (const button of toolButtons) {
  button.addEventListener("click", () => {
    state.activeTool = button.dataset.tool;
    renderTools();
  });
}

boardElement.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");

  if (!cell || !boardElement.contains(cell)) {
    return;
  }

  const row = Number(cell.dataset.row);
  const column = Number(cell.dataset.column);

  if (state.mobileTapMode && !event.shiftKey) {
    applyMobileTap(row, column);
    return;
  }

  const quickTool = event.shiftKey ? "mark" : state.activeTool;
  applyTool(row, column, quickTool);
});

boardElement.addEventListener("contextmenu", (event) => {
  const cell = event.target.closest(".cell");

  if (!cell || !boardElement.contains(cell)) {
    return;
  }

  event.preventDefault();
  applyTool(Number(cell.dataset.row), Number(cell.dataset.column), "mark");
});

newGameButton.addEventListener("click", () => {
  void buildPuzzle(state.size);
});

resetButton.addEventListener("click", () => {
  if (!state.puzzle || state.loading) {
    return;
  }

  state.board = createEmptyBoard(state.puzzle.size);
  state.analysis = analyzePlayerBoard(state.puzzle, state.board);
  state.hint = null;
  state.revealedBySystem = false;
  render();
});

hintButton.addEventListener("click", () => {
  if (!state.puzzle || state.loading) {
    return;
  }

  const previousHint = state.hint;
  state.hint = findHint(state.puzzle, state.board);
  renderHint();
  renderBoard(
    collectAffectedCellKeys({
      previousHint,
      nextHint: state.hint,
    }),
  );
});

revealButton.addEventListener("click", () => {
  if (!state.puzzle || state.loading) {
    return;
  }

  state.board = solutionBoard(state.puzzle);
  state.analysis = analyzePlayerBoard(state.puzzle, state.board);
  state.hint = null;
  state.revealedBySystem = true;
  render();
});

sizeSelect.addEventListener("change", () => {
  state.size = Number(sizeSelect.value);
  void buildPuzzle(state.size);
});

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (key === "q") {
    state.activeTool = "queen";
    renderTools();
  } else if (key === "x") {
    state.activeTool = "mark";
    renderTools();
  } else if (key === "e") {
    state.activeTool = "erase";
    renderTools();
  }
});

mobileTapQuery.addEventListener("change", (event) => {
  state.mobileTapMode = event.matches;
});

void buildPuzzle(state.size);

async function buildPuzzle(size) {
  if (state.loading) {
    return;
  }

  state.loading = true;
  state.size = size;
  state.hint = null;
  state.revealedBySystem = false;
  boardElement.classList.add("is-loading");
  boardElement.style.setProperty("--size", String(size));
  boardElement.replaceChildren();
  state.renderedPuzzleSeed = null;
  state.cellElements = [];
  state.tokenElements = [];
  render();

  await nextFrame();

  try {
    const seed = randomSeed();
    state.puzzle = createPuzzle(size, seed);
    state.board = createEmptyBoard(size);
    state.analysis = analyzePlayerBoard(state.puzzle, state.board);
  } catch (error) {
    statusText.textContent =
      error instanceof Error ? error.message : "Unable to create puzzle.";
  } finally {
    state.loading = false;
    boardElement.classList.remove("is-loading");
    render();
  }
}

function render() {
  renderTools();
  renderStats();
  renderStatus();
  renderHint();

  if (!state.loading) {
    renderBoard();
  }

  sizeSelect.disabled = state.loading;
  newGameButton.disabled = state.loading;
  resetButton.disabled = state.loading || !state.puzzle;
  hintButton.disabled = state.loading || !state.puzzle || state.revealedBySystem;
  revealButton.disabled = state.loading || !state.puzzle || state.revealedBySystem;
}

function renderTools() {
  for (const button of toolButtons) {
    const isActive = button.dataset.tool === state.activeTool;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
    button.disabled = state.loading || state.revealedBySystem;
  }
}

function renderStats() {
  if (!state.puzzle || !state.analysis) {
    updateText(queensStats, "0 / 0");
    updateText(regionsStats, "0 / 0");
    updateText(conflictsStats, "0");
    updateText(seedLabels, "Seed: --");
    return;
  }

  updateText(
    queensStats,
    `${state.analysis.queenCount} / ${state.puzzle.size}`,
  );
  updateText(
    regionsStats,
    `${state.analysis.completedRegions} / ${state.puzzle.size}`,
  );
  updateText(conflictsStats, String(state.analysis.conflicts.size));
  updateText(seedLabels, `Seed: ${formatSeed(state.puzzle.seed)}`);
}

function renderStatus() {
  if (state.loading) {
    statusText.textContent = "Generating a fresh board with one unique solution...";
    return;
  }

  if (!state.puzzle || !state.analysis) {
    statusText.textContent = "No puzzle loaded yet.";
    return;
  }

  if (state.revealedBySystem) {
    statusText.textContent =
      "Game ended. Every queen is revealed now. Reset to replay this board or create a new puzzle.";
    return;
  }

  if (state.analysis.solved) {
    statusText.textContent =
      "Solved. Every row, column, and colored region now holds exactly one queen.";
    return;
  }

  if (state.analysis.conflicts.size > 0) {
    const conflictWord =
      state.analysis.conflicts.size === 1 ? "conflict" : "conflicts";
    statusText.textContent =
      `${state.analysis.conflicts.size} ${conflictWord} detected. ` +
      "Queens cannot share a row, column, region, or touching diagonal.";
    return;
  }

  const remaining = state.puzzle.size - state.analysis.queenCount;
  const queenWord = remaining === 1 ? "queen" : "queens";
  statusText.textContent =
    `Place ${remaining} more ${queenWord}. Use marks to track cells that are no longer possible.`;
}

function renderHint() {
  if (state.loading) {
    hintText.textContent =
      "Hint waits for the next board. Once the puzzle loads, it will inspect your queens and marks.";
    return;
  }

  if (!state.puzzle) {
    hintText.textContent =
      "Hint reads your current queens and marks, then explains one forced or impossible cell.";
    return;
  }

  if (state.revealedBySystem) {
    hintText.textContent =
      "The solution is already revealed. Start a new puzzle or reset this one to play again.";
    return;
  }

  if (!state.hint) {
    hintText.textContent =
      "Hint reads the current queens and marks, then looks for cells that are forced or impossible right now.";
    return;
  }

  hintText.textContent = state.hint.message;
}

function renderBoard(cellKeys = null) {
  if (!state.puzzle) {
    return;
  }

  ensureBoardStructure();
  boardElement.classList.toggle("is-solved", Boolean(state.analysis?.solved));
  boardElement.style.setProperty("--size", String(state.puzzle.size));

  if (cellKeys instanceof Set) {
    for (const key of cellKeys) {
      syncCellByKey(key);
    }
    return;
  }

  for (let row = 0; row < state.puzzle.size; row += 1) {
    for (let column = 0; column < state.puzzle.size; column += 1) {
      syncCell(row, column);
    }
  }
}

function syncCellByKey(key) {
  const [rowText, columnText] = key.split(":");
  syncCell(Number(rowText), Number(columnText));
}

function ensureBoardStructure() {
  if (
    state.renderedPuzzleSeed === state.puzzle.seed &&
    state.cellElements.length === state.puzzle.size
  ) {
    return;
  }

  const fragment = document.createDocumentFragment();
  state.cellElements = Array.from({ length: state.puzzle.size }, () =>
    Array(state.puzzle.size),
  );
  state.tokenElements = Array.from({ length: state.puzzle.size }, () =>
    Array(state.puzzle.size),
  );

  for (let row = 0; row < state.puzzle.size; row += 1) {
    for (let column = 0; column < state.puzzle.size; column += 1) {
      const region = state.puzzle.regions[row][column];
      const topRegion = row > 0 ? state.puzzle.regions[row - 1][column] : -1;
      const rightRegion =
        column < state.puzzle.size - 1
          ? state.puzzle.regions[row][column + 1]
          : -1;
      const bottomRegion =
        row < state.puzzle.size - 1
          ? state.puzzle.regions[row + 1][column]
          : -1;
      const leftRegion = column > 0 ? state.puzzle.regions[row][column - 1] : -1;
      const cell = document.createElement("button");
      const token = document.createElement("span");

      cell.type = "button";
      cell.className = "cell";
      cell.dataset.row = String(row);
      cell.dataset.column = String(column);
      cell.style.setProperty("--tone", state.puzzle.palette[region]);
      cell.style.setProperty("--edge", state.puzzle.outlinePalette[region]);
      cell.style.setProperty(
        "--stroke-top",
        row === 0 || topRegion !== region ? "3px" : "1.5px",
      );
      cell.style.setProperty(
        "--stroke-right",
        column === state.puzzle.size - 1 || rightRegion !== region ? "3px" : "1.5px",
      );
      cell.style.setProperty(
        "--stroke-bottom",
        row === state.puzzle.size - 1 || bottomRegion !== region ? "3px" : "1.5px",
      );
      cell.style.setProperty(
        "--stroke-left",
        column === 0 || leftRegion !== region ? "3px" : "1.5px",
      );
      cell.style.setProperty("--delay", `${(row + column) * 18}ms`);
      cell.setAttribute(
        "aria-label",
        `Row ${row + 1}, column ${column + 1}, region ${region + 1}`,
      );

      token.className = "token";
      cell.append(token);
      fragment.append(cell);

      state.cellElements[row][column] = cell;
      state.tokenElements[row][column] = token;
    }
  }

  boardElement.replaceChildren(fragment);
  state.renderedPuzzleSeed = state.puzzle.seed;
}

function syncCell(row, column) {
  const cell = state.cellElements[row]?.[column];
  const token = state.tokenElements[row]?.[column];

  if (!cell || !token) {
    return;
  }

  const stateValue = state.board[row][column];
  const conflictKey = `${row}:${column}`;
  const displayValue =
    state.revealedBySystem && state.puzzle.queens[row] === column
      ? CELL_STATE.QUEEN
      : stateValue;

  cell.disabled = state.loading || state.revealedBySystem;
  cell.classList.toggle("is-queen", displayValue === CELL_STATE.QUEEN);
  cell.classList.toggle("is-mark", displayValue === CELL_STATE.MARK);
  cell.classList.toggle(
    "is-conflict",
    Boolean(state.analysis?.conflicts.has(conflictKey)),
  );
  cell.classList.toggle("is-revealed", state.revealedBySystem);
  cell.classList.toggle(
    "is-hint-target",
    state.hint?.row === row && state.hint?.column === column,
  );
  cell.classList.toggle(
    "is-hint-source",
    state.hint?.blocker?.row === row && state.hint?.blocker?.column === column,
  );
  cell.classList.toggle("is-hint-mark", state.hint?.type === "not-queen" && state.hint?.row === row && state.hint?.column === column);

  updateToken(token, displayValue);
}

function applyTool(row, column, tool) {
  if (!state.puzzle || state.loading || state.revealedBySystem) {
    return;
  }

  commitBoardChange(
    row,
    column,
    resolveToolValue(state.board[row][column], tool),
  );
}

function applyMobileTap(row, column) {
  if (!state.puzzle || state.loading || state.revealedBySystem) {
    return;
  }

  const current = state.board[row][column];
  let nextValue = CELL_STATE.MARK;

  if (current === CELL_STATE.MARK) {
    nextValue = CELL_STATE.QUEEN;
  } else if (current === CELL_STATE.QUEEN) {
    nextValue = CELL_STATE.EMPTY;
  }

  commitBoardChange(row, column, nextValue);
}

function resolveToolValue(current, tool) {
  if (tool === "queen") {
    return current === CELL_STATE.QUEEN ? CELL_STATE.EMPTY : CELL_STATE.QUEEN;
  }

  if (tool === "mark") {
    return current === CELL_STATE.MARK ? CELL_STATE.EMPTY : CELL_STATE.MARK;
  }

  return CELL_STATE.EMPTY;
}

function commitBoardChange(row, column, nextValue) {
  const current = state.board[row][column];

  if (nextValue === current) {
    return;
  }

  const previousAnalysis = state.analysis;
  const previousHint = state.hint;

  state.board[row][column] = nextValue;
  state.analysis = analyzePlayerBoard(state.puzzle, state.board);
  state.hint = null;

  renderStats();
  renderStatus();
  renderHint();
  renderBoard(
    collectAffectedCellKeys({
      cells: [[row, column]],
      previousAnalysis,
      nextAnalysis: state.analysis,
      previousHint,
      nextHint: state.hint,
    }),
  );
}

function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function updateText(elements, value) {
  for (const element of elements) {
    if (element.textContent !== value) {
      element.textContent = value;
    }
  }
}

function updateToken(token, displayValue) {
  const nextDisplay =
    displayValue === CELL_STATE.QUEEN
      ? "queen"
      : displayValue === CELL_STATE.MARK
        ? "mark"
        : "empty";

  if (token.dataset.display === nextDisplay) {
    return;
  }

  token.dataset.display = nextDisplay;
  token.classList.toggle("is-dot", nextDisplay === "mark");

  if (nextDisplay === "queen") {
    const image = document.createElement("img");
    image.className = "token-icon";
    image.src = QUEEN_ICON_PATH;
    image.alt = "";
    token.replaceChildren(image);
    return;
  }

  token.textContent = nextDisplay === "mark" ? "•" : "";
}

function collectAffectedCellKeys({
  cells = [],
  previousAnalysis = null,
  nextAnalysis = null,
  previousHint = null,
  nextHint = null,
}) {
  const affected = new Set();

  for (const [row, column] of cells) {
    affected.add(cellKey(row, column));
  }

  addConflictKeys(affected, previousAnalysis?.conflicts);
  addConflictKeys(affected, nextAnalysis?.conflicts);
  addHintKeys(affected, previousHint);
  addHintKeys(affected, nextHint);

  return affected;
}

function addConflictKeys(affected, conflicts) {
  if (!conflicts) {
    return;
  }

  for (const key of conflicts) {
    affected.add(key);
  }
}

function addHintKeys(affected, hint) {
  if (!hint) {
    return;
  }

  if (Number.isInteger(hint.row) && Number.isInteger(hint.column)) {
    affected.add(cellKey(hint.row, hint.column));
  }

  if (
    hint.blocker &&
    Number.isInteger(hint.blocker.row) &&
    Number.isInteger(hint.blocker.column)
  ) {
    affected.add(cellKey(hint.blocker.row, hint.blocker.column));
  }
}

function cellKey(row, column) {
  return `${row}:${column}`;
}
