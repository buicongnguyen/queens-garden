import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createFixedLevelPuzzle } from "../../src/engine.js";
import validator from "gltf-validator";

async function openFixed(page, index = 1) {
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("tab", { name: "Levels", exact: true }).click();
  await page
    .getByRole("button", { name: new RegExp(`^Level ${index} for 7 x 7`) })
    .click();
  await expect(page.getByRole("gridcell")).toHaveCount(49);
}
const cell = (page, r, c) =>
  page.locator(`.cell[data-row="${r}"][data-column="${c}"]`);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("gridcell")).toHaveCount(49);
});

test("undo, redo, branch replacement, daily identity, and region numbers", async ({
  page,
}) => {
  await cell(page, 0, 0).click();
  await expect(cell(page, 0, 0)).toHaveAccessibleName(/queen/);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(cell(page, 0, 0)).toHaveAccessibleName(/empty/);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(cell(page, 0, 0)).toHaveAccessibleName(/queen/);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await cell(page, 1, 3).click();
  await expect(
    page.getByRole("button", { name: "Redo", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Region numbers", { exact: true }).check();
  await expect(cell(page, 0, 0).locator(".region-number")).toBeVisible();
  await page
    .getByRole("button", { name: "Daily garden · UTC", exact: true })
    .click();
  await expect(page.locator("[data-session-label]")).toContainText(
    `${new Date().toISOString().slice(0, 10)} UTC`,
  );
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  const first = await page
    .locator(".cell")
    .evaluateAll((cells) => cells.map((c) => c.dataset.region));
  await page
    .getByRole("button", { name: "Daily garden · UTC", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator(".cell")
        .evaluateAll((cells) => cells.map((c) => c.dataset.region)),
    )
    .toEqual(first);
});

test("hinted solve does not create a time record and next-level progression clears history", async ({
  page,
}) => {
  await openFixed(page);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("tab", { name: "Game", exact: true }).click();
  await page.getByRole("button", { name: "Hint", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const puzzle = createFixedLevelPuzzle(7, 1);
  for (let r = 0; r < 7; r++) await cell(page, r, puzzle.queens[r]).click();
  await expect(page.locator("#completion-message")).toContainText("assisted");
  expect(
    await page.evaluate(() => localStorage.getItem("queens-garden-scores-v1")),
  ).toBeNull();
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Next level", exact: true }).click();
  await expect(page.locator("[data-session-label]")).toContainText("Level 02");
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
});

test("3D preview rotates and exports a valid glTF without revealing the answer", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await cell(page, 0, 0).click();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByText("3D garden · Blender export", { exact: true }).click();
  await expect(page.locator("#scene-status")).toContainText(
    "Current position only",
  );
  const before = await page.locator("canvas").evaluate((c) => c.toDataURL());
  await page.getByLabel("Rotate garden").fill("90");
  expect(await page.locator("canvas").evaluate((c) => c.toDataURL())).not.toBe(
    before,
  );
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Download Blender scene (.gltf)",
      exact: true,
    })
    .click();
  const download = await downloadPromise;
  await download.saveAs('test-results/current-position.gltf');
  const data = await readFile(await download.path(), "utf8");
  const result = await validator.validateString(data);
  expect(result.issues.numErrors, JSON.stringify(result.issues.messages)).toBe(
    0,
  );
  const scene = JSON.parse(data);
  expect(
    scene.nodes.filter((node) => node.name.startsWith("Queen base")),
  ).toHaveLength(1);
  expect(data).not.toContain('"queens"');
  expect(errors).toEqual([]);
  await page.getByLabel("Rotate garden").fill("35");
  await page.screenshot({ path: "test-results/garden-3d.png" });
  await page.locator('#scene-detail').check();
  await expect(page.locator('#scene-status')).toContainText('Queen model study');
  await page.screenshot({ path: 'test-results/queen-detail.png' });
});

test('WebGL failure keeps game and scene export available', async ({ page }) => {
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type.startsWith('webgl') ? null : original.call(this, type, ...args);
    };
  });
  await page.getByRole('button', {name: 'Menu', exact: true}).click();
  await page.getByText('3D garden · Blender export', {exact: true}).click();
  await expect(page.locator('#scene-status')).toContainText('Preview unavailable');
  const pending = page.waitForEvent('download');
  await page.locator('#export-scene').click();
  const download = await pending;
  const data = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(data.asset.version).toBe('2.0');
});

