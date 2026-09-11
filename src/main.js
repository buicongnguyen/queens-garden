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
} from "./engine.js?v=0.2.5";
import {
  CELL_ACTIVATION_MODE,
  createEmptyScoreData,
  hasScrollableOverflow,
  mergeScoreData,
  normalizeScoreData,
  resolveCellActivation,
} from "./ui-logic.js?v=0.2.5";
import { createHistory, dailyChallenge, isRecordEligible } from "./play-session.js?v=0.3.0";
import { buildGardenScene, gardenGLTF } from "./garden-scene.js?v=0.4.0";

const history = createHistory();
const undoButton = document.querySelector("#undo-button");
const redoButton = document.querySelector("#redo-button");
const dailyButton = document.querySelector("#daily-button");
const nextButton = document.querySelector("#next-level-button");
const completion = document.querySelector("#completion-message");
const regionToggle = document.querySelector("#region-numbers");
const sceneDetails = document.querySelector("#garden-scene");
const sceneCanvas = document.querySelector("#scene-canvas");
const sceneAngle = document.querySelector("#scene-angle");
const exportButton = document.querySelector("#export-scene");
const sceneStatus = document.querySelector("#scene-status");

const QUEEN_ICON_PATH = "./assets/queen-token-real.png";
const CELL_GRID_LINE = "rgba(255, 255, 255, 0.42)";
const SCORE_STORAGE_KEY = "queens-garden-scores-v1";
const MOBILE_FINAL_MARK_GRACE_MS = 320;

const sizeSelect = document.querySelector("#size-select");
const boardElement = document.querySelector("#board");
const boardShell = document.querySelector(".board-shell");
const boardMessage = document.querySelector("#board-message");
const newGameButton = document.querySelector("#new-game-button");
const resetButton = document.querySelector("#reset-button");
const hintButton = document.querySelector("#hint-button");
const revealButton = document.querySelector("#reveal-button");
const settingsButton = document.querySelector("#settings-button");
const settingsLayer = document.querySelector("#settings-layer");
const settingsBackdrop = document.querySelector("#settings-backdrop");
const settingsDrawer = document.querySelector("#settings-drawer");
const settingsCloseButton = document.querySelector("#settings-close-button");
const helpToggleButton = document.querySelector("#help-toggle");
const helpToggleText = document.querySelector("#help-toggle-text");
const gameAnnouncer = document.querySelector("#game-announcer");
const statusText = document.querySelector("#status-text");
const hintText = document.querySelector("#hint-text");
const sessionLabel = document.querySelector("[data-session-label]");
const timerLabel = document.querySelector("#timer-label");
const queensStats = [...document.querySelectorAll("[data-queens-stat]")];
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
const settingsInertElements = [
  document.querySelector(".hero"),
  ...document.querySelectorAll(
    ".board-panel > :not(.settings-layer):not(#game-announcer)",
  ),
].filter(Boolean);
const SETTINGS_FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "select:not([disabled])",
  "input:not([disabled])",
  "summary",
  "[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");
const HELP_COPY = Object.freeze({
  vi: {
    text:
      "VI: Chạm để đánh dấu rồi đặt hậu; vuốt khi bảng vừa màn hình, cuộn bảng lớn. Chuột: bấm hoặc kéo phải. Chọn để chuyển EN.",
    title: "Switch instructions to English",
    lang: "vi",
  },
  en: {
    text:
      "EN: Tap to mark then place a queen; swipe when the board fits, scroll larger boards. Mouse: click or right-drag. Select for VI.",
    title: "Switch instructions to Vietnamese",
    lang: "en",
  },
});
const SCORE_LEVEL_COUNTS = Object.freeze(
  Object.fromEntries(
    SUPPORTED_SIZES.map((size) => [String(size), getLevelCount(size)]),
  ),
);

const state = {
  puzzle: null,
  board: [],
  analysis: null,
  cellElements: [],
  tokenElements: [],
  warningElements: [],
  pendingLineGrace: null,
  gesture: null,
  suppressClick: false,
  lastPointerType: null,
  renderedPuzzle: null,
  focusedCell: { row: 0, column: 0 },
  size: 7,
  mode: "random",
  levelIndex: null,
  levelPickerSize: 7,
  scoreSize: 7,
  activeTool: "queen",
  hint: null,
  helpLanguage: "en",
  loading: false,
  error: null,
  revealedBySystem: false,
  settingsOpen: false,
  settingsReturnFocus: null,
  settingsTab: "game",
  scoreData: loadScoreData(),
  clockStartedAt: 0,
  elapsedMs: 0,
  timerId: null,
  lastScoreSummary: null,
  assisted: false,
  dailyDate: null,
};

