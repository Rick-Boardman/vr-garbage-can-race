import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { branchCenter, carriageCenter, createCourse, checkCourseFrame, forkAt, frameFromTangent, headingYaw, holdCarriage, sampleCourse, stayOnRoute, wrapAngle } from "../src/course.js";
import { checkRibbonFacesUp } from "../src/road.js";
import { applyFrame } from "../src/frame.js";
import {
  footDragStick,
  inputFromHands,
  inputFromKeys,
  inputFromLook,
  inputFromTilt,
  onFootJump,
  onFootSteer,
  selectRideInput,
  tiltAxes,
} from "../src/input.js";
import { createRideState, restCanTilt, stepRide, walkerForward } from "../src/drive.js";
import { canGroundClearance, createRider } from "../src/rider.js";
import { BUILDING_SETBACK, DISTRICT_LENGTH, START_S } from "../src/constants.js";
import {
  busPace,
  clearOf,
  closingOn,
  facadePush,
  faceStreet,
  HOUSE_YARD_SETBACK,
  lateralEvade,
  launchVelocity,
  layFlat,
  overlappingPlayer,
  personHitByCar,
  recoverCruise,
  animalRoamTarget,
  clampBusBias,
  collideSweptCars,
  holdCarsForFoot,
  holdCarsForLine,
  packTraffic,
  releaseBus,
  roadPathOpen,
  separateLane,
  signFrame,
  startVehicleWreck,
  stepVehicleWreck,
  strikeResponse,
  trafficSwerve,
  vehicleBodiesOverlap,
  vehicleClearance,
  separateCircle,
  stepFallen,
  TRAFFIC_FLEET,
  vehicleHitsLife,
  vehicleMayHit,
  yardFenceLine,
  yardGradeShear,
  slopeWithGrade,
  createTown,
} from "../src/town.js";
import { createMaterials } from "../src/materials.js";
import { AWNING_PITCH, BENCH, SIGN_BOARD_Z, SIGN_POLE_Z, SITTER, animatePerson, createFlop, createProps, onFootPose, poseForTravel, stepFlop } from "../src/props.js";
import { createDaylight } from "../src/daylight.js";
import { releasedLook, tumbleLook, undoTouchYaw } from "../src/look.js";

test("the hill drops and the frame stays right-handed", () => {
  const course = createCourse(7);
  const errors = checkCourseFrame(course);
  assert.deepEqual(errors, []);
  const start = sampleCourse(course, 0);
  const later = sampleCourse(course, 80);
  assert.ok(later.y < start.y - 3);
  assert.ok(Math.abs(headingYaw(0, -1)) < 1e-6);
  assert.ok(Math.abs(headingYaw(1, 0) + Math.PI / 2) < 1e-6);
  const again = sampleCourse(createCourse(7), 80);
  assert.ok(Math.abs(again.x - later.x) < 1e-6);
  assert.ok(Math.abs(again.z - later.z) < 1e-6);
});

test("routes diverge and then meet again", () => {
  const course = createCourse(7);
  const forks = [];
  let open = null;
  for (let s = 0; s < 1800; s += 2) {
    const fork = forkAt(course, s);
    const on = fork.median > 0.05;
    if (on && !open) open = { index: fork.index, start: s, peak: fork.median, peakS: s };
    if (on && open) {
      if (fork.median >= open.peak) {
        open.peak = fork.median;
        open.peakS = s;
      }
    }
    if (!on && open) {
      open.end = s;
      forks.push(open);
      open = null;
    }
  }
  assert.ok(forks.length >= 3, `expected several forks, saw ${forks.length}`);
  for (const fork of forks) {
    assert.equal(forkAt(course, fork.start - 4).median, 0);
    assert.ok(forkAt(course, fork.end).median < 0.05);
    assert.ok(fork.peak > 1.4, `fork ${fork.index} peak ${fork.peak}`);
    const at = sampleCourse(course, fork.peakS);
    const road = at.halfWidth - at.fork.median;
    assert.ok(at.fork.split > 0.95, `peak split ${at.fork.split}`);
    assert.ok(road >= 10.6 && road <= 16.2, `full road ${road}`);
    const mid = (at.fork.median + at.halfWidth) / 2;
    assert.ok(Math.abs(carriageCenter(at, 1) - mid) < 0.2, `right lane ${carriageCenter(at, 1)} mid ${mid}`);
    assert.equal(at.fork.index, fork.index);
    assert.ok(Math.abs(at.right.y) < 1e-4);
    const left = carriageCenter(at, -1);
    const right = carriageCenter(at, 1);
    assert.ok(left < -at.fork.median);
    assert.ok(right > at.fork.median);
    assert.ok(holdCarriage(at, 0, 1) > at.fork.median);
    assert.ok(holdCarriage(at, 0, -1) < -at.fork.median);
    const again = forkAt(createCourse(7), fork.peakS);
    assert.ok(Math.abs(again.median - fork.peak) < 1e-6);
  }
  for (let i = 1; i < forks.length; i += 1) {
    assert.ok(forks[i].start > forks[i - 1].end);
    assert.ok(forks[i].index !== forks[i - 1].index);
  }

  const nose = stayOnRoute({ fork: { median: 1.2, split: 1 }, halfWidth: 6 }, 0, 0, -1);
  assert.ok(nose.offset < -1);
  const rightNose = stayOnRoute({ fork: { median: 1.2, split: 1 }, halfWidth: 6 }, 0, 0, 0);
  assert.ok(rightNose.offset > 1);
  const plain = stayOnRoute({ fork: { median: 0, split: 0 }, halfWidth: 6 }, 0.2, 0.4, 0);
  assert.equal(plain.offset, 0.2);

  const peak = forks[0];
  const leftRide = createRideState(peak.peakS - 24);
  leftRide.offset = -1;
  leftRide.speed = 14;
  let leftSeen = null;
  for (let guard = 0; guard < 80 && leftRide.s < peak.peakS + 8; guard += 1) {
    stepRide(leftRide, {
      dt: 0.05,
      steer: -1,
      throttle: 1,
      sample: sampleCourse(course, leftRide.s),
      hazards: [],
    });
    const here = sampleCourse(course, leftRide.s);
    if (here.fork.median > 1) {
      assert.ok(leftRide.offset < -here.fork.median, `left road ${leftRide.offset} median ${here.fork.median}`);
      leftSeen = leftRide.offset;
    }
  }
  assert.ok(leftSeen < 0);

  const rightRide = createRideState(peak.peakS - 30);
  rightRide.offset = 0;
  rightRide.speed = 16;
  let rightSeen = null;
  for (let guard = 0; guard < 90 && rightRide.s < peak.peakS + 8; guard += 1) {
    stepRide(rightRide, {
      dt: 0.05,
      steer: 0,
      throttle: 1,
      sample: sampleCourse(course, rightRide.s),
      hazards: [],
    });
    const here = sampleCourse(course, rightRide.s);
    if (here.fork.median > 1) {
      assert.ok(rightRide.offset > here.fork.median, `right road ${rightRide.offset} median ${here.fork.median}`);
      rightSeen = rightRide.offset;
    }
  }
  assert.ok(rightSeen > 0);

  const joined = sampleCourse(course, peak.end + 20);
  assert.equal(joined.fork.median, 0);
  const home = createRideState(joined.s);
  home.offset = 0.15;
  home.speed = 8;
  stepRide(home, { dt: 0.05, steer: 0, throttle: 1, sample: joined, hazards: [] });
  assert.ok(Math.abs(home.offset) < 0.5);
});

test("a split-road dash sits in the middle of that road and points along it", () => {
  const course = createCourse(7);
  let opening = 0;
  for (let s = 110; s < 500; s += 1) {
    const sample = sampleCourse(course, s);
    if (sample.fork.median > 1.2 && sample.fork.split < 0.55) {
      opening = s;
      break;
    }
  }
  const here = sampleCourse(course, opening);
  const center = (here.fork.median + here.halfWidth) / 2;
  assert.ok(Math.abs(branchCenter(here, 1) - center) < 0.05, `right ${branchCenter(here, 1)} center ${center}`);
  assert.ok(Math.abs(branchCenter(here, -1) + center) < 0.05);
  assert.ok(Math.abs(carriageCenter(here, 1) - center) > 0.8, "the lane blend is still in the grass");
  const plain = sampleCourse(course, 40);
  assert.ok(plain.fork.median < 0.05);
  assert.ok(Math.abs(branchCenter(plain, 1) - plain.halfWidth * 0.32) < 1e-6);

  const back = sampleCourse(course, opening - 1.15);
  const fore = sampleCourse(course, opening + 1.15);
  const point = (sample, side) => {
    const offset = branchCenter(sample, side);
    return {
      x: sample.x + sample.right.x * offset,
      z: sample.z + sample.right.z * offset,
    };
  };
  const a = point(back, 1);
  const b = point(fore, 1);
  const chord = frameFromTangent(b.x - a.x, 0, b.z - a.z);
  const along = here.forward.x * chord.forward.x + here.forward.z * chord.forward.z;
  assert.ok(along < 0.995, `dash still follows the shared centerline ${along}`);
  const midX = (a.x + b.x) * 0.5;
  const midZ = (a.z + b.z) * 0.5;
  const lateral = (midX - here.x) * here.right.x + (midZ - here.z) * here.right.z;
  assert.ok(Math.abs(lateral - center) < 0.35, `dash left the carriageway ${lateral} vs ${center}`);
});

test("road ribbons face up on the flat and on a slope", () => {
  assert.deepEqual(checkRibbonFacesUp(), []);
});

