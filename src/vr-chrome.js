// Halo's forward surface is about ±37°. A window on that cap covers the
// road. Halo's own side pins sit further around the sphere: x = -1000 on
// the left and x = 2000 on the right. Open panels go there. The mount does
// not cancel headset yaw, so turning your head looks around the sphere and
// brings a side panel into the locked picture. The root stays at rotation 0,
// which is the transform Halo raycasts. A hidden window stays hidden.

import * as THREE from "three";
import {
  HUD_VR_DISTANCE_M,
  HUD_VR_SURFACE_HEIGHT_M,
} from "../node_modules/@rb/halo/src/hud-placement-policy.js";

const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);
const _yaw = new THREE.Quaternion();
const _pitch = new THREE.Quaternion();
const _mount = new THREE.Quaternion();
const _spun = new THREE.Vector3();

export function placeHudMount(mount, root, poseYaw, eyePitch) {
  if (!mount || !root) return;
  if (root.parent !== mount) mount.add(root);
  _yaw.setFromAxisAngle(_axisY, Number(poseYaw) || 0);
  _pitch.setFromAxisAngle(_axisX, Number(eyePitch) || 0);
  _mount.copy(_yaw).multiply(_pitch);
  mount.quaternion.copy(_mount);
  _spun.copy(root.position).applyQuaternion(_mount);
  mount.position.copy(root.position).sub(_spun);
  root.rotation.set(0, 0, 0);
}

// Same side pins Halo uses for hotbar and chat. They are outside the
// forward layout, further around the sphere.
export const VR_LEFT_X = -1000;
export const VR_RIGHT_X = 2000;

const GAP = 24;
const LEFT_KEYS = ["race", "help", "hotbar"];
const RIGHT_KEYS = ["xr", "race-chat", "settings"];

function isOpen(win) {
  return !!win && Number(win.y) >= -1000;
}

function pitchSpan() {
  return 2 * Math.atan((HUD_VR_SURFACE_HEIGHT_M * 0.5) / Math.max(0.001, HUD_VR_DISTANCE_M));
}

export function stageVrPanels({ windows, layoutH = 640, eyePitch = 0 } = {}) {
  if (!windows) return;
  const height = Math.max(1, Number(layoutH) || 640);
  const look = Number(eyePitch) || 0;
  const placed = new Set();

  function yAt(pitch, h) {
    const cy = height * (0.5 - pitch / pitchSpan());
    return cy - h / 2;
  }

  function stack(keys, x, forceKey) {
    const items = [];
    for (const key of keys) {
      const win = windows[key];
      if (!win || (key !== forceKey && !isOpen(win))) continue;
      items.push({ key, win });
    }
    if (!items.length) return;
    let total = 0;
    for (const item of items) total += Math.max(1, Number(item.win.h) || 1);
    total += GAP * (items.length - 1);
    let y = yAt(look, total);
    for (const item of items) {
      const h = Math.max(1, Number(item.win.h) || 1);
      item.win.x = Math.round(x);
      item.win.y = Math.round(y);
      if (item.win.y < -900) item.win.y = -900;
      y = item.win.y + h + GAP;
      placed.add(item.key);
    }
  }

  stack(LEFT_KEYS, VR_LEFT_X, null);
  stack(RIGHT_KEYS, VR_RIGHT_X, "xr");

  for (const key of Object.keys(windows)) {
    if (placed.has(key) || !isOpen(windows[key])) continue;
    const countLeft = placed.size;
    stack([key], countLeft % 2 === 0 ? VR_LEFT_X : VR_RIGHT_X, key);
  }
}