undoButton.addEventListener("click", () => travelHistory("undo"));
redoButton.addEventListener("click", () => travelHistory("redo"));
dailyButton.addEventListener("click", () => {
  const daily = dailyChallenge(new Date(), getLevelCount(7));
  void buildPuzzle(7, { mode: "daily", levelIndex: daily.levelIndex, dailyDate: daily.date });
});
nextButton.addEventListener("click", () => {
  if (state.mode === "fixed" && state.analysis?.solved && !state.revealedBySystem &&
      state.levelIndex < getLevelCount(state.size)) {
    void buildPuzzle(state.size, { mode: "fixed", levelIndex: state.levelIndex + 1 });
  }
});
regionToggle.addEventListener("change", () => {
  boardElement.classList.toggle("show-region-numbers", regionToggle.checked);
});
sceneDetails.addEventListener("toggle", renderGardenScene);
sceneAngle.addEventListener("input", renderGardenScene);
document.querySelector('#scene-detail').addEventListener('change', renderGardenScene);
exportButton.addEventListener("click", () => {
  if (!state.puzzle || state.loading || state.error) return;
  const data = gardenGLTF(buildGardenScene(state.puzzle, state.board));
  const blob = new Blob([JSON.stringify(data)], { type: "model/gltf+json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `queens-garden-${state.size}-${formatSeed(state.puzzle.seed)}.gltf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  sceneStatus.textContent = "Scene downloaded. In Blender: File → Import → glTF 2.0.";
});

let sceneCache, sceneCacheKey, rendererPromise, sceneRequest = 0;
async function renderGardenScene() {
  if (!sceneDetails.open || !state.puzzle || state.loading || state.error) return;
  const request = ++sceneRequest;
  const detail = document.querySelector('#scene-detail').checked;
  const key = detail ? 'queen-detail' : JSON.stringify([state.puzzle.regions, state.puzzle.palette, state.board]);
  if (sceneCacheKey !== key) {
    sceneCache = detail ? buildGardenScene({size: 1, regions: [[0]], palette: ['hsl(150 20% 25%)']}, [[1]]) : buildGardenScene(state.puzzle, state.board);
    sceneCacheKey = key;
  }
  let drawn = false;
  try {
    rendererPromise ??= import('./garden-renderer.js?v=0.4.0');
    const { drawGarden } = await rendererPromise;
    if (request !== sceneRequest || !sceneDetails.open) return;
    drawn = drawGarden(sceneCanvas, sceneCache, Number(sceneAngle.value));
  } catch { rendererPromise = null; }
  sceneStatus.textContent = drawn
    ? (detail ? "Queen model study. Download still exports your current game position only." : "Current position only. Rotate the view, or download it to edit in Blender.")
    : "Preview unavailable. You can still download the scene for Blender.";
}

function travelHistory(direction) {
  if (!canEditBoard()) return;
  cancelActiveGesture();
  const board = history[direction](state.board);
  if (!board) return;
  clearPendingLineGrace();
  state.board = board;
  state.analysis = analyzePlayerBoard(state.puzzle, board);
  state.hint = null;
  state.lastScoreSummary = null;
  render();
}

function finishHistoryGesture(gesture) {
  if (gesture?.beforeBoard) history.record(gesture.beforeBoard, state.board);
  renderControlStates();
}

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
    closeSettingsForGameAction();
  });
}

