// The picture is locked down the road. Halo draws every window with
// y >= -1000 on the sphere in front of that picture, and hides the rest.
// Its forward grid fills the picture. Its side pins (x 2000 and x -1000)
// sit outside the locked view, so a rider cannot turn their head to reach
// them. Open windows go in the outer columns of this wider VR layout. The
// middle of the picture stays the road, and a controller can still hit
// the columns.

export const VR_LAYOUT_W = 2048;
export const VR_LAYOUT_H = 1200;

const PAD = 32;
const GAP = 28;
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

  function place(key, align, y) {
    const win = windows[key];
    if (!isOpen(win)) return y;
    const w = Math.max(1, Number(win.w) || 1);
    const h = Math.max(1, Number(win.h) || 1);
    const maxY = Math.max(PAD, height - h - PAD);
    win.x = align === "left" ? PAD : Math.round(width - PAD - w);
    win.y = Math.min(maxY, Math.max(PAD, y));
    placed.add(key);
    return win.y + h + GAP;
  }

  let leftY = PAD;
  for (const key of LEFT_KEYS) leftY = place(key, "left", leftY);
  let rightY = PAD;
  for (const key of RIGHT_KEYS) rightY = place(key, "right", rightY);

  for (const key of Object.keys(windows)) {
    if (placed.has(key) || !isOpen(windows[key])) continue;
    if (leftY <= rightY) leftY = place(key, "left", leftY);
    else rightY = place(key, "right", rightY);
  }
}
