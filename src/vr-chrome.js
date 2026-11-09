// The mount aims Halo's sphere at the locked look, and the root stays at
// rotation 0 so the click hits the drawn mesh. That aim puts the middle of
// the layout over the road. Open panels sit on the left and right edges of
// the layout, which is the edge of the sphere, so the road stays clear and
// the panels stay in the picture. A hidden window stays hidden. Exit VR is
// pulled onto the right edge.

import * as THREE from "three";

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

export const VR_LAYOUT_W = 3200;
export const VR_LAYOUT_H = 1600;

const GAP = 24;
const LEFT_KEYS = ["race", "help", "hotbar"];
const RIGHT_KEYS = ["xr", "race-chat", "settings"];

function isOpen(win) {
  return !!win && Number(win.y) >= -1000;
}

export function stageVrPanels({
  windows,
  layoutW = VR_LAYOUT_W,
  layoutH = VR_LAYOUT_H,
} = {}) {
  if (!windows) return;
  const width = Math.max(1, Number(layoutW) || VR_LAYOUT_W);
  const height = Math.max(1, Number(layoutH) || VR_LAYOUT_H);
  const placed = new Set();

  function place(key, x, y, force) {
    const win = windows[key];
    if (!win || (!force && !isOpen(win))) return y;
    const w = Math.max(1, Number(win.w) || 1);
    const h = Math.max(1, Number(win.h) || 1);
    const maxX = Math.max(0, width - w);
    const maxY = Math.max(0, height - h);
    win.x = Math.round(Math.min(maxX, Math.max(0, x)));
    win.y = Math.round(Math.min(maxY, Math.max(0, y)));
    placed.add(key);
    return win.y + h + GAP;
  }

  let leftY = 0;
  for (const key of LEFT_KEYS) leftY = place(key, 0, leftY, false);

  let rightY = 0;
  for (const key of RIGHT_KEYS) {
    const w = Math.max(1, Number(windows[key]?.w) || 1);
    rightY = place(key, width - w, rightY, key === "xr");
  }

  for (const key of Object.keys(windows)) {
    if (placed.has(key) || !isOpen(windows[key])) continue;
    const w = Math.max(1, Number(windows[key].w) || 1);
    if (leftY <= rightY) leftY = place(key, 0, leftY, false);
    else rightY = place(key, width - w, rightY, false);
  }
}
