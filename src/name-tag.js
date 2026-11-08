import { cleanName } from "./looks.js";

const TAG_HEIGHT = 0.34;

// World size of a label whose canvas is exactly the ink, plus the stroke pad.
// A short name stays wide enough to read. The height stays put as the name grows.
export function nameTagScale(pixelWidth, pixelHeight) {
  const height = Math.max(1, Number(pixelHeight) || 1);
  const width = Math.max(1, Number(pixelWidth) || 1);
  return {
    x: TAG_HEIGHT * (width / height),
    y: TAG_HEIGHT,
  };
}

// A camera-facing label. The sprite's origin is its bottom center, so the
// rider can sit that point on the crown and the glyphs hang above the head.
export function createNameTag(THREE) {
  const canvas = typeof document === "undefined" ? null : document.createElement("canvas");
  let texture = null;
  if (canvas) {
    canvas.width = 64;
    canvas.height = 64;
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
  }
  const material = new THREE.SpriteMaterial({
    map: texture,
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
  });
  material.userData.owned = true;
  const sprite = new THREE.Sprite(material);
  sprite.name = "rider-name";
  sprite.center.set(0.5, 0);
  sprite.visible = false;
  sprite.scale.set(0.8, TAG_HEIGHT, 1);
  let painted = null;

  function setText(value) {
    const text = cleanName(value);
    if (text === painted) return text;
    painted = text;
    if (!canvas) return text;
    const ink = paintName(canvas, text);
    texture.needsUpdate = true;
    const scale = nameTagScale(ink.width, ink.height);
    sprite.scale.set(scale.x, scale.y, 1);
    return text;
  }

  function dispose() {
    sprite.removeFromParent();
    texture?.dispose();
    material.map = null;
    material.dispose();
  }

  return { object: sprite, setText, dispose };
}

export function paintName(canvas, text) {
  const ctx = canvas.getContext("2d");
  const size = 72;
  const line = Math.max(8, size * 0.18);
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  const measured = text ? ctx.measureText(text).width : 0;
  const width = Math.max(32, Math.ceil(measured + line * 2 + 8));
  const height = Math.ceil(size + line * 2 + 8);
  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);
  if (!text) return { width, height };
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.lineWidth = line;
  ctx.strokeStyle = "rgba(16, 14, 10, 0.92)";
  ctx.strokeText(text, width / 2, height / 2);
  ctx.fillStyle = "#f6e7b8";
  ctx.fillText(text, width / 2, height / 2);
  return { width, height };
}
