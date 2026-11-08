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
const _yawEuler = new THREE.Euler(0, 0, 0, "YXZ");
const _quat = new THREE.Quaternion();
const _seat = new THREE.Vector3();
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);
const _qPitch = new THREE.Quaternion();
const _qYaw = new THREE.Quaternion();
const _qCancel = new THREE.Quaternion();
const _headQ = new THREE.Quaternion();
const _poseV = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _actual = new THREE.Vector3();

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

// On foot the rider stands in the body. A local-floor pose already includes
// eye height, so the rig sits on the ground and the pose is not subtracted.
// A local pose (seat near 0) needs the standing eye added here.
export function vrFootAnchor(origin, right, forward, seatEye) {
  const eye = Number(seatEye) || 0;
  const y = Math.abs(eye) > 0.2 ? origin.y : origin.y + VIEWS[2].pivot;
  return vrViewAnchor({ x: origin.x, y, z: origin.z }, right, forward, [0, 0, 0], 0, 0);
}

// Yaw of the headset pose in the reference space. Identity looks down -z.
// Check: quaternion from Euler YXZ yaw π/2 → π/2.
export function referenceYaw(x, y, z, w) {
  _quat.set(Number(x) || 0, Number(y) || 0, Number(z) || 0, Number.isFinite(Number(w)) ? Number(w) : 1);
  _yawEuler.setFromQuaternion(_quat, "YXZ");
  return _yawEuler.y;
}

// The pose is parented onto the rig, so its yaw would add to the road heading.
// A rider turned around in the room then looks back up the hill and cannot
// drive the way they are facing. rigYaw takes that yaw back off. The head
// quaternion is Ry(poseYaw) * Rx(pitch) * Ry(-poseYaw), which keeps the
// downward view pitch when poseYaw is π. The anchor shifts so the eye stays
// on the chase spot instead of orbiting when that yaw changes.
export function vrPresentRig(anchor, heading, poseYaw, viewPitch, posePosition) {
  const pitch = Number(viewPitch) || 0;
  const yaw = Number(poseYaw) || 0;
  const face = Number(heading) || 0;
  _qPitch.setFromAxisAngle(_axisX, pitch);
  _qYaw.setFromAxisAngle(_axisY, yaw);
  _qCancel.setFromAxisAngle(_axisY, -yaw);
  _headQ.copy(_qYaw).multiply(_qPitch).multiply(_qCancel);

  _poseV.set(Number(posePosition?.x) || 0, Number(posePosition?.y) || 0, Number(posePosition?.z) || 0);
  _desired.copy(_poseV).applyQuaternion(_qPitch);
  _qYaw.setFromAxisAngle(_axisY, face);
  _desired.applyQuaternion(_qYaw);
  _actual.copy(_poseV).applyQuaternion(_qCancel).applyQuaternion(_qPitch).applyQuaternion(_qYaw);
  return {
    rigYaw: face - yaw,
    headX: _headQ.x,
    headY: _headQ.y,
    headZ: _headQ.z,
    headW: _headQ.w,
    x: anchor.x + _desired.x - _actual.x,
    y: anchor.y + _desired.y - _actual.y,
    z: anchor.z + _desired.z - _actual.z,
  };
}
