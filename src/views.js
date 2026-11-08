import * as THREE from "three";

// Selection order. The first view is outside the can. First person is third.
// Local camera offsets use the rig frame: +x right, +y up, +z behind.
export const VIEWS = [
  { id: "close", name: "just behind", pivot: 0.72, cam: [0.85, 1.45, 3.35], pitch: -0.32, showPerson: true },
  { id: "far", name: "way back", pivot: 0.9, cam: [0, 4.8, 9.1], pitch: -0.42, showPerson: true },
  { id: "first", name: "first person", pivot: 1.62, cam: [0, 0, 0.12], pitch: -0.22, showPerson: false },
];

export function viewIndexFor(param) {
  if (param === "far") return 1;
  if (param === "first") return 2;
  return 0;
}

const _euler = new THREE.Euler(0, 0, 0, "XYZ");
const _quat = new THREE.Quaternion();
const _seat = new THREE.Vector3();

// The rig stays upright. View pitch sits on the head, and the headset adds
// `seatEye` along that pitched head, not along world up. Subtract it so the
// eyes land on the same spot as the desktop camera.
export function vrViewAnchor(origin, right, forward, cam, pitch, seatEye) {
  const seat = Number.isFinite(seatEye) ? seatEye : 0;
  _euler.set(Number(pitch) || 0, 0, 0);
  _quat.setFromEuler(_euler);
  _seat.set(0, seat, 0).applyQuaternion(_quat);
  const lx = cam[0] - _seat.x;
  const ly = cam[1] - _seat.y;
  const lz = cam[2] - _seat.z;
  const span = Math.hypot(forward.x, forward.z) || 1;
  const hfx = forward.x / span;
  const hfz = forward.z / span;
  return {
    x: origin.x + right.x * lx - hfx * lz,
    y: origin.y + ly,
    z: origin.z + right.z * lx - hfz * lz,
  };
}
