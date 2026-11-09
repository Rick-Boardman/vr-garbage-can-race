import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

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

function onCap(win) {
  assert.ok(win.y >= -1000, `parked y ${win.y}`);
  assert.ok(win.x >= 0 && win.x + win.w <= VR_LAYOUT_W, `x ${win.x} w ${win.w}`);
  assert.ok(win.y + win.h <= VR_LAYOUT_H, `y ${win.y} h ${win.h}`);
  const yaw = ((win.x + win.w / 2) / VR_LAYOUT_W - 0.5) * yawSpan();
  const pitch = (0.5 - (win.y + win.h / 2) / VR_LAYOUT_H) * pitchSpan();
  assert.ok(Math.abs(yaw) < yawSpan() * 0.5, `yaw ${yaw}`);
  assert.ok(Math.abs(pitch) < pitchSpan() * 0.5, `pitch ${pitch}`);
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function coversRoad(win) {
  const left = VR_LAYOUT_W * 0.34;
  const right = VR_LAYOUT_W * 0.66;
  return win.x < right && win.x + win.w > left;
}

test("open panels sit on the forward sphere and the road stays in the middle", () => {
  const hud = windows();
  stageVrPanels({ windows: hud, layoutW: VR_LAYOUT_W, layoutH: VR_LAYOUT_H });

  assert.equal(hud.settings.y, -2000);
  assert.equal(hud.debug.y, -2000);
  assert.equal(hud.status.y, -2000);

  for (const key of ["race", "help", "race-chat", "hotbar", "xr"]) onCap(hud[key]);
  for (const key of ["race", "help", "race-chat", "hotbar"]) {
    assert.equal(coversRoad(hud[key]), false, `${key} covers the road`);
    assert.equal(overlaps(hud.xr, hud[key]), false, `${key} covers Exit VR`);
  }
  assert.ok(hud.xr.x > VR_LAYOUT_W * 0.5, "Exit VR is on the right");
  assert.ok(hud.xr.y < VR_LAYOUT_H * 0.25, `Exit VR y ${hud.xr.y}`);
});

test("an opened settings panel stays on the sphere and off Exit VR", () => {
  const hud = windows();
  hud.settings.y = 40;
  stageVrPanels({ windows: hud, layoutW: VR_LAYOUT_W, layoutH: VR_LAYOUT_H });
  onCap(hud.settings);
  assert.equal(coversRoad(hud.settings), false);
  assert.equal(overlaps(hud.xr, hud.settings), false);
});

test("a yaw on the HUD root is the transform the laser multiplies", () => {
  const root = new THREE.Group();
  const plane = new THREE.Group();
  const mesh = new THREE.Mesh();
  root.add(plane);
  plane.add(mesh);
  root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1.2);
  root.quaternion.multiply(
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.32),
  );
  mesh.position.set(1.2, -0.4, -4);
  mesh.quaternion.setFromEuler(new THREE.Euler(0.1, -0.4, 0.2));
  root.updateMatrixWorld(true);
  const drawn = mesh.matrixWorld.clone();
  const cachedRoot = root.matrixWorld.clone();
  mesh.updateMatrix();
  root.rotation.set(0, 0, 0);
  root.updateMatrixWorld(true);
  const picked = new THREE.Matrix4().multiplyMatrices(cachedRoot, mesh.matrix);
  const drawnPos = new THREE.Vector3().setFromMatrixPosition(drawn);
  const pickedPos = new THREE.Vector3().setFromMatrixPosition(picked);
  assert.ok(drawnPos.distanceTo(pickedPos) < 1e-4, `laser missed by ${drawnPos.distanceTo(pickedPos)}`);
});
