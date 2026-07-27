import assert from "node:assert/strict";
import test from "node:test";

import { reorderModelIds } from "../app/lib/model-order.ts";

test("reorders selected models at the dropped position", () => {
  assert.deepEqual(reorderModelIds(["a", "b", "c", "d"], "d", "b"), ["a", "d", "b", "c"]);
  assert.deepEqual(reorderModelIds(["a", "b", "c", "d"], "a", "d"), ["b", "c", "d", "a"]);
});

test("keeps the original order when a reorder is not possible", () => {
  const modelIds = ["a", "b", "c"];
  assert.equal(reorderModelIds(modelIds, "b", "b"), modelIds);
  assert.equal(reorderModelIds(modelIds, "x", "b"), modelIds);
});
