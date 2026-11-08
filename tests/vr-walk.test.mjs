import assert from "node:assert/strict";
import test from "node:test";

import { createCourse, sampleCourse, wrapAngle } from "../src/course.js";
import { createRideState, stepRide, walkerForward } from "../src/drive.js";
import {
  faceFromHead,
  footStrafe,
  inputFromVrStick,
  selectRideInput,
  vrJumpDown,
  vrStickPair,
} from "../src/input.js";
import { VIEWS, vrFootAnchor } from "../src/views.js";

test("the headset face matches the course frame", () => {
  const forward = { x: 0, y: 0, z: -1 };
  const right = { x: 1, y: 0, z: 0 };
  assert.equal(faceFromHead(0, -1, forward, right), 0);
  assert.ok(Math.abs(faceFromHead(1, 0, forward, right) - Math.PI / 2) < 1e-6);
  assert.equal(faceFromHead(0, 0.05, forward, right), null);

  const course = createCourse(7);
  const sample = sampleCourse(course, 80);
  const head = walkerForward(sample.forward, sample.right, 0.7);
  const face = faceFromHead(head.x, head.z, sample.forward, sample.right);
  assert.ok(Math.abs(wrapAngle(face - 0.7)) < 1e-4, `face ${face}`);
  const back = walkerForward(sample.forward, sample.right, face);
  assert.ok(back.x * head.x + back.z * head.z > 0.999);
});

test("the left stick walks and strafes, and the ride lean still wins in the can", () => {
  const ahead = inputFromVrStick(0, -1);
  assert.equal(ahead.throttle, 1);
  assert.equal(ahead.strafe, 0);
  assert.equal(ahead.steer, 0);
  const side = inputFromVrStick(1, 0);
  assert.equal(side.throttle, 0);
  assert.equal(side.strafe, 1);
  assert.equal(inputFromVrStick(0.1, -0.1).throttle, 0);

  const quest = vrStickPair([0, 0, 1, 0], null);
  assert.equal(quest.index, 2);
  assert.equal(quest.lock, true);
  const touch = vrStickPair([0, -1, 0, 0], null);
  assert.equal(touch.index, 0);
  assert.equal(touch.lock, true);
  const quiet = vrStickPair([0.02, 0.01, 0.01, 0.02], null);
  assert.equal(quiet.index, 0);
  assert.equal(quiet.lock, false);
  assert.equal(vrStickPair([0.4, 0, 0.9, 0], 0).index, 0);

  const hands = { steer: -0.4, throttle: 0.5 };
  const keys = { steer: 1, throttle: 0, strafe: -1 };
  const walked = selectRideInput({
    presenting: true,
    ejected: true,
    hands,
    vrStick: ahead,
    tilt: { steer: 1, throttle: 1 },
    keys,
  });
  assert.equal(walked.source, "vr-walk");
  assert.equal(walked.throttle, 1);
  assert.equal(walked.steer, 0);
  assert.equal(footStrafe(walked.source, true, keys.strafe, side.strafe), 1);

  const stillRiding = selectRideInput({
    presenting: true,
    hands,
    vrStick: ahead,
    keys,
  });
  assert.equal(stillRiding.source, "vr");
  assert.equal(stillRiding.steer, -0.4);

  const noStick = selectRideInput({
    presenting: true,
    ejected: true,
    hands,
    vrStick: null,
    keys,
  });
  assert.equal(noStick.source, "vr");
  assert.equal(footStrafe("keys", true, -1, 0), -1);
  assert.equal(footStrafe("keys", false, -1, 0), 0);

  assert.equal(vrJumpDown([{ gamepad: { buttons: [{ pressed: true }] } }]), false);
  assert.equal(vrJumpDown([{ gamepad: { buttons: [null, null, null, null, { pressed: true }] } }]), true);
});

test("stick forward at face π/2 walks toward the right, and the standing eye is not buried", () => {
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
  state.eject.face = Math.PI / 2;
  state.eject.bodyAlong = 0;
  state.eject.bodyLat = 0;
  state.eject.bodyHop = 0;
  state.eject.bodyVy = 0;
  state.eject.bodySpin = 0;
  state.eject.bodyRoll = 0;
  state.eject.canS = state.eject.bodyS + 40;
  const offset = state.eject.bodyOffset;
  const face = state.eject.face;
  stepRide(state, {
    dt: 0.05,
    steer: 0,
    throttle: 1,
    strafe: 0,
    sample: sampleCourse(course, state.s),
    hazards: [],
  });
  assert.equal(state.eject.face, face);
  assert.ok(state.eject.bodyOffset > offset + 0.1, `offset ${state.eject.bodyOffset} from ${offset}`);

  const origin = { x: 3, y: 2, z: -4 };
  const right = { x: 1, y: 0, z: 0 };
  const forward = { x: 0, y: 0, z: -1 };
  const floor = vrFootAnchor(origin, right, forward, 1.2);
  assert.equal(floor.x, origin.x);
  assert.equal(floor.y, origin.y);
  assert.equal(floor.z, origin.z);
  const local = vrFootAnchor(origin, right, forward, 0);
  assert.equal(local.y, origin.y + VIEWS[2].pivot);
});
