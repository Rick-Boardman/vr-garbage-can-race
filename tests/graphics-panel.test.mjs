import assert from "node:assert/strict";
import test from "node:test";

import { nextSettingsPlacement } from "../src/graphics-panel.js";

test("the graphics window stays where it was dragged", () => {
  const win = { x: 0, y: 0, w: 200, h: 200, dragging: false, resizing: false };
  assert.equal(nextSettingsPlacement(win, 1280, false), false);
  assert.equal(win.w, 440);
  assert.equal(win.h, 520);
  assert.equal(win.minW, 440);
  assert.equal(win.minH, 520);
  assert.equal(win.x, 1280 - 440 - 16);
  assert.equal(win.y, 16);
  assert.equal(win._settingsHiddenX, win.x);
  assert.equal(win._settingsHiddenY, win.y);

  const pinnedX = win.x;
  win.dragging = true;
  win.x = 180;
  win.y = 240;
  assert.equal(nextSettingsPlacement(win, 1280, false), true);
  assert.equal(win.x, 180);
  assert.equal(win.y, 240);

  win.dragging = false;
  assert.equal(nextSettingsPlacement(win, 1280, true), true);
  assert.equal(win.x, 180, "drop snapped back to the corner");
  assert.equal(win.y, 240);
  assert.equal(win._settingsHiddenX, 180);
  assert.equal(win._settingsHiddenY, 240);
  assert.notEqual(win.x, pinnedX);

  win.y = -4000;
  win.x = -4000;
  nextSettingsPlacement(win, 1280, true);
  assert.equal(win.y, -4000, "a closed window was pulled back on screen");
  assert.equal(win._settingsHiddenX, 180);
});
