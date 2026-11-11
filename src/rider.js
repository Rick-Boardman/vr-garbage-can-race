import { createNameTag } from "@rb/arcade/presentation";
import { CAN_SHELLS } from "./can-geometry.js";
import { applyFrame } from "./frame.js";
import { COMPLEXIONS, HAIR_COLORS, SKIN_COLORS, cleanName, mixHex } from "./looks.js";
import { animatePerson, onFootPose } from "./props.js";

// The shell is built with its origin on the road. Spinning that origin
// swings the rim through the asphalt. Lift along the road normal so the
// lowest point of the tipped cylinder stays on the surface.
const CAN_HEIGHT = 0.98;
const CAN_RADIUS = 0.6;

export function canGroundClearance(tilt) {
  const angle = Number(tilt) || 0;
  const cosine = Math.cos(angle);
  const minY = Math.min(0, CAN_HEIGHT * cosine) - CAN_RADIUS * Math.abs(Math.sin(angle));
  return minY < 0 ? -minY : 0;
}

function liftAlong(object, frame, distance) {
  if (distance <= 0 || !frame?.up) return;
  object.position.x += frame.up.x * distance;
  object.position.y += frame.up.y * distance;
  object.position.z += frame.up.z * distance;
}

export function createRider(THREE, materials, props, look = null) {
  const root = new THREE.Group();
  root.name = "rider";
  const can = new THREE.Group();
  can.name = "rider-can";
  // Size is the drawn shell. The race still hits with the shared can radius.
  const canScale = canScaleOf(look);
  can.scale.setScalar(canScale);
  addCan(can, THREE, materials, look);
  const shirtRand = look?.shirtRand ?? 0.2;
  const person = props.createPerson(() => shirtRand, "ride", personStyle(look));
  // Feet of the unscaled person sit near local y = 0.1. Scale keeps the
  // legs inside the shell and the chest above the rim, and follows the can.
  const personScale = 0.82 * canScale;
  // A young body is shorter, so the seat lifts until the head clears the rim.
  const ageLift = look?.age === "young" ? 0.2 : 0;
  const seatedPersonY = () => 0.06 - 0.1 * personScale + ageLift * canScale;
  person.scale.setScalar(personScale);
  person.position.y = seatedPersonY();
  // The standing hem is wider than the shell. Tuck is can-local clearance
  // over that hem, so a seated skirt does not draw through the walls.
  person.userData.skirtTuck = skirtTuckFor(person, shellId(look), canScale, seatedPersonY());
  const seatedSkirt = person.getObjectByName("person-skirt");
  if (seatedSkirt && person.userData.skirtTuck < 1) {
    seatedSkirt.scale.set(person.userData.skirtTuck, 1, person.userData.skirtTuck);
  }
  addShirtMark(person, THREE, look, canScale, personScale, seatedPersonY());
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 14),
    materials.shadow,
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.04;
  shadow.scale.setScalar(canScale);

  const logoMount = addLogo(THREE, materials, look);
  const feature = addCanFeature(THREE, look, canScale);
  const nameTag = createNameTag(THREE, { name: "rider-name", format: cleanName, createCanvas: nameCanvas });
  let nameText = "";
  root.add(can, person, shadow, nameTag.object);
  if (logoMount) {
    // Same scale as the shell, without inheriting its roll.
    logoMount.scale.copy(can.scale);
    root.add(logoMount);
  }
  if (feature) root.add(feature);

  // The mark is a sibling of the spinning shell, parked on the camera side.
  function parkLogo(tilt) {
    if (!logoMount) return;
    logoMount.position.copy(can.position);
    logoMount.rotation.set(tilt, 0, 0);
  }

  function parkLogoApart(sample, tilt) {
    if (!logoMount) return;
    logoMount.position.copy(can.position);
    applyFrame(logoMount, sample, 0);
    if (tilt) logoMount.rotateX(tilt);
  }

  // The bolt-on stays on the can's back, the chase side, and does not spin.
  function parkFeature(tilt) {
    if (!feature) return;
    feature.position.copy(can.position);
    feature.rotation.set(tilt, 0, 0);
  }

  function parkFeatureApart(sample, tilt) {
    if (!feature) return;
    feature.position.copy(can.position);
    applyFrame(feature, sample, 0);
    if (tilt) feature.rotateX(tilt);
  }

  function setTuck(value) {
    const flame = feature?.getObjectByName("can-rocket-flame");
    if (flame) flame.visible = (Number(value) || 0) > 0.05;
  }

  function place(sample, offset, spin, bank, hop, showPerson) {
    root.position.set(
      sample.x + sample.right.x * offset,
      sample.y + hop,
      sample.z + sample.right.z * offset,
    );
    applyFrame(root, sample, bank);
    const tilt = hop > 0.05 ? Math.min(0.7, hop * 0.85) : 0;
    can.position.set(0, canGroundClearance(tilt) * canScale, 0);
    can.rotation.set(0, spin, 0);
    if (tilt) can.rotateX(tilt);
    // The shell rolls on yaw. The mark stays on the rider's +z, the side
    // the chase camera sits on, and only tips when the can tips.
    parkLogo(tilt);
    parkFeature(tilt);
    person.position.set(0, seatedPersonY(), 0);
    person.rotation.set(0, 0, 0);
    person.userData.pose = "ride";
    person.visible = showPerson;
    shadow.position.set(0, 0.04, 0);
    parkName(showPerson);
  }

  function placeApart({
    canSample,
    canOffset,
    canSpin,
    canTilt = null,
    canHop,
    bodySample,
    bodyOffset,
    bodyHop = 0,
    bodySpin = 0,
    bodyRoll = 0,
    facing,
    showPerson = true,
    moving = false,
  }) {
    root.position.set(0, 0, 0);
    root.quaternion.identity();
    root.rotation.set(0, 0, 0);
    const tilt = Number.isFinite(canTilt) ? canTilt : canSpin * 0.5;
    can.position.set(
      canSample.x + canSample.right.x * canOffset,
      canSample.y + canHop,
      canSample.z + canSample.right.z * canOffset,
    );
    applyFrame(can, canSample, 0);
    can.rotateY(canSpin);
    can.rotateX(tilt);
    liftAlong(can, canSample, canGroundClearance(tilt) * canScale);
    parkLogoApart(canSample, tilt);
    parkFeatureApart(canSample, tilt);
    const fx = facing?.x ?? bodySample.forward.x;
    const fz = facing?.z ?? bodySample.forward.z;
    const length = Math.hypot(fx, fz) || 1;
    const fxx = fx / length;
    const fzz = fz / length;
    person.position.set(
      bodySample.x + bodySample.right.x * bodyOffset,
      bodySample.y + bodyHop - 0.1 * personScale,
      bodySample.z + bodySample.right.z * bodyOffset,
    );
    // Right of a horizontal facing (fx, fz) is (-fz, 0, fx).
    const bodyFrame = {
      forward: { x: fxx, y: 0, z: fzz },
      right: { x: -fzz, y: 0, z: fxx },
      up: { x: 0, y: 1, z: 0 },
    };
    applyFrame(person, bodyFrame);
    const tumbling = Math.abs(bodySpin) > 0.12 || Math.abs(bodyRoll) > 0.12;
    if (tumbling) {
      person.rotateX(bodySpin || 0);
      person.rotateZ(bodyRoll || 0);
      const cosine = Math.cos(bodySpin || 0);
      const minY = Math.min(0, 1.7 * cosine) - 0.34 * Math.abs(Math.sin(bodySpin || 0));
      const rollDip = 0.34 * Math.abs(Math.sin(bodyRoll || 0));
      const dip = Math.min(minY, 0) - rollDip;
      if (dip < 0) person.position.y -= dip;
    }
    person.userData.pose = onFootPose({ tumbling, moving });
    person.visible = showPerson;
    shadow.position.set(person.position.x, bodySample.y + 0.04, person.position.z);
    parkName(showPerson);
  }

  function setName(value) {
    nameText = cleanName(value);
  }

  // World up, from the crown. The body's course frame can tilt on a grade,
  // and a tumble tips the head, so the label is not parented to that rotation.
  function parkName(show) {
    nameTag.setText(nameText);
    const head = person.getObjectByName("person-head");
    nameTag.placeAbove(head?.parent || person, { lift: 0.06, visible: !!show });
  }

  function animate(time) {
    animatePerson(person, time);
    parkName(person.visible);
  }

  function dispose() {
    nameTag.dispose();
    feature?.traverse((obj) => {
      if (obj.geometry && !obj.geometry.userData.shared) obj.geometry.dispose();
      if (obj.material?.userData?.owned) obj.material.dispose();
    });
  }

  return { root, place, placeApart, animate, person, setName, setTuck, dispose };
}

