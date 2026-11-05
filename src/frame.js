// Mount an object so its local -z matches frame.forward and its local +y matches frame.up.
// makeBasis columns are local +x, +y, +z. Local +z is therefore -forward.

import * as THREE from "three";

const xAxis = new THREE.Vector3();
const yAxis = new THREE.Vector3();
const zAxis = new THREE.Vector3();
const basis = new THREE.Matrix4();

export function applyFrame(object, frame, bank = 0) {
  xAxis.set(frame.right.x, frame.right.y, frame.right.z);
  yAxis.set(frame.up.x, frame.up.y, frame.up.z);
  zAxis.set(-frame.forward.x, -frame.forward.y, -frame.forward.z);
  basis.makeBasis(xAxis, yAxis, zAxis);
  object.quaternion.setFromRotationMatrix(basis);
  if (bank !== 0) object.rotateZ(bank);
}
