import {
  CELL_STATE,
  SUPPORTED_SIZES,
  analyzePlayerBoard,
  createEmptyBoard,
  createPuzzle,
  formatSeed,
  randomSeed,
  solutionBoard,
} from "./engine.js";

const QUEEN_ICON_PATH = "./assets/queen-token-192.png";

const sizeSelect = document.querySelector("#size-select");
const boardElement = document.querySelector("#board");
const newGameButton = document.querySelector("#new-game-button");
const resetButton = document.querySelector("#reset-button");
const revealButton = document.querySelector("#reveal-button");
const statusText = document.querySelector("#status-text");
const queensStats = [...document.querySelectorAll("[data-queens-stat]")];
const regionsStats = [...document.querySelectorAll("[data-regions-stat]")];
const conflictsStats = [...document.querySelectorAll("[data-conflicts-stat]")];
const seedLabels = [...document.querySelectorAll("[data-seed-label]")];
const toolButtons = [...document.querySelectorAll("[data-tool]")];

const state = {
  puzzle: null,
  board: [],
  analysis: null,
  size: 7,
  activeTool: "queen",
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

newGameButton.addEventListener("click", () => {
  void buildPuzzle(state.size);
});

resetButton.addEventListener("click", () => {
  if (!state.puzzle || state.loading) {
    return;
  }

  state.board = createEmptyBoard(state.puzzle.size);
  state.analysis = analyzePlayerBoard(state.puzzle, state.board);
  state.revealedBySystem = false;
  render();
});

revealButton.addEventListener("click", () => {
  if (!state.puzzle || state.loading) {
    return;
  }

  state.board = solutionBoard(state.puzzle);
  state.analysis = analyzePlayerBoard(state.puzzle, state.board);
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

void buildPuzzle(state.size);

async function buildPuzzle(size) {
  if (state.loading) {
    return;
  }

  state.loading = true;
  state.size = size;
  state.revealedBySystem = false;
  boardElement.classList.add("is-loading");
  boardElement.style.setProperty("--size", String(size));
  boardElement.innerHTML = "";
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
  renderBoard();

  sizeSelect.disabled = state.loading;
  newGameButton.disabled = state.loading;
  resetButton.disabled = state.loading || !state.puzzle;
  revealButton.disabled = state.loading || !state.puzzle;
}

function renderTools() {
  for (const button of toolButtons) {
    const isActive = button.dataset.tool === state.activeTool;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
    button.disabled = state.loading;
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
      "Solution revealed. Reset to replay this board or create a new puzzle.";
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
    `Place ${remaining} more ${queenWord}. Use X marks to track cells that are no longer possible.`;
}

function renderBoard() {
  if (!state.puzzle) {
    return;
  }

  boardElement.classList.toggle("is-solved", Boolean(state.analysis?.solved));
  boardElement.style.setProperty("--size", String(state.puzzle.size));
  boardElement.replaceChildren();

  for (let row = 0; row < state.puzzle.size; row += 1) {
    for (let column = 0; column < state.puzzle.size; column += 1) {
      const cell = document.createElement("button");
      const region = state.puzzle.regions[row][column];
      const stateValue = state.board[row][column];
      const conflictKey = `${row}:${column}`;
      const displayValue =
        state.revealedBySystem && state.puzzle.queens[row] === column
          ? CELL_STATE.QUEEN
          : stateValue;

      cell.type = "button";
      cell.className = "cell";
      cell.style.setProperty("--tone", state.puzzle.palette[region]);
      cell.style.setProperty("--delay", `${(row + column) * 18}ms`);
      cell.setAttribute(
        "aria-label",
        `Row ${row + 1}, column ${column + 1}, region ${region + 1}`,
      );
      cell.disabled = state.loading || state.revealedBySystem;

      if (displayValue === CELL_STATE.QUEEN) {
        cell.classList.add("is-queen");
      } else if (displayValue === CELL_STATE.MARK) {
        cell.classList.add("is-mark");
      }

      if (state.analysis?.conflicts.has(conflictKey)) {
        cell.classList.add("is-conflict");
      }

      if (state.revealedBySystem) {
        cell.classList.add("is-revealed");
      }

      const token = document.createElement("span");
      token.className = "token";

      if (displayValue === CELL_STATE.QUEEN) {
        const image = document.createElement("img");
        image.className = "token-icon";
        image.src = QUEEN_ICON_PATH;
        image.alt = "";
        token.append(image);
      } else if (displayValue === CELL_STATE.MARK) {
        token.textContent = "X";
      }

      cell.append(token);

      cell.addEventListener("click", (event) => {
        const quickTool = event.shiftKey ? "mark" : state.activeTool;
        applyTool(row, column, quickTool);
      });

      cell.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        applyTool(row, column, "mark");
      });

      boardElement.append(cell);
    }
  }
}

function applyTool(row, column, tool) {
  if (!state.puzzle || state.loading || state.revealedBySystem) {
    return;
  }

  const current = state.board[row][column];

  if (tool === "queen") {
    state.board[row][column] =
      current === CELL_STATE.QUEEN ? CELL_STATE.EMPTY : CELL_STATE.QUEEN;
  } else if (tool === "mark") {
    state.board[row][column] =
      current === CELL_STATE.MARK ? CELL_STATE.EMPTY : CELL_STATE.MARK;
  } else {
    state.board[row][column] = CELL_STATE.EMPTY;
  }

  state.analysis = analyzePlayerBoard(state.puzzle, state.board);
  render();
}

function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function updateText(elements, value) {
  for (const element of elements) {
    element.textContent = value;
  }
}
