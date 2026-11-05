const SIDING = [0xc5c8b8, 0xd9d3c5, 0xb7c4d4, 0xe4e0d8, 0x8d939c, 0xd8c3a5];
const ROOFS = [0x8e3d38, 0x4e5560, 0x6a503c, 0x3e4c55, 0x9a4a3a];
const FACADES = [0xc4623a, 0xd8d0c4, 0xb7c3ce, 0x8e5a4a, 0x4d6d8a, 0xc9a27a, 0x6e7c86, 0xa33b32];
const SHIRTS = [0xe25b2a, 0x3d7edb, 0xf2d15c, 0x2f9d6a, 0xd4527a, 0x6b4c9a, 0xefefef, 0x222831];
const PANTS = [0x2c3a55, 0x3e342c, 0x243028, 0x4a4038];
const SKINS = [0xf0c2a0, 0xd9a47a, 0xc6865a, 0x8d5a3c, 0xf3d3b8];
const HAIR = [0x2a211c, 0x5a3a28, 0xc4a15a, 0x1a1a1a, 0x6a6a6a, 0x8b3a2a];

function pick(list, rand) {
  return list[Math.floor(rand() * list.length)];
}

export function animatePerson(group, time) {
  const limbs = group.userData.limbs;
  if (!limbs) return;
  const pose = group.userData.pose || "walk";
  const phase = group.userData.phase || 0;
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
    limbs.legL.rotation.x = 1.2;
    limbs.legR.rotation.x = 1.2;
    limbs.armL.rotation.set(-0.55, 0, 1.05);
    limbs.armR.rotation.set(-0.55, 0, -1.05);
    limbs.head.rotation.x = 0.08;
    return;
  }
  const swing = Math.sin(time * 7.4 + phase);
  limbs.legL.rotation.x = swing * 0.7;
  limbs.legR.rotation.x = -swing * 0.7;
  limbs.armL.rotation.set(-swing * 0.45, 0, 0.08);
  limbs.armR.rotation.set(swing * 0.45, 0, -0.08);
  limbs.head.rotation.x = 0;
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

  function createCar(rand, style) {
    const paint = style === "taxi" ? 0xf0c431 : pick([0x2f6adf, 0xd23b3b, 0xf4f4f4, 0x2aabb0, 0xf08a2a, 0x3a3a3a, 0x6a4ad4], rand);
    const group = new THREE.Group();
    const body = scaledBox(1.75, 0.58, 4.2, materials.standard(paint, { flat: true, roughness: 0.42, metalness: 0.18 }));
    body.position.y = 0.64;
    const cabin = scaledBox(1.55, 0.5, 1.85, glass());
    cabin.position.set(0, 1.12, 0.28);
    group.add(body, cabin);
    if (style === "stripe") {
      const stripe = scaledBox(0.32, 0.05, 4.25, materials.lambert(0xf7f7f7, { flat: true }));
      stripe.position.y = 0.95;
      group.add(stripe);
    }
    if (style === "taxi") {
      const sign = scaledBox(0.46, 0.14, 0.7, materials.lambert(0x1b1b1b, { flat: true }));
      sign.position.set(0, 1.45, 0.25);
      group.add(sign);
    }
    for (const x of [-0.55, 0.55]) {
      const head = scaledBox(0.28, 0.14, 0.08, materials.headlight);
      head.position.set(x, 0.62, -2.1);
      const tail = scaledBox(0.3, 0.12, 0.08, materials.taillight);
      tail.position.set(x, 0.62, 2.1);
      group.add(head, tail);
    }
    const wheels = [];
    const tire = materials.lambert(0x1b1b1b, { flat: true });
    for (const [x, z] of [[-0.8, -1.28], [0.8, -1.28], [-0.8, 1.28], [0.8, 1.28]]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.32, z);
      const mesh = new THREE.Mesh(wheel, tire);
      mesh.rotation.z = Math.PI / 2;
      pivot.add(mesh);
      group.add(pivot);
      wheels.push(pivot);
    }
    const blob = new THREE.Mesh(shadowGeo, materials.shadow);
    blob.rotation.x = -Math.PI / 2;
    blob.scale.set(1.35, 2.3, 1);
    blob.position.y = 0.045;
    group.add(blob);
    group.userData.wheels = wheels;
    group.userData.roll = 0;
    return group;
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
    awningMesh.rotation.x = 0.18;
    group.add(awningMesh);
    return group;
  }

  function createBench() {
    const group = new THREE.Group();
    const seat = scaledBox(1.6, 0.08, 0.46, wood());
    seat.position.y = 0.46;
    const back = scaledBox(1.6, 0.42, 0.08, wood());
    back.position.set(0, 0.78, 0.18);
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
    const mesh = new THREE.Mesh(cone, materials.lambert(0xf39c12, { flat: true }));
    mesh.scale.set(0.28, 0.55, 0.28);
    mesh.position.y = 0.28;
    return mesh;
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
    pole.position.y = 1.15;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.46), materials.sign(text));
    board.position.y = 2.25;
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
  };
}
