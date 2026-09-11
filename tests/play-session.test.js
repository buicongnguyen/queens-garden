import assert from "node:assert/strict";
import test from "node:test";
import {
  createHistory,
  dailyChallenge,
  isRecordEligible,
} from "../src/play-session.js";

test("daily identity is UTC, stable within the day, and cycles valid levels", () => {
  const morning = dailyChallenge(new Date("2026-09-11T00:00:00Z"));
  assert.deepEqual(morning, dailyChallenge(new Date("2026-09-11T23:59:59Z")));
  assert.deepEqual(
    morning,
    dailyChallenge(new Date("2026-09-12T08:59:59+09:00")),
  );
  assert.equal(morning.date, "2026-09-11");
  const tomorrow = dailyChallenge(new Date("2026-09-12T00:00:00Z"));
  assert.equal(tomorrow.levelIndex, (morning.levelIndex % 20) + 1);
  assert.throws(() => dailyChallenge(new Date("invalid")));
  assert.throws(() => dailyChallenge(new Date(), 0));
});

test("history owns snapshots, groups multiple cells, and invalidates a redo branch", () => {
  const history = createHistory(2);
  const empty = [
      [0, 0],
      [0, 0],
    ],
    marked = [
      [2, 2],
      [0, 0],
    ],
    queen = [
      [1, 2],
      [0, 0],
    ];
  history.record(empty, marked);
  empty[0][0] = 1;
  assert.deepEqual(history.undo(marked), [
    [0, 0],
    [0, 0],
  ]);
  assert.deepEqual(
    history.redo([
      [0, 0],
      [0, 0],
    ]),
    marked,
  );
  history.record(marked, queen);
  assert.deepEqual(history.undo(queen), marked);
  history.record(marked, [
    [2, 0],
    [0, 0],
  ]);
  assert.equal(history.canRedo, false);
  history.clear();
  history.record(marked, marked);
  assert.equal(history.canUndo, false);
  assert.equal(history.undo(marked), null);
});

test("history bounds memory without losing the latest move", () => {
  const history = createHistory(1);
  history.record([[0]], [[1]]);
  history.record([[1]], [[2]]);
  assert.deepEqual(history.undo([[2]]), [[1]]);
  assert.equal(history.undo([[1]]), null);
});

test("only unassisted fixed and random attempts can update time records", () => {
  for (const mode of ["fixed", "random", "daily"]) {
    assert.equal(
      isRecordEligible({ mode, assisted: false, revealed: false }),
      mode !== "daily",
    );
    assert.equal(
      isRecordEligible({ mode, assisted: true, revealed: false }),
      false,
    );
    assert.equal(
      isRecordEligible({ mode, assisted: false, revealed: true }),
      false,
    );
  }
});
