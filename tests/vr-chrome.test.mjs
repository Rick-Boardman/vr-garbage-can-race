import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  HUD_VR_DISTANCE_M,
  HUD_VR_SURFACE_WIDTH_M,
} from "../node_modules/@rb/halo/src/hud-placement-policy.js";
import { placeHudMount, stageVrPanels, VR_LEFT_X, VR_RIGHT_X } from "../src/vr-chrome.js";

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
  return ((win.x + win.w / 2) / 1024 - 0.5) * span;
}

test("open panels sit on Halo's side pins, further around than the forward cap", () => {
  const hud = windows();
  stageVrPanels({ windows: hud });
  const cap = Math.atan((HUD_VR_SURFACE_WIDTH_M * 0.5) / HUD_VR_DISTANCE_M);
  assert.equal(hud.debug.y, -2000);
  assert.equal(hud.status.y, -2000);
  assert.equal(hud.settings.y, -2000);
  assert.equal(hud.race.x, VR_LEFT_X);
  assert.equal(hud.hotbar.x, VR_LEFT_X);
  assert.equal(hud["race-chat"].x, VR_RIGHT_X);
  assert.equal(hud.xr.x, VR_RIGHT_X);
  assert.ok(hud.xr.y > -1000);
  for (const key of ["race", "help", "race-chat", "hotbar", "xr"]) {
    const yaw = layoutYaw(hud[key]);
    assert.ok(Math.abs(yaw) > cap, `${key} is still on the forward cap ${yaw}`);
  }
  hud.settings.y = 40;
  stageVrPanels({ windows: hud });
  assert.equal(hud.settings.x, VR_RIGHT_X);
  assert.ok(Math.abs(layoutYaw(hud.settings)) > cap);
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
