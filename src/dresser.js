// Game-owned rider/can styling and preview. Magna owns the lobby.
import * as THREE from "three";
import { createMaterials } from "./materials.js";
import {
  AGES,
  BODIES,
  BOTTOMS,
  CAN_COLORS,
  CAN_FEATURES,
  CAN_MATERIALS,
  CAN_SHAPES,
  CAN_SIZES,
  COMPLEXIONS,
  HAIR_COLORS,
  HAIR_STYLES,
  HATS,
  LOGO_COLORS,
  LOGOS,
  RIDER_LOOKS,
  SKIN_COLORS,
  TOPS,
  togglePirate,
  recallLook,
  rememberLook,
} from "./looks.js";
import { createProps } from "./props.js";
import { createRider } from "./rider.js";

export function createDresser({ onLook } = {}) {
  const picked = recallLook(localStorage);

  const previewCanvas = document.createElement("canvas");
  previewCanvas.id = "lobby-preview";
  const previewHint = document.createElement("p");
  previewHint.className = "preview-hint";
  const hintTurn = document.createElement("span");
  hintTurn.textContent = "Drag to turn. Scroll to zoom.";
  const hintPan = document.createElement("span");
  hintPan.textContent = "Shift-drag or right-drag to pan.";
  previewHint.append(hintTurn, hintPan);
  const previewClose = document.createElement("button");
  previewClose.type = "button";
  previewClose.className = "dresser-close";
  previewClose.textContent = "Hide styling";
  const previewWrap = document.createElement("div");
  previewWrap.id = "lobby-preview-wrap";
  previewWrap.append(previewClose, previewCanvas, previewHint);
  const preview = mountPreview(previewCanvas);

  let pirateButton = null;
  let beforePirate = null;
  const dresser = document.createElement("div");
  dresser.id = "lobby-dresser";
  dresser.append(
    previewWrap,
    groupLabel("Rider"),
    pirateRow(),
    iconRow("Body", BODIES, "body", bodyIcon),
    iconRow("Age", AGES, "age", ageIcon),
    iconRow("Top", TOPS, "top", topIcon),
    pickRow("Shirt", RIDER_LOOKS, "shirtRand"),
    iconRow("Bottom", BOTTOMS, "bottom", bottomIcon),
    iconRow("Hair", HAIR_STYLES, "hair", hairIcon),
    iconRow("Hat", HATS, "hat", hatIcon),
    pickRow("Hair color", HAIR_COLORS, "hairColor"),
    pickRow("Skin", SKIN_COLORS, "skin"),
    iconRow("Complexion", COMPLEXIONS, "complexion", complexionIcon),
    groupLabel("Can"),
    iconRow("Shape", CAN_SHAPES, "canShape", canIcon),
    iconRow("Size", CAN_SIZES, "canSize", sizeIcon),
    iconRow("Finish", CAN_MATERIALS, "canMaterial", finishIcon),
    iconRow("Feature", CAN_FEATURES, "feature", featureIcon),
    pickRow("Can color", CAN_COLORS, "can"),
    groupLabel("Mark"),
    iconRow("Logo", LOGOS, "logo", logoIcon),
    pickRow("Mark", LOGO_COLORS, "logoColor"),
  );

  const styleTitle = document.createElement("span");
  styleTitle.className = "dresser-toggle-title";
  const styleNote = document.createElement("span");
  styleNote.className = "dresser-toggle-note";
  const styleCopy = document.createElement("span");
  styleCopy.className = "dresser-toggle-copy";
  styleCopy.append(styleTitle, styleNote);
  const styleChevron = document.createElement("span");
  styleChevron.className = "dresser-toggle-chevron";
  styleChevron.setAttribute("aria-hidden", "true");
  const styleToggle = document.createElement("button");
  styleToggle.type = "button";
  styleToggle.id = "lobby-style-toggle";
  styleToggle.className = "dresser-toggle";
  styleToggle.append(styleCopy, styleChevron);
  function setStyleOpen(open) {
    dresser.hidden = !open;
    styleToggle.setAttribute("aria-expanded", open ? "true" : "false");
    styleTitle.textContent = open ? "Hide character styling" : "Character styling";
    styleNote.textContent = open ? "Click here to close" : "Open to change the rider, can, and logo";
    styleChevron.textContent = open ? "\u25B4" : "\u25BE";
    if (open) {
      preview.showLook(picked);
      preview.start();
    } else {
      preview.stop();
    }
  }
  setStyleOpen(false);
  styleToggle.addEventListener("click", () => setStyleOpen(dresser.hidden));
  previewClose.addEventListener("click", () => {
    if (!playStyleBody.hidden) closePlayStyle();
    else setStyleOpen(false);
  });

  const setup = document.createElement("div");
  setup.className = "gcr-dresser";
  setup.append(styleToggle, dresser);
  let host = null;
  const playStyleBody = document.createElement("aside");
  playStyleBody.id = "play-style";
  playStyleBody.className = "gcr-dresser";
  playStyleBody.hidden = true;
  document.body.append(playStyleBody);

  function closePlayStyle() {
    playStyleBody.hidden = true;
    setStyleOpen(false);
    if (host) host.append(setup);
  }

  return {
    mount(container) {
      host = container;
      container.append(setup);
      return () => { preview.stop(); setup.remove(); };
    },
    look: () => ({ ...picked }),
    stylingOpen: () => !playStyleBody.hidden,
    styleOpen: () => !dresser.hidden,
    toggleStyle() {
      if (!playStyleBody.hidden) { closePlayStyle(); return; }
      playStyleBody.append(setup);
      playStyleBody.hidden = false;
      setStyleOpen(true);
    },
    close: closePlayStyle,
  };

  function colorCss(hex) {
    return `#${Number(hex).toString(16).padStart(6, "0")}`;
  }

  function pickRow(caption, rows, field) {
    const wrap = document.createElement("div");
    wrap.className = "lobby-pick";
    const captionEl = document.createElement("span");
    captionEl.textContent = caption;
    const row = document.createElement("div");
    row.className = "lobby-swatches";
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", caption);
    const buttons = [];
    for (const item of rows) {
      const button = document.createElement("button");
      button.type = "button";
      button.title = item.label;
      button.setAttribute("aria-label", `${caption} ${item.label}`);
      button.style.background = colorCss(swatchValue(item, field));
      const selected = field === "shirtRand"
        ? Math.abs(picked.shirtRand - item.shirtRand) < 1e-6
        : picked[field] === item[field];
      button.setAttribute("aria-pressed", selected ? "true" : "false");
      button.addEventListener("click", () => {
        picked[field] = item[field];
        commitLook();
        for (const other of buttons) other.setAttribute("aria-pressed", other === button ? "true" : "false");
      });
      buttons.push(button);
      row.append(button);
    }
    wrap.append(captionEl, row);
    return wrap;
  }

  function swatchValue(item, field) {
    if (field === "shirtRand") return item.color;
    if (item[field] != null) return item[field];
    return item.can;
  }

  function commitLook() {
    rememberLook(localStorage, picked);
    preview.showLook(picked);
    onLook?.({ ...picked });
    if (pirateButton) {
      const on = picked.hat === "pirate" && picked.canShape === "barrel";
      pirateButton.setAttribute("aria-pressed", on ? "true" : "false");
      pirateButton.title = on
        ? "Click again to take off the pirate hat and the barrel"
        : "Pirate hat and wooden barrel";
    }
  }

  function choiceLabel(rows, id) {
    return rows.find((row) => row.id === id)?.label || "";
  }

  function pressChoice(caption, label) {
    const group = dresser.querySelector(`[aria-label="${caption}"]`);
    if (!group) return;
    for (const button of group.querySelectorAll("button")) {
      const match = button.getAttribute("aria-label") === `${caption} ${label}`;
      button.setAttribute("aria-pressed", match ? "true" : "false");
    }
  }

  function pirateRow() {
    const wrap = document.createElement("div");
    wrap.className = "lobby-pick";
    const captionEl = document.createElement("span");
    captionEl.textContent = "Pirate";
    const row = document.createElement("div");
    row.className = "lobby-icons";
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", "Pirate");
    pirateButton = document.createElement("button");
    pirateButton.type = "button";
    pirateButton.setAttribute("aria-label", "Pirate");
    const on = picked.hat === "pirate" && picked.canShape === "barrel";
    pirateButton.setAttribute("aria-pressed", on ? "true" : "false");
    pirateButton.title = on
      ? "Click again to take off the pirate hat and the barrel"
      : "Pirate hat and wooden barrel";
    pirateButton.innerHTML = `${pirateIcon()}<span>Pirate</span>`;
    pirateButton.addEventListener("click", () => {
      const next = togglePirate(picked, beforePirate);
      beforePirate = next.previous;
      picked.hat = next.look.hat;
      picked.canShape = next.look.canShape;
      commitLook();
      pressChoice("Hat", choiceLabel(HATS, picked.hat));
      pressChoice("Shape", choiceLabel(CAN_SHAPES, picked.canShape));
    });
    row.append(pirateButton);
    wrap.append(captionEl, row);
    return wrap;
  }

  function groupLabel(text) {
    const label = document.createElement("p");
    label.className = "dresser-label";
    label.textContent = text;
    return label;
  }

  function iconRow(caption, rows, field, draw) {
    const wrap = document.createElement("div");
    wrap.className = "lobby-pick";
    const captionEl = document.createElement("span");
    captionEl.textContent = caption;
    const row = document.createElement("div");
    row.className = rows.length > 4 ? "lobby-icons lobby-icons-3" : "lobby-icons";
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", caption);
    const buttons = [];
    for (const item of rows) {
      const button = document.createElement("button");
      button.type = "button";
      button.title = item.label;
      button.setAttribute("aria-label", `${caption} ${item.label}`);
      button.setAttribute("aria-pressed", picked[field] === item.id ? "true" : "false");
      button.innerHTML = `${draw(item)}<span>${item.label}</span>`;
      button.addEventListener("click", () => {
        picked[field] = item.id;
        commitLook();
        for (const other of buttons) other.setAttribute("aria-pressed", other === button ? "true" : "false");
      });
      buttons.push(button);
      row.append(button);
    }
    wrap.append(captionEl, row);
    return wrap;
  }

}

