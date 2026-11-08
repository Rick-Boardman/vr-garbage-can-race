// Brass pictures for the hill hotbar. Each one is the slot face, so the
// olive plate is part of the texture. Halo hides the letter label when an
// iconTexture is set.

const PLATE = "#243018";
const PLATE_HI = "#314222";
const INK = "#f3e2b0";
const BRASS = "#e8c97a";

export function createHotbarIcons(THREE) {
  return {
    camera: paint(THREE, drawCamera),
    course: paint(THREE, drawCourse),
    gear: paint(THREE, drawGear),
    help: paint(THREE, drawHelp),
    lobby: paint(THREE, drawLobby),
    style: paint(THREE, drawStyle),
  };
}

function paint(THREE, draw) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const wash = ctx.createRadialGradient(64, 46, 8, 64, 64, 78);
  wash.addColorStop(0, PLATE_HI);
  wash.addColorStop(1, PLATE);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = INK;
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = 8;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function drawCamera(ctx) {
  ctx.fillStyle = BRASS;
  round(ctx, 26, 46, 76, 50, 12);
  ctx.fill();
  ctx.fillStyle = PLATE;
  ctx.beginPath();
  ctx.arc(64, 71, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = BRASS;
  ctx.beginPath();
  ctx.moveTo(44, 46);
  ctx.lineTo(52, 32);
  ctx.lineTo(76, 32);
  ctx.lineTo(84, 46);
  ctx.closePath();
  ctx.fill();
}

function drawCourse(ctx) {
  ctx.save();
  ctx.translate(64, 64);
  ctx.strokeStyle = BRASS;
  ctx.fillStyle = BRASS;
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  const end = Math.PI * 1.72;
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0.55, end);
  ctx.stroke();
  const x = Math.cos(end) * 30;
  const y = Math.sin(end) * 30;
  ctx.translate(x, y);
  ctx.rotate(end + Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(13, 8);
  ctx.lineTo(-13, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGear(ctx) {
  ctx.save();
  ctx.translate(64, 64);
  ctx.fillStyle = BRASS;
  const teeth = 8;
  for (let i = 0; i < teeth; i += 1) {
    ctx.save();
    ctx.rotate((i / teeth) * Math.PI * 2);
    round(ctx, -7, -46, 14, 18, 3);
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PLATE;
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHelp(ctx) {
  ctx.fillStyle = BRASS;
  ctx.font = "700 86px Georgia, Times New Roman, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", 64, 70);
}

function drawLobby(ctx) {
  ctx.fillStyle = BRASS;
  round(ctx, 36, 24, 56, 82, 10);
  ctx.fill();
  ctx.fillStyle = PLATE;
  round(ctx, 48, 38, 32, 68, 4);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(72, 74, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawStyle(ctx) {
  ctx.fillStyle = BRASS;
  ctx.beginPath();
  ctx.arc(50, 40, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(26, 100);
  ctx.quadraticCurveTo(26, 60, 50, 56);
  ctx.quadraticCurveTo(74, 60, 74, 100);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = INK;
  round(ctx, 84, 58, 24, 40, 8);
  ctx.fill();
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(96, 58, 12, 5, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function round(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
