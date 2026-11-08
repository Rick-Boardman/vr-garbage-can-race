import assert from "node:assert/strict";
import test from "node:test";

import {
  HUD_VR_DISTANCE_M,
  HUD_VR_SURFACE_WIDTH_M,
} from "../node_modules/@rb/halo/src/hud-placement-policy.js";
import { stageVrPanels, VR_LAYOUT_H, VR_LAYOUT_W } from "../src/vr-chrome.js";

function windows() {
  return {
    race: { x: 16, y: 16, w: 420, h: 270 },
    help: { x: 16, y: 302, w: 460, h: 360 },
    "race-chat": { x: 448, y: 16, w: 360, h: 260 },
    debug: { x: 2000, y: -2000, w: 420, h: 360 },
    status: { x: 360, y: -2000, w: 330, h: 64 },
    settings: { x: 200, y: -2000, w: 440, h: 520 },
    hotbar: { x: 2000, y: -10, w: 540, h: 84 },
    xr: { x: 400, y: 200, w: 300, h: 136 },
  };
}

function yawSpan() {
  return 2 * Math.atan((HUD_VR_SURFACE_WIDTH_M * 0.5) / HUD_VR_DISTANCE_M);
}

// Halo maps a window center onto the sphere, then the panel extends sideways.
function yawEdges(win) {
  const span = yawSpan();
  const cx = win.x + win.w / 2;
  const yaw = (cx / VR_LAYOUT_W - 0.5) * span;
  const half = Math.atan(
    (win.w * 0.5 * HUD_VR_SURFACE_WIDTH_M) / VR_LAYOUT_W / HUD_VR_DISTANCE_M,
  );
  return [yaw - half, yaw + half];
}

test("open VR panels sit beside the road and a hidden one stays hidden", () => {
  const hud = windows();
  stageVrPanels({ windows: hud, layoutW: VR_LAYOUT_W, layoutH: VR_LAYOUT_H });

  assert.equal(hud.settings.y, -2000);
  assert.equal(hud.debug.y, -2000);
  assert.equal(hud.status.y, -2000);

  const clear = 12 * Math.PI / 180;
  for (const key of ["race", "help", "race-chat", "hotbar", "xr"]) {
    const win = hud[key];
    assert.ok(win.y >= 32, `${key} y ${win.y}`);
    assert.ok(win.y + win.h <= VR_LAYOUT_H, `${key} runs off the bottom`);
    const [left, right] = yawEdges(win);
    const coversCenter = right > -clear && left < clear;
    assert.equal(coversCenter, false, `${key} covers the road (${left.toFixed(3)}, ${right.toFixed(3)})`);
  }

  assert.ok(hud.race.x < hud.xr.x, "status is left of Exit VR");
  assert.ok(hud.hotbar.x + hud.hotbar.w < VR_LAYOUT_W * 0.5, "hotbar stays on the left");
  assert.ok(hud.xr.x > VR_LAYOUT_W * 0.5, "Exit VR stays on the right");
});

test("an opened settings panel joins the right column and still clears the road", () => {
  const hud = windows();
  hud.settings.y = 40;
  stageVrPanels({ windows: hud, layoutW: VR_LAYOUT_W, layoutH: VR_LAYOUT_H });
  assert.ok(hud.settings.x > VR_LAYOUT_W * 0.5);
  assert.ok(hud.settings.y >= 32);
  const [left, right] = yawEdges(hud.settings);
  const clear = 12 * Math.PI / 180;
  assert.ok(left >= clear || right <= -clear);
});
