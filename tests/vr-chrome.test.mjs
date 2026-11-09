import assert from "node:assert/strict";
import test from "node:test";

import {
  HUD_VR_DISTANCE_M,
  HUD_VR_SURFACE_HEIGHT_M,
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
    xr: { x: 2000, y: -2000, w: 300, h: 136 },
  };
}

function yawSpan() {
  return 2 * Math.atan((HUD_VR_SURFACE_WIDTH_M * 0.5) / HUD_VR_DISTANCE_M);
}

function pitchSpan() {
  return 2 * Math.atan((HUD_VR_SURFACE_HEIGHT_M * 0.5) / HUD_VR_DISTANCE_M);
}

function angDiff(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function centerYaw(win) {
  return ((win.x + win.w / 2) / VR_LAYOUT_W - 0.5) * yawSpan();
}

function centerPitch(win) {
  return (0.5 - (win.y + win.h / 2) / VR_LAYOUT_H) * pitchSpan();
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

test("open panels sit in front of the look, including when the room yaw is large", () => {
  for (const eyeYaw of [0, Math.PI, -1.4, 2.2]) {
    for (const eyePitch of [0, -0.32, 0.4]) {
      const hud = windows();
      stageVrPanels({
        windows: hud,
        layoutW: VR_LAYOUT_W,
        layoutH: VR_LAYOUT_H,
        eyeYaw,
        eyePitch,
      });
      assert.equal(hud.settings.y, -2000);
      assert.equal(hud.debug.y, -2000);
      assert.equal(hud.status.y, -2000);
      for (const key of ["race", "help", "race-chat", "hotbar", "xr"]) {
        const yaw = angDiff(centerYaw(hud[key]), eyeYaw);
        const pitch = centerPitch(hud[key]) - eyePitch;
        assert.ok(Math.abs(yaw) < 0.45, `${key} yaw ${yaw} at eye ${eyeYaw}`);
        assert.ok(Math.abs(pitch) < 0.55, `${key} pitch ${pitch} at eye ${eyePitch}`);
        assert.ok(hud[key].y >= -900, `${key} was parked`);
      }
      for (const key of ["race", "help", "race-chat", "hotbar"]) {
        assert.equal(overlaps(hud.xr, hud[key]), false, `${key} covers Exit VR at ${eyeYaw}`);
      }
    }
  }
});

test("an opened settings panel stays by the look and off Exit VR", () => {
  const hud = windows();
  hud.settings.y = 40;
  stageVrPanels({
    windows: hud,
    layoutW: VR_LAYOUT_W,
    layoutH: VR_LAYOUT_H,
    eyeYaw: 1.7,
    eyePitch: -0.2,
  });
  assert.ok(Math.abs(angDiff(centerYaw(hud.settings), 1.7)) < 0.45);
  assert.equal(overlaps(hud.xr, hud.settings), false);
  assert.ok(hud.settings.y >= -900);
});
