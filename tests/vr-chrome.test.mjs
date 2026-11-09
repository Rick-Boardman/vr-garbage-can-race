import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { keepVrWindowsOnSphere, placeHudMount } from "../src/vr-chrome.js";

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

test("Halo's layout stays put and a pin past the sphere is pulled back", () => {
  const hud = windows();
  keepVrWindowsOnSphere(hud, 1024, 640);
  assert.equal(hud.race.x, 16);
  assert.equal(hud.race.y, 16);
  assert.equal(hud.help.x, 16);
  assert.equal(hud["race-chat"].x, 448);
  assert.equal(hud.xr.x, 48);
  assert.equal(hud.debug.y, -2000);
  assert.equal(hud.status.y, -2000);
  assert.equal(hud.settings.y, -2000);
  assert.ok(hud.hotbar.x >= 0 && hud.hotbar.x + hud.hotbar.w <= 1024, `hotbar x ${hud.hotbar.x}`);
  assert.ok(hud.hotbar.y >= 0 && hud.hotbar.y + hud.hotbar.h <= 640, `hotbar y ${hud.hotbar.y}`);
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
