// Ride input is steer (-1 left .. +1 right) and throttle (-1 brake .. +1 tuck).
// Desktop keys are Halo's set: A/D steer, W/Shift tuck, S brake.
// X toggles Halo's autowalk. That latch is forward. With it off, and with
// no move key down, throttle stays 0 so a stop stays a stop.
// VR: the lower hand steers that way. Both hands below the head speed up;
// both raised lean back and slow down.
// Phone tilt: gamma/beta, remapped when the screen is landscape.

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function deadzone(value, threshold) {
  return Math.abs(value) < threshold ? 0 : value;
}

// On foot, Q turns left and E turns right. A and D are strafe, not added here,
// or they would also steer the can while riding. Space jumps.
export function onFootSteer(steer, keys) {
  const down = keys instanceof Set ? (code) => keys.has(code) : (code) => !!keys?.[code];
  let next = steer || 0;
  if (down("Q")) next -= 1;
  if (down("E")) next += 1;
  return clamp(next, -1, 1);
}

export function onFootJump(keys) {
  const down = keys instanceof Set ? (code) => keys.has(code) : (code) => !!keys?.[code];
  return down(" ") || down("Space");
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

// Positive pitch is look-up in Halo (a mouse drag up increases pitch).
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

function stickMag(axes, index) {
  return Math.hypot(Number(axes[index]) || 0, Number(axes[index + 1]) || 0);
}

// Quest may put the thumbstick on axes 0,1 or 2,3. The first decisive
// push locks the pair. A locked pair that has gone quiet yields to a
// decisive push on the other pair, so a stale lock cannot hide the stick.
export function vrStickPair(axes, locked = null) {
  if (!axes || axes.length < 2) return null;
  const choices = axes.length >= 4 ? [0, 2] : [0];
  if ((locked === 0 || locked === 2) && choices.includes(locked)) {
    const lockedMag = stickMag(axes, locked);
    let other = null;
    let otherMag = -1;
    for (const index of choices) {
      if (index === locked) continue;
      const mag = stickMag(axes, index);
      if (mag > otherMag) {
        otherMag = mag;
        other = index;
      }
    }
    if (other != null && lockedMag < 0.15 && otherMag >= 0.35) {
      return { index: other, lock: true };
    }
    return { index: locked, lock: false };
  }
  let best = 0;
  let bestMag = -1;
  for (const index of choices) {
    const mag = stickMag(axes, index);
    if (mag > bestMag) {
      bestMag = mag;
      best = index;
    }
  }
  if (axes.length < 4) return { index: 0, lock: false };
  if (bestMag >= 0.35) return { index: best, lock: true };
  if (bestMag >= 0.15) return { index: best, lock: false };
  return { index: 0, lock: false };
}

function handInId(id, handedness) {
  const text = String(id || "").toLowerCase();
  if (!text) return false;
  if (handedness === "left") return /\bleft\b/.test(text);
  if (handedness === "right") return /\bright\b/.test(text);
  return false;
}

function poseHands(sources, poseX) {
  if (!poseX) return null;
  const posed = [];
  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[i];
    if (String(source?.handedness || "")) continue;
    if (!source?.gamepad?.axes || source.gamepad.axes.length < 2) continue;
    const x = Number(poseX[i]);
    if (!Number.isFinite(x)) continue;
    posed.push({ source, x });
  }
  if (posed.length < 2) return null;
  posed.sort((a, b) => a.x - b.x);
  const left = posed[0];
  const right = posed[posed.length - 1];
  if (left.source.gamepad === right.source.gamepad) return null;
  if (!(right.x - left.x >= 0.06)) return null;
  return { left: left.source, right: right.source };
}

function readLockedStick(gamepad, locks) {
  const pair = vrStickPair(gamepad.axes, locks?.get?.(gamepad) ?? null);
  if (!pair) return null;
  if (pair.lock) locks?.set?.(gamepad, pair.index);
  const x = Number(gamepad.axes[pair.index]);
  const y = Number(gamepad.axes[pair.index + 1]);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
}

function loudestStick(gamepads, locks) {
  let best = null;
  let bestMag = -1;
  const seen = new Set();
  for (const gamepad of gamepads) {
    if (!gamepad || seen.has(gamepad)) continue;
    seen.add(gamepad);
    const reading = readLockedStick(gamepad, locks);
    if (!reading) continue;
    const mag = Math.hypot(reading.x, reading.y);
    if (mag > bestMag) {
      bestMag = mag;
      best = reading;
    }
  }
  return best ? { reading: best, mag: bestMag } : null;
}

// Handedness, then the gamepad id, then pose X when the runtime leaves
// the hand blank. Two pads for one hand: the one actually deflected wins,
// so a quiet duplicate cannot hide the stick.
export function stickFromSources(sources, handedness, poseX = null, locks = null) {
  const list = Array.from(sources || []);
  if (handedness !== "left" && handedness !== "right") return null;
  const pads = (pred) => {
    const found = [];
    for (const source of list) {
      if (!pred(source)) continue;
      const gamepad = source?.gamepad;
      if (!gamepad?.axes || gamepad.axes.length < 2) continue;
      found.push(gamepad);
    }
    return found;
  };
  let best = loudestStick(pads((source) => source?.handedness === handedness), locks);
  if (best && best.mag >= 0.15) return best.reading;
  const byId = loudestStick(pads((source) => handInId(source?.gamepad?.id, handedness)), locks);
  if (byId && byId.mag > (best?.mag ?? -1)) best = byId;
  if (best && best.mag >= 0.15) return best.reading;
  const inferred = poseHands(list, poseX);
  if (inferred?.[handedness]?.gamepad) {
    const fromPose = loudestStick([inferred[handedness].gamepad], locks);
    if (fromPose && fromPose.mag > (best?.mag ?? -1)) best = fromPose;
  }
  return best ? best.reading : null;
}

// A or X. The trigger is the HUD pointer, so button 0 does not jump.
export function vrJumpDown(sources) {
  if (!sources) return false;
  for (const source of sources) {
    const button = source?.gamepad?.buttons?.[4];
    if (button?.pressed) return true;
  }
  return false;
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
