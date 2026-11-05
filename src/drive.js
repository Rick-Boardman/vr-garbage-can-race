// The can rolls along the course. Offset is meters along sample.right
// (positive is right). Steering left decreases offset.

import { CAN_RADIUS, SHOULDER_REACH } from "./constants.js";

const GRAVITY = 9.81;

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
    onShoulder: false,
    best: 0,
    hitCooldown: {},
    nearIds: {},
  };
}

function horizontalForward(sample) {
  const length = Math.hypot(sample.forward.x, sample.forward.z) || 1;
  return {
    x: sample.forward.x / length,
    z: sample.forward.z / length,
  };
}

function overlap(canX, canZ, hazard) {
  const dx = canX - hazard.x;
  const dz = canZ - hazard.z;
  if (hazard.halfL == null) {
    const dist = Math.hypot(dx, dz);
    const min = CAN_RADIUS + hazard.radius;
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
      return { px: sign * hazard.fx, pz: sign * hazard.fz, pen: overL + CAN_RADIUS };
    }
    const sign = localW >= 0 ? 1 : -1;
    return { px: sign * hazard.rx, pz: sign * hazard.rz, pen: overW + CAN_RADIUS };
  }
  const clampedL = clamp(localL, -hazard.halfL, hazard.halfL);
  const clampedW = clamp(localW, -hazard.halfW, hazard.halfW);
  const closestX = hazard.x + hazard.fx * clampedL + hazard.rx * clampedW;
  const closestZ = hazard.z + hazard.fz * clampedL + hazard.rz * clampedW;
  const ox = canX - closestX;
  const oz = canZ - closestZ;
  const dist = Math.hypot(ox, oz);
  if (dist >= CAN_RADIUS) return null;
  const scale = dist > 1e-5 ? 1 / dist : 1;
  return {
    px: (dist > 1e-5 ? ox : hazard.rx) * scale,
    pz: (dist > 1e-5 ? oz : hazard.rz) * scale,
    pen: CAN_RADIUS - dist,
  };
}

export function stepRide(state, { dt, steer, throttle, sample, hazards }) {
  const step = clamp(Number(dt) || 0, 0, 0.05);
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

  let s = state.s + speed * step;
  const forward = horizontalForward(sample);
  const canX = sample.x + sample.right.x * offset;
  const canZ = sample.z + sample.right.z * offset;

  state.invuln = Math.max(0, state.invuln - step);
  state.shake *= Math.exp(-3.2 * step);
  for (const id of Object.keys(state.hitCooldown)) {
    state.hitCooldown[id] -= step;
    if (state.hitCooldown[id] <= 0) delete state.hitCooldown[id];
  }

  if (hazards) {
    for (const hazard of hazards) {
      const hit = overlap(canX, canZ, hazard);
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
        state.hitCooldown[hazard.id] = 1.15;
        continue;
      }
      const push = hit.pen + 0.08;
      s += (hit.px * forward.x + hit.pz * forward.z) * push;
      offset += (hit.px * sample.right.x + hit.pz * sample.right.z) * push;
      latVel = Math.sign(hit.px * sample.right.x + hit.pz * sample.right.z || 1) * Math.max(3.4, Math.abs(latVel));
      const slow = hazard.kind === "car" ? 0.58 : hazard.kind === "person" ? 0.78 : 0.84;
      speed *= slow;
      state.crashes += 1;
      state.shake = 1;
      state.invuln = 0.45;
      state.hitCooldown[hazard.id] = 0.7;
    }
  }

  state.s = Math.max(0, s);
  state.offset = offset;
  state.speed = speed;
  state.latVel = latVel;
  state.spin += speed * 0.22 * step;
  state.bump = Math.max(0, state.bump - step * 1.5);
  state.onShoulder = Math.abs(offset) > soft;
  state.best = Math.max(state.best, state.s);
  return state;
}
