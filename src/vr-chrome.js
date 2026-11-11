// The camera is locked to the road, so a window a quarter-turn around the
// sphere is outside the headset. Halo's forward cap is only ±37°, and a
// window there covers the road. Open panels sit just past that cap, about
// 50° off the look, which is the edge of the picture. The mount aims the
// sphere at that look. The root stays at rotation 0, which is what Halo
// raycasts. A hidden window stays hidden.

import * as THREE from "three";
import {
  HUD_VR_DISTANCE_M,
  HUD_VR_SURFACE_HEIGHT_M,
  HUD_VR_SURFACE_WIDTH_M,
} from "@rb/halo/src/hud-placement-policy.js";

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

export const VR_LAYOUT_W = 2800;
export const VR_LAYOUT_H = 1400;
// Just past the ±37° cap, still inside a headset lens.
export const VR_SIDE_YAW = 50 * Math.PI / 180;

const GAP = 24;
const LEFT_KEYS = ["race", "help", "hotbar"];
const RIGHT_KEYS = ["xr", "race-chat", "settings"];

function yawSpan() {
  return 2 * Math.atan((HUD_VR_SURFACE_WIDTH_M * 0.5) / Math.max(0.001, HUD_VR_DISTANCE_M));
}

function pitchSpan() {
  return 2 * Math.atan((HUD_VR_SURFACE_HEIGHT_M * 0.5) / Math.max(0.001, HUD_VR_DISTANCE_M));
}

function isOpen(win) {
  return !!win && Number(win.y) >= -1000;
}

export function stageVrPanels({
  windows,
  layoutW = VR_LAYOUT_W,
  layoutH = VR_LAYOUT_H,
  eyePitch = 0,
} = {}) {
  if (!windows) return;
  const width = Math.max(1, Number(layoutW) || VR_LAYOUT_W);
  const height = Math.max(1, Number(layoutH) || VR_LAYOUT_H);
  const look = Number(eyePitch) || 0;
  const placed = new Set();

  function xFor(yaw, w) {
    const cx = width * (0.5 + yaw / yawSpan());
    return Math.round(cx - w / 2);
  }

  function yAt(pitch, h) {
    const cy = height * (0.5 - pitch / pitchSpan());
    return cy - h / 2;
  }

  function stack(keys, yaw, forceKey) {
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
      const w = Math.max(1, Number(item.win.w) || 1);
      const h = Math.max(1, Number(item.win.h) || 1);
      item.win.x = xFor(yaw, w);
      item.win.y = Math.round(y);
      if (item.win.y < -900) item.win.y = -900;
      y = item.win.y + h + GAP;
      placed.add(item.key);
    }
  }

  stack(LEFT_KEYS, -VR_SIDE_YAW, null);
  stack(RIGHT_KEYS, VR_SIDE_YAW, "xr");

  for (const key of Object.keys(windows)) {
    if (placed.has(key) || !isOpen(windows[key])) continue;
    const yaw = placed.size % 2 === 0 ? -VR_SIDE_YAW : VR_SIDE_YAW;
    stack([key], yaw, key);
  }
}