function svg(body) {
  return `<svg viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`;
}

function bodyIcon(item) {
  const skirt = item.id === "woman"
    ? `<path d="M18 28 H30 L36 44 H12 Z" fill="currentColor"/>`
    : `<path d="M18 28 L16 44 L22 44 L24 32 L26 44 L32 44 L30 28 Z" fill="currentColor"/>`;
  return svg(`<circle cx="24" cy="9" r="5" fill="currentColor"/><path d="M24 15 L17 28 L31 28 Z" fill="currentColor"/>${skirt}`);
}

function ageIcon(item) {
  const scale = item.id === "young" ? 0.72 : item.id === "old" ? 0.9 : 1;
  const stoop = item.id === "old" ? `<path d="M30 18 L38 28" stroke="currentColor" stroke-width="2" fill="none"/>` : "";
  return svg(`<g transform="translate(24 40) scale(${scale}) translate(-24 -40)">
    <circle cx="24" cy="12" r="5" fill="currentColor"/>
    <path d="M24 18 L18 30 L22 30 L20 42 L28 42 L26 30 L30 30 Z" fill="currentColor"/>
    ${stoop}
  </g>`);
}

function topIcon(item) {
  if (item.id === "blouse") {
    return svg(`<path d="M14 14 L24 18 L34 14 L40 22 L32 24 L34 40 L14 40 L16 24 L8 22 Z" fill="currentColor"/>`);
  }
  return svg(`<path d="M16 14 L24 18 L32 14 L38 20 L32 22 L32 38 L16 38 L16 22 L10 20 Z" fill="currentColor"/>`);
}

