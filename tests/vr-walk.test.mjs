import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { createCourse, sampleCourse, wrapAngle } from "../src/course.js";
import { createRideState, stepRide, walkerForward } from "../src/drive.js";
import {
  faceFromHead,
  footStrafe,
  inputFromVrStick,
  inputFromVrTurn,
  selectRideInput,
  vrJumpDown,
  vrStickPair,
} from "../src/input.js";
import { VIEWS, referenceYaw, vrFootAnchor, vrPresentRig } from "../src/views.js";

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

  assert.equal(inputFromVrTurn(1), 1);
  assert.equal(inputFromVrTurn(-1), -1);
  assert.equal(inputFromVrTurn(0.05), 0);
  const turned = selectRideInput({
    presenting: true,
    ejected: true,
    hands,
    vrStick: ahead,
    vrTurn: 1,
    keys,
  });
  assert.equal(turned.source, "vr-walk");
  assert.equal(turned.steer, 1);
  assert.equal(turned.throttle, 1);
  const stillInCan = selectRideInput({
    presenting: true,
    hands,
    vrStick: ahead,
    vrTurn: 1,
    keys,
  });
  assert.equal(stillInCan.source, "vr");
  assert.equal(stillInCan.steer, hands.steer);
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

  const forward = { x: 0, y: 0, z: -1 };
  const right = { x: 1, y: 0, z: 0 };
  const swung = walkerForward(forward, right, 0.4);
  assert.ok(swung.x > 0.3 && swung.z < -0.8, `swung ${swung.x},${swung.z}`);

  state.eject.face = 0;
  state.eject.bodyAlong = 0;
  state.eject.bodyLat = 0;
  state.eject.bodyHop = 0;
  state.eject.bodyVy = 0;
  state.eject.canS = state.eject.bodyS + 40;
  stepRide(state, {
    dt: 0.05,
    steer: 1,
    throttle: 0,
    strafe: 0,
    sample: sampleCourse(course, state.s),
    hazards: [],
  });
  assert.ok(state.eject.face > 0.1, `face ${state.eject.face}`);
  const stood = sampleCourse(course, state.eject.bodyS);
  const look = walkerForward(stood.forward, stood.right, state.eject.face);
  const across = look.x * stood.right.x + look.z * stood.right.z;
  assert.ok(across > 0, `right stick turned across ${across}`);

  const origin = { x: 3, y: 2, z: -4 };
  const floor = vrFootAnchor(origin, right, forward, 1.2);
  assert.equal(floor.x, origin.x);
  assert.equal(floor.y, origin.y);
  assert.equal(floor.z, origin.z);
  const local = vrFootAnchor(origin, right, forward, 0);
  assert.equal(local.y, origin.y + VIEWS[2].pivot);
});

test("a headset turned around in the room still looks down the road", () => {
  const level = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0, "YXZ"));
  assert.ok(Math.abs(referenceYaw(level.x, level.y, level.z, level.w) - Math.PI / 2) < 1e-6);
  assert.equal(referenceYaw(0, 0, 0, 1), 0);

  const heading = 0.4;
  const viewPitch = -0.32;
  const posePos = { x: 0.35, y: 1.45, z: -0.2 };
  const anchor = { x: 8, y: 3, z: -6 };
  const player = new THREE.Group();
  const yawNode = new THREE.Group();
  const pitchNode = new THREE.Group();
  const rollNode = new THREE.Group();
  const head = new THREE.Group();
  const cam = new THREE.PerspectiveCamera();
  player.add(yawNode);
  yawNode.add(pitchNode);
  pitchNode.add(rollNode);
  rollNode.add(head);
  head.add(cam);

  const expected = new THREE.Vector3(0, 0, -1);
  let eye = null;
  for (const turned of [0, Math.PI, -1.4, 2.2]) {
    for (const posePitch of [0, 0.35]) {
      const pose = new THREE.Quaternion().setFromEuler(new THREE.Euler(posePitch, turned, 0.15, "YXZ"));
      const py = referenceYaw(pose.x, pose.y, pose.z, pose.w);
      const placed = vrPresentRig(anchor, heading, py, viewPitch, posePos);
      if (turned === 0 && posePitch === 0) {
        assert.ok(Math.abs(placed.x - anchor.x) < 1e-6);
        assert.ok(Math.abs(placed.y - anchor.y) < 1e-6);
        assert.ok(Math.abs(placed.z - anchor.z) < 1e-6);
      }
      yawNode.rotation.set(0, placed.rigYaw, 0);
      pitchNode.rotation.set(0, 0, 0);
      rollNode.rotation.set(0, 0, 0);
      head.quaternion.set(placed.headX, placed.headY, placed.headZ, placed.headW);
      cam.position.set(posePos.x, posePos.y, posePos.z);
      cam.quaternion.copy(pose);
      player.position.set(placed.x, placed.y, placed.z);
      player.updateMatrixWorld(true);

      const look = new THREE.Quaternion()
        .setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), viewPitch))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), posePitch))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.15));
      expected.set(0, 0, -1).applyQuaternion(look);
      const dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      const align = dir.dot(expected);
      assert.ok(align > 0.999, `turned ${turned} pitch ${posePitch} aligns ${align}`);

      const pos = new THREE.Vector3();
      cam.getWorldPosition(pos);
      if (posePitch === 0) {
        if (!eye) eye = pos.clone();
        else assert.ok(pos.distanceTo(eye) < 1e-4, `eye moved ${pos.distanceTo(eye)} at yaw ${turned}`);
      }
    }
  }
  assert.ok(eye.y < anchor.y + posePos.y, "the downward pitch does not lift the eye into the hill");
});
