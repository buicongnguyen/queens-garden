export const CELL_ACTIVATION_MODE = Object.freeze({
  TOOL: "tool",
  TOUCH_CYCLE: "touch-cycle",
});

export function resolveCellActivation({
  eventDetail,
  pointerType,
  shiftKey,
  activeTool,
}) {
  if (eventDetail > 0 && pointerType === "touch" && !shiftKey) {
    return {
      mode: CELL_ACTIVATION_MODE.TOUCH_CYCLE,
      tool: null,
    };
  }

  return {
    mode: CELL_ACTIVATION_MODE.TOOL,
    tool: shiftKey ? "mark" : activeTool,
  };
}

export function hasScrollableOverflow(
  {
    scrollWidth,
    clientWidth,
    scrollHeight,
    clientHeight,
  },
  tolerance = 1,
) {
  return (
    scrollWidth > clientWidth + tolerance ||
    scrollHeight > clientHeight + tolerance
  );
}

export function createEmptyScoreData() {
  return {
    fixed: {},
    random: {},
  };
}

export function normalizeScoreData(candidate, levelCounts) {
  const normalized = createEmptyScoreData();

  if (!candidate || typeof candidate !== "object") {
    return normalized;
  }

  for (const [sizeKey, rawLevelCount] of Object.entries(levelCounts)) {
    const levelCount = Math.max(0, Math.floor(Number(rawLevelCount)));
    const candidateLevels = candidate.fixed?.[sizeKey];

    if (candidateLevels && typeof candidateLevels === "object") {
      const nextLevels = {};

      for (let levelIndex = 1; levelIndex <= levelCount; levelIndex += 1) {
        const levelKey = String(levelIndex);
        const safeValue = normalizeBestMs(candidateLevels[levelKey]);

        if (safeValue !== null) {
          nextLevels[levelKey] = safeValue;
        }
      }

      if (Object.keys(nextLevels).length > 0) {
        normalized.fixed[sizeKey] = nextLevels;
      }
    }

    const randomBest = normalizeBestMs(candidate.random?.[sizeKey]);

    if (randomBest !== null) {
      normalized.random[sizeKey] = randomBest;
    }
  }

  return normalized;
}

export function mergeScoreData(levelCounts, ...candidates) {
  const merged = createEmptyScoreData();

  for (const candidate of candidates) {
    const normalized = normalizeScoreData(candidate, levelCounts);

    for (const [sizeKey, levels] of Object.entries(normalized.fixed)) {
      if (!merged.fixed[sizeKey]) {
        merged.fixed[sizeKey] = {};
      }

      for (const [levelKey, value] of Object.entries(levels)) {
        const previous = merged.fixed[sizeKey][levelKey];
        merged.fixed[sizeKey][levelKey] =
          previous === undefined ? value : Math.min(previous, value);
      }
    }

    for (const [sizeKey, value] of Object.entries(normalized.random)) {
      const previous = merged.random[sizeKey];
      merged.random[sizeKey] =
        previous === undefined ? value : Math.min(previous, value);
    }
  }

  return merged;
}

function normalizeBestMs(value) {
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.round(value);
}
