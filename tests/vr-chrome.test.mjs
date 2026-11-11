import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  HUD_VR_DISTANCE_M,
  HUD_VR_SURFACE_WIDTH_M,
} from "@rb/halo/src/hud-placement-policy.js";
import { placeHudMount, stageVrPanels, VR_LAYOUT_W, VR_SIDE_YAW } from "../src/vr-chrome.js";

function windows() {
  return {
    race: { x: 16, y: 16, w: 420, h: 270 },
    help: { x: 16, y: 302, w: 460, h: 360 },
    "race-chat": { x: 448, y: 16, w: 360, h: 260 },
    debug: { x: 2000, y: -2000, w: 420, h: 360 },
    status: { x: 360, y: -2000, w: 330, h: 64 },
    settings: { x: 200, y: -2000, w: 440, h: 520 },
    hotbar: { x: 2000, y: -10, w: 540, h: 84 },
    xr: { x: 48, y: 48, w: 300, h: 136 },
  };
}

function layoutYaw(win) {
  const span = 2 * Math.atan((HUD_VR_SURFACE_WIDTH_M * 0.5) / HUD_VR_DISTANCE_M);
  return ((win.x + win.w / 2) / VR_LAYOUT_W - 0.5) * span;
}

test("open panels sit just past the forward cap, at the edge of the view", () => {
  const hud = windows();
  stageVrPanels({ windows: hud, layoutW: VR_LAYOUT_W });
  const cap = Math.atan((HUD_VR_SURFACE_WIDTH_M * 0.5) / HUD_VR_DISTANCE_M);
  assert.equal(hud.debug.y, -2000);
  assert.equal(hud.status.y, -2000);
  assert.equal(hud.settings.y, -2000);
  for (const key of ["race", "help", "hotbar"]) {
    const yaw = layoutYaw(hud[key]);
    assert.ok(yaw < -cap, `${key} is still on the forward cap ${yaw}`);
    assert.ok(Math.abs(yaw - -VR_SIDE_YAW) < 0.2, `${key} yaw ${yaw}`);
  }
  for (const key of ["race-chat", "xr"]) {
    const yaw = layoutYaw(hud[key]);
    assert.ok(yaw > cap, `${key} is still on the forward cap ${yaw}`);
    assert.ok(Math.abs(yaw - VR_SIDE_YAW) < 0.2, `${key} yaw ${yaw}`);
  }
  assert.ok(hud.xr.y > -1000);
  hud.settings.y = 40;
  stageVrPanels({ windows: hud, layoutW: VR_LAYOUT_W });
  const settingsYaw = layoutYaw(hud.settings);
  assert.ok(settingsYaw > cap);
  assert.ok(Math.abs(settingsYaw - VR_SIDE_YAW) < 0.2);
});

test("the mount keeps the sphere center fixed and the root at rotation 0", () => {
  const pitch = new THREE.Group();
  const mount = new THREE.Group();
  const root = new THREE.Group();
  pitch.add(mount);
  root.position.set(0.35, 1.45, -0.2);
  const anchor = root.position.clone();
  placeHudMount(mount, root, Math.PI, -0.32);
  assert.equal(root.parent, mount);
  assert.equal(root.rotation.x, 0);
  assert.equal(root.rotation.y, 0);
  assert.equal(root.rotation.z, 0);
  pitch.updateMatrixWorld(true);
  const world = new THREE.Vector3();
  root.getWorldPosition(world);
  const expected = anchor.clone().applyMatrix4(pitch.matrixWorld);
  assert.ok(world.distanceTo(expected) < 1e-4, `center moved ${world.distanceTo(expected)}`);
});
