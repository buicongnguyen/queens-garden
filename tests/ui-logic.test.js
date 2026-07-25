import assert from "node:assert/strict";
import test from "node:test";

import {
  CELL_ACTIVATION_MODE,
  hasScrollableOverflow,
  mergeScoreData,
  normalizeScoreData,
  resolveCellActivation,
} from "../src/ui-logic.js";

const LEVEL_COUNTS = Object.freeze({
  7: 20,
  8: 20,
});

test("keyboard clicks never inherit a stale touch activation mode", () => {
  assert.deepEqual(
    resolveCellActivation({
      eventDetail: 0,
      pointerType: "touch",
      shiftKey: false,
      activeTool: "erase",
    }),
    {
      mode: CELL_ACTIVATION_MODE.TOOL,
      tool: "erase",
    },
  );

  assert.deepEqual(
    resolveCellActivation({
      eventDetail: 1,
      pointerType: "touch",
      shiftKey: false,
      activeTool: "queen",
    }),
    {
      mode: CELL_ACTIVATION_MODE.TOUCH_CYCLE,
      tool: null,
    },
  );
});

test("overflow detection covers both narrow portrait and short landscape shells", () => {
  assert.equal(
    hasScrollableOverflow({
      scrollWidth: 403,
      clientWidth: 354,
      scrollHeight: 403,
      clientHeight: 500,
    }),
    true,
  );
  assert.equal(
    hasScrollableOverflow({
      scrollWidth: 403,
      clientWidth: 700,
      scrollHeight: 403,
      clientHeight: 250,
    }),
    true,
  );
  assert.equal(
    hasScrollableOverflow({
      scrollWidth: 403,
      clientWidth: 403,
      scrollHeight: 403,
      clientHeight: 403,
    }),
    false,
  );
});

test("score normalization rejects unsupported and malformed records", () => {
  assert.deepEqual(
    normalizeScoreData(
      {
        fixed: {
          7: { 1: 1200.4, 21: 1, bad: 3 },
          99: { 1: 1 },
        },
        random: {
          7: 5000,
          8: -1,
          99: 1,
        },
      },
      LEVEL_COUNTS,
    ),
    {
      fixed: {
        7: { 1: 1200 },
      },
      random: {
        7: 5000,
      },
    },
  );
});

test("score merging preserves disjoint clears and the fastest concurrent time", () => {
  assert.deepEqual(
    mergeScoreData(
      LEVEL_COUNTS,
      {
        fixed: { 7: { 1: 9000 } },
        random: { 7: 12000 },
      },
      {
        fixed: { 7: { 2: 8000 } },
        random: { 7: 7000, 8: 11000 },
      },
      {
        fixed: { 7: { 1: 6000 } },
        random: { 7: 15000 },
      },
    ),
    {
      fixed: {
        7: {
          1: 6000,
          2: 8000,
        },
      },
      random: {
        7: 7000,
        8: 11000,
      },
    },
  );
});
