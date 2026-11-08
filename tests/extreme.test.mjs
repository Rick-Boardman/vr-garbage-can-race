import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { createCourse, sampleCourse } from "../src/course.js";
import { createExtremeScraps, scrapLaunch, stepScrap } from "../src/extreme.js";

test("a scrap thrown to the right drifts across the road and falls", () => {
  const bit = {
    life: 1.2,
    s: 80,
    offset: 0,
    hop: 0.55,
    vs: 3.2,
    vo: 2.4,
    vy: 4.4,
    spin: 0,
    turn: 3.2,
  };
  assert.equal(stepScrap(bit, 0.05), true);
  assert.ok(bit.offset > 0);
  assert.ok(bit.hop > 0.55);
  assert.ok(bit.vy < 4.4);
  assert.ok(bit.s > 80);
  const launch = scrapLaunch(0, -1);
  assert.ok(launch.vo < 0);

  let falling = { ...bit, life: 0.2, hop: 0.05, vy: -0.2 };
  for (let i = 0; i < 8; i += 1) stepScrap(falling, 0.05);
  assert.equal(falling.life, 0);
});

test("extreme scraps leave the can along the road, toward the right", () => {
  const course = createCourse(7);
  const scraps = createExtremeScraps(THREE);
  const sample = sampleCourse(course, 80);
  scraps.burst(sample, 0, 1);
  scraps.step(0.05, course);
  const flying = scraps.alive();
  assert.ok(flying.length >= 8);
  assert.ok(flying.every((bit) => bit.offset > 0));
  const bit = flying[0];
  const at = sampleCourse(course, bit.s);
  const across = (bit.mesh.position.x - at.x) * at.right.x
    + (bit.mesh.position.z - at.z) * at.right.z;
  assert.ok(Math.abs(across - bit.offset) < 1e-6);
  assert.ok(Math.abs(bit.mesh.position.y - (at.y + bit.hop)) < 1e-6);
  assert.equal(bit.mesh.visible, true);
  scraps.clear();
  assert.equal(scraps.alive().length, 0);
  assert.equal(bit.mesh.visible, false);
  scraps.dispose();
});
