export function dailyChallenge(date = new Date(), levelCount = 20) {
  if (
    !(date instanceof Date) ||
    !Number.isFinite(date.getTime()) ||
    !Number.isInteger(levelCount) ||
    levelCount < 1
  ) {
    throw new Error("A valid date and positive level count are required.");
  }
  const day = Math.floor(date.getTime() / 86400000);
  return {
    date: date.toISOString().slice(0, 10),
    size: 7,
    levelIndex: (((day % levelCount) + levelCount) % levelCount) + 1,
  };
}

export function isRecordEligible({ assisted, revealed, mode }) {
  return !assisted && !revealed && (mode === "fixed" || mode === "random");
}

const clone = (board) => board.map((row) => [...row]);
const same = (a, b) =>
  a.length === b.length &&
  a.every(
    (row, r) =>
      row.length === b[r].length && row.every((cell, c) => cell === b[r][c]),
  );

export function createHistory(limit = 150) {
  if (!Number.isInteger(limit) || limit < 1)
    throw new Error("Invalid history limit.");
  let past = [];
  let future = [];
  return {
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
    clear() {
      past = [];
      future = [];
    },
    record(before, after) {
      if (same(before, after)) return;
      past.push(clone(before));
      if (past.length > limit) past.shift();
      future = [];
    },
    undo(current) {
      if (!past.length) return null;
      future.push(clone(current));
      return clone(past.pop());
    },
    redo(current) {
      if (!future.length) return null;
      past.push(clone(current));
      return clone(future.pop());
    },
  };
}
