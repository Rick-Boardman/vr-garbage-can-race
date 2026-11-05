import { applyFrame } from "./frame.js";
import { animatePerson } from "./props.js";

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
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(0.4, 14),
    materials.standard(0x7d868c, { roughness: 0.6, metalness: 0.4 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.02;
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
  person.position.y = 0.34;
  person.scale.setScalar(0.9);
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
    can.rotation.y = spin;
    person.visible = showPerson;
  }

  function animate(time) {
    animatePerson(person, time);
  }

  return { root, place, animate };
}