test("applyFrame maps local -z to forward and local +x to right", () => {
  const object = new THREE.Object3D();
  const tangent = frameFromTangent(0, -0.16, -1);
  applyFrame(object, tangent);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(object.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(object.quaternion);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(object.quaternion);
  const frameForward = new THREE.Vector3(tangent.forward.x, tangent.forward.y, tangent.forward.z);
  const frameUp = new THREE.Vector3(tangent.up.x, tangent.up.y, tangent.up.z);
  const frameRight = new THREE.Vector3(tangent.right.x, tangent.right.y, tangent.right.z);
  assert.ok(forward.dot(frameForward) > 0.999);
  assert.ok(up.dot(frameUp) > 0.999);
  assert.ok(right.dot(frameRight) > 0.999);

  const flat = {
    forward: { x: 1, y: 0, z: 0 },
    right: { x: 0, y: 0, z: 1 },
    up: { x: 0, y: 1, z: 0 },
  };
  applyFrame(object, flat);
  const facing = new THREE.Vector3(0, 0, -1).applyQuaternion(object.quaternion);
  const side = new THREE.Vector3(1, 0, 0).applyQuaternion(object.quaternion);
  assert.ok(facing.dot(new THREE.Vector3(1, 0, 0)) > 0.999);
  assert.ok(side.dot(new THREE.Vector3(0, 0, 1)) > 0.999);
});

test("hands, tilt, and keys steer with the documented signs", () => {
  const left = inputFromHands({ leftY: 1, rightY: 1.3, headY: 1.6 });
  assert.ok(left.steer < 0);
  const tuck = inputFromHands({ leftY: 0.8, rightY: 0.85, headY: 1.6 });
  assert.ok(tuck.throttle > 0);
  const brake = inputFromHands({ leftY: 1.7, rightY: 1.72, headY: 1.6 });
  assert.ok(brake.throttle < 0);

  // Full per-angle coverage is in tests/tilt.test.mjs.
  const portrait = tiltAxes({ beta: 0, gamma: 18, screenAngle: 0 });
  assert.ok(Math.abs(portrait.steerDeg - 18) < 1e-9);
  const tilted = inputFromTilt({ steerDeg: 24, leanDeg: 22, neutralSteer: 0, neutralLean: 0 });
  assert.ok(tilted.steer > 0.9);
  assert.ok(tilted.throttle > 0.9);

  assert.ok(inputFromKeys({ keys: new Set(["A"]) }).steer < 0);
  assert.ok(inputFromKeys({ keys: new Set(["D"]) }).steer > 0);
  assert.equal(inputFromKeys({ keys: new Set(["W"]) }).throttle, 1);
  assert.equal(inputFromKeys({ keys: new Set(["S"]) }).throttle, -1);
  assert.equal(inputFromKeys({ keys: new Set(["Shift"]) }).throttle, 1);
  assert.equal(inputFromKeys({ keys: new Set(["X"]) }).throttle, 0);
  assert.equal(inputFromKeys({ keys: new Set(), autoWalk: true }).throttle, 1);
  assert.equal(inputFromKeys({ keys: new Set(), autoWalk: false }).throttle, 0);
});

test("a stop stays stopped until throttle asks to go", () => {
  const course = createCourse(7);
  const at = sampleCourse(course, 80);
  const hill = { ...at, slope: 0.25 };
  const parked = createRideState(80);
  parked.speed = 0;
  stepRide(parked, { dt: 0.05, steer: 0, throttle: 0, sample: hill, hazards: [] });
  assert.equal(parked.speed, 0);
  stepRide(parked, { dt: 0.05, steer: 0, throttle: 1, sample: hill, hazards: [] });
  assert.ok(parked.speed > 0.2, `tuck from a stop ${parked.speed}`);

  const rolling = createRideState(80);
  const before = rolling.speed;
  stepRide(rolling, { dt: 0.05, steer: 0, throttle: 0, sample: hill, hazards: [] });
  assert.ok(rolling.speed > before - 0.5, `a rolling can was parked at ${rolling.speed}`);

  const onFoot = createRideState(80);
  onFoot.speed = 12;
  stepRide(onFoot, {
    dt: 0.05,
    steer: 0,
    throttle: 0,
    sample: at,
    hazards: [{ id: "truck", kind: "car", x: at.x, z: at.z, radius: 3 }],
  });
  assert.ok(onFoot.eject);
  onFoot.eject.bodyHop = 0;
  onFoot.eject.bodyVy = 0;
  onFoot.eject.bodySpin = 0;
  onFoot.eject.bodyRoll = 0;
  onFoot.eject.bodyAlong = 0.8;
  onFoot.eject.bodyLat = 0.4;
  onFoot.eject.canS = onFoot.eject.bodyS + 30;
  const stoodAt = onFoot.eject.bodyS;
  stepRide(onFoot, {
    dt: 0.05,
    steer: 0,
    throttle: 0,
    strafe: 0,
    sample: sampleCourse(course, onFoot.s),
    hazards: [],
  });
  assert.equal(onFoot.eject.bodyAlong, 0);
  assert.equal(onFoot.eject.bodyLat, 0);
  const planted = onFoot.eject.bodyS;
  stepRide(onFoot, {
    dt: 0.05,
    steer: 0,
    throttle: 0,
    sample: sampleCourse(course, onFoot.s),
    hazards: [],
  });
  assert.equal(onFoot.eject.bodyS, planted, `slid from ${stoodAt} to ${onFoot.eject.bodyS}`);
  stepRide(onFoot, {
    dt: 0.05,
    steer: 0,
    throttle: 1,
    sample: sampleCourse(course, onFoot.s),
    hazards: [],
  });
  assert.notEqual(onFoot.eject.bodyS, planted);
  const look = inputFromLook(0.5, 0.38);
  assert.ok(look.steer < 0);
  assert.ok(look.throttle < 0);
  const mixed = inputFromKeys({
    keys: new Set(["D"]),
    lookSteer: { steer: -1, throttle: 1 },
  });
  assert.equal(mixed.steer, 1);
  assert.equal(mixed.throttle, 1);

  const hands = { steer: -0.4, throttle: 0.5 };
  const tilt = { steer: 0.2, throttle: -0.3 };
  const keys = { steer: 1, throttle: 0 };
  assert.equal(selectRideInput({ presenting: true, hands, tilt, keys }).source, "vr");
  assert.equal(selectRideInput({ presenting: false, hands: null, tilt, keys, preferTilt: true }).source, "tilt");
  assert.equal(selectRideInput({ presenting: false, hands: null, tilt, keys, preferTilt: false }).source, "keys");
  assert.equal(selectRideInput({
    presenting: false,
    hands: null,
    tilt,
    keys: { steer: 0, throttle: 0 },
  }).source, "tilt");
});

test("steering left drifts left, tuck outruns brake, and hits count once", () => {
  const course = createCourse(7);
  const steer = createRideState(START_S);
  for (let step = 0; step < 30; step += 1) {
    stepRide(steer, {
      dt: 0.05,
      steer: -1,
      throttle: 0,
      sample: sampleCourse(course, steer.s),
      hazards: [],
    });
  }
  assert.ok(steer.offset < -0.4, `offset ${steer.offset}`);

  function roll(throttle) {
    const state = createRideState(START_S);
    for (let step = 0; step < 40; step += 1) {
      stepRide(state, {
        dt: 0.05,
        steer: 0,
        throttle,
        sample: sampleCourse(course, state.s),
        hazards: [],
      });
    }
    return state;
  }
  const tucked = roll(1);
  const braked = roll(-1);
  assert.ok(tucked.speed > braked.speed);
  assert.ok(tucked.s > braked.s);

  const crash = createRideState(START_S);
  const at = sampleCourse(course, crash.s);
  const wall = {
    id: "person-test",
    kind: "person",
    x: at.x,
    z: at.z,
    radius: 50,
  };
  stepRide(crash, { dt: 0.05, steer: 0, throttle: 0, sample: at, hazards: [wall] });
  assert.equal(crash.crashes, 1);
  const moved = sampleCourse(course, crash.s);
  stepRide(crash, { dt: 0.05, steer: 0, throttle: 0, sample: moved, hazards: [wall] });
  assert.equal(crash.crashes, 1);

  const bump = createRideState(START_S);
  const holeAt = sampleCourse(course, bump.s);
  const hole = { id: "hole-test", kind: "pothole", x: holeAt.x, z: holeAt.z, radius: 2 };
  const before = bump.speed;
  stepRide(bump, { dt: 0.05, steer: 0, throttle: 0, sample: holeAt, hazards: [hole] });
  assert.equal(bump.crashes, 0);
  assert.equal(bump.bumps, 1);
  assert.ok(bump.speed < before);

  const miss = createRideState(START_S);
  const missAt = sampleCourse(course, miss.s);
  const beside = {
    id: "car-beside",
    kind: "car",
    x: missAt.x + missAt.right.x * 2,
    z: missAt.z + missAt.right.z * 2,
    halfL: 2.15,
    halfW: 0.95,
    fx: missAt.forward.x,
    fz: missAt.forward.z,
    rx: missAt.right.x,
    rz: missAt.right.z,
  };
  stepRide(miss, { dt: 0.05, steer: 0, throttle: 0, sample: missAt, hazards: [beside] });
  stepRide(miss, { dt: 0.05, steer: 0, throttle: 0, sample: sampleCourse(course, miss.s), hazards: [beside] });
  assert.equal(miss.crashes, 0);
  assert.equal(miss.nearMisses, 1);

  const pinned = createRideState(START_S);
  const pinAt = sampleCourse(course, pinned.s);
  const pile = { id: "pile", kind: "car", x: pinAt.x, z: pinAt.z, radius: 8 };
  for (let hit = 0; hit < 8; hit += 1) {
    pinned.hitCooldown = {};
    stepRide(pinned, { dt: 0.05, steer: 0, throttle: 0, sample: sampleCourse(course, pinned.s), hazards: [pile] });
  }
  assert.ok(pinned.speed >= 3.2, `speed pinned at ${pinned.speed}`);
});

test("a straight facade stays put and a bowed curb pushes it back", () => {
  const right = { x: 1, y: 0, z: 0 };
  const sample = {
    x: 0, z: 0, halfWidth: 6,
    forward: { x: 0, y: 0, z: -1 },
    right,
  };
  const straight = { x: 0, z: -6, right, halfWidth: 6 };
  assert.equal(facadePush(sample, 1, [straight]), 0);
  const bowed = { x: 2, z: -6, right, halfWidth: 6 };
  const extra = facadePush(sample, 1, [bowed]);
  assert.ok(Math.abs(extra - 2) < 1e-6, `extra ${extra}`);
});

test("cars in one lane keep nine meters between them", () => {
  const cars = [
    { lane: 0.36, s: 100, speed: 8 },
    { lane: 0.36, s: 104, speed: 14 },
    { lane: -0.36, s: 50, speed: -6 },
    { lane: -0.36, s: 54, speed: -12 },
  ];
  separateLane(cars);
  const down = cars.filter((car) => car.lane > 0).sort((a, b) => a.s - b.s);
  const up = cars.filter((car) => car.lane < 0).sort((a, b) => a.s - b.s);
  assert.ok(down[1].s - down[0].s >= 9);
  assert.ok(down[0].speed <= 8);
  assert.ok(up[1].s - up[0].s >= 9);
  assert.ok(up[1].speed >= -6);
});

test("a pothole disc lies on the road", () => {
  const disc = layFlat(new THREE.CircleGeometry(1, 8));
  const position = disc.attributes.position;
  let maxY = 0;
  for (let index = 0; index < position.count; index += 1) {
    maxY = Math.max(maxY, Math.abs(position.getY(index)));
  }
  assert.ok(maxY < 1e-6, `disc still has height ${maxY}`);
  assert.ok(disc.attributes.normal.getY(0) > 0.9);
});

test("an oil slick kicks the can sideways and is not a crash", () => {
  const course = createCourse(7);
  const state = createRideState(START_S);
  const at = sampleCourse(course, state.s);
  stepRide(state, {
    dt: 0.05,
    steer: 0,
    throttle: 0,
    sample: at,
    hazards: [{ id: "oil", kind: "slick", x: at.x, z: at.z, radius: 2, slip: -1 }],
  });
  assert.equal(state.crashes, 0);
  assert.equal(state.bumps, 0);
  assert.equal(state.eject, null);
  assert.ok(state.latVel < -2.5, `lat ${state.latVel}`);
  const courseSolid = createCourse(7);
  const solidState = createRideState(START_S);
  const solidAt = sampleCourse(courseSolid, solidState.s);
  stepRide(solidState, {
    dt: 0.05,
    steer: 0,
    throttle: 0,
    sample: solidAt,
    hazards: [{ id: "bench", kind: "solid", x: solidAt.x, z: solidAt.z, radius: 1.2 }],
  });
  assert.equal(solidState.crashes, 0);
  assert.equal(solidState.bumps, 0);
  assert.equal(solidState.eject, null);
  const moved = sampleCourse(courseSolid, solidState.s);
  const gap = Math.hypot(
    moved.x + moved.right.x * solidState.offset - solidAt.x,
    moved.z + moved.right.z * solidState.offset - solidAt.z,
  );
  assert.ok(gap > 1.6, `solid gap ${gap}`);
});

test("a fast car ejects the rider and a slow one only jolts", () => {
  const course = createCourse(7);
  function hitCar(speed) {
    const state = createRideState(START_S);
    state.speed = speed;
    const at = sampleCourse(course, state.s);
    stepRide(state, {
      dt: 0.05,
      steer: 0,
      throttle: 0,
      sample: at,
      hazards: [{ id: "truck", kind: "car", x: at.x, z: at.z, radius: 3 }],
    });
    return state;
  }
  const hard = hitCar(12);
  assert.ok(hard.eject, "hard crash should eject");
  assert.equal(hard.crashes, 1);
  assert.equal(hard.speed, 0);
  assert.ok(hard.eject.canVy > 6, `can hop ${hard.eject.canVy}`);
  assert.ok(Math.abs(hard.eject.canLat) > 3, `can roll ${hard.eject.canLat}`);
  assert.ok(hard.eject.bodyVy > 5, `rider hop ${hard.eject.bodyVy}`);
  assert.ok(Math.abs(hard.eject.bodyLat) > 2, `rider slide ${hard.eject.bodyLat}`);
  assert.ok(hard.shake <= 0.22, `shake ${hard.shake}`);
  assert.ok(hard.events.some((event) => event.type === "eject"));

  const soft = hitCar(8);
  assert.equal(soft.eject, null);
  assert.equal(soft.crashes, 1);
  assert.ok(soft.speed >= 3.2, `speed ${soft.speed}`);

  const person = createRideState(START_S);
  person.speed = 14;
  const at = sampleCourse(course, person.s);
  stepRide(person, {
    dt: 0.05,
    steer: 0,
    throttle: 0,
    sample: at,
    hazards: [{ id: "walker", kind: "person", x: at.x, z: at.z, radius: 1 }],
  });
  assert.equal(person.eject, null);
  assert.equal(person.crashes, 1);
  assert.ok(person.speed >= 3.2, `speed ${person.speed}`);
  assert.ok(Math.abs(person.latVel) < 2, `lat ${person.latVel}`);
  assert.equal(person.events.filter((event) => event.type === "fell").length, 1);
  assert.equal(person.events[0].id, "walker");
});

test("the rider can walk back to a settled can and get in", () => {
  const course = createCourse(7);
  const state = createRideState(START_S);
  state.speed = 12;
  const at = sampleCourse(course, state.s);
  stepRide(state, {
    dt: 0.05,
    steer: 0,
    throttle: 0,
    sample: at,
    hazards: [{ id: "truck", kind: "car", x: at.x, z: at.z, radius: 3 }],
  });
  assert.ok(state.eject);
  let mounted = false;
  for (let step = 0; step < 800 && state.eject; step += 1) {
    const eject = state.eject;
    const ds = eject.canS - eject.bodyS;
    const across = eject.canOffset - eject.bodyOffset;
    const target = Math.atan2(across, ds);
    const err = Math.atan2(Math.sin(target - eject.face), Math.cos(target - eject.face));
    const steer = Math.abs(err) < 0.15 ? 0 : Math.sign(err);
    const throttle = Math.hypot(ds, across) > 0.4 && Math.abs(err) < 0.5 ? 1 : 0;
    stepRide(state, {
      dt: 0.05,
      steer,
      throttle,
      sample: sampleCourse(course, state.s),
      hazards: [],
    });
    mounted = state.eject == null;
  }
  assert.equal(mounted, true);
  assert.equal(state.speed, 5);
  assert.ok(state.events.some((event) => event.type === "mount"));
});

test("the awning drops toward the street and the sign pole stands behind the board", () => {
  const awning = new THREE.Object3D();
  awning.rotation.x = AWNING_PITCH;
  const street = new THREE.Vector3(0, 0, -1).applyQuaternion(awning.quaternion);
  assert.ok(street.y < -0.1, `awning street edge y ${street.y}`);

  const sign = new THREE.Group();
  const pole = new THREE.Object3D();
  pole.position.set(0, 1.15, SIGN_POLE_Z);
  const board = new THREE.Object3D();
  board.position.set(0, 2.25, SIGN_BOARD_Z);
  board.rotation.y = Math.PI;
  sign.add(pole, board);
  const flat = {
    forward: { x: 0, y: 0, z: -1 },
    right: { x: 1, y: 0, z: 0 },
  };
  const frame = signFrame(flat, 1);
  applyFrame(sign, frame);
  sign.updateMatrixWorld(true);
  const poleAt = new THREE.Vector3();
  const boardAt = new THREE.Vector3();
  pole.getWorldPosition(poleAt);
  board.getWorldPosition(boardAt);
  const face = new THREE.Vector3(frame.forward.x, frame.forward.y, frame.forward.z);
  assert.ok(poleAt.clone().sub(boardAt).dot(face) < -0.05, "pole is in front of the board");
  assert.ok(frame.forward.z > 0.4, `uphill ${frame.forward.z}`);
  assert.ok(frame.forward.x < -0.3, `toward street ${frame.forward.x}`);
  const boardFront = new THREE.Vector3(0, 0, 1).applyQuaternion(
    board.getWorldQuaternion(new THREE.Quaternion()),
  );
  assert.ok(boardFront.dot(face) > 0.99, `board faces ${boardFront.dot(face)}`);
  assert.ok(SIGN_POLE_Z > SIGN_BOARD_Z);
});

test("a yard fence stands off the door and the gate is open", () => {
  const half = 6.1;
  const front = half + BUILDING_SETBACK + HOUSE_YARD_SETBACK;
  const line = yardFenceLine(half, front);
  assert.ok(line > half + 3.25, `fence on the sidewalk ${line}`);
  assert.ok(front - line > 3, `yard only ${front - line}`);
  const close = yardFenceLine(half, half + BUILDING_SETBACK);
  assert.ok(half + BUILDING_SETBACK - close >= 1.45 - 1e-6);

  const props = createProps(THREE, { lambert: () => new THREE.MeshLambertMaterial() });
  const house = props.createHouse(() => 0.5);
  const { width, depth, doorX } = house.userData;
  const yardDepth = front - line;
  const fence = props.createYardFence({ width, depth, doorX, yardDepth });
  const yard = fence.userData.yard;
  const faceZ = -depth / 2;
  assert.ok(Math.abs(yard.frontZ - (faceZ - yardDepth)) < 1e-6);
  assert.ok(yard.wallZ < faceZ - 0.2, "side rails meet the wall");
  const frontRuns = yard.runs.filter((run) => run.axis === "x");
  assert.equal(frontRuns.length, 2);
  assert.ok(frontRuns.every((run) => doorX <= run.x0 - 0.2 || doorX >= run.x1 + 0.2));
  assert.equal(yard.runs.filter((run) => run.axis === "z").length, 2);

  fence.updateMatrixWorld(true);
  let blockedGate = false;
  let reachedStreet = false;
  let reachedSide = false;
  fence.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry?.attributes?.position) return;
    const pos = obj.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (y < 0.12) continue;
      if (z < yard.frontZ + 0.15) reachedStreet = true;
      if (Math.abs(Math.abs(x) - width / 2) < 0.25 && z > yard.frontZ + 0.4) reachedSide = true;
      if (Math.abs(x - doorX) < 0.4 && z < yard.frontZ + 0.2) blockedGate = true;
    }
  });
  assert.equal(blockedGate, false);
  assert.equal(reachedStreet, true);
  assert.equal(reachedSide, true);

  const side = 1;
  const frame = faceStreet({ right: { x: 1, y: 0, z: 0 } }, side);
  const center = side * (front + depth / 2);
  const marker = new THREE.Object3D();
  marker.position.set(center, 0, 0);
  applyFrame(marker, frame);
  const door = new THREE.Object3D();
  door.position.set(doorX, 0.9, faceZ - 0.08);
  const rail = new THREE.Object3D();
  rail.position.set(doorX, 0.5, yard.frontZ);
  marker.add(door, rail);
  marker.updateMatrixWorld(true);
  const doorAt = new THREE.Vector3();
  const railAt = new THREE.Vector3();
  door.getWorldPosition(doorAt);
  rail.getWorldPosition(railAt);
  const towardStreet = railAt.clone().sub(doorAt);
  assert.ok(towardStreet.x < -1.2, `fence x ${towardStreet.x} is not toward the street`);
  assert.ok(Math.abs(railAt.x) < Math.abs(doorAt.x), "rail is closer to the road than the door");
});