function bottomIcon(item) {
  if (item.id === "skirt") return svg(`<path d="M16 10 L32 10 L40 40 L8 40 Z" fill="currentColor"/>`);
  return svg(`<path d="M16 8 L22 8 L24 22 L26 8 L32 8 L30 40 L24 40 L22 24 L18 40 L16 40 Z" fill="currentColor"/>`);
}

function complexionIcon(item) {
  const cheeks = item.id === "rosy" || item.id === "warm" || item.id === "freckled"
    ? `<circle cx="17" cy="27" r="3" fill="currentColor" opacity="0.55"/><circle cx="31" cy="27" r="3" fill="currentColor" opacity="0.55"/>`
    : "";
  const dots = item.id === "freckled"
    ? `<circle cx="16" cy="27" r="1" fill="#14110e"/><circle cx="20" cy="30" r="1" fill="#14110e"/><circle cx="29" cy="27" r="1" fill="#14110e"/><circle cx="33" cy="30" r="1" fill="#14110e"/>`
    : "";
  const wash = item.id === "olive" || item.id === "cool" ? ` opacity="0.72"` : "";
  return svg(`<circle cx="24" cy="22" r="11" fill="currentColor"${wash}/>${cheeks}${dots}`);
}

function hatIcon(item) {
  if (item.id === "pirate") {
    return svg(`<path d="M6 30 L14 22 H34 L42 30 L36 27 L31 36 L24 24 L17 36 L12 27 Z" fill="currentColor"/><path d="M18 22 H30 L28 12 H20 Z" fill="currentColor"/><path d="M14 16 L8 6" stroke="currentColor" stroke-width="2" fill="none"/>`);
  }
  return svg(`<circle cx="24" cy="22" r="10" fill="none" stroke="currentColor" stroke-width="2"/>`);
}

