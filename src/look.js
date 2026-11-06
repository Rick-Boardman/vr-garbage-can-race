// While the mouse is up, the rig looks along the character's heading.
// A drag keeps the orbit the pointer already built.

export function releasedLook({ dragging, heading, yaw, pitch, roll }) {
  if (dragging) return { yaw, pitch, roll, released: false };
  return { yaw: heading, pitch: 0, roll: 0, released: true };
}

// The chase rig stays upright so the camera does not drop through the road.
// The lens takes the tumble: positive pitch looks up, which is the rider's
// back-down face (local -z rotated toward +y). Settled walking uses viewPitch.
export function tumbleLook({ bodySpin = 0, bodyRoll = 0, settled = false, viewPitch = 0 } = {}) {
  if (settled) return { pitch: viewPitch, roll: 0 };
  return { pitch: bodySpin || 0, roll: bodyRoll || 0 };
}
