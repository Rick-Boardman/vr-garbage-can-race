import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { createCourse, headingYaw, sampleCourse } from "../src/course.js";
import { VIEWS, viewIndexFor, vrViewAnchor } from "../src/views.js";

const CAN_HEIGHT = 0.98;

function desktopEye(origin, forward, cam, pitch) {
  const rig = new THREE.Group();
  const yaw = new THREE.Group();
  const camera = new THREE.Object3D();
  rig.add(yaw);
  yaw.add(camera);
  rig.position.set(origin.x, origin.y, origin.z);
  yaw.rotation.y = headingYaw(forward.x, forward.z);
  camera.position.set(cam[0], cam[1], cam[2]);
  camera.rotation.x = pitch;
  rig.updateMatrixWorld(true);
  return camera.getWorldPosition(new THREE.Vector3());
}

function headsetEye(anchor, forward, pitch, seat) {
  const rig = new THREE.Group();
  const yaw = new THREE.Group();
  const head = new THREE.Group();
  const camera = new THREE.Object3D();
  rig.add(yaw);
  yaw.add(head);
  head.add(camera);
  rig.position.set(anchor.x, anchor.y, anchor.z);
  yaw.rotation.y = headingYaw(forward.x, forward.z);
  head.rotation.x = pitch;
  camera.position.set(0, seat, 0);
  rig.updateMatrixWorld(true);
  return camera.getWorldPosition(new THREE.Vector3());
}

function closeEnough(a, b) {
  assert.ok(a.distanceTo(b) < 1e-4, `${a.toArray()} vs ${b.toArray()}`);
}

test("the first view is outside and first person is the third selection", () => {
  assert.equal(viewIndexFor(null), 0);
  assert.equal(viewIndexFor("close"), 0);
  assert.equal(viewIndexFor("far"), 1);
  assert.equal(viewIndexFor("first"), 2);
  assert.equal(VIEWS[0].id, "close");
  assert.equal(VIEWS[1].id, "far");
  assert.equal(VIEWS[2].id, "first");
  assert.ok(VIEWS[0].cam[0] > 0.4);
  assert.ok(VIEWS[0].cam[2] > 2);
  assert.ok(VIEWS[0].pitch < 0);
  assert.equal(VIEWS[0].showPerson, true);
  assert.equal(VIEWS[2].showPerson, false);
  assert.ok(VIEWS[2].pivot > CAN_HEIGHT);
});

test("a headset on the chase view lands on the desktop camera", () => {
  const view = VIEWS[0];
  const origin = { x: 10, y: 2, z: 30 };
  const forward = { x: 0, y: -0.45, z: -0.893 };
  const right = { x: 1, y: 0, z: 0 };
  const expected = desktopEye(origin, forward, view.cam, view.pitch);
  for (const seat of [0, 1.6]) {
    const anchor = vrViewAnchor(origin, right, forward, view.cam, view.pitch, seat);
    const eye = headsetEye(anchor, forward, view.pitch, seat);
    closeEnough(eye, expected);
  }
  assert.ok(expected.x > origin.x + 0.4);
  assert.ok(expected.y > origin.y + 1);
  assert.ok(expected.z > origin.z + 2);
});

test("the same anchor holds on a real grade", () => {
  const course = createCourse(7);
  const sample = sampleCourse(course, 160);
  assert.ok(Math.abs(sample.forward.y) > 0.15);
  const view = VIEWS[0];
  const origin = { x: sample.x, y: sample.y + view.pivot, z: sample.z };
  const expected = desktopEye(origin, sample.forward, view.cam, view.pitch);
  const anchor = vrViewAnchor(origin, sample.right, sample.forward, view.cam, view.pitch, 1.4);
  closeEnough(headsetEye(anchor, sample.forward, view.pitch, 1.4), expected);
});