function pirateIcon() {
  return svg(`<path d="M8 16 L14 10 H34 L40 16 L35 14 L30 20 L24 12 L18 20 L13 14 Z" fill="currentColor"/><path d="M18 10 H30 L28 4 H20 Z" fill="currentColor"/><path d="M16 30 Q24 26 32 30 L34 44 Q24 48 14 44 Z" fill="currentColor"/><path d="M15 36 H33 M15 40 H33" stroke="#14110e" stroke-width="1.6" fill="none"/>`);
}

function hairIcon(item) {
  if (item.id === "bald") return svg(`<circle cx="24" cy="24" r="12" fill="none" stroke="currentColor" stroke-width="2"/>`);
  if (item.id === "long") {
    return svg(`<path d="M12 18 Q24 6 36 18 L34 40 L28 40 L30 20 Q24 14 18 20 L20 40 L14 40 Z" fill="currentColor"/>`);
  }
  if (item.id === "bun") {
    return svg(`<circle cx="24" cy="10" r="5" fill="currentColor"/><path d="M14 22 Q24 10 34 22 L32 34 Q24 28 16 34 Z" fill="currentColor"/>`);
  }
  return svg(`<path d="M14 24 Q24 8 34 24 L32 30 Q24 22 16 30 Z" fill="currentColor"/>`);
}

function canIcon(item) {
  const profiles = {
    round: "M16 8 Q24 4 32 8 L34 40 Q24 44 14 40 Z",
    square: "M14 8 H34 V40 H14 Z",
    drum: "M16 10 Q24 6 32 10 Q36 24 32 38 Q24 42 16 38 Q12 24 16 10 Z",
    taper: "M18 38 L14 8 H34 L30 38 Z",
    oval: "M12 10 Q24 4 36 10 L34 38 Q24 44 14 38 Z",
    flare: "M20 40 L12 8 H36 L28 40 Z",
    barrel: "M17 8 Q24 3 31 8 Q38 24 31 40 Q24 45 17 40 Q10 24 17 8 Z",
  };
  const hoops = item.id === "barrel"
    ? `<path d="M12 16 H36 M11 24 H37 M12 33 H36" stroke="#14110e" stroke-width="2" fill="none"/>`
    : "";
  return svg(`<path d="${profiles[item.id] || profiles.round}" fill="currentColor"/>${hoops}`);
}