for (const button of settingsTabButtons) {
  button.addEventListener("click", () => {
    activateSettingsTab(button.dataset.settingsTabButton, { focus: false });
  });

  button.addEventListener("keydown", (event) => {
    handleSettingsTabKeydown(event, button);
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

helpToggleButton.addEventListener("click", () => {
  toggleHelpLanguage();
});

levelSizeRow.addEventListener("click", (event) => {
  const button = event.target.closest("[data-level-size]");

  if (!button) {
    return;
  }

  state.levelPickerSize = Number(button.dataset.levelSize);
  renderLevelPicker();
  levelSizeRow
    .querySelector(`[data-level-size="${state.levelPickerSize}"]`)
    ?.focus();
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
  closeSettingsForGameAction();
  void buildPuzzle(size, { mode: "fixed", levelIndex });
});

playSelectedRandomButton.addEventListener("click", () => {
  closeSettingsForGameAction();
  void buildPuzzle(state.levelPickerSize, { mode: "random" });
});

scoreSizeRow.addEventListener("click", (event) => {
  const button = event.target.closest("[data-score-size]");

  if (!button) {
    return;
  }

  state.scoreSize = Number(button.dataset.scoreSize);
  renderScores();
  scoreSizeRow.querySelector(`[data-score-size="${state.scoreSize}"]`)?.focus();
});

boardElement.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");

  if (!cell || !boardElement.contains(cell)) {
    return;
  }

  if (state.suppressClick && event.detail > 0) {
    state.suppressClick = false;
    state.lastPointerType = null;
    return;
  }

  state.suppressClick = false;

  const row = Number(cell.dataset.row);
  const column = Number(cell.dataset.column);
  const pointerType = state.lastPointerType;
  state.lastPointerType = null;
  setFocusedCell(row, column);

  const activation = resolveCellActivation({
    eventDetail: event.detail,
    pointerType,
    shiftKey: event.shiftKey,
    activeTool: state.activeTool,
  });

  if (activation.mode === CELL_ACTIVATION_MODE.TOUCH_CYCLE) {
    applyMobileTap(row, column);
    return;
  }

  applyTool(row, column, activation.tool);
});

boardElement.addEventListener("keydown", handleBoardKeydown);

boardElement.addEventListener("pointerdown", (event) => {
  const cell = event.target.closest(".cell");

  if (!cell || !boardElement.contains(cell)) {
    return;
  }

  state.suppressClick = false;
  state.lastPointerType = event.pointerType;

  if (!canEditBoard()) {
    return;
  }

  const row = Number(cell.dataset.row);
  const column = Number(cell.dataset.column);
  const key = cellKey(row, column);

  if (event.pointerType === "mouse" && event.button === 2) {
    event.preventDefault();
    boardElement.setPointerCapture(event.pointerId);
    state.gesture = {
      mode: "right-mark",
      beforeBoard: state.board.map(row => [...row]),
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
    state.suppressClick = false;
    state.lastPointerType = "touch";

    if (!canEditBoard()) {
      return;
    }

    if (event.touches.length !== 1) {
      cancelGestureForMultiTouch();
      return;
    }

    const touch = event.changedTouches[0] ?? event.touches[0];
    const cell = event.target.closest(".cell");

    if (!touch || !cell || !boardElement.contains(cell)) {
      return;
    }

    state.gesture = {
      mode: boardElement.classList.contains("is-scrollable")
        ? "touch-scroll"
        : "touch-mark",
      pointerId: touch.identifier,
      startKey: cellKey(Number(cell.dataset.row), Number(cell.dataset.column)),
      lastKey: cellKey(Number(cell.dataset.row), Number(cell.dataset.column)),
      startClientX: touch.clientX,
      startClientY: touch.clientY,
      moved: false,
      changedKeys: new Set(),
      beforeBoard: state.board.map(row => [...row]),
      previousHint: state.hint,
    };
  },
  { passive: true },
);

boardElement.addEventListener("pointermove", (event) => {
  const gesture = state.gesture;

  if (!gesture || gesture.pointerId !== event.pointerId) {
    return;
  }

  if (gesture.mode === "right-mark" && (event.buttons & 2) === 0) {
    cancelActiveGesture();
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

    if (
      !gesture ||
      (gesture.mode !== "touch-mark" && gesture.mode !== "touch-scroll")
    ) {
      return;
    }

    if (event.touches.length !== 1) {
      cancelGestureForMultiTouch();
      return;
    }

    const touch = [...event.changedTouches].find(
      (candidate) => candidate.identifier === gesture.pointerId,
    );

    if (!touch) {
      return;
    }

    if (gesture.mode === "touch-scroll") {
      if (
        Math.abs(touch.clientX - gesture.startClientX) > 8 ||
        Math.abs(touch.clientY - gesture.startClientY) > 8
      ) {
        gesture.moved = true;
      }

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
window.addEventListener("blur", cancelActiveGesture);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    cancelActiveGesture();
  }
});
window.addEventListener("resize", syncBoardOverflowMode);

if ("ResizeObserver" in globalThis) {
  const boardResizeObserver = new ResizeObserver(syncBoardOverflowMode);
  boardResizeObserver.observe(boardShell);
  boardResizeObserver.observe(boardElement);
}

boardElement.addEventListener("contextmenu", (event) => {
  const cell = event.target.closest(".cell");

  if (!cell || !boardElement.contains(cell)) {
    return;
  }

  event.preventDefault();
});

newGameButton.addEventListener("click", () => {
  closeSettingsForGameAction();
  void buildPuzzle(state.size, { mode: "random" });
});

resetButton.addEventListener("click", () => {
  if (!state.puzzle || !state.analysis || state.loading || state.error) {
    return;
  }

  clearPendingLineGrace();
  state.gesture = null;
  state.suppressClick = false;
  state.board = createEmptyBoard(state.puzzle.size);
  state.analysis = analyzePlayerBoard(state.puzzle, state.board);
  state.hint = null;
  state.revealedBySystem = false;
  state.lastScoreSummary = null;
  state.assisted = false;
  history.clear();
  restartTimer();
  render();
  closeSettingsForGameAction();
});

hintButton.addEventListener("click", () => {
  if (
    !state.puzzle ||
    state.loading ||
    state.error ||
    state.revealedBySystem ||
    state.analysis?.solved ||
    hasPendingLineGrace()
  ) {
    return;
  }

  const previousHint = state.hint;
  state.assisted = true;
  renderSessionMeta();
  state.hint = findHint(state.puzzle, state.board, state.analysis);
  activateSettingsTab("status", { focus: true });
  renderHint();
  renderBoard(
    collectAffectedCellKeys({
      previousHint,
      nextHint: state.hint,
    }),
  );
});

revealButton.addEventListener("click", () => {
  if (!state.puzzle || state.loading || state.error || state.analysis?.solved) {
    return;
  }

  clearPendingLineGrace();
  state.gesture = null;
  state.suppressClick = false;
  state.board = solutionBoard(state.puzzle);
  state.analysis = analyzePlayerBoard(state.puzzle, state.board);
  state.hint = null;
  state.revealedBySystem = true;
  history.clear();
  state.lastScoreSummary = null;
  stopTimer();
  render();
  closeSettingsForGameAction();
});

sizeSelect.addEventListener("change", () => {
  state.size = Number(sizeSelect.value);
  state.levelPickerSize = state.size;
  state.scoreSize = state.size;
  closeSettingsForGameAction();
  void buildPuzzle(state.size, { mode: "random" });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.settingsOpen) {
    event.preventDefault();
    setSettingsOpen(false);
    return;
  }

  if (
    state.settingsOpen &&
    event.key === "Tab" &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    trapSettingsFocus(event);
    return;
  }

  if (state.settingsOpen || event.altKey || event.ctrlKey || event.metaKey) {
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

window.addEventListener("storage", (event) => {
  if (event.key !== SCORE_STORAGE_KEY) {
    return;
  }

  try {
    const incoming = parseScoreData(event.newValue);
    const merged = mergeScoreData(
      SCORE_LEVEL_COUNTS,
      state.scoreData,
      incoming,
    );
    const needsConvergence =
      JSON.stringify(merged) !== JSON.stringify(incoming);

    state.scoreData = merged;
    renderScoreViewsPreservingFocus();

    if (needsConvergence) {
      void persistScoreData();
    }
  } catch {
    // Ignore malformed writes from another tab.
  }
});

void buildPuzzle(state.size, { mode: "random" });

function setSettingsOpen(nextOpen) {
  const shouldOpen = Boolean(nextOpen);

  if (state.settingsOpen === shouldOpen) {
    return;
  }

  if (shouldOpen) {
    state.settingsReturnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : settingsButton;
  }

  state.settingsOpen = shouldOpen;
  renderSettings();

  if (shouldOpen) {
    settingsCloseButton.focus();
    return;
  }

  const returnFocus = state.settingsReturnFocus;
  state.settingsReturnFocus = null;

  if (returnFocus instanceof HTMLElement && returnFocus.isConnected) {
    returnFocus.focus();
  } else {
    settingsButton.focus();
  }
}

function activateSettingsTab(tabName, options = {}) {
  if (!settingsTabButtons.some((button) => button.dataset.settingsTabButton === tabName)) {
    return;
  }

  state.settingsTab = tabName;
  renderSettings();

  if (options.focus) {
    settingsTabButtons
      .find((button) => button.dataset.settingsTabButton === tabName)
      ?.focus();
  }
}

function handleSettingsTabKeydown(event, currentButton) {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  const handledKeys = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

  if (!handledKeys.has(event.key)) {
    return;
  }

  event.preventDefault();
  const currentIndex = settingsTabButtons.indexOf(currentButton);
  let nextIndex = currentIndex;

  if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = settingsTabButtons.length - 1;
  } else {
    const direction = event.key === "ArrowRight" ? 1 : -1;
    nextIndex = (currentIndex + direction + settingsTabButtons.length) % settingsTabButtons.length;
  }

  activateSettingsTab(settingsTabButtons[nextIndex].dataset.settingsTabButton, {
    focus: true,
  });
}

function trapSettingsFocus(event) {
  const focusable = [...settingsDrawer.querySelectorAll(SETTINGS_FOCUSABLE_SELECTOR)].filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.closest("[hidden]") &&
      element.getClientRects().length > 0,
  );

  if (focusable.length === 0) {
    event.preventDefault();
    settingsDrawer.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  } else if (!settingsDrawer.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
  }
}

function toggleHelpLanguage() {
  state.helpLanguage = state.helpLanguage === "vi" ? "en" : "vi";
  renderHelpToggle();
  requestAnimationFrame(syncBoardOverflowMode);
}

function renderScoreViewsPreservingFocus() {
  const focusTarget = captureDynamicSettingsFocus();
  renderLevelPicker();
  renderScores();
  restoreDynamicSettingsFocus(focusTarget);
}

function captureDynamicSettingsFocus() {
  if (!state.settingsOpen || !(document.activeElement instanceof HTMLElement)) {
    return null;
  }

  const activeElement = document.activeElement;

  if (activeElement.matches("[data-level-index]")) {
    return {
      kind: "level",
      size: activeElement.dataset.levelSize,
      index: activeElement.dataset.levelIndex,
    };
  }

  if (activeElement.matches("[data-level-size]")) {
    return {
      kind: "level-size",
      size: activeElement.dataset.levelSize,
    };
  }

  if (activeElement.matches("[data-score-size]")) {
    return {
      kind: "score-size",
      size: activeElement.dataset.scoreSize,
    };
  }

  return null;
}

function restoreDynamicSettingsFocus(target) {
  if (!target || !state.settingsOpen) {
    return;
  }

  let element = null;

  if (target.kind === "level") {
    element = [...levelGrid.querySelectorAll("[data-level-index]")].find(
      (candidate) =>
        candidate.dataset.levelSize === target.size &&
        candidate.dataset.levelIndex === target.index,
    );
  } else if (target.kind === "level-size") {
    element = [...levelSizeRow.querySelectorAll("[data-level-size]")].find(
      (candidate) => candidate.dataset.levelSize === target.size,
    );
  } else if (target.kind === "score-size") {
    element = [...scoreSizeRow.querySelectorAll("[data-score-size]")].find(
      (candidate) => candidate.dataset.scoreSize === target.size,
    );
  }

  element?.focus();
}

function closeSettingsForGameAction() {
  if (state.settingsOpen) {
    setSettingsOpen(false);
  }
}

async function buildPuzzle(size, options = {}) {
  if (state.loading) {
    return;
  }

  const mode = ["fixed", "daily"].includes(options.mode) ? options.mode : "random";
  const levelIndex =
    mode !== "random"
      ? clampLevelIndex(size, options.levelIndex ?? state.levelIndex ?? 1)
      : null;
  const seed = mode === "random" ? options.seed ?? randomSeed() : null;

  state.loading = true;
  state.error = null;
  state.size = size;
  state.mode = mode;
  state.dailyDate = mode === "daily" ? options.dailyDate : null;
  state.assisted = false;
  history.clear();
  state.levelIndex = levelIndex;
  state.levelPickerSize = size;
  state.scoreSize = size;
  clearPendingLineGrace();
  state.gesture = null;
  state.hint = null;
  state.suppressClick = false;
  state.lastPointerType = null;
  state.focusedCell = { row: 0, column: 0 };
  state.revealedBySystem = false;
  state.lastScoreSummary = null;
  state.puzzle = null;
  state.board = [];
  state.analysis = null;
  stopTimer();
  state.elapsedMs = 0;
  state.clockStartedAt = 0;
  boardElement.classList.add("is-loading");
  boardElement.style.setProperty("--size", String(size));
  boardElement.replaceChildren();
  state.renderedPuzzle = null;
  state.cellElements = [];
  state.tokenElements = [];
  state.warningElements = [];
  render();

  await nextFrame();

  try {
    state.puzzle =
      mode !== "random"
        ? createFixedLevelPuzzle(size, levelIndex)
        : createRandomLevelPuzzle(size, seed);
    state.board = createEmptyBoard(size);
    state.analysis = analyzePlayerBoard(state.puzzle, state.board);
  } catch (error) {
    stopTimer();
    state.puzzle = null;
    state.board = [];
    state.analysis = null;
    state.error =
      error instanceof Error ? error.message : "Unable to create puzzle.";
  } finally {
    state.loading = false;
    boardElement.classList.remove("is-loading");
    render();
    if (!state.error) restartTimer();
  }
}

function render() {
  boardElement.setAttribute("aria-busy", String(state.loading));
  boardElement.classList.toggle("is-unavailable", Boolean(state.error));
  boardMessage.hidden = !state.error;
  boardMessage.textContent = state.error
    ? `Unable to create the puzzle. ${state.error} Choose another puzzle from Menu to retry.`
    : "";
  renderTools();
  renderSessionMeta();
  renderHelpToggle();
  renderStats();
  renderStatus();
  renderHint();
  renderLevelPicker();
  renderScores();
  renderSettings();

  if (!state.loading) {
    renderBoard();
  }

  renderControlStates();
}

function renderControlStates() {
  const isFinished = Boolean(state.analysis?.solved || state.revealedBySystem);
  const unavailable = state.loading || !state.puzzle || !state.analysis || Boolean(state.error);
  undoButton.disabled = unavailable || isFinished || !history.canUndo;
  redoButton.disabled = unavailable || isFinished || !history.canRedo;
  dailyButton.disabled = state.loading;
  exportButton.disabled = unavailable;
  nextButton.hidden = state.mode !== "fixed" || !state.analysis?.solved || state.revealedBySystem;
  nextButton.disabled = unavailable || state.levelIndex >= getLevelCount(state.size);
  nextButton.textContent = state.levelIndex >= getLevelCount(state.size) ? "Last level reached" : "Next level";
  completion.hidden = !state.analysis?.solved;
  completion.textContent = state.revealedBySystem ? "Solution revealed · practice only"
    : state.analysis?.solved ? `Garden complete · ${formatDuration(state.elapsedMs)}${state.assisted ? " · assisted" : ""}` : "";

  sizeSelect.value = String(state.size);
  sizeSelect.disabled = state.loading;
  newGameButton.disabled = state.loading;
  resetButton.disabled =
    state.loading || !state.puzzle || !state.analysis || Boolean(state.error);
  hintButton.disabled =
    state.loading ||
    !state.puzzle ||
    !state.analysis ||
    Boolean(state.error) ||
    isFinished ||
    hasPendingLineGrace();
  revealButton.disabled =
    state.loading ||
    !state.puzzle ||
    !state.analysis ||
    Boolean(state.error) ||
    isFinished;
}

function renderTools() {
  const isFinished = Boolean(state.analysis?.solved || state.revealedBySystem);

  for (const button of toolButtons) {
    const isActive = button.dataset.tool === state.activeTool;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
    button.disabled =
      state.loading ||
      !state.puzzle ||
      !state.analysis ||
      Boolean(state.error) ||
      isFinished;
  }
}

function renderSessionMeta() {
  sessionLabel.textContent = getSessionLabel() + (state.assisted ? " · assisted" : "");
  timerLabel.textContent = formatDuration(state.elapsedMs);
}

function renderHelpToggle() {
  const copy = HELP_COPY[state.helpLanguage] ?? HELP_COPY.vi;
  helpToggleText.textContent = copy.text;
  helpToggleText.setAttribute("lang", copy.lang);
  helpToggleButton.title = copy.title;
}

function renderSettings() {
  settingsButton.setAttribute("aria-expanded", String(state.settingsOpen));
  settingsLayer.hidden = !state.settingsOpen;
  document.body.classList.toggle("has-settings-open", state.settingsOpen);

  for (const element of settingsInertElements) {
    element.toggleAttribute("inert", state.settingsOpen);
  }

  for (const button of settingsTabButtons) {
    const isActive = button.dataset.settingsTabButton === state.settingsTab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  }

  for (const panel of settingsPanels) {
    panel.hidden = panel.dataset.settingsPanel !== state.settingsTab;
  }
  renderGardenScene();
}

function renderStats() {
  if (!state.puzzle || !state.analysis) {
    updateText(queensStats, "0 / 0");
    updateText(conflictsStats, "0");
    updateText(seedLabels, "Seed: --");
    return;
  }

  updateText(
    queensStats,
    `${state.analysis.queenCount} / ${state.puzzle.size}`,
  );
  updateText(conflictsStats, String(state.analysis.conflicts.size));
  updateText(seedLabels, `Seed: ${formatSeed(state.puzzle.seed)}`);
}

function renderStatus() {
  if (state.loading) {
    updateStatus(
      state.mode === "fixed"
        ? "Loading a saved level..."
        : "Loading a saved random board...",
    );
    return;
  }

  if (state.error) {
    updateStatus(`Unable to create the puzzle. ${state.error}`);
    return;
  }

  if (!state.puzzle || !state.analysis) {
    updateStatus("No puzzle loaded yet.");
    return;
  }

  if (state.revealedBySystem) {
    updateStatus(
      "Game ended. Every queen is revealed now. Reset to replay this board or create a new puzzle.",
    );
    return;
  }

  if (state.analysis.solved) {
    const solvedText = `Solved in ${formatDuration(state.elapsedMs)}.`;
    if (state.assisted || state.mode === "daily") {
      updateStatus(`${solvedText} ${state.assisted ? "Assisted practice: no best-time record." : "Daily garden complete. Come back tomorrow (UTC)."}`);
      return;
    }
    const scoreText = describeScoreSummary(state.lastScoreSummary);
    updateStatus(scoreText ? `${solvedText} ${scoreText}` : solvedText);
    return;
  }

  if (state.analysis.conflicts.size > 0) {
    const conflictWord =
      state.analysis.conflicts.size === 1 ? "conflict" : "conflicts";
    updateStatus(
      `${state.analysis.conflicts.size} ${conflictWord} detected. ` +
        "Queens cannot share a row, column, region, or touching diagonal.",
    );
    return;
  }

  if (hasPendingLineGrace()) {
    updateStatus(
      "Tap that last dot again to turn it into a queen, or pause a moment to confirm the line warning.",
    );
    return;
  }

  if (hasVisiblePlacementViolations(state.analysis)) {
    updateStatus(
      "A row, column, or colored region is impossible right now. Clear some marks or extra queens so every group can still hold exactly one queen.",
    );
    return;
  }

  const remaining = state.puzzle.size - state.analysis.queenCount;
  const queenWord = remaining === 1 ? "queen" : "queens";
  updateStatus(
    `Place ${remaining} more ${queenWord}. Use marks to track cells that are no longer possible.`,
  );
}

function renderHint() {
  if (state.loading) {
    hintText.textContent =
      "Hint waits for the next board. Once the puzzle loads, it will inspect your queens and marks.";
    return;
  }

  if (state.error) {
    hintText.textContent = "Fix the puzzle-loading error before requesting a hint.";
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

  if (state.analysis?.solved) {
    hintText.textContent = "Puzzle solved. Reset or start a new puzzle to play again.";
    return;
  }

  if (hasPendingLineGrace()) {
    hintText.textContent =
      "Hint waits for that last mobile tap. Tap the same cell again to place the queen, or wait for the line warning to appear.";
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
  playSelectedRandomButton.disabled = state.loading;
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
    button.disabled = state.loading;
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
  boardElement.style.setProperty(
    "--minimum-board-width",
    `${state.puzzle.size * 26}px`,
  );

  if (cellKeys instanceof Set) {
    for (const key of cellKeys) {
      syncCellByKey(key);
    }
    syncBoardOverflowMode();
    return;
  }

  for (let row = 0; row < state.puzzle.size; row += 1) {
    for (let column = 0; column < state.puzzle.size; column += 1) {
      syncCell(row, column);
    }
  }

  syncBoardOverflowMode();
}

function syncBoardOverflowMode() {
  const isScrollable =
    Boolean(state.puzzle) &&
    hasScrollableOverflow({
      scrollWidth: boardShell.scrollWidth,
      clientWidth: boardShell.clientWidth,
      scrollHeight: boardShell.scrollHeight,
      clientHeight: boardShell.clientHeight,
    });

  boardElement.classList.toggle("is-scrollable", isScrollable);
}

function syncCellByKey(key) {
  const [rowText, columnText] = key.split(":");
  syncCell(Number(rowText), Number(columnText));
}

function ensureBoardStructure() {
  if (
    state.renderedPuzzle === state.puzzle &&
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
  state.focusedCell = {
    row: Math.min(state.focusedCell.row, state.puzzle.size - 1),
    column: Math.min(state.focusedCell.column, state.puzzle.size - 1),
  };
  boardElement.setAttribute("aria-rowcount", String(state.puzzle.size));
  boardElement.setAttribute("aria-colcount", String(state.puzzle.size));

  for (let row = 0; row < state.puzzle.size; row += 1) {
    const boardRowElement = document.createElement("div");
    boardRowElement.className = "board-row";
    boardRowElement.setAttribute("role", "row");
    boardRowElement.setAttribute("aria-rowindex", String(row + 1));

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
      const regionLabel = document.createElement("span");
      regionLabel.className = "region-number";
      regionLabel.textContent = String(region + 1);
      regionLabel.setAttribute("aria-hidden", "true");

      cell.type = "button";
      cell.className = "cell";
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-rowindex", String(row + 1));
      cell.setAttribute("aria-colindex", String(column + 1));
      cell.dataset.row = String(row);
      cell.dataset.column = String(column);
      cell.dataset.region = String(region);
      cell.tabIndex =
        row === state.focusedCell.row && column === state.focusedCell.column ? 0 : -1;
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
      cell.append(regionLabel);
      boardRowElement.append(cell);

      state.cellElements[row][column] = cell;
      state.warningElements[row][column] = warning;
      state.tokenElements[row][column] = token;
    }

    fragment.append(boardRowElement);
  }

  boardElement.replaceChildren(fragment);
  state.renderedPuzzle = state.puzzle;
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
  const region = state.puzzle.regions[row][column];
  const displayValue =
    state.revealedBySystem && state.puzzle.queens[row] === column
      ? CELL_STATE.QUEEN
      : stateValue;
  const hasLineViolation =
    isVisibleRowViolation(row, state.analysis) ||
    isVisibleColumnViolation(column, state.analysis) ||
    isVisibleRegionViolation(region, state.analysis);
  const hasConflict = Boolean(state.analysis?.conflicts.has(conflictKey));
  const isHintTarget = state.hint?.row === row && state.hint?.column === column;
  const isHintSource =
    state.hint?.blocker?.row === row && state.hint?.blocker?.column === column;
  const isHintMark = state.hint?.type === "not-queen" && isHintTarget;

  const isReadOnly = state.revealedBySystem || Boolean(state.analysis?.solved);
  cell.disabled = state.loading;
  cell.setAttribute("aria-disabled", String(state.loading || isReadOnly));
  cell.classList.toggle("is-queen", displayValue === CELL_STATE.QUEEN);
  cell.classList.toggle("is-mark", displayValue === CELL_STATE.MARK);
  cell.classList.toggle("is-conflict", hasConflict);
  cell.classList.toggle("is-revealed", state.revealedBySystem);
  cell.classList.toggle("is-hint-target", isHintTarget);
  cell.classList.toggle("is-hint-source", isHintSource);
  cell.classList.toggle("is-hint-mark", isHintMark);
  warning.classList.toggle("is-visible", hasLineViolation);
  cell.setAttribute("aria-invalid", String(hasConflict || hasLineViolation));
  cell.setAttribute(
    "aria-label",
    describeCellState({
      row,
      column,
      region,
      displayValue,
      hasConflict,
      hasLineViolation,
      isHintTarget,
      isHintSource,
    }),
  );

  updateToken(token, displayValue);
}

function canEditBoard() {
  return Boolean(
    state.puzzle &&
      state.analysis &&
      !state.loading &&
      !state.error &&
      !state.revealedBySystem &&
      !state.analysis.solved,
  );
}

function describeCellState({
  row,
  column,
  region,
  displayValue,
  hasConflict,
  hasLineViolation,
  isHintTarget,
  isHintSource,
}) {
  const valueLabel =
    displayValue === CELL_STATE.QUEEN
      ? state.revealedBySystem
        ? "revealed queen"
        : "queen"
      : displayValue === CELL_STATE.MARK
        ? "marked"
        : "empty";
  const details = [];

  if (hasConflict) {
    details.push("conflict");
  }

  if (hasLineViolation) {
    details.push("part of an impossible row, column, or region");
  }

  if (isHintTarget) {
    details.push(state.hint?.type === "must-queen" ? "hint: place a queen" : "hint target");
  }

  if (isHintSource) {
    details.push("hint source");
  }

  return [
    `Row ${row + 1}, column ${column + 1}, region ${region + 1}`,
    valueLabel,
    ...details,
  ].join(", ");
}

function handleBoardKeydown(event) {
  const cell = event.target.closest(".cell");

  if (!cell || !boardElement.contains(cell)) {
    return;
  }

  if (event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  const row = Number(cell.dataset.row);
  const column = Number(cell.dataset.column);
  let nextRow = row;
  let nextColumn = column;

  if (event.key === "ArrowUp") {
    nextRow -= 1;
  } else if (event.key === "ArrowDown") {
    nextRow += 1;
  } else if (event.key === "ArrowLeft") {
    nextColumn -= 1;
  } else if (event.key === "ArrowRight") {
    nextColumn += 1;
  } else if (event.key === "Home") {
    nextColumn = 0;
  } else if (event.key === "End") {
    nextColumn = state.puzzle.size - 1;
  } else {
    return;
  }

  event.preventDefault();
  setFocusedCell(
    Math.min(state.puzzle.size - 1, Math.max(0, nextRow)),
    Math.min(state.puzzle.size - 1, Math.max(0, nextColumn)),
    { focus: true },
  );
}

function setFocusedCell(row, column, options = {}) {
  const previous = state.cellElements[state.focusedCell.row]?.[state.focusedCell.column];
  const next = state.cellElements[row]?.[column];

  if (!next) {
    return;
  }

  if (previous && previous !== next) {
    previous.tabIndex = -1;
  }

  state.focusedCell = { row, column };
  next.tabIndex = 0;

  if (options.focus) {
    next.focus();
  }
}

function applyTool(row, column, tool) {
  if (!canEditBoard()) {
    return;
  }

  commitBoardChange(
    row,
    column,
    resolveToolValue(state.board[row][column], tool),
  );
}

function applyMobileTap(row, column) {
  if (!canEditBoard()) {
    return;
  }

  const current = state.board[row][column];
  let nextValue = CELL_STATE.MARK;

  if (current === CELL_STATE.MARK) {
    nextValue = CELL_STATE.QUEEN;
  } else if (current === CELL_STATE.QUEEN) {
    nextValue = CELL_STATE.EMPTY;
  }

  commitBoardChange(row, column, nextValue, {
    allowFinalMarkGrace: true,
  });
}

function finishGesture(event) {
  const gesture = state.gesture;

  if (!gesture || gesture.pointerId !== event.pointerId) {
    return;
  }

  if (
    (gesture.mode === "touch-mark" || gesture.mode === "touch-scroll") &&
    (gesture.moved || event.type === "pointercancel")
  ) {
    state.suppressClick = true;
    state.lastPointerType = null;
  }

  state.gesture = null;

  if (event.type === "pointercancel") {
    rollbackTouchMarks(gesture);
  }
  finishHistoryGesture(gesture);
}

function finishTouchGesture(event) {
  const gesture = state.gesture;

  if (
    !gesture ||
    (gesture.mode !== "touch-mark" && gesture.mode !== "touch-scroll")
  ) {
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
    state.lastPointerType = null;
  } else if (event.type === "touchcancel") {
    state.lastPointerType = null;
  }

  state.gesture = null;

  if (event.type === "touchcancel") {
    rollbackTouchMarks(gesture);
  }
  finishHistoryGesture(gesture);
}

function cancelActiveGesture() {
  const gesture = state.gesture;

  if (!gesture) {
    return;
  }

  if (gesture.mode === "touch-mark" || gesture.mode === "touch-scroll") {
    state.suppressClick = gesture.moved;
    state.lastPointerType = null;
  }

  state.gesture = null;
  finishHistoryGesture(gesture);
}

function cancelGestureForMultiTouch() {
  const gesture = state.gesture;
  rollbackTouchMarks(gesture);
  cancelActiveGesture();
  state.suppressClick = true;
  state.lastPointerType = null;
}

function rollbackTouchMarks(gesture) {
  if (gesture?.mode !== "touch-mark" || gesture.changedKeys.size === 0) {
    return;
  }

  clearPendingLineGrace();

  for (const key of gesture.changedKeys) {
    const [rowText, columnText] = key.split(":");
    const row = Number(rowText);
    const column = Number(columnText);

    if (state.board[row]?.[column] === CELL_STATE.MARK) {
      state.board[row][column] = CELL_STATE.EMPTY;
    }
  }

  state.analysis = analyzePlayerBoard(state.puzzle, state.board);
  state.hint = gesture.previousHint;
  state.lastScoreSummary = null;
  render();
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

function commitBoardChange(row, column, nextValue, options = {}) {
  if (!canEditBoard()) {
    return;
  }

  const current = state.board[row][column];

  if (nextValue === current) {
    return;
  }

  const previousAnalysis = state.analysis;
  const previousHint = state.hint;
  const beforeBoard = state.gesture ? null : state.board.map(row => [...row]);
  clearPendingLineGrace();

  state.board[row][column] = nextValue;
  if (beforeBoard) history.record(beforeBoard, state.board);
  state.analysis = analyzePlayerBoard(state.puzzle, state.board);
  state.hint = null;
  state.lastScoreSummary = null;
  state.pendingLineGrace = createPendingLineGrace({
    row,
    column,
    current,
    nextValue,
    previousAnalysis,
    allowFinalMarkGrace: options.allowFinalMarkGrace,
  });

  const didSolve = !previousAnalysis?.solved && state.analysis.solved;

  if (didSolve) {
    stopTimer();
    if (isRecordEligible({ assisted: state.assisted, revealed: state.revealedBySystem, mode: state.mode })) {
      state.lastScoreSummary = recordBestTime();
    }
  }

  renderSessionMeta();
  renderTools();
  renderStats();
  renderStatus();
  renderHint();
  renderControlStates();

  if (state.lastScoreSummary) {
    renderLevelPicker();
    renderScores();
  }

  if (didSolve) {
    renderBoard();
  } else {
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
}

function markDraggedCell(row, column) {
  if (state.board[row][column] !== CELL_STATE.EMPTY) {
    return;
  }

  if (state.gesture?.mode === "touch-mark") {
    state.gesture.changedKeys.add(cellKey(row, column));
  }

  commitBoardChange(row, column, CELL_STATE.MARK);
}

function createPendingLineGrace({
  row,
  column,
  current,
  nextValue,
  previousAnalysis,
  allowFinalMarkGrace,
}) {
  if (
    !allowFinalMarkGrace ||
    !state.analysis ||
    current !== CELL_STATE.EMPTY ||
    nextValue !== CELL_STATE.MARK
  ) {
    return null;
  }

  const shouldSuppressRow =
    state.analysis.rowViolations.has(row) &&
    !previousAnalysis?.rowViolations.has(row) &&
    state.analysis.rowCounts[row] === 0 &&
    isMarkedOnlyRow(row);
  const shouldSuppressColumn =
    state.analysis.columnViolations.has(column) &&
    !previousAnalysis?.columnViolations.has(column) &&
    state.analysis.columnCounts[column] === 0 &&
    isMarkedOnlyColumn(column);
  const region = state.puzzle.regions[row][column];
  const shouldSuppressRegion =
    state.analysis.regionViolations.has(region) &&
    !previousAnalysis?.regionViolations.has(region) &&
    state.analysis.regionCounts[region] === 0 &&
    isMarkedOnlyRegion(region);

  if (!shouldSuppressRow && !shouldSuppressColumn && !shouldSuppressRegion) {
    return null;
  }

  const pending = {
    row: shouldSuppressRow ? row : null,
    column: shouldSuppressColumn ? column : null,
    region: shouldSuppressRegion ? region : null,
    timeoutId: 0,
  };

  pending.timeoutId = window.setTimeout(() => {
    if (state.pendingLineGrace !== pending) {
      return;
    }

    clearPendingLineGrace();
    renderControlStates();
    renderStatus();
    renderHint();
    renderBoard(collectGraceAffectedCellKeys(pending));
  }, MOBILE_FINAL_MARK_GRACE_MS);

  return pending;
}

function clearPendingLineGrace() {
  const pending = state.pendingLineGrace;

  if (!pending) {
    return null;
  }

  window.clearTimeout(pending.timeoutId);
  state.pendingLineGrace = null;
  return pending;
}

function isMarkedOnlyRow(row) {
  return state.board[row].every((cellState) => cellState === CELL_STATE.MARK);
}

function isMarkedOnlyColumn(column) {
  for (let row = 0; row < state.board.length; row += 1) {
    if (state.board[row][column] !== CELL_STATE.MARK) {
      return false;
    }
  }

  return true;
}

function isMarkedOnlyRegion(region) {
  for (let row = 0; row < state.board.length; row += 1) {
    for (let column = 0; column < state.board.length; column += 1) {
      if (
        state.puzzle.regions[row][column] === region &&
        state.board[row][column] !== CELL_STATE.MARK
      ) {
        return false;
      }
    }
  }

  return true;
}

function hasVisiblePlacementViolations(analysis = state.analysis) {
  if (!analysis) {
    return false;
  }

  for (const row of analysis.rowViolations ?? []) {
    if (isVisibleRowViolation(row, analysis)) {
      return true;
    }
  }

  for (const column of analysis.columnViolations ?? []) {
    if (isVisibleColumnViolation(column, analysis)) {
      return true;
    }
  }

  for (const region of analysis.regionViolations ?? []) {
    if (isVisibleRegionViolation(region, analysis)) {
      return true;
    }
  }

  return false;
}

function hasPendingLineGrace() {
  return state.pendingLineGrace !== null;
}

function isVisibleRowViolation(row, analysis = state.analysis) {
  return Boolean(
    analysis?.rowViolations.has(row) && state.pendingLineGrace?.row !== row,
  );
}

function isVisibleColumnViolation(column, analysis = state.analysis) {
  return Boolean(
    analysis?.columnViolations.has(column) &&
      state.pendingLineGrace?.column !== column,
  );
}

function isVisibleRegionViolation(region, analysis = state.analysis) {
  return Boolean(
    analysis?.regionViolations.has(region) && state.pendingLineGrace?.region !== region,
  );
}

function collectGraceAffectedCellKeys(grace) {
  const affected = new Set();

  if (!grace || !state.puzzle) {
    return affected;
  }

  if (Number.isInteger(grace.row)) {
    for (let column = 0; column < state.puzzle.size; column += 1) {
      affected.add(cellKey(grace.row, column));
    }
  }

  if (Number.isInteger(grace.column)) {
    for (let row = 0; row < state.puzzle.size; row += 1) {
      affected.add(cellKey(row, grace.column));
    }
  }

  if (Number.isInteger(grace.region)) {
    for (let row = 0; row < state.puzzle.size; row += 1) {
      for (let column = 0; column < state.puzzle.size; column += 1) {
        if (state.puzzle.regions[row][column] === grace.region) {
          affected.add(cellKey(row, column));
        }
      }
    }
  }

  return affected;
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
  state.scoreData = mergeScoreData(
    SCORE_LEVEL_COUNTS,
    state.scoreData,
    loadScoreData(),
  );

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
      void persistScoreData();
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
    void persistScoreData();
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
  if (state.mode === "daily") return `Daily garden · ${state.dailyDate} UTC · ${sizeLabel}`;

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
    return parseScoreData(window.localStorage.getItem(SCORE_STORAGE_KEY));
  } catch {
    return createEmptyScoreData();
  }
}

function parseScoreData(raw) {
  if (!raw) {
    return createEmptyScoreData();
  }

  return normalizeScoreData(JSON.parse(raw), SCORE_LEVEL_COUNTS);
}

async function persistScoreData() {
  try {
    const writeMergedScores = () => {
      state.scoreData = mergeScoreData(
        SCORE_LEVEL_COUNTS,
        loadScoreData(),
        state.scoreData,
      );
      window.localStorage.setItem(
        SCORE_STORAGE_KEY,
        JSON.stringify(state.scoreData),
      );
    };

    if (globalThis.navigator?.locks?.request) {
      await globalThis.navigator.locks.request(
        `${SCORE_STORAGE_KEY}-write`,
        writeMergedScores,
      );
    } else {
      writeMergedScores();
    }

    renderScoreViewsPreservingFocus();
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

function updateStatus(value) {
  if (statusText.textContent !== value) {
    statusText.textContent = value;
  }

  if (gameAnnouncer.textContent !== value) {
    gameAnnouncer.textContent = value;
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
  addPlacementViolationKeys(affected, previousAnalysis);
  addPlacementViolationKeys(affected, nextAnalysis);
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

function addPlacementViolationKeys(affected, analysis) {
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

  for (const region of analysis.regionViolations ?? []) {
    for (let row = 0; row < state.puzzle.size; row += 1) {
      for (let column = 0; column < state.puzzle.size; column += 1) {
        if (state.puzzle.regions[row][column] === region) {
          affected.add(cellKey(row, column));
        }
      }
    }
  }
}

function cellKey(row, column) {
  return `${row}:${column}`;
}
