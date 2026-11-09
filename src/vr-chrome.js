// The picture is locked to the road, or to the walk face. Halo draws a
// window on the forward sphere only when its rectangle sits inside the
// layout. Open panels stay inside that cap, at the sides, so the road
// stays in the middle and the panels stay in the picture. Exit VR is
// pulled onto the top right of the same cap. A hidden window stays hidden.

export const VR_LAYOUT_W = 2200;
export const VR_LAYOUT_H = 1200;

const PAD = 32;
const GAP = 28;
const LEFT_KEYS = ["race", "help", "hotbar"];
const RIGHT_KEYS = ["race-chat", "settings"];

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
    const maxX = Math.max(PAD, width - w - PAD);
    const maxY = Math.max(PAD, height - h - PAD);
    win.x = Math.min(maxX, Math.max(PAD, Math.round(x)));
    win.y = Math.min(maxY, Math.max(PAD, Math.round(y)));
    placed.add(key);
    return win.y + h + GAP;
  }

  const xr = windows.xr;
  const xrW = Math.max(1, Number(xr?.w) || 300);
  const xrH = Math.max(1, Number(xr?.h) || 136);
  place("xr", width - xrW - PAD, PAD, true);

  let leftY = PAD;
  for (const key of LEFT_KEYS) leftY = place(key, PAD, leftY, false);

  let rightY = PAD + xrH + GAP;
  for (const key of RIGHT_KEYS) {
    const w = Math.max(1, Number(windows[key]?.w) || 1);
    rightY = place(key, width - w - PAD, rightY, false);
  }

  for (const key of Object.keys(windows)) {
    if (placed.has(key) || !isOpen(windows[key])) continue;
    const w = Math.max(1, Number(windows[key].w) || 1);
    if (leftY <= rightY) leftY = place(key, PAD, leftY, false);
    else rightY = place(key, width - w - PAD, rightY, false);
  }
}
