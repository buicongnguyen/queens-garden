import {
  CELL_STATE,
  SUPPORTED_SIZES,
  analyzePlayerBoard,
  createFixedLevelPuzzle,
  createEmptyBoard,
  createRandomLevelPuzzle,
  findHint,
  formatSeed,
  getLevelCount,
  randomSeed,
  solutionBoard,
} from "./engine.js";

const QUEEN_ICON_PATH = "./assets/queen-token-192.png";
const CELL_GRID_LINE = "rgba(255, 255, 255, 0.42)";
const SCORE_STORAGE_KEY = "queens-garden-scores-v1";

const sizeSelect = document.querySelector("#size-select");
const boardElement = document.querySelector("#board");
const newGameButton = document.querySelector("#new-game-button");
const resetButton = document.querySelector("#reset-button");
const hintButton = document.querySelector("#hint-button");
const revealButton = document.querySelector("#reveal-button");
const settingsButton = document.querySelector("#settings-button");
const settingsLayer = document.querySelector("#settings-layer");
const settingsBackdrop = document.querySelector("#settings-backdrop");
const settingsCloseButton = document.querySelector("#settings-close-button");
const statusText = document.querySelector("#status-text");
const hintText = document.querySelector("#hint-text");
const sessionLabel = document.querySelector("[data-session-label]");
const timerLabel = document.querySelector("#timer-label");
const queensStats = [...document.querySelectorAll("[data-queens-stat]")];
const regionsStats = [...document.querySelectorAll("[data-regions-stat]")];
const conflictsStats = [...document.querySelectorAll("[data-conflicts-stat]")];
const seedLabels = [...document.querySelectorAll("[data-seed-label]")];
const toolButtons = [...document.querySelectorAll("[data-tool]")];
const levelSizeRow = document.querySelector("#level-size-row");
const levelGrid = document.querySelector("#level-grid");
const levelSelectionLabel = document.querySelector("#level-selection-label");
const playSelectedRandomButton = document.querySelector(
  "#play-selected-random-button",
);
const scoreSizeRow = document.querySelector("#score-size-row");
const scoreLevelGrid = document.querySelector("#score-level-grid");
const scoreFixedTotal = document.querySelector("#score-fixed-total");
const scoreRandomTotal = document.querySelector("#score-random-total");
const scoreSizeSummary = document.querySelector("#score-size-summary");
const scoreRandomBest = document.querySelector("#score-random-best");
const settingsTabButtons = [
  ...document.querySelectorAll("[data-settings-tab-button]"),
];
const settingsPanels = [...document.querySelectorAll("[data-settings-panel]")];
const mobileTapQuery = window.matchMedia("(max-width: 820px)");

const state = {
  puzzle: null,
  board: [],
  analysis: null,
  cellElements: [],
  tokenElements: [],
  warningElements: [],
  gesture: null,
  suppressClick: false,
  renderedPuzzleSeed: null,
  size: 7,
  mode: "random",
  levelIndex: null,
  levelPickerSize: 7,
  scoreSize: 7,
  activeTool: "queen",
  hint: null,
  mobileTapMode: mobileTapQuery.matches,
  loading: false,
  revealedBySystem: false,
  settingsOpen: false,
  settingsTab: "game",
  scoreData: loadScoreData(),
  clockStartedAt: 0,
  elapsedMs: 0,
  timerId: null,
  lastScoreSummary: null,
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

for (const button of settingsTabButtons) {
  button.addEventListener("click", () => {
    state.settingsTab = button.dataset.settingsTabButton;
    renderSettings();
  });
}

settingsButton.addEventListener("click", () => {
  setSettingsOpen(!state.settingsOpen);
});

settingsBackdrop.addEventListener("click", () => {
  setSettingsOpen(false);
});

settingsCloseButton.addEventListener("click", () => {
  setSettingsOpen(false);
});

levelSizeRow.addEventListener("click", (event) => {
  const button = event.target.closest("[data-level-size]");

  if (!button) {
    return;
  }

  state.levelPickerSize = Number(button.dataset.levelSize);
  renderLevelPicker();
});

levelGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-level-index]");

  if (!button) {
    return;
  }

  const size = Number(button.dataset.levelSize);
  const levelIndex = Number(button.dataset.levelIndex);
  state.levelPickerSize = size;
  state.scoreSize = size;
  maybeCloseSettingsOnMobile();
  void buildPuzzle(size, { mode: "fixed", levelIndex });
});

