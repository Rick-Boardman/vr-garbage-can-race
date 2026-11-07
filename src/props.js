import { PROP_MESHES } from "./prop-geometry.js";

const propGeometry = new Map();

function propGeo(THREE, name) {
  let geometry = propGeometry.get(name);
  if (geometry) return geometry;
  const data = PROP_MESHES[name];
  geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
  geometry.userData.shared = true;
  propGeometry.set(name, geometry);
  return geometry;
}

function formed(THREE, name, w, h, d, material) {
  const mesh = new THREE.Mesh(propGeo(THREE, name), material);
  mesh.scale.set(w, h, d);
  return mesh;
}

const SIDING = [0xc5c8b8, 0xd9d3c5, 0xb7c4d4, 0xe4e0d8, 0x8d939c, 0xd8c3a5];
const ROOFS = [0x8e3d38, 0x4e5560, 0x6a503c, 0x3e4c55, 0x9a4a3a];
const FACADES = [0xc4623a, 0xd8d0c4, 0xb7c3ce, 0x8e5a4a, 0x4d6d8a, 0xc9a27a, 0x6e7c86, 0xa33b32];
const SHIRTS = [0xe25b2a, 0x3d7edb, 0xf2d15c, 0x2f9d6a, 0xd4527a, 0x6b4c9a, 0xefefef, 0x222831];
const PANTS = [0x2c3a55, 0x3e342c, 0x243028, 0x4a4038];
const SKINS = [0xf0c2a0, 0xd9a47a, 0xc6865a, 0x8d5a3c, 0xf3d3b8];
const HAIR = [0x2a211c, 0x5a3a28, 0xc4a15a, 0x1a1a1a, 0x6a6a6a, 0x8b3a2a];

// Street end of an awning is local -z. Negative pitch drops that end.
export const AWNING_PITCH = -0.28;
// Bench back sits at +z. The sitter's origin is in front of it, hip on the seat.
export const BENCH = { seatY: 0.46, backZ: 0.18 };
export const SITTER = { y: -0.38, z: -0.12 };
// Sign face is local -z. The pole stays on +z, behind the board.
export const SIGN_POLE_Z = 0.14;
export const SIGN_BOARD_Z = 0;

function pick(list, rand) {
  return list[Math.floor(rand() * list.length)];
}

function flopJoint(rest, kick) {
  return { a: rest * 0.2, v: kick, rest };
}

// Each limb keeps its own swing. seed picks the signs so two people don't flap in unison.
export function createFlop(seed = 1, force = 1) {
  const scale = Math.max(0.2, Math.min(force, 1.35));
  const kick = (amount, slot) => amount * scale * (((seed + slot) % 2) ? 1 : -1);
  return {
    legL: flopJoint(0.5, kick(3.6, 1)),
    legR: flopJoint(-0.65, kick(2.8, 2)),
    armL: flopJoint(-1.1, kick(5.2, 3)),
    armR: flopJoint(0.7, kick(4.1, 4)),
    armLz: flopJoint(0.8, kick(2.5, 5)),
    armRz: flopJoint(-0.95, kick(2.2, 6)),
    head: flopJoint(0.4, kick(2.6, 7)),
  };
}

export function stepFlop(flop, dt, settled = false) {
  if (!flop) return flop;
  const step = Math.max(0, Math.min(dt || 0, 0.05));
  const damp = Math.exp(-(settled ? 5.5 : 1.15) * step);
  const spring = settled ? 9 : 1.5;
  for (const joint of Object.values(flop)) {
    joint.v += (joint.rest - joint.a) * spring * step;
    joint.v *= damp;
    joint.a += joint.v * step;
    joint.a = Math.max(-2.2, Math.min(2.2, joint.a));
  }
  return flop;
}

// Knee bend is a negative rotation.x: the shin folds toward +z, behind the face.
// Positive rotation.x still swings a hip or shoulder toward -z, the face.
function setKnee(knee, bend) {
  if (!knee) return;
  knee.rotation.x = -Math.max(0, bend);
}

function setElbow(elbow, bend) {
  if (!elbow) return;
  elbow.rotation.x = Math.max(0, bend);
}

const WALK_SPEED_MIN = 0.12;

// Legs swing only while the body is actually moving. A blocked walker or a
// crosser waiting for a gap stands. Talk, phone, and sit keep their own pose.
// Check: speed 0 → "stand". speed 0.8 → "walk". "talk" stays "talk".
export function poseForTravel(behavior, speed) {
  if (behavior !== "walk" && behavior !== "cross") return behavior;
  return isStepping(speed) ? "walk" : "stand";
}

export function isStepping(speed) {
  return (Number(speed) || 0) > WALK_SPEED_MIN;
}

// On foot, a settled body stands. A step or a slide walks. A throw tumbles.
export function onFootPose({ tumbling = false, moving = false } = {}) {
  if (tumbling) return "tumble";
  return poseForTravel("walk", moving ? 1 : 0);
}

export function animatePerson(group, time) {
  const limbs = group.userData.limbs;
  if (!limbs) return;
  const pose = group.userData.pose || "walk";
  const nod = group.userData.headPitch || 0;
  const phase = group.userData.phase || 0;
  const flop = group.userData.flop;
  if (pose === "ragdoll" && flop) {
    limbs.legL.rotation.x = flop.legL.a;
    limbs.legR.rotation.x = flop.legR.a;
    limbs.armL.rotation.set(flop.armL.a, 0, flop.armLz.a);
    limbs.armR.rotation.set(flop.armR.a, 0, flop.armRz.a);
    limbs.head.rotation.x = flop.head.a + nod;
    setKnee(limbs.kneeL, 0.55 + Math.abs(flop.legL.a) * 0.45);
    setKnee(limbs.kneeR, 0.55 + Math.abs(flop.legR.a) * 0.45);
    setElbow(limbs.elbowL, 0.35);
    setElbow(limbs.elbowR, 0.35);
    return;
  }
  if (pose === "sit") {
    limbs.legL.rotation.x = 1.25;
    limbs.legR.rotation.x = 1.25;
    setKnee(limbs.kneeL, 1.4);
    setKnee(limbs.kneeR, 1.4);
    limbs.armL.rotation.set(0.2, -0.15, 0.18);
    limbs.armR.rotation.set(0.2, 0.15, -0.18);
    setElbow(limbs.elbowL, 0.85);
    setElbow(limbs.elbowR, 0.85);
    limbs.head.rotation.x = 0.08 + nod;
    return;
  }
  if (pose === "talk") {
    limbs.legL.rotation.x = 0.04;
    limbs.legR.rotation.x = 0.04;
    setKnee(limbs.kneeL, 0.08);
    setKnee(limbs.kneeR, 0.08);
    limbs.armL.rotation.set(-0.15, 0, 0.12);
    limbs.armR.rotation.set(-0.35 + Math.sin(time * 3.1 + phase) * 0.3, 0, -0.16);
    setElbow(limbs.elbowL, 0.25);
    setElbow(limbs.elbowR, 0.55);
    limbs.head.rotation.x = nod;
    return;
  }
  if (pose === "phone") {
    limbs.legL.rotation.x = 0.04;
    limbs.legR.rotation.x = 0.04;
    setKnee(limbs.kneeL, 0.08);
    setKnee(limbs.kneeR, 0.08);
    limbs.armL.rotation.set(-0.1, 0, 0.1);
    limbs.armR.rotation.set(-1.05, 0, -0.2);
    setElbow(limbs.elbowL, 0.2);
    setElbow(limbs.elbowR, 1.15);
    limbs.head.rotation.x = 0.28 + nod;
    return;
  }
  if (pose === "ride") {
    // Standing. Hands reach toward -z, the face, and rest on the rim.
    limbs.legL.rotation.x = 0.06;
    limbs.legR.rotation.x = 0.06;
    setKnee(limbs.kneeL, 0.12);
    setKnee(limbs.kneeR, 0.12);
    limbs.armL.rotation.set(0.72, 0, 0.18);
    limbs.armR.rotation.set(0.72, 0, -0.18);
    setElbow(limbs.elbowL, 0);
    setElbow(limbs.elbowR, 0);
    limbs.head.rotation.x = 0.06 + nod;
    return;
  }
  if (pose === "tumble") {
    limbs.legL.rotation.x = 0.45;
    limbs.legR.rotation.x = -0.2;
    setKnee(limbs.kneeL, 0.95);
    setKnee(limbs.kneeR, 0.7);
    limbs.armL.rotation.set(-0.7, 0, 0.4);
    limbs.armR.rotation.set(-0.4, 0, -0.55);
    setElbow(limbs.elbowL, 0.6);
    setElbow(limbs.elbowR, 0.45);
    limbs.head.rotation.x = -0.15 + nod;
    return;
  }
  if (pose === "stand") {
    limbs.legL.rotation.x = 0.02;
    limbs.legR.rotation.x = 0.02;
    setKnee(limbs.kneeL, 0.04);
    setKnee(limbs.kneeR, 0.04);
    limbs.armL.rotation.set(0.08, 0, 0.05);
    limbs.armR.rotation.set(0.08, 0, -0.05);
    setElbow(limbs.elbowL, 0.08);
    setElbow(limbs.elbowR, 0.08);
    limbs.head.rotation.x = nod;
    if (group.userData.dog) group.userData.dog.position.y = 0;
    return;
  }
  if (pose === "fallen") {
    limbs.legL.rotation.x = 0.35;
    limbs.legR.rotation.x = -0.15;
    setKnee(limbs.kneeL, 1.15);
    setKnee(limbs.kneeR, 0.8);
    limbs.armL.rotation.set(0.25, 0, 0.55);
    limbs.armR.rotation.set(-0.1, 0, -0.7);
    setElbow(limbs.elbowL, 0.7);
    setElbow(limbs.elbowR, 0.55);
    limbs.head.rotation.x = 0.3 + nod;
    return;
  }
  const swing = Math.sin(time * 7.4 + phase);
  // The forward leg bends. The back leg stays nearly straight so the foot reaches the road.
  limbs.legL.rotation.x = swing * 0.32;
  limbs.legR.rotation.x = -swing * 0.32;
  setKnee(limbs.kneeL, 0.06 + Math.max(0, swing) * 1.15);
  setKnee(limbs.kneeR, 0.06 + Math.max(0, -swing) * 1.15);
  limbs.armL.rotation.set(-swing * 0.48, 0, 0.08);
  limbs.armR.rotation.set(swing * 0.48, 0, -0.08);
  setElbow(limbs.elbowL, 0.32 + Math.max(0, -swing) * 0.28);
  setElbow(limbs.elbowR, 0.32 + Math.max(0, swing) * 0.28);
  limbs.head.rotation.x = swing * 0.04 + nod;
  group.position.y += Math.abs(swing) * 0.02;
  if (group.userData.dog) group.userData.dog.position.y = Math.abs(swing) * 0.05;
}

