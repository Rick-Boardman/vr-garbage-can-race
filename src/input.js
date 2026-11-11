// Ride input is steer (-1 left .. +1 right) and throttle (-1 brake .. +1 tuck).
// Desktop keys are Halo's set: A/D steer, W/Shift tuck, S brake.
// X toggles Halo's autowalk. That latch is forward. With it off, and with
// no move key down, throttle stays 0 so a stop stays a stop.
// VR: the lower hand steers that way. Both hands below the head speed up;
// both raised lean back and slow down.
// Phone tilt: Halo's orientation adapter reports roll and pitch in screen axes.
//
// Halo (`@rb/halo/input`) owns reading the devices: held keys, XR sticks and
// buttons, controller heights and phone orientation with its permission. This
// file is the ride's mapping of those readings: which key steers, the scales,
// deadzones and the precedence between devices.

import { anyKeyDown, buttonDown, handsAxes, keyAxis, mapAxis } from "@rb/halo/input";

export { stickFromSources } from "@rb/halo/input";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function deadzone(value, threshold) {
  return Math.abs(value) < threshold ? 0 : value;
}

// On foot, Q turns left and E turns right. A and D are strafe, not added here,
// or they would also steer the can while riding. Space jumps.
export function onFootSteer(steer, keys) {
  return clamp((steer || 0) + keyAxis(keys, { negative: ["Q"], positive: ["E"] }), -1, 1);
}

export function onFootJump(keys) {
  return anyKeyDown(keys, [" ", "Space"]);
}

export function inputFromKeys({ keys, autoWalk = false, lookSteer = null }) {
  let steer = keyAxis(keys, { negative: ["A"], positive: ["D"] });
  let throttle = 0;
  if (anyKeyDown(keys, ["W", "Shift"]) || autoWalk) throttle += 1;
  if (anyKeyDown(keys, ["S"])) throttle -= 1;
  if (lookSteer) {
    if (steer === 0) steer = lookSteer.steer;
    if (throttle === 0) throttle = lookSteer.throttle;
  }
  return {
    steer: clamp(steer, -1, 1),
    throttle: clamp(throttle, -1, 1),
  };
}

// Positive pitch is look-up in Halo (a mouse drag up increases pitch).
// Positive yaw offset is look-left (yaw 0 faces -z, positive yaw turns toward -x).
export function inputFromLook(yawOffset, pitch) {
  return {
    steer: deadzone(clamp(-yawOffset / 0.5, -1, 1), 0.06),
    throttle: deadzone(clamp(-pitch / 0.38, -1, 1), 0.06),
  };
}

export function inputFromHands({ leftY, rightY, headY }) {
  const hands = handsAxes({ leftY, rightY, headY });
  if (!hands) return null;
  // Left controller lower than the right → negative steer.
  const steer = mapAxis(hands.split, { scale: 1 / 0.22, deadzone: 0.08 });
  const throttle = mapAxis(hands.drop, { offset: -0.32, scale: 1 / 0.28, deadzone: 0.06 });
  return { steer, throttle };
}

// On foot in the headset. WebXR stick forward is negative Y.
// Check: x 0, y -1 → throttle 1, strafe 0. x 1, y 0 → throttle 0, strafe 1.
// The right stick is turn, not strafe. x 1 → steer 1, which grows face
// toward sample.right. x -1 turns left.
export function inputFromVrTurn(x) {
  const sx = Number.isFinite(x) ? x : 0;
  if (Math.abs(sx) < 0.18) return 0;
  return clamp(sx, -1, 1);
}

export function inputFromVrStick(x, y) {
  const sx = Number.isFinite(x) ? x : 0;
  const sy = Number.isFinite(y) ? y : 0;
  const ax = Math.abs(sx) < 0.18 ? 0 : sx;
  const ay = Math.abs(sy) < 0.18 ? 0 : sy;
  return {
    steer: 0,
    throttle: ay === 0 ? 0 : clamp(-ay, -1, 1),
    strafe: ax === 0 ? 0 : clamp(ax, -1, 1),
    source: "vr-walk",
  };
}