function listedHex(list, key, value) {
  const hex = Number(value);
  return list.some((row) => row[key] === hex) ? hex : null;
}

function personStyle(look) {
  const styled = look && (
    look.body || look.top || look.bottom || look.hair || look.age
    || look.skin != null || look.hairColor != null || look.complexion
    || look.hat === "pirate"
  );
  if (!styled) return null;
  const skin = listedHex(SKIN_COLORS, "skin", look.skin);
  const hairColor = listedHex(HAIR_COLORS, "hairColor", look.hairColor);
  const complexion = COMPLEXIONS.some((row) => row.id === look.complexion) ? look.complexion : "even";
  return {
    body: look.body === "woman" ? "woman" : "man",
    age: look.age === "young" || look.age === "old" ? look.age : "adult",
    top: look.top === "blouse" ? "blouse" : "tee",
    bottom: look.bottom === "skirt" ? "skirt" : "pants",
    hair: look.hair === "long" || look.hair === "bun" || look.hair === "bald" ? look.hair : "short",
    hat: look.hat === "pirate" ? "pirate" : "none",
    ...(skin != null ? { skin } : {}),
    ...(hairColor != null ? { hairColor } : {}),
    complexion,
  };
}

function ownedLambert(THREE, color) {
  const material = new THREE.MeshLambertMaterial({ color });
  material.userData.owned = true;
  return material;
}

