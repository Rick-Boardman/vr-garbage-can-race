import { createWebXrSystemKeyboardBridge } from "../node_modules/@rb/halo/src/webxr-system-keyboard.js";

// In-scene graphics and sound controls. Halo's settings window otherwise
// draws clickable text rows. These are a dropdown, a number field, checkboxes,
// a slider, and a button, drawn on the window so they work on the desktop and
// in VR.

const TITLE_H = 40;
const PAD = 48;
const LABEL_W = 118;
const ROW_H = 36;
const GAP = 8;
const OPTION_H = 32;

const FIELD = "#1c2610";
const FIELD_EDGE = "#d4b56a";
const INK = "#f3e2b0";
const ACCENT = "#e8c97a";
const HOT = "#2a3818";
const WELL = "#14190c";

export function qualityOptions(tiers) {
  const last = Math.max(0, tiers.length - 1);
  const medium = Math.max(0, Math.min(last, Math.floor((tiers.length - 1) / 2)));
  const options = [{ name: "Low", index: 0 }];
  if (medium !== 0) options.push({ name: "Medium", index: medium });
  if (last !== medium) options.push({ name: "High", index: last });
  return options;
}

export function qualityLabel(index, tiers) {
  const match = qualityOptions(tiers).find((option) => option.index === index);
  return match ? match.name : "Custom";
}

