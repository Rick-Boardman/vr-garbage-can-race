import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  HUD_VR_DISTANCE_M,
  HUD_VR_SURFACE_WIDTH_M,
} from "../node_modules/@rb/halo/src/hud-placement-policy.js";
import { placeHudMount, stageVrPanels, VR_LAYOUT_H, VR_LAYOUT_W } from "../src/vr-chrome.js";

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

function overlapsRoad(win) {
  const left = VR_LAYOUT_W * 0.28;
  const right = VR_LAYOUT_W * 0.72;
  return win.x < right && win.x + win.w > left;
}

function onEdge(win) {
  assert.ok(win.y >= 0 && win.y + win.h <= VR_LAYOUT_H, `y ${win.y}`);
  assert.ok(win.x >= 0 && win.x + win.w <= VR_LAYOUT_W, `x ${win.x}`);
  const yawSpan = 2 * Math.atan((HUD_VR_SURFACE_WIDTH_M * 0.5) / HUD_VR_DISTANCE_M);
  const yaw = ((win.x + win.w / 2) / VR_LAYOUT_W - 0.5) * yawSpan;
  assert.ok(Math.abs(yaw) < yawSpan * 0.5, `off the sphere ${yaw}`);
  assert.equal(overlapsRoad(win), false);
}

test("open panels sit on the side of the sphere and the road stays clear", () => {
  const hud = windows();
  stageVrPanels({ windows: hud, layoutW: VR_LAYOUT_W, layoutH: VR_LAYOUT_H });
  assert.equal(hud.debug.y, -2000);
  assert.equal(hud.status.y, -2000);
  assert.equal(hud.settings.y, -2000);
  for (const key of ["race", "help", "race-chat", "hotbar", "xr"]) onEdge(hud[key]);
  hud.settings.y = 40;
  stageVrPanels({ windows: hud, layoutW: VR_LAYOUT_W, layoutH: VR_LAYOUT_H });
  onEdge(hud.settings);
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