export function createProps(THREE, materials) {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const foliage = new THREE.IcosahedronGeometry(1, 0);
  const headGeo = new THREE.IcosahedronGeometry(1, 1);
  const chunky = new THREE.SphereGeometry(1, 5, 4);
  const trunk = new THREE.CylinderGeometry(0.16, 0.26, 1, 6);
  const wheel = new THREE.CylinderGeometry(0.32, 0.32, 0.24, 16);
  const sphere = new THREE.SphereGeometry(1, 8, 6);
  const cone = new THREE.ConeGeometry(1, 1, 7);
  const shadowGeo = new THREE.CircleGeometry(1, 12);
  for (const geometry of [box, foliage, headGeo, chunky, trunk, wheel, sphere, cone, shadowGeo]) {
    geometry.userData.shared = true;
  }

  const wood = () => materials.lambert(0x8a5a3a, { flat: true });
  const metal = () => materials.lambert(0xb7bcc1, { flat: true });
  const glass = () => materials.lambert(0xb7d7e8, { flat: true });

  function scaledBox(w, h, d, material) {
    const mesh = new THREE.Mesh(box, material);
    mesh.scale.set(w, h, d);
    return mesh;
  }

  // The detail pass made dozens of meshes per building and car. Same-material
  // parts become one mesh so the town does not turn into tens of thousands of draw calls.
  function heldBack(mesh) {
    if (mesh.name || mesh.userData.keep) return true;
    const material = mesh.material;
    if (!material || Array.isArray(material)) return true;
    if (material.map) return true;
    if (material.transparent && material.opacity < 1) return true;
    if (material.emissive && material.emissive.getHex() !== 0) return true;
    return false;
  }

  function bakeStatic(group) {
    group.updateMatrixWorld(true);
    const inverse = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const buckets = new Map();
    const walk = (object) => {
      if (object !== group && object.userData.keep) return;
      if (object.isMesh && !heldBack(object)) {
        const list = buckets.get(object.material);
        if (list) list.push(object);
        else buckets.set(object.material, [object]);
      }
      for (const child of object.children) walk(child);
    };
    walk(group);
    const vertex = new THREE.Vector3();
    const facing = new THREE.Vector3();
    for (const [material, meshes] of buckets) {
      if (meshes.length < 2) continue;
      const positions = [];
      const normals = [];
      for (const mesh of meshes) {
        const geometry = mesh.geometry;
        const position = geometry.attributes.position;
        const normal = geometry.attributes.normal;
        const index = geometry.index;
        const matrix = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
        const count = index ? index.count : position.count;
        for (let i = 0; i < count; i += 1) {
          const slot = index ? index.getX(i) : i;
          vertex.fromBufferAttribute(position, slot).applyMatrix4(matrix);
          positions.push(vertex.x, vertex.y, vertex.z);
          if (normal) facing.fromBufferAttribute(normal, slot).applyMatrix3(normalMatrix).normalize();
          else facing.set(0, 1, 0);
          normals.push(facing.x, facing.y, facing.z);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
      const merged = new THREE.Mesh(geometry, material);
      merged.matrixAutoUpdate = false;
      merged.updateMatrix();
      group.add(merged);
      for (const mesh of meshes) {
        mesh.parent.remove(mesh);
        if (!mesh.geometry.userData.shared) mesh.geometry.dispose();
      }
    }
  }

  function gable(width, height, depth, material) {
    const hw = width / 2;
    const hd = depth / 2;
    const positions = new Float32Array([
      -hw, 0, -hd, hw, 0, -hd, 0, height, -hd,
      -hw, 0, hd, hw, 0, hd, 0, height, hd,
    ]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setIndex([
      0, 2, 1, 3, 4, 5,
      0, 3, 2, 2, 3, 5,
      1, 2, 4, 2, 5, 4,
    ]);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, material);
  }

  function createPerson(rand, pose, style = null) {
    // No style keeps the town people and the original rider: one build, pants, a tee.
    const woman = style?.body === "woman";
    const young = style?.age === "young";
    const old = style?.age === "old";
    const blouse = style?.top === "blouse";
    const skirt = style?.bottom === "skirt";
    const hairStyle = style?.hair === "long" || style?.hair === "bun" || style?.hair === "bald" ? style.hair : "short";
    const chestW = (woman ? 0.3 : 0.36) * (young ? 0.82 : 1);
    const hipW = (woman ? 0.42 : 0.36) * (young ? 0.85 : 1);
    const chestH = young ? 0.26 : 0.36;
    const chestY = young ? 0.88 : 1.24;
    const hipH = young ? 0.16 : 0.24;
    const hipMeshY = young ? 0.68 : 0.98;
    const shirt = materials.lambert(pick(SHIRTS, rand), { flat: false });
    const skin = materials.lambert(pick(SKINS, rand), { flat: false });
    const pants = materials.lambert(pick(PANTS, rand), { flat: false });
    // Old hair is its own gray. Do not recolor the shared town hair.
    const hairMat = materials.lambert(old ? 0xcfc8bc : pick(HAIR, rand), { flat: false });
    const shoes = materials.lambert(0x241c18, { flat: true });
    const eyeMat = materials.lambert(0x1c140f, { flat: true });
    const legMat = skirt ? skin : pants;
    const group = new THREE.Group();
    const hips = formed(THREE, "soft", hipW, hipH, woman ? 0.22 : 0.2, pants);
    hips.position.y = hipMeshY;
    const chest = formed(THREE, "soft", chestW, chestH, woman ? 0.2 : 0.22, shirt);
    chest.position.y = chestY;
    const collar = formed(THREE, "soft", blouse ? 0.26 : 0.18, 0.08, 0.14, shirt);
    collar.position.set(0, young ? 1.04 : 1.48, -0.02);
    group.add(hips, chest, collar);
    if (blouse) {
      const hem = formed(THREE, "soft", chestW + 0.1, 0.1, 0.26, shirt);
      hem.name = "person-blouse";
      hem.position.y = young ? 0.78 : 1.04;
      group.add(hem);
    }
    if (skirt) {
      const skirtMesh = formed(THREE, "soft", hipW + 0.18, young ? 0.26 : 0.36, 0.3, pants);
      skirtMesh.name = "person-skirt";
      skirtMesh.position.y = young ? 0.52 : 0.76;
      group.add(skirtMesh);
    }

    const headPivot = new THREE.Group();
    headPivot.position.y = young ? 1.12 : 1.58;
    const head = new THREE.Mesh(propGeo(THREE, "head"), skin);
    head.name = "person-head";
    const headScale = young ? [0.2, 0.22, 0.19] : [0.15, 0.17, 0.145];
    head.scale.set(headScale[0], headScale[1], headScale[2]);
    headPivot.add(head);
    if (hairStyle !== "bald") {
      const hairCap = new THREE.Mesh(propGeo(THREE, "hair"), hairMat);
      // The cap is a shell just outside the cranium, so it wears the head's scale.
      hairCap.scale.set(headScale[0], headScale[1], headScale[2]);
      hairCap.position.set(0, 0, 0);
      hairCap.userData.keep = true;
      if (style) hairCap.name = "person-hair-short";
      headPivot.add(hairCap);
      if (hairStyle === "long") {
        // The face looks down local -z (the nose). Long hair hangs on +z, the back.
        const lock = formed(THREE, "soft", 0.18, 0.42, 0.08, hairMat);
        lock.name = "person-hair-long";
        lock.userData.keep = true;
        lock.position.set(0, -0.16, 0.12);
        headPivot.add(lock);
      }
      if (hairStyle === "bun") {
        const bun = new THREE.Mesh(propGeo(THREE, "ellipsoid"), hairMat);
        bun.name = "person-hair-bun";
        bun.userData.keep = true;
        bun.scale.set(0.09, 0.09, 0.09);
        bun.position.set(0, 0.22, 0.02);
        headPivot.add(bun);
      }
    }
    const mouth = scaledBox(0.06, 0.015, 0.02, eyeMat);
    mouth.position.set(0, -0.055, -0.13);
    headPivot.add(mouth);
    if (old) {
      const glasses = new THREE.Group();
      glasses.name = "person-glasses";
      glasses.userData.keep = true;
      const frame = materials.lambert(0x1c140f, { flat: true });
      const bridge = scaledBox(0.12, 0.012, 0.012, frame);
      bridge.position.set(0, 0.025, -0.17);
      glasses.add(bridge);
      for (const x of [-0.046, 0.046]) {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 4, 8), frame);
        rim.position.set(x, 0.02, -0.17);
        glasses.add(rim);
      }
      headPivot.add(glasses);
    }
    for (const x of [-0.05, 0.05]) {
      const eye = scaledBox(0.03, 0.028, 0.02, eyeMat);
      eye.position.set(x, 0.02, -0.125);
      const brow = scaledBox(0.04, 0.012, 0.02, hairMat);
      brow.position.set(x, 0.055, -0.12);
      headPivot.add(eye, brow);
    }
    bakeStatic(headPivot);
    group.add(headPivot);

    const hipY = young ? 0.6 : 0.9;
    const thighLen = young ? 0.26 : 0.4;
    const shinLen = young ? 0.22 : 0.38;
    const upperH = young ? 0.18 : 0.24;
    const foreH = young ? 0.16 : 0.22;
    function leg(x) {
      const hip = new THREE.Group();
      hip.position.set(x, hipY, 0);
      const thigh = formed(THREE, "soft", skirt ? 0.1 : 0.13, thighLen, 0.13, legMat);
      thigh.position.y = -thighLen / 2;
      const knee = new THREE.Group();
      knee.position.y = -thighLen;
      const shin = formed(THREE, "soft", 0.1, shinLen, 0.11, legMat);
      shin.position.y = -shinLen / 2;
      const foot = formed(THREE, "soft", 0.13, 0.07, 0.24, shoes);
      foot.position.set(0, -shinLen + 0.02, -0.05);
      knee.add(shin, foot);
      hip.add(thigh, knee);
      return { hip, knee, foot };
    }

    function arm(x) {
      const shoulder = new THREE.Group();
      shoulder.position.set(x, young ? 0.96 : 1.36, 0);
      const upper = formed(THREE, "soft", young ? 0.08 : 0.1, upperH, young ? 0.08 : 0.1, shirt);
      upper.position.y = -upperH / 2;
      const elbow = new THREE.Group();
      elbow.position.y = -upperH;
      const forearm = formed(THREE, "soft", young ? 0.07 : 0.08, foreH, young ? 0.07 : 0.08, skin);
      forearm.position.y = -foreH / 2;
      const hand = new THREE.Group();
      hand.position.y = young ? -foreH : -0.24;
      const palm = formed(THREE, "soft", 0.09, 0.1, 0.045, skin);
      const thumb = formed(THREE, "soft", 0.035, 0.055, 0.035, skin);
      thumb.position.set(x > 0 ? -0.05 : 0.05, 0.02, -0.02);
      thumb.rotation.z = x > 0 ? 0.7 : -0.7;
      hand.add(palm, thumb);
      bakeStatic(hand);
      elbow.add(forearm, hand);
      shoulder.add(upper, elbow);
      return { shoulder, elbow, hand };
    }

    const hipX = woman ? 0.12 : 0.1;
    const shoulderX = woman ? 0.2 : 0.24;
    const leftLeg = leg(-hipX);
    const rightLeg = leg(hipX);
    const leftArm = arm(-shoulderX);
    const rightArm = arm(shoulderX);
    group.add(leftLeg.hip, rightLeg.hip, leftArm.shoulder, rightArm.shoulder);
    group.userData.limbs = {
      legL: leftLeg.hip,
      legR: rightLeg.hip,
      kneeL: leftLeg.knee,
      kneeR: rightLeg.knee,
      footL: leftLeg.foot,
      footR: rightLeg.foot,
      armL: leftArm.shoulder,
      armR: rightArm.shoulder,
      elbowL: leftArm.elbow,
      elbowR: rightArm.elbow,
      handL: leftArm.hand,
      handR: rightArm.hand,
      head: headPivot,
    };
    group.userData.pose = pose;
    group.userData.phase = rand() * Math.PI * 2;
    if (old) {
      group.userData.headPitch = 0.42;
      headPivot.rotation.x = 0.42;
    }
    return group;
  }

  function createTree(rand) {
    const group = new THREE.Group();
    const height = 1.55 + rand() * 1.55;
    const bark = materials.lambert(rand() > 0.5 ? 0x6b442c : 0x7a5236, { flat: false });
    const trunkMesh = new THREE.Mesh(propGeo(THREE, "trunk"), bark);
    trunkMesh.scale.set(1.15, height, 1.15);
    trunkMesh.position.y = height / 2;
    group.add(trunkMesh);
    const greens = [0x8fce55, 0x3c9a38, 0x6bb84a];
    const crown = 0.72 + rand() * 0.28;
    const puffs = [
      [0, height + crown * 0.42, 0, crown, 0.78, 0],
      [-crown * 0.55, height + crown * 0.12, crown * 0.12, crown * 0.7, 0.68, 1],
      [crown * 0.5, height + crown * 0.18, -crown * 0.12, crown * 0.66, 0.72, 2],
      [0.05, height + crown * 0.92, 0.02, crown * 0.5, 0.62, 0],
    ];
    for (const [x, y, z, scale, squash, tint] of puffs) {
      const leaf = materials.lambert(greens[tint], { flat: false });
      const blob = new THREE.Mesh(propGeo(THREE, "crown"), leaf);
      blob.scale.set(scale, scale * squash, scale * 0.92);
      blob.position.set(x, y, z);
      blob.rotation.y = rand() * Math.PI;
      group.add(blob);
    }
    bakeStatic(group);
    return group;
  }

  function createLamp() {
    const group = new THREE.Group();
    const pole = scaledBox(0.12, 4.3, 0.12, metal());
    pole.position.y = 2.15;
    const arm = scaledBox(0.85, 0.08, 0.08, metal());
    arm.position.set(0.35, 4.2, 0);
    const bulb = new THREE.Mesh(sphere, materials.bulb);
    bulb.scale.set(0.2, 0.14, 0.2);
    bulb.position.set(0.75, 4.08, 0);
    group.add(pole, arm, bulb);
    bakeStatic(group);
    return group;
  }

  function addWheels(group, points, scale = 1) {
    const wheels = [];
    const tire = materials.lambert(0x1b1b1b, { flat: false });
    const radius = 0.32 * scale;
    const tireGeo = propGeo(THREE, "wheel");
    for (const [x, z] of points) {
      const pivot = new THREE.Group();
      pivot.position.set(x, radius, z);
      const mesh = new THREE.Mesh(tireGeo, tire);
      mesh.rotation.z = Math.PI / 2;
      mesh.scale.set(scale, scale, scale);
      const hub = new THREE.Mesh(wheel, materials.standard(0xd5dbe2, { flat: true, roughness: 0.3, metalness: 0.72 }));
      hub.rotation.z = Math.PI / 2;
      hub.scale.set(scale * 0.38, scale * 0.38, scale * 0.22);
      hub.position.x = Math.sign(x || 1) * 0.13 * scale;
      pivot.add(mesh, hub);
      pivot.userData.keep = true;
      group.add(pivot);
      wheels.push(pivot);
    }
    group.userData.wheels = wheels;
    group.userData.roll = 0;
    return wheels;
  }

  function addShadow(group, width, length) {
    const blob = new THREE.Mesh(shadowGeo, materials.shadow);
    blob.rotation.x = -Math.PI / 2;
    blob.scale.set(width, length, 1);
    blob.position.y = 0.045;
    group.add(blob);
  }

  function createSedan(rand, style) {
    const cop = style === "cop";
    const paint = cop
      ? 0x152238
      : style === "taxi"
        ? 0xf0c431
        : pick([0x2f6adf, 0xd23b3b, 0xf4f4f4, 0x2aabb0, 0xf08a2a, 0x3a3a3a, 0x6a4ad4], rand);
    const group = new THREE.Group();
    const bodyMat = materials.standard(paint, { flat: false, roughness: 0.42, metalness: 0.18 });
    const body = new THREE.Mesh(propGeo(THREE, "sedan"), bodyMat);
    const shield = glass();
    const wind = scaledBox(1.28, 0.4, 0.05, shield);
    wind.position.set(0, 1.02, -0.55);
    wind.rotation.x = 0.5;
    const rearGlass = scaledBox(1.18, 0.34, 0.05, shield);
    rearGlass.position.set(0, 1.02, 1.0);
    rearGlass.rotation.x = -0.42;
    group.add(body, wind, rearGlass);
    // Side glass sits proud of the cabin so a passing car reads as windows, not a slab.
    const pane = materials.lambert(0x3e6274, { flat: true });
    const seam = materials.lambert(0x1a1e22, { flat: true });
    const chrome = materials.standard(0xc5ccd1, { flat: true, roughness: 0.35, metalness: 0.55 });
    for (const x of [-0.8, 0.8]) {
      for (const z of [-0.22, 0.55]) {
        const side = scaledBox(0.06, 0.36, 0.48, pane);
        side.position.set(x, 1.05, z);
        group.add(side);
      }
      const mullion = scaledBox(0.07, 0.42, 0.06, seam);
      mullion.position.set(x, 1.05, 0.16);
      const mirror = scaledBox(0.2, 0.07, 0.12, seam);
      mirror.position.set(x * 1.28, 1.02, -0.4);
      group.add(mullion, mirror);
    }
    for (const x of [-0.9, 0.9]) {
      const belt = scaledBox(0.04, 0.05, 3.9, seam);
      belt.position.set(x, 0.74, 0.05);
      const frontCut = scaledBox(0.05, 0.48, 0.06, seam);
      frontCut.position.set(x, 0.52, -0.58);
      const rearCut = scaledBox(0.05, 0.48, 0.06, seam);
      rearCut.position.set(x, 0.52, 0.92);
      group.add(belt, frontCut, rearCut);
    }
    for (const z of [-1.28, 1.28]) {
      for (const x of [-0.92, 0.92]) {
        const lip = scaledBox(0.1, 0.16, 0.74, bodyMat);
        lip.position.set(x, 0.72, z);
        group.add(lip);
      }
    }
    const grille = scaledBox(0.92, 0.22, 0.06, seam);
    grille.position.set(0, 0.52, -2.1);
    const bumper = scaledBox(1.82, 0.14, 0.12, chrome);
    bumper.position.set(0, 0.34, -2.12);
    const rearBumper = scaledBox(1.72, 0.14, 0.12, chrome);
    rearBumper.position.set(0, 0.34, 2.12);
    group.add(grille, bumper, rearBumper);
    for (const y of [0.46, 0.52, 0.58]) {
      const slat = scaledBox(0.76, 0.03, 0.03, chrome);
      slat.position.set(0, y, -2.16);
      group.add(slat);
    }
    if (style === "stripe" || cop) {
      const stripe = scaledBox(cop ? 0.18 : 0.32, 0.05, 4.25, materials.lambert(0xf7f7f7, { flat: true }));
      stripe.position.y = 0.95;
      group.add(stripe);
    }
    if (style === "taxi") {
      const sign = scaledBox(0.46, 0.14, 0.7, materials.lambert(0x1b1b1b, { flat: true }));
      sign.position.set(0, 1.45, 0.25);
      const lamp = scaledBox(0.5, 0.05, 0.74, materials.lambert(0xffd36a, { flat: true, emissive: 0xc48a20 }));
      lamp.position.set(0, 1.36, 0.25);
      group.add(sign, lamp);
    }
    if (cop) {
      // The lofted roof peaks at 1.24. The bar sits on that crown.
      const bar = scaledBox(0.92, 0.1, 0.36, materials.lambert(0x141414, { flat: true }));
      bar.position.set(0, 1.25, 0.15);
      const redMat = new THREE.MeshLambertMaterial({ color: 0xff2a2a, emissive: 0xff1a1a, emissiveIntensity: 0.35 });
      const blueMat = new THREE.MeshLambertMaterial({ color: 0x3a6dff, emissive: 0x2244ff, emissiveIntensity: 0.35 });
      const red = scaledBox(0.36, 0.16, 0.28, redMat);
      red.position.set(-0.22, 1.33, 0.15);
      const blue = scaledBox(0.36, 0.16, 0.28, blueMat);
      blue.position.set(0.22, 1.33, 0.15);
      group.add(bar, red, blue);
      group.userData.lights = { red, blue, on: rand() > 0.35 };
    }
    for (const x of [-0.55, 0.55]) {
      const head = scaledBox(0.28, 0.14, 0.08, materials.headlight);
      head.position.set(x, 0.62, -2.1);
      const tail = scaledBox(0.3, 0.12, 0.08, materials.taillight);
      tail.position.set(x, 0.62, 2.1);
      group.add(head, tail);
    }
    addMuffler(group, { x: -0.38, y: 0.3, z: 1.55, length: 0.5, smoke: rand() < 0.15 });
    addWheels(group, [[-0.8, -1.28], [0.8, -1.28], [-0.8, 1.28], [0.8, 1.28]]);
    addShadow(group, 1.35, 2.3);
    group.userData.kind = cop ? "cop" : "car";
    group.userData.halfL = 2.15;
    group.userData.halfW = 0.95;
    group.userData.roof = cop ? 1.42 : 1.45;
    bakeStatic(group);
    return group;
  }

  function addMuffler(group, { x, y, z, length, smoke }) {
    const soot = materials.lambert(0x2a2e32, { flat: true });
    const pipe = materials.standard(0xb7bcc1, { flat: true, roughness: 0.34, metalness: 0.62 });
    const body = scaledBox(0.16, 0.13, length, soot);
    body.name = "muffler";
    body.position.set(x, y, z);
    const tip = scaledBox(0.08, 0.08, 0.14, pipe);
    tip.position.set(x, y, z + length / 2 + 0.05);
    group.add(body, tip);
    group.userData.exhaust = {
      x,
      y: y + 0.1,
      z: z + length / 2 + 0.12,
      smoke: !!smoke,
      heavy: false,
    };
  }

  // Local -z is the cab front. The stack stands on the cab roof and smokes.
  function addOverCabStack(group, chrome, soot) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 1.7, 8), chrome);
    pipe.name = "truck-stack";
    pipe.position.set(0.72, 2.58, -1.15);
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.11, 0.14, 8), soot);
    lip.position.set(0.72, 3.46, -1.15);
    const boot = scaledBox(0.32, 0.08, 0.32, soot);
    boot.position.set(0.72, 1.76, -1.15);
    group.add(pipe, lip, boot);
    group.userData.exhaust = { x: 0.72, y: 3.56, z: -1.15, smoke: true, heavy: true };
  }

  function createTruck(rand) {
    const bigStack = rand() < 0.42;
    const paint = pick([0xc0392b, 0x2c3e50, 0xf4f4f4, 0x1e6b3a, 0xd4d7dc], rand);
    const group = new THREE.Group();
    const bodyMat = materials.standard(paint, { flat: false, roughness: 0.45, metalness: 0.16 });
    const dark = materials.lambert(0x1c2126, { flat: true });
    const bedMat = materials.lambert(0x8d939a, { flat: true });
    const chrome = materials.standard(0xc5ccd1, { flat: true, roughness: 0.32, metalness: 0.62 });
    const chassis = scaledBox(1.2, 0.16, 6.15, dark);
    chassis.position.set(0, 0.46, 0.05);
    const hood = new THREE.Mesh(propGeo(THREE, "truck"), bodyMat);
    const grille = scaledBox(1.42, 0.48, 0.08, dark);
    grille.name = "truck-grille";
    grille.position.set(0, 0.78, -3.08);
    const bumper = scaledBox(2.02, 0.2, 0.14, chrome);
    bumper.position.set(0, 0.46, -3.16);
    group.add(chassis, hood, grille, bumper);
    const shield = materials.lambert(0x9fd0ea, { flat: true, opacity: 0.9 });
    for (const x of [-0.44, 0.44]) {
      const wind = scaledBox(0.78, 0.48, 0.06, shield);
      wind.userData.keep = true;
      wind.position.set(x, 1.42, -1.98);
      wind.rotation.x = 0.28;
      group.add(wind);
    }
    for (const [x, z] of [[-1.02, -2.15], [1.02, -2.15], [-1.02, 1.7], [1.02, 1.7]]) {
      const fender = scaledBox(0.38, 0.16, 0.72, bodyMat);
      fender.position.set(x, 0.78, z);
      group.add(fender);
    }
    for (const x of [-1.02, 1.02]) {
      const win = scaledBox(0.06, 0.4, 0.62, shield);
      win.position.set(x, 1.4, -1.15);
      const mirror = scaledBox(0.16, 0.1, 0.08, dark);
      mirror.position.set(x * 1.16, 1.5, -1.72);
      group.add(win, mirror);
    }
    const bedFloor = scaledBox(1.92, 0.1, 3.05, bedMat);
    bedFloor.position.set(0, 0.72, 1.28);
    const gate = scaledBox(1.84, 0.48, 0.07, bodyMat);
    gate.position.set(0, 0.98, 2.78);
    const rack = scaledBox(1.9, 0.62, 0.06, dark);
    rack.position.set(0, 1.45, -0.28);
    group.add(bedFloor, gate, rack);
    for (const x of [-1, 1]) {
      const rail = scaledBox(0.08, 0.42, 2.95, bodyMat);
      rail.name = "truck-rail";
      rail.position.set(x * 0.96, 0.98, 1.25);
      group.add(rail);
    }
    for (const x of [-1.04, 1.04]) {
      const door = scaledBox(0.06, 0.58, 0.68, dark);
      door.position.set(x, 0.98, -1.22);
      const handle = scaledBox(0.06, 0.05, 0.12, chrome);
      handle.position.set(Math.sign(x) * 1.1, 1.02, -1.48);
      const step = scaledBox(0.18, 0.06, 0.34, dark);
      step.position.set(Math.sign(x) * 1.08, 0.52, -1.32);
      group.add(door, handle, step);
    }
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.85, 8), chrome);
    tank.rotation.x = Math.PI / 2;
    tank.position.set(0.78, 0.5, 0.35);
    group.add(tank);
    for (const x of [-1.02, 1.02]) {
      const flap = scaledBox(0.08, 0.32, 0.26, dark);
      flap.position.set(x, 0.28, 2.12);
      group.add(flap);
    }
    for (const x of [-0.7, 0, 0.7]) {
      const marker = scaledBox(0.12, 0.08, 0.08, materials.lambert(0xffb03a, { flat: true, emissive: 0xff8a1a }));
      marker.position.set(x, 1.76, -1.82);
      group.add(marker);
    }
    for (const z of [0.45, 1.25, 2.05]) {
      const rib = scaledBox(1.7, 0.06, 0.08, dark);
      rib.position.set(0, 0.8, z);
      group.add(rib);
    }
    for (const y of [0.64, 0.76, 0.88, 1.0]) {
      const bar = scaledBox(1.15, 0.03, 0.03, chrome);
      bar.position.set(0, y, -3.14);
      group.add(bar);
    }
    if (bigStack) addOverCabStack(group, chrome, dark);
    else addMuffler(group, { x: -0.62, y: 0.4, z: 2.05, length: 0.62, smoke: rand() < 0.15 });
    for (const x of [-0.62, 0.62]) {
      const head = scaledBox(0.28, 0.14, 0.06, materials.headlight);
      head.position.set(x, 0.62, -3.18);
      const tail = scaledBox(0.22, 0.12, 0.06, materials.taillight);
      tail.position.set(x * 0.7, 0.95, 2.84);
      group.add(head, tail);
    }
    addWheels(group, [[-1.02, -2.15], [1.02, -2.15], [-1.02, 0.55], [1.02, 0.55], [-1.02, 1.7], [1.02, 1.7]], 1.12);
    addShadow(group, 1.6, 3.4);
    group.userData.kind = "truck";
    group.userData.halfL = 3.35;
    group.userData.halfW = 1.15;
    group.userData.roof = 1.95;
    bakeStatic(group);
    return group;
  }

  function createBus(rand) {
    const paint = pick([0xf0c431, 0x2f6adf, 0xd23b3b, 0x1f8a4c], rand);
    const group = new THREE.Group();
    const bodyMat = materials.standard(paint, { flat: false, roughness: 0.5, metalness: 0.08 });
    const body = new THREE.Mesh(propGeo(THREE, "bus"), bodyMat);
    const frameMat = materials.lambert(0x1a1e22, { flat: true });
    const door = scaledBox(0.08, 1.4, 1.05, materials.lambert(0xdfe6ee, { flat: true }));
    door.position.set(-1.2, 1.15, -3.35);
    const doorFrame = scaledBox(0.05, 1.55, 1.2, frameMat);
    doorFrame.position.set(-1.26, 1.15, -3.35);
    const doorGlass = scaledBox(0.04, 0.48, 0.38, materials.lambert(0xb7d7e8, { flat: true }));
    doorGlass.position.set(-1.28, 1.42, -3.35);
    const sign = scaledBox(1.4, 0.28, 0.08, materials.lambert(0x1b1b1b, { flat: true }));
    sign.position.set(0, 2.58, -4.86);
    const dest = scaledBox(1.12, 0.14, 0.03, materials.lambert(0xf3e2a0, { flat: true, emissive: 0x6a5a30 }));
    dest.position.set(0, 2.58, -4.92);
    group.add(body, door, doorFrame, doorGlass, sign, dest);
    const pane = materials.lambert(0xb7d7e8, { flat: true, opacity: 0.88 });
    for (const x of [-1.22, 1.22]) {
      for (const z of [-1.55, 0.15, 1.75, 3.35]) {
        const bezel = scaledBox(0.04, 0.74, 1.42, frameMat);
        bezel.position.set(Math.sign(x) * 1.18, 2.05, z);
        const win = scaledBox(0.08, 0.62, 1.28, pane);
        win.userData.keep = true;
        win.position.set(x, 2.05, z);
        group.add(bezel, win);
      }
    }
    // Body front sits at z=-4.6. The glass has to stand proud of that face
    // or the red panel reads as a blank rear.
    const bezel = scaledBox(2.16, 0.96, 0.08, frameMat);
    bezel.position.set(0, 1.96, -4.78);
    group.add(bezel);
    const stripe = scaledBox(2.42, 0.14, 8.4, materials.lambert(0xf4f1ea, { flat: true }));
    stripe.position.set(0, 1.2, 0.2);
    const bumper = scaledBox(2.25, 0.16, 0.14, materials.standard(0xc5ccd1, { flat: true, roughness: 0.35, metalness: 0.5 }));
    bumper.position.set(0, 0.4, -4.95);
    const roofRidge = scaledBox(1.55, 0.12, 6.4, materials.lambert(0x2a3138, { flat: true }));
    roofRidge.position.set(0, 2.48, 0.25);
    group.add(stripe, bumper, roofRidge);
    for (const z of [-2.6, -0.8, 1.0, 2.8]) {
      const lamp = scaledBox(0.1, 0.08, 0.1, materials.lambert(0xffb03a, { flat: true, emissive: 0xff8a1a }));
      lamp.position.set(0, 2.62, z);
      group.add(lamp);
    }
    for (const [x, z] of [[-1.22, -3.15], [1.22, -3.15], [-1.22, 3.15], [1.22, 3.15]]) {
      const arch = scaledBox(0.1, 0.18, 0.85, bodyMat);
      arch.position.set(x, 0.72, z);
      group.add(arch);
    }
    for (const y of [0.9, 1.2, 1.5]) {
      const vent = scaledBox(1.35, 0.08, 0.05, frameMat);
      vent.position.set(0, y, 4.96);
      group.add(vent);
    }
    const shield = materials.lambert(0x7ec8e8, { flat: true, opacity: 0.94, emissive: 0x163848 });
    for (const x of [-0.52, 0.52]) {
      const windshield = scaledBox(0.92, 0.78, 0.1, shield);
      windshield.userData.keep = true;
      windshield.position.set(x, 1.96, -4.9);
      group.add(windshield);
    }
    const pillar = scaledBox(0.1, 0.82, 0.12, frameMat);
    pillar.position.set(0, 1.96, -4.9);
    group.add(pillar);
    for (const x of [-0.7, 0.7]) {
      const head = scaledBox(0.36, 0.18, 0.08, materials.headlight);
      head.position.set(x, 0.72, -4.86);
      const tail = scaledBox(0.34, 0.16, 0.08, materials.taillight);
      tail.position.set(x, 0.85, 4.85);
      group.add(head, tail);
    }
    addMuffler(group, { x: -0.55, y: 0.42, z: 4.15, length: 0.62, smoke: rand() < 0.15 });
    addWheels(group, [[-1.15, -3.15], [1.15, -3.15], [-1.15, 3.15], [1.15, 3.15]], 1.2);
    addShadow(group, 1.7, 5.1);
    group.userData.kind = "bus";
    group.userData.halfL = 4.9;
    group.userData.halfW = 1.28;
    group.userData.roof = 2.72;
    bakeStatic(group);
    return group;
  }

  function createCar(rand, style) {
    if (style === "truck") return createTruck(rand);
    if (style === "bus") return createBus(rand);
    return createSedan(rand, style);
  }

  function createHouse(rand) {
    const group = new THREE.Group();
    const width = 6.4 + rand() * 2.4;
    const depth = 7.2 + rand() * 2.2;
    const height = 2.7 + rand() * 0.9;
    const siding = materials.lambert(pick(SIDING, rand), { flat: false });
    const trim = materials.lambert(0x3c342c, { flat: true });
    const body = formed(THREE, "crisp", width, height, depth, siding);
    body.position.y = height / 2;
    const foundation = formed(THREE, "crisp", width + 0.12, 0.32, depth + 0.12, materials.lambert(0x6a6358, { flat: false }));
    foundation.position.y = 0.16;
    const roofH = 1.55 + rand() * 0.45;
    const roofMat = materials.lambert(pick(ROOFS, rand), { flat: true, side: THREE.DoubleSide });
    const roof = gable(width + 0.7, roofH, depth + 0.55, roofMat);
    roof.position.y = height;
    const doorX = (rand() - 0.5) * 0.8;
    group.userData.doorX = doorX;
    const doorMat = materials.lambert(0x4a3428, { flat: true });
    const door = scaledBox(0.86, 1.7, 0.08, doorMat);
    door.position.set(doorX, 0.9, -depth / 2 - 0.08);
    const doorFrame = scaledBox(1.08, 1.92, 0.06, trim);
    doorFrame.position.set(doorX, 0.98, -depth / 2 - 0.04);
    const stoop = scaledBox(1.25, 0.12, 0.5, trim);
    stoop.position.set(doorX, 0.08, -depth / 2 - 0.32);
    const front = -depth / 2;
    const porchY = Math.min(height - 0.2, 2.28);
    const porch = scaledBox(2.35, 0.08, 0.55, trim);
    porch.position.set(doorX, porchY, front - 0.14);
    const fascia = scaledBox(width + 0.85, 0.12, 0.16, trim);
    fascia.position.set(0, height - 0.04, front - 0.3);
    const ridge = scaledBox(0.16, 0.1, depth + 0.65, materials.lambert(0x2c3036, { flat: true }));
    ridge.position.y = height + roofH - 0.04;
    group.add(body, foundation, roof, doorFrame, door, stoop, porch, fascia, ridge);
    for (const x of [-0.95, 0.95]) {
      const post = scaledBox(0.1, porchY, 0.1, trim);
      post.position.set(doorX + x, porchY / 2, front - 0.34);
      group.add(post);
    }
    for (const y of [0.58, 1.18]) {
      const panel = scaledBox(0.56, 0.46, 0.03, materials.lambert(0x3a2a22, { flat: true }));
      panel.position.set(doorX, y, front - 0.15);
      group.add(panel);
    }
    for (const x of [-width * 0.28, width * 0.28]) {
      const y = height * 0.62;
      const z = front - 0.02;
      const frame = scaledBox(0.96, 1.08, 0.06, trim);
      frame.position.set(x, y, z);
      const windowMesh = scaledBox(0.68, 0.78, 0.05, glass());
      windowMesh.position.set(x, y, z - 0.03);
      const sill = scaledBox(1.02, 0.08, 0.16, trim);
      sill.position.set(x, y - 0.52, z - 0.06);
      const muntinV = scaledBox(0.045, 0.74, 0.03, trim);
      muntinV.position.set(x, y, z - 0.06);
      const muntinH = scaledBox(0.64, 0.045, 0.03, trim);
      muntinH.position.set(x, y, z - 0.06);
      group.add(frame, windowMesh, sill, muntinV, muntinH);
      for (const side of [-0.58, 0.58]) {
        const shutter = scaledBox(0.14, 0.9, 0.04, trim);
        shutter.position.set(x + side, y, z - 0.02);
        group.add(shutter);
      }
    }
    for (const outward of [-1, 1]) {
      for (const z of [-depth * 0.22, depth * 0.2]) {
        const x = outward * (width / 2 + 0.03);
        const y = height * 0.58;
        const frame = scaledBox(0.05, 0.86, 0.7, trim);
        frame.position.set(x, y, z);
        const windowMesh = scaledBox(0.04, 0.62, 0.48, glass());
        windowMesh.position.set(x + outward * 0.03, y, z);
        const muntinV = scaledBox(0.03, 0.58, 0.04, trim);
        muntinV.position.set(x + outward * 0.05, y, z);
        const muntinH = scaledBox(0.03, 0.04, 0.46, trim);
        muntinH.position.set(x + outward * 0.05, y, z);
        group.add(frame, windowMesh, muntinV, muntinH);
      }
    }
    for (const x of [-1, 1]) {
      for (const z of [-1, 1]) {
        const board = scaledBox(0.12, height, 0.12, trim);
        board.position.set(x * width / 2, height / 2, z * depth / 2);
        group.add(board);
      }
    }
    if (rand() > 0.45) {
      const chimney = scaledBox(0.42, 1.05, 0.42, materials.lambert(0x6d4038, { flat: true }));
      chimney.position.set(width * 0.22, height + roofH * 0.55, depth * 0.12);
      const cap = scaledBox(0.52, 0.08, 0.52, trim);
      cap.position.set(width * 0.22, height + roofH * 0.55 + 0.56, depth * 0.12);
      group.add(chimney, cap);
    }
    group.userData.depth = depth;
    group.userData.width = width;
    bakeStatic(group);
    return group;
  }

  function createTower(rand, litChance, street = true) {
    const group = new THREE.Group();
    const width = 8 + rand() * 6;
    const depth = 8 + rand() * 4;
    const height = 7 + rand() * 18;
    const body = scaledBox(width, height, depth, materials.facade(pick(FACADES, rand), litChance, Math.floor(rand() * 20)));
    body.position.y = height / 2;
    const skirtMat = materials.lambert(0x3e4650, { flat: true });
    const trim = materials.lambert(0x2e353c, { flat: true });
    const skirt = scaledBox(width + 0.1, 1.2, depth + 0.1, skirtMat);
    skirt.position.y = 0.6;
    const cap = scaledBox(width + 0.55, 0.28, depth + 0.55, materials.lambert(0x667078, { flat: true }));
    cap.position.y = height + 0.16;
    const pent = scaledBox(width * 0.4, 1.15, depth * 0.4, materials.lambert(0x4a545c, { flat: true }));
    pent.position.y = height + 0.95;
    group.add(body, skirt, cap, pent);
    for (const x of [-1, 1]) {
      for (const z of [-1, 1]) {
        const pier = scaledBox(0.32, height + 0.15, 0.32, trim);
        pier.position.set(x * width / 2, height / 2, z * depth / 2);
        group.add(pier);
      }
    }
    const bands = Math.max(2, Math.min(6, Math.floor(height / 3.4)));
    for (let index = 1; index < bands; index += 1) {
      const band = scaledBox(width + 0.18, 0.1, depth + 0.18, trim);
      band.position.y = (height / bands) * index;
      group.add(band);
    }
    const front = -depth / 2;
    if (street) {
      const lobby = scaledBox(width * 0.48, 1.55, 0.06, glass());
      lobby.position.set(-width * 0.1, 1.15, front - 0.06);
      const lobbyFrame = scaledBox(width * 0.54, 1.75, 0.05, trim);
      lobbyFrame.position.set(-width * 0.1, 1.15, front - 0.02);
      const lobbyDoor = scaledBox(0.9, 1.85, 0.08, materials.lambert(0x241c18, { flat: true }));
      lobbyDoor.position.set(width * 0.26, 0.98, front - 0.08);
      group.add(lobbyFrame, lobby, lobbyDoor);
    }
    const balconyCount = Math.max(1, Math.min(4, Math.floor((height - 4) / 3.2)));
    for (let index = 0; index < balconyCount; index += 1) {
      const y = 3.5 + index * 3.15;
      if (y > height - 1.4) break;
      const slabW = Math.min(3.4, width * 0.34);
      const x = width * 0.16;
      const slab = scaledBox(slabW, 0.1, 0.55, skirtMat);
      slab.position.set(x, y, front - 0.22);
      const rail = scaledBox(slabW, 0.08, 0.06, trim);
      rail.position.set(x, y + 0.42, front - 0.46);
      group.add(slab, rail);
      for (const end of [-1, 1]) {
        const post = scaledBox(0.06, 0.42, 0.06, trim);
        post.position.set(x + end * (slabW * 0.5 - 0.04), y + 0.24, front - 0.46);
        const sideRail = scaledBox(0.05, 0.08, 0.5, trim);
        sideRail.position.set(x + end * (slabW * 0.5 - 0.04), y + 0.42, front - 0.22);
        group.add(post, sideRail);
      }
    }
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 1.05, 8), skirtMat);
    tank.position.set(width * 0.28, height + 1.75, depth * 0.28);
    const antenna = scaledBox(0.06, 1.7, 0.06, trim);
    antenna.position.set(-width * 0.28, height + 1.6, -depth * 0.22);
    group.add(tank, antenna);
    group.userData.depth = depth;
    group.userData.width = width;
    bakeStatic(group);
    return group;
  }

  function createShop(rand, litChance) {
    const group = createTower(rand, litChance, false);
    const width = group.userData.width;
    const depth = group.userData.depth;
    const awningColor = pick([0xd23b3b, 0x2f6adf, 0xf0c431, 0x2f9d6a], rand);
    const awningMesh = scaledBox(width * 0.86, 0.1, 1.5, materials.awning(awningColor));
    awningMesh.position.set(0, 2.7, -depth / 2 - 0.55);
    awningMesh.rotation.x = AWNING_PITCH;
    const front = -depth / 2 - 0.06;
    const trim = materials.lambert(0x2a3138, { flat: true });
    const storeFrame = scaledBox(width * 0.62, 1.6, 0.05, trim);
    storeFrame.position.set(-width * 0.12, 1.15, front + 0.04);
    const store = scaledBox(width * 0.55, 1.35, 0.08, glass());
    store.position.set(-width * 0.12, 1.15, front);
    const sill = scaledBox(width * 0.64, 0.1, 0.16, trim);
    sill.position.set(-width * 0.12, 0.4, front - 0.06);
    const shopDoor = scaledBox(0.8, 1.7, 0.08, materials.lambert(0x3a2a24, { flat: true }));
    shopDoor.position.set(width * 0.28, 0.9, front);
    const doorFrame = scaledBox(1.0, 1.9, 0.05, trim);
    doorFrame.position.set(width * 0.28, 0.98, front + 0.04);
    const board = scaledBox(width * 0.32, 0.4, 0.08, materials.lambert(0x1b1b1b, { flat: true }));
    board.position.set(width * 0.28, 2.15, front - 0.08);
    const letter = scaledBox(width * 0.24, 0.16, 0.03, materials.lambert(awningColor, { flat: true }));
    letter.position.set(width * 0.28, 2.15, front - 0.14);
    group.add(awningMesh, storeFrame, store, sill, doorFrame, shopDoor, board, letter);
    bakeStatic(group);
    return group;
  }

  function createBench() {
    const group = new THREE.Group();
    const seat = scaledBox(1.6, 0.08, 0.46, wood());
    seat.position.y = BENCH.seatY;
    const back = scaledBox(1.6, 0.42, 0.08, wood());
    back.position.set(0, 0.78, BENCH.backZ);
    group.add(seat, back);
    // Seat underside is seatY - 0.04. Legs run from the sidewalk (y 0) up to it.
    const legMat = metal();
    const legH = BENCH.seatY - 0.04;
    for (const x of [-0.62, 0.62]) {
      for (const z of [-0.14, 0.14]) {
        const leg = scaledBox(0.07, legH, 0.07, legMat);
        leg.position.set(x, legH / 2, z);
        group.add(leg);
      }
    }
    bakeStatic(group);
    return group;
  }

  function createFence(length) {
    const group = new THREE.Group();
    const material = wood();
    const top = scaledBox(length, 0.08, 0.08, material);
    top.position.y = 0.9;
    const mid = scaledBox(length, 0.08, 0.08, material);
    mid.position.y = 0.48;
    group.add(top, mid);
    const posts = Math.max(2, Math.round(length / 1.5));
    for (let index = 0; index < posts; index += 1) {
      const post = scaledBox(0.08, 1.05, 0.08, material);
      post.position.set(-length / 2 + (posts === 1 ? 0 : (index / (posts - 1)) * length), 0.52, 0);
      group.add(post);
    }
    bakeStatic(group);
    return group;
  }

  // House-local yard. Origin matches the house. Local -z is the street.
  // The front rail sits yardDepth in front of the facade, with a gate on the door.
  // Side rails run back toward the wall and stop short of it.
  // Check: doorX 0, yardDepth 4 → front rail z = -depth/2 - 4, and no picket
  // has |x| < 0.45 on that rail.
  function createYardFence({ width, depth, doorX = 0, yardDepth }) {
    const group = new THREE.Group();
    const material = materials.lambert(0xe6dcc8, { flat: true });
    const pathMat = materials.lambert(0xc8bea8, { flat: true });
    const faceZ = -depth / 2;
    const frontZ = faceZ - yardDepth;
    const wallZ = faceZ - 0.32;
    const half = width / 2;
    const gate = 1.2;
    const gateL = doorX - gate / 2;
    const gateR = doorX + gate / 2;
    const runs = [];

    const placeOn = (mesh, axis, along, y, fixed) => {
      if (axis === "x") mesh.position.set(along, y, fixed);
      else mesh.position.set(fixed, y, along);
      group.add(mesh);
    };

    const addSpan = (axis, from, to, fixed, pickets) => {
      const length = to - from;
      if (length < 0.3) return;
      const mid = (from + to) / 2;
      if (axis === "x") runs.push({ axis, x0: from, x1: to, z: fixed });
      else runs.push({ axis, x: fixed, z0: from, z1: to });
      for (const y of [0.4, 0.78]) {
        const rail = scaledBox(axis === "x" ? length : 0.055, 0.055, axis === "x" ? 0.055 : length, material);
        placeOn(rail, axis, mid, y, fixed);
      }
      const posts = Math.max(2, Math.round(length / 1.45));
      for (let index = 0; index < posts; index += 1) {
        const t = posts === 1 ? 0.5 : index / (posts - 1);
        const post = scaledBox(0.08, 1.0, 0.08, material);
        placeOn(post, axis, from + t * length, 0.5, fixed);
      }
      if (!pickets) return;
      const count = Math.max(2, Math.floor(length / 0.22));
      const inset = 0.06;
      const span = Math.max(0.05, length - inset * 2);
      for (let index = 0; index < count; index += 1) {
        const t = count === 1 ? 0.5 : index / (count - 1);
        const picket = scaledBox(0.04, 0.88, 0.025, material);
        // Street side of the front rail is -z, so the pickets face the road.
        placeOn(picket, axis, from + inset + t * span, 0.44, fixed - 0.04);
      }
    };

    addSpan("x", -half, gateL, frontZ, true);
    addSpan("x", gateR, half, frontZ, true);
    addSpan("z", frontZ, wallZ, -half, false);
    addSpan("z", frontZ, wallZ, half, false);
    for (const x of [gateL, gateR]) {
      const post = scaledBox(0.09, 1.05, 0.09, material);
      post.position.set(x, 0.52, frontZ);
      group.add(post);
    }

    const pathFar = faceZ - 0.62;
    const pathLen = pathFar - frontZ;
    if (pathLen > 0.35) {
      const path = scaledBox(0.92, 0.04, pathLen, pathMat);
      path.position.set(doorX, 0.025, frontZ + pathLen / 2);
      group.add(path);
    }

    group.userData.yard = { faceZ, frontZ, wallZ, gateL, gateR, half, runs };
    bakeStatic(group);
    return group;
  }

  function createHydrant() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.55, 6), materials.lambert(0xc0392b, { flat: true }));
    body.position.y = 0.32;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.16, 6), materials.lambert(0xdedede, { flat: true }));
    cap.position.y = 0.66;
    group.add(body, cap);
    bakeStatic(group);
    return group;
  }

  function createConeProp() {
    const group = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.28, 0.07, 8),
      materials.lambert(0x1c1c1c, { flat: true }),
    );
    base.position.y = 0.035;
    const body = new THREE.Mesh(cone, materials.lambert(0xf26b1d, { flat: true }));
    body.scale.set(0.24, 0.78, 0.24);
    body.position.y = 0.46;
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.15, 0.09, 8),
      materials.lambert(0xf7f7f7, { flat: true }),
    );
    band.position.y = 0.42;
    group.add(base, body, band);
    return group;
  }

  function createCrate(rand) {
    const mesh = scaledBox(0.5 + rand() * 0.3, 0.4, 0.48, materials.lambert(0xb08968, { flat: true }));
    mesh.position.y = 0.2;
    mesh.rotation.y = rand();
    return mesh;
  }

  function createSign(text) {
    const group = new THREE.Group();
    const pole = scaledBox(0.08, 2.3, 0.08, metal());
    pole.position.set(0, 1.15, SIGN_POLE_Z);
    const boardMat = materials.sign(text);
    boardMat.side = THREE.DoubleSide;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.46), boardMat);
    board.position.set(0, 2.25, SIGN_BOARD_Z);
    board.rotation.y = Math.PI;
    group.add(pole, board);
    return group;
  }

  function createBusStop() {
    const group = new THREE.Group();
    const frame = metal();
    for (const x of [-1.3, 1.3]) {
      const pole = scaledBox(0.08, 2.4, 0.08, frame);
      pole.position.set(x, 1.2, 0);
      group.add(pole);
    }
    const roof = scaledBox(3.1, 0.1, 1.5, materials.lambert(0x5f6a72, { flat: true }));
    roof.position.y = 2.45;
    const panel = scaledBox(2.6, 1.3, 0.06, materials.lambert(0xc5dbe6, { flat: true, opacity: 0.85 }));
    panel.position.set(0, 1.4, 0.55);
    group.add(roof, panel);
    const sign = createSign("BUS");
    sign.position.set(1.9, 0, 0.2);
    group.add(sign);
    bakeStatic(group);
    return group;
  }

  function shapePoint(angle, radius) {
    return { x: Math.cos(angle) * radius, z: -Math.sin(angle) * radius };
  }

  function flatShape(radii, material, y) {
    const shape = new THREE.Shape();
    radii.forEach((radius, index) => {
      const angle = (index / radii.length) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (index === 0) shape.moveTo(x, z);
      else shape.lineTo(x, z);
    });
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    return mesh;
  }

  // Raised broken lip around a dark mouth. Vertices stick up; the mesh
  // origin stays on the road so the hole does not read as a mound.
  function craterRim(outer, opening, material, raw) {
    const positions = [];
    const push = (point, y) => positions.push(point.x, y, point.z);
    for (let index = 0; index < outer.length; index += 1) {
      const next = (index + 1) % outer.length;
      const a0 = (index / outer.length) * Math.PI * 2;
      const a1 = (next / outer.length) * Math.PI * 2;
      const lip0 = 0.05 + (raw[index] - 0.58) * 0.16;
      const lip1 = 0.05 + (raw[next] - 0.58) * 0.16;
      const o0 = shapePoint(a0, outer[index]);
      const o1 = shapePoint(a1, outer[next]);
      const n0 = shapePoint(a0, opening[index]);
      const n1 = shapePoint(a1, opening[next]);
      push(o0, lip0); push(n0, 0.028); push(o1, lip1);
      push(n0, 0.028); push(n1, 0.028); push(o1, lip1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, material);
  }

  function createPothole(rand) {
    const group = new THREE.Group();
    const asphalt = materials.lambert(0x4a5058, { flat: true });
    const chip = materials.lambert(0x6a645c, { flat: true });
    const rimMat = materials.lambert(0x5e656c, { flat: true, side: THREE.DoubleSide });
    const voidMat = materials.lambert(0x070809, { flat: true });
    const dirt = materials.lambert(0x2a1c14, { flat: true });
    const jagged = (count, min, span) => {
      const radii = [];
      for (let index = 0; index < count; index += 1) radii.push(min + rand() * span);
      return radii;
    };
    // Same rand count as before, so the rest of the chunk stays put.
    // The raw span is a star. Compress it into a lumpy oval about a meter and a half across.
    const raw = jagged(10, 0.58, 0.6);
    const inner = jagged(9, 0.28, 0.2);
    const floor = jagged(7, 0.14, 0.12);
    const lip = raw.map((radius) => 0.74 + (radius - 0.58) * 0.38);
    const opening = lip.map((radius, index) => {
      const tuck = (inner[index % inner.length] - 0.28) / 0.2;
      return radius * (0.84 + tuck * 0.08);
    });
    const mouth = flatShape(opening.map((radius) => radius * 1.04), voidMat, 0.02);
    group.add(mouth);
    const soil = flatShape(floor.map((radius) => radius * 0.85), dirt, 0.026);
    group.add(soil);
    group.add(craterRim(lip, opening, rimMat, raw));
    const chunks = 6 + Math.floor(rand() * 3);
    for (let index = 0; index < chunks; index += 1) {
      const angle = rand() * Math.PI * 2;
      const reach = rand();
      const width = 0.16 + rand() * 0.16;
      const depth = 0.12 + rand() * 0.1;
      const slab = scaledBox(width, 0.05, depth, rand() > 0.45 ? chip : asphalt);
      const spoke = Math.floor((angle / (Math.PI * 2)) * lip.length) % lip.length;
      const point = shapePoint(angle, lip[spoke] * (0.9 + reach * 0.14));
      slab.position.set(point.x, 0.04, point.z);
      // Local +Z is radial after the yaw, and a negative pitch lifts that outer edge.
      const tilt = 0.5 + rand() * 0.45;
      slab.rotation.set(-tilt, angle + Math.PI / 2, (rand() - 0.5) * 0.35);
      group.add(slab);
    }
    return group;
  }

  function createSlick(rand) {
    const group = new THREE.Group();
    const radii = [];
    let outer = 0;
    for (let index = 0; index < 12; index += 1) {
      const radius = 1.05 + rand() * 1.05;
      radii.push(radius);
      if (radius > outer) outer = radius;
    }
    const mesh = flatShape(radii, materials.slick(), 0.03);
    mesh.rotation.y = rand() * Math.PI;
    group.add(mesh);
    group.userData.radius = outer;
    return group;
  }

  function createCow(rand) {
    const group = new THREE.Group();
    const hide = materials.lambert(0xf4f1ea, { flat: false });
    const dark = materials.lambert(0x241c18, { flat: true });
    const hoofMat = materials.lambert(0x1a1614, { flat: true });
    const pink = materials.lambert(0xf0b0b8, { flat: true });
    const nose = materials.lambert(0xe7a090, { flat: true });
    // One barrel, not a pile of gems. Local −z is the face.
    const body = new THREE.Mesh(propGeo(THREE, "ellipsoid"), hide);
    body.scale.set(0.34, 0.26, 0.5);
    body.position.set(0, 0.74, 0.04);
    group.add(body);
    // Six rand() calls, same as the old spots, so the herd after this cow stays put.
    for (let index = 0; index < 3; index += 1) {
      const jitter = (rand() - 0.5) * 0.06;
      const along = (rand() - 0.35) * 0.5;
      const side = index === 0 ? 1 : -1;
      const spot = scaledBox(0.07, 0.16 + index * 0.05, 0.2 + (index === 2 ? 0.08 : 0), dark);
      spot.position.set(side * 0.3, 0.8 + (index === 1 ? 0.06 : 0), along + jitter);
      group.add(spot);
    }
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.32, 6), hide);
    neck.position.set(0, 0.92, -0.42);
    neck.rotation.x = -0.85;
    const dewlap = scaledBox(0.06, 0.1, 0.05, pink);
    dewlap.position.set(0, 0.78, -0.52);
    dewlap.rotation.x = -0.35;
    const head = new THREE.Mesh(propGeo(THREE, "ellipsoid"), hide);
    head.scale.set(0.16, 0.13, 0.18);
    head.position.set(0, 1.05, -0.7);
    const snout = scaledBox(0.15, 0.1, 0.16, nose);
    snout.position.set(0, 0.96, -0.88);
    const nostrilL = scaledBox(0.035, 0.03, 0.02, dark);
    nostrilL.position.set(-0.04, 0.94, -0.97);
    const nostrilR = scaledBox(0.035, 0.03, 0.02, dark);
    nostrilR.position.set(0.04, 0.94, -0.97);
    group.add(neck, dewlap, head, snout, nostrilL, nostrilR);
    for (const x of [-1, 1]) {
      const ear = scaledBox(0.14, 0.05, 0.07, pink);
      ear.position.set(x * 0.18, 1.02, -0.64);
      ear.rotation.z = x * 0.9;
      const horn = new THREE.Mesh(cone, dark);
      horn.scale.set(0.04, 0.18, 0.04);
      horn.position.set(x * 0.09, 1.22, -0.62);
      horn.rotation.z = -x * 0.7;
      const eye = scaledBox(0.05, 0.05, 0.03, dark);
      eye.position.set(x * 0.1, 1.08, -0.82);
      const shine = scaledBox(0.018, 0.018, 0.012, hide);
      shine.position.set(x * 0.11, 1.095, -0.84);
      group.add(ear, horn, eye, shine);
    }
    const udder = scaledBox(0.16, 0.12, 0.16, pink);
    udder.position.set(0, 0.4, 0.22);
    group.add(udder);
    for (const x of [-0.04, 0.04]) {
      const teat = scaledBox(0.028, 0.07, 0.028, pink);
      teat.position.set(x, 0.28, 0.24);
      group.add(teat);
    }
    const tail = scaledBox(0.04, 0.32, 0.04, dark);
    tail.position.set(0, 0.62, 0.52);
    tail.rotation.x = 0.7;
    const tuft = new THREE.Mesh(foliage, dark);
    tuft.scale.set(0.07, 0.07, 0.07);
    tuft.position.set(0, 0.42, 0.64);
    group.add(tail, tuft);
    const addLeg = (x, z, front) => {
      const hipPivot = new THREE.Group();
      hipPivot.position.set(x, 0.56, z);
      hipPivot.rotation.x = front ? 0.22 : -0.16;
      const thigh = formed(THREE, "soft", 0.12, 0.28, 0.13, hide);
      thigh.position.y = -0.14;
      const knee = new THREE.Group();
      knee.position.y = -0.28;
      knee.rotation.x = front ? -0.55 : 0.4;
      const shin = formed(THREE, "soft", 0.08, 0.22, 0.08, hide);
      shin.position.y = -0.11;
      const hoof = scaledBox(0.09, 0.06, 0.11, hoofMat);
      hoof.position.set(0, -0.24, front ? -0.03 : 0.02);
      knee.add(shin, hoof);
      hipPivot.add(thigh, knee);
      group.add(hipPivot);
    };
    addLeg(-0.16, -0.18, true);
    addLeg(0.16, -0.18, true);
    addLeg(-0.17, 0.28, false);
    addLeg(0.17, 0.28, false);
    return group;
  }

  function createSheep() {
    const group = new THREE.Group();
    const woolMat = materials.lambert(0xf7f4ee, { flat: false });
    const black = materials.lambert(0x1a1a1a, { flat: true });
    const woolShade = materials.lambert(0xe4ddd2, { flat: true });
    const pale = materials.lambert(0xf4f1ea, { flat: true });
    // A long fleece with a black face in front of it. Puffs keep the wool read.
    const body = new THREE.Mesh(propGeo(THREE, "ellipsoid"), woolMat);
    body.scale.set(0.28, 0.22, 0.36);
    body.position.set(0, 0.5, 0.02);
    group.add(body);
    const puffs = [
      [0, 0.68, 0.04, 0.24, 0.1, 0.28, woolMat],
      [0, 0.5, 0.26, 0.18, 0.16, 0.14, woolShade],
      [-0.2, 0.52, 0.02, 0.12, 0.14, 0.18, woolShade],
      [0.2, 0.5, 0.0, 0.12, 0.14, 0.18, woolMat],
    ];
    for (const [x, y, z, sx, sy, sz, material] of puffs) {
      const puff = new THREE.Mesh(propGeo(THREE, "crown"), material);
      puff.scale.set(sx, sy, sz);
      puff.position.set(x, y, z);
      group.add(puff);
    }
    const neck = scaledBox(0.14, 0.14, 0.24, black);
    neck.position.set(0, 0.5, -0.28);
    const head = new THREE.Mesh(propGeo(THREE, "ellipsoid"), black);
    head.scale.set(0.14, 0.12, 0.15);
    head.position.set(0, 0.54, -0.44);
    const muzzle = scaledBox(0.11, 0.075, 0.1, black);
    muzzle.position.set(0, 0.48, -0.56);
    group.add(neck, head, muzzle);
    for (const x of [-1, 1]) {
      const ear = scaledBox(0.18, 0.05, 0.04, black);
      ear.position.set(x * 0.2, 0.58, -0.4);
      ear.rotation.z = x * 0.45;
      const eye = scaledBox(0.042, 0.04, 0.02, pale);
      eye.position.set(x * 0.06, 0.57, -0.54);
      const pupil = scaledBox(0.02, 0.022, 0.012, black);
      pupil.position.set(x * 0.064, 0.568, -0.552);
      group.add(ear, eye, pupil);
    }
    const tail = new THREE.Mesh(foliage, woolShade);
    tail.scale.set(0.07, 0.07, 0.05);
    tail.position.set(0, 0.54, 0.36);
    group.add(tail);
    for (const [x, z] of [[-0.12, -0.06], [0.12, -0.06], [-0.13, 0.2], [0.13, 0.2]]) {
      const leg = formed(THREE, "soft", 0.06, 0.3, 0.06, black);
      leg.position.set(x, 0.15, z);
      group.add(leg);
    }
    return group;
  }

  function createAnimal(rand, kind) {
    return kind === "sheep" ? createSheep() : createCow(rand);
  }

  function createDog(rand) {
    const group = new THREE.Group();
    const fur = materials.lambert(pick([0xc4a574, 0x3a2a22, 0xf2efe8, 0x2a2a2a, 0x8a5a32], rand), { flat: false });
    const body = new THREE.Mesh(propGeo(THREE, "ellipsoid"), fur);
    body.scale.set(0.14, 0.11, 0.22);
    body.position.y = 0.2;
    const head = new THREE.Mesh(propGeo(THREE, "ellipsoid"), fur);
    head.scale.set(0.09, 0.09, 0.1);
    head.position.set(0, 0.3, -0.18);
    const snout = new THREE.Mesh(propGeo(THREE, "ellipsoid"), fur);
    snout.scale.set(0.05, 0.045, 0.07);
    snout.position.set(0, 0.26, -0.26);
    const tail = scaledBox(0.03, 0.12, 0.03, fur);
    tail.position.set(0, 0.3, 0.16);
    tail.rotation.x = -0.8;
    group.add(body, head, snout, tail);
    for (const [x, z] of [[-0.06, -0.08], [0.06, -0.08], [-0.06, 0.08], [0.06, 0.08]]) {
      const leg = formed(THREE, "soft", 0.035, 0.12, 0.035, fur);
      leg.position.set(x, 0.06, z);
      group.add(leg);
    }
    // Collar sits ahead of the walker. The leash runs back up to the right hand.
    const collar = new THREE.Vector3(0, 0.32, -0.04);
    const hand = new THREE.Vector3(-0.18, 0.86, 0.58);
    const span = hand.clone().sub(collar);
    const length = span.length();
    const leash = scaledBox(0.012, 0.012, length, materials.lambert(0x222222, { flat: true }));
    leash.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), span.multiplyScalar(1 / length));
    leash.position.copy(collar).addScaledVector(span, length * 0.5);
    group.add(leash);
    group.position.set(0.42, 0, -0.58);
    return group;
  }

  function createCafe(rand) {
    const group = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 8), materials.lambert(0xf4f1ea, { flat: true }));
    top.position.y = 0.75;
    const leg = scaledBox(0.08, 0.75, 0.08, metal());
    leg.position.y = 0.38;
    const umbrella = new THREE.Mesh(cone, materials.awning(pick([0xd23b3b, 0xf0c431], rand)));
    umbrella.scale.set(1.3, 0.55, 1.3);
    umbrella.position.y = 1.85;
    const pole = scaledBox(0.06, 1.15, 0.06, metal());
    pole.position.y = 1.35;
    group.add(top, leg, umbrella, pole);
    bakeStatic(group);
    return group;
  }

  return {
    createPerson,
    createTree,
    createLamp,
    createCar,
    createHouse,
    createTower,
    createShop,
    createBench,
    createFence,
    createYardFence,
    createHydrant,
    createCone: createConeProp,
    createCrate,
    createSign,
    createBusStop,
    createCafe,
    createPothole,
    bake: bakeStatic,
    createSlick,
    createAnimal,
    createDog,
  };
}
