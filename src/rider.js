import { applyFrame } from "./frame.js";
import { animatePerson } from "./props.js";

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

export function createRider(THREE, materials, props) {
  const root = new THREE.Group();
  root.name = "rider";
  const can = new THREE.Group();
  const bodyGeo = new THREE.CylinderGeometry(0.46, 0.4, 0.96, 14, 1, true);
  const position = bodyGeo.attributes.position;
  const vertex = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    const radial = Math.hypot(vertex.x, vertex.z);
    if (radial < 1e-4) continue;
    const angle = Math.atan2(vertex.x, vertex.z);
    const ridge = 1 + 0.04 * Math.cos(angle * 8);
    vertex.x *= ridge;
    vertex.z *= ridge;
    position.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }
  bodyGeo.computeVertexNormals();
  const metal = materials.standard(0x9aa3a8, { flat: true, roughness: 0.38, metalness: 0.72 });
  metal.side = THREE.DoubleSide;
  const shell = new THREE.Mesh(bodyGeo, metal);
  shell.position.y = 0.48;
  // Closed puck, not a one-sided disc. The cap faces out, so the bottom
  // reads from below when the can tips, and from inside when it is upright.
  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.44, 0.47, 0.06, 14),
    materials.standard(0x6a7378, { roughness: 0.5, metalness: 0.55 }),
  );
  floor.name = "can-floor";
  floor.position.y = 0.03;
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.45, 0.035, 6, 16),
    materials.standard(0x5e676c, { roughness: 0.4, metalness: 0.6 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.96;
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.49, 0.49, 0.12, 14, 1, true),
    materials.lambert(0x2f7d4a, { flat: true, side: THREE.DoubleSide }),
  );
  band.position.y = 0.62;
  can.add(shell, floor, rim, band);
  for (const side of [-1, 1]) {
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.1, 0.02, 5, 8),
      materials.standard(0x6a7378, { metalness: 0.5, roughness: 0.45 }),
    );
    handle.position.set(side * 0.48, 0.78, 0);
    handle.rotation.y = Math.PI / 2;
    can.add(handle);
  }

  const person = props.createPerson(() => 0.2, "ride");
  // Feet of the unscaled person sit near local y = 0.1. Scale keeps the
  // legs inside the shell and the chest above the rim.
  const personScale = 0.82;
  person.scale.setScalar(personScale);
  person.position.y = 0.06 - 0.1 * personScale;
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 14),
    materials.shadow,
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.04;

  root.add(can, person, shadow);

  function place(sample, offset, spin, bank, hop, showPerson) {
    root.position.set(
      sample.x + sample.right.x * offset,
      sample.y + hop,
      sample.z + sample.right.z * offset,
    );
    applyFrame(root, sample, bank);
    const tilt = hop > 0.05 ? Math.min(0.7, hop * 0.85) : 0;
    can.position.set(0, canGroundClearance(tilt), 0);
    can.rotation.set(0, spin, 0);
    if (tilt) can.rotateX(tilt);
    person.position.set(0, 0.06 - 0.1 * personScale, 0);
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
    liftAlong(can, canSample, canGroundClearance(tilt));
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
    person.userData.pose = tumbling ? "tumble" : "walk";
    person.visible = showPerson;
    shadow.position.set(person.position.x, bodySample.y + 0.04, person.position.z);
  }

  function animate(time) {
    animatePerson(person, time);
  }

  return { root, place, placeApart, animate, person };
}
