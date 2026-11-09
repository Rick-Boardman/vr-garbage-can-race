// Halo owns the window layout and the click. The game does not restage
// those windows. The road lock yaws the rig opposite the headset, which
// swings Halo's sphere off the picture and away from the laser. placeHudMount
// yaws only a parent Halo does not reset, so the root stays at rotation 0
// (the transform Halo raycasts) and the forward cap stays on the look.
// A window Halo pinned past the layout is pulled back onto that cap.
// A hidden window stays hidden.

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

export function keepVrWindowsOnSphere(windows, layoutW = 1024, layoutH = 640) {
  if (!windows) return;
  const width = Math.max(1, Number(layoutW) || 1024);
  const height = Math.max(1, Number(layoutH) || 640);
  for (const win of Object.values(windows)) {
    if (!win || Number(win.y) < -1000) continue;
    const w = Math.max(1, Number(win.w) || 1);
    const h = Math.max(1, Number(win.h) || 1);
    const x = Number(win.x) || 0;
    const y = Number(win.y) || 0;
    const cx = x + w / 2;
    const cy = y + h / 2;
    if (cx >= 0 && cx <= width && cy >= 0 && cy <= height) continue;
    win.x = Math.min(Math.max(0, width - w), Math.max(0, Math.round(x)));
    win.y = Math.min(Math.max(0, height - h), Math.max(0, Math.round(y)));
  }
}
