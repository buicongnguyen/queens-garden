import assert from "node:assert/strict";
import test from "node:test";

import { normalizeGeneratedText } from "../scripts/build-level-utils.js";

test("generated database comparisons ignore checkout line-ending conversion", () => {
  const generated = "export const LEVELS = {\n  7: [],\n};\n";

  assert.equal(
    normalizeGeneratedText(generated.replaceAll("\n", "\r\n")),
    normalizeGeneratedText(generated),
  );
  assert.equal(
    normalizeGeneratedText(generated.replaceAll("\n", "\r")),
    normalizeGeneratedText(generated),
  );
});
