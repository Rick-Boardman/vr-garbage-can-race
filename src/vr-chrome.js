// Halo keeps the HUD root at rotation 0 and raycasts those live meshes
// after the frame. A yaw on the root draws the panels somewhere the click
// does not hit. The layout coordinates are the sphere: a window center at
// yaw/pitch sits in that direction around the head. Open panels are staged
// there, a few degrees either side of the look, so they stay in the picture
// and the ray hits the mesh that was drawn. A hidden window stays hidden.
// Exit VR is pulled back on.

import {
  HUD_VR_DISTANCE_M,
  HUD_VR_SURFACE_HEIGHT_M,
  HUD_VR_SURFACE_WIDTH_M,
} from "../node_modules/@rb/halo/src/hud-placement-policy.js";

export const VR_LAYOUT_W = 2200;
export const VR_LAYOUT_H = 1200;

const GAP = 28;
const COLUMN = 0.16;
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
  eyeYaw = 0,
  eyePitch = 0,
} = {}) {
  if (!windows) return;
  const width = Math.max(1, Number(layoutW) || VR_LAYOUT_W);
  const height = Math.max(1, Number(layoutH) || VR_LAYOUT_H);
  const lookYaw = Number(eyeYaw) || 0;
  const lookPitch = Number(eyePitch) || 0;
  const placed = new Set();

  function xFor(yaw, w) {
    const cx = width * (0.5 + yaw / yawSpan());
    return Math.round(cx - w / 2);
  }

  function yFor(pitch, h) {
    const cy = height * (0.5 - pitch / pitchSpan());
    return Math.round(cy - h / 2);
  }

  function stack(keys, yaw, forceKey) {
    const items = [];
    for (const key of keys) {
      const win = windows[key];
      if (!win || (key !== forceKey && !isOpen(win))) continue;
      items.push({ key, win });
    }
    if (!items.length) return 0;
    let total = 0;
    for (const item of items) total += Math.max(1, Number(item.win.h) || 1);
    total += GAP * (items.length - 1);
    let y = yFor(lookPitch, total);
    let bottom = y;
    for (const item of items) {
      const w = Math.max(1, Number(item.win.w) || 1);
      const h = Math.max(1, Number(item.win.h) || 1);
      item.win.x = xFor(yaw, w);
      item.win.y = y < -900 ? -900 : y;
      y = item.win.y + h + GAP;
      bottom = y;
      placed.add(item.key);
    }
    return bottom;
  }

  const leftBottom = stack(LEFT_KEYS, lookYaw + COLUMN, null);
  const rightBottom = stack(RIGHT_KEYS, lookYaw - COLUMN, "xr");

  let leftY = leftBottom || yFor(lookPitch, 0);
  let rightY = rightBottom || yFor(lookPitch, 0);
  for (const key of Object.keys(windows)) {
    if (placed.has(key) || !isOpen(windows[key])) continue;
    const win = windows[key];
    const w = Math.max(1, Number(win.w) || 1);
    const h = Math.max(1, Number(win.h) || 1);
    const yaw = leftY <= rightY ? lookYaw + COLUMN : lookYaw - COLUMN;
    win.x = xFor(yaw, w);
    win.y = (leftY <= rightY ? leftY : rightY);
    if (win.y < -900) win.y = -900;
    const next = win.y + h + GAP;
    if (leftY <= rightY) leftY = next;
    else rightY = next;
    placed.add(key);
  }
}