test("a yard fence drops with the hill and its posts stay upright", () => {
  const course = createCourse(9);
  const sample = sampleCourse(course, 50);
  assert.ok(sample.forward.y < -0.04, `forward.y ${sample.forward.y}`);
  for (const side of [1, -1]) {
    const shear = yardGradeShear(sample.forward, side);
    assert.equal(Math.sign(shear), -side);
    const fence = new THREE.Group();
    const downhillX = side > 0 ? 3.5 : -3.5;
    const base = new THREE.Object3D();
    base.position.set(downhillX, 0, -2);
    const top = new THREE.Object3D();
    top.position.set(downhillX, 1, -2);
    const uphill = new THREE.Object3D();
    uphill.position.set(-downhillX, 0, -2);
    fence.add(base, top, uphill);
    fence.position.set(sample.x, sample.y, sample.z);
    applyFrame(fence, faceStreet(sample, side));
    slopeWithGrade(fence, shear);
    fence.updateMatrixWorld(true);
    const downAt = new THREE.Vector3();
    const topAt = new THREE.Vector3();
    const upAt = new THREE.Vector3();
    base.getWorldPosition(downAt);
    top.getWorldPosition(topAt);
    uphill.getWorldPosition(upAt);
    const groundDown = sampleCourse(course, sample.s + 3.5);
    const groundUp = sampleCourse(course, sample.s - 3.5);
    assert.ok(Math.abs(downAt.y - groundDown.y) < 0.25, `side ${side} down ${downAt.y} ground ${groundDown.y}`);
    assert.ok(Math.abs(upAt.y - groundUp.y) < 0.25, `side ${side} up ${upAt.y} ground ${groundUp.y}`);
    assert.ok(downAt.y < upAt.y - 0.25, `side ${side} downhill is not lower`);
    const rise = topAt.clone().sub(downAt);
    assert.ok(rise.y > 0.95, `side ${side} post rise y ${rise.y}`);
    assert.ok(Math.hypot(rise.x, rise.z) < 0.08, `side ${side} post leans ${Math.hypot(rise.x, rise.z)}`);
  }
});

test("a bench stands on four legs", () => {
  const props = createProps(THREE, { lambert: () => new THREE.MeshLambertMaterial() });
  const bench = props.createBench();
  bench.updateMatrixWorld(true);
  const point = new THREE.Vector3();
  const feet = [];
  bench.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry?.attributes?.position) return;
    const pos = obj.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      point.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
      if (point.y < 0.05) feet.push(point.clone());
    }
  });
  assert.ok(feet.length >= 8, `feet ${feet.length}`);
  for (const foot of feet) {
    assert.ok(Math.abs(foot.x) > 0.45, `leg x ${foot.x}`);
    assert.ok(Math.abs(foot.z) < 0.25, `leg z ${foot.z}`);
  }
  const xs = feet.map((foot) => Math.sign(foot.x));
  const zs = feet.map((foot) => Math.sign(foot.z));
  assert.ok(xs.includes(1) && xs.includes(-1), "legs on both ends");
  assert.ok(zs.includes(1) && zs.includes(-1), "legs on both sides");
});

test("a sitter faces the street and the rider's hands reach forward", () => {
  assert.ok(SITTER.z < BENCH.backZ);
  assert.ok(SITTER.z > -0.23);
  const leg = new THREE.Object3D();
  const foot = new THREE.Object3D();
  foot.position.set(0, -0.8, 0);
  leg.add(foot);
  leg.rotation.x = 1.25;
  leg.updateMatrixWorld(true);
  const footAt = new THREE.Vector3();
  foot.getWorldPosition(footAt);
  assert.ok(footAt.z < -0.2, `foot z ${footAt.z}`);

  const group = new THREE.Group();
  const armR = new THREE.Group();
  const hand = new THREE.Object3D();
  hand.position.y = -0.48;
  armR.add(hand);
  group.add(armR);
  group.userData.limbs = {
    legL: new THREE.Group(),
    legR: new THREE.Group(),
    armL: new THREE.Group(),
    armR,
    head: new THREE.Group(),
  };
  group.userData.pose = "ride";
  animatePerson(group, 0);
  group.updateMatrixWorld(true);
  const handAt = new THREE.Vector3();
  hand.getWorldPosition(handAt);
  assert.ok(handAt.z < -0.15, `hand z ${handAt.z}`);
});

test("walkers step aside for a car and for a stationary player", () => {
  const fromCar = clearOf(0, 0, 1, [{ s: 3, offset: 0.1, halfW: 0.95 }]);
  assert.ok(Math.abs(fromCar - 0.1) > 1, `car offset ${fromCar}`);
  const fromPlayer = clearOf(0, 10, -1, [{ s: 8, offset: 0, radius: 0.5 }]);
  assert.ok(Math.abs(fromPlayer) > 0.8, `player offset ${fromPlayer}`);
  const bench = clearOf(0, 0, 1, [{ s: 2, offset: 0.1, radius: 0.95 }]);
  assert.ok(Math.abs(bench - 0.1) > 1, `bench offset ${bench}`);
  const tree = separateCircle(1.7, 10, 0.42, [{ s: 10, offset: 1.7, radius: 1.05 }]);
  assert.ok(Math.hypot(tree.s - 10, tree.offset - 1.7) >= 1.47, `tree gap ${tree.offset}`);
  const seated = separateCircle(4, 20, 0.42, [
    { s: 20, offset: 4, radius: 0.95 },
    { s: 20, offset: 4, radius: 0.42 },
  ]);
  assert.ok(Math.abs(seated.offset - 4) > 1.3, `sitter gap ${seated.offset}`);
  const clear = separateCircle(0, 0, 0.42, [{ s: 5, offset: 3, radius: 0.5 }]);
  assert.equal(clear.offset, 0);
  assert.equal(clear.s, 0);
  const cars = [{ s: 21, offset: 1.2, halfL: 2.15, halfW: 0.95 }];
  assert.ok(personHitByCar({ pose: "walk", s: 20, offset: 1 }, cars));
  assert.equal(personHitByCar({ pose: "fallen", s: 20, offset: 1 }, cars), null);
  assert.equal(personHitByCar({ pose: "walk", s: 20, offset: 6 }, cars), null);
});

