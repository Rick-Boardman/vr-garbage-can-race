import assert from "node:assert/strict";
import test from "node:test";

import { keepVrPanelsOnSlab } from "../src/vr-chrome.js";

function windows() {
  return {
    race: { x: 16, y: 16, w: 420, h: 270 },
    help: { x: 16, y: 302, w: 460, h: 360 },
    "race-chat": { x: 448, y: 16, w: 360, h: 260 },
    debug: { x: 2000, y: 150, w: 420, h: 360 },
    status: { x: 360, y: 16, w: 330, h: 64 },
    settings: { x: 200, y: -2000, w: 440, h: 520 },
    hotbar: { x: 2000, y: -10, w: 540, h: 84 },
    xr: { x: 400, y: 200, w: 300, h: 136 },
  };
}

function onSlab(win, width, height) {
  return win.x >= 0 && win.y >= 0 && win.x + win.w <= width && win.y + win.h <= height;
}

test("open VR panels stay on the slab and a hidden one stays hidden", () => {
  const hud = windows();
  keepVrPanelsOnSlab({ windows: hud, layoutW: 1024, layoutH: 640 });
  for (const key of ["race", "help", "race-chat", "debug", "status", "hotbar", "xr"]) {
    assert.ok(onSlab(hud[key], 1024, 640), `${key} at ${hud[key].x},${hud[key].y}`);
  }
  assert.equal(hud.settings.y, -2000);
  assert.equal(hud.race.x, 16);
  assert.equal(hud.race.y, 16);
  assert.ok(hud.hotbar.x + hud.hotbar.w <= 1024, `hotbar x ${hud.hotbar.x}`);
  assert.ok(hud.hotbar.y >= 0, `hotbar y ${hud.hotbar.y}`);
});