playSelectedRandomButton.addEventListener("click", () => {
  maybeCloseSettingsOnMobile();
  void buildPuzzle(state.levelPickerSize, { mode: "random" });
});

scoreSizeRow.addEventListener("click", (event) => {
  const button = event.target.closest("[data-score-size]");

  if (!button) {
    return;
  }

  state.scoreSize = Number(button.dataset.scoreSize);
  renderScores();
});

boardElement.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");

  if (!cell || !boardElement.contains(cell)) {
    return;
  }

  if (state.suppressClick) {
    state.suppressClick = false;
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

boardElement.addEventListener("pointerdown", (event) => {
  const cell = event.target.closest(".cell");

  if (!cell || !boardElement.contains(cell)) {
    return;
  }

  if (!state.puzzle || state.loading || state.revealedBySystem) {
    return;
  }

  const row = Number(cell.dataset.row);
  const column = Number(cell.dataset.column);
  const key = cellKey(row, column);

  if (!state.mobileTapMode && event.pointerType === "mouse" && event.button === 2) {
    event.preventDefault();
    boardElement.setPointerCapture(event.pointerId);
    state.gesture = {
      mode: "right-mark",
      pointerId: event.pointerId,
      startKey: key,
      lastKey: key,
      moved: false,
    };
    markDraggedCell(row, column);
  }
});

boardElement.addEventListener(
  "touchstart",
  (event) => {
    if (!state.mobileTapMode || !state.puzzle || state.loading || state.revealedBySystem) {
      return;
    }

    const touch = event.touches[0];
    const cell = event.target.closest(".cell");

    if (!touch || !cell || !boardElement.contains(cell)) {
      return;
    }

    state.gesture = {
      mode: "touch-mark",
      pointerId: touch.identifier,
      startKey: cellKey(Number(cell.dataset.row), Number(cell.dataset.column)),
      lastKey: cellKey(Number(cell.dataset.row), Number(cell.dataset.column)),
      moved: false,
    };
  },
  { passive: true },
);

boardElement.addEventListener("pointermove", (event) => {
  const gesture = state.gesture;

  if (!gesture || gesture.pointerId !== event.pointerId) {
    return;
  }

  const hoveredCell = document.elementFromPoint(
    event.clientX,
    event.clientY,
  )?.closest(".cell");

  if (!hoveredCell || !boardElement.contains(hoveredCell)) {
    return;
  }

  const row = Number(hoveredCell.dataset.row);
  const column = Number(hoveredCell.dataset.column);
  const key = cellKey(row, column);

  if (gesture.mode === "right-mark") {
    if (key === gesture.lastKey) {
      return;
    }

    gesture.moved = true;
    markCellsAlongPath(gesture.lastKey, key);
    gesture.lastKey = key;
  }
});

boardElement.addEventListener(
  "touchmove",
  (event) => {
    const gesture = state.gesture;

    if (!gesture || gesture.mode !== "touch-mark" || !state.mobileTapMode) {
      return;
    }

    const touch = [...event.changedTouches].find(
      (candidate) => candidate.identifier === gesture.pointerId,
    );

    if (!touch) {
      return;
    }

    const hoveredCell = document.elementFromPoint(
      touch.clientX,
      touch.clientY,
    )?.closest(".cell");

    if (!hoveredCell || !boardElement.contains(hoveredCell)) {
      return;
    }

    const row = Number(hoveredCell.dataset.row);
    const column = Number(hoveredCell.dataset.column);
    const key = cellKey(row, column);

    if (key === gesture.lastKey && gesture.moved) {
      return;
    }

    if (key !== gesture.startKey) {
      gesture.moved = true;
    }

    if (!gesture.moved) {
      return;
    }

    event.preventDefault();

    const fromKey = gesture.lastKey ?? gesture.startKey;
    markCellsAlongPath(fromKey, key);
    gesture.lastKey = key;
  },
  { passive: false },
);

boardElement.addEventListener("pointerup", finishGesture);
boardElement.addEventListener("pointercancel", finishGesture);
boardElement.addEventListener("lostpointercapture", finishGesture);
boardElement.addEventListener("touchend", finishTouchGesture, { passive: true });
boardElement.addEventListener("touchcancel", finishTouchGesture, { passive: true });

boardElement.addEventListener("contextmenu", (event) => {
  const cell = event.target.closest(".cell");

  if (!cell || !boardElement.contains(cell)) {
    return;
  }

  event.preventDefault();
});

newGameButton.addEventListener("click", () => {
  maybeCloseSettingsOnMobile();
  void buildPuzzle(state.size, { mode: "random" });
});

resetButton.addEventListener("click", () => {
  if (!state.puzzle || state.loading) {
    return;
  }

  state.gesture = null;
  state.suppressClick = false;
  state.board = createEmptyBoard(state.puzzle.size);
  state.analysis = analyzePlayerBoard(state.puzzle, state.board);
  state.hint = null;
  state.revealedBySystem = false;
  state.lastScoreSummary = null;
  restartTimer();
  render();
  maybeCloseSettingsOnMobile();
});

hintButton.addEventListener("click", () => {
  if (!state.puzzle || state.loading || state.revealedBySystem) {
    return;
  }

  const previousHint = state.hint;
  state.hint = findHint(state.puzzle, state.board, state.analysis);
  state.settingsTab = "status";
  renderHint();
  renderSettings();
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

  state.gesture = null;
  state.suppressClick = false;
  state.board = solutionBoard(state.puzzle);
  state.analysis = analyzePlayerBoard(state.puzzle, state.board);
  state.hint = null;
  state.revealedBySystem = true;
  state.lastScoreSummary = null;
  stopTimer();
  render();
  maybeCloseSettingsOnMobile();
});

sizeSelect.addEventListener("change", () => {
  state.size = Number(sizeSelect.value);
  state.levelPickerSize = state.size;
  state.scoreSize = state.size;
  maybeCloseSettingsOnMobile();
  void buildPuzzle(state.size, { mode: "random" });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.settingsOpen) {
    setSettingsOpen(false);
    return;
  }

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

void buildPuzzle(state.size, { mode: "random" });

function setSettingsOpen(nextOpen) {
  state.settingsOpen = nextOpen;
  renderSettings();
}

function maybeCloseSettingsOnMobile() {
  if (mobileTapQuery.matches) {
    setSettingsOpen(false);
  }
}

async function buildPuzzle(size, options = {}) {
  if (state.loading) {
    return;
  }

  const mode = options.mode === "fixed" ? "fixed" : "random";
  const levelIndex =
    mode === "fixed"
      ? clampLevelIndex(size, options.levelIndex ?? state.levelIndex ?? 1)
      : null;
  const seed = mode === "random" ? options.seed ?? randomSeed() : null;

  state.loading = true;
  state.size = size;
  state.mode = mode;
  state.levelIndex = levelIndex;
  state.levelPickerSize = size;
  state.scoreSize = size;
  state.gesture = null;
  state.hint = null;
  state.suppressClick = false;
  state.revealedBySystem = false;
  state.lastScoreSummary = null;
  state.puzzle = null;
  state.board = [];
  state.analysis = null;
  stopTimer();
  boardElement.classList.add("is-loading");
  boardElement.style.setProperty("--size", String(size));
  boardElement.replaceChildren();
  state.renderedPuzzleSeed = null;
  state.cellElements = [];
  state.tokenElements = [];
  state.warningElements = [];
  render();

  await nextFrame();

  try {
    state.puzzle =
      mode === "fixed"
        ? createFixedLevelPuzzle(size, levelIndex)
        : createRandomLevelPuzzle(size, seed);
    state.board = createEmptyBoard(size);
    state.analysis = analyzePlayerBoard(state.puzzle, state.board);
    restartTimer();
  } catch (error) {
    stopTimer();
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
  renderSessionMeta();
  renderStats();
  renderStatus();
  renderHint();
  renderLevelPicker();
  renderScores();
  renderSettings();

  if (!state.loading) {
    renderBoard();
  }

  sizeSelect.value = String(state.size);
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

function renderSessionMeta() {
  sessionLabel.textContent = getSessionLabel();
  timerLabel.textContent = formatDuration(state.elapsedMs);
}

function renderSettings() {
  settingsButton.setAttribute("aria-expanded", String(state.settingsOpen));
  settingsLayer.hidden = !state.settingsOpen;
  document.body.classList.toggle("has-settings-open", state.settingsOpen);

  for (const button of settingsTabButtons) {
    const isActive = button.dataset.settingsTabButton === state.settingsTab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  }

  for (const panel of settingsPanels) {
    panel.hidden = panel.dataset.settingsPanel !== state.settingsTab;
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
    statusText.textContent =
      state.mode === "fixed"
        ? "Loading a saved level..."
        : "Loading a saved random board...";
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
    const solvedText = `Solved in ${formatDuration(state.elapsedMs)}.`;
    const scoreText = describeScoreSummary(state.lastScoreSummary);
    statusText.textContent = scoreText ? `${solvedText} ${scoreText}` : solvedText;
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

  if (
    state.analysis.rowViolations.size > 0 ||
    state.analysis.columnViolations.size > 0
  ) {
    statusText.textContent =
      "A row or column is impossible right now. Clear some marks or extra queens so every line can still hold exactly one queen.";
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

function renderLevelPicker() {
  renderSizeChipRow(levelSizeRow, "level-size", state.levelPickerSize);

  const solvedCount = getFixedSolvedCountForSize(state.levelPickerSize);
  const levelCount = getLevelCount(state.levelPickerSize);
  const sizeLabel = `${state.levelPickerSize} x ${state.levelPickerSize}`;
  const currentLevelText =
    state.mode === "fixed" && state.size === state.levelPickerSize && state.levelIndex
      ? `Current level ${padLevel(state.levelIndex)}`
      : "Pick a fixed level to start.";
  levelSelectionLabel.textContent =
    `${sizeLabel} · ${solvedCount} / ${levelCount} cleared · ${currentLevelText}`;

  playSelectedRandomButton.textContent = `Play random ${sizeLabel}`;
  playSelectedRandomButton.classList.toggle(
    "primary",
    state.mode === "random" && state.size === state.levelPickerSize,
  );

  const fragment = document.createDocumentFragment();

  for (let levelIndex = 1; levelIndex <= levelCount; levelIndex += 1) {
    const bestMs = getFixedBestTime(state.levelPickerSize, levelIndex);
    const button = document.createElement("button");
    const label = document.createElement("span");
    const meta = document.createElement("span");
    const isCurrent =
      state.mode === "fixed" &&
      state.size === state.levelPickerSize &&
      state.levelIndex === levelIndex;

    button.type = "button";
    button.className = "level-button";
    button.dataset.levelSize = String(state.levelPickerSize);
    button.dataset.levelIndex = String(levelIndex);
    button.classList.toggle("is-current", isCurrent);
    button.classList.toggle("is-cleared", bestMs !== null);
    button.setAttribute(
      "aria-label",
      `Level ${levelIndex} for ${sizeLabel}${bestMs === null ? "" : `, best time ${formatDuration(bestMs)}`}`,
    );

    label.className = "level-button-label";
    label.textContent = `L${padLevel(levelIndex)}`;

    meta.className = "level-button-meta";
    meta.textContent = bestMs === null ? "Uncleared" : formatDuration(bestMs);

    button.append(label, meta);
    fragment.append(button);
  }

  levelGrid.replaceChildren(fragment);
}

function renderScores() {
  renderSizeChipRow(scoreSizeRow, "score-size", state.scoreSize);

  const fixedSolvedTotal = getFixedSolvedTotal();
  const fixedPossibleTotal = SUPPORTED_SIZES.reduce(
    (total, size) => total + getLevelCount(size),
    0,
  );
  const randomSolvedTotal = Object.keys(state.scoreData.random).length;
  const scoreLevelCount = getLevelCount(state.scoreSize);

  scoreFixedTotal.textContent = `${fixedSolvedTotal} / ${fixedPossibleTotal}`;
  scoreRandomTotal.textContent = String(randomSolvedTotal);
  scoreSizeSummary.textContent =
    `${state.scoreSize} x ${state.scoreSize} · ${getFixedSolvedCountForSize(state.scoreSize)} / ${scoreLevelCount}`;
  scoreRandomBest.textContent = formatBestTime(getRandomBestTime(state.scoreSize));

  const fragment = document.createDocumentFragment();

  for (let levelIndex = 1; levelIndex <= scoreLevelCount; levelIndex += 1) {
    const bestMs = getFixedBestTime(state.scoreSize, levelIndex);
    const card = document.createElement("article");
    const label = document.createElement("p");
    const value = document.createElement("p");
    const isCurrent =
      state.mode === "fixed" &&
      state.size === state.scoreSize &&
      state.levelIndex === levelIndex;

    card.className = "score-level-card";
    card.classList.toggle("is-cleared", bestMs !== null);
    card.classList.toggle("is-current", isCurrent);

    label.className = "score-level-label";
    label.textContent = `Level ${padLevel(levelIndex)}`;

    value.className = "score-level-value";
    value.textContent = bestMs === null ? "--" : formatDuration(bestMs);

    card.append(label, value);
    fragment.append(card);
  }

  scoreLevelGrid.replaceChildren(fragment);
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
  state.warningElements = Array.from({ length: state.puzzle.size }, () =>
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
      const hasTopBoundary = row === 0 || topRegion !== region;
      const hasRightBoundary =
        column === state.puzzle.size - 1 || rightRegion !== region;
      const hasBottomBoundary =
        row === state.puzzle.size - 1 || bottomRegion !== region;
      const hasLeftBoundary = column === 0 || leftRegion !== region;
      const cell = document.createElement("button");
      const warning = document.createElement("span");
      const token = document.createElement("span");

      cell.type = "button";
      cell.className = "cell";
      cell.dataset.row = String(row);
      cell.dataset.column = String(column);
      cell.style.setProperty("--tone", state.puzzle.palette[region]);
      cell.style.setProperty("--edge", state.puzzle.outlinePalette[region]);
      cell.style.setProperty("--stroke-top", hasTopBoundary ? "3px" : "1px");
      cell.style.setProperty(
        "--stroke-top-color",
        hasTopBoundary ? state.puzzle.outlinePalette[region] : CELL_GRID_LINE,
      );
      cell.style.setProperty("--stroke-right", hasRightBoundary ? "3px" : "1px");
      cell.style.setProperty(
        "--stroke-right-color",
        hasRightBoundary ? state.puzzle.outlinePalette[region] : CELL_GRID_LINE,
      );
      cell.style.setProperty(
        "--stroke-bottom",
        hasBottomBoundary ? "3px" : "1px",
      );
      cell.style.setProperty(
        "--stroke-bottom-color",
        hasBottomBoundary ? state.puzzle.outlinePalette[region] : CELL_GRID_LINE,
      );
      cell.style.setProperty("--stroke-left", hasLeftBoundary ? "3px" : "1px");
      cell.style.setProperty(
        "--stroke-left-color",
        hasLeftBoundary ? state.puzzle.outlinePalette[region] : CELL_GRID_LINE,
      );
      cell.style.setProperty("--delay", `${(row + column) * 18}ms`);
      cell.setAttribute(
        "aria-label",
        `Row ${row + 1}, column ${column + 1}, region ${region + 1}`,
      );

      warning.className = "warning-overlay";
      token.className = "token";
      cell.append(warning);
      cell.append(token);
      fragment.append(cell);

      state.cellElements[row][column] = cell;
      state.warningElements[row][column] = warning;
      state.tokenElements[row][column] = token;
    }
  }

  boardElement.replaceChildren(fragment);
  state.renderedPuzzleSeed = state.puzzle.seed;
}

function syncCell(row, column) {
  const cell = state.cellElements[row]?.[column];
  const warning = state.warningElements[row]?.[column];
  const token = state.tokenElements[row]?.[column];

  if (!cell || !warning || !token) {
    return;
  }

  const stateValue = state.board[row][column];
  const conflictKey = cellKey(row, column);
  const displayValue =
    state.revealedBySystem && state.puzzle.queens[row] === column
      ? CELL_STATE.QUEEN
      : stateValue;
  const hasLineViolation =
    Boolean(state.analysis?.rowViolations.has(row)) ||
    Boolean(state.analysis?.columnViolations.has(column));

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
  cell.classList.toggle(
    "is-hint-mark",
    state.hint?.type === "not-queen" &&
      state.hint?.row === row &&
      state.hint?.column === column,
  );
  warning.classList.toggle("is-visible", hasLineViolation);

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

function finishGesture(event) {
  const gesture = state.gesture;

  if (!gesture || gesture.pointerId !== event.pointerId) {
    return;
  }

  if (gesture.mode === "touch-mark" && gesture.moved) {
    state.suppressClick = true;
  }

  state.gesture = null;
}

function finishTouchGesture(event) {
  const gesture = state.gesture;

  if (!gesture || gesture.mode !== "touch-mark") {
    return;
  }

  const touch = [...event.changedTouches].find(
    (candidate) => candidate.identifier === gesture.pointerId,
  );

  if (!touch) {
    return;
  }

  if (gesture.moved) {
    state.suppressClick = true;
  }

  state.gesture = null;
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
  state.lastScoreSummary = null;

  if (!previousAnalysis?.solved && state.analysis.solved) {
    stopTimer();
    state.lastScoreSummary = recordBestTime();
  }

  renderSessionMeta();
  renderStats();
  renderStatus();
  renderHint();

  if (state.lastScoreSummary) {
    renderLevelPicker();
    renderScores();
  }

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

function markDraggedCell(row, column) {
  if (state.board[row][column] !== CELL_STATE.EMPTY) {
    return;
  }

  commitBoardChange(row, column, CELL_STATE.MARK);
}

function markCellsAlongPath(fromKey, toKey) {
  const [fromRowText, fromColumnText] = fromKey.split(":");
  const [toRowText, toColumnText] = toKey.split(":");
  const fromRow = Number(fromRowText);
  const fromColumn = Number(fromColumnText);
  const toRow = Number(toRowText);
  const toColumn = Number(toColumnText);
  const rowDistance = toRow - fromRow;
  const columnDistance = toColumn - fromColumn;
  const steps = Math.max(Math.abs(rowDistance), Math.abs(columnDistance), 1);

  for (let step = 0; step <= steps; step += 1) {
    const row = Math.round(fromRow + (rowDistance * step) / steps);
    const column = Math.round(fromColumn + (columnDistance * step) / steps);
    markDraggedCell(row, column);
  }
}

function renderSizeChipRow(container, dataName, activeSize) {
  const fragment = document.createDocumentFragment();

  for (const size of SUPPORTED_SIZES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "size-chip";
    button.setAttribute(`data-${dataName}`, String(size));
    button.classList.toggle("is-active", size === activeSize);
    button.setAttribute("aria-pressed", String(size === activeSize));
    button.textContent = `${size} x ${size}`;
    fragment.append(button);
  }

  container.replaceChildren(fragment);
}

function recordBestTime() {
  const elapsedMs = Math.max(0, Math.round(state.elapsedMs));

  if (state.mode === "fixed" && state.levelIndex) {
    const previousBest = getFixedBestTime(state.size, state.levelIndex);
    const didImprove = previousBest === null || elapsedMs < previousBest;

    if (didImprove) {
      const sizeKey = String(state.size);
      const levelKey = String(state.levelIndex);

      if (!state.scoreData.fixed[sizeKey]) {
        state.scoreData.fixed[sizeKey] = {};
      }

      state.scoreData.fixed[sizeKey][levelKey] = elapsedMs;
      persistScoreData();
    }

    return {
      mode: "fixed",
      size: state.size,
      levelIndex: state.levelIndex,
      elapsedMs,
      previousBest,
      didImprove,
    };
  }

  const previousBest = getRandomBestTime(state.size);
  const didImprove = previousBest === null || elapsedMs < previousBest;

  if (didImprove) {
    state.scoreData.random[String(state.size)] = elapsedMs;
    persistScoreData();
  }

  return {
    mode: "random",
    size: state.size,
    levelIndex: null,
    elapsedMs,
    previousBest,
    didImprove,
  };
}

function describeScoreSummary(summary) {
  if (!summary) {
    return "";
  }

  if (summary.mode === "fixed") {
    if (summary.previousBest === null) {
      return "First clear for this fixed level.";
    }

    if (summary.didImprove) {
      return "New best time for this fixed level.";
    }

    return `Best time stays ${formatDuration(summary.previousBest)}.`;
  }

  if (summary.previousBest === null) {
    return `First saved random record for ${summary.size} x ${summary.size}.`;
  }

  if (summary.didImprove) {
    return `New best random time for ${summary.size} x ${summary.size}.`;
  }

  return `Best random time stays ${formatDuration(summary.previousBest)}.`;
}

function getSessionLabel() {
  const sizeLabel = `${state.size} x ${state.size}`;
  const levelCount = getLevelCount(state.size);

  if (state.loading && state.mode === "fixed" && state.levelIndex) {
    return `Loading level ${padLevel(state.levelIndex)} / ${levelCount} · ${sizeLabel}`;
  }

  if (state.loading) {
    return `Loading random puzzle · ${sizeLabel}`;
  }

  if (state.mode === "fixed" && state.levelIndex) {
    return `Level ${padLevel(state.levelIndex)} / ${levelCount} · ${sizeLabel}`;
  }

  return `Random puzzle · ${sizeLabel}`;
}

function clampLevelIndex(size, levelIndex) {
  const safeIndex = Number(levelIndex);
  return Math.min(
    getLevelCount(size),
    Math.max(1, Number.isInteger(safeIndex) ? safeIndex : 1),
  );
}

function restartTimer() {
  stopTimer();
  state.elapsedMs = 0;
  state.clockStartedAt = performance.now();
  renderSessionMeta();
  state.timerId = window.setInterval(() => {
    state.elapsedMs = performance.now() - state.clockStartedAt;
    renderSessionMeta();
  }, 250);
}

function stopTimer() {
  if (state.timerId !== null) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }

  if (state.clockStartedAt) {
    state.elapsedMs = performance.now() - state.clockStartedAt;
  }

  state.clockStartedAt = 0;
  renderSessionMeta();
}

function getFixedBestTime(size, levelIndex) {
  return state.scoreData.fixed[String(size)]?.[String(levelIndex)] ?? null;
}

function getRandomBestTime(size) {
  return state.scoreData.random[String(size)] ?? null;
}

function getFixedSolvedCountForSize(size) {
  const saved = state.scoreData.fixed[String(size)] ?? {};
  const limit = getLevelCount(size);
  let solvedCount = 0;

  for (let levelIndex = 1; levelIndex <= limit; levelIndex += 1) {
    if (saved[String(levelIndex)] !== undefined) {
      solvedCount += 1;
    }
  }

  return solvedCount;
}

function getFixedSolvedTotal() {
  return SUPPORTED_SIZES.reduce(
    (total, size) => total + getFixedSolvedCountForSize(size),
    0,
  );
}

function loadScoreData() {
  try {
    const raw = window.localStorage.getItem(SCORE_STORAGE_KEY);

    if (!raw) {
      return createEmptyScoreData();
    }

    return normalizeScoreData(JSON.parse(raw));
  } catch {
    return createEmptyScoreData();
  }
}

function createEmptyScoreData() {
  return {
    fixed: {},
    random: {},
  };
}

function normalizeScoreData(candidate) {
  const normalized = createEmptyScoreData();

  if (!candidate || typeof candidate !== "object") {
    return normalized;
  }

  if (candidate.fixed && typeof candidate.fixed === "object") {
    for (const [sizeKey, levels] of Object.entries(candidate.fixed)) {
      if (!levels || typeof levels !== "object") {
        continue;
      }

      const nextLevels = {};

      for (const [levelKey, value] of Object.entries(levels)) {
        const safeValue = normalizeBestMs(value);

        if (safeValue !== null) {
          nextLevels[levelKey] = safeValue;
        }
      }

      if (Object.keys(nextLevels).length > 0) {
        normalized.fixed[sizeKey] = nextLevels;
      }
    }
  }

  if (candidate.random && typeof candidate.random === "object") {
    for (const [sizeKey, value] of Object.entries(candidate.random)) {
      const safeValue = normalizeBestMs(value);

      if (safeValue !== null) {
        normalized.random[sizeKey] = safeValue;
      }
    }
  }

  return normalized;
}

function normalizeBestMs(value) {
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.round(value);
}

function persistScoreData() {
  try {
    window.localStorage.setItem(
      SCORE_STORAGE_KEY,
      JSON.stringify(state.scoreData),
    );
  } catch {
    // Ignore storage failures so the puzzle still works in private browsing.
  }
}

function formatBestTime(value) {
  return value === null ? "--" : formatDuration(value);
}

function formatDuration(value) {
  const totalSeconds = Math.max(0, Math.floor(value / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function padLevel(levelIndex) {
  return String(levelIndex).padStart(2, "0");
}

function nextFrame() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
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
  addLineViolationKeys(affected, previousAnalysis);
  addLineViolationKeys(affected, nextAnalysis);
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

function addLineViolationKeys(affected, analysis) {
  if (!analysis || !state.puzzle) {
    return;
  }

  for (const row of analysis.rowViolations ?? []) {
    for (let column = 0; column < state.puzzle.size; column += 1) {
      affected.add(cellKey(row, column));
    }
  }

  for (const column of analysis.columnViolations ?? []) {
    for (let row = 0; row < state.puzzle.size; row += 1) {
      affected.add(cellKey(row, column));
    }
  }
}

function cellKey(row, column) {
  return `${row}:${column}`;
}
