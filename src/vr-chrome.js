// The picture is locked down the road, and Halo keeps the HUD yaw at 0.
// A window in the middle of the layout sits in that picture. Open readouts
// go out to the side, where a head turn brings them in. Exit VR stays in
// the upper right of the picture so the laser can hit it. A hidden window
// stays hidden. Exit VR is the exception: a parked one is how a rider gets
// stuck in the headset.

import {
  HUD_VR_DISTANCE_M,
  HUD_VR_SURFACE_WIDTH_M,
} from "../node_modules/@rb/halo/src/hud-placement-policy.js";

export const VR_LAYOUT_H = 1200;
export const VR_SIDE_YAW = 75 * Math.PI / 180;
export const VR_EXIT_YAW = 28 * Math.PI / 180;

const PAD = 32;
const GAP = 28;
const LEFT_KEYS = ["race", "help", "hotbar"];
const RIGHT_KEYS = ["race-chat", "settings"];

function yawSpan() {
  return 2 * Math.atan((HUD_VR_SURFACE_WIDTH_M * 0.5) / Math.max(0.001, HUD_VR_DISTANCE_M));
}

function xForYaw(yaw, w, layoutW) {
  const width = Math.max(1, layoutW);
  const cx = width * (0.5 + yaw / yawSpan());
  return Math.round(cx - w / 2);
}

function isOpen(win) {
  return !!win && Number(win.y) >= -1000;
}

export function stageVrPanels({
  windows,
  layoutW = 1024,
  layoutH = VR_LAYOUT_H,
} = {}) {
  if (!windows) return;
  const width = Math.max(1, Number(layoutW) || 1024);
  const height = Math.max(1, Number(layoutH) || VR_LAYOUT_H);
  const placed = new Set();

  function place(key, yaw, y, force) {
    const win = windows[key];
    if (!win || (!force && !isOpen(win))) return y;
    const w = Math.max(1, Number(win.w) || 1);
    const h = Math.max(1, Number(win.h) || 1);
    const maxY = Math.max(PAD, height - h - PAD);
    win.x = xForYaw(yaw, w, width);
    win.y = Math.min(maxY, Math.max(PAD, y));
    placed.add(key);
    return win.y + h + GAP;
  }

  place("xr", VR_EXIT_YAW, PAD, true);

  let leftY = PAD;
  for (const key of LEFT_KEYS) leftY = place(key, -VR_SIDE_YAW, leftY, false);
  let rightY = PAD;
  for (const key of RIGHT_KEYS) rightY = place(key, VR_SIDE_YAW, rightY, false);

  for (const key of Object.keys(windows)) {
    if (placed.has(key) || !isOpen(windows[key])) continue;
    if (leftY <= rightY) leftY = place(key, -VR_SIDE_YAW, leftY, false);
    else rightY = place(key, VR_SIDE_YAW, rightY, false);
  }
}