// A or X (button 4). The trigger is the HUD pointer, so button 0 does not jump.
export function vrJumpDown(sources) {
  return buttonDown(sources, 4);
}

// Head direction on the ground, as the face walkerForward already uses.
// Check: head (0,-1), forward (0,-1), right (1,0) → 0. Head (1,0) → π/2.
// A climb shortens forward.xz, so the face is atan2(across * span, along).
// That is the value walkerForward turns back into this same look.
// A look shorter than 0.2 (straight down) returns null so the old face stays.
export function faceFromHead(headX, headZ, forward, right) {
  const len = Math.hypot(headX, headZ);
  if (!(len >= 0.2)) return null;
  const nx = headX / len;
  const nz = headZ / len;
  const span = Math.hypot(forward?.x, forward?.z) || 1;
  const rspan = Math.hypot(right?.x, right?.z) || 1;
  const along = nx * (forward.x / span) + nz * (forward.z / span);
  const across = nx * (right.x / rspan) + nz * (right.z / rspan);
  return Math.atan2(across * span, along);
}

export const TILT_LOG = "[gcr:tilt]";

export const NO_READINGS = "No motion readings came from this phone.\nTilt cannot steer. Drag to steer.";

// The ride's wording for Halo's orientation adapter. Each is one or two lines
// (split on a newline) for the STATUS window.
export const TILT_MESSAGES = Object.freeze({
  insecure: "Phone tilt needs https.\nOpen the game over https to steer by tilting.",
  unsupported: "This browser has no motion sensor.\nDrag to steer.",
  error: (name) => `Motion permission failed (${name}).\nTap the screen again to allow tilt.`,
  denied: "Motion was refused, so tilt cannot steer.\nAllow motion for this site in the browser settings, then reload.",
  noReadings: NO_READINGS,
});

// Halo's orientation axes, already relative to the neutral hold: roll is the
// right edge of the screen down, pitch is the top tipped away. Level is level
// for roll; pitch is relative to how the phone was held when the hill started.
export function inputFromTilt(axes) {
  const roll = axes?.roll;
  const pitch = axes?.pitch;
  if (![roll, pitch].every(Number.isFinite)) return null;
  return {
    steer: mapAxis(roll, { scale: 1 / 24, deadzone: 0.07 }),
    throttle: mapAxis(pitch, { scale: 1 / 22, deadzone: 0.07 }),
  };
}

// On foot, a held touch drag is a walk stick. Yaw already turned the body,
// so this does not also steer. Touch drag up lowers pitch (Halo's touch
// sign is the opposite of the mouse). That negative pitch is forward.
// Check: ejected, dragging, touch, pitch -0.38 → throttle 1, steer 0.
// A mouse drag returns null so desktop look does not walk backward.
export function footDragStick({ ejected, dragging, touch, pitch }) {
  if (!ejected || !dragging || !touch) return null;
  return {
    steer: 0,
    throttle: inputFromLook(0, pitch || 0).throttle,
    strafe: 0,
  };
}

// A stick strafe has to survive the keyboard strafe write. Keys only apply
// when the rider is on foot and not walking with the headset stick.
export function footStrafe(source, ejected, keyStrafe, stickStrafe) {
  if (source === "vr-walk") return stickStrafe || 0;
  return ejected ? (keyStrafe || 0) : 0;
}

export function selectRideInput({ presenting, ejected = false, hands, tilt, keys, preferTilt = false, vrStick = null, vrTurn = 0 }) {
  if (presenting && ejected && vrStick) {
    return { ...vrStick, source: "vr-walk", steer: inputFromVrTurn(vrTurn) };
  }
  if (presenting && hands) return { ...hands, source: "vr" };
  const keyActive = !!keys && (keys.steer !== 0 || keys.throttle !== 0 || (keys.strafe || 0) !== 0);
  // A phone wants tilt even while a key is down. On a desktop, held keys win
  // so a stray orientation event cannot cancel A/D.
  if (tilt && (preferTilt || !keyActive)) return { ...tilt, source: "tilt" };
  return { ...(keys || { steer: 0, throttle: 0 }), source: "keys" };
}