// Local +z is the chase side, behind the rider. The rocket points uphill.
function addCanFeature(THREE, look, canScale) {
  const kind = look?.feature;
  if (kind !== "rocket" && kind !== "spring" && kind !== "bumper") return null;
  const group = new THREE.Group();
  group.name = "can-feature";
  group.scale.setScalar(canScale);
  if (kind === "rocket") {
    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, 0.28, 8),
      ownedLambert(THREE, 0x2a241c),
    );
    nozzle.name = "can-rocket";
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(0, 0.36, 0.62);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.07, 0.22, 8),
      ownedLambert(THREE, 0xf27a1a),
    );
    flame.name = "can-rocket-flame";
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(0, 0.36, 0.86);
    flame.visible = false;
    group.add(nozzle, flame);
    return group;
  }
  if (kind === "spring") {
    // The shell is about 0.52 across. Coils sit outside it or the can hides them.
    for (let i = 0; i < 3; i += 1) {
      const coil = new THREE.Mesh(
        new THREE.TorusGeometry(0.56, 0.032, 6, 12),
        ownedLambert(THREE, 0xc46a2f),
      );
      coil.name = "can-spring";
      coil.rotation.x = Math.PI / 2;
      coil.position.set(0, 0.2 + i * 0.16, 0);
      group.add(coil);
    }
    return group;
  }
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.58, 0.045, 6, 16),
    ownedLambert(THREE, 0x1c1c1c),
  );
  ring.name = "can-bumper";
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0.28, 0);
  group.add(ring);
  return group;
}

function canScaleOf(look) {
  if (look?.canSize === "small") return 0.72;
  if (look?.canSize === "big") return 1.28;
  return 1;
}

// Inside the wall at the hem, with a gap so the cloth does not sit in the
// shell. Round and drum are wider. Oval, taper, and flare pinch in.
const SKIRT_CLEARANCE = {
  round: 0.4,
  square: 0.36,
  drum: 0.42,
  taper: 0.3,
  oval: 0.26,
  flare: 0.29,
};

function skirtHemRadius(skirt) {
  const pos = skirt.geometry.attributes.position;
  let hem = 0;
  for (let i = 0; i < pos.count; i += 1) {
    if (pos.getY(i) > 0.02) continue;
    hem = Math.max(hem, Math.hypot(pos.getX(i), pos.getZ(i)));
  }
  return hem;
}

