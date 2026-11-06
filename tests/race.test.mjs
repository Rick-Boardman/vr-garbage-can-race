import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { createCourse, checkCourseFrame, frameFromTangent, headingYaw, sampleCourse, wrapAngle } from "../src/course.js";
import { checkRibbonFacesUp } from "../src/road.js";
import { applyFrame } from "../src/frame.js";
import {
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
import { DISTRICT_LENGTH, START_S } from "../src/constants.js";
import {
  busPace,
  clearOf,
  closingOn,
  facadePush,
  lateralEvade,
  launchVelocity,
  layFlat,
  overlappingPlayer,
  personHitByCar,
  recoverCruise,
  animalRoamTarget,
  collideSweptCars,
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
} from "../src/town.js";
import { AWNING_PITCH, BENCH, SIGN_BOARD_Z, SIGN_POLE_Z, SITTER, animatePerson, createFlop, createProps, stepFlop } from "../src/props.js";
import { releasedLook, tumbleLook } from "../src/look.js";

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

  const landscape = tiltAxes({ beta: 20, gamma: 8, screenAngle: 90 });
  assert.equal(landscape.steerDeg, 20);
  assert.equal(landscape.leanDeg, -8);
  const portrait = tiltAxes({ beta: 12, gamma: 18, screenAngle: 0 });
  assert.equal(portrait.steerDeg, 18);
  assert.equal(portrait.leanDeg, 12);
  const turned = tiltAxes({ beta: 10, gamma: 4, screenAngle: 270 });
  assert.equal(turned.steerDeg, -10);
  assert.equal(turned.leanDeg, 4);
  const tilted = inputFromTilt({ steerDeg: 24, leanDeg: 22, neutralSteer: 0, neutralLean: 0 });
  assert.ok(tilted.steer > 0.9);
  assert.ok(tilted.throttle > 0.9);

  assert.ok(inputFromKeys({ keys: new Set(["A"]) }).steer < 0);
  assert.ok(inputFromKeys({ keys: new Set(["D"]) }).steer > 0);
  assert.equal(inputFromKeys({ keys: new Set(["W"]) }).throttle, 1);
  assert.equal(inputFromKeys({ keys: new Set(["S"]) }).throttle, -1);
  assert.equal(inputFromKeys({ keys: new Set(["Shift"]) }).throttle, 1);
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
  let wool = false;
  let face = false;
  sheep.traverse((object) => {
    if (object.geometry?.type === "IcosahedronGeometry") wool = true;
    if (object.geometry?.type === "SphereGeometry" && object.position.z < -0.4) face = true;
  });
  assert.equal(wool, true);
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
  assert.ok(state.eject.canSpeed > 0.4, "a grounded can may still coast");
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
  for (let step = 0; step < 30; step += 1) {
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
  assert.ok(state.eject.canS > started + 3, `rolled ${state.eject.canS - started}`);
  assert.ok(state.eject.canSpeed > 1.2, `coasted ${state.eject.canSpeed}`);
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