test("a finger dragged left looks left and steers left", () => {
  // Halo's touch sign turns a leftward finger into a negative yaw.
  const left = undoTouchYaw(0, -0.4);
  assert.ok(left > 0.3, `left yaw ${left}`);
  assert.ok(inputFromLook(left, 0).steer < 0, "drag left steers left");
  const right = undoTouchYaw(0, 0.4);
  assert.ok(right < -0.3, `right yaw ${right}`);
  assert.ok(inputFromLook(right, 0).steer > 0, "drag right steers right");
  const more = undoTouchYaw(left, left - 0.1);
  assert.ok(more > left, "holding the drag keeps turning left");
  assert.ok(Math.abs(undoTouchYaw(1.2, 1.2) - 1.2) < 1e-6);
});

test("on foot, a finger dragged up walks forward and does not steer", () => {
  const forward = footDragStick({ ejected: true, dragging: true, touch: true, pitch: -0.38 });
  assert.ok(forward.throttle > 0.9, `throttle ${forward.throttle}`);
  assert.equal(forward.steer, 0);
  assert.equal(forward.strafe, 0);
  const back = footDragStick({ ejected: true, dragging: true, touch: true, pitch: 0.38 });
  assert.ok(back.throttle < -0.9, `back throttle ${back.throttle}`);
  assert.equal(footDragStick({ ejected: true, dragging: true, touch: false, pitch: -0.38 }), null);
  assert.equal(footDragStick({ ejected: true, dragging: false, touch: true, pitch: -0.38 }), null);
  assert.equal(footDragStick({ ejected: false, dragging: true, touch: true, pitch: -0.38 }), null);

  const tilt = inputFromTilt({ steerDeg: 20, leanDeg: 20, neutralSteer: 0, neutralLean: 0 });
  const held = selectRideInput({
    presenting: false,
    tilt: null,
    keys: { steer: 0, throttle: forward.throttle, strafe: 0 },
    preferTilt: false,
  });
  assert.equal(held.source, "keys");
  assert.ok(held.throttle > 0.9);
  const stolen = selectRideInput({
    presenting: false,
    tilt,
    keys: { steer: 0, throttle: forward.throttle, strafe: 0 },
    preferTilt: true,
  });
  assert.equal(stolen.source, "tilt");

  const course = createCourse(7);
  const state = createRideState(80);
  state.speed = 12;
  const at = sampleCourse(course, 80);
  stepRide(state, {
    dt: 0.05,
    steer: 0,
    throttle: 0,
    sample: at,
    hazards: [{ id: "truck", kind: "car", x: at.x, z: at.z, radius: 3 }],
  });
  assert.ok(state.eject);
  state.eject.face = 0;
  state.eject.bodyAlong = 0;
  state.eject.bodyLat = 0;
  state.eject.bodyHop = 0;
  state.eject.bodyVy = 0;
  state.eject.bodySpin = 0;
  state.eject.bodyRoll = 0;
  state.eject.canS = state.eject.bodyS + 40;
  const before = state.eject.bodyS;
  const faced = state.eject.face;
  stepRide(state, {
    dt: 0.05,
    steer: forward.steer,
    throttle: forward.throttle,
    strafe: forward.strafe,
    sample: sampleCourse(course, state.s),
    hazards: [],
  });
  assert.equal(state.eject.face, faced, "a forward drag does not turn");
  assert.ok(state.eject.bodyS > before + 0.05, `downhill s ${state.eject.bodyS} from ${before}`);
});

test("releasing the mouse returns the view to the rider heading", () => {
  const held = releasedLook({ dragging: true, heading: 1, yaw: 0.2, pitch: 0.4, roll: 0.1 });
  assert.equal(held.released, false);
  assert.equal(held.yaw, 0.2);
  assert.equal(held.pitch, 0.4);
  const back = releasedLook({ dragging: false, heading: 1, yaw: 0.2, pitch: 0.4, roll: 0.1 });
  assert.equal(back.released, true);
  assert.equal(back.yaw, 1);
  assert.equal(back.pitch, 0);
  assert.equal(back.roll, 0);
});

test("the hill includes a pasture, a shore, and a forest", () => {
  let country = null;
  let ocean = null;
  let forest = null;
  for (let seed = 1; seed <= 40 && (!country || !ocean || !forest); seed += 1) {
    const course = createCourse(seed);
    course.districts.forEach((district, index) => {
      if (!country && district.theme === "country") country = { seed, index, district };
      if (!ocean && district.theme === "ocean") ocean = { seed, index, district };
      if (!forest && district.theme === "forest") forest = { seed, index, district };
    });
  }
  assert.ok(country, "no country district");
  assert.ok(ocean, "no ocean district");
  assert.ok(forest, "no forest district");
  assert.equal(country.district.halfWidth, 5.6);
  assert.equal(ocean.district.halfWidth, 6.4);
  assert.equal(forest.district.halfWidth, 5.4);
  const oceanCourse = createCourse(ocean.seed);
  const sample = sampleCourse(oceanCourse, ocean.index * DISTRICT_LENGTH + 20);
  assert.equal(sample.theme, "ocean");
  assert.ok(sample.waterSide === 1 || sample.waterSide === -1);
  assert.ok(forest.district.name);
});

test("on foot, W walks the way you face and A strafes left", () => {
  const course = createCourse(7);
  const flat = { x: 0, y: 0, z: -1 };
  const right = { x: 1, y: 0, z: 0 };
  const ahead = walkerForward(flat, right, 0);
  const back = walkerForward(flat, right, Math.PI);
  const side = walkerForward(flat, right, Math.PI / 2);
  assert.ok(ahead.z < -0.99 && Math.abs(ahead.x) < 1e-6);
  assert.ok(back.z > 0.99 && Math.abs(back.x) < 1e-6);
  assert.ok(side.x > 0.99 && Math.abs(side.z) < 1e-6);

  const state = createRideState(80);
  state.speed = 12;
  const at = sampleCourse(course, 80);
  stepRide(state, {
    dt: 0.05,
    steer: 0,
    throttle: 0,
    sample: at,
    hazards: [{ id: "truck", kind: "car", x: at.x, z: at.z, radius: 3 }],
  });
  assert.ok(state.eject);
  state.eject.face = Math.PI;
  state.eject.bodyAlong = 0;
  state.eject.bodyLat = 0;
  state.eject.bodyHop = 0;
  state.eject.bodyVy = 0;
  const before = state.eject.bodyS;
  stepRide(state, {
    dt: 0.05,
    steer: 0,
    throttle: 1,
    sample: sampleCourse(course, state.s),
    hazards: [],
  });
  assert.ok(state.eject.bodyS < before, `uphill s ${state.eject.bodyS} from ${before}`);

  state.eject.face = 0;
  state.eject.bodyAlong = 0;
  state.eject.bodyLat = 0;
  state.eject.bodyHop = 0;
  state.eject.bodyVy = 0;
  state.eject.canS = state.eject.bodyS + 40;
  const faced = state.eject.face;
  const offset = state.eject.bodyOffset;
  stepRide(state, {
    dt: 0.05,
    steer: 0,
    strafe: -1,
    throttle: 0,
    sample: sampleCourse(course, state.s),
    hazards: [],
  });
  assert.equal(state.eject.face, faced, "A strafes and does not turn");
  assert.ok(state.eject.bodyOffset < offset - 0.1, `strafe ${state.eject.bodyOffset} from ${offset}`);

  state.eject.face = Math.PI;
  state.eject.bodyAlong = 0;
  state.eject.bodyLat = 0;
  state.eject.bodyHop = 0;
  state.eject.bodyVy = 0;
  const uphillOffset = state.eject.bodyOffset;
  stepRide(state, {
    dt: 0.05,
    steer: 0,
    strafe: -1,
    throttle: 0,
    sample: sampleCourse(course, state.s),
    hazards: [],
  });
  assert.ok(state.eject.bodyOffset > uphillOffset + 0.1, `uphill A went ${state.eject.bodyOffset} from ${uphillOffset}`);

  const flatSample = {
    x: 0,
    y: 0,
    z: 0,
    forward: flat,
    right,
    halfWidth: 8,
  };
  const basis = createRideState(0);
  basis.eject = {
    canS: 40,
    canOffset: 0,
    canSpeed: 0,
    canLat: 0,
    canHop: 0,
    canVy: 0,
    canSpin: 0,
    canTilt: 0,
    bodyS: 10,
    bodyOffset: 0,
    bodyAlong: 0,
    bodyLat: 0,
    bodyHop: 0,
    bodyVy: 0,
    bodySpin: 0,
    bodyRoll: 0,
    face: Math.PI / 2,
  };
  stepRide(basis, {
    dt: 0.05,
    steer: 0,
    strafe: 1,
    throttle: 0,
    sample: flatSample,
    hazards: [],
  });
  assert.equal(basis.eject.face, Math.PI / 2);
  assert.ok(basis.eject.bodyS < 9.85, `face-right strafe s ${basis.eject.bodyS}`);
  assert.ok(Math.abs(basis.eject.bodyOffset) < 1e-6, `face-right strafe offset ${basis.eject.bodyOffset}`);

  const person = new THREE.Group();
  const nose = new THREE.Object3D();
  const hand = new THREE.Object3D();
  nose.position.set(0, 0, -1);
  hand.position.set(1, 0, 0);
  person.add(nose, hand);
  const move = walkerForward(flat, right, Math.PI);
  applyFrame(person, {
    forward: { x: move.x, y: 0, z: move.z },
    right: { x: -move.z, y: 0, z: move.x },
    up: { x: 0, y: 1, z: 0 },
  });
  person.updateMatrixWorld(true);
  const noseAt = new THREE.Vector3();
  const handAt = new THREE.Vector3();
  nose.getWorldPosition(noseAt);
  hand.getWorldPosition(handAt);
  assert.ok(noseAt.z > 0.9, `nose z ${noseAt.z}`);
  assert.ok(handAt.x < -0.9, `hand x ${handAt.x}`);
});

test("a crash hops the can and the shake dies", () => {
  const course = createCourse(7);
  const state = createRideState(START_S);
  state.speed = 8;
  const at = sampleCourse(course, state.s);
  stepRide(state, {
    dt: 0.05,
    steer: 0,
    throttle: 0,
    sample: at,
    hazards: [{ id: "truck", kind: "car", x: at.x, z: at.z, radius: 3 }],
  });
  assert.equal(state.eject, null);
  assert.ok(state.shake <= 0.22, `shake ${state.shake}`);
  assert.ok(state.hopVy > 3 || state.hop > 0.1, `hop ${state.hop} vy ${state.hopVy}`);
  let peak = state.hop;
  for (let step = 0; step < 10; step += 1) {
    stepRide(state, {
      dt: 0.05,
      steer: 0,
      throttle: 0,
      sample: sampleCourse(course, state.s),
      hazards: [],
    });
    peak = Math.max(peak, state.hop);
  }
  assert.ok(peak > 0.3, `peak hop ${peak}`);
  assert.ok(state.shake < 0.03, `shake lingered ${state.shake}`);
});

