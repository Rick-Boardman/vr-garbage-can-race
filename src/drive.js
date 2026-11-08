// The can rolls along the course. Offset is meters along sample.right
// (positive is right). Steering left decreases offset.
// On foot, face 0 looks downhill. Face increases toward sample.right.
// Q/E (steer) turn the face. A/D (strafe) step sideways and do not turn.
// D (strafe > 0) walks toward face + π/2.
// Check: forward (0,0,-1), right (1,0,0), face 0, strafe +1 increases offset.
// face π/2, strafe +1 moves toward +z, which is -forward, so s decreases.
// W walks along walkerForward.

import { stayOnRoute, wrapAngle } from "./course.js";
import { CAN_RADIUS, FOOT_RADIUS, SHOULDER_REACH } from "./constants.js";

const GRAVITY = 9.81;
export const HARD_CRASH_SPEED = 9.5;
const WALK_SPEED = 3.4;
const STRAFE_SPEED = 3.1;
const TURN_RATE = 3.4;
const SHAKE_PEAK = 0.2;

// A resting barrel sits on its bottom (0), its top (π), or either side (±π/2).
// Anything in between is a corner, and the ground clearance then holds it in the air.
export function restCanTilt(tilt) {
  const angle = wrapAngle(Number(tilt) || 0);
  const options = [0, Math.PI / 2, -Math.PI / 2, Math.PI];
  let best = 0;
  let bestDist = Infinity;
  for (const option of options) {
    const dist = Math.abs(wrapAngle(angle - option));
    if (dist < bestDist) {
      bestDist = dist;
      best = option;
    }
  }
  return best;
}

