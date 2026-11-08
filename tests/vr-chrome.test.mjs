import assert from "node:assert/strict";
import test from "node:test";

import { layoutVrChrome, VR_PARK_Y } from "../src/vr-chrome.js";

function windows() {
  return {
    race: { x: 16, y: 16, w: 420, h: 270 },
    help: { x: 16, y: 302, w: 460, h: 360 },
    "race-chat": { x: 448, y: 16, w: 360, h: 260 },
    debug: { x: 2000, y: 150, w: 420, h: 360 },
    status: { x: 360, y: 16, w: 330, h: 64 },
    settings: { x: 200, y: 100, w: 440, h: 520 },
    hotbar: { x: 2000, y: -10, w: 540, h: 84 },
    xr: { x: 400, y: 200, w: 300, h: 136 },
  };
}

function covers(win, x, y) {
  return x >= win.x && x <= win.x + win.w && y >= win.y && y <= win.y + win.h;
}

test("VR chrome parks the readouts and leaves the center clear", () => {
  const hud = windows();
  layoutVrChrome({
    windows: hud,
    layoutW: 1024,
    layoutH: 640,
    helpWanted: false,
    settingsWanted: false,
  });
  for (const key of ["race", "help", "race-chat", "debug", "status", "settings"]) {
    assert.equal(hud[key].y, VR_PARK_Y, key);
  }
  const bar = hud.hotbar;
  const xr = hud.xr;
  assert.ok(bar.x >= 0 && bar.x + bar.w <= 1024, `hotbar x ${bar.x}`);
  assert.ok(bar.y > 640 * 0.7, `hotbar y ${bar.y}`);
  assert.ok(bar.y + bar.h <= 640);
  assert.ok(xr.x > 1024 * 0.5, `exit x ${xr.x}`);
  assert.ok(xr.y + xr.h <= bar.y, `exit overlaps the hotbar (${xr.y + xr.h} vs ${bar.y})`);
  assert.equal(covers(bar, 512, 320), false);
  assert.equal(covers(xr, 512, 320), false);

  hud.help.y = 40;
  layoutVrChrome({
    windows: hud,
    layoutW: 1024,
    layoutH: 640,
    helpWanted: true,
    settingsWanted: false,
  });
  assert.equal(hud.help.y, 40);
  assert.equal(hud.race.y, VR_PARK_Y);
});