function skirtTuckFor(person, shape, canScale, seatedY) {
  const skirt = person.getObjectByName("person-skirt");
  if (!skirt) return 1;
  const hem = skirtHemRadius(skirt);
  const personScale = person.scale.x || 1;
  if (hem <= 0 || personScale <= 0) return 1;
  const canY = (seatedY + skirt.position.y * personScale) / canScale;
  const clearance = shape === "barrel"
    ? Math.max(0.24, barrelRadiusAt(canY) - 0.05)
    : (SKIRT_CLEARANCE[shape] || 0.36);
  const limit = clearance * canScale;
  const worldHem = hem * personScale;
  if (worldHem <= limit) return 1;
  return limit / worldHem;
}

const shellGeometry = new Map();
const logoTextures = new Map();
const shirtLogoTextures = new Map();

function shellId(look) {
  const shape = look?.canShape;
  if (shape === "barrel") return "barrel";
  return CAN_SHELLS[shape] ? shape : "round";
}

function own(material) {
  material.userData.owned = true;
  return material;
}

function shellMesh(THREE, materials, look, shape) {
  const data = CAN_SHELLS[shape];
  let geometry = shellGeometry.get(shape);
  if (!geometry) {
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
    geometry.userData.shared = true;
    shellGeometry.set(shape, geometry);
  }
  const rubber = look?.canMaterial === "rubber";
  // The swatch colors the shell. A look with no can keeps the gray metal.
  // Clone before DoubleSide so the cached material stays single-sided.
  const color = look?.can != null ? Number(look.can) : (rubber ? 0x2f7d4a : 0x9aa3a8);
  const shared = rubber
    ? materials.standard(color, { flat: false, roughness: 0.96, metalness: 0 })
    : materials.standard(color, { flat: false, roughness: 0.38, metalness: 0.72 });
  const material = own(shared.clone());
  material.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `can-${shape}`;
  return mesh;
}

function hoopHex(hex) {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  const luma = 0.3 * r + 0.59 * g + 0.11 * b;
  // A dark shell needs a light hoop or the stripe disappears into the paint.
  return luma < 70 ? 0xd7dee2 : mixHex(hex, 0x101410, 0.55);
}

function addColorBand(can, THREE, materials, look, shape) {
  const sharedBand = materials.lambert(0x2f7d4a, { flat: false, side: THREE.DoubleSide });
  const bandMaterial = look?.can == null ? sharedBand : own(sharedBand.clone());
  if (look?.can != null) bandMaterial.color.setHex(hoopHex(Number(look.can)));
  let band;
  if (shape === "square") {
    band = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.9), bandMaterial);
  } else if (shape === "round") {
    band = new THREE.Mesh(new THREE.CylinderGeometry(0.49, 0.49, 0.12, 28, 1, true), bandMaterial);
  } else {
    const shell = CAN_SHELLS[shape];
    band = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.12, 28, 1, true), bandMaterial);
    band.scale.set(shell.bandX, 1, shell.bandZ);
  }
  band.name = "can-band";
  band.position.y = 0.62;
  can.add(band);
}

function addFloor(can, THREE, materials, look, shape) {
  const rubber = look?.canMaterial === "rubber";
  const radius = shape === "round" || shape === "square" ? 0.36 : CAN_SHELLS[shape].footR;
  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius + 0.02, 0.06, 12),
    materials.standard(0x6a7378, { roughness: 0.5, metalness: rubber ? 0 : 0.55 }),
  );
  floor.name = "can-floor";
  floor.position.y = 0.04;
  can.add(floor);
}

function addCan(can, THREE, materials, look) {
  const shape = shellId(look);
  if (shape === "barrel") {
    addBarrel(can, THREE, materials);
    return;
  }
  can.add(shellMesh(THREE, materials, look, shape));
  addFloor(can, THREE, materials, look, shape);
  addColorBand(can, THREE, materials, look, shape);
}

// Open oak cask. The belly is the widest ring. Ends pinch in, same idea as
// a stave barrel. Radius stays inside the shared can hit radius (0.5).
const BARREL_HEIGHT = 0.98;
const BARREL_OAK = 0xb5814a;

