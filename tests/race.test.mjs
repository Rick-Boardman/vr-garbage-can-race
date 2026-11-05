import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { createCourse, checkCourseFrame, headingYaw, sampleCourse, frameFromTangent } from "../src/course.js";
import { checkRibbonFacesUp } from "../src/road.js";
import { applyFrame } from "../src/frame.js";
import {
  inputFromHands,
  inputFromKeys,
  inputFromLook,
  inputFromTilt,
  selectRideInput,
  tiltAxes,
} from "../src/input.js";
import { createRideState, stepRide } from "../src/drive.js";
import { START_S } from "../src/constants.js";

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
});