test("cars dodge people unless the player is what they are avoiding", () => {
  const person = {
    kind: "person",
    pose: "walk",
    fixed: false,
    s: 18,
    offset: 2.4,
    radius: 0.42,
  };
  const dodge = trafficSwerve({
    s: 10,
    speed: 8,
    laneOffset: 2,
    halfWidth: 8,
    player: null,
    actors: [person],
  });
  assert.equal(dodge.swerving, false);
  assert.ok(dodge.bias < -1, `person bias ${dodge.bias}`);

  const fallen = trafficSwerve({
    s: 0,
    speed: 8,
    laneOffset: 0,
    halfWidth: 8,
    player: null,
    actors: [{ kind: "person", pose: "fallen", fixed: false, s: 5, offset: 0, radius: 0.42 }],
  });
  assert.equal(fallen.bias, 0);

  const swerve = trafficSwerve({
    s: 10,
    speed: 8,
    laneOffset: 2,
    halfWidth: 8,
    player: { s: 20, offset: 2.2, radius: 0.5 },
    actors: [{ ...person, offset: 1 }],
  });
  assert.equal(swerve.swerving, true);
  assert.ok(swerve.bias < -1, `player bias ${swerve.bias}`);

  const actor = { pose: "walk", fixed: false, s: 20, offset: 1, kind: "person", radius: 0.42 };
  const parked = { s: 21, offset: 1.2, halfL: 2.15, halfW: 0.95, swerving: false };
  const moving = { ...parked, swerving: true };
  assert.equal(strikeResponse(actor, parked), "slide");
  assert.equal(strikeResponse(actor, moving), "launch");
  assert.equal(strikeResponse({ ...actor, pose: "fallen" }, moving), null);

  const fromCar = launchVelocity("person", { along: 1, side: 1, fromCar: true });
  const fromCan = launchVelocity("person", { along: 1, side: 1 });
  const animal = launchVelocity("animal", { along: 1, side: 1 });
  const bump = launchVelocity("person", { along: 1, side: 1, force: 0.25 });
  assert.ok(fromCar.vs > fromCan.vs);
  assert.ok(fromCan.vs > animal.vs);
  assert.ok(fromCar.vy > 7);
  assert.ok(fromCan.vy > 6);
  assert.ok(bump.vy < fromCan.vy * 0.4, `soft vy ${bump.vy}`);
  assert.ok(bump.vs < 3, `soft slide ${bump.vs}`);
});

test("a road decal follows the slope", () => {
  const course = createCourse(7);
  let tilted = null;
  for (let s = 0; s < 400; s += 2) {
    const sample = sampleCourse(course, s);
    if (sample.forward.y < -0.08) {
      tilted = sample;
      break;
    }
  }
  assert.ok(tilted, "no sloped sample");
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 8));
  disc.geometry.rotateX(-Math.PI / 2);
  applyFrame(disc, tilted);
  const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(disc.quaternion);
  const up = new THREE.Vector3(tilted.up.x, tilted.up.y, tilted.up.z);
  const sloped = normal.dot(up);
  assert.ok(sloped > 0.98, `decal ${sloped}`);
  const flat = frameFromTangent(tilted.forward.x, 0, tilted.forward.z);
  applyFrame(disc, flat);
  const flatNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(disc.quaternion);
  assert.ok(sloped > flatNormal.dot(up) + 0.002, "upright frame drops the grade");
});

test("a tumbled can stays above the road", () => {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.96, 12));
  mesh.position.y = 0.48;
  group.add(mesh);
  for (const tilt of [0, 0.4, 1.2, Math.PI / 2, 2.4, Math.PI]) {
    group.rotation.set(0, 0, 0);
    group.position.set(0, canGroundClearance(tilt), 0);
    group.rotateX(tilt);
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    assert.ok(box.min.y >= -0.02, `tilt ${tilt.toFixed(2)} dips to ${box.min.y}`);
  }
});

test("on foot, Q and E turn, space jumps, and a person is thrown", () => {
  assert.equal(onFootSteer(0, new Set(["Q"])), -1);
  assert.equal(onFootSteer(0, new Set(["E"])), 1);
  assert.equal(onFootSteer(-1, new Set(["Q"])), -1);
  assert.equal(onFootJump(new Set([" "])), true);
  assert.equal(onFootJump(new Set(["Space"])), true);
  assert.equal(onFootJump(new Set(["W"])), false);

  const course = createCourse(7);
  const state = createRideState(START_S);
  state.speed = 12;
  const at = sampleCourse(course, state.s);
  stepRide(state, {
    dt: 0.05,
    steer: 0,
    throttle: 0,
    sample: at,
    hazards: [{ id: "truck", kind: "car", x: at.x, z: at.z, radius: 3 }],
  });
  state.eject.bodyAlong = 0;
  state.eject.bodyLat = 0;
  state.eject.bodyHop = 0;
  state.eject.bodyVy = 0;
  state.eject.bodyOffset = 0;
  const stood = sampleCourse(course, state.s);
  const faced = state.eject.face;
  stepRide(state, {
    dt: 0.05,
    steer: onFootSteer(0, new Set(["E"])),
    throttle: 0,
    jump: true,
    sample: stood,
    hazards: [{ id: "walker", kind: "person", x: stood.x, z: stood.z, radius: 0.4 }],
  });
  assert.ok(state.eject.face > faced, `E face ${state.eject.face} from ${faced}`);
  assert.ok(state.eject.bodyVy > 4, `jump ${state.eject.bodyVy}`);
  assert.equal(state.events.filter((event) => event.type === "fell" && event.id === "walker").length, 1);
  const flying = state.eject.bodyVy;
  stepRide(state, {
    dt: 0.05,
    steer: 0,
    throttle: 0,
    jump: true,
    sample: sampleCourse(course, state.s),
    hazards: [],
  });
  assert.ok(state.eject.bodyVy < flying, "space does not jump again in the air");
});

test("people in contact are not slid clear, and a bus stops for a bench", () => {
  assert.equal(overlappingPlayer(
    { s: 10, offset: 0.2, radius: 0.42 },
    { s: 10.3, offset: 0, radius: 0.5 },
  ), true);
  assert.equal(overlappingPlayer(
    { s: 10, offset: 3, radius: 0.42 },
    { s: 10, offset: 0, radius: 0.5 },
  ), false);
  assert.equal(closingOn(
    { s: 12, offset: 0.2, radius: 0.42 },
    { s: 10, offset: 0, radius: 0.5, speed: 12 },
  ), true);
  assert.equal(closingOn(
    { s: 20, offset: 0, radius: 0.42 },
    { s: 10, offset: 0, radius: 0.5, speed: 12 },
  ), false);
  const nudged = lateralEvade(0, 4, 0.05, 1.7);
  assert.ok(nudged > 0 && nudged < 0.2, `nudge ${nudged}`);
  const rolling = busPace({ cruise: 8, dwell: 0, ahead: 10, dt: 0.05 });
  assert.ok(rolling.speed > 0 && rolling.speed < 8, `ease ${rolling.speed}`);
  const stopped = busPace({ cruise: 8, dwell: 0, ahead: 1, dt: 0.05 });
  assert.equal(stopped.speed, 0);
  assert.ok(stopped.dwell > 2);
  const waiting = busPace({ cruise: 8, dwell: 1, ahead: 1, dt: 0.05 });
  assert.equal(waiting.speed, 0);
  assert.ok(waiting.dwell < 1 && waiting.dwell > 0.9);
});

test("potholes are broken pavement and the animals read as cows, sheep, and dogs", () => {
  const props = createProps(THREE, { lambert: () => new THREE.MeshLambertMaterial() });
  const hole = props.createPothole(() => 0.4);
  let shapes = 0;
  let circles = 0;
  let cocked = 0;
  hole.traverse((object) => {
    if (!object.geometry) return;
    if (object.geometry.type === "ShapeGeometry") shapes += 1;
    if (object.geometry.type === "CircleGeometry") circles += 1;
    if (Math.abs(object.rotation.x) > 0.05 || Math.abs(object.rotation.z) > 0.05) cocked += 1;
  });
  assert.ok(shapes >= 2, `shapes ${shapes}`);
  assert.equal(circles, 0);
  assert.ok(cocked >= 3, `cocked slabs ${cocked}`);
  let top = 0;
  hole.traverse((object) => {
    if (object.geometry && object.position.y > top) top = object.position.y;
  });
  assert.ok(top < 0.05, `pothole stands up at ${top}`);

  const cow = props.createAnimal(() => 0.3, "cow");
  let snout = false;
  cow.traverse((object) => {
    if (object.position.z < -0.75) snout = true;
  });
  assert.equal(snout, true);

  const sheep = props.createAnimal(() => 0.3, "sheep");
  let wool = 0;
  let face = false;
  sheep.traverse((object) => {
    if (!object.isMesh) return;
    const count = object.geometry.attributes?.position?.count || 0;
    if (count > 80 && object.position.y > 0.4 && object.position.z > -0.2) wool += 1;
    if (count > 80 && object.position.z < -0.4) face = true;
  });
  assert.ok(wool >= 2, `wool puffs ${wool}`);
  assert.equal(face, true);

  const dog = props.createDog(() => 0.2);
  assert.ok(dog.position.x > 0.2 && dog.position.z < -0.3, "dog stands ahead and to the right");

  const slickProps = createProps(THREE, {
    lambert: () => new THREE.MeshLambertMaterial(),
    slick: () => new THREE.MeshLambertMaterial(),
  });
  const slick = slickProps.createSlick(() => 0.5);
  assert.ok(slick.userData.radius > 1.45 && slick.userData.radius < 2.2, `slick ${slick.userData.radius}`);
});

test("a resting can sits on its bottom, top, or side", () => {
  assert.equal(restCanTilt(0.2), 0);
  assert.equal(restCanTilt(1.2), Math.PI / 2);
  assert.equal(restCanTilt(-1.2), -Math.PI / 2);
  assert.equal(restCanTilt(2.6), Math.PI);
  assert.equal(restCanTilt(Math.PI), Math.PI);

  const course = createCourse(7);
  const state = createRideState(80);
  state.speed = 12;
  const at = sampleCourse(course, 80);
  stepRide(state, {
    dt: 0.05,
    steer: 0,
    throttle: 0,
    sample: at,
    hazards: [{ id: "truck", kind: "car", x: at.x, z: at.z, radius: 3 }],
  });
  state.eject.canS = state.eject.bodyS + 40;
  state.eject.canSpeed = 0;
  state.eject.canLat = 0;
  state.eject.canHop = 0;
  state.eject.canVy = 0;
  state.eject.bodyAlong = 0;
  state.eject.bodyLat = 0;
  state.eject.bodyHop = 0;
  state.eject.bodyVy = 0;
  state.eject.canTilt = 1.2;
  stepRide(state, {
    dt: 0.05,
    steer: 0,
    throttle: 0,
    sample: sampleCourse(course, state.s),
    hazards: [],
  });
  assert.equal(state.eject.canTilt, Math.PI / 2);

  state.eject.canTilt = 2.4;
  state.eject.canHop = 1.2;
  state.eject.canVy = 3;
  stepRide(state, {
    dt: 0.05,
    steer: 0,
    throttle: 0,
    sample: sampleCourse(course, state.s),
    hazards: [],
  });
  assert.ok(Math.abs(state.eject.canTilt - 2.4) < 0.05, `airborne tilt snapped to ${state.eject.canTilt}`);

  state.eject.canHop = 0;
  state.eject.canVy = 0;
  state.eject.canSpeed = 0.8;
  state.eject.canLat = 0;
  state.eject.canTilt = 1.2;
  stepRide(state, {
    dt: 0.05,
    steer: 0,
    throttle: 0,
    sample: sampleCourse(course, state.s),
    canSample: sampleCourse(course, state.eject.canS),
    hazards: [],
  });
  assert.equal(state.eject.canTilt, Math.PI / 2);
  for (let step = 0; step < 100; step += 1) {
    stepRide(state, {
      dt: 0.05,
      steer: 0,
      throttle: 0,
      sample: sampleCourse(course, state.s),
      canSample: sampleCourse(course, state.eject.canS),
      hazards: [],
    });
  }
  assert.equal(state.eject.canSpeed, 0);
  assert.equal(state.eject.canLat, 0);
  assert.equal(state.eject.canTilt, Math.PI / 2);
  const parked = state.eject.canS;
  for (let step = 0; step < 40; step += 1) {
    stepRide(state, {
      dt: 0.05,
      steer: 0,
      throttle: 0,
      sample: sampleCourse(course, state.s),
      canSample: sampleCourse(course, state.eject.canS),
      hazards: [],
    });
  }
  assert.equal(state.eject.canS, parked, "a grounded can slid after it stopped");
});

