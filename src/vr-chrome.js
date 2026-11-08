// Halo draws every window with y >= -1000 on the headset slab. A hidden
// window stays hidden. Anything else is pulled back onto that slab so a
// pinned hotbar at x 2000 is still in front of the rider. Halo's own
// presenting clamp returns immediately, so this is the VR pass.

export function keepVrPanelsOnSlab({
  windows,
  layoutW = 1024,
  layoutH = 640,
} = {}) {
  if (!windows) return;
  const width = Math.max(1, Number(layoutW) || 1024);
  const height = Math.max(1, Number(layoutH) || 640);
  for (const win of Object.values(windows)) {
    if (!win || Number(win.y) < -1000) continue;
    const w = Math.max(1, Number(win.w) || 1);
    const h = Math.max(1, Number(win.h) || 1);
    const maxX = Math.max(0, width - w);
    const maxY = Math.max(0, height - h);
    win.x = Math.min(maxX, Math.max(0, Number(win.x) || 0));
    win.y = Math.min(maxY, Math.max(0, Number(win.y) || 0));
  }
}
