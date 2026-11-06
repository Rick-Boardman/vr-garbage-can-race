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

export function animatePerson(group, time) {
  const limbs = group.userData.limbs;
  if (!limbs) return;
  const pose = group.userData.pose || "walk";
  const phase = group.userData.phase || 0;
  const flop = group.userData.flop;
  if (pose === "ragdoll" && flop) {
    limbs.legL.rotation.x = flop.legL.a;
    limbs.legR.rotation.x = flop.legR.a;
    limbs.armL.rotation.set(flop.armL.a, 0, flop.armLz.a);
    limbs.armR.rotation.set(flop.armR.a, 0, flop.armRz.a);
    limbs.head.rotation.x = flop.head.a;
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
    limbs.head.rotation.x = 0.08;
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
    limbs.head.rotation.x = 0;
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
    limbs.head.rotation.x = 0.28;
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
    limbs.head.rotation.x = 0.06;
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
    limbs.head.rotation.x = -0.15;
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
    limbs.head.rotation.x = 0.3;
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
  limbs.head.rotation.x = swing * 0.04;
  group.position.y += Math.abs(swing) * 0.02;
  if (group.userData.dog) group.userData.dog.position.y = Math.abs(swing) * 0.05;
}

export function createProps(THREE, materials) {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const foliage = new THREE.IcosahedronGeometry(1, 0);
  const headGeo = new THREE.IcosahedronGeometry(1, 1);
  const chunky = new THREE.SphereGeometry(1, 5, 4);
  const trunk = new THREE.CylinderGeometry(0.16, 0.26, 1, 6);
  const wheel = new THREE.CylinderGeometry(0.32, 0.32, 0.24, 8);
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

  function createPerson(rand, pose) {
    const shirt = materials.lambert(pick(SHIRTS, rand), { flat: true });
    const skin = materials.lambert(pick(SKINS, rand), { flat: true });
    const pants = materials.lambert(pick(PANTS, rand), { flat: true });
    const hairMat = materials.lambert(pick(HAIR, rand), { flat: true });
    const shoes = materials.lambert(0x241c18, { flat: true });
    const eyeMat = materials.lambert(0x1c140f, { flat: true });
    const group = new THREE.Group();
    const hips = scaledBox(0.36, 0.24, 0.2, pants);
    hips.position.y = 0.98;
    const chest = scaledBox(0.36, 0.36, 0.22, shirt);
    chest.position.y = 1.24;
    const collar = scaledBox(0.18, 0.08, 0.14, shirt);
    collar.position.set(0, 1.48, -0.02);
    group.add(hips, chest, collar);

    const headPivot = new THREE.Group();
    headPivot.position.y = 1.58;
    const head = new THREE.Mesh(headGeo, skin);
    head.name = "person-head";
    head.scale.set(0.15, 0.17, 0.145);
    headPivot.add(head);
    const hairCap = new THREE.Mesh(foliage, hairMat);
    hairCap.scale.set(0.17, 0.13, 0.17);
    hairCap.position.set(0, 0.1, 0.03);
    const fringe = new THREE.Mesh(foliage, hairMat);
    fringe.scale.set(0.13, 0.055, 0.08);
    fringe.position.set(0, 0.05, -0.11);
    headPivot.add(hairCap, fringe);
    const nose = new THREE.Mesh(cone, skin);
    nose.scale.set(0.042, 0.08, 0.042);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, -0.01, -0.145);
    const mouth = scaledBox(0.06, 0.015, 0.02, eyeMat);
    mouth.position.set(0, -0.055, -0.13);
    headPivot.add(nose, mouth);
    for (const x of [-0.05, 0.05]) {
      const eye = scaledBox(0.03, 0.028, 0.02, eyeMat);
      eye.position.set(x, 0.02, -0.125);
      const brow = scaledBox(0.04, 0.012, 0.02, hairMat);
      brow.position.set(x, 0.055, -0.12);
      const ear = scaledBox(0.025, 0.05, 0.03, skin);
      ear.position.set(x * 2.35, 0, 0.02);
      headPivot.add(eye, brow, ear);
    }
    group.add(headPivot);

    const hipY = 0.9;
    const thighLen = 0.4;
    const shinLen = 0.38;
    function leg(x) {
      const hip = new THREE.Group();
      hip.position.set(x, hipY, 0);
      const thigh = scaledBox(0.13, thighLen, 0.13, pants);
      thigh.position.y = -thighLen / 2;
      const knee = new THREE.Group();
      knee.position.y = -thighLen;
      const shin = scaledBox(0.1, shinLen, 0.11, pants);
      shin.position.y = -shinLen / 2;
      const foot = scaledBox(0.13, 0.07, 0.24, shoes);
      foot.position.set(0, -shinLen + 0.02, -0.05);
      knee.add(shin, foot);
      hip.add(thigh, knee);
      return { hip, knee, foot };
    }

    function arm(x) {
      const shoulder = new THREE.Group();
      shoulder.position.set(x, 1.36, 0);
      const upper = scaledBox(0.1, 0.24, 0.1, shirt);
      upper.position.y = -0.12;
      const elbow = new THREE.Group();
      elbow.position.y = -0.24;
      const forearm = scaledBox(0.08, 0.22, 0.08, skin);
      forearm.position.y = -0.11;
      const hand = new THREE.Group();
      hand.position.y = -0.24;
      const palm = scaledBox(0.09, 0.1, 0.045, skin);
      const thumb = scaledBox(0.035, 0.055, 0.035, skin);
      thumb.position.set(x > 0 ? -0.05 : 0.05, 0.02, -0.02);
      thumb.rotation.z = x > 0 ? 0.7 : -0.7;
      hand.add(palm, thumb);
      elbow.add(forearm, hand);
      shoulder.add(upper, elbow);
      return { shoulder, elbow, hand };
    }

    const leftLeg = leg(-0.1);
    const rightLeg = leg(0.1);
    const leftArm = arm(-0.24);
    const rightArm = arm(0.24);
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
    return group;
  }

  function createTree(rand) {
    const group = new THREE.Group();
    const height = 1.55 + rand() * 1.55;
    const bark = materials.lambert(rand() > 0.5 ? 0x6b442c : 0x7a5236, { flat: true });
    const trunkMesh = new THREE.Mesh(trunk, bark);
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
      const leaf = materials.lambert(greens[tint], { flat: true });
      const blob = new THREE.Mesh(foliage, leaf);
      blob.scale.set(scale, scale * squash, scale * 0.92);
      blob.position.set(x, y, z);
      blob.rotation.y = rand() * Math.PI;
      group.add(blob);
    }
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
    return group;
  }

  function addWheels(group, points, scale = 1) {
    const wheels = [];
    const tire = materials.lambert(0x1b1b1b, { flat: true });
    const radius = 0.32 * scale;
    for (const [x, z] of points) {
      const pivot = new THREE.Group();
      pivot.position.set(x, radius, z);
      const mesh = new THREE.Mesh(wheel, tire);
      mesh.rotation.z = Math.PI / 2;
      mesh.scale.set(scale, scale, scale);
      const hub = new THREE.Mesh(wheel, materials.standard(0xd5dbe2, { flat: true, roughness: 0.3, metalness: 0.72 }));
      hub.rotation.z = Math.PI / 2;
      hub.scale.set(scale * 0.38, scale * 0.38, scale * 0.22);
      hub.position.x = Math.sign(x || 1) * 0.13 * scale;
      pivot.add(mesh, hub);
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
    const bodyMat = materials.standard(paint, { flat: true, roughness: 0.42, metalness: 0.18 });
    const body = scaledBox(1.75, 0.46, 4.15, bodyMat);
    body.position.y = 0.56;
    const cabin = scaledBox(1.52, 0.42, 1.5, bodyMat);
    cabin.position.set(0, 0.98, 0.22);
    const roof = scaledBox(1.28, 0.08, 1.15, bodyMat);
    roof.position.set(0, 1.22, 0.28);
    const shield = glass();
    const wind = scaledBox(1.28, 0.4, 0.05, shield);
    wind.position.set(0, 1.02, -0.55);
    wind.rotation.x = 0.5;
    const rearGlass = scaledBox(1.18, 0.34, 0.05, shield);
    rearGlass.position.set(0, 1.02, 1.0);
    rearGlass.rotation.x = -0.42;
    group.add(body, cabin, roof, wind, rearGlass);
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
      const bar = scaledBox(0.92, 0.1, 0.36, materials.lambert(0x141414, { flat: true }));
      bar.position.set(0, 1.5, 0.15);
      const redMat = new THREE.MeshLambertMaterial({ color: 0xff2a2a, emissive: 0xff1a1a, emissiveIntensity: 0.35 });
      const blueMat = new THREE.MeshLambertMaterial({ color: 0x3a6dff, emissive: 0x2244ff, emissiveIntensity: 0.35 });
      const red = scaledBox(0.36, 0.16, 0.28, redMat);
      red.position.set(-0.22, 1.58, 0.15);
      const blue = scaledBox(0.36, 0.16, 0.28, blueMat);
      blue.position.set(0.22, 1.58, 0.15);
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
    group.userData.roof = cop ? 1.74 : 1.45;
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
    const bodyMat = materials.standard(paint, { flat: true, roughness: 0.45, metalness: 0.16 });
    const dark = materials.lambert(0x1c2126, { flat: true });
    const bedMat = materials.lambert(0x8d939a, { flat: true });
    const chrome = materials.standard(0xc5ccd1, { flat: true, roughness: 0.32, metalness: 0.62 });
    const chassis = scaledBox(1.2, 0.16, 6.15, dark);
    chassis.position.set(0, 0.46, 0.05);
    const hood = scaledBox(1.82, 0.38, 1.28, bodyMat);
    hood.position.set(0, 0.95, -2.42);
    const grille = scaledBox(1.42, 0.48, 0.08, dark);
    grille.name = "truck-grille";
    grille.position.set(0, 0.78, -3.08);
    const bumper = scaledBox(2.02, 0.2, 0.14, chrome);
    bumper.position.set(0, 0.46, -3.16);
    const cab = scaledBox(1.98, 1.05, 1.55, bodyMat);
    cab.position.set(0, 1.18, -1.2);
    group.add(chassis, hood, grille, bumper, cab);
    const shield = materials.lambert(0x9fd0ea, { flat: true, opacity: 0.9 });
    for (const x of [-0.44, 0.44]) {
      const wind = scaledBox(0.78, 0.48, 0.06, shield);
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
    return group;
  }

  function createBus(rand) {
    const paint = pick([0xf0c431, 0x2f6adf, 0xd23b3b, 0x1f8a4c], rand);
    const group = new THREE.Group();
    const bodyMat = materials.standard(paint, { flat: true, roughness: 0.5, metalness: 0.08 });
    const body = scaledBox(2.35, 1.85, 9.5, bodyMat);
    body.position.set(0, 1.48, 0.15);
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
    const siding = materials.lambert(pick(SIDING, rand), { flat: true });
    const trim = materials.lambert(0x3c342c, { flat: true });
    const body = scaledBox(width, height, depth, siding);
    body.position.y = height / 2;
    const foundation = scaledBox(width + 0.12, 0.32, depth + 0.12, materials.lambert(0x6a6358, { flat: true }));
    foundation.position.y = 0.16;
    const roofH = 1.55 + rand() * 0.45;
    const roofMat = materials.lambert(pick(ROOFS, rand), { flat: true, side: THREE.DoubleSide });
    const roof = gable(width + 0.7, roofH, depth + 0.55, roofMat);
    roof.position.y = height;
    const doorX = (rand() - 0.5) * 0.8;
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
    return group;
  }

  function createBench() {
    const group = new THREE.Group();
    const seat = scaledBox(1.6, 0.08, 0.46, wood());
    seat.position.y = BENCH.seatY;
    const back = scaledBox(1.6, 0.42, 0.08, wood());
    back.position.set(0, 0.78, BENCH.backZ);
    group.add(seat, back);
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
    return group;
  }

  function createHydrant() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.55, 6), materials.lambert(0xc0392b, { flat: true }));
    body.position.y = 0.32;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.16, 6), materials.lambert(0xdedede, { flat: true }));
    cap.position.y = 0.66;
    group.add(body, cap);
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
    return group;
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

  function createPothole(rand) {
    const group = new THREE.Group();
    const broken = materials.lambert(0x6e675c, { flat: true });
    const crackMat = materials.lambert(0x1a1c20, { flat: true });
    const voidMat = materials.lambert(0x070809, { flat: true });
    const pitMat = materials.lambert(0x120e0c, { flat: true });
    const dirt = materials.lambert(0x4a301c, { flat: true });
    const chunkMat = materials.lambert(0x4e555c, { flat: true });
    const jagged = (count, min, span) => {
      const radii = [];
      for (let index = 0; index < count; index += 1) radii.push(min + rand() * span);
      return radii;
    };
    // Same rand count as before, so the rest of the chunk stays put.
    // The big shape is the dark mouth. No pale ring, no gear of crack bars.
    const lip = jagged(10, 0.55, 0.7);
    const pit = jagged(9, 0.42, 0.28);
    const floor = jagged(7, 0.18, 0.16);
    const mouth = flatShape(lip, voidMat, 0.012);
    const depth = flatShape(pit, pitMat, 0.02);
    depth.position.x = -0.06;
    depth.position.z = 0.04;
    const soil = flatShape(floor.map((radius) => radius * 1.55), dirt, 0.028);
    soil.position.x = 0.1;
    soil.position.z = -0.06;
    group.add(mouth, depth, soil);
    lip.forEach((radius, index) => {
      if (index % 2 === 0) return;
      const angle = (index / lip.length) * Math.PI * 2 + index * 0.22;
      const length = 0.36 + (index % 3) * 0.18;
      const crack = scaledBox(0.028 + (index % 2) * 0.012, 0.008, length, crackMat);
      const reach = radius * 0.7 + length * 0.38;
      crack.position.set(Math.cos(angle) * reach, 0.016, Math.sin(angle) * reach * 0.74);
      crack.rotation.y = -angle + 0.62;
      group.add(crack);
    });
    const chunks = 6 + Math.floor(rand() * 3);
    for (let index = 0; index < chunks; index += 1) {
      const angle = rand() * Math.PI * 2;
      const reach = 0.22 + rand() * 0.72;
      const slab = scaledBox(0.14 + rand() * 0.2, 0.014, 0.07 + rand() * 0.1, rand() > 0.5 ? chunkMat : broken);
      slab.position.set(Math.cos(angle) * reach, 0.032, Math.sin(angle) * reach * 0.8);
      const tilt = 0.22 + rand() * 0.28;
      slab.rotation.set(rand() > 0.5 ? tilt : -tilt, angle * 1.3, (rand() - 0.5) * 0.35);
      const chip = scaledBox(0.08, 0.01, 0.05, chunkMat);
      chip.position.set(Math.cos(angle + 0.8) * reach * 0.45, 0.024, Math.sin(angle + 1.1) * reach * 0.4);
      chip.rotation.y = angle + 0.9;
      group.add(slab, chip);
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
    const hide = materials.lambert(0xf4f1ea, { flat: true });
    const dark = materials.lambert(0x241c18, { flat: true });
    const hoofMat = materials.lambert(0x1a1614, { flat: true });
    const pink = materials.lambert(0xf0b0b8, { flat: true });
    const nose = materials.lambert(0xe7a090, { flat: true });
    // Oval barrel. Local −z is the face. Chunky sphere reads rounder than the old prism.
    const barrel = new THREE.Mesh(chunky, hide);
    barrel.scale.set(0.38, 0.3, 0.62);
    barrel.position.set(0, 0.74, 0.06);
    const chest = new THREE.Mesh(foliage, hide);
    chest.scale.set(0.32, 0.24, 0.28);
    chest.position.set(0, 0.78, -0.36);
    const hump = new THREE.Mesh(foliage, hide);
    hump.scale.set(0.24, 0.14, 0.26);
    hump.position.set(0, 1.02, -0.16);
    const hip = new THREE.Mesh(foliage, hide);
    hip.scale.set(0.3, 0.18, 0.26);
    hip.position.set(0, 0.8, 0.46);
    const belly = new THREE.Mesh(foliage, hide);
    belly.scale.set(0.34, 0.14, 0.4);
    belly.position.set(0, 0.5, 0.08);
    group.add(barrel, chest, hump, hip, belly);
    // Six rand() calls, same as the old spots, so the herd after this cow stays put.
    for (let index = 0; index < 3; index += 1) {
      const spot = new THREE.Mesh(foliage, dark);
      const jitter = (rand() - 0.5) * 0.1;
      const along = (rand() - 0.4) * 0.7;
      const side = index === 0 ? 1 : -1;
      spot.scale.set(0.05, 0.1 + index * 0.02, 0.14 + (index === 2 ? 0.06 : 0));
      spot.position.set(side * 0.32 + jitter * side, 0.82 + (index === 2 ? 0.08 : 0), along);
      group.add(spot);
    }
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 0.38, 6), hide);
    neck.position.set(0, 0.96, -0.62);
    neck.rotation.x = -1.05;
    const dewlap = scaledBox(0.08, 0.11, 0.06, pink);
    dewlap.position.set(0, 0.84, -0.74);
    dewlap.rotation.x = -0.45;
    const head = new THREE.Mesh(chunky, hide);
    head.scale.set(0.18, 0.16, 0.2);
    head.position.set(0, 1.08, -0.92);
    const snout = scaledBox(0.16, 0.09, 0.16, nose);
    snout.position.set(0, 0.98, -1.08);
    const nostrilL = scaledBox(0.035, 0.028, 0.02, dark);
    nostrilL.position.set(-0.04, 0.96, -1.17);
    const nostrilR = scaledBox(0.035, 0.028, 0.02, dark);
    nostrilR.position.set(0.04, 0.96, -1.17);
    group.add(neck, dewlap, head, snout, nostrilL, nostrilR);
    for (const x of [-1, 1]) {
      const ear = scaledBox(0.13, 0.045, 0.08, pink);
      ear.position.set(x * 0.16, 1.04, -0.88);
      ear.rotation.z = x * 1.05;
      ear.rotation.x = 0.2;
      const horn = new THREE.Mesh(cone, dark);
      horn.scale.set(0.035, 0.2, 0.035);
      horn.position.set(x * 0.1, 1.26, -0.84);
      horn.rotation.z = -x * 0.85;
      const eye = scaledBox(0.045, 0.05, 0.025, dark);
      eye.position.set(x * 0.13, 1.12, -1.02);
      const shine = scaledBox(0.016, 0.016, 0.012, hide);
      shine.position.set(x * 0.14, 1.135, -1.035);
      group.add(ear, horn, eye, shine);
    }
    const udder = new THREE.Mesh(foliage, pink);
    udder.scale.set(0.12, 0.1, 0.14);
    udder.position.set(0, 0.36, 0.32);
    group.add(udder);
    for (const x of [-0.045, 0.045]) {
      const teat = scaledBox(0.025, 0.08, 0.025, pink);
      teat.position.set(x, 0.22, 0.34);
      group.add(teat);
    }
    const tail = scaledBox(0.035, 0.36, 0.035, dark);
    tail.position.set(0, 0.62, 0.74);
    tail.rotation.x = 2.2;
    const tuft = new THREE.Mesh(foliage, dark);
    tuft.scale.set(0.08, 0.08, 0.08);
    tuft.position.set(0, 0.48, 0.96);
    group.add(tail, tuft);
    // Thigh pivots, knee bends back. Hoof sits near the ground.
    const addLeg = (x, z, front) => {
      const hipPivot = new THREE.Group();
      hipPivot.position.set(x, 0.5, z);
      hipPivot.rotation.x = front ? 0.42 : -0.38;
      const thigh = scaledBox(0.1, 0.26, 0.11, hide);
      thigh.position.y = -0.13;
      const knee = new THREE.Group();
      knee.position.y = -0.26;
      knee.rotation.x = front ? -0.9 : 0.72;
      const shin = scaledBox(0.055, 0.2, 0.06, hide);
      shin.position.y = -0.1;
      const hoof = scaledBox(0.08, 0.055, 0.1, hoofMat);
      hoof.position.set(0, -0.22, 0);
      knee.add(shin, hoof);
      hipPivot.add(thigh, knee);
      group.add(hipPivot);
    };
    addLeg(-0.2, -0.32, true);
    addLeg(0.2, -0.32, true);
    addLeg(-0.22, 0.4, false);
    addLeg(0.22, 0.4, false);
    return group;
  }

  function createSheep() {
    const group = new THREE.Group();
    const woolMat = materials.lambert(0xf7f4ee, { flat: true });
    const black = materials.lambert(0x1a1a1a, { flat: true });
    const woolShade = materials.lambert(0xe4ddd2, { flat: true });
    const pale = materials.lambert(0xf4f1ea, { flat: true });
    // A long fleece, not a ball. The face sits in front of it on a short neck.
    const puffs = [
      [0, 0.5, 0.12, 0.32, 0.26, 0.36, woolMat],
      [0, 0.48, 0.4, 0.22, 0.2, 0.18, woolShade],
      [0, 0.7, 0.12, 0.26, 0.12, 0.28, woolShade],
      [-0.2, 0.5, 0.12, 0.14, 0.16, 0.22, woolMat],
      [0.2, 0.48, 0.16, 0.14, 0.15, 0.2, woolShade],
      [0, 0.5, -0.1, 0.16, 0.14, 0.12, woolMat],
    ];
    for (const [x, y, z, sx, sy, sz, material] of puffs) {
      const puff = new THREE.Mesh(foliage, material);
      puff.scale.set(sx, sy, sz);
      puff.position.set(x, y, z);
      group.add(puff);
    }
    const neck = scaledBox(0.1, 0.14, 0.24, black);
    neck.position.set(0, 0.48, -0.26);
    const head = new THREE.Mesh(chunky, black);
    head.scale.set(0.13, 0.12, 0.14);
    head.position.set(0, 0.52, -0.46);
    const muzzle = scaledBox(0.1, 0.065, 0.09, black);
    muzzle.position.set(0, 0.46, -0.56);
    group.add(neck, head, muzzle);
    for (const x of [-1, 1]) {
      const ear = scaledBox(0.045, 0.16, 0.035, black);
      ear.position.set(x * 0.14, 0.38, -0.44);
      ear.rotation.z = x * 0.25;
      const eye = scaledBox(0.032, 0.036, 0.02, pale);
      eye.position.set(x * 0.06, 0.55, -0.54);
      const pupil = scaledBox(0.016, 0.02, 0.012, black);
      pupil.position.set(x * 0.065, 0.548, -0.552);
      group.add(ear, eye, pupil);
    }
    const tail = new THREE.Mesh(foliage, woolShade);
    tail.scale.set(0.07, 0.07, 0.06);
    tail.position.set(0, 0.52, 0.56);
    group.add(tail);
    for (const [x, z] of [[-0.14, -0.02], [0.14, -0.02], [-0.15, 0.28], [0.15, 0.28]]) {
      const leg = scaledBox(0.055, 0.26, 0.055, black);
      leg.position.set(x, 0.15, z);
      const hoof = scaledBox(0.065, 0.04, 0.07, black);
      hoof.position.set(x, 0.03, z);
      group.add(leg, hoof);
    }
    return group;
  }

  function createAnimal(rand, kind) {
    return kind === "sheep" ? createSheep() : createCow(rand);
  }

  function createDog(rand) {
    const group = new THREE.Group();
    const fur = materials.lambert(pick([0xc4a574, 0x3a2a22, 0xf2efe8, 0x2a2a2a, 0x8a5a32], rand), { flat: true });
    const body = new THREE.Mesh(foliage, fur);
    body.scale.set(0.14, 0.11, 0.22);
    body.position.y = 0.2;
    const head = new THREE.Mesh(foliage, fur);
    head.scale.set(0.09, 0.09, 0.1);
    head.position.set(0, 0.3, -0.18);
    const snout = new THREE.Mesh(foliage, fur);
    snout.scale.set(0.05, 0.045, 0.07);
    snout.position.set(0, 0.26, -0.26);
    const tail = scaledBox(0.03, 0.12, 0.03, fur);
    tail.position.set(0, 0.3, 0.16);
    tail.rotation.x = -0.8;
    group.add(body, head, snout, tail);
    for (const [x, z] of [[-0.06, -0.08], [0.06, -0.08], [-0.06, 0.08], [0.06, 0.08]]) {
      const leg = scaledBox(0.035, 0.12, 0.035, fur);
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
    createHydrant,
    createCone: createConeProp,
    createCrate,
    createSign,
    createBusStop,
    createCafe,
    createPothole,
    createSlick,
    createAnimal,
    createDog,
  };
}
