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
    return;
  }
  if (pose === "sit") {
    limbs.legL.rotation.x = 1.25;
    limbs.legR.rotation.x = 1.25;
    limbs.armL.rotation.set(0, -0.2, 0.15);
    limbs.armR.rotation.set(0, 0.2, -0.15);
    limbs.head.rotation.x = 0;
    return;
  }
  if (pose === "talk") {
    limbs.legL.rotation.x = 0;
    limbs.legR.rotation.x = 0;
    limbs.armL.rotation.set(-0.2, 0, 0.15);
    limbs.armR.rotation.set(-0.45 + Math.sin(time * 3.1 + phase) * 0.35, 0, -0.2);
    limbs.head.rotation.x = 0;
    return;
  }
  if (pose === "phone") {
    limbs.legL.rotation.x = 0;
    limbs.legR.rotation.x = 0;
    limbs.armL.rotation.set(-0.15, 0, 0.1);
    limbs.armR.rotation.set(-1.15, 0, -0.25);
    limbs.head.rotation.x = 0.4;
    return;
  }
  if (pose === "ride") {
    // Standing. Hands reach toward -z, the face, and rest on the rim.
    limbs.legL.rotation.x = 0.06;
    limbs.legR.rotation.x = 0.06;
    limbs.armL.rotation.set(0.72, 0, 0.18);
    limbs.armR.rotation.set(0.72, 0, -0.18);
    limbs.head.rotation.x = 0.06;
    return;
  }
  if (pose === "tumble") {
    limbs.legL.rotation.x = 0.35;
    limbs.legR.rotation.x = -0.2;
    limbs.armL.rotation.set(-0.9, 0, 0.45);
    limbs.armR.rotation.set(-0.55, 0, -0.7);
    limbs.head.rotation.x = -0.15;
    return;
  }
  if (pose === "fallen") {
    limbs.legL.rotation.x = 0.15;
    limbs.legR.rotation.x = -0.2;
    limbs.armL.rotation.set(0.35, 0, 0.7);
    limbs.armR.rotation.set(-0.15, 0, -0.9);
    limbs.head.rotation.x = 0.35;
    return;
  }
  const swing = Math.sin(time * 7.4 + phase);
  limbs.legL.rotation.x = swing * 0.7;
  limbs.legR.rotation.x = -swing * 0.7;
  limbs.armL.rotation.set(-swing * 0.45, 0, 0.08);
  limbs.armR.rotation.set(swing * 0.45, 0, -0.08);
  limbs.head.rotation.x = 0;
  if (group.userData.dog) group.userData.dog.position.y = Math.abs(swing) * 0.05;
}

