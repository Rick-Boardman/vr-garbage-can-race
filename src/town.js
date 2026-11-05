// Streaming low-poly blocks along the downhill. Props and colliders share
// the course frame: local -z is travel, local +x is sample.right.

import { applyFrame } from "./frame.js";
import { frameFromTangent, sampleCourse, wrapAngle } from "./course.js";
import { edgesAlong, ribbonGeometry } from "./road.js";
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

// Cars in one lane keep LANE_GAP meters. The leader is the one further along its travel.
export function separateLane(cars) {
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
      if (oncoming) {
        if (follow.s < lead.s + LANE_GAP) {
          follow.s = lead.s + LANE_GAP;
          follow.speed = Math.max(follow.speed, lead.speed);
        }
      } else if (follow.s > lead.s - LANE_GAP) {
        follow.s = lead.s - LANE_GAP;
        follow.speed = Math.min(follow.speed, lead.speed);
      }
    }
  }
}
import { animatePerson } from "./props.js";

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

export function createTown(THREE, scene, materials, props) {
  const chunks = new Map();
  const hazards = [];
  const box = new THREE.BoxGeometry(1, 1, 1);
  const disc = layFlat(new THREE.CircleGeometry(1, 10));
  box.userData.shared = true;
  disc.userData.shared = true;

  const asphalt = materials.lambert(0x3c4148, { flat: true });
  const sidewalkMat = materials.lambert(0xc8c2b6, { flat: true });
  const grassMat = materials.lambert(0x4f9a3c, { flat: true });
  const yellow = materials.lambert(0xe6c84a, { flat: true });
  const white = materials.lambert(0xf4f6f8, { flat: true });
  const potholeMat = materials.lambert(0x17191c, { flat: true });

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
      const yard = span(
        (sample) => sample.halfWidth + 3.05,
        (sample) => sample.halfWidth + 22,
      );
      const edge = span(
        (sample) => sample.halfWidth - 0.42,
        (sample) => sample.halfWidth - 0.28,
      );
      addRibbon(root, samples, walk.left, walk.right, 0.14, sidewalkMat);
      addRibbon(root, samples, yard.left, yard.right, 0, grassMat);
      addRibbon(root, samples, edge.left, edge.right, 0.02, white);
    }
    addRibbon(root, samples, -0.08, 0.08, 0.025, yellow);

    const actors = [];
    const staticHazards = [];
    let serial = 0;
    const nextId = (kind) => `${kind}-${index}-${serial++}`;

    function boxHazard(id, kind, sample, offset, frame, halfL, halfW) {
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
      });
    }

    function circleHazard(id, kind, sample, offset, radius) {
      staticHazards.push({
        id,
        kind,
        x: sample.x + sample.right.x * offset,
        z: sample.z + sample.right.z * offset,
        radius,
        halfL: null,
      });
    }

    const spacing = theme === "downtown" ? 22 : theme === "market" ? 18 : 16;
    for (let s = s0 + spacing * 0.45; s < s1 - 2; s += spacing) {
      for (const side of [-1, 1]) {
        if (theme === "downtown" && rand() < 0.18) continue;
        const sample = sampleCourse(course, s);
        let building;
        if (theme === "neighborhood") building = props.createHouse(rand);
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
        if (theme === "neighborhood") {
          const fence = props.createFence((building.userData.width || 6) * 0.85);
          place(root, fence, sample, side * (front - 0.45), 0, frame);
          if (rand() > 0.4) {
            const hydrant = props.createHydrant();
            place(root, hydrant, sample, side * (sample.halfWidth + 0.55), 0.14, upright(sample, 1));
          }
        }
      }
    }

    const sign = props.createSign(mid.name);
    place(root, sign, samples[1] || mid, mid.halfWidth + SIDEWALK_CENTER, 0.14, faceStreet(mid, 1));

    if (theme === "market" && rand() > 0.35) {
      const stop = props.createBusStop();
      const at = sampleCourse(course, s0 + 14);
      place(root, stop, at, -(at.halfWidth + SIDEWALK_CENTER), 0.14, faceStreet(at, -1));
    }

    for (let s = s0 + 6; s < s1; s += 11) {
      const side = rand() > 0.5 ? 1 : -1;
      const sample = sampleCourse(course, s);
      if (rand() > 0.45) {
        const tree = props.createTree(rand);
        place(root, tree, sample, side * (sample.halfWidth + 3.6), 0, upright(sample, 1));
      } else {
        const lamp = props.createLamp();
        place(root, lamp, sample, side * (sample.halfWidth + 0.42), 0.14, armTowardStreet(sample, side));
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
    if (bend < 0.12 && Math.abs(crossS - START_S) > 14) {
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
      if (rand() > 0.42) continue;
      const side = rand() > 0.5 ? 1 : -1;
      const sample = sampleCourse(course, s);
      const style = rand() > 0.82 ? "taxi" : rand() > 0.55 ? "stripe" : "plain";
      const car = props.createCar(rand, style);
      const dir = rand() > 0.5 ? 1 : -1;
      const frame = frameFromTangent(sample.forward.x * dir, sample.forward.y * dir, sample.forward.z * dir);
      // Outer lane, wheels at the curb. Traffic uses ±0.36 of the half-width and misses these.
      const offset = side * (sample.halfWidth - 1.15);
      place(root, car, sample, offset, 0, frame);
      boxHazard(nextId("parked"), "car", sample, offset, frame, 2.15, 0.95);
      parked.push({ s, side });
    }

    for (let s = s0 + 12; s < s1; s += 16) {
      if (s < START_S + 16 || rand() > 0.62) continue;
      const sample = sampleCourse(course, s);
      const offset = (rand() - 0.5) * sample.halfWidth * 0.85;
      const hole = new THREE.Mesh(disc, potholeMat);
      hole.scale.set(1.15, 1, 0.8);
      place(root, hole, sample, offset, 0.03, upright(sample, 1));
      circleHazard(nextId("pothole"), "pothole", sample, offset, 0.7);
    }

    for (let s = s0 + 20; s < s1; s += 24) {
      if (s < START_S + 22 || rand() > 0.5) continue;
      const sample = sampleCourse(course, s);
      const offset = (rand() > 0.5 ? 1 : -1) * (sample.halfWidth * 0.45);
      const kind = rand() > 0.5 ? "cone" : "crate";
      const prop = kind === "cone" ? props.createCone() : props.createCrate(rand);
      place(root, prop, sample, offset, 0, upright(sample, 1));
      circleHazard(nextId(kind), kind, sample, offset, kind === "crate" ? 0.45 : 0.32);
    }

    const poses = ["walk", "talk", "sit", "cross", "phone", "walk"];
    let personCount = 0;
    for (let s = s0 + 5; s < s1 && personCount < 6; s += 7) {
      if (rand() > 0.72) continue;
      const pose = poses[Math.floor(rand() * poses.length)];
      const side = rand() > 0.5 ? 1 : -1;
      const sample = sampleCourse(course, s);
      if (pose !== "cross" && parked.some((car) => car.side === side && Math.abs(car.s - s) < 3.4)) continue;
      const sidewalk = side * (sample.halfWidth + SIDEWALK_CENTER);
      if (pose === "cross" && s < START_S + 24) continue;
      const person = props.createPerson(rand, pose === "cross" ? "walk" : pose);
      person.userData.pose = pose === "cross" ? "walk" : pose;
      const lift = pose === "sit" ? 0.5 : 0.14;
      place(root, person, sample, pose === "cross" ? 0 : sidewalk, lift, upright(sample, 1));
      if (pose === "sit") {
        const bench = props.createBench();
        place(root, bench, sample, sidewalk, 0.14, faceStreet(sample, side));
      }
      if (pose === "talk") {
        const friend = props.createPerson(rand, "talk");
        place(root, friend, sampleCourse(course, s + 0.9), sidewalk, 0.14, upright(sample, -1));
        actors.push({
          group: friend,
          pose: "talk",
          s: s + 0.9,
          offset: sidewalk,
          dir: -1,
          speed: 0,
        });
      }
      if (theme === "market" && pose === "sit") {
        const cafe = props.createCafe(rand);
        place(root, cafe, sample, sidewalk + side * 0.8, 0.14, upright(sample, 1));
      }
      actors.push({
        group: person,
        pose,
        s,
        offset: pose === "cross" ? 0 : sidewalk,
        dir: rand() > 0.5 ? 1 : -1,
        speed: 0.7 + rand() * 0.7,
        phase: rand() * Math.PI * 2,
      });
      personCount += 1;
    }

    scene.add(root);
    return { index, s0, s1, root, actors, staticHazards };
  }

  function disposeRoot(root) {
    root.traverse((object) => {
      if (object.geometry && !object.geometry.userData.shared) object.geometry.dispose();
    });
    scene.remove(root);
  }

  function ensureCars(course) {
    if (cars.length || !course) return;
    const rand = mulberry32((course.seed ^ 0x51ed) >>> 0);
    for (let index = 0; index < 5; index += 1) {
      const oncoming = index % 2 === 1;
      const style = index === 0 ? "taxi" : index === 2 ? "stripe" : "plain";
      const mesh = props.createCar(rand, style);
      scene.add(mesh);
      cars.push({
        id: `traffic-${index}`,
        mesh,
        s: START_S + 58 + index * 34,
        lane: oncoming ? -0.36 : 0.36,
        speed: oncoming ? -(8 + index * 1.4) : 6.5 + index * 1.5,
        roll: rand() * 4,
      });
    }
  }

  function recycleCar(car, rideS, rand) {
    const oncoming = rand() > 0.5;
    car.lane = oncoming ? -0.36 : 0.36;
    car.s = rideS + 80 + rand() * 70;
    car.speed = oncoming ? -(8 + rand() * 6) : 6 + rand() * 8;
  }

  function update(course, rideS, dt, time) {
    const first = Math.floor((rideS - BEHIND) / CHUNK_LENGTH);
    const last = Math.floor((rideS + AHEAD) / CHUNK_LENGTH);
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

    for (const chunk of chunks.values()) {
      for (const hazard of chunk.staticHazards) {
        const slot = claim();
        slot.id = hazard.id;
        slot.kind = hazard.kind;
        slot.x = hazard.x;
        slot.z = hazard.z;
        slot.radius = hazard.radius;
        slot.halfL = hazard.halfL ?? null;
        slot.halfW = hazard.halfW;
        slot.fx = hazard.fx;
        slot.fz = hazard.fz;
        slot.rx = hazard.rx;
        slot.rz = hazard.rz;
      }
      for (const actor of chunk.actors) {
        if (actor.pose === "walk") {
          actor.s += actor.dir * actor.speed * dt;
          if (actor.s > chunk.s1 - 1) actor.dir = -1;
          if (actor.s < chunk.s0 + 1) actor.dir = 1;
        } else if (actor.pose === "cross") {
          actor.phase += dt * 0.45;
        }
        const sample = sampleCourse(course, actor.s);
        let offset = actor.offset;
        if (actor.pose === "cross") offset = Math.sin(actor.phase) * (sample.halfWidth - 1.3);
        const frame = upright(sample, actor.pose === "cross" ? Math.cos(actor.phase) : actor.dir || 1);
        actor.group.position.set(
          sample.x + sample.right.x * offset,
          sample.y + (actor.pose === "sit" ? 0.5 : 0.14),
          sample.z + sample.right.z * offset,
        );
        applyFrame(actor.group, frame);
        animatePerson(actor.group, time);
        const slot = claim();
        slot.id = `person-${actor.group.uuid}`;
        slot.kind = "person";
        slot.x = actor.group.position.x;
        slot.z = actor.group.position.z;
        slot.radius = 0.42;
        slot.halfL = null;
      }
    }

    ensureCars(course);
    const rand = mulberry32(((course.seed + Math.floor(time * 10)) ^ 0x9e37) >>> 0);
    for (const car of cars) {
      car.s += car.speed * dt;
      car.roll += Math.abs(car.speed) * dt * 1.6;
      if (car.s < rideS - 45 || car.s > rideS + 190) recycleCar(car, rideS, rand);
    }
    separateLane(cars);
    for (const car of cars) {
      const sample = sampleCourse(course, Math.max(0, car.s));
      const offset = car.lane * sample.halfWidth;
      const dir = car.speed >= 0 ? 1 : -1;
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
      const slot = claim();
      slot.id = car.id;
      slot.kind = "car";
      slot.x = car.mesh.position.x;
      slot.z = car.mesh.position.z;
      slot.halfL = 2.15;
      slot.halfW = 0.95;
      slot.fx = frame.forward.x;
      slot.fz = frame.forward.z;
      slot.rx = frame.right.x;
      slot.rz = frame.right.z;
      slot.radius = null;
    }

    hazards.length = count;
    return hazards;
  }

  function clear() {
    for (const chunk of chunks.values()) disposeRoot(chunk.root);
    chunks.clear();
    hazards.length = 0;
    for (let index = 0; index < cars.length; index += 1) {
      const oncoming = index % 2 === 1;
      cars[index].s = START_S + 58 + index * 34;
      cars[index].lane = oncoming ? -0.36 : 0.36;
      cars[index].speed = oncoming ? -(8 + index) : 6.5 + index * 1.5;
    }
  }

  return { update, clear };
}