export function nearestTierIndex(value, tiers) {
  if (!tiers.length || !Number.isFinite(value)) return 0;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < tiers.length; i += 1) {
    const dist = Math.abs(tiers[i] - value);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

export function sanitizeRatio(value) {
  let out = "";
  let dot = false;
  for (const ch of String(value || "")) {
    if (ch >= "0" && ch <= "9") out += ch;
    else if (ch === "." && !dot) {
      dot = true;
      out += ".";
    }
    if (out.length >= 5) break;
  }
  return out;
}

function contains(box, x, y) {
  return x >= box.x && y >= box.y && x < box.x + box.w && y < box.y + box.h;
}

function noteLinesOf(notes) {
  if (typeof notes !== "function") return [];
  const lines = notes();
  if (!Array.isArray(lines)) return [];
  return lines.map((line) => String(line ?? "")).filter((line) => line !== "");
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

export function panelLayout(width, height, tiers) {
  const w = Math.max(1, width);
  const controlX = PAD + LABEL_W;
  const controlW = Math.max(80, w - controlX - PAD);
  let y = TITLE_H + 12;
  const status = { x: PAD, y, w: w - PAD * 2, h: 22 };
  y += 22 + GAP;
  const quality = { x: controlX, y, w: controlW, h: ROW_H };
  y += ROW_H + GAP;
  const ratio = { x: controlX, y, w: controlW, h: ROW_H };
  y += ROW_H + GAP;
  const automatic = { x: PAD, y, w: w - PAD * 2, h: ROW_H };
  y += ROW_H + GAP;
  const volume = { x: controlX, y, w: Math.max(80, controlW - 64), h: ROW_H };
  y += ROW_H + GAP;
  const mute = { x: PAD, y, w: w - PAD * 2, h: ROW_H };
  y += ROW_H + GAP;
  const calibrate = { x: PAD, y, w: w - PAD * 2, h: 36 };
  const named = qualityOptions(tiers);
  let options = named.map((option, i) => ({
    ...option,
    x: quality.x,
    y: quality.y + quality.h + 4 + i * OPTION_H,
    w: quality.w,
    h: OPTION_H,
  }));
  const listBottom = options.length ? options[options.length - 1].y + OPTION_H : 0;
  if (listBottom > height - 8) {
    const listH = options.length * OPTION_H;
    options = options.map((option, i) => ({
      ...option,
      y: quality.y - 4 - listH + i * OPTION_H,
    }));
  }
  return { status, quality, options, ratio, automatic, volume, mute, calibrate };
}

export function createGraphicsPanel({ THREE, hudSystem, calibration, renderer, notes = null }) {
  let mesh = null;
  let texture = null;
  let canvas = null;
  let view = null;
  let prevDown = false;
  let pressed = false;
  let pointerDown = false;
  let pointerX = 0;
  let pointerY = 0;
  let sliding = false;
  let ratioFocused = false;
  let ratioDraft = "";
  let menuOpen = false;
  let signature = "";
  let hoverKey = "";
  let keyboard = null;

  const onKeyDown = (event) => handleKey(event);
  window.addEventListener("keydown", onKeyDown, true);

  try {
    keyboard = createWebXrSystemKeyboardBridge({
      renderer,
      getValue: () => ratioDraft,
      onInput: (value) => {
        ratioDraft = sanitizeRatio(value);
        signature = "";
      },
      onDismiss: () => commitRatio(),
    });
  } catch {
    keyboard = null;
  }

  function root() {
    return hudSystem?.hud ?? null;
  }

  function settingsWindow() {
    return root()?.ui?.windows?.settings ?? null;
  }

  function shown(win) {
    return !!win && !win.collapsed && win.y > -1000;
  }

  function prepare() {
    const win = settingsWindow();
    if (win) {
      win.scrollable = false;
      win.contentBgOpacity = 0;
    }
    capturePointer();
  }

  function afterHud() {
    const win = settingsWindow();
    if (!win) return;
    silenceChrome();
    ensureMesh();
    syncPointer(win);
    paint(win);
  }

  function isTyping() {
    return ratioFocused;
  }

  function dispose() {
    window.removeEventListener("keydown", onKeyDown, true);
    keyboard?.close();
    keyboard = null;
    mesh?.removeFromParent();
    mesh?.geometry?.dispose();
    const material = mesh?.material;
    if (material && !Array.isArray(material)) material.dispose();
    texture?.dispose();
    mesh = null;
    texture = null;
    canvas = null;
    view = null;
  }

  function capturePointer() {
    const hud = root();
    const presenting = renderer?.xr?.isPresenting === true;
    const pointer = presenting ? hud?.vrPointer : hud?.pointer;
    const down = !!pointer?.down;
    pressed = !!pointer?.justPressed || (down && !prevDown);
    pointerDown = down;
    pointerX = Number(pointer?.x);
    pointerY = Number(pointer?.y);
  }

  function syncPointer(win) {
    const down = pointerDown;
    const wasPressed = pressed;
    prevDown = down;
    if (!shown(win)) {
      sliding = false;
      hoverKey = "";
      if (menuOpen) menuOpen = false;
      if (ratioFocused) commitRatio();
      return;
    }
    const x = pointerX - win.x;
    const y = pointerY - win.y;
    const layout = panelLayout(win.w, win.h, calibration.tiers);
    if (sliding && down) setVolumeFromX(x, layout);
    if (!down) sliding = false;
    if (wasPressed) onPress(x, y, layout);
    else if (down || menuOpen) hoverKey = hitKey(x, y, layout);
    else hoverKey = "";
  }

  function onPress(x, y, layout) {
    if (menuOpen) {
      const option = layout.options.find((item) => contains(item, x, y));
      if (option) {
        calibration.lockTier(option.index);
        menuOpen = false;
        blurRatio(true);
        return;
      }
      if (!contains(layout.quality, x, y)) menuOpen = false;
    }
    if (contains(layout.quality, x, y)) {
      menuOpen = !menuOpen;
      blurRatio(true);
      return;
    }
    if (contains(layout.ratio, x, y)) {
      focusRatio();
      return;
    }
    blurRatio(true);
    if (contains(layout.automatic, x, y)) {
      if (calibration.mode === "auto") calibration.lockTier(calibration.index);
      else calibration.setAuto();
      return;
    }
    if (contains(layout.volume, x, y)) {
      sliding = true;
      setVolumeFromX(x, layout);
      return;
    }
    if (contains(layout.mute, x, y)) {
      calibration.setMuted(!calibration.audio.muted);
      return;
    }
    if (contains(layout.calibrate, x, y)) calibration.recalibrate();
  }

  function hitKey(x, y, layout) {
    if (menuOpen) {
      const option = layout.options.find((item) => contains(item, x, y));
      if (option) return option.name;
    }
    if (contains(layout.quality, x, y)) return "quality";
    if (contains(layout.ratio, x, y)) return "ratio";
    if (contains(layout.automatic, x, y)) return "automatic";
    if (contains(layout.volume, x, y)) return "volume";
    if (contains(layout.mute, x, y)) return "mute";
    if (contains(layout.calibrate, x, y)) return "calibrate";
    return "";
  }

  function setVolumeFromX(x, layout) {
    const inset = 14;
    const span = Math.max(1, layout.volume.w - inset * 2);
    const t = (x - (layout.volume.x + inset)) / span;
    calibration.setVolume(Math.min(1, Math.max(0, t)));
  }

  function focusRatio() {
    if (ratioFocused) return;
    ratioDraft = calibration.pixelRatio.toFixed(2);
    ratioFocused = true;
    signature = "";
    if (keyboard?.isSupported?.()) keyboard.open();
  }

  function blurRatio(commit) {
    if (!ratioFocused) return;
    if (commit) commitRatio();
    else {
      ratioFocused = false;
      ratioDraft = "";
      keyboard?.close();
      signature = "";
    }
  }

  function commitRatio() {
    if (!ratioFocused && !ratioDraft) return;
    const draft = ratioDraft;
    ratioFocused = false;
    ratioDraft = "";
    keyboard?.close();
    signature = "";
    const value = Number(draft);
    if (!Number.isFinite(value) || draft === "" || draft === ".") return;
    const index = nearestTierIndex(value, calibration.tiers);
    if (index !== calibration.index) calibration.lockTier(index);
  }

  function handleKey(event) {
    if (!ratioFocused) return;
    const key = event.key;
    if (key === "Tab") return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (key === "Escape") {
      blurRatio(false);
      return;
    }
    if (key === "Enter") {
      commitRatio();
      return;
    }
    if (key === "Backspace") {
      ratioDraft = ratioDraft.slice(0, -1);
      signature = "";
      return;
    }
    if ((key >= "0" && key <= "9") || key === ".") {
      ratioDraft = sanitizeRatio(ratioDraft + key);
      signature = "";
    }
  }

  function silenceChrome() {
    const objs = root()?.objects?.windows?.settings;
    if (!objs) return;
    for (const part of [objs.contentBg, objs.scrollTrack, objs.scrollThumb, objs.scrollUpBtn, objs.scrollDownBtn]) {
      if (part) part.visible = false;
    }
    const text = objs.contentText;
    if (text) text.visible = false;
    if (text?.mesh) text.mesh.visible = false;
  }

  function ensureMesh() {
    const bg = root()?.objects?.windows?.settings?.bg;
    const plane = bg?.parent;
    if (!plane?.add) return;
    if (!mesh) {
      const geometry = new THREE.PlaneGeometry(1, 1);
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
    }
    if (mesh.parent !== plane) plane.add(mesh);
    // The skinned frame hides the window plate, and a child of that plate
    // would disappear with it. Follow the plate's transform from the HUD plane.
    mesh.position.copy(bg.position);
    mesh.quaternion.copy(bg.quaternion);
    mesh.scale.copy(bg.scale);
    mesh.renderOrder = (bg.renderOrder || 0) + 20;
    mesh.visible = shown(settingsWindow());
  }

  function paint(win) {
    const blink = ratioFocused && Math.floor(performance.now() / 450) % 2 === 0;
    const audio = calibration.audio;
    const noteLines = noteLinesOf(notes);
    const sig = [
      win.w,
      win.h,
      calibration.phase,
      calibration.index,
      calibration.pixelRatio,
      calibration.mode,
      audio.level,
      audio.muted,
      menuOpen,
      ratioFocused,
      ratioDraft,
      blink,
      hoverKey,
      shown(win),
      noteLines.join("\n"),
    ].join("|");
    if (sig === signature && texture) return;
    signature = sig;
    const scale = Math.min(2, 2048 / Math.max(win.w, win.h, 1));
    const width = Math.max(1, Math.round(win.w * scale));
    const height = Math.max(1, Math.round(win.h * scale));
    if (!canvas) canvas = document.createElement("canvas");
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      texture?.dispose();
      texture = null;
      const material = mesh?.material;
      if (material && !Array.isArray(material)) material.map = null;
    }
    view = canvas.getContext("2d", { alpha: true });
    if (!view) return;
    view.setTransform(scale, 0, 0, scale, 0, 0);
    view.clearRect(0, 0, win.w, win.h);
    if (!shown(win)) {
      upload();
      return;
    }
    const layout = panelLayout(win.w, win.h, calibration.tiers);
    const busy = calibration.phase !== "settled";
    const ratio = calibration.pixelRatio.toFixed(2);
    drawStatus(layout.status, busy ? `Calibrating ${ratio}` : `Picture ${ratio}`);
    drawLabel(layout.quality, "Quality");
    drawField(layout.quality, qualityLabel(calibration.index, calibration.tiers), true, hoverKey === "quality");
    drawLabel(layout.ratio, "Ratio");
    drawField(layout.ratio, ratioFocused ? ratioDraft : ratio, false, ratioFocused || hoverKey === "ratio", blink);
    drawCheck(layout.automatic, "Automatic", calibration.mode === "auto", hoverKey === "automatic");
    drawLabel(layout.volume, "Volume");
    drawSlider(layout.volume, audio.level);
    drawCheck(layout.mute, "Mute", audio.muted, hoverKey === "mute");
    drawButton(layout.calibrate, "Calibrate again", hoverKey === "calibrate");
    drawNotes(layout.calibrate, noteLines);
    if (menuOpen) {
      for (const option of layout.options) {
        drawOption(option, option.name, option.index === calibration.index || hoverKey === option.name);
      }
    }
    upload();
  }

  function upload() {
    if (!canvas || !mesh) return;
    const material = mesh.material;
    if (!texture) {
      texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = true;
      texture.premultiplyAlpha = false;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      material.map = texture;
    } else if (texture.image !== canvas) {
      texture.image = canvas;
    }
    texture.needsUpdate = true;
    material.needsUpdate = true;
  }

  function drawNotes(anchor, lines) {
    if (!view || !lines.length) return;
    view.font = "14px Segoe UI, Trebuchet MS, sans-serif";
    view.fillStyle = INK;
    view.textAlign = "left";
    view.textBaseline = "middle";
    let y = anchor.y + anchor.h + 22;
    for (const line of lines) {
      view.fillText(line, PAD, y);
      y += 20;
    }
  }

  function drawStatus(box, text) {
    if (!view) return;
    view.font = "14px Segoe UI, Trebuchet MS, sans-serif";
    view.fillStyle = INK;
    view.textAlign = "left";
    view.textBaseline = "middle";
    view.fillText(text, box.x, box.y + box.h / 2);
  }

  function drawLabel(box, text) {
    if (!view) return;
    view.font = "15px Segoe UI, Trebuchet MS, sans-serif";
    view.fillStyle = ACCENT;
    view.textAlign = "left";
    view.textBaseline = "middle";
    view.fillText(text, PAD, box.y + box.h / 2);
  }

  function drawField(box, text, chevron, hot, blink = false) {
    if (!view) return;
    round(box, FIELD, hot ? ACCENT : FIELD_EDGE);
    view.font = "16px Segoe UI, Trebuchet MS, sans-serif";
    view.fillStyle = INK;
    view.textAlign = "left";
    view.textBaseline = "middle";
    view.fillText(text, box.x + 12, box.y + box.h / 2);
    if (hot && blink && ratioFocused) {
      const caret = box.x + 12 + view.measureText(text).width + 2;
      view.fillRect(caret, box.y + 8, 1.5, box.h - 16);
    }
    if (chevron) {
      view.strokeStyle = ACCENT;
      view.lineWidth = 1.6;
      view.beginPath();
      const cx = box.x + box.w - 18;
      const cy = box.y + box.h / 2;
      view.moveTo(cx - 5, cy - 2);
      view.lineTo(cx, cy + 3);
      view.lineTo(cx + 5, cy - 2);
      view.stroke();
    }
  }

  function drawOption(box, text, hot) {
    if (!view) return;
    round(box, hot ? HOT : WELL, FIELD_EDGE);
    view.font = "16px Segoe UI, Trebuchet MS, sans-serif";
    view.fillStyle = INK;
    view.textAlign = "left";
    view.textBaseline = "middle";
    view.fillText(text, box.x + 12, box.y + box.h / 2);
  }

  function drawCheck(row, label, on, hot) {
    if (!view) return;
    const box = { x: row.x, y: row.y + (row.h - 22) / 2, w: 22, h: 22 };
    round(box, on ? HOT : FIELD, hot || on ? ACCENT : FIELD_EDGE);
    if (on) {
      view.strokeStyle = ACCENT;
      view.lineWidth = 2;
      view.beginPath();
      view.moveTo(box.x + 5, box.y + 11);
      view.lineTo(box.x + 9, box.y + 16);
      view.lineTo(box.x + 17, box.y + 6);
      view.stroke();
    }
    view.font = "16px Segoe UI, Trebuchet MS, sans-serif";
    view.fillStyle = INK;
    view.textAlign = "left";
    view.textBaseline = "middle";
    view.fillText(label, box.x + 32, row.y + row.h / 2);
  }

  function drawSlider(box, level) {
    if (!view) return;
    const track = { x: box.x, y: box.y + box.h / 2 - 5, w: box.w, h: 10 };
    round(track, FIELD, FIELD_EDGE);
    const inset = 14;
    const span = Math.max(1, box.w - inset * 2);
    const knob = box.x + inset + Math.min(1, Math.max(0, level)) * span;
    round({ x: box.x + 2, y: track.y, w: Math.max(8, knob - box.x - 2), h: track.h }, ACCENT, ACCENT);
    view.beginPath();
    view.fillStyle = INK;
    view.arc(knob, box.y + box.h / 2, 9, 0, Math.PI * 2);
    view.fill();
    view.strokeStyle = WELL;
    view.lineWidth = 1;
    view.stroke();
    view.font = "14px Segoe UI, Trebuchet MS, sans-serif";
    view.fillStyle = INK;
    view.textAlign = "left";
    view.textBaseline = "middle";
    view.fillText(`${Math.round(level * 100)}%`, box.x + box.w + 12, box.y + box.h / 2);
  }

  function drawButton(box, text, hot) {
    if (!view) return;
    round(box, hot ? HOT : FIELD, hot ? ACCENT : FIELD_EDGE);
    view.font = "16px Segoe UI, Trebuchet MS, sans-serif";
    view.fillStyle = INK;
    view.textAlign = "center";
    view.textBaseline = "middle";
    view.fillText(text, box.x + box.w / 2, box.y + box.h / 2);
  }

  function round(box, fill, stroke) {
    if (!view) return;
    const radius = Math.min(8, box.h / 2);
    view.beginPath();
    view.roundRect(box.x, box.y, box.w, box.h, radius);
    view.fillStyle = fill;
    view.fill();
    view.strokeStyle = stroke;
    view.lineWidth = 1;
    view.stroke();
  }

  return { prepare, afterHud, isTyping, dispose };
}
