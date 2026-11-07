import { CAN_SHELLS } from "./can-geometry.js";
import { applyFrame } from "./frame.js";
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
  if (look?.canShape === "square") addSquareCan(can, THREE, materials, look);
  else addRoundCan(can, THREE, materials, look);
  addLogo(can, THREE, materials, look);
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
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 14),
    materials.shadow,
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.04;
  shadow.scale.setScalar(canScale);

  root.add(can, person, shadow);

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
    person.position.set(0, seatedPersonY(), 0);
    person.rotation.set(0, 0, 0);
    person.userData.pose = "ride";
    person.visible = showPerson;
    shadow.position.set(0, 0.04, 0);
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
  }

  function animate(time) {
    animatePerson(person, time);
  }

  return { root, place, placeApart, animate, person };
}

function personStyle(look) {
  if (!look?.body && !look?.top && !look?.bottom && !look?.hair && !look?.age) return null;
  return {
    body: look.body === "woman" ? "woman" : "man",
    age: look.age === "young" || look.age === "old" ? look.age : "adult",
    top: look.top === "blouse" ? "blouse" : "tee",
    bottom: look.bottom === "skirt" ? "skirt" : "pants",
    hair: look.hair === "long" || look.hair === "bun" || look.hair === "bald" ? look.hair : "short",
  };
}

function canScaleOf(look) {
  if (look?.canSize === "small") return 0.72;
  if (look?.canSize === "big") return 1.28;
  return 1;
}

const shellGeometry = new Map();
const logoTextures = new Map();

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
  // Smooth shading so the rolled shell reads as metal. Clone before DoubleSide
  // so the cached material stays single-sided for anything else.
  const shared = rubber
    ? materials.standard(Number(look?.can) || 0x2f7d4a, { flat: false, roughness: 0.96, metalness: 0 })
    : materials.standard(0x9aa3a8, { flat: false, roughness: 0.38, metalness: 0.72 });
  const material = shared.clone();
  material.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geometry, material);
  if (shape === "square") mesh.name = "can-square";
  else if (rubber) mesh.name = "can-rubber";
  return mesh;
}

function addColorBand(can, THREE, materials, look, shape) {
  const sharedBand = materials.lambert(0x2f7d4a, { flat: false, side: THREE.DoubleSide });
  const bandMaterial = look?.can == null ? sharedBand : sharedBand.clone();
  if (look?.can != null) bandMaterial.color.setHex(look.can);
  const band = shape === "square"
    ? new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.9), bandMaterial)
    : new THREE.Mesh(new THREE.CylinderGeometry(0.49, 0.49, 0.12, 28, 1, true), bandMaterial);
  band.position.y = 0.62;
  can.add(band);
}

function addFloor(can, THREE, materials, look) {
  const rubber = look?.canMaterial === "rubber";
  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.38, 0.06, 12),
    materials.standard(0x6a7378, { roughness: 0.5, metalness: rubber ? 0 : 0.55 }),
  );
  floor.name = "can-floor";
  floor.position.y = 0.04;
  can.add(floor);
}

function addRoundCan(can, THREE, materials, look) {
  can.add(shellMesh(THREE, materials, look, "round"));
  addFloor(can, THREE, materials, look);
  addColorBand(can, THREE, materials, look, "round");
}

function addSquareCan(can, THREE, materials, look) {
  can.add(shellMesh(THREE, materials, look, "square"));
  addFloor(can, THREE, materials, look);
  addColorBand(can, THREE, materials, look, "square");
}

function logoTexture(THREE, id) {
  if (typeof document === "undefined") return null;
  let texture = logoTextures.get(id);
  if (texture) return texture;
  texture = new THREE.TextureLoader().load(`assets/logos/${id}.png`);
  texture.colorSpace = THREE.SRGBColorSpace;
  logoTextures.set(id, texture);
  return texture;
}

function addLogo(can, THREE, materials, look) {
  const id = look?.logo;
  if (id !== "star" && id !== "ring" && id !== "diamond" && id !== "bolt") return;
  const mat = materials.lambert(Number(look.logoColor) || 0xf2c879, { flat: true }).clone();
  const texture = logoTexture(THREE, id);
  if (texture) {
    mat.map = texture;
    mat.transparent = true;
    mat.alphaTest = 0.45;
  }
  const shape = look?.canShape === "square" ? "square" : "round";
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), mat);
  mark.name = "can-logo";
  // PlaneGeometry faces +Z. The round band sits at radius 0.49, so the
  // decal has to clear that or the stripe hides the middle of the mark.
  const ahead = CAN_SHELLS[shape].logoZ + 0.02;
  mark.position.set(0, 0.58, shape === "round" ? Math.max(ahead, 0.51) : ahead);
  can.add(mark);
}