export function createProps(THREE, materials) {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const foliage = new THREE.IcosahedronGeometry(1, 0);
  const trunk = new THREE.CylinderGeometry(0.11, 0.16, 1, 5);
  const wheel = new THREE.CylinderGeometry(0.32, 0.32, 0.24, 8);
  const sphere = new THREE.SphereGeometry(1, 8, 6);
  const cone = new THREE.ConeGeometry(1, 1, 7);
  const shadowGeo = new THREE.CircleGeometry(1, 12);
  for (const geometry of [box, foliage, trunk, wheel, sphere, cone, shadowGeo]) {
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
    const group = new THREE.Group();
    const torso = scaledBox(0.38, 0.48, 0.22, shirt);
    torso.position.y = 1.16;
    group.add(torso);

    const headPivot = new THREE.Group();
    headPivot.position.y = 1.48;
    const head = new THREE.Mesh(sphere, skin);
    head.scale.set(0.135, 0.15, 0.14);
    headPivot.add(head);
    const hairCap = new THREE.Mesh(sphere, hairMat);
    hairCap.scale.set(0.145, 0.09, 0.15);
    hairCap.position.y = 0.07;
    headPivot.add(hairCap);
    const eyeMat = materials.lambert(0x1a1a1a, { flat: true });
    for (const x of [-0.045, 0.045]) {
      const eye = new THREE.Mesh(sphere, eyeMat);
      eye.scale.set(0.026, 0.03, 0.02);
      eye.position.set(x, 0.02, -0.12);
      headPivot.add(eye);
    }
    group.add(headPivot);

    function limb(x, y, material, length, shoe) {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const mesh = scaledBox(0.11, length, 0.11, material);
      mesh.position.y = -length / 2;
      pivot.add(mesh);
      if (shoe) {
        const foot = scaledBox(0.12, 0.07, 0.22, shoes);
        foot.position.set(0, -length + 0.02, -0.04);
        pivot.add(foot);
      }
      return pivot;
    }

    const legL = limb(-0.1, 0.9, pants, 0.8, true);
    const legR = limb(0.1, 0.9, pants, 0.8, true);
    const armL = limb(-0.26, 1.28, shirt, 0.46, false);
    const armR = limb(0.26, 1.28, shirt, 0.46, false);
    for (const arm of [armL, armR]) {
      const hand = new THREE.Mesh(sphere, skin);
      hand.scale.set(0.045, 0.045, 0.045);
      hand.position.y = -0.48;
      arm.add(hand);
    }
    group.add(legL, legR, armL, armR);
    group.userData.limbs = { legL, legR, armL, armR, head: headPivot };
    group.userData.pose = pose;
    group.userData.phase = rand() * Math.PI * 2;
    return group;
  }

  function createTree(rand) {
    const group = new THREE.Group();
    const height = 1.3 + rand() * 1.5;
    const trunkMesh = new THREE.Mesh(trunk, materials.lambert(0x6b4a32, { flat: true }));
    trunkMesh.scale.set(1, height, 1);
    trunkMesh.position.y = height / 2;
    group.add(trunkMesh);
    const leaf = materials.lambert(rand() > 0.5 ? 0x3e9a45 : 0x2f7a34, { flat: true });
    const scale = 0.55 + rand() * 0.28;
    const blob = new THREE.Mesh(foliage, leaf);
    blob.scale.set(scale * 1.15, scale * 0.8, scale);
    blob.position.y = height + scale * 0.35;
    blob.rotation.y = rand() * Math.PI;
    group.add(blob);
    if (rand() > 0.4) {
      const extra = new THREE.Mesh(foliage, leaf);
      extra.scale.set(scale * 0.7, scale * 0.55, scale * 0.7);
      extra.position.set((rand() - 0.5) * 0.4, height + scale * 0.85, (rand() - 0.5) * 0.3);
      group.add(extra);
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
      pivot.add(mesh);
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
    const body = scaledBox(1.75, 0.58, 4.2, materials.standard(paint, { flat: true, roughness: 0.42, metalness: 0.18 }));
    body.position.y = 0.64;
    const cabin = scaledBox(1.55, 0.5, 1.85, glass());
    cabin.position.set(0, 1.12, 0.28);
    group.add(body, cabin);
    if (style === "stripe" || cop) {
      const stripe = scaledBox(cop ? 0.18 : 0.32, 0.05, 4.25, materials.lambert(0xf7f7f7, { flat: true }));
      stripe.position.y = 0.95;
      group.add(stripe);
    }
    if (style === "taxi") {
      const sign = scaledBox(0.46, 0.14, 0.7, materials.lambert(0x1b1b1b, { flat: true }));
      sign.position.set(0, 1.45, 0.25);
      group.add(sign);
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
      group.add(wind);
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
    const body = scaledBox(2.35, 1.85, 9.5, materials.standard(paint, { flat: true, roughness: 0.5, metalness: 0.08 }));
    body.position.set(0, 1.48, 0.15);
    const door = scaledBox(0.08, 1.4, 1.05, materials.lambert(0xdfe6ee, { flat: true }));
    door.position.set(-1.2, 1.15, -3.35);
    const sign = scaledBox(1.4, 0.28, 0.08, materials.lambert(0x1b1b1b, { flat: true }));
    sign.position.set(0, 2.58, -4.86);
    group.add(body, door, sign);
    const pane = materials.lambert(0xb7d7e8, { flat: true, opacity: 0.88 });
    for (const x of [-1.22, 1.22]) {
      for (const z of [-1.55, 0.15, 1.75, 3.35]) {
        const win = scaledBox(0.08, 0.62, 1.28, pane);
        win.position.set(x, 2.05, z);
        group.add(win);
      }
    }
    // Body front sits at z=-4.6. The glass has to stand proud of that face
    // or the red panel reads as a blank rear.
    const frameMat = materials.lambert(0x1a1e22, { flat: true });
    const bezel = scaledBox(2.16, 0.96, 0.08, frameMat);
    bezel.position.set(0, 1.96, -4.78);
    group.add(bezel);
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
    const body = scaledBox(width, height, depth, materials.lambert(pick(SIDING, rand), { flat: true }));
    body.position.y = height / 2;
    const roof = gable(width + 0.5, 1.45 + rand() * 0.4, depth + 0.4, materials.lambert(pick(ROOFS, rand), { flat: true, side: THREE.DoubleSide }));
    roof.position.y = height;
    const door = scaledBox(0.9, 1.7, 0.1, materials.lambert(0x4a3428, { flat: true }));
    door.position.set((rand() - 0.5) * 0.4, 0.85, -depth / 2 - 0.04);
    group.add(body, roof, door);
    for (const x of [-width * 0.28, width * 0.28]) {
      const windowMesh = scaledBox(0.7, 0.85, 0.08, glass());
      windowMesh.position.set(x, height * 0.62, -depth / 2 - 0.04);
      group.add(windowMesh);
    }
    if (rand() > 0.45) {
      const chimney = scaledBox(0.42, 1.05, 0.42, materials.lambert(0x6d4038, { flat: true }));
      chimney.position.set(width * 0.22, height + 1.15, depth * 0.12);
      group.add(chimney);
    }
    group.userData.depth = depth;
    group.userData.width = width;
    return group;
  }

  function createTower(rand, litChance) {
    const group = new THREE.Group();
    const width = 8 + rand() * 6;
    const depth = 8 + rand() * 4;
    const height = 7 + rand() * 18;
    const body = scaledBox(width, height, depth, materials.facade(pick(FACADES, rand), litChance, Math.floor(rand() * 20)));
    body.position.y = height / 2;
    const cap = scaledBox(width + 0.4, 0.55, depth + 0.4, materials.lambert(0x667078, { flat: true }));
    cap.position.y = height + 0.25;
    group.add(body, cap);
    group.userData.depth = depth;
    group.userData.width = width;
    return group;
  }

  function createShop(rand, litChance) {
    const group = createTower(rand, litChance);
    const width = group.userData.width;
    const depth = group.userData.depth;
    const awningMesh = scaledBox(width * 0.86, 0.1, 1.5, materials.awning(pick([0xd23b3b, 0x2f6adf, 0xf0c431, 0x2f9d6a], rand)));
    awningMesh.position.set(0, 2.7, -depth / 2 - 0.55);
    awningMesh.rotation.x = AWNING_PITCH;
    group.add(awningMesh);
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
    const asphalt = materials.lambert(0x5c656e, { flat: true });
    const broken = materials.lambert(0x6e675c, { flat: true });
    const pit = materials.lambert(0x07080a, { flat: true });
    const dirt = materials.lambert(0x3a2918, { flat: true });
    const jagged = (count, min, span) => {
      const radii = [];
      for (let index = 0; index < count; index += 1) radii.push(min + rand() * span);
      return radii;
    };
    // A dark mouth on the asphalt. Chunks lie in it. Nothing stands up as a mound.
    group.add(flatShape(jagged(10, 0.95, 0.4), asphalt, 0.016));
    group.add(flatShape(jagged(9, 0.58, 0.26), pit, 0.024));
    group.add(flatShape(jagged(7, 0.14, 0.12), dirt, 0.032));
    const chunks = 6 + Math.floor(rand() * 3);
    for (let index = 0; index < chunks; index += 1) {
      const angle = rand() * Math.PI * 2;
      const reach = 0.16 + rand() * 0.36;
      const slab = scaledBox(0.2 + rand() * 0.18, 0.03, 0.1 + rand() * 0.08, rand() > 0.5 ? broken : asphalt);
      slab.position.set(Math.cos(angle) * reach, 0.03, Math.sin(angle) * reach * 0.8);
      const tilt = 0.16 + rand() * 0.32;
      slab.rotation.set(rand() > 0.5 ? tilt : -tilt, angle, (rand() - 0.5) * 0.3);
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
    const hide = materials.lambert(0xf4f1ea, { flat: true });
    const dark = materials.lambert(0x2a2420, { flat: true });
    const hoofMat = materials.lambert(0x1a1614, { flat: true });
    const pink = materials.lambert(0xf0b0b8, { flat: true });
    // Cylinder +Y becomes +Z (the rear) after rotateX(π/2). Local -z is the face.
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.32, 1.62, 8), hide);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.82, 0.12);
    group.add(barrel);
    const shoulder = new THREE.Mesh(sphere, hide);
    shoulder.scale.set(0.28, 0.16, 0.22);
    shoulder.position.set(0, 1.08, -0.42);
    group.add(shoulder);
    for (let index = 0; index < 3; index += 1) {
      const spot = new THREE.Mesh(sphere, dark);
      spot.scale.set(0.16, 0.08, 0.18);
      spot.position.set((rand() - 0.5) * 0.4, 1.05, (rand() - 0.35) * 0.55);
      group.add(spot);
    }
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.46, 6), hide);
    neck.position.set(0, 1.08, -0.72);
    neck.rotation.x = -0.85;
    const head = new THREE.Mesh(sphere, hide);
    head.scale.set(0.22, 0.2, 0.28);
    head.position.set(0, 1.12, -0.98);
    const snout = new THREE.Mesh(sphere, materials.lambert(0xf3c2ae, { flat: true }));
    snout.scale.set(0.13, 0.09, 0.16);
    snout.position.set(0, 0.98, -1.16);
    group.add(neck, head, snout);
    for (const x of [-1, 1]) {
      const ear = scaledBox(0.16, 0.05, 0.1, pink);
      ear.position.set(x * 0.22, 1.18, -0.9);
      ear.rotation.z = x * 0.55;
      const horn = new THREE.Mesh(cone, dark);
      horn.scale.set(0.045, 0.18, 0.045);
      horn.position.set(x * 0.12, 1.32, -0.9);
      horn.rotation.z = -x * 0.4;
      group.add(ear, horn);
    }
    const udder = new THREE.Mesh(sphere, pink);
    udder.scale.set(0.14, 0.12, 0.16);
    udder.position.set(0, 0.4, 0.46);
    group.add(udder);
    for (const x of [-0.05, 0.05]) {
      const teat = scaledBox(0.025, 0.08, 0.025, pink);
      teat.position.set(x, 0.26, 0.46);
      group.add(teat);
    }
    const tail = scaledBox(0.04, 0.38, 0.04, dark);
    tail.position.set(0, 0.86, 0.92);
    tail.rotation.x = 0.85;
    const tuft = new THREE.Mesh(sphere, dark);
    tuft.scale.set(0.08, 0.08, 0.08);
    tuft.position.set(0, 0.62, 1.08);
    group.add(tail, tuft);
    for (const [x, z] of [[-0.22, -0.42], [0.22, -0.42], [-0.24, 0.52], [0.24, 0.52]]) {
      const leg = scaledBox(0.1, 0.5, 0.1, hide);
      leg.position.set(x, 0.3, z);
      const hoof = scaledBox(0.12, 0.07, 0.14, hoofMat);
      hoof.position.set(x, 0.04, z - 0.02);
      group.add(leg, hoof);
    }
    return group;
  }

  function createSheep() {
    const group = new THREE.Group();
    const woolMat = materials.lambert(0xf7f4ee, { flat: true });
    const black = materials.lambert(0x1a1a1a, { flat: true });
    const wool = new THREE.Mesh(foliage, woolMat);
    wool.scale.set(0.4, 0.34, 0.48);
    wool.position.set(0, 0.5, 0.02);
    const head = new THREE.Mesh(sphere, black);
    head.scale.set(0.11, 0.11, 0.14);
    head.position.set(0, 0.52, -0.46);
    group.add(wool, head);
    for (const x of [-1, 1]) {
      const ear = scaledBox(0.1, 0.035, 0.06, black);
      ear.position.set(x * 0.14, 0.56, -0.38);
      ear.rotation.z = x * 0.6;
      group.add(ear);
    }
    for (const [x, z] of [[-0.14, -0.12], [0.14, -0.12], [-0.14, 0.18], [0.14, 0.18]]) {
      const leg = scaledBox(0.06, 0.24, 0.06, black);
      leg.position.set(x, 0.12, z);
      group.add(leg);
    }
    return group;
  }

  function createAnimal(rand, kind) {
    return kind === "sheep" ? createSheep() : createCow(rand);
  }

  function createDog(rand) {
    const group = new THREE.Group();
    const fur = materials.lambert(pick([0xc4a574, 0x3a2a22, 0xf2efe8, 0x2a2a2a, 0x8a5a32], rand), { flat: true });
    const body = new THREE.Mesh(sphere, fur);
    body.scale.set(0.14, 0.11, 0.22);
    body.position.y = 0.2;
    const head = new THREE.Mesh(sphere, fur);
    head.scale.set(0.09, 0.09, 0.1);
    head.position.set(0, 0.3, -0.18);
    const snout = new THREE.Mesh(sphere, fur);
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
    const hand = new THREE.Vector3(-0.16, 0.5, 0.62);
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
