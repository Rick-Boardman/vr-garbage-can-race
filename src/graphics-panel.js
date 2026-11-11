// The game's graphics and sound window: Halo's settings window
// (createHudSettingsWindow) with this game's palette, an "Extreme crashes"
// checkbox, and its top-right placement. The controls, hit testing, typing and
// painting are Halo's.

import { createHudSettingsWindow, settingsCallbacksFromCalibration } from "@rb/halo/ui";
import { readExtreme, writeExtreme } from "./extreme.js";

export const GRAPHICS_PALETTE = Object.freeze({
  field: "#1c2610",
  fieldEdge: "#d4b56a",
  ink: "#f3e2b0",
  accent: "#e8c97a",
  hot: "#2a3818",
  well: "#14190c",
});

// The skinned window frame is wide, so the rows sit 48 px in from its edge.
export const GRAPHICS_METRICS = Object.freeze({ pad: 48 });

// Rows the game adds under Mute, above Calibrate again.
// The box shows what was chosen even when a private window refuses the write.
export function extremeRow({ read = readExtreme, write = writeExtreme } = {}) {
  let on = !!read();
  return {
    kind: "checkbox",
    key: "extreme",
    label: "Extreme crashes",
    checked: () => on,
    onToggle: (next) => {
      on = !!next;
      write(on);
    },
  };
}

export function createGraphicsPanel({ THREE, hudSystem, calibration, renderer, notes = null }) {
  return createHudSettingsWindow({
    THREE,
    hudSystem,
    renderer,
    ...settingsCallbacksFromCalibration(calibration),
    extraRows: [extremeRow()],
    notes,
    palette: GRAPHICS_PALETTE,
    metrics: GRAPHICS_METRICS,
  });
}

// Pin the settings window to the top-right until the rider drags or resizes it.
// moved is sticky. A later call must not write the corner back over the drop.
export function nextSettingsPlacement(win, layoutW, moved = false) {
  if (!win || !(layoutW >= 320)) return !!moved;
  const dragging = !!win.dragging || !!win.resizing;
  if (!(win.minW >= 440)) win.minW = 440;
  if (!(win.minH >= 520)) win.minH = 520;
  if (!moved && !dragging) {
    if (win.w < 420) win.w = 440;
    if (win.h < 520) win.h = 520;
  }
  if (dragging) return true;
  // Closed windows sit offscreen. Pulling them back would reopen the panel.
  if (win.y < -1000) return !!moved;
  if (!moved) {
    win.x = Math.max(16, Math.round(layoutW - win.w - 16));
    win.y = 16;
  }
  win._settingsHiddenX = win.x;
  win._settingsHiddenY = win.y;
  return !!moved;
}