test("an ejected can falls out of a bus instead of climbing", () => {
  const course = createCourse(7);
  const state = createRideState(80);
  const at = sampleCourse(course, 80);
  stepRide(state, {
    dt: 0.05,
    steer: 0,
    throttle: 0,
    jump: true,
    sample: at,
    hazards: [],
  });
  state.eject.canHop = 6;
  state.eject.canVy = 0;
  state.eject.canSpeed = 0;
  state.eject.canLat = 0;
  state.eject.canTilt = 0.4;
  state.eject.bodyS = state.eject.canS + 30;
  const home = sampleCourse(course, state.eject.canS);
  const bus = {
    id: "bus",
    kind: "car",
    x: home.x + home.right.x * state.eject.canOffset,
    z: home.z + home.right.z * state.eject.canOffset,
    halfL: 4.9,
    halfW: 1.28,
    fx: home.forward.x,
    fz: home.forward.z,
    rx: home.right.x,
    rz: home.right.z,
  };
  let maxHop = state.eject.canHop;
  let minLate = Infinity;
  for (let step = 0; step < 200; step += 1) {
    const sample = sampleCourse(course, state.eject.canS);
    const falling = step < 120;
    stepRide(state, {
      dt: 0.05,
      steer: 0,
      throttle: 0,
      sample: sampleCourse(course, state.s),
      canSample: sample,
      hazards: falling
        ? [
          bus,
          {
            id: `hole-${step}`,
            kind: "pothole",
            x: sample.x + sample.right.x * state.eject.canOffset,
            z: sample.z + sample.right.z * state.eject.canOffset,
            radius: 2,
          },
        ]
        : [],
    });
    assert.ok(state.eject, "remounted while the can was up");
    maxHop = Math.max(maxHop, state.eject.canHop);
    if (step > 30) minLate = Math.min(minLate, state.eject.canHop);
  }
  assert.ok(maxHop < 6.4, `climbed to ${maxHop}`);
  assert.ok(minLate < 0.05, `never landed ${minLate}`);
  assert.ok(state.eject.canHop < 0.04, `left in the air ${state.eject.canHop}`);
  const face = [0, Math.PI / 2, -Math.PI / 2, Math.PI];
  assert.ok(face.some((angle) => Math.abs(state.eject.canTilt - angle) < 1e-6), `tilt ${state.eject.canTilt}`);
});

test("a thrown rider tumbles through the bounce, then stands", () => {
  const course = createCourse(7);
  const state = createRideState(START_S);
  state.speed = 12;
  const at = sampleCourse(course, state.s);
  stepRide(state, {
    dt: 0.05,
    steer: 0,
    throttle: 0,
    sample: at,
    hazards: [{ id: "truck", kind: "car", x: at.x, z: at.z, radius: 3 }],
  });
  const spin0 = Math.abs(state.eject.bodySpin);
  assert.ok(spin0 < 0.5, `opened on its back ${spin0}`);
  state.eject.canS = state.eject.bodyS + 50;
  let maxHop = state.eject.bodyHop;
  let maxSpin = spin0;
  for (let step = 0; step < 25; step += 1) {
    stepRide(state, {
      dt: 0.05,
      steer: 0,
      throttle: 0,
      sample: sampleCourse(course, state.s),
      hazards: [],
    });
    assert.ok(state.eject, "remounted during the throw");
    maxHop = Math.max(maxHop, state.eject.bodyHop);
    maxSpin = Math.max(maxSpin, Math.abs(state.eject.bodySpin));
  }
  assert.ok(maxHop > 0.8, `hop ${maxHop}`);
  assert.ok(maxSpin > spin0 + 0.5, `spin ${maxSpin} from ${spin0}`);

  state.eject.bodyAlong = 0;
  state.eject.bodyLat = 0;
  state.eject.bodyHop = 0;
  state.eject.bodyVy = 0;
  state.eject.bodySpin = 1.4;
  state.eject.bodyRoll = 0.6;
  stepRide(state, {
    dt: 0.05,
    steer: 0,
    throttle: 0,
    sample: sampleCourse(course, state.s),
    hazards: [],
  });
  assert.equal(state.eject.bodySpin, 0);
  assert.equal(state.eject.bodyRoll, 0);
});

test("a rider on their back looks at the sky", () => {
  const lens = tumbleLook({ bodySpin: Math.PI / 2, bodyRoll: 0, settled: false, viewPitch: -0.3 });
  const camera = new THREE.PerspectiveCamera();
  camera.rotation.set(lens.pitch, 0, lens.roll);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  assert.ok(dir.y > 0.9, `sky ${dir.y}`);
  const stood = tumbleLook({ bodySpin: 1, bodyRoll: 0.4, settled: true, viewPitch: -0.32 });
  assert.equal(stood.pitch, -0.32);
  assert.equal(stood.roll, 0);
});

test("a bus has side windows and a windshield", () => {
  const props = createProps(THREE, {
    lambert: () => new THREE.MeshLambertMaterial(),
    standard: () => new THREE.MeshStandardMaterial(),
    headlight: new THREE.MeshLambertMaterial(),
    taillight: new THREE.MeshLambertMaterial(),
    shadow: new THREE.MeshLambertMaterial(),
  });
  const bus = props.createCar(() => 0.2, "bus");
  let side = 0;
  let windshield = 0;
  bus.children.forEach((child) => {
    if (Math.abs(child.position.x) > 1.15 && child.position.y > 1.6) side += 1;
    if (child.position.z < -4.6 && child.position.y > 1.4) windshield += 1;
  });
  assert.ok(side >= 6, `side windows ${side}`);
  assert.ok(windshield >= 2, `windshield panes ${windshield}`);
});

test("vehicles sometimes hit people and sometimes each other", () => {
  let hits = 0;
  let misses = 0;
  for (let index = 0; index < 40; index += 1) {
    if (vehicleHitsLife(`traffic-${index % 6}`, `walker-${index}`)) hits += 1;
    else misses += 1;
  }
  assert.ok(hits > 0 && hits * 3 < misses, `life hits ${hits} misses ${misses}`);
  assert.equal(TRAFFIC_FLEET.filter((kind) => kind === "cop").length, 1);
  assert.equal(TRAFFIC_FLEET.length, 5);
  assert.equal(TRAFFIC_FLEET[1], "bus");
  assert.equal(TRAFFIC_FLEET.indexOf("bus") % 2, 1);
  assert.equal(vehicleHitsLife("traffic-0", "walker-1"), vehicleHitsLife("traffic-0", "walker-1"));

  let crashes = 0;
  let gaps = 0;
  for (let index = 0; index < 80; index += 1) {
    const pair = vehicleMayHit({ id: `traffic-${index}` }, { id: `tail-${index}` });
    if (pair) crashes += 1;
    else gaps += 1;
  }
  assert.ok(crashes > 0 && gaps > crashes, `wrecks ${crashes} gaps ${gaps}`);

  const actor = { pose: "walk", fixed: false, s: 20, offset: 1, kind: "animal", radius: 0.6, id: "cow" };
  const charging = { s: 21, offset: 1.1, halfL: 2.15, halfW: 0.95, swerving: false, striking: true };
  assert.equal(strikeResponse(actor, charging), "launch");
  const calm = trafficSwerve({
    s: 10,
    speed: 8,
    laneOffset: 2,
    halfWidth: 8,
    player: null,
    actors: [{ kind: "person", pose: "walk", fixed: false, s: 18, offset: 2.4, radius: 0.42, id: "p" }],
    yieldToLife: false,
  });
  assert.equal(calm.swerving, false);
  assert.ok(Math.abs(calm.bias) < 0.01, `still dodged ${calm.bias}`);

  const piled = [
    { id: "fast", lane: 0.36, s: 100, speed: 16, halfL: 2.15, offset: 1 },
    { id: "slow", lane: 0.36, s: 103, speed: 6, halfL: 2.15, offset: 1 },
  ];
  separateLane(piled, { mayCrash: () => true });
  assert.ok(piled.every((car) => car.crash), `crash ids ${piled.map((car) => car.crash).join(",")}`);

  const faces = [0, Math.PI / 2, -Math.PI / 2, Math.PI];
  const onFace = (spin) => faces.some((face) => Math.abs(wrapAngle(spin - face)) < 1e-6);
  const rests = [];
  for (const impact of [3, 8, 14, 18]) {
    const car = startVehicleWreck(
      { id: `hit-${impact}`, s: 20, speed: impact, offset: 0, lane: 0.36, kind: "car", halfW: 0.95 },
      { offset: 2, speed: 0 },
    );
    for (let step = 0; step < 200; step += 1) stepVehicleWreck(car, 0.05);
    assert.equal(car.wreck.settled, true, `impact ${impact} still moving`);
    assert.equal(car.speed, 0);
    assert.ok(onFace(car.wreck.spin), `spin ${car.wreck.spin} impact ${impact}`);
    rests.push(car.wreck.spin);
  }
  assert.ok(new Set(rests.map((spin) => Math.round(spin * 100))).size >= 2, `rests ${rests.join(",")}`);
  const launched = startVehicleWreck(
    { id: "hard", s: 20, speed: 16, offset: 0, lane: 0.36, kind: "car", halfW: 0.95 },
    { offset: 2, speed: 1 },
  );
  for (let step = 0; step < 40; step += 1) stepVehicleWreck(launched, 0.05);
  assert.ok(launched.wreck.bounces >= 1 || launched.wreck.hop > 0.2, "hard hit stays on the ground");

  const right = { id: "right", s: 40, offset: 2, halfL: 2.15, halfW: 0.95, speed: 8, bias: 0, lane: 0.36 };
  const oncoming = { id: "left", s: 41, offset: -2, halfL: 2.15, halfW: 0.95, speed: -7, bias: 0, lane: -0.36 };
  assert.equal(vehicleBodiesOverlap(right, oncoming), false);
  assert.equal(collideSweptCars([right, oncoming]), 0);
  assert.equal(right.wreck, undefined);

  const swerved = { id: "swerve", s: 40, offset: -0.3, halfL: 2.15, halfW: 0.95, speed: 8, bias: -2.3, lane: 0.36 };
  const met = { id: "met", s: 41, offset: -2, halfL: 2.15, halfW: 0.95, speed: -7, bias: 0, lane: -0.36 };
  assert.equal(vehicleBodiesOverlap(swerved, met), true);
  assert.ok(collideSweptCars([swerved, met]) >= 1);
  assert.ok(swerved.wreck && met.wreck, "swerve passed through the other car");
  assert.equal(swerved.wreck.shift, -2.3);

  const parked = { s: 40, offset: 4.4, halfL: 2.15, halfW: 0.95 };
  const cruiser = { id: "cruise", s: 40, offset: 2, halfL: 2.15, halfW: 0.95, speed: 10, bias: 0 };
  assert.equal(vehicleBodiesOverlap(cruiser, parked, 0.45), false);
  assert.equal(collideSweptCars([cruiser], [parked]), 0);
  const intoCurb = { id: "curb", s: 40, offset: 4.2, halfL: 2.15, halfW: 0.95, speed: 10, bias: 2.2 };
  assert.equal(vehicleBodiesOverlap(intoCurb, parked, 0.45), true);
  assert.equal(collideSweptCars([intoCurb], [parked]), 1);
  assert.ok(intoCurb.wreck, "swerve passed through the parked car");
  assert.equal(intoCurb.wreck.shift, 2.2);

  assert.equal(vehicleMayHit({ id: "traffic-0", kind: "bus" }, { id: "tail-0", kind: "car" }), false);
  assert.equal(vehicleMayHit({ id: "traffic-0", kind: "car" }, { id: "tail-0", kind: "bus" }), false);
  for (const halfWidth of [5.4, 5.6, 6.1, 6.4, 7.1, 7.8]) {
    for (const side of [1, -1]) {
      const lane = side * 0.36 * halfWidth;
      for (const asked of [0, 2.4, -2.4]) {
        const bias = clampBusBias(lane, asked, halfWidth);
        const offset = lane + bias;
        assert.equal(Math.sign(offset), side, `bus crossed at width ${halfWidth} bias ${asked} -> ${offset}`);
        assert.ok(Math.abs(offset) > 0.4, `bus reached the crown at width ${halfWidth}`);
        const truck = { s: 20, offset: side * (halfWidth - 1.4), halfL: 3.35, halfW: 1.15 };
        const sedan = { s: 20, offset: side * (halfWidth - 1.2), halfL: 2.15, halfW: 0.95 };
        const body = { s: 20, offset, halfL: 4.9, halfW: 1.28 };
        assert.equal(vehicleBodiesOverlap(body, truck, 0.45), false, `truck width ${halfWidth}`);
        assert.equal(vehicleBodiesOverlap(body, sedan, 0.45), false, `sedan width ${halfWidth}`);
      }
    }
  }
  const pulledOver = {
    id: "traffic-1",
    kind: "bus",
    s: 40,
    offset: 3.4,
    laneOffset: 1.94,
    lane: 0.36,
    halfL: 4.9,
    halfW: 1.28,
    speed: 7,
    bias: 1.46,
  };
  const stall = { s: 41, offset: 4.2, halfL: 2.15, halfW: 0.95, speed: 0 };
  assert.equal(vehicleBodiesOverlap(pulledOver, stall, 0.45), true);
  assert.equal(collideSweptCars([pulledOver], [stall]), 0);
  assert.equal(pulledOver.wreck, undefined);
  assert.equal(vehicleBodiesOverlap(pulledOver, stall, 0.45), false);
  const meeting = {
    id: "traffic-1",
    kind: "bus",
    s: 40,
    offset: 0.4,
    laneOffset: 1.94,
    lane: 0.36,
    halfL: 4.9,
    halfW: 1.28,
    speed: 6,
    bias: -1.54,
  };
  const oncomingTruck = {
    id: "traffic-2",
    kind: "truck",
    s: 41,
    offset: -1.2,
    laneOffset: -1.94,
    lane: -0.36,
    halfL: 3.35,
    halfW: 1.15,
    speed: -7,
    bias: 0.74,
  };
  assert.equal(vehicleBodiesOverlap(meeting, oncomingTruck), true);
  assert.equal(collideSweptCars([meeting, oncomingTruck], []), 0);
  assert.equal(meeting.wreck, undefined);
  assert.equal(oncomingTruck.wreck, undefined);
  assert.equal(vehicleBodiesOverlap(meeting, oncomingTruck), false);
  assert.equal(releaseBus(meeting, [oncomingTruck]), false);

  const cow = { homeOffset: 16, offset: 16 };
  const ontoRoad = animalRoamTarget(cow, { halfWidth: 5.6 }, 10, false);
  assert.ok(ontoRoad > 0.5 && ontoRoad < 5.6, `road spot ${ontoRoad}`);
  assert.equal(animalRoamTarget(cow, { halfWidth: 5.6 }, 80, false), null);
  assert.equal(animalRoamTarget(cow, { halfWidth: 5.6 }, 10, true), null);
  const fence = [{ s: 10, offset: 8, halfL: 3, halfW: 2 }];
  assert.equal(roadPathOpen(16, 2, 10, fence), false);
  assert.equal(roadPathOpen(16, 2, 30, fence), true);
  const roof = 2.72;
  assert.ok(Math.abs(vehicleClearance(roof, 1.28, Math.PI) - roof) < 0.02);
});