function sizeIcon(item) {
  const width = item.id === "small" ? 10 : item.id === "big" ? 18 : 14;
  const x = 24 - width;
  return svg(`<rect x="${x}" y="10" width="${width * 2}" height="28" rx="4" fill="currentColor"/>`);
}

function featureIcon(item) {
  if (item.id === "rocket") {
    return svg(`<path d="M24 4 L31 18 H27 L33 42 H15 L21 18 H17 Z" fill="currentColor"/>`);
  }
  if (item.id === "spring") {
    return svg(`<path d="M12 12 H36 M12 20 H36 M12 28 H36 M12 36 H36" stroke="currentColor" stroke-width="3" fill="none"/>`);
  }
  if (item.id === "bumper") {
    return svg(`<ellipse cx="24" cy="24" rx="16" ry="8" fill="none" stroke="currentColor" stroke-width="4"/>`);
  }
  return svg(`<circle cx="24" cy="24" r="10" fill="none" stroke="currentColor" stroke-width="2"/>`);
}

function finishIcon(item) {
  if (item.id === "rubber") return svg(`<rect x="14" y="8" width="20" height="32" rx="6" fill="currentColor" opacity="0.85"/>`);
  return svg(`<rect x="14" y="8" width="20" height="32" rx="4" fill="currentColor"/><path d="M18 12 L22 12 L18 22 Z" fill="#14110e"/>`);
}

function logoIcon(item) {
  if (item.id === "none") return svg(`<circle cx="24" cy="24" r="12" fill="none" stroke="currentColor" stroke-width="2"/>`);
  return `<img src="assets/logos/${item.id}.png" alt="" />`;
}

