// Ride input is steer (-1 left .. +1 right) and throttle (-1 brake .. +1 tuck).
// Desktop keys are Halo's set: A/D steer, W/Shift/X tuck, S brake.
// VR: the lower hand steers that way. Both hands below the head speed up;
// both raised lean back and slow down.
// Phone tilt: gamma/beta, remapped when the screen is landscape.

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function deadzone(value, threshold) {
  return Math.abs(value) < threshold ? 0 : value;
}

export function inputFromKeys({ keys, autoWalk = false, lookSteer = null }) {
  const down = keys instanceof Set ? (code) => keys.has(code) : (code) => !!keys?.[code];
  let steer = 0;
  if (down("A")) steer -= 1;
  if (down("D")) steer += 1;
  let throttle = 0;
  if (down("W") || down("Shift") || autoWalk) throttle += 1;
  if (down("S")) throttle -= 1;
  if (lookSteer) {
    if (steer === 0) steer = lookSteer.steer;
    if (throttle === 0) throttle = lookSteer.throttle;
  }
  return {
    steer: clamp(steer, -1, 1),
    throttle: clamp(throttle, -1, 1),
  };
}

// Positive pitch is look-up in Halo (drag up increases pitch).
// Positive yaw offset is look-left (yaw 0 faces -z, positive yaw turns toward -x).
export function inputFromLook(yawOffset, pitch) {
  return {
    steer: deadzone(clamp(-yawOffset / 0.5, -1, 1), 0.06),
    throttle: deadzone(clamp(-pitch / 0.38, -1, 1), 0.06),
  };
}

export function inputFromHands({ leftY, rightY, headY }) {
  if (![leftY, rightY, headY].every(Number.isFinite)) return null;
  // Left controller lower than the right → negative steer.
  const steer = deadzone(clamp((leftY - rightY) / 0.22, -1, 1), 0.08);
  const drop = headY - (leftY + rightY) * 0.5;
  const throttle = deadzone(clamp((drop - 0.32) / 0.28, -1, 1), 0.06);
  return { steer, throttle };
}

export function tiltAxes({ beta, gamma, screenAngle = 0 }) {
  const angle = ((Number(screenAngle) % 360) + 360) % 360;
  let steerDeg = gamma;
  let leanDeg = beta;
  if (angle === 90) {
    steerDeg = beta;
    leanDeg = -gamma;
  } else if (angle === 270) {
    steerDeg = -beta;
    leanDeg = gamma;
  }
  return { steerDeg, leanDeg };
}

export function inputFromTilt({ steerDeg, leanDeg, neutralSteer = 0, neutralLean = 0 }) {
  if (![steerDeg, leanDeg].every(Number.isFinite)) return null;
  return {
    steer: deadzone(clamp((steerDeg - neutralSteer) / 24, -1, 1), 0.07),
    throttle: deadzone(clamp((leanDeg - neutralLean) / 22, -1, 1), 0.07),
  };
}

export function selectRideInput({ presenting, hands, tilt, keys, preferTilt = false }) {
  if (presenting && hands) return { ...hands, source: "vr" };
  const keyActive = !!keys && (keys.steer !== 0 || keys.throttle !== 0);
  // A phone wants tilt even while a key is down. On a desktop, held keys win
  // so a stray orientation event cannot cancel A/D.
  if (tilt && (preferTilt || !keyActive)) return { ...tilt, source: "tilt" };
  return { ...(keys || { steer: 0, throttle: 0 }), source: "keys" };
}