// forward (0,0,-1), right (1,0,0): face 0 → (0,-1), face π → (0,1), face π/2 → (1,0).
export function walkerForward(forward, right, face) {
  const fx = forward.x * Math.cos(face) + right.x * Math.sin(face);
  const fz = forward.z * Math.cos(face) + right.z * Math.sin(face);
  const length = Math.hypot(fx, fz) || 1;
  return { x: fx / length, z: fz / length };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createRideState(s = 0) {
  return {
    s,
    offset: 0,
    speed: 7.2,
    latVel: 0,
    spin: 0,
    crashes: 0,
    nearMisses: 0,
    bumps: 0,
    invuln: 0,
    bump: 0,
    shake: 0,
    hop: 0,
    hopVy: 0,
    rollKick: 0,
    onShoulder: false,
    best: 0,
    hitCooldown: {},
    nearIds: {},
    eject: null,
    events: [],
  };
}

// Benches, trees, and other scenery shove a body out. They are not crashes.
// Cars use the same push with the on-foot radius, so a rider cannot walk through one.
function shoveKind(sample, s, offset, hazards, kind, radius) {
  if (!sample || !hazards) return { s, offset };
  let nextS = s;
  let nextOffset = offset;
  const forward = horizontalForward(sample);
  for (let pass = 0; pass < 2; pass += 1) {
    const ds = nextS - sample.s;
    let x = sample.x + sample.right.x * nextOffset + sample.forward.x * ds;
    let z = sample.z + sample.right.z * nextOffset + sample.forward.z * ds;
    for (const hazard of hazards) {
      if (!hazard || hazard.kind !== kind) continue;
      const hit = overlap(x, z, hazard, radius);
      if (!hit) continue;
      const along = hit.px * forward.x + hit.pz * forward.z;
      const lateral = hit.px * sample.right.x + hit.pz * sample.right.z;
      const push = hit.pen + 0.04;
      nextS += along * push;
      nextOffset += lateral * push;
      x += hit.px * push;
      z += hit.pz * push;
    }
  }
  return { s: nextS, offset: nextOffset };
}

function shoveSolids(sample, s, offset, hazards) {
  return shoveKind(sample, s, offset, hazards, "solid", CAN_RADIUS);
}

function shoveFoot(sample, s, offset, hazards) {
  return shoveKind(sample, s, offset, hazards, "car", FOOT_RADIUS);
}

function horizontalForward(sample) {
  const length = Math.hypot(sample.forward.x, sample.forward.z) || 1;
  return {
    x: sample.forward.x / length,
    z: sample.forward.z / length,
  };
}

function overlap(canX, canZ, hazard, radius = CAN_RADIUS) {
  const dx = canX - hazard.x;
  const dz = canZ - hazard.z;
  if (hazard.halfL == null) {
    const dist = Math.hypot(dx, dz);
    const min = radius + hazard.radius;
    if (dist >= min) return null;
    const scale = dist > 1e-5 ? 1 / dist : 1;
    return {
      px: (dist > 1e-5 ? dx : 1) * scale,
      pz: (dist > 1e-5 ? dz : 0) * scale,
      pen: min - dist,
    };
  }
  const localL = dx * hazard.fx + dz * hazard.fz;
  const localW = dx * hazard.rx + dz * hazard.rz;
  const overL = hazard.halfL - Math.abs(localL);
  const overW = hazard.halfW - Math.abs(localW);
  if (overL >= 0 && overW >= 0) {
    if (overL < overW) {
      const sign = localL >= 0 ? 1 : -1;
      return { px: sign * hazard.fx, pz: sign * hazard.fz, pen: overL + radius };
    }
    const sign = localW >= 0 ? 1 : -1;
    return { px: sign * hazard.rx, pz: sign * hazard.rz, pen: overW + radius };
  }
  const clampedL = clamp(localL, -hazard.halfL, hazard.halfL);
  const clampedW = clamp(localW, -hazard.halfW, hazard.halfW);
  const closestX = hazard.x + hazard.fx * clampedL + hazard.rx * clampedW;
  const closestZ = hazard.z + hazard.fz * clampedL + hazard.rz * clampedW;
  const ox = canX - closestX;
  const oz = canZ - closestZ;
  const dist = Math.hypot(ox, oz);
  if (dist >= radius) return null;
  const scale = dist > 1e-5 ? 1 / dist : 1;
  return {
    px: (dist > 1e-5 ? ox : hazard.rx) * scale,
    pz: (dist > 1e-5 ? oz : hazard.rz) * scale,
    pen: radius - dist,
  };
}

// Space while riding. The can keeps rolling. The rider hops out to one side
// and this is not a crash.
function beginBail(state, side) {
  const speed = state.speed || 0;
  const offset = state.offset || 0;
  const hopSide = side || 1;
  state.eject = {
    canS: state.s,
    canOffset: offset,
    canSpeed: speed * 0.92,
    canLat: (state.latVel || 0) * 0.45,
    canHop: 0.04,
    canVy: 1.1,
    canSpin: state.spin,
    canTilt: 0,
    bodyS: state.s,
    bodyOffset: offset + hopSide * 1.25,
    bodyAlong: Math.max(speed * 0.15, 0.3),
    bodyLat: hopSide * 1.15,
    bodyHop: 0.1,
    bodyVy: 5.8,
    bodySpin: 0,
    bodyRoll: 0,
    face: 0,
    bail: true,
  };
  state.speed = 0;
  state.latVel = 0;
  state.hopVy = 0;
  state.events.push({ type: "bail" });
}

function beginEject(state, { s, offset, speed, latVel, side }) {
  state.eject = {
    canS: s,
    canOffset: offset,
    canSpeed: Math.max(speed * 0.65, 4.5),
    canLat: side * 4.2,
    canHop: 0.45,
    canVy: 7.2,
    canSpin: state.spin,
    canTilt: side * 0.35,
    bodyS: s,
    bodyOffset: offset + side * 0.45,
    bodyAlong: Math.max(speed * 0.55, 3.6),
    bodyLat: side * 3.4,
    bodyHop: 0.25,
    bodyVy: 6.6,
    bodySpin: side * 0.25,
    bodyRoll: side * 0.15,
    face: side * 0.35,
  };
  state.speed = 0;
  state.latVel = 0;
  state.hopVy = 0;
  state.shake = Math.min(SHAKE_PEAK, Math.max(state.shake, SHAKE_PEAK));
  state.crashes += 1;
  state.events.push({ type: "eject" });
}

function footStrikes(state, sample, offset, hazards, along, impact) {
  if (!hazards || !sample) return;
  const x = sample.x + sample.right.x * offset;
  const z = sample.z + sample.right.z * offset;
  for (const hazard of hazards) {
    if (hazard.kind !== "person" && hazard.kind !== "animal") continue;
    if (!hazard.id || state.hitCooldown[hazard.id]) continue;
    const hit = overlap(x, z, hazard);
    if (!hit) continue;
    const lateral = hit.px * sample.right.x + hit.pz * sample.right.z;
    const side = Math.sign(lateral || offset || 1) || 1;
    state.events.push({
      type: "fell",
      id: hazard.id,
      who: hazard.kind,
      along: along || 1,
      side,
      force: clamp((impact || 0) / 12, 0.22, 0.55),
    });
    state.hitCooldown[hazard.id] = 0.7;
  }
}

function stepEject(state, step, steer, throttle, jump, sample, hazards, canSample, strafe) {
  const eject = state.eject;
  const hard = sample.halfWidth + SHOULDER_REACH;
  for (const id of Object.keys(state.hitCooldown)) {
    state.hitCooldown[id] -= step;
    if (state.hitCooldown[id] <= 0) delete state.hitCooldown[id];
  }
  eject.canVy -= GRAVITY * step;
  eject.canHop += eject.canVy * step;
  if (eject.canHop <= 0) {
    eject.canHop = 0;
    eject.canVy = Math.abs(eject.canVy) > 0.9 ? -eject.canVy * 0.55 : 0;
  }
  // The throw carries the can while it is in the air. On the road, friction
  // stops it. A hill used to keep a settled can sliding, and on a steep grade
  // that slide never ended.
  const coast = canSample || sample;
  const canGrounded = eject.canHop < 0.04 && Math.abs(eject.canVy) < 0.35;
  if (canGrounded) {
    eject.canSpeed = Math.max(0, eject.canSpeed || 0) * Math.exp(-2.6 * step);
    eject.canLat *= Math.exp(-4 * step);
    if (coast && Math.abs(eject.canOffset) > (coast.halfWidth || 0) - 0.35) {
      eject.canSpeed *= Math.exp(-1.6 * step);
    }
    if (eject.canSpeed < 0.2) eject.canSpeed = 0;
    if (Math.abs(eject.canLat) < 0.2) eject.canLat = 0;
    const heldCan = stayOnRoute(coast, eject.canOffset, eject.canLat, 0);
    eject.canOffset = heldCan.offset;
    eject.canLat = heldCan.latVel;
  } else {
    eject.canSpeed = Math.max(0, eject.canSpeed || 0) * Math.exp(-0.2 * step);
    eject.canLat *= Math.exp(-0.35 * step);
  }
  eject.canS += eject.canSpeed * step;
  eject.canOffset = clamp(eject.canOffset + eject.canLat * step, -hard, hard);
  // On the road, sit on the bottom, the top, or a side. A corner pose plus
  // ground clearance holds the can in the air.
  if (canGrounded) {
    eject.canTilt = restCanTilt(eject.canTilt || 0);
    if (Math.abs(eject.canSpeed) < 0.45 && Math.abs(eject.canLat) < 0.45) {
      eject.canSpin *= Math.exp(-4 * step);
    }
  } else {
    eject.canSpin += (eject.canSpeed * 0.85 + eject.canLat * 0.4) * step;
    eject.canTilt = (eject.canTilt || 0) + (eject.canSpeed * 1.15 + eject.canLat * 0.4) * step;
  }
  eject.popCool = Math.max(0, (eject.popCool || 0) - step);

  eject.bodyVy = (eject.bodyVy || 0) - GRAVITY * step;
  eject.bodyHop = (eject.bodyHop || 0) + eject.bodyVy * step;
  if (eject.bodyHop <= 0) {
    eject.bodyHop = 0;
    eject.bodyVy = Math.abs(eject.bodyVy) > 0.9 ? -eject.bodyVy * 0.55 : 0;
  }
  eject.bodyAlong = (eject.bodyAlong || 0) * Math.exp(-0.85 * step);
  eject.bodyLat = (eject.bodyLat || 0) * Math.exp(-0.7 * step);
  eject.bodyS += eject.bodyAlong * step;
  eject.bodyOffset = clamp(eject.bodyOffset + eject.bodyLat * step, -hard, hard);
  // Tumble with the throw. Stand up once the bounces are done, so a later jump stays upright.
  const flight = Math.hypot(eject.bodyAlong || 0, eject.bodyLat || 0);
  const grounded = eject.bodyHop < 0.05 && Math.abs(eject.bodyVy) < 0.45;
  if (eject.bail) {
    eject.bodySpin = 0;
    eject.bodyRoll = 0;
  } else if (!grounded || flight > 1.4) {
    eject.bodySpin = (eject.bodySpin || 0) + (eject.bodyAlong * 0.62 + (eject.bodyLat || 0) * 0.28) * step;
    eject.bodyRoll = (eject.bodyRoll || 0) + (eject.bodyLat || 0) * 1.05 * step;
  } else {
    eject.bodySpin = 0;
    eject.bodyRoll = 0;
  }
  // Upright, on the ground, and not asking to move: plant the feet.
  // The leftover slide from a hop was still above the walk threshold, so the
  // legs kept stepping after every key was up and autowalk was off.
  const stepping = Math.abs(throttle) > 0.08 || Math.abs(strafe || 0) > 0.08;
  if (!stepping && grounded && eject.bodySpin === 0 && eject.bodyRoll === 0) {
    eject.bodyAlong = 0;
    eject.bodyLat = 0;
  }
  if (jump && grounded && eject.bodySpin === 0 && eject.bodyRoll === 0) {
    eject.bodyVy = 6.4;
    eject.bodyHop = 0.08;
  }

  eject.face = wrapAngle((eject.face || 0) + steer * TURN_RATE * step);
  const move = walkerForward(sample.forward, sample.right, eject.face);
  const flat = Math.hypot(sample.forward.x, sample.forward.z) || 1;
  const roadForwardX = sample.forward.x / flat;
  const roadForwardZ = sample.forward.z / flat;
  const alongRoad = move.x * roadForwardX + move.z * roadForwardZ;
  const acrossRoad = move.x * sample.right.x + move.z * sample.right.z;
  const walked = throttle * WALK_SPEED * step;
  eject.bodyS += alongRoad * walked;
  eject.bodyOffset = clamp(eject.bodyOffset + acrossRoad * walked, -hard, hard);
  const sideFace = walkerForward(sample.forward, sample.right, (eject.face || 0) + Math.PI / 2);
  const strafeAlong = sideFace.x * roadForwardX + sideFace.z * roadForwardZ;
  const strafeAcross = sideFace.x * sample.right.x + sideFace.z * sample.right.z;
  const sidestep = (strafe || 0) * STRAFE_SPEED * step;
  eject.bodyS += strafeAlong * sidestep;
  eject.bodyOffset = clamp(eject.bodyOffset + strafeAcross * sidestep, -hard, hard);
  if (eject.bodyS < 0) eject.bodyS = 0;
  const bodyClear = shoveSolids(sample, eject.bodyS, eject.bodyOffset, hazards);
  const bodyCars = shoveFoot(sample, bodyClear.s, bodyClear.offset, hazards);
  const bodyAgain = shoveSolids(sample, bodyCars.s, bodyCars.offset, hazards);
  eject.bodyS = bodyAgain.s;
  eject.bodyOffset = bodyAgain.offset;
  const canClear = shoveSolids(canSample || sample, eject.canS, eject.canOffset, hazards);
  eject.canS = canClear.s;
  eject.canOffset = canClear.offset;
  if (hazards && coast) {
    let canX = coast.x + coast.right.x * eject.canOffset + coast.forward.x * (eject.canS - coast.s);
    let canZ = coast.z + coast.right.z * eject.canOffset + coast.forward.z * (eject.canS - coast.s);
    for (const hazard of hazards) {
      if (!hazard?.id) continue;
      if (hazard.kind !== "cone" && hazard.kind !== "pothole" && hazard.kind !== "car") continue;
      const hit = overlap(canX, canZ, hazard);
      if (!hit) continue;
      const lateral = hit.px * coast.right.x + hit.pz * coast.right.z;
      const side = Math.sign(lateral || eject.canOffset || 1) || 1;
      if (hazard.kind === "car") {
        // The overlap test ignores height. A can left inside the bus kept
        // taking hits and never fell. Push it out of the footprint.
        const along = hit.px * coast.forward.x + hit.pz * coast.forward.z;
        const push = hit.pen + 0.2;
        eject.canS += along * push;
        eject.canOffset += lateral * push;
        canX += hit.px * push;
        canZ += hit.pz * push;
      }
      if (state.hitCooldown[hazard.id]) continue;
      if (hazard.kind === "cone") {
        if (eject.canHop > 0.35) continue;
        state.events.push({
          type: "flew",
          id: hazard.id,
          along: Math.sign(eject.canSpeed) || 1,
          side,
          force: clamp(Math.abs(eject.canSpeed) / 10, 0.35, 1),
        });
        eject.canSpeed *= 0.92;
        eject.canLat += side * 1.2;
        state.hitCooldown[hazard.id] = 0.7;
        continue;
      }
      // One upward kick until this bounce lands. Refreshing canVy on every
      // overlap, or from a second hazard while still airborne, climbs forever.
      if (eject.popCool > 0 || eject.canHop > 0.15) {
        state.hitCooldown[hazard.id] = 0.7;
        continue;
      }
      if (hazard.kind === "pothole") {
        eject.canSpeed *= 0.72;
        eject.canVy = Math.max(eject.canVy, 1.4);
      } else {
        eject.canSpeed *= 0.62;
        eject.canLat += side * 1.8;
        eject.canVy = Math.max(eject.canVy, 2.2);
      }
      eject.popCool = 0.55;
      state.hitCooldown[hazard.id] = 0.7;
    }
    eject.canOffset = clamp(eject.canOffset, -hard, hard);
    if (eject.canS < 0) eject.canS = 0;
  }
  const thrown = Math.sign(eject.bodyAlong) || Math.sign(alongRoad) || 1;
  const bodyImpact = Math.hypot(eject.bodyAlong || 0, eject.bodyLat || 0);
  footStrikes(state, sample, eject.bodyOffset, hazards, thrown, bodyImpact);
  if (canSample) {
    footStrikes(
      state,
      canSample,
      eject.canOffset,
      hazards,
      Math.sign(eject.canSpeed) || 1,
      Math.hypot(eject.canSpeed || 0, eject.canLat || 0),
    );
  }

  const dist = Math.hypot(eject.bodyS - eject.canS, eject.bodyOffset - eject.canOffset);
  const resting = eject.canHop < 0.06 && Math.abs(eject.canVy) < 0.4 && Math.abs(eject.canSpeed) < 1.15;
  if (dist < 0.85 && resting) {
    state.s = eject.canS;
    state.offset = eject.canOffset;
    state.speed = 5;
    state.latVel = 0;
    state.spin = eject.canSpin;
    state.eject = null;
    state.events.push({ type: "mount" });
    return;
  }
  state.s = eject.bodyS;
  state.offset = eject.bodyOffset;
  state.speed = 0;
  state.latVel = 0;
}

export function stepRide(state, { dt, steer, throttle, jump = false, strafe = 0, sample, hazards, canSample = null }) {
  const step = clamp(Number(dt) || 0, 0, 0.05);
  if (!state.eject && jump) beginBail(state, Math.sign(steer) || 1);
  if (state.eject) {
    stepEject(state, step, steer, throttle, jump, sample, hazards, canSample, strafe);
    state.shake *= Math.exp(-12 * step);
    state.bump = Math.max(0, state.bump - step * 1.5);
    state.best = Math.max(state.best, state.s);
    return state;
  }
  const tuck = throttle > 0 ? throttle : 0;
  const brake = throttle < 0 ? -throttle : 0;
  const slope = Math.max(0, sample.slope || 0);
  const soft = sample.halfWidth - 0.35;
  const hard = sample.halfWidth + SHOULDER_REACH;
  const onShoulder = Math.abs(state.offset) > soft;

  let speed = state.speed;
  let accel = GRAVITY * Math.sin(slope) * (0.85 + 0.95 * tuck);
  accel -= 0.0062 * speed * speed;
  accel -= brake * (5.5 + speed * 0.7);
  if (onShoulder) accel -= 2.4 + speed * 0.4;
  speed = clamp(speed + accel * step, 0, 24);
  // Gravity would roll a stopped can the moment the brake is released.
  // Stay stopped until a tuck or autowalk (throttle > 0) asks to go.
  if (throttle <= 0 && state.speed <= 0.45 && speed <= 0.45) speed = 0;

  if (!state.onShoulder && onShoulder) {
    speed *= 0.9;
    state.bump = Math.max(state.bump, 0.4);
  }

  let latVel = state.latVel + steer * 14 * step;
  latVel *= Math.exp(-2.5 * step);
  latVel = clamp(latVel, -8, 8);
  let offset = state.offset + latVel * step;
  if (offset > hard) {
    offset = hard;
    latVel = -Math.abs(latVel) * 0.35;
    speed *= 0.92;
  } else if (offset < -hard) {
    offset = -hard;
    latVel = Math.abs(latVel) * 0.35;
    speed *= 0.92;
  }
  const held = stayOnRoute(sample, offset, latVel, steer);
  offset = held.offset;
  latVel = held.latVel;
  if (held.bumped) state.bump = Math.max(state.bump, 0.35);

  let s = state.s + speed * step;
  const forward = horizontalForward(sample);
  let canX = sample.x + sample.right.x * offset;
  let canZ = sample.z + sample.right.z * offset;

  state.invuln = Math.max(0, state.invuln - step);
  state.shake *= Math.exp(-12 * step);
  for (const id of Object.keys(state.hitCooldown)) {
    state.hitCooldown[id] -= step;
    if (state.hitCooldown[id] <= 0) delete state.hitCooldown[id];
  }

  if (hazards) {
    for (const hazard of hazards) {
      const hit = overlap(canX, canZ, hazard);
      if (hazard.kind === "solid") {
        if (!hit) continue;
        const lateral = hit.px * sample.right.x + hit.pz * sample.right.z;
        const along = hit.px * forward.x + hit.pz * forward.z;
        const push = hit.pen + 0.04;
        s += along * push;
        offset += lateral * push;
        canX += hit.px * push;
        canZ += hit.pz * push;
        continue;
      }
      if (!hit) {
        if (hazard.kind === "pothole") continue;
        let close = false;
        if (hazard.halfL == null) {
          close = Math.hypot(canX - hazard.x, canZ - hazard.z) < CAN_RADIUS + (hazard.radius || 0) + 1.05;
        } else {
          const ox = canX - hazard.x;
          const oz = canZ - hazard.z;
          const localL = Math.abs(ox * hazard.fx + oz * hazard.fz);
          const localW = Math.abs(ox * hazard.rx + oz * hazard.rz);
          close = localL < hazard.halfL + CAN_RADIUS + 0.8 && localW < hazard.halfW + CAN_RADIUS + 0.6;
        }
        if (close && !state.nearIds[hazard.id]) {
          state.nearIds[hazard.id] = 1;
          state.nearMisses += 1;
        }
        continue;
      }
      if (state.hitCooldown[hazard.id]) continue;
      if (hazard.kind === "pothole") {
        speed *= 0.72;
        state.bump = 1;
        state.bumps += 1;
        state.hopVy = Math.max(state.hopVy, 2.2);
        state.hitCooldown[hazard.id] = 1.15;
        continue;
      }
      if (hazard.kind === "slick") {
        latVel += (hazard.slip || 1) * 3.3;
        state.hitCooldown[hazard.id] = 0.25;
        continue;
      }
      const lateral = hit.px * sample.right.x + hit.pz * sample.right.z;
      const side = Math.sign(lateral || offset || 1);
      if (hazard.kind === "cone") {
        state.events.push({
          type: "flew",
          id: hazard.id,
          along: Math.sign(speed) || 1,
          side: side || 1,
          force: clamp(speed / 10, 0.35, 1),
        });
      }
      if (hazard.kind === "car" && speed >= HARD_CRASH_SPEED) {
        beginEject(state, {
          s,
          offset,
          speed,
          latVel,
          side,
        });
        state.hitCooldown[hazard.id] = 1.2;
        break;
      }
      const push = hit.pen + 0.4;
      s += (hit.px * forward.x + hit.pz * forward.z) * push;
      offset += lateral * push;
      state.shake = Math.min(SHAKE_PEAK, Math.max(state.shake, SHAKE_PEAK));
      if (hazard.kind === "person" || hazard.kind === "animal") {
        latVel += Math.sign(lateral || 1) * (hazard.kind === "animal" ? 1.8 : 1.05);
        speed = Math.max(speed * (hazard.kind === "animal" ? 0.84 : 0.92), 3.2);
        state.hopVy = Math.max(state.hopVy, 3.4);
        state.rollKick = clamp(state.rollKick + side * 5, -18, 18);
        state.events.push({
          type: "fell",
          id: hazard.id,
          who: hazard.kind,
          along: Math.sign(speed) || 1,
          side,
          force: clamp(speed / 14, 0.3, 1),
        });
      } else {
        latVel = Math.sign(lateral || 1) * Math.max(3.4, Math.abs(latVel));
        const slow = hazard.kind === "car" ? 0.58 : 0.84;
        // Repeated overlaps used to multiply speed down to zero and pin the can inside a car.
        speed = Math.max(speed * slow, 3.2);
        state.hopVy = Math.max(state.hopVy, hazard.kind === "car" ? 6.5 : 3.4);
        state.rollKick = clamp(state.rollKick + side * (hazard.kind === "car" ? 11 : 5), -18, 18);
      }
      state.crashes += 1;
      state.invuln = 0.45;
      state.hitCooldown[hazard.id] = 0.7;
    }
  }
  latVel = clamp(latVel, -8, 8);
  const heldAgain = stayOnRoute(sample, offset, latVel, steer);
  offset = heldAgain.offset;
  latVel = heldAgain.latVel;

  if (state.eject) {
    state.s = state.eject.bodyS;
    state.offset = state.eject.bodyOffset;
    state.speed = 0;
    state.latVel = 0;
    state.bump = Math.max(0, state.bump - step * 1.5);
    state.best = Math.max(state.best, state.s);
    return state;
  }

  state.s = Math.max(0, s);
  state.offset = offset;
  state.speed = speed;
  state.latVel = latVel;
  state.hopVy -= GRAVITY * step;
  state.hop += state.hopVy * step;
  if (state.hop <= 0) {
    state.hop = 0;
    state.hopVy = Math.abs(state.hopVy) > 1.1 ? -state.hopVy * 0.5 : 0;
  }
  state.rollKick *= Math.exp(-1.6 * step);
  state.spin += (speed * 0.22 + state.rollKick) * step;
  state.bump = Math.max(0, state.bump - step * 1.5);
  state.onShoulder = Math.abs(offset) > soft;
  state.best = Math.max(state.best, state.s);
  return state;
}