test("on foot, cars stop for the rider and the rider does not walk through them", () => {
  const foot = { s: 10, offset: 0, radius: 0.45, onFoot: true };
  // Bumper is already inside the circle. Check: stop short of s = 10 - 2.66.
  const into = {
    id: "into",
    s: 8.2,
    offset: 0,
    halfL: 2.15,
    halfW: 0.95,
    speed: 12,
    cruise: 12,
    prevS: 7.6,
  };
  assert.equal(holdCarsForFoot([into], [foot], 0.05), 1);
  assert.ok(into.s < 10 - 2.15 - 0.45, `drove through to ${into.s}`);
  assert.equal(into.speed, 0);
  assert.equal(into.wreck, undefined);
  assert.equal(into.footHold, true);
  const parked = into.s;
  into.prevS = into.s;
  assert.equal(holdCarsForFoot([into], [foot], 0.05), 1);
  assert.equal(into.s, parked, "the stop crept forward");
  assert.equal(into.speed, 0);
  assert.equal(recoverCruise(into, 0.05).speed, 0);

  const jumped = { id: "jump", s: 20, offset: 0, halfL: 2.15, halfW: 0.95, speed: 40, cruise: 12 };
  holdCarsForFoot([jumped], [foot], 0.5);
  assert.ok(jumped.s < 10 - 2.15 - 0.45, `one step tunneled to ${jumped.s}`);
  assert.equal(jumped.speed, 0);
  assert.equal(jumped.wreck, undefined);

  const oncoming = {
    id: "up",
    s: 12,
    offset: 0,
    halfL: 2.15,
    halfW: 0.95,
    speed: -12,
    cruise: -12,
    prevS: 12.6,
  };
  holdCarsForFoot([oncoming], [foot], 0.05);
  assert.ok(oncoming.s > 10 + 2.15 + 0.45, `oncoming drove through to ${oncoming.s}`);
  assert.equal(oncoming.speed, 0);
  assert.equal(oncoming.wreck, undefined);

  const beside = {
    id: "beside",
    s: 10,
    offset: 0,
    halfL: 2.15,
    halfW: 0.95,
    speed: 8,
    cruise: 8,
    prevS: 9.87,
  };
  holdCarsForFoot([beside], [{ s: 10, offset: 1.3, radius: 0.45, onFoot: true }], 0.016);
  assert.equal(beside.s, 10, "a rider beside the doors rewound the car");
  assert.equal(beside.speed, 8);

  const cruiser = {
    id: "ride",
    s: 8.2,
    offset: 0,
    halfL: 2.15,
    halfW: 0.95,
    speed: 12,
    cruise: 12,
    prevS: 7.6,
  };
  assert.equal(holdCarsForFoot([cruiser], [{ s: 10, offset: 0, radius: 0.5 }], 0.05), 0);
  assert.equal(cruiser.s, 8.2, "a mounted can was treated as a person");
  assert.equal(cruiser.speed, 12);

  const waiting = { s: 36, offset: 0, radius: 0.6 };
  const through = {
    id: "through",
    s: 33.4,
    offset: 0,
    halfL: 2.15,
    halfW: 0.95,
    speed: 10,
    cruise: 10,
    prevS: 32.9,
  };
  assert.equal(holdCarsForLine([through], [waiting], 0.05), 1);
  assert.ok(through.s < 36 - 2.15 - 0.6, `hit the start line at ${through.s}`);
  assert.equal(through.speed, 0);
  assert.equal(through.wreck, undefined);
  const wide = {
    id: "wide",
    s: 30,
    offset: 4,
    halfL: 2.15,
    halfW: 0.95,
    speed: 10,
    cruise: 10,
    prevS: 29.5,
  };
  assert.equal(holdCarsForLine([wide], [waiting], 0.05), 0);
  assert.equal(wide.s, 30, "a car in another lane stopped for the line");
  const packed = packTraffic([{
    id: "traffic-0",
    s: 12.345,
    offset: -0.2,
    speed: 4,
    roll: 1,
    cruise: 4,
  }]);
  assert.equal(packed[0].id, "traffic-0");
  assert.equal(packed[0].s, 12.35);
  assert.equal(packed[0].dir, 1);
  assert.equal(packed[0].paint, 0);

  foot.offset = 4;
  into.prevS = into.s;
  holdCarsForFoot([into], [foot], 0.05);
  assert.equal(into.footHold, false, "still held after the rider left the lane");

  const halfL = 2.15;
  const halfW = 0.95;
  const carS = 12;
  const overlaps = (s, offset) => {
    const along = Math.max(Math.abs(s - carS) - halfL, 0);
    const across = Math.max(Math.abs(offset) - halfW, 0);
    return Math.hypot(along, across) < 0.45 - 0.02;
  };
  const state = createRideState(8);
  state.eject = {
    canS: 80,
    canOffset: 6,
    canSpeed: 0,
    canLat: 0,
    canHop: 0,
    canVy: 0,
    canSpin: 0,
    canTilt: 0,
    bodyS: 8,
    bodyOffset: 0,
    bodyAlong: 0,
    bodyLat: 0,
    bodyHop: 0,
    bodyVy: 0,
    bodySpin: 0,
    bodyRoll: 0,
    face: 0,
  };
  const car = {
    id: "sedan",
    kind: "car",
    x: 0,
    z: -carS,
    halfL,
    halfW,
    fx: 0,
    fz: -1,
    rx: 1,
    rz: 0,
  };
  for (let step = 0; step < 40; step += 1) {
    const s = state.eject.bodyS;
    stepRide(state, {
      dt: 0.05,
      steer: 0,
      throttle: 1,
      sample: {
        x: 0,
        y: 0,
        z: -s,
        s,
        forward: { x: 0, y: 0, z: -1 },
        right: { x: 1, y: 0, z: 0 },
        halfWidth: 8,
      },
      hazards: [car],
    });
    assert.ok(state.eject, "walked back into the can");
    assert.equal(overlaps(state.eject.bodyS, state.eject.bodyOffset), false, `step ${step} s ${state.eject.bodyS}`);
  }
  assert.ok(state.eject.bodyS < carS - halfL, `walked into the bumper at ${state.eject.bodyS}`);

  state.eject.bodyS = carS;
  state.eject.bodyOffset = 2.2;
  state.eject.face = 0;
  state.eject.bodyAlong = 0;
  state.eject.bodyLat = 0;
  for (let step = 0; step < 30; step += 1) {
    const s = state.eject.bodyS;
    stepRide(state, {
      dt: 0.05,
      steer: 0,
      throttle: 0,
      strafe: -1,
      sample: {
        x: 0,
        y: 0,
        z: -s,
        s,
        forward: { x: 0, y: 0, z: -1 },
        right: { x: 1, y: 0, z: 0 },
        halfWidth: 8,
      },
      hazards: [car],
    });
    assert.equal(overlaps(state.eject.bodyS, state.eject.bodyOffset), false, `side step ${step} offset ${state.eject.bodyOffset}`);
  }
  assert.ok(state.eject.bodyOffset > halfW, `sidestepped into the door at ${state.eject.bodyOffset}`);
});

test("space hops out of the can without a crash", () => {
  const course = createCourse(4);
  const state = createRideState(START_S);
  state.speed = 8;
  state.offset = 0.2;
  const crashes = state.crashes;
  stepRide(state, {
    dt: 0.05,
    steer: 0,
    throttle: 0,
    jump: true,
    sample: sampleCourse(course, state.s),
    hazards: [],
  });
  assert.ok(state.eject, "still in the can");
  assert.equal(state.crashes, crashes);
  assert.ok(state.eject.bodyVy > 4, `hop ${state.eject.bodyVy}`);
  assert.ok(Math.abs(state.eject.bodyOffset - state.eject.canOffset) > 0.9, "landed back in the can");
  assert.ok(Math.abs(state.eject.canSpeed) > 4, "can stopped");
  const started = state.eject.canS;
  for (let step = 0; step < 8; step += 1) {
    stepRide(state, {
      dt: 0.05,
      steer: 0,
      throttle: 0,
      sample: sampleCourse(course, state.s),
      canSample: sampleCourse(course, state.eject.canS),
      hazards: [],
    });
  }
  assert.ok(state.eject, "hop remounted itself");
  assert.ok(state.eject.canS > started + 0.4, `never left the hop ${state.eject.canS - started}`);
  for (let step = 0; step < 120; step += 1) {
    stepRide(state, {
      dt: 0.05,
      steer: 0,
      throttle: 0,
      sample: sampleCourse(course, state.s),
      canSample: sampleCourse(course, state.eject.canS),
      hazards: [],
    });
  }
  assert.equal(state.eject.canSpeed, 0);
  assert.equal(state.eject.canLat, 0);
  const stopped = state.eject.canS;
  assert.ok(stopped < started + 14, `slid ${stopped - started}`);
  for (let step = 0; step < 40; step += 1) {
    stepRide(state, {
      dt: 0.05,
      steer: 0,
      throttle: 0,
      sample: sampleCourse(course, state.s),
      canSample: sampleCourse(course, state.eject.canS),
      hazards: [],
    });
  }
  assert.equal(state.eject.canS, stopped, "can slid after it stopped");
});

test("a cone hit asks the cone to fly", () => {
  const course = createCourse(4);
  const state = createRideState(START_S);
  state.speed = 8;
  const at = sampleCourse(course, state.s);
  stepRide(state, {
    dt: 0.05,
    steer: 0,
    throttle: 0,
    sample: at,
    hazards: [{ id: "cone-1", kind: "cone", x: at.x, z: at.z, radius: 0.32 }],
  });
  const flew = state.events.find((event) => event.type === "flew");
  assert.equal(flew?.id, "cone-1");
  assert.ok(Math.abs(flew.side) === 1);
});