test("large mobile board scrolls and controls remain reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByLabel("Board size", { exact: true }).selectOption("15");
  await expect(page.getByRole("gridcell")).toHaveCount(225);
  await expect(page.locator("#board")).toHaveClass(/is-scrollable/);
  await expect(
    page.getByRole("heading", { name: "Queen's Garden", level: 1 }),
  ).toBeVisible();
  await page.getByLabel("Region numbers", { exact: true }).check();
  await page.screenshot({
    path: "test-results/garden-mobile.png",
    fullPage: true,
  });
});

test("right-drag is one undo step", async ({ page }) => {
  const start = await cell(page, 0, 0).boundingBox(),
    end = await cell(page, 0, 3).boundingBox();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, {
    steps: 10,
  });
  await page.mouse.up({ button: "right" });
  await expect(page.locator(".cell.is-mark")).toHaveCount(4);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".cell.is-mark")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
});

test("canceled multi-touch restores cells and does not create history", async ({
  page,
}) => {
  await page.evaluate(() => {
    const first = document.querySelector(
      '.cell[data-row="0"][data-column="0"]',
    );
    const last = document.querySelector('.cell[data-row="0"][data-column="3"]');
    const a = first.getBoundingClientRect(),
      b = last.getBoundingClientRect();
    const touch = (id, x, y) =>
      new Touch({ identifier: id, target: first, clientX: x, clientY: y });
    const start = touch(23, a.x + a.width / 2, a.y + a.height / 2);
    first.dispatchEvent(
      new TouchEvent("touchstart", {
        bubbles: true,
        touches: [start],
        changedTouches: [start],
      }),
    );
    const moved = touch(23, b.x + b.width / 2, b.y + b.height / 2);
    first.dispatchEvent(
      new TouchEvent("touchmove", {
        bubbles: true,
        cancelable: true,
        touches: [moved],
        changedTouches: [moved],
      }),
    );
    if (document.querySelectorAll(".is-mark").length !== 4)
      throw new Error("Swipe did not mark four cells");
    const second = touch(24, a.x, a.y);
    first.dispatchEvent(
      new TouchEvent("touchstart", {
        bubbles: true,
        touches: [moved, second],
        changedTouches: [second],
      }),
    );
  });
  await expect(page.locator(".cell.is-mark")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
});

test("unassisted solve records time and last-level action cannot wrap", async ({
  page,
}) => {
  await openFixed(page, 20);
  const puzzle = createFixedLevelPuzzle(7, 20);
  for (let r = 0; r < 7; r++) await cell(page, r, puzzle.queens[r]).click();
  await expect(page.locator("#completion-message")).toContainText(
    "Garden complete",
  );
  await expect(
    page.getByRole("button", { name: "Last level reached", exact: true }),
  ).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("queens-garden-scores-v1"))
            ?.fixed?.[7]?.[20],
      ),
    )
    .toBeGreaterThan(0);
});

test("3D controls stay inside the modal keyboard focus cycle", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByText("3D garden · Blender export", { exact: true }).click();
  await page
    .getByRole("button", {
      name: "Download Blender scene (.gltf)",
      exact: true,
    })
    .focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Close", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", {
      name: "Download Blender scene (.gltf)",
      exact: true,
    }),
  ).toBeFocused();
});

test("development server serves public assets and rejects private paths", async ({
  request,
}) => {
  expect((await request.get("/src/play-session.js")).status()).toBe(200);
  expect((await request.get("/.git/config")).status()).toBe(404);
  expect((await request.get("/src/..%2f.git/config")).status()).toBe(404);
  expect((await request.get("/package.json")).status()).toBe(404);
});
