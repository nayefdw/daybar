// The icons a person can put in front of an item or a folder: the names the
// server accepts (lib/daybar/icons.ts) and the drawings the browser loads
// (components/daybar/icon-set.tsx) are the same list, and every one is a
// Lucide icon.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as lucide from "lucide-react";
import { ICON_GROUPS, ICON_NAMES, iconExport, isIconName } from "../lib/daybar/icons";
import { ICON_SET } from "../components/daybar/icon-set";

test("the list of names and the drawings agree, each a Lucide icon", () => {
  assert.deepEqual(Object.keys(ICON_SET), [...ICON_NAMES]);
  assert.equal(new Set(ICON_NAMES).size, ICON_NAMES.length, "no icon twice");
  for (const name of ICON_NAMES) {
    assert.match(name, /^[a-z0-9]+(-[a-z0-9]+)*$/, name);
    assert.equal(ICON_SET[name], (lucide as unknown as Record<string, unknown>)[iconExport(name)], name);
  }
  assert.ok(ICON_GROUPS.every((g) => g.names.length >= 5));
});

test("names: kebab-case to lucide-react's export, and only known ones", () => {
  assert.equal(iconExport("shopping-cart"), "ShoppingCart");
  assert.equal(iconExport("gamepad-2"), "Gamepad2");
  assert.equal(iconExport("train-front"), "TrainFront");
  assert.ok(isIconName("plane"));
  assert.ok(!isIconName("Plane"));
  assert.ok(!isIconName("constructor"));
  assert.ok(!isIconName(null));
});