export function barrelRadiusAt(y) {
  const t = Math.min(1, Math.max(0, y / BARREL_HEIGHT));
  return 0.34 + 0.14 * Math.sin(Math.PI * t);
}

let barrelParts = null;
let barrelWoodShared = null;

function barrelKit(THREE) {
  if (barrelParts) return barrelParts;
  const points = [];
  const steps = 12;
  for (let i = 0; i <= steps; i += 1) {
    const y = (i / steps) * BARREL_HEIGHT;
    points.push(new THREE.Vector2(barrelRadiusAt(y), y));
  }
  const body = new THREE.LatheGeometry(points, 24);
  const hoop = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true);
  const rim = new THREE.TorusGeometry(1, 0.055, 6, 18);
  const floor = new THREE.CylinderGeometry(1, 1, 0.06, 16);
  const seam = new THREE.BoxGeometry(1, 1, 1);
  for (const geometry of [body, hoop, rim, floor, seam]) geometry.userData.shared = true;
  barrelParts = { body, hoop, rim, floor, seam };
  return barrelParts;
}

function paintBarrelWood(ctx, width, height) {
  const staves = 12;
  for (let i = 0; i < staves; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? "#c4925a" : "#a56b3c";
    ctx.fillRect((i * width) / staves, 0, width / staves + 1, height);
    ctx.fillStyle = "#5c3a22";
    ctx.fillRect((i * width) / staves, 0, 3, height);
  }
  ctx.strokeStyle = "rgba(92, 58, 34, 0.45)";
  ctx.lineWidth = 1;
  for (let y = 6; y < height; y += 6) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    const wobble = y % 12 === 0 ? 2 : -1;
    ctx.bezierCurveTo(width * 0.35, y + wobble, width * 0.7, y - wobble, width, y);
    ctx.stroke();
  }
}

function barrelWoodMaterial(THREE, materials) {
  if (typeof document === "undefined") {
    return materials.standard(BARREL_OAK, { flat: false, roughness: 0.9, metalness: 0.02 });
  }
  if (barrelWoodShared) return barrelWoodShared;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  paintBarrelWood(canvas.getContext("2d"), 256, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  barrelWoodShared = new THREE.MeshStandardMaterial({
    map: texture,
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.02,
  });
  return barrelWoodShared;
}

// Staves stay oak. Can color and the metal/rubber finish do not paint them.
// The clone is DoubleSide so the open top still shows wood from inside.
function addBarrel(can, THREE, materials) {
  const parts = barrelKit(THREE);
  const wood = own(barrelWoodMaterial(THREE, materials).clone());
  wood.side = THREE.DoubleSide;
  const seamMat = materials.standard(0x6a4328, { flat: false, roughness: 0.94, metalness: 0 });
  const iron = materials.standard(0x3a342c, { flat: false, roughness: 0.4, metalness: 0.78 });
  const shell = new THREE.Mesh(parts.body, wood);
  shell.name = "can-barrel";
  const floor = new THREE.Mesh(parts.floor, wood);
  floor.name = "can-floor";
  floor.scale.set(0.3, 1, 0.3);
  floor.position.y = 0.04;
  can.add(shell, floor);
  for (const y of [0.18, 0.5, 0.8]) {
    const hoop = new THREE.Mesh(parts.hoop, iron);
    hoop.name = "can-hoop";
    const radius = barrelRadiusAt(y) + 0.014;
    hoop.scale.set(radius, 0.042, radius);
    hoop.position.y = y;
    can.add(hoop);
  }
  const lipR = barrelRadiusAt(BARREL_HEIGHT);
  const lip = new THREE.Mesh(parts.rim, iron);
  lip.name = "can-rim";
  lip.scale.setScalar(lipR);
  // TorusGeometry lies in XY. A quarter turn lays the lip on the rim.
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.97;
  can.add(lip);
  const belly = barrelRadiusAt(0.5) + 0.01;
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    const seam = new THREE.Mesh(parts.seam, seamMat);
    seam.name = "can-stave";
    seam.scale.set(0.016, 0.34, 0.02);
    seam.position.set(Math.cos(angle) * belly, 0.5, Math.sin(angle) * belly);
    // local +z points out. angle 0 sits on +x, so rotation.y is π/2.
    seam.rotation.y = Math.PI / 2 - angle;
    can.add(seam);
  }
}