test("a stopped car rolls again once the lane ahead opens", () => {
  const car = { kind: "car", cruise: 9, speed: 0, wreck: null };
  for (let step = 0; step < 40; step += 1) recoverCruise(car, 0.05);
  assert.ok(car.speed > 6, `speed ${car.speed}`);
  const bus = { kind: "bus", cruise: 7, speed: 0 };
  recoverCruise(bus, 0.05);
  assert.equal(bus.speed, 0);
  const wreck = { kind: "car", cruise: 9, speed: 0, wreck: {} };
  recoverCruise(wreck, 0.05);
  assert.equal(wreck.speed, 0);
});

test("the can has a solid bottom", () => {
  const material = () => new THREE.MeshStandardMaterial();
  const rider = createRider(THREE, {
    standard: material,
    lambert: () => new THREE.MeshLambertMaterial(),
    shadow: new THREE.MeshBasicMaterial(),
  }, {
    createPerson: () => new THREE.Group(),
  });
  const floor = rider.root.getObjectByName("can-floor");
  assert.ok(floor, "missing floor");
  assert.ok(floor.geometry.parameters.height > 0.04, "floor is a sheet");
  rider.root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  ray.set(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 1, 0));
  assert.ok(ray.intersectObject(floor, false).length > 0, "open from below");
  ray.set(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0));
  assert.ok(ray.intersectObject(floor, false).length > 0, "open from inside");
});

test("a person who was walked into gets back up", () => {
  const person = {
    kind: "person",
    pose: "fallen",
    was: "walk",
    force: 0.4,
    tumble: Math.PI / 2,
    roll: 0.2,
    lie: Math.PI / 2,
    down: 0.05,
    group: { userData: { pose: "fallen" } },
  };
  stepFallen(person, 0.05, []);
  assert.equal(person.pose, "fallen");
  assert.equal(person.lie, 0);
  for (let step = 0; step < 40 && person.pose === "fallen"; step += 1) stepFallen(person, 0.05, []);
  assert.equal(person.pose, "walk");
  assert.equal(person.tumble, 0);
  assert.equal(person.flop, null);
  assert.ok(person.grace > 1, `grace ${person.grace}`);

  const sitter = {
    kind: "person",
    pose: "fallen",
    was: "sit",
    force: 0.3,
    tumble: 0.02,
    roll: 0,
    lie: 0,
    down: 0,
    group: { userData: { pose: "ragdoll", flop: {} } },
  };
  stepFallen(sitter, 0.05, []);
  assert.equal(sitter.pose, "walk");
  assert.equal(sitter.group.userData.pose, "walk");
  assert.equal(sitter.group.userData.flop, null);

  const cow = { kind: "animal", pose: "fallen", tumble: 1.2, roll: 0, lie: Math.PI / 2 };
  for (let step = 0; step < 80; step += 1) stepFallen(cow, 0.05, []);
  assert.equal(cow.pose, "fallen");

  const under = {
    kind: "person",
    pose: "fallen",
    was: "talk",
    s: 10,
    offset: 1,
    force: 0.4,
    tumble: Math.PI / 2,
    roll: 0,
    lie: Math.PI / 2,
    down: 0,
  };
  const car = { s: 10, offset: 1, halfL: 2.2, halfW: 1, speed: 6 };
  for (let step = 0; step < 40; step += 1) stepFallen(under, 0.05, [car]);
  assert.equal(under.pose, "fallen");
  assert.ok(Math.abs(under.lie) > 1, `stood under the car ${under.lie}`);
});

test("a thrown person flops and a truck has a cab, bed, and grille", () => {
  const flop = createFlop(3, 1);
  const arm = flop.armL.a;
  const leg = flop.legL.a;
  for (let step = 0; step < 15; step += 1) stepFlop(flop, 0.05, false);
  assert.ok(Math.abs(flop.armL.a - arm) > 0.15, `arm stayed ${flop.armL.a}`);
  assert.ok(Math.abs(flop.armL.a - flop.legL.a) > 0.15, "limbs locked together");
  assert.notEqual(flop.legL.a, leg);

  const props = createProps(THREE, {
    lambert: () => new THREE.MeshLambertMaterial(),
    standard: () => new THREE.MeshStandardMaterial(),
    headlight: new THREE.MeshLambertMaterial(),
    taillight: new THREE.MeshLambertMaterial(),
    shadow: new THREE.MeshLambertMaterial(),
  });
  const truck = props.createCar(() => 0.2, "truck");
  assert.ok(truck.getObjectByName("truck-grille"), "no grille");
  assert.ok(truck.getObjectByName("truck-rail"), "no bed rail");
  const stack = truck.getObjectByName("truck-stack");
  assert.ok(stack && stack.position.y > 2.2, "over-cab stack");
  assert.equal(truck.userData.exhaust.smoke, true);
  assert.equal(truck.userData.exhaust.heavy, true);
  let glass = 0;
  truck.children.forEach((child) => {
    if (child.position.z < -1.9 && child.position.y > 1.2 && child.scale.y > 0.3) glass += 1;
  });
  assert.ok(glass >= 2, `windshield panes ${glass}`);

  const quietTruck = props.createCar(() => 0.95, "truck");
  assert.equal(quietTruck.getObjectByName("truck-stack"), undefined);
  assert.ok(quietTruck.getObjectByName("muffler"), "truck muffler");
  assert.equal(quietTruck.userData.exhaust.smoke, false);

  const taxi = props.createCar(() => 0.05, "taxi");
  const muffler = taxi.getObjectByName("muffler");
  assert.ok(muffler && muffler.position.y < 0.6, "regular muffler");
  assert.equal(taxi.userData.exhaust.smoke, true);
  assert.equal(taxi.userData.exhaust.heavy, false);

  const bus = props.createCar(() => 0.5, "bus");
  assert.ok(bus.getObjectByName("muffler"), "bus muffler");
  assert.equal(bus.userData.exhaust.smoke, false);
});

test("a still person stands and a moving one walks", () => {
  assert.equal(poseForTravel("walk", 0), "stand");
  assert.equal(poseForTravel("cross", 0.05), "stand");
  assert.equal(poseForTravel("walk", 0.8), "walk");
  assert.equal(poseForTravel("talk", 0), "talk");
  assert.equal(poseForTravel("phone", 0), "phone");
  assert.equal(onFootPose({ tumbling: false, moving: false }), "stand");
  assert.equal(onFootPose({ tumbling: false, moving: true }), "walk");
  assert.equal(onFootPose({ tumbling: true, moving: false }), "tumble");

  const props = createProps(THREE, { lambert: () => new THREE.MeshLambertMaterial() });
  const person = props.createPerson(() => 0.2, "stand");
  const dog = new THREE.Group();
  dog.position.y = 0.2;
  person.userData.dog = dog;
  animatePerson(person, 0.2);
  const thigh = person.userData.limbs.legL.rotation.x;
  const knee = person.userData.limbs.kneeL.rotation.x;
  animatePerson(person, 1.7);
  assert.equal(person.userData.limbs.legL.rotation.x, thigh);
  assert.equal(person.userData.limbs.kneeL.rotation.x, knee);
  assert.ok(Math.abs(thigh) < 0.05, `standing thigh ${thigh}`);
  assert.ok(knee > -0.1, `standing knee ${knee}`);
  assert.equal(dog.position.y, 0);

  person.userData.pose = "walk";
  person.position.y = 0;
  animatePerson(person, 0.2);
  const stepping = person.userData.limbs.legL.rotation.x;
  person.position.y = 0;
  animatePerson(person, 0.55);
  assert.notEqual(person.userData.limbs.legL.rotation.x, stepping);
});

test("a walker bends the forward knee and a tree is a cluster", () => {
  const props = createProps(THREE, { lambert: () => new THREE.MeshLambertMaterial() });
  const person = props.createPerson(() => 0.2, "walk");
  let forwardBent = 0;
  let backStraight = 0;
  let minFoot = 10;
  let maxFoot = -10;
  const footAt = new THREE.Vector3();
  for (let step = 0; step < 48; step += 1) {
    person.position.y = 0;
    animatePerson(person, step * 0.07);
    person.updateMatrixWorld(true);
    const thigh = person.userData.limbs.legL.rotation.x;
    const knee = person.userData.limbs.kneeL.rotation.x;
    if (thigh > 0.2 && knee < -0.5) forwardBent += 1;
    if (thigh < -0.2 && knee > -0.25) backStraight += 1;
    person.userData.limbs.footL.getWorldPosition(footAt);
    minFoot = Math.min(minFoot, footAt.y);
    maxFoot = Math.max(maxFoot, footAt.y);
  }
  assert.ok(forwardBent > 3, `forward knee ${forwardBent}`);
  assert.ok(backStraight > 3, `back knee ${backStraight}`);
  assert.ok(minFoot > -0.02 && minFoot < 0.22, `low foot ${minFoot}`);
  assert.ok(maxFoot < 0.45, `high foot ${maxFoot}`);

  person.position.y = 0;
  person.userData.pose = "ride";
  animatePerson(person, 0);
  person.updateMatrixWorld(true);
  const handAt = new THREE.Vector3();
  person.userData.limbs.handR.getWorldPosition(handAt);
  assert.ok(handAt.z < -0.12, `ride hand ${handAt.z}`);

  person.userData.pose = "talk";
  person.userData.phase = 0;
  let lifted = 0;
  const idleAt = new THREE.Vector3();
  for (let step = 0; step < 24; step += 1) {
    animatePerson(person, step * 0.2);
    person.updateMatrixWorld(true);
    person.userData.limbs.handR.getWorldPosition(handAt);
    person.userData.limbs.handL.getWorldPosition(idleAt);
    assert.ok(handAt.z < -0.2, `talk hand behind the body ${handAt.z}`);
    assert.ok(handAt.y > idleAt.y + 0.3, `talk hand down at the hip ${handAt.y}`);
    if (handAt.y > 1.4) lifted += 1;
  }
  assert.ok(lifted > 2, `talk hand never rises ${lifted}`);

  const head = person.getObjectByName("person-head");
  assert.ok(head.geometry.getAttribute("position").count > 200, "head is a modeled mesh");

  const tree = props.createTree(() => 0.4);
  let puffs = 0;
  tree.traverse((object) => {
    if (object.isMesh && object.geometry.getAttribute("position").count > 100) puffs += 1;
  });
  assert.ok(puffs >= 4, `tree puffs ${puffs}`);
});

test("dusk is a warm sunset and far buildings still fade", () => {
  const scene = new THREE.Scene();
  const lighting = createDaylight(THREE, scene);
  const course = { districts: [{ time: "dusk" }, { time: "dusk" }] };
  lighting.apply(course, 20, new THREE.Vector3());
  assert.equal(scene.fog.near, 45);
  assert.ok(Math.abs(scene.fog.far - 140) < 0.01, `fog far ${scene.fog.far}`);
  const sun = scene.children.find((child) => child.isDirectionalLight);
  assert.ok(sun.intensity > 1.1, `sun ${sun.intensity}`);
  assert.ok(sun.color.r > sun.color.b, "sun is warm");
  assert.ok(scene.fog.color.r > scene.fog.color.g, "fog stays a warm fade");
});

test("a new hill repaints traffic for that hill's seed", () => {
  const previous = globalThis.document;
  globalThis.document = {
    createElement() {
      const canvas = { width: 32, height: 32 };
      canvas.getContext = () => new Proxy({}, {
        get(_target, key) {
          if (key === "measureText") return () => ({ width: 12 });
          return () => {};
        },
        set() {
          return true;
        },
      });
      return canvas;
    },
  };
  try {
    const scene = new THREE.Scene();
    const materials = createMaterials(THREE);
    const props = createProps(THREE, materials);
    const town = createTown(THREE, scene, materials, props);
    const body = { s: 40, offset: 0, radius: 0.5, speed: 0 };
    const paints = () => town.fleet().map((car) => car.paint);
    town.update(createCourse(4), 40, 0.016, 1, body);
    const first = paints();
    assert.equal(first.length, 5);
    assert.ok(first.every((paint) => paint > 0));
    town.clear();
    town.update(createCourse(4), 40, 0.016, 1, body);
    assert.deepEqual(paints(), first);
    town.update(createCourse(9), 40, 0.016, 1, body);
    const second = paints();
    assert.equal(second.length, first.length);
    assert.ok(second.some((paint, index) => paint !== first[index]));
    town.update(createCourse(9), 40, 0.016, 1, body);
    assert.deepEqual(paints(), second);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