function mountPreview(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return { showLook() {}, start() {}, stop() {} };
  }
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
  // Fitted in showLook to the can plus the standing rider. yaw orbits that
  // pair. yaw 0, pitch 0 parks the camera on +z. Check: yaw π/2, pitch 0
  // puts the camera on +x at the same distance.
  const framed = { cx: 0.4, cy: 0.8, halfX: 1.7, halfY: 1.05, dist: 6 };
  let yaw = 0;
  let pitch = 0;
  let zoom = 1;
  // Offset from the pair center. Screen axes are read from the camera, so a
  // side view pans along the shell instead of world X.
  const pan = new THREE.Vector3();
  const screenRight = new THREE.Vector3();
  const screenUp = new THREE.Vector3();
  camera.position.set(framed.cx, framed.cy, framed.dist);
  camera.lookAt(framed.cx, framed.cy, 0);
  scene.add(new THREE.HemisphereLight(0xfff2dd, 0x2a241c, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.25);
  key.position.set(-2.2, 3.4, 2.2);
  scene.add(key);
  const materials = createMaterials(THREE);
  const props = createProps(THREE, materials);
  let rider = null;
  let handle = 0;
  let running = false;

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    if (canvas.width !== width || canvas.height !== height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      fitCamera();
    }
  }

  // The standing body is a child of the can's root. Measuring after the face
  // yaw, then sliding on local +x, puts the skirt clear of the shell.
  // Check: can right edge 0.6, body left edge -0.7, gap 0.16 → person.x = 1.46.
  function standBeside() {
    const person = rider.person;
    person.userData.pose = "stand";
    rider.animate(0);
    rider.root.rotation.set(0, 0, 0);
    person.rotation.set(0, Math.PI, 0);
    person.position.set(0, 0, 0);
    rider.root.updateMatrixWorld(true);
    const can = rider.root.getObjectByName("rider-can");
    const canBox = new THREE.Box3().setFromObject(can);
    const bodyBox = new THREE.Box3().setFromObject(person);
    const gap = 0.16;
    person.position.x = canBox.max.x - bodyBox.min.x + gap;
    rider.root.updateMatrixWorld(true);
    const pair = new THREE.Box3().setFromObject(rider.root);
    const center = pair.getCenter(new THREE.Vector3());
    const size = pair.getSize(new THREE.Vector3());
    framed.cx = center.x;
    framed.cy = center.y;
    // A square can's box grows by about √2 when the view orbits. The pad
    // keeps that turn, and the skirt hem, inside the 30° frame.
    framed.halfX = size.x * 0.74;
    framed.halfY = size.y * 0.58;
    fitCamera();
  }

  // Vertical fov is 30°. Distance is whichever of width or height needs more
  // room, then zoom scales it. Check: half-height 1, aspect 1 → dist = 1 / tan(15°).
  function fitCamera() {
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const aspect = Math.max(0.35, camera.aspect || 1);
    const distY = framed.halfY / Math.tan(vFov / 2);
    const distX = framed.halfX / (Math.tan(vFov / 2) * aspect);
    framed.dist = Math.max(distY, distX, 2.4);
    placeCamera();
  }

  function placeCamera() {
    const dist = framed.dist * zoom;
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const tx = framed.cx + pan.x;
    const ty = framed.cy + pan.y;
    const tz = pan.z;
    camera.position.set(
      tx + dist * cp * Math.sin(yaw),
      ty + dist * sp,
      tz + dist * cp * Math.cos(yaw),
    );
    camera.lookAt(tx, ty, tz);
  }

  // Drag right slides the subject right. Check: yaw 0, pitch 0, camera on +z.
  // Screen right is world +x, so a positive dx moves the look target toward -x.
  function panBy(dx, dy) {
    camera.updateMatrixWorld();
    screenRight.setFromMatrixColumn(camera.matrixWorld, 0);
    screenUp.setFromMatrixColumn(camera.matrixWorld, 1);
    const dist = framed.dist * zoom;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const worldPerPixel = (2 * dist * Math.tan(vFov / 2)) / Math.max(1, canvas.clientHeight || 1);
    pan.addScaledVector(screenRight, -dx * worldPerPixel);
    pan.addScaledVector(screenUp, dy * worldPerPixel);
    const reach = Math.max(framed.halfY * 2.2, 1.4);
    if (pan.length() > reach) pan.setLength(reach);
    placeCamera();
  }

  function showLook(look) {
    if (rider) {
      rider.dispose?.();
      scene.remove(rider.root);
      releasePreview(rider.root);
    }
    rider = createRider(THREE, materials, props, look);
    // The race seats this body in the can. The dresser stands them beside it
    // so the outfit, not just the head and the shell, is what you style.
    scene.add(rider.root);
    standBeside();
  }

  function frame() {
    if (!running) return;
    handle = requestAnimationFrame(frame);
    resize();
    renderer.render(scene, camera);
  }

  let dragMode = "";
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button > 2) return;
    // Left drag orbits. Shift, Alt, or the right or middle button pans.
    dragMode = event.button === 0 && !event.shiftKey && !event.altKey ? "orbit" : "pan";
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = dragMode === "pan" ? "move" : "grabbing";
    if (event.button === 1) event.preventDefault();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragMode) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    if (dragMode === "pan" || event.shiftKey || event.altKey) {
      panBy(dx, dy);
      return;
    }
    // Drag right moves the camera toward -x, so the rider's right side comes around.
    yaw -= dx * 0.008;
    pitch = Math.max(-0.35, Math.min(0.85, pitch + dy * 0.006));
    placeCamera();
  });
  const endDrag = () => {
    dragMode = "";
    canvas.style.cursor = "";
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    // One wheel notch is about 100 units. Scroll down moves the camera out.
    zoom = Math.max(0.35, Math.min(3.2, zoom * Math.exp(event.deltaY * 0.0012)));
    placeCamera();
  }, { passive: false });

  return {
    showLook,
    start() {
      if (running) return;
      running = true;
      handle = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(handle);
    },
  };
}

function releasePreview(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    if (obj.geometry && !obj.geometry.userData.shared) obj.geometry.dispose();
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of list) {
      if (mat?.userData?.owned) mat.dispose();
    }
  });
}