const MARKS = {
  round: [0.62, 0.36],
  square: [0.7, 0.4],
  drum: [0.64, 0.36],
  taper: [0.56, 0.36],
  oval: [0.7, 0.34],
  flare: [0.58, 0.36],
  barrel: [0.5, 0.32],
};

function logoTexture(THREE, id) {
  if (typeof document === "undefined") return null;
  let texture = logoTextures.get(id);
  if (texture) return texture;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  ctx.translate(size / 2, size / 2);
  const radius = size * 0.4;
  ctx.beginPath();
  if (id === "ring") {
    ctx.lineWidth = size * 0.11;
    ctx.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
    ctx.stroke();
  } else if (id === "diamond") {
    ctx.moveTo(0, -radius);
    ctx.lineTo(radius * 0.72, 0);
    ctx.lineTo(0, radius);
    ctx.lineTo(-radius * 0.72, 0);
    ctx.closePath();
    ctx.fill();
  } else if (id === "bolt") {
    ctx.moveTo(radius * 0.18, -radius);
    ctx.lineTo(-radius * 0.55, radius * 0.08);
    ctx.lineTo(-radius * 0.08, radius * 0.08);
    ctx.lineTo(-radius * 0.22, radius);
    ctx.lineTo(radius * 0.55, -radius * 0.1);
    ctx.lineTo(radius * 0.02, -radius * 0.1);
    ctx.closePath();
    ctx.fill();
  } else {
    for (let i = 0; i < 10; i += 1) {
      const arm = i % 2 === 0 ? radius : radius * 0.42;
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const x = Math.cos(angle) * arm;
      const y = Math.sin(angle) * arm;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  logoTextures.set(id, texture);
  return texture;
}

// The can mark is large enough to mip cleanly. The shirt mark is a few
// centimeters across, and those mips average the star away to nothing.
function shirtLogoTexture(THREE, id) {
  let texture = shirtLogoTextures.get(id);
  if (texture) return texture;
  const source = logoTexture(THREE, id);
  if (!source?.image) return null;
  // Same drawing as the can, without the can's mip chain. A clone of that
  // texture uploads before its image is ready and the star vanishes.
  texture = new THREE.CanvasTexture(source.image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  shirtLogoTextures.set(id, texture);
  return texture;
}

// Sit the mark on the shell at this height, a centimeter proud of the
// nearest front vertex. The old mark used the shell's furthest +z, which
// floated the star off the belly. Check: drum center z stays under markZ + 0.03.
const MARK_PROUD = 0.012;

function barrelSurfaceZ(x, y, side) {
  const radius = barrelRadiusAt(y);
  const z = Math.sqrt(Math.max(0, radius * radius - x * x));
  return side * (z + MARK_PROUD);
}

function surfaceZ(shape, x, y, side) {
  if (shape === "barrel") return barrelSurfaceZ(x, y, side);
  const data = CAN_SHELLS[shape];
  const positions = data.positions;
  let best = Infinity;
  let z = side * (data.markZ || data.logoZ || 0.4);
  // Shell normals point inward, so the chase side is +z, not +normal.
  // Check: a sample at the logo's x,y on the drum lands near markZ.
  for (let i = 0; i < positions.length; i += 3) {
    const vz = positions[i + 2];
    if (side > 0 ? vz < 0.05 : vz > -0.05) continue;
    const dx = positions[i] - x;
    const dy = positions[i + 1] - y;
    const dist = dx * dx + dy * dy;
    if (dist < best) {
      best = dist;
      z = vz;
    }
  }
  return z + side * MARK_PROUD;
}

function curvedMark(THREE, shape, width, height, y, side) {
  const cols = 8;
  const rows = 4;
  const centerZ = surfaceZ(shape, 0, y, side);
  const positions = [];
  const uvs = [];
  const indices = [];
  const stride = cols + 1;
  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    const py = y + (0.5 - v) * height;
    for (let col = 0; col <= cols; col += 1) {
      const u = col / cols;
      const px = (u - 0.5) * width;
      positions.push(px, py - y, surfaceZ(shape, px, py, side) - centerZ);
      uvs.push(u, 1 - v);
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const a = row * stride + col;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return { geometry, centerZ };
}

// The face looks down local -z. The chase camera sits on +z, so the mark on
// the back of the shirt is the plane at +z. The front copy is turned to face
// -z. Both are parented to the person, above the can rim when the chest clears it.
function addShirtMark(person, THREE, look, canScale, personScale, seatedY) {
  const id = look?.logo;
  if (id !== "star" && id !== "ring" && id !== "diamond" && id !== "bolt") return;
  const chest = person.getObjectByName("person-chest");
  if (!chest) return;
  if (!chest.geometry.boundingBox) chest.geometry.computeBoundingBox();
  const box = chest.geometry.boundingBox;
  const top = chest.position.y + box.max.y * chest.scale.y;
  const bottom = chest.position.y + box.min.y * chest.scale.y;
  const halfZ = Math.max(-box.min.z, box.max.z) * chest.scale.z;
  const span = Math.min((box.max.x - box.min.x) * chest.scale.x, top - bottom);
  const rimLocal = (CAN_HEIGHT * canScale - seatedY) / personScale;
  const room = top - rimLocal;
  let size = Math.min(span * 0.72, Math.max(0.08, room * 0.9));
  let center = top - size * 0.5 - 0.006;
  if (center - size * 0.5 < rimLocal + 0.012) {
    size = Math.max(0.08, top - 0.006 - (rimLocal + 0.012));
    center = top - size * 0.5 - 0.006;
  }
  const mat = own(new THREE.MeshBasicMaterial({
    color: Number(look.logoColor) || 0xf2c879,
    transparent: true,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
  }));
  const texture = shirtLogoTexture(THREE, id);
  if (texture) mat.map = texture;
  const z = halfZ + 0.012;
  // Long hair hangs down the middle of the back and would hide a centered mark.
  const backX = look?.hair === "long" ? Math.min(span * 0.28, size * 0.55) : 0;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  back.name = "shirt-logo-back";
  back.position.set(backX, center, z);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  front.name = "shirt-logo";
  front.position.set(0, center, -z);
  front.rotation.y = Math.PI;
  person.add(back, front);
}

function addLogo(THREE, materials, look) {
  const id = look?.logo;
  if (id !== "star" && id !== "ring" && id !== "diamond" && id !== "bolt") return null;
  const mat = own(new THREE.MeshBasicMaterial({
    color: Number(look.logoColor) || 0xf2c879,
    transparent: true,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
  }));
  const texture = logoTexture(THREE, id);
  if (texture) mat.map = texture;
  const shape = shellId(look);
  const [width, height] = MARKS[shape] || MARKS.round;
  // The stripe owns y 0.56–0.68. The mark sits on the belly, on the metal.
  const y = 0.34;
  // The symbol itself is the mark. A backing disc read as a hole in the shell.
  const mount = new THREE.Group();
  mount.name = "can-logo-mount";
  mount.add(
    decal(THREE, shape, width, height, y, 1, mat, "can-logo"),
    decal(THREE, shape, width * 0.78, height * 0.78, y, -1, mat, null),
  );
  return mount;
}

function decal(THREE, shape, width, height, y, side, material, name) {
  let mesh;
  if (shape === "square") {
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.position.set(0, y, surfaceZ(shape, 0, y, side));
    if (side < 0) mesh.rotation.y = Math.PI;
  } else {
    const built = curvedMark(THREE, shape, width, height, y, side);
    mesh = new THREE.Mesh(built.geometry, material);
    mesh.position.set(0, y, built.centerZ);
  }
  if (name) mesh.name = name;
  return mesh;
}

// The tag paints on a browser canvas. Without a document (the Node tests) it
// gets a canvas that measures and paints nothing, as the tag did before.
function nameCanvas() {
  if (typeof document !== "undefined") return document.createElement("canvas");
  const context = {
    measureText: () => ({ width: 0 }),
    clearRect() {},
    strokeText() {},
    fillText() {},
  };
  return { width: 0, height: 0, getContext: () => context };
}
