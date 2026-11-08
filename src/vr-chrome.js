// While a headset session is up, the road stays clear. Readouts park off
// the layout. The hotbar sits on the bottom edge and Exit VR sits just
// above its right end. Direct x/y writes do not save the desktop layout.

export const VR_PARK_Y = -2000;

const PARKED = ["race", "race-chat", "debug", "status"];

function park(win) {
  if (win) win.y = VR_PARK_Y;
}

export function layoutVrChrome({
  windows,
  layoutW = 1024,
  layoutH = 640,
  helpWanted = false,
  settingsWanted = false,
} = {}) {
  if (!windows) return;
  const width = Math.max(1, Number(layoutW) || 1024);
  const height = Math.max(1, Number(layoutH) || 640);
  const margin = 16;

  for (const key of PARKED) park(windows[key]);
  if (!helpWanted) park(windows.help);
  if (!settingsWanted) park(windows.settings);

  const bar = windows.hotbar;
  const barH = bar?.h || 84;
  if (bar) {
    bar.x = Math.max(0, Math.round((width - bar.w) / 2));
    bar.y = Math.max(0, Math.round(height - bar.h - margin));
  }

  const xr = windows.xr;
  if (xr) {
    xr.x = Math.max(0, Math.round(width - xr.w - margin));
    xr.y = Math.max(0, Math.round(height - barH - margin - xr.h - 12));
  }
}
