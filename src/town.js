// Streaming low-poly blocks along the downhill. Props and colliders share
// the course frame: local -z is travel, local +x is sample.right.

import { applyFrame } from "./frame.js";
import { frameFromTangent, sampleCourse, wrapAngle } from "./course.js";
import { edgesAlong, ribbonGeometry } from "./road.js";
import { restCanTilt } from "./drive.js";
import { SITTER, animatePerson, createFlop, stepFlop } from "./props.js";
import {
  BUILDING_SETBACK,
  CHUNK_LENGTH,
  SIDEWALK_CENTER,
  START_S,
} from "./constants.js";

const LANE_GAP = 9;

export function layFlat(geometry) {
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

// Straight facade corners cut into the sidewalk when the curb bends.
// Push the front out so each end stays BUILDING_SETBACK past that curb.
export function facadePush(sample, side, ends) {
  const front = side * (sample.halfWidth + BUILDING_SETBACK);
  let extra = 0;
  for (const end of ends) {
    const curbX = end.x + end.right.x * side * end.halfWidth;
    const curbZ = end.z + end.right.z * side * end.halfWidth;
    const curbLateral = (curbX - sample.x) * sample.right.x + (curbZ - sample.z) * sample.right.z;
    const gap = side * (front - curbLateral);
    if (gap < BUILDING_SETBACK) extra = Math.max(extra, BUILDING_SETBACK - gap);
  }
  return extra;
}

function laneGap(a, b) {
  return Math.max(LANE_GAP, (a.halfL || 2.15) + (b.halfL || 2.15) + 2.2);
}

function hashPercent(text) {
  let hash = 2166136261;
  const value = String(text);
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

// Stable per pair. Almost every car still dodges. A few keep the lane and hit.
export function vehicleHitsLife(carId, actorId) {
  if (!carId || !actorId) return false;
  return hashPercent(`${carId}|${actorId}|life`) < 12;
}

export const TRAFFIC_FLEET = ["plain", "bus", "truck", "plain", "cop"];

// The follower is the car that would be held back. A few followers close
// the gap. Most keep LANE_GAP, so piles of wrecks stay rare.
export function vehicleMayHit(_lead, follow) {
  if (!follow?.id) return false;
  return hashPercent(`${follow.id}|rear`) < 14;
}

export function vehicleClearance(height, halfW, tilt) {
  const sine = Math.sin(tilt);
  const cosine = Math.cos(tilt);
  let minY = 0;
  for (const x of [-halfW, halfW]) {
    for (const y of [0, height]) {
      minY = Math.min(minY, x * sine + y * cosine);
    }
  }
  return minY < 0 ? -minY : 0;
}

export function startVehicleWreck(car, other) {
  if (!car || car.wreck) return car;
  const side = Math.sign((car.offset || 0) - (other?.offset || 0)) || Math.sign(car.lane || 1) || 1;
  const travel = Math.sign(car.speed || car.cruise || 1) || 1;
  const impact = Math.abs((car.speed || 0) - (other?.speed || 0));
  const spread = 0.55 + hashPercent(`${car.id || "car"}|roll`) / 100;
  const roll = side * (0.4 + Math.min(impact, 16) * 0.28) * spread;
  car.wreck = {
    vy: 1.2 + Math.min(impact, 14) * 0.28,
    hop: 0.08,
    spin: 0,
    roll,
    lat: side * (0.8 + Math.min(impact, 10) * 0.22),
    along: travel * Math.max(1.1, Math.abs(car.speed || 0) * 0.22),
    shift: 0,
    bounces: 0,
    settled: false,
  };
  car.speed = travel * 0.55;
  car.stopPull = 0;
  car.dwell = 0;
  return car;
}

export function stepVehicleWreck(car, dt) {
  const wreck = car?.wreck;
  if (!wreck) return car;
  const step = Math.max(0, Math.min(dt || 0, 0.05));
  if (wreck.settled) {
    wreck.spin = restCanTilt(wreck.spin);
    wreck.roll = 0;
    wreck.hop = 0;
    wreck.vy = 0;
    car.speed = 0;
    return car;
  }
  wreck.vy -= 9.81 * step;
  wreck.hop += wreck.vy * step;
  const grounded = wreck.hop <= 0;
  if (grounded) {
    wreck.hop = 0;
    const hard = Math.abs(wreck.vy) > 1.1 && (wreck.bounces || 0) < 3;
    if (hard) {
      wreck.vy = -wreck.vy * 0.48;
      wreck.roll = (wreck.roll || 0) * 0.82;
      wreck.bounces = (wreck.bounces || 0) + 1;
    } else {
      wreck.vy = 0;
    }
  }
  wreck.roll = (wreck.roll || 0) * Math.exp((grounded ? -2.6 : -0.28) * step);
  wreck.spin = (wreck.spin || 0) + wreck.roll * step;
  wreck.along *= Math.exp(-1.05 * step);
  wreck.lat *= Math.exp(-0.85 * step);
  wreck.shift = (wreck.shift || 0) + wreck.lat * step;
  car.s += wreck.along * step;
  const slow = Math.abs(wreck.along) < 0.4
    && Math.abs(wreck.lat) < 0.4
    && Math.abs(wreck.roll) < 0.45
    && wreck.hop < 0.05
    && Math.abs(wreck.vy) < 0.4;
  if (slow) {
    wreck.settled = true;
    wreck.spin = restCanTilt(wreck.spin);
    wreck.roll = 0;
    wreck.hop = 0;
    wreck.vy = 0;
    car.speed = 0;
  }
  return car;
}

// A stop copies the leader's speed onto the follower. Give cruise back once
// the gap opens, or the first bus stop freezes that lane for good.
export function recoverCruise(car, dt) {
  if (!car || car.wreck || car.kind === "bus") return car;
  const cruise = car.cruise || 0;
  const step = Math.max(0, Math.min(dt || 0, 0.05));
  car.speed += (cruise - (car.speed || 0)) * Math.min(1, step * 1.6);
  return car;
}

// Body overlap in the road frame. slack shrinks the width test so a truck
// that merely passes a curb-parked car on a narrow road is not a hit.
export function vehicleBodiesOverlap(a, b, slack = 0) {
  if (!a || !b || a === b) return false;
  const along = Math.abs((a.s || 0) - (b.s || 0));
  const across = Math.abs((a.offset || 0) - (b.offset || 0));
  const reachL = (a.halfL || 2.15) + (b.halfL || 2.15);
  const reachW = (a.halfW || 0.95) + (b.halfW || 0.95) - slack;
  return along < reachL && across < reachW;
}

function beginOverlapWreck(car, other) {
  if (!car || car.wreck) return false;
  const bias = car.bias || 0;
  startVehicleWreck(car, other);
  if (car.wreck) car.wreck.shift = bias;
  return true;
}

// Same-lane gaps stay in separateLane. A swerve leaves that lane, and the
// body it enters — oncoming traffic or a parked car — is a crash, not a pass.
export function collideSweptCars(cars, obstacles = [], { parkedSlack = 0.45 } = {}) {
  let hits = 0;
  for (let index = 0; index < cars.length; index += 1) {
    const car = cars[index];
    for (let otherIndex = index + 1; otherIndex < cars.length; otherIndex += 1) {
      const other = cars[otherIndex];
      if (car.wreck?.settled && other.wreck?.settled) continue;
      if (!vehicleBodiesOverlap(car, other)) continue;
      if (beginOverlapWreck(car, other)) hits += 1;
      if (beginOverlapWreck(other, car)) hits += 1;
    }
    if (car.wreck) continue;
    for (const block of obstacles) {
      if (!vehicleBodiesOverlap(car, block, parkedSlack)) continue;
      if (beginOverlapWreck(car, block)) hits += 1;
      break;
    }
  }
  return hits;
}

// One pasture animal at a time. roll is 0..99. Under 40, and only when no
// other animal is already visiting, the target sits on that animal's side
// of the asphalt. Otherwise it stays in the grass.
export function animalRoamTarget(actor, sample, roll, busy) {
  if (!actor || busy || roll >= 40) return null;
  const side = Math.sign(actor.homeOffset || actor.offset || 1) || 1;
  const span = Math.max(1.5, (sample?.halfWidth || 5) * 0.55);
  return side * span * (0.25 + (Math.abs(roll) % 20) / 40);
}

// True when the straight step from the pasture to the road spot is clear.
export function roadPathOpen(from, to, s, blockers) {
  const steps = 4;
  for (let step = 1; step <= steps; step += 1) {
    const spot = from + ((to - from) * step) / steps;
    if (Math.abs(clearOf(spot, s, 1, blockers) - spot) > 0.35) return false;
  }
  return true;
}

// Cars in one lane keep LANE_GAP meters. Longer vehicles leave their own lengths.
// The leader is the one further along its travel.
// mayCrash pairs are allowed to close. Overlap marks both with crash ids.
export function separateLane(cars, { mayCrash = null } = {}) {
  for (const car of cars) car.crash = null;
  const groups = [
    cars.filter((car) => car.lane < 0),
    cars.filter((car) => car.lane >= 0),
  ];
  for (const group of groups) {
    if (group.length < 2) continue;
    const oncoming = group[0].lane < 0;
    group.sort((a, b) => (oncoming ? a.s - b.s : b.s - a.s));
    for (let index = 1; index < group.length; index += 1) {
      const lead = group[index - 1];
      const follow = group[index];
      const crash = mayCrash && mayCrash(lead, follow);
      if (crash) {
        const reach = ((lead.halfL || 2.15) + (follow.halfL || 2.15)) * 0.72;
        const overlapped = oncoming ? follow.s < lead.s + reach : follow.s > lead.s - reach;
        if (overlapped) {
          lead.crash = follow.id;
          follow.crash = lead.id;
        }
        continue;
      }
      const gap = laneGap(lead, follow);
      if (oncoming) {
        if (follow.s < lead.s + gap) {
          follow.s = lead.s + gap;
          follow.speed = Math.max(follow.speed, lead.speed);
        }
      } else if (follow.s > lead.s - gap) {
        follow.s = lead.s - gap;
        follow.speed = Math.min(follow.speed, lead.speed);
      }
    }
  }
}

// People sidestep, but only a step at a time, so a can that is already on
// them still connects. A full teleport used to slide them out of every hit.
export function lateralEvade(current, target, dt, maxSpeed = 1.7) {
  const maxNudge = maxSpeed * Math.max(0, Math.min(dt || 0, 0.05));
  const dodge = target - current;
  return current + Math.max(-maxNudge, Math.min(maxNudge, dodge));
}

export function overlappingPlayer(actor, player) {
  if (!actor || !player || !Number.isFinite(player.s)) return false;
  const bodies = [player, ...(player.also || [])];
  for (const body of bodies) {
    if (!body || !Number.isFinite(body.s)) continue;
    const reach = (body.radius ?? 0.5) + (actor.radius || 0.42);
    if (Math.abs(actor.s - body.s) < reach && Math.abs(actor.offset - body.offset) < reach) return true;
  }
  return false;
}

// A fast can that is already lined up on someone should hit them. Stepping
// aside for the last couple of meters was sliding people out of every crash.
export function closingOn(actor, player) {
  if (!actor || !player || !Number.isFinite(player.s)) return false;
  const bodies = [player, ...(player.also || [])];
  for (const body of bodies) {
    if (!body || !Number.isFinite(body.s) || Math.abs(body.speed || 0) < 6) continue;
    const ahead = (actor.s - body.s) * Math.sign(body.speed || 1);
    if (ahead < -0.5 || ahead > 2.6) continue;
    const reach = (body.radius ?? 0.5) + (actor.radius || 0.42) + 0.2;
    if (Math.abs(actor.offset - body.offset) < reach) return true;
  }
  return false;
}

// Buses ease in, wait, then roll. ahead is meters along travel to the bench.
export function busPace({ cruise = 0, dwell = 0, ahead = null, dt = 0 } = {}) {
  const step = Math.max(0, dt || 0);
  if (dwell > 0) {
    const left = dwell - step;
    if (left > 0) return { speed: 0, dwell: left, arrive: false };
  }
  if (ahead != null && ahead >= -1 && ahead < 2.4) {
    return { speed: 0, dwell: 5.5, arrive: true };
  }
  if (ahead != null && ahead >= 2.4 && ahead < 22) {
    return { speed: cruise * Math.max(0.28, ahead / 22), dwell: 0, arrive: false };
  }
  return { speed: cruise, dwell: 0, arrive: false };
}
const BEHIND = 36;
const AHEAD = 150;

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chunkSeed(courseSeed, index) {
  return (Math.imul(index + 1, 0x9e3779b1) ^ (courseSeed >>> 0)) >>> 0;
}

function faceStreet(sample, side) {
  return frameFromTangent(-side * sample.right.x, 0, -side * sample.right.z);
}

function armTowardStreet(sample, side) {
  const ix = -side * sample.right.x;
  const iz = -side * sample.right.z;
  return frameFromTangent(iz, 0, -ix);
}

function upright(sample, dir) {
  return frameFromTangent(sample.forward.x * dir, 0, sample.forward.z * dir);
}

// The board faces the lane and back up the hill, toward a rider coming down.
export function signFrame(sample, side) {
  const tx = -side * sample.right.x * 0.72 - sample.forward.x * 0.9;
  const tz = -side * sample.right.z * 0.72 - sample.forward.z * 0.9;
  return frameFromTangent(tx, 0, tz);
}

// Push a walker out of cars and out of the player before the paths overlap.
export function clearOf(offset, s, dir, blockers) {
  let next = offset;
  const travel = dir >= 0 ? 1 : -1;
  for (let pass = 0; pass < 3; pass += 1) {
    for (const block of blockers) {
      const along = (block.s - s) * travel;
      const halfL = block.halfL || 0;
      if (along < -(1.4 + halfL) || along > 6 + halfL) continue;
      const reach = (block.halfW ?? block.radius ?? 0.5) + 0.55;
      const lateral = next - block.offset;
      if (Math.abs(lateral) >= reach) continue;
      const side = lateral === 0 ? (next >= 0 ? 1 : -1) : Math.sign(lateral);
      next = block.offset + side * (reach + 0.08);
    }
  }
  return next;
}

// Last resort so a walker already inside a bench, a sitter, or a tree steps out.
// Circles leave along the shallower overlap. Boxes do the same on their axes.
export function separateCircle(offset, s, radius, blockers) {
  let next = offset;
  let along = s;
  const pad = 0.04;
  const body = radius || 0.42;
  for (let pass = 0; pass < 3; pass += 1) {
    for (const block of blockers) {
      const ds = along - block.s;
      const dl = next - block.offset;
      if (block.halfL != null && block.halfW != null) {
        const reachL = block.halfL + body;
        const reachW = block.halfW + body;
        const penS = reachL - Math.abs(ds);
        const penL = reachW - Math.abs(dl);
        if (penS <= 0 || penL <= 0) continue;
        if (penL <= penS) {
          const side = dl === 0 ? (next >= 0 ? 1 : -1) : Math.sign(dl);
          next = block.offset + side * (reachW + pad);
        } else {
          const side = ds === 0 ? 1 : Math.sign(ds);
          along = block.s + side * (reachL + pad);
        }
        continue;
      }
      const reach = body + (block.radius ?? block.halfW ?? 0.5);
      if (Math.hypot(ds, dl) >= reach) continue;
      // Step sideways. Pushing back along the sidewalk just walks them into it again.
      const side = dl === 0 ? (next >= block.offset ? 1 : -1) : Math.sign(dl);
      next = block.offset + side * (reach + pad);
    }
  }
  return { s: along, offset: next };
}

export function personHitByCar(actor, cars) {
  if (actor.pose === "fallen" || actor.pose === "bounce") return null;
  for (const car of cars) {
    const along = Math.abs(actor.s - car.s) < (car.halfL || 2.15) + 0.35;
    const across = Math.abs(actor.offset - car.offset) < (car.halfW || 0.95) + 0.4;
    if (along && across) return car;
  }
  return null;
}

function carCovers(actor, cars) {
  if (!cars) return false;
  for (const car of cars) {
    const along = Math.abs((actor.s || 0) - car.s) < (car.halfL || 2.15) + 0.35;
    const across = Math.abs((actor.offset || 0) - car.offset) < (car.halfW || 0.95) + 0.4;
    if (along && across) return true;
  }
  return false;
}

function standUp(actor) {
  let pose = actor.was || "walk";
  if (pose === "sit" || pose === "fallen" || pose === "bounce") pose = "walk";
  actor.pose = pose;
  actor.tumble = 0;
  actor.roll = 0;
  actor.lie = null;
  actor.hop = 0;
  actor.vy = 0;
  actor.vs = 0;
  actor.vo = 0;
  actor.down = null;
  actor.flop = null;
  // A fresh touch right as they stand would drop them again.
  actor.grace = 1.25;
  if (actor.group?.userData) {
    actor.group.userData.flop = null;
    actor.group.userData.pose = pose === "cross" ? "walk" : pose;
  }
}

// A person who was knocked down stays there, then rolls upright and walks.
// Animals and cones stay down. A car parked on them holds the timer.
export function stepFallen(actor, dt, cars) {
  const step = Math.max(0, Math.min(dt || 0, 0.05));
  if (actor.flop) stepFlop(actor.flop, step, true);
  if (actor.kind === "person") {
    if (actor.down == null) actor.down = 2.8 + Math.min(1, actor.force || 0.4) * 2;
    const covered = carCovers(actor, cars);
    if (!covered) actor.down -= step;
    if (actor.down <= 0 && !covered) actor.lie = 0;
    else if (covered && (actor.lie == null || actor.lie === 0)) {
      actor.lie = Math.sign(actor.tumble || 1) * (Math.PI / 2);
    }
  }
  if (actor.lie != null) {
    actor.tumble = (actor.tumble || 0) + (actor.lie - (actor.tumble || 0)) * Math.min(1, step * 5);
    actor.roll = (actor.roll || 0) * Math.exp(-4 * step);
  }
  const upright = Math.abs(actor.tumble || 0) < 0.08 && Math.abs(actor.roll || 0) < 0.08;
  if (actor.kind === "person" && actor.lie === 0 && upright && !carCovers(actor, cars)) standUp(actor);
}

export function strikeResponse(actor, car) {
  if (!actor || actor.fixed) return null;
  if (!personHitByCar(actor, [car])) return null;
  if (car && (car.swerving || car.striking)) return "launch";
  return "slide";
}

// Car hits throw harder than the can does. along/side are ±1.
// force is 0..1. A bump stays a stumble. A fast hit still launches.
export function launchVelocity(kind, { along = 1, side = 1, fromCar = false, force = 1 } = {}) {
  const scale = Math.max(0.2, Math.min(force, 1));
  if (fromCar) {
    return { vs: along * 11 * scale, vo: side * 5 * scale, vy: 8 * scale, force: scale };
  }
  const fly = kind === "animal" ? 6.5 : 8;
  return { vs: along * fly * scale, vo: side * 4.2 * scale, vy: 7.2 * scale, force: scale };
}

function clampOffset(value, limit) {
  return Math.max(-limit, Math.min(limit, value));
}

// Look 16 m along travel. The player in that corridor sets swerving and a
// bias away from them. Otherwise a person or animal pulls the bias, and
// swerving stays false. yieldToLife false keeps the lane so a chosen pair can hit.
export function trafficSwerve({ s, speed, laneOffset, halfWidth, player, actors, yieldToLife = true }) {
  const dir = speed >= 0 ? 1 : -1;
  const limit = Math.max(0.3, halfWidth - 1.3);
  let swerving = false;
  let target = 0;
  let life = null;
  const ahead = (other) => (other.s - s) * dir;
  const inCorridor = (other, reach) => {
    const ds = ahead(other);
    return ds > -2 && ds < 16 && Math.abs(other.offset - laneOffset) < reach;
  };
  if (player && Number.isFinite(player.s) && inCorridor(player, 2.2)) {
    swerving = true;
    const away = Math.sign(laneOffset - player.offset) || (laneOffset >= 0 ? 1 : -1);
    target = away * 2.4;
  } else if (actors) {
    let nearest = null;
    for (const actor of actors) {
      if (!actor || actor.fixed) continue;
      if (actor.pose === "fallen" || actor.pose === "bounce") continue;
      if (actor.kind !== "person" && actor.kind !== "animal") continue;
      if (!inCorridor(actor, 1.35 + (actor.radius || 0.4))) continue;
      const ds = ahead(actor);
      if (nearest == null || ds < nearest.ds) nearest = { ds, actor };
    }
    if (nearest) {
      life = nearest.actor;
      if (yieldToLife) {
        const away = Math.sign(laneOffset - nearest.actor.offset) || (laneOffset >= 0 ? 1 : -1);
        target = away * 1.8;
      }
    }
  }
  const offset = clampOffset(laneOffset + target, limit);
  return { swerving, bias: offset - laneOffset, offset, life };
}

export function createTown(THREE, scene, materials, props) {
  const chunks = new Map();
  const hazards = [];
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.userData.shared = true;

  const asphalt = materials.lambert(0x3c4148, { flat: true });
  const sidewalkMat = materials.lambert(0xc8c2b6, { flat: true });
  const grassMat = materials.lambert(0x4f9a3c, { flat: true });
  const yellow = materials.lambert(0xe6c84a, { flat: true });
  const white = materials.lambert(0xf4f6f8, { flat: true });
  const sandMat = materials.lambert(0xe4d2a4, { flat: true });
  const waterMat = materials.lambert(0x2f86c4, { flat: true });
  const dirtMat = materials.lambert(0x6a5640, { flat: true });
  const forestMat = materials.lambert(0x2c6a34, { flat: true });

  const cars = [];

  function mark(w, h, d, material) {
    const mesh = new THREE.Mesh(box, material);
    mesh.scale.set(w, h, d);
    return mesh;
  }

  function place(root, object, sample, offset, lift, frame) {
    object.position.set(
      sample.x + sample.right.x * offset,
      sample.y + lift,
      sample.z + sample.right.z * offset,
    );
    applyFrame(object, frame || sample);
    root.add(object);
  }

  function addRibbon(root, samples, leftOf, rightOf, lift, material) {
    const edges = edgesAlong(samples, leftOf, rightOf, lift);
    root.add(new THREE.Mesh(ribbonGeometry(THREE, edges), material));
  }

  function buildChunk(course, index) {
    const rand = mulberry32(chunkSeed(course.seed, index));
    const s0 = index * CHUNK_LENGTH;
    const s1 = s0 + CHUNK_LENGTH;
    const mid = sampleCourse(course, s0 + CHUNK_LENGTH * 0.5);
    const theme = mid.theme;
    const lit = mid.time === "night" ? 0.72 : mid.time === "dusk" ? 0.4 : 0.16;
    const root = new THREE.Group();
    root.name = `chunk-${index}`;
    const samples = [];
    for (let s = s0; s <= s1; s += 2) samples.push(sampleCourse(course, s));

    addRibbon(root, samples, (sample) => -sample.halfWidth, (sample) => sample.halfWidth, 0, asphalt);
    for (const side of [-1, 1]) {
      // Left vertex is the more negative offset so the normal stays +Y.
      const span = (inner, outer) => ({
        left: (sample) => Math.min(side * inner(sample), side * outer(sample)),
        right: (sample) => Math.max(side * inner(sample), side * outer(sample)),
      });
      const walk = span(
        (sample) => sample.halfWidth + 0.06,
        (sample) => sample.halfWidth + 3.25,
      );
      const waterSide = theme === "ocean" && side === (mid.waterSide || 1);
      const yard = span(
        (sample) => sample.halfWidth + 3.05,
        (sample) => sample.halfWidth + (waterSide ? 8 : 22),
      );
      const edge = span(
        (sample) => sample.halfWidth - 0.42,
        (sample) => sample.halfWidth - 0.28,
      );
      const shoulderMat = waterSide ? sandMat : theme === "forest" ? dirtMat : sidewalkMat;
      const yardMat = waterSide ? sandMat : theme === "forest" ? forestMat : grassMat;
      addRibbon(root, samples, walk.left, walk.right, 0.14, shoulderMat);
      addRibbon(root, samples, yard.left, yard.right, 0, yardMat);
      addRibbon(root, samples, edge.left, edge.right, 0.02, white);
      if (waterSide) {
        const sea = span(
          (sample) => sample.halfWidth + 7.2,
          (sample) => sample.halfWidth + 28,
        );
        addRibbon(root, samples, sea.left, sea.right, -0.08, waterMat);
      }
    }
    addRibbon(root, samples, -0.08, 0.08, 0.025, yellow);

    const actors = [];
    const staticHazards = [];
    const benches = [];
    const solids = [];
    let serial = 0;
    const nextId = (kind) => `${kind}-${index}-${serial++}`;

    function boxHazard(id, kind, sample, offset, frame, halfL, halfW, extra = {}) {
      staticHazards.push({
        id,
        kind,
        x: sample.x + sample.right.x * offset,
        z: sample.z + sample.right.z * offset,
        halfL,
        halfW,
        fx: frame.forward.x,
        fz: frame.forward.z,
        rx: frame.right.x,
        rz: frame.right.z,
        s: sample.s,
        offset,
        style: extra.style ?? null,
        speed: extra.speed ?? 0,
      });
    }

    function circleHazard(id, kind, sample, offset, radius, extra = {}) {
      const hazard = {
        id,
        kind,
        x: sample.x + sample.right.x * offset,
        z: sample.z + sample.right.z * offset,
        radius,
        halfL: null,
        s: sample.s,
        offset,
        ...extra,
      };
      staticHazards.push(hazard);
      return hazard;
    }

    // Walkers steer around these. hazard true also shoves the can, without a crash.
    function addBlock(sample, offset, radius, hazard = true) {
      solids.push({ s: sample.s, offset, radius });
      if (hazard) circleHazard(nextId("solid"), "solid", sample, offset, radius);
    }

    function addBox(sample, offset, halfL, halfW) {
      solids.push({ s: sample.s, offset, halfL, halfW });
    }

    const spacing = theme === "downtown" ? 22 : theme === "market" ? 18 : 16;
    for (let s = s0 + spacing * 0.45; s < s1 - 2; s += spacing) {
      for (const side of [-1, 1]) {
        if (theme === "ocean" && side === (mid.waterSide || 1)) continue;
        if (theme === "downtown" && rand() < 0.18) continue;
        if (theme === "country" && rand() < 0.62) continue;
        if (theme === "forest" && rand() < 0.85) continue;
        const sample = sampleCourse(course, s);
        let building;
        if (theme === "neighborhood" || theme === "country" || theme === "ocean" || theme === "forest") building = props.createHouse(rand);
        else if (theme === "market") building = props.createShop(rand, lit);
        else building = props.createTower(rand, lit);
        const depth = building.userData.depth || 8;
        const width = building.userData.width || 8;
        const frame = faceStreet(sample, side);
        const extra = facadePush(sample, side, [
          sampleCourse(course, s - width / 2),
          sampleCourse(course, s + width / 2),
        ]);
        const front = sample.halfWidth + BUILDING_SETBACK + extra;
        const center = side * (front + depth / 2);
        place(root, building, sample, center, 0, frame);
        addBox(sample, center, width / 2, depth / 2);
        if (theme === "neighborhood" || theme === "country") {
          const fenceLength = (building.userData.width || 6) * 0.85;
          const fence = props.createFence(fenceLength);
          const fenceOffset = side * (front - 0.45);
          place(root, fence, sample, fenceOffset, 0, frame);
          addBox(sample, fenceOffset, fenceLength / 2, 0.2);
          if (rand() > 0.4) {
            const hydrant = props.createHydrant();
            const hydrantOffset = side * (sample.halfWidth + 0.55);
            place(root, hydrant, sample, hydrantOffset, 0.14, upright(sample, 1));
            addBlock(sample, hydrantOffset, 0.28);
          }
        }
      }
    }

    const sign = props.createSign(mid.name);
    const signAt = samples[1] || mid;
    const signOffset = mid.halfWidth + SIDEWALK_CENTER;
    place(root, sign, signAt, signOffset, 0.14, signFrame(mid, 1));
    addBlock(signAt, signOffset, 0.9);

    if (theme === "market" && rand() > 0.35) {
      const stop = props.createBusStop();
      const at = sampleCourse(course, s0 + 14);
      const stopOffset = -(at.halfWidth + SIDEWALK_CENTER);
      place(root, stop, at, stopOffset, 0.14, faceStreet(at, -1));
      benches.push({ s: at.s, side: -1, offset: stopOffset });
      addBlock(at, stopOffset, 1.45);
    }

    if (theme === "forest") {
      for (let s = s0 + 2; s < s1; s += 4) {
        for (const side of [-1, 1]) {
          const sample = sampleCourse(course, s + (side > 0 ? 0 : 2));
          const tree = props.createTree(rand);
          const treeOffset = side * (sample.halfWidth + 1.6 + rand() * 1.1);
          place(root, tree, sample, treeOffset, 0, upright(sample, 1));
          addBlock(sample, treeOffset, 1.05);
          if (rand() > 0.4) {
            const far = props.createTree(rand);
            const farOffset = side * (sample.halfWidth + 3.4 + rand() * 1.4);
            place(root, far, sample, farOffset, 0, upright(sample, 1));
            addBlock(sample, farOffset, 1.05);
          }
        }
      }
      for (let s = s0 + 10; s < s1; s += 22) {
        const side = rand() > 0.5 ? 1 : -1;
        const sample = sampleCourse(course, s);
        const lamp = props.createLamp();
        const lampOffset = side * (sample.halfWidth + 0.42);
        place(root, lamp, sample, lampOffset, 0.14, armTowardStreet(sample, side));
        addBlock(sample, lampOffset, 0.34);
      }
    } else {
      for (let s = s0 + 6; s < s1; s += 11) {
        const side = rand() > 0.5 ? 1 : -1;
        const sample = sampleCourse(course, s);
        if (rand() > 0.45) {
          const tree = props.createTree(rand);
          const treeOffset = side * (sample.halfWidth + 3.6);
          place(root, tree, sample, treeOffset, 0, upright(sample, 1));
          addBlock(sample, treeOffset, 1.05);
        } else {
          const lamp = props.createLamp();
          const lampOffset = side * (sample.halfWidth + 0.42);
          place(root, lamp, sample, lampOffset, 0.14, armTowardStreet(sample, side));
          addBlock(sample, lampOffset, 0.34);
        }
      }
    }

    for (let s = s0 + 3; s < s1; s += 7) {
      const sample = sampleCourse(course, s + 1);
      for (const side of [-1, 1]) {
        const dash = mark(0.16, 0.03, 2.3, white);
        place(root, dash, sample, side * sample.halfWidth * 0.32, 0.03, sample);
      }
    }

    // Lane pairs share one road frame. A single bar across a bend runs over the curb.
    const crossS = s1 - 10;
    const crossA = sampleCourse(course, crossS);
    const crossB = sampleCourse(course, crossS + 4.2);
    const bend = Math.abs(wrapAngle(crossA.psi - crossB.psi));
    if (theme !== "country" && theme !== "forest" && bend < 0.12 && Math.abs(crossS - START_S) > 14) {
      for (let stripe = 0; stripe < 4; stripe += 1) {
        const sample = sampleCourse(course, crossS + stripe * 1.05);
        for (const side of [-1, 1]) {
          const band = mark(sample.halfWidth * 0.48, 0.04, 0.3, white);
          place(root, band, sample, side * sample.halfWidth * 0.46, 0.05, sample);
        }
      }
    }

    const parked = [];
    for (let s = s0 + 8; s < s1; s += 18) {
      if (rand() > (theme === "forest" ? 0.12 : 0.42)) continue;
      const side = rand() > 0.5 ? 1 : -1;
      const sample = sampleCourse(course, s);
      const roll = rand();
      const style = roll > 0.97 ? "cop" : roll > 0.8 ? "truck" : roll > 0.66 ? "taxi" : roll > 0.45 ? "stripe" : "plain";
      const car = props.createCar(rand, style);
      const dir = rand() > 0.5 ? 1 : -1;
      const frame = frameFromTangent(sample.forward.x * dir, sample.forward.y * dir, sample.forward.z * dir);
      // Outer lane, wheels at the curb. Traffic uses ±0.36 of the half-width and misses these.
      const halfW = car.userData.halfW || 0.95;
      const offset = side * (sample.halfWidth - Math.max(1.15, halfW + 0.25));
      place(root, car, sample, offset, 0, frame);
      boxHazard(nextId("parked"), "car", sample, offset, frame, car.userData.halfL || 2.15, halfW, { style });
      parked.push({ s, side });
    }

    for (let s = s0 + 18; s < s1; s += 36) {
      if (s < START_S + 16 || rand() > 0.32) continue;
      const sample = sampleCourse(course, s);
      const offset = (rand() - 0.5) * sample.halfWidth * 0.85;
      const hole = props.createPothole(rand);
      place(root, hole, sample, offset, 0, sample);
      circleHazard(nextId("pothole"), "pothole", sample, offset, 0.95);
    }

    for (let s = s0 + 18; s < s1; s += 22) {
      if (s < START_S + 20 || rand() > 0.55) continue;
      const sample = sampleCourse(course, s);
      const offset = (rand() - 0.5) * sample.halfWidth * 0.7;
      const slick = props.createSlick(rand);
      place(root, slick, sample, offset, 0, sample);
      circleHazard(nextId("slick"), "slick", sample, offset, slick.userData.radius || 1.7, { slip: rand() > 0.5 ? 1 : -1 });
    }

    for (let s = s0 + 20; s < s1; s += 24) {
      if (s < START_S + 22 || rand() > 0.5) continue;
      const sample = sampleCourse(course, s);
      const offset = (rand() > 0.5 ? 1 : -1) * (sample.halfWidth * 0.45);
      const kind = rand() > 0.5 ? "cone" : "crate";
      const prop = kind === "cone" ? props.createCone() : props.createCrate(rand);
      place(root, prop, sample, offset, 0, upright(sample, 1));
      const propRadius = kind === "crate" ? 0.45 : 0.32;
      if (kind === "cone") {
        const id = nextId("cone");
        const hazard = circleHazard(id, "cone", sample, offset, propRadius);
        const solid = { s: sample.s, offset, radius: propRadius + 0.08 };
        solids.push(solid);
        actors.push({
          id,
          group: prop,
          kind: "cone",
          pose: "rest",
          s: sample.s,
          offset,
          homeOffset: offset,
          dir: 1,
          speed: 0,
          fixed: false,
          root,
          radius: propRadius,
          hazard,
          solid,
          cool: 0,
        });
      } else {
        circleHazard(nextId("crate"), "crate", sample, offset, propRadius);
        solids.push({ s: sample.s, offset, radius: propRadius + 0.08 });
      }
    }

    let personCount = 0;
    let roadCrossers = 0;
    for (let s = s0 + 5; s < s1 && personCount < 6; s += 7) {
      if (rand() > 0.72) continue;
      const roll = rand();
      let pose = roll < 0.4 ? "walk" : roll < 0.58 ? "talk" : roll < 0.76 ? "sit" : roll < 0.9 ? "phone" : "walk";
      // One crosser in the roadway per chunk. The rest stay on the sidewalk.
      if (roadCrossers < 1 && s >= START_S + 24 && rand() > 0.82) {
        pose = "cross";
        roadCrossers += 1;
      }
      const side = rand() > 0.5 ? 1 : -1;
      const sample = sampleCourse(course, s);
      if (pose !== "cross" && parked.some((car) => car.side === side && Math.abs(car.s - s) < 3.4)) continue;
      const sidewalk = side * (sample.halfWidth + SIDEWALK_CENTER);
      const person = props.createPerson(rand, pose === "cross" ? "walk" : pose);
      person.userData.pose = pose === "cross" ? "walk" : pose;
      let fixed = false;
      if (pose === "sit") {
        const bench = props.createBench();
        place(root, bench, sample, sidewalk, 0.14, faceStreet(sample, side));
        person.position.set(0, SITTER.y, SITTER.z);
        bench.add(person);
        benches.push({ s, side, offset: sidewalk });
        addBlock(sample, sidewalk, 0.95);
        fixed = true;
      } else {
        place(root, person, sample, pose === "cross" ? 0 : sidewalk, 0.14, upright(sample, 1));
        if (pose === "walk" && rand() < 0.3) {
          const dog = props.createDog(rand);
          person.add(dog);
          person.userData.dog = dog;
        }
      }
      if (pose === "talk") {
        const friend = props.createPerson(rand, "talk");
        place(root, friend, sampleCourse(course, s + 0.9), sidewalk, 0.14, upright(sample, -1));
        actors.push({
          id: nextId("person"),
          group: friend,
          kind: "person",
          pose: "talk",
          s: s + 0.9,
          offset: sidewalk,
          homeOffset: sidewalk,
          dir: -1,
          speed: 0,
          fixed: false,
          root,
          radius: 0.42,
        });
      }
      if (theme === "market" && pose === "sit") {
        const cafe = props.createCafe(rand);
        const cafeOffset = sidewalk + side * 0.8;
        place(root, cafe, sample, cafeOffset, 0.14, upright(sample, 1));
        addBlock(sample, cafeOffset, 1.05);
      }
      actors.push({
        id: nextId("person"),
        group: person,
        kind: "person",
        pose,
        s,
        offset: pose === "cross" ? 0 : sidewalk,
        homeOffset: pose === "cross" ? 0 : sidewalk,
        dir: rand() > 0.5 ? 1 : -1,
        speed: 0.7 + rand() * 0.7,
        phase: rand() * Math.PI * 2,
        fixed,
        root,
        radius: 0.42,
      });
      personCount += 1;
    }

    if (theme === "country") {
      const herd = 4;
      let pastureSide = rand() > 0.5 ? 1 : -1;
      function overlapsSolid(at, spot, radius) {
        for (const solid of solids) {
          const ds = at - solid.s;
          const dl = spot - solid.offset;
          if (solid.halfL != null && solid.halfW != null) {
            if (Math.abs(ds) < solid.halfL + radius && Math.abs(dl) < solid.halfW + radius) return true;
          } else if (Math.hypot(ds, dl) < (solid.radius || 0.4) + radius) return true;
        }
        return false;
      }
      function pastureOffset(sample, radius) {
        for (const side of [pastureSide, -pastureSide]) {
          for (let attempt = 0; attempt < 4; attempt += 1) {
            const spot = side * (sample.halfWidth + 11 + attempt * 1.7 + rand() * 0.6);
            if (Math.abs(spot) > sample.halfWidth + 20) continue;
            if (!overlapsSolid(sample.s, spot, radius)) return spot;
          }
        }
        return null;
      }
      for (let n = 0; n < herd; n += 1) {
        const sample = sampleCourse(course, s0 + 7 + n * 9);
        if (sample.theme !== "country") continue;
        const animalKind = rand() > 0.5 ? "cow" : "sheep";
        const radius = animalKind === "cow" ? 0.75 : 0.48;
        const offset = pastureOffset(sample, radius);
        if (offset == null) continue;
        const animal = props.createAnimal(rand, animalKind);
        const dir = rand() > 0.5 ? 1 : -1;
        place(root, animal, sample, offset, 0, upright(sample, dir));
        actors.push({
          id: nextId(animalKind),
          group: animal,
          kind: "animal",
          pose: "walk",
          s: sample.s,
          offset,
          homeOffset: offset,
          dir,
          speed: animalKind === "cow" ? 0.35 : 0.55,
          phase: rand() * Math.PI * 2,
          wander: 4 + n * 2.5,
          visit: null,
          trips: 0,
          fixed: false,
          root,
          radius,
        });
      }
    }

    if (benches.length === 0 && theme !== "forest") {
      const side = rand() > 0.5 ? 1 : -1;
      const at = sampleCourse(course, s0 + 20);
      const sidewalk = side * (at.halfWidth + SIDEWALK_CENTER);
      const bench = props.createBench();
      place(root, bench, at, sidewalk, 0.14, faceStreet(at, side));
      benches.push({ s: at.s, side, offset: sidewalk });
      addBlock(at, sidewalk, 0.95);
    }

    scene.add(root);
    return { index, s0, s1, root, actors, staticHazards, benches, solids };
  }

  function disposeRoot(root) {
    root.traverse((object) => {
      const fx = object.userData?.exhaustFx;
      if (fx?.group) {
        scene.remove(fx.group);
        fx.group.traverse((puff) => {
          if (puff.geometry && !puff.geometry.userData.shared) puff.geometry.dispose();
        });
      }
      if (object.geometry && !object.geometry.userData.shared) object.geometry.dispose();
    });
    scene.remove(root);
  }

  function cruiseFor(kind, oncoming, rand) {
    const mag = kind === "cop"
      ? 14 + rand() * 6
      : kind === "truck"
        ? 6.5 + rand() * 3
        : kind === "bus"
          ? 5.5 + rand() * 2.5
          : 6 + rand() * 7;
    return oncoming ? -mag : mag;
  }

  function ensureCars(course) {
    if (cars.length || !course) return;
    const rand = mulberry32((course.seed ^ 0x51ed) >>> 0);
    const fleet = TRAFFIC_FLEET;
    for (let index = 0; index < fleet.length; index += 1) {
      const style = fleet[index];
      const oncoming = index % 2 === 1;
      const mesh = props.createCar(rand, style);
      scene.add(mesh);
      const cruise = cruiseFor(mesh.userData.kind || "car", oncoming, rand);
      cars.push({
        id: `traffic-${index}`,
        mesh,
        kind: mesh.userData.kind || "car",
        halfL: mesh.userData.halfL || 2.15,
        halfW: mesh.userData.halfW || 0.95,
        s: START_S + 48 + index * 36,
        homeS: START_S + 48 + index * 36,
        lane: oncoming ? -0.36 : 0.36,
        homeLane: oncoming ? -0.36 : 0.36,
        speed: cruise,
        cruise,
        homeCruise: cruise,
        roll: rand() * 4,
        dwell: 0,
        served: null,
      });
    }
  }

  function recycleCar(car, rideS, rand, pace) {
    const oncoming = rand() > 0.5;
    car.lane = oncoming ? -0.36 : 0.36;
    // A stopped watcher looks downhill. Same-direction cars spawn behind and drive through.
    // A fast rider still meets traffic ahead.
    const fast = Math.abs(pace || 0) > 6;
    car.s = oncoming || fast
      ? rideS + 70 + rand() * 90
      : Math.max(0, rideS - 28 - rand() * 6);
    car.cruise = cruiseFor(car.kind, oncoming, rand);
    car.speed = car.cruise;
    car.bias = 0;
    car.swerving = false;
    car.dwell = 0;
    car.hold = 0;
    car.served = null;
    car.stopPull = 0;
    car.wreck = null;
    car.striking = false;
    car.crash = null;
    if (car.mesh?.userData?.smoke) car.mesh.userData.smoke.group.visible = false;
  }

  function ensureSmoke(mesh) {
    if (mesh.userData.smoke) return mesh.userData.smoke;
    const group = new THREE.Group();
    group.name = "smoke";
    const puffs = [];
    for (let index = 0; index < 6; index += 1) {
      const material = new THREE.MeshLambertMaterial({
        color: index % 2 ? 0x2a2e32 : 0x6a7178,
        flatShading: true,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      });
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.42, 6, 5), material);
      group.add(puff);
      puffs.push(puff);
    }
    group.visible = false;
    scene.add(group);
    mesh.userData.smoke = { group, puffs };
    return mesh.userData.smoke;
  }

  function ensureExhaust(mesh) {
    if (mesh.userData.exhaustFx) return mesh.userData.exhaustFx;
    const heavy = !!mesh.userData.exhaust?.heavy;
    const group = new THREE.Group();
    group.name = "exhaust";
    const puffs = [];
    const count = heavy ? 5 : 3;
    for (let index = 0; index < count; index += 1) {
      const material = new THREE.MeshLambertMaterial({
        color: heavy ? (index % 2 ? 0x2c3136 : 0x4e565e) : 0x6e777e,
        flatShading: true,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      });
      const puff = new THREE.Mesh(new THREE.SphereGeometry(heavy ? 0.28 : 0.13, 6, 5), material);
      group.add(puff);
      puffs.push(puff);
    }
    group.visible = false;
    scene.add(group);
    mesh.userData.exhaustFx = { group, puffs, heavy, local: new THREE.Vector3() };
    return mesh.userData.exhaustFx;
  }

  function puffExhaust(mesh, time) {
    const tip = mesh?.userData?.exhaust;
    if (!tip?.smoke) {
      if (mesh?.userData?.exhaustFx) mesh.userData.exhaustFx.group.visible = false;
      return;
    }
    const fx = ensureExhaust(mesh);
    fx.group.visible = true;
    fx.local.set(tip.x, tip.y, tip.z);
    fx.local.applyQuaternion(mesh.quaternion);
    fx.group.position.copy(mesh.position).add(fx.local);
    fx.group.quaternion.identity();
    const rise = fx.heavy ? 2.15 : 0.8;
    const drift = fx.heavy ? 0.24 : 0.07;
    fx.puffs.forEach((puff, index) => {
      const span = fx.heavy ? 1.7 : 1.05;
      const cycle = (time * (fx.heavy ? 0.9 : 1.2) + index * 0.38) % span;
      puff.position.set(
        Math.sin(time * 1.4 + index * 2.1) * drift,
        cycle * rise,
        Math.cos(time * 1.1 + index) * drift * 0.65,
      );
      puff.scale.setScalar((fx.heavy ? 0.5 : 0.4) + cycle * (fx.heavy ? 0.85 : 0.55));
      puff.material.opacity = (fx.heavy ? 0.66 : 0.48) * (1 - cycle / span);
    });
  }

  function puffSmoke(car, time) {
    const smoke = ensureSmoke(car.mesh);
    smoke.group.visible = !!car.wreck;
    if (!car.wreck) return;
    const roof = car.mesh.userData.roof || 1.5;
    if (!smoke.local) smoke.local = new THREE.Vector3();
    // Local +y is the upright height. After a flip that point sits inside the body.
    smoke.local.set(0, roof * 0.42, 0.35);
    smoke.local.applyQuaternion(car.mesh.quaternion);
    smoke.group.position.copy(car.mesh.position).add(smoke.local);
    smoke.group.quaternion.identity();
    smoke.puffs.forEach((puff, index) => {
      const cycle = (time * 0.65 + index * 0.4) % 2.4;
      puff.position.set(
        Math.sin(time * 1.6 + index) * 0.55,
        cycle * 1.35,
        Math.cos(time * 1.3 + index) * 0.4,
      );
      puff.scale.setScalar(0.7 + cycle * 0.95);
      puff.material.opacity = 0.78 * (1 - cycle / 2.4);
    });
  }

  function flashLights(lights, time) {
    if (!lights?.on || !lights.red || !lights.blue) return;
    const phase = Math.floor(time * 7) % 2 === 0;
    lights.red.material.emissiveIntensity = phase ? 2.4 : 0.05;
    lights.blue.material.emissiveIntensity = phase ? 0.05 : 2.4;
  }

  function nextBench(car) {
    const dir = (car.cruise ?? car.speed) >= 0 ? 1 : -1;
    let best = null;
    for (const chunk of chunks.values()) {
      for (const bench of chunk.benches || []) {
        if (Math.sign(bench.side) !== Math.sign(car.lane || 1)) continue;
        if (car.served != null && Math.abs(bench.s - car.served) < 8) continue;
        const ahead = (bench.s - car.s) * dir;
        if (ahead < -1 || ahead > 26) continue;
        if (!best || ahead < best.ahead) best = { s: bench.s, ahead };
      }
    }
    return best;
  }

  let activeCourse = null;
  let activeTime = 0;

  function fillSlot(slot, fields) {
    slot.id = fields.id;
    slot.kind = fields.kind;
    slot.x = fields.x;
    slot.z = fields.z;
    slot.radius = fields.radius ?? null;
    slot.halfL = fields.halfL ?? null;
    slot.halfW = fields.halfW ?? null;
    slot.fx = fields.fx ?? null;
    slot.fz = fields.fz ?? null;
    slot.rx = fields.rx ?? null;
    slot.rz = fields.rz ?? null;
    slot.s = fields.s ?? null;
    slot.offset = fields.offset ?? null;
    slot.slip = fields.slip ?? null;
    slot.style = fields.style ?? null;
    slot.speed = fields.speed ?? null;
    slot.wreck = fields.wreck ?? null;
  }

  function releaseActor(actor) {
    if (actor.group?.parent && actor.root && actor.group.parent !== actor.root) {
      actor.root.attach(actor.group);
    }
    actor.fixed = false;
  }

  function placeActor(actor, sample, offset, lift) {
    const facing = actor.pose === "cross" ? Math.cos(actor.phase || 0) : (actor.dir || 1);
    const frame = upright(sample, facing >= 0 ? 1 : -1);
    actor.group.position.set(
      sample.x + sample.right.x * offset,
      sample.y + lift,
      sample.z + sample.right.z * offset,
    );
    applyFrame(actor.group, frame);
    if (actor.pose === "fallen" || actor.pose === "bounce") {
      const tumble = actor.tumble || 0;
      const roll = actor.roll || 0;
      actor.group.rotateX(tumble);
      actor.group.rotateZ(roll);
      const height = actor.kind === "cone" ? 0.62 : actor.kind === "animal" ? 1.05 : 1.65;
      const radius = actor.kind === "cone" ? 0.18 : actor.kind === "animal" ? 0.42 : 0.32;
      const minY = Math.min(0, height * Math.cos(tumble)) - radius * Math.abs(Math.sin(tumble));
      const rollDip = radius * Math.abs(Math.sin(roll));
      const dip = Math.min(minY, 0) - rollDip;
      if (dip < 0) actor.group.position.y -= dip;
    }
  }

  function refreshActor(actor, course, time) {
    if (actor.fixed || !actor.group) return;
    const sample = sampleCourse(course, actor.s);
    const lift = actor.pose === "bounce"
      ? 0.14 + Math.max(0, actor.hop || 0)
      : actor.pose === "fallen"
        ? 0.08
        : 0.14;
    placeActor(actor, sample, actor.offset, lift);
    if (actor.kind === "animal" && actor.pose !== "fallen" && actor.pose !== "bounce") {
      const bob = Math.sin(time * 3.4 + (actor.phase || 0));
      actor.group.rotateX(bob * 0.1);
      actor.group.position.y += Math.abs(bob) * 0.045;
    }
    if ((actor.pose === "fallen" || actor.pose === "bounce") && actor.group.userData) {
      actor.group.userData.flop = actor.flop || null;
      actor.group.userData.pose = actor.flop ? "ragdoll" : "fallen";
    }
    if (actor.group.userData?.limbs) animatePerson(actor.group, time);
  }

  function stepBounce(actor, step, cars) {
    const dt = Math.max(0, Math.min(step, 0.05));
    if (actor.pose === "fallen") {
      stepFallen(actor, dt, cars);
      return;
    }
    actor.vs = (actor.vs || 0) * Math.exp(-0.7 * dt);
    actor.vo = (actor.vo || 0) * Math.exp(-0.85 * dt);
    actor.s += actor.vs * dt;
    actor.offset = Math.max(-14, Math.min(14, actor.offset + actor.vo * dt));
    actor.tumble = (actor.tumble || 0) + (actor.spinRate || 0) * dt;
    actor.roll = (actor.roll || 0) + (actor.rollRate || 0) * dt;
    actor.spinRate = (actor.spinRate || 0) * Math.exp(-0.7 * dt);
    actor.rollRate = (actor.rollRate || 0) * Math.exp(-0.95 * dt);
    if (actor.flop) stepFlop(actor.flop, dt, false);
    actor.vy = (actor.vy || 0) - 9.81 * dt;
    actor.hop = (actor.hop || 0) + actor.vy * dt;
    if (actor.hop > 0) return;
    actor.hop = 0;
    const limit = (actor.force || 1) > 0.65 ? 3 : 1;
    if (Math.abs(actor.vy) > 0.85 && (actor.bounces || 0) < limit) {
      actor.vy = -actor.vy * 0.5;
      actor.bounces = (actor.bounces || 0) + 1;
      if (actor.flop) {
        actor.flop.armL.v += 1.4;
        actor.flop.legR.v -= 1.1;
      }
      return;
    }
    actor.vy = 0;
    actor.vs = 0;
    actor.vo = 0;
    actor.pose = "fallen";
    actor.lie = Math.sign(actor.tumble || actor.spinRate || 1) * (Math.PI / 2);
    if (actor.kind === "person") actor.down = 2.8 + Math.min(1, actor.force || 0.4) * 2;
  }

  function beginFlight(actor, kick) {
    if (actor.pose !== "bounce" && actor.pose !== "fallen") actor.was = actor.pose;
    actor.down = null;
    releaseActor(actor);
    const force = kick.force ?? 1;
    actor.pose = "bounce";
    actor.force = force;
    actor.vs = kick.vs;
    actor.vo = kick.vo;
    actor.vy = kick.vy;
    actor.hop = 0.04 + Math.min(0.28, Math.abs(kick.vy || 0) * 0.035);
    actor.bounces = 0;
    actor.tumble = 0;
    actor.roll = 0;
    actor.lie = null;
    actor.spinRate = Math.sign(kick.vs || 1) * (0.45 + Math.abs(kick.vy || 0) * 0.22);
    actor.rollRate = Math.sign(kick.vo || 1) * (0.3 + Math.abs(kick.vo || 0) * 0.16);
    if (actor.group?.userData?.limbs) {
      actor.flop = createFlop(hashPercent(`${actor.id || "who"}|flop`), force);
      actor.group.userData.flop = actor.flop;
      actor.group.userData.pose = "ragdoll";
    } else if (actor.group?.userData) {
      actor.group.userData.pose = "fallen";
    }
  }

  function beginBounce(actor, car) {
    const lateral = actor.offset - car.offset;
    const away = Math.sign(lateral) || (actor.offset >= 0 ? 1 : -1);
    const reach = (car.halfW || 0.95) + 0.5;
    if (Math.abs(lateral) < reach) actor.offset = car.offset + away * reach;
    const impact = Math.abs(car.speed || 0);
    beginFlight(actor, launchVelocity(actor.kind, {
      along: Math.sign(car.speed || 1),
      side: away,
      fromCar: true,
      force: Math.min(1, 0.22 + impact / 14),
    }));
  }

  function slideAside(actor, car) {
    const lateral = actor.offset - car.offset;
    const away = Math.sign(lateral) || (actor.offset >= 0 ? 1 : -1);
    const reach = (car.halfW || 0.95) + (actor.radius || 0.42) + 0.2;
    if (Math.abs(lateral) < reach) actor.offset = car.offset + away * reach;
  }

  function findActor(id) {
    for (const chunk of chunks.values()) {
      for (const actor of chunk.actors) {
        if (actor.id === id) return actor;
      }
    }
    return null;
  }

  function coneKick(event) {
    const force = Math.max(0.35, Math.min(event.force ?? 0.6, 1));
    const along = event.along || 1;
    const side = event.side || 1;
    return {
      vs: along * (4.2 + 5 * force),
      vo: side * (2.4 + 3.2 * force),
      vy: 3.4 + 3.6 * force,
      force,
    };
  }

  function coneTouch(actor, cars) {
    for (const car of cars) {
      if (Math.abs(car.speed || 0) < 2) continue;
      const along = Math.abs(actor.s - car.s) < (car.halfL || 2.15) + 0.4;
      const across = Math.abs(actor.offset - car.offset) < (car.halfW || 0.95) + 0.45;
      if (along && across) return car;
    }
    return null;
  }

  function syncCone(actor) {
    if (actor.hazard && actor.group) {
      actor.hazard.x = actor.group.position.x;
      actor.hazard.z = actor.group.position.z;
      actor.hazard.s = actor.s;
      actor.hazard.offset = actor.offset;
    }
    if (actor.solid) {
      actor.solid.s = actor.s;
      actor.solid.offset = actor.offset;
    }
  }

  function noteHits(events) {
    if (!events || !activeCourse) return;
    for (const event of events) {
      if (!event.id) continue;
      const actor = findActor(event.id);
      if (!actor) continue;
      if (event.type === "fell") {
        if (actor.pose === "fallen" || actor.pose === "bounce") continue;
        if ((actor.grace || 0) > 0) continue;
        const side = event.side || (actor.offset >= 0 ? 1 : -1);
        beginFlight(actor, launchVelocity(actor.kind, {
          along: event.along || 1,
          side,
          fromCar: false,
          force: event.force ?? 0.45,
        }));
        refreshActor(actor, activeCourse, activeTime);
      } else if (event.type === "flew") {
        if (actor.kind !== "cone" || actor.pose === "bounce") continue;
        beginFlight(actor, coneKick(event));
        actor.cool = 0.7;
        refreshActor(actor, activeCourse, activeTime);
        syncCone(actor);
      }
    }
  }

  function stillBlocked(offset, s, dir, blockers) {
    const travel = dir >= 0 ? 1 : -1;
    for (const block of blockers) {
      const ds = (block.s - s) * travel;
      const halfL = block.halfL || 0;
      if (ds < 0.15 - halfL || ds > 1.6 + halfL) continue;
      const reach = (block.halfW ?? block.radius ?? 0.5) + 0.55;
      if (Math.abs(offset - block.offset) < reach) return true;
    }
    return false;
  }

  function update(course, rideS, dt, time, player) {
    activeCourse = course;
    activeTime = time;
    // The camera stays with the body. Traffic recycles around that, not around
    // an empty can that has rolled ahead, or the street in view goes quiet.
    const viewS = player && Number.isFinite(player.s) ? player.s : rideS;
    const spanLo = Math.min(rideS, viewS);
    const spanHi = Math.max(rideS, viewS);
    const first = Math.floor((spanLo - BEHIND) / CHUNK_LENGTH);
    const last = Math.floor((spanHi + AHEAD) / CHUNK_LENGTH);
    for (const [index, chunk] of chunks) {
      if (index < first || index > last) {
        disposeRoot(chunk.root);
        chunks.delete(index);
      }
    }
    for (let index = Math.max(0, first); index <= last; index += 1) {
      if (!chunks.has(index)) chunks.set(index, buildChunk(course, index));
    }

    let count = 0;
    function claim() {
      let hazard = hazards[count];
      if (!hazard) {
        hazard = {};
        hazards[count] = hazard;
      }
      count += 1;
      return hazard;
    }

    const parkedBlocks = [];
    for (const chunk of chunks.values()) {
      for (const hazard of chunk.staticHazards) {
        const slot = claim();
        fillSlot(slot, hazard);
        if (hazard.kind === "car") {
          parkedBlocks.push({
            s: hazard.s,
            offset: hazard.offset,
            halfL: hazard.halfL,
            halfW: hazard.halfW,
            speed: 0,
          });
        }
      }
    }

    ensureCars(course);
    const rand = mulberry32(((course.seed + Math.floor(time * 10)) ^ 0x9e37) >>> 0);
    for (const car of cars) {
      if (car.s < viewS - 45 || car.s > viewS + 190) recycleCar(car, viewS, rand, player?.speed || 0);
      if (car.wreck) {
        stepVehicleWreck(car, dt);
      } else if (car.kind === "bus") {
        const bench = nextBench(car);
        const pace = busPace({
          cruise: car.cruise,
          dwell: car.dwell || 0,
          ahead: bench ? bench.ahead : null,
          dt,
        });
        car.speed = pace.speed;
        car.dwell = pace.dwell;
        if (pace.arrive && bench) car.served = bench.s;
        // A short dwell ends before a rider coming downhill can see it.
        // Hold the curb while that rider is closing in, then pull away.
        const dir = (car.cruise ?? 1) >= 0 ? 1 : -1;
        const gap = player && Number.isFinite(player.s) ? (car.s - player.s) * dir : 999;
        const closing = player && Math.abs(player.speed || 0) > 4;
        if (car.dwell > 0 && closing && gap > 1.5 && gap < 36) {
          car.hold = (car.hold || 0) + dt;
          if (car.hold < 7.5) car.dwell = Math.max(car.dwell, 0.4);
        } else if ((car.dwell || 0) <= 0) {
          car.hold = 0;
        }
        if (bench && bench.ahead < 18) car.stopPull = Math.sign(car.lane || 1);
        else if ((car.dwell || 0) <= 0) car.stopPull = 0;
        car.s += car.speed * dt;
      } else {
        car.stopPull = 0;
        car.hold = 0;
        car.s += car.speed * dt;
      }
      car.roll += Math.abs(car.speed) * dt * 1.6;
      flashLights(car.mesh.userData.lights, time);
    }
    for (const car of cars) recoverCruise(car, dt);
    for (const chunk of chunks.values()) {
      for (const child of chunk.root.children) {
        flashLights(child.userData?.lights, time);
        if (child.userData?.exhaust?.smoke) puffExhaust(child, time);
      }
    }
    const roadUsers = [];
    for (const chunk of chunks.values()) {
      for (const actor of chunk.actors) roadUsers.push(actor);
    }
    separateLane(cars, { mayCrash: vehicleMayHit });
    for (const car of cars) {
      if (!car.crash || car.wreck) continue;
      const other = cars.find((item) => item.id === car.crash);
      startVehicleWreck(car, other);
    }
    const carBlocks = parkedBlocks.slice();
    for (const car of cars) {
      const sample = sampleCourse(course, Math.max(0, car.s));
      let laneOffset = car.lane * sample.halfWidth;
      if (car.stopPull && !car.wreck) {
        const curb = car.stopPull * (sample.halfWidth - Math.max(1.7, (car.halfW || 0.95) + 0.5));
        laneOffset += (curb - laneOffset) * 0.7;
      }
      let aim = { swerving: false, bias: 0, life: null };
      let striking = false;
      if (!car.wreck) {
        aim = trafficSwerve({
          s: car.s,
          speed: car.speed,
          laneOffset,
          halfWidth: sample.halfWidth,
          player,
          actors: roadUsers,
        });
        if (!aim.swerving && player?.also) {
          for (const extra of player.also) {
            const next = trafficSwerve({
              s: car.s,
              speed: car.speed,
              laneOffset,
              halfWidth: sample.halfWidth,
              player: extra,
              actors: roadUsers,
            });
            if (next.swerving) {
              aim = next;
              break;
            }
          }
        }
        striking = !aim.swerving && !!(aim.life && vehicleHitsLife(car.id, aim.life.id));
        if (striking) {
          aim = trafficSwerve({
            s: car.s,
            speed: car.speed,
            laneOffset,
            halfWidth: sample.halfWidth,
            player,
            actors: roadUsers,
            yieldToLife: false,
          });
        }
        const rate = (aim.swerving ? 4.5 : 2.8) * dt;
        car.bias = (car.bias || 0) + (aim.bias - (car.bias || 0)) * Math.min(1, rate);
      }
      const limit = Math.max(0.3, sample.halfWidth - 1.3);
      const offset = car.wreck
        ? clampOffset(laneOffset + (car.wreck.shift || 0), limit)
        : clampOffset(laneOffset + car.bias, limit);
      if (!car.wreck) car.bias = offset - laneOffset;
      car.offset = offset;
      car.swerving = !!aim.swerving;
      car.striking = striking;
    }
    collideSweptCars(cars, parkedBlocks);
    for (const car of cars) {
      const sample = sampleCourse(course, Math.max(0, car.s));
      const offset = car.offset || 0;
      const halfL = car.halfL || 2.15;
      const halfW = car.halfW || 0.95;
      carBlocks.push({
        s: car.s,
        offset,
        halfL,
        halfW,
        speed: car.speed,
        swerving: car.swerving,
        striking: !!car.striking,
      });
      const travel = Math.abs(car.speed) > 0.4 ? car.speed : (car.cruise ?? car.speed);
      const dir = travel >= 0 ? 1 : -1;
      const frame = frameFromTangent(
        sample.forward.x * dir,
        sample.forward.y * dir,
        sample.forward.z * dir,
      );
      car.mesh.position.set(
        sample.x + sample.right.x * offset,
        sample.y,
        sample.z + sample.right.z * offset,
      );
      applyFrame(car.mesh, frame);
      for (const wheel of car.mesh.userData.wheels || []) wheel.rotation.x = car.roll;
      if (car.wreck) {
        const tilt = car.wreck.spin || 0;
        car.mesh.rotateZ(tilt);
        const roof = car.mesh.userData.roof || (car.kind === "bus" ? 2.72 : car.kind === "truck" ? 2.05 : 1.5);
        const lift = vehicleClearance(roof, halfW, tilt) + (car.wreck.hop || 0);
        car.mesh.position.x += frame.up.x * lift;
        car.mesh.position.y += frame.up.y * lift;
        car.mesh.position.z += frame.up.z * lift;
      }
      puffSmoke(car, time);
      puffExhaust(car.mesh, time);
      const slot = claim();
      fillSlot(slot, {
        id: car.id,
        kind: "car",
        x: car.mesh.position.x,
        z: car.mesh.position.z,
        halfL,
        halfW,
        fx: frame.forward.x,
        fz: frame.forward.z,
        rx: frame.right.x,
        rz: frame.right.z,
        s: car.s,
        offset,
        style: car.kind,
        speed: car.speed,
        wreck: car.wreck ? 1 : 0,
      });
    }

    const scenery = [];
    for (const chunk of chunks.values()) {
      for (const solid of chunk.solids || []) scenery.push(solid);
    }
    const crowd = [];
    for (const chunk of chunks.values()) {
      for (const actor of chunk.actors) {
        crowd.push({
          actor,
          s: actor.s,
          offset: actor.offset,
          radius: actor.radius || 0.42,
        });
      }
    }

    const avoid = carBlocks.slice();
    if (player && Number.isFinite(player.s)) {
      avoid.push({
        s: player.s,
        offset: player.offset,
        radius: player.radius ?? 0.5,
        halfL: 1.2,
      });
      for (const extra of player.also || []) avoid.push(extra);
    }

    function pinned(actor, offset) {
      const stood = { ...actor, offset };
      return overlappingPlayer(stood, player) || closingOn(stood, player);
    }

    function around(actor) {
      const blocks = scenery.slice();
      for (const body of crowd) {
        if (body.actor === actor) continue;
        blocks.push(body);
      }
      return blocks;
    }

    function evade(offset, s, dir, actor, blocks) {
      const shoved = clearOf(offset, s, dir, carBlocks);
      if (pinned(actor, shoved)) return shoved;
      const wide = clearOf(shoved, s, dir, avoid.concat(blocks));
      if (pinned(actor, wide)) return shoved;
      return lateralEvade(shoved, wide, dt);
    }

    function resolveActor(actor, blocks) {
      if (actor.fixed || actor.pose === "fallen" || actor.pose === "bounce") return;
      if (pinned(actor, actor.offset)) return;
      const resolved = separateCircle(actor.offset, actor.s, actor.radius || 0.42, blocks);
      const stood = { ...actor, s: resolved.s, offset: resolved.offset };
      if (overlappingPlayer(stood, player) || closingOn(stood, player)) return;
      actor.s = resolved.s;
      actor.offset = resolved.offset;
    }

    for (const chunk of chunks.values()) {
      for (const actor of chunk.actors) {
        if (actor.kind === "cone") {
          actor.cool = Math.max(0, (actor.cool || 0) - dt);
          if (actor.pose === "bounce" || (actor.pose === "fallen" && actor.lie != null)) stepBounce(actor, dt, carBlocks);
          if (actor.pose !== "bounce" && actor.cool <= 0) {
            const car = coneTouch(actor, carBlocks);
            if (car) {
              const away = Math.sign(actor.offset - car.offset) || (actor.offset >= 0 ? 1 : -1);
              beginFlight(actor, coneKick({
                along: Math.sign(car.speed || 1) || 1,
                side: away,
                force: Math.min(1, 0.4 + Math.abs(car.speed || 0) / 16),
              }));
              actor.cool = 0.8;
            }
          }
          refreshActor(actor, course, time);
          syncCone(actor);
          continue;
        }
        if ((actor.grace || 0) > 0) actor.grace = Math.max(0, actor.grace - dt);
        if (actor.pose === "bounce" || (actor.pose === "fallen" && actor.lie != null)) stepBounce(actor, dt, carBlocks);
        const blocks = around(actor);
        if (actor.pose === "walk") {
          const dir = actor.dir || 1;
          actor.s += dir * (actor.speed || 0) * dt;
          if (actor.s > chunk.s1 - 1) actor.dir = -1;
          if (actor.s < chunk.s0 + 1) actor.dir = 1;
          const sample = sampleCourse(course, actor.s);
          if (actor.kind === "animal" && sample.theme !== "country") {
            actor.dir = -(actor.dir || 1);
            actor.s += actor.dir * (actor.speed || 0) * dt * 2;
          }
          if (actor.kind === "animal") {
            actor.wander = (actor.wander ?? 4) - dt;
            if (actor.wander <= 0) {
              actor.trips = (actor.trips || 0) + 1;
              const roll = hashPercent(`${actor.id}|roam|${actor.trips}`);
              actor.wander = 6 + (roll % 8);
              const busy = chunk.actors.some((other) => other !== actor && other.kind === "animal" && other.visit != null);
              const target = animalRoamTarget(actor, sample, roll, busy);
              if (target != null && !roadPathOpen(actor.offset, target, actor.s, blocks)) {
                actor.visit = null;
                actor.wander = 1.2;
              } else {
                actor.visit = target;
              }
            }
          }
          const home = actor.kind === "animal" && actor.visit != null
            ? actor.visit
            : (actor.homeOffset ?? actor.offset);
          const pull = actor.kind === "animal" && actor.visit != null ? 1.6 : 0.8;
          const pulled = actor.offset + (home - actor.offset) * Math.min(1, dt * pull);
          const pulledClear = clearOf(pulled, actor.s, actor.dir || 1, blocks);
          let offset = Math.abs(pulledClear - pulled) > 0.04 ? actor.offset : pulled;
          offset = evade(offset, actor.s, actor.dir || 1, actor, blocks);
          const limit = sample.halfWidth + (actor.kind === "animal" ? 20 : 8);
          offset = Math.max(-limit, Math.min(limit, offset));
          if (!pinned(actor, offset) && stillBlocked(offset, actor.s, actor.dir || 1, avoid.concat(blocks))) {
            actor.stuck = (actor.stuck || 0) + dt;
            if (actor.stuck > 0.45) {
              actor.dir = -(actor.dir || 1);
              actor.stuck = 0;
              offset = evade(offset, actor.s, actor.dir, actor, blocks);
              offset = Math.max(-limit, Math.min(limit, offset));
            }
          } else {
            actor.stuck = 0;
          }
          actor.offset = offset;
        } else if (actor.pose === "cross") {
          const sample = sampleCourse(course, actor.s);
          const travel = Math.cos(actor.phase || 0) >= 0 ? 1 : -1;
          const desired = Math.sin(actor.phase || 0) * (sample.halfWidth - 1.3);
          const shoved = clearOf(desired, actor.s, travel, carBlocks);
          if (Math.abs(shoved - desired) > 0.08) {
            actor.offset = shoved;
          } else if (!pinned(actor, desired)) {
            const dodge = clearOf(desired, actor.s, travel, avoid.concat(blocks));
            if (Math.abs(dodge - desired) > 0.08) {
              actor.offset = lateralEvade(actor.offset, dodge, dt);
            } else {
              actor.phase = (actor.phase || 0) + dt * 0.45;
              actor.offset = Math.sin(actor.phase) * (sample.halfWidth - 1.3);
            }
          }
        }
        resolveActor(actor, blocks);
        for (const body of crowd) {
          if (body.actor !== actor) continue;
          body.s = actor.s;
          body.offset = actor.offset;
          break;
        }
        if (actor.pose !== "fallen" && actor.pose !== "bounce") {
          const car = personHitByCar(actor, carBlocks);
          const response = car && strikeResponse(actor, car);
          if (response === "launch") beginBounce(actor, car);
          else if (response === "slide") slideAside(actor, car);
        }
        if (actor.fixed) {
          if (actor.group?.userData?.limbs) animatePerson(actor.group, time);
        } else {
          refreshActor(actor, course, time);
        }
        const sample = sampleCourse(course, actor.s);
        const point = actor.fixed
          ? {
              x: sample.x + sample.right.x * actor.offset,
              z: sample.z + sample.right.z * actor.offset,
            }
          : { x: actor.group.position.x, z: actor.group.position.z };
        const slot = claim();
        fillSlot(slot, {
          id: actor.id,
          kind: actor.kind || "person",
          x: point.x,
          z: point.z,
          radius: actor.radius || (actor.kind === "animal" ? 0.6 : 0.42),
          s: actor.s,
          offset: actor.offset,
        });
      }
    }

    hazards.length = count;
    return hazards;
  }

  function clear() {
    for (const chunk of chunks.values()) disposeRoot(chunk.root);
    chunks.clear();
    hazards.length = 0;
    for (const car of cars) {
      car.s = car.homeS;
      car.lane = car.homeLane;
      car.cruise = car.homeCruise;
      car.speed = car.homeCruise;
      car.bias = 0;
      car.swerving = false;
      car.dwell = 0;
      car.hold = 0;
      car.served = null;
      car.stopPull = 0;
      car.wreck = null;
      car.striking = false;
      car.crash = null;
      if (car.mesh?.userData?.smoke) car.mesh.userData.smoke.group.visible = false;
      if (car.mesh?.userData?.exhaustFx) car.mesh.userData.exhaustFx.group.visible = false;
    }
  }

  return { update, clear, noteHits };
}
