import assert from "node:assert/strict";
import test from "node:test";

import {
  HUD_VR_DISTANCE_M,
  HUD_VR_SURFACE_WIDTH_M,
} from "../node_modules/@rb/halo/src/hud-placement-policy.js";
import { stageVrPanels, VR_LAYOUT_H } from "../src/vr-chrome.js";

const LAYOUT_W = 1024;

function windows() {
  return {
    race: { x: 16, y: 16, w: 420, h: 270 },
    help: { x: 16, y: 302, w: 460, h: 360 },
    "race-chat": { x: 448, y: 16, w: 360, h: 260 },
    debug: { x: 2000, y: -2000, w: 420, h: 360 },
    status: { x: 360, y: -2000, w: 330, h: 64 },
    settings: { x: 200, y: -2000, w: 440, h: 520 },
    hotbar: { x: 2000, y: -10, w: 540, h: 84 },
    xr: { x: 2000, y: -2000, w: 300, h: 136 },
  };
}

function yawSpan() {
  return 2 * Math.atan((HUD_VR_SURFACE_WIDTH_M * 0.5) / HUD_VR_DISTANCE_M);
}

function yawEdges(win) {
  const span = yawSpan();
  const cx = win.x + win.w / 2;
  const yaw = (cx / LAYOUT_W - 0.5) * span;
  const half = Math.atan(
    (win.w * 0.5 * HUD_VR_SURFACE_WIDTH_M) / LAYOUT_W / HUD_VR_DISTANCE_M,
  );
  return [yaw - half, yaw + half];
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

test("readouts leave the road and Exit VR stays where the laser can hit it", () => {
  const hud = windows();
  stageVrPanels({ windows: hud, layoutW: LAYOUT_W, layoutH: VR_LAYOUT_H });

  assert.equal(hud.settings.y, -2000);
  assert.equal(hud.debug.y, -2000);
  assert.equal(hud.status.y, -2000);

  const aside = 50 * Math.PI / 180;
  for (const key of ["race", "help", "race-chat", "hotbar"]) {
    const [left, right] = yawEdges(hud[key]);
    const inFront = right > -aside && left < aside;
    assert.equal(inFront, false, `${key} is in the face (${left.toFixed(3)}, ${right.toFixed(3)})`);
  }

  const [exitLeft, exitRight] = yawEdges(hud.xr);
  assert.ok(exitLeft > 12 * Math.PI / 180, `Exit VR covers the road ${exitLeft}`);
  assert.ok(exitRight < 50 * Math.PI / 180, `Exit VR leaves the picture ${exitRight}`);
  assert.ok(hud.xr.y >= 32 && hud.xr.y < VR_LAYOUT_H * 0.25, `Exit VR y ${hud.xr.y}`);

  for (const key of ["race", "help", "race-chat", "hotbar"]) {
    assert.equal(overlaps(hud.xr, hud[key]), false, `${key} covers Exit VR`);
  }
});

test("an opened settings panel stays off the road and off Exit VR", () => {
  const hud = windows();
  hud.settings.y = 40;
  stageVrPanels({ windows: hud, layoutW: LAYOUT_W, layoutH: VR_LAYOUT_H });
  const [left, right] = yawEdges(hud.settings);
  const aside = 50 * Math.PI / 180;
  assert.ok(right < -aside || left > aside);
  assert.equal(overlaps(hud.xr, hud.settings), false);
});
