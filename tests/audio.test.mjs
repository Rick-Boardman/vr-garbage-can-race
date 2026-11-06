import assert from "node:assert/strict";
import test from "node:test";

import { planCues } from "../src/audio.js";

function ride(extra = {}) {
  return {
    s: 40,
    offset: 0,
    speed: 0,
    latVel: 0,
    crashes: 0,
    bumps: 0,
    nearMisses: 0,
    events: [],
    ...extra,
  };
}

function frame(extra = {}) {
  return {
    dt: 0.05,
    seed: 7,
    throttle: 0,
    hazards: [],
    ride: ride(),
    ...extra,
  };
}

test("a rolling can brings up the bed and the wind", () => {
  const plan = planCues(null, frame({ ride: ride({ speed: 10 }) }));
  assert.ok(plan.loops.soundtrack > 0.08);
  assert.ok(plan.loops.roll > 0.25);
  assert.ok(plan.loops.wind > 0.1);
  assert.equal(plan.ones.length, 0);
});

test("hopping out, crashing, and climbing back in each have their own cue", () => {
  const bail = planCues(null, frame({ ride: ride({ events: [{ type: "bail" }] }) }));
  assert.ok(bail.ones.some((cue) => cue.name === "bail"));
  assert.ok(!bail.ones.some((cue) => cue.name === "crash"));

  const ejected = planCues(null, frame({
    ride: ride({ crashes: 1, events: [{ type: "eject" }] }),
  }));
  assert.ok(ejected.ones.some((cue) => cue.name === "crash" && cue.gain > 0.8));
  assert.ok(ejected.ones.some((cue) => cue.name === "scream"));

  const mounted = planCues(null, frame({ ride: ride({ events: [{ type: "mount" }] }) }));
  assert.deepEqual(mounted.ones.map((cue) => cue.name), ["mount"]);
});

test("a hard fall screams and a soft one gasps, and an animal only thuds", () => {
  const hard = planCues(null, frame({
    ride: ride({
      crashes: 1,
      events: [{ type: "fell", who: "person", force: 0.8 }],
    }),
  }));
  assert.ok(hard.ones.some((cue) => cue.name === "scream"));
  assert.ok(!hard.ones.some((cue) => cue.name === "crash"));

  const soft = planCues(null, frame({
    ride: ride({ events: [{ type: "fell", who: "person", force: 0.3 }] }),
  }));
  assert.ok(soft.ones.some((cue) => cue.name === "gasp"));
  assert.ok(!soft.ones.some((cue) => cue.name === "scream"));

  const animal = planCues(null, frame({
    ride: ride({ events: [{ type: "fell", who: "animal", force: 0.9 }] }),
  }));
  assert.deepEqual(animal.ones.map((cue) => cue.name), ["thud"]);
});

test("potholes clunk, slicks skid, and braking squeals", () => {
  let memory = planCues(null, frame({ ride: ride({ speed: 9, latVel: 0.2 }) })).memory;
  const bump = planCues(memory, frame({ ride: ride({ speed: 8, bumps: 1, latVel: 0.2 }) }));
  assert.ok(bump.ones.some((cue) => cue.name === "bump"));

  const skid = planCues(bump.memory, frame({ ride: ride({ speed: 8, bumps: 1, latVel: 3.6 }) }));
  assert.ok(skid.ones.some((cue) => cue.name === "skid"));

  const brakes = planCues(skid.memory, frame({
    throttle: -1,
    ride: ride({ speed: 8, bumps: 1, latVel: 3.6 }),
  }));
  assert.ok(brakes.ones.some((cue) => cue.name === "brakes"));
});

test("a nearby cop sirens, traffic hums, people murmur, and a closing car honks once", () => {
  const hazards = [
    { id: "cop", kind: "car", style: "cop", s: 48, offset: 1, speed: 16 },
    { id: "bus", kind: "car", style: "bus", s: 62, offset: -1, speed: 8 },
    { id: "walker", kind: "person", s: 46, offset: 2, speed: 1 },
  ];
  const first = planCues(null, frame({ hazards, ride: ride({ speed: 7 }) }));
  assert.ok(first.loops.siren > 0.3);
  assert.ok(first.loops.traffic > 0.05);
  assert.ok(first.loops.chatter > 0.1);
  assert.ok(!first.ones.some((cue) => cue.name === "horn"));

  hazards[1] = { ...hazards[1], s: 46 };
  const second = planCues(first.memory, frame({ hazards, ride: ride({ speed: 7 }) }));
  assert.ok(second.ones.some((cue) => cue.name === "horn"));
  const third = planCues(second.memory, frame({ hazards, ride: ride({ speed: 7 }) }));
  assert.ok(!third.ones.some((cue) => cue.name === "horn"));
});

function hear(hazards, seconds, memory = null) {
  const frames = Math.round(seconds / 0.05);
  const hits = [];
  let plan = { memory };
  for (let index = 0; index < frames; index += 1) {
    plan = planCues(plan.memory, frame({ hazards }));
    for (const cue of plan.ones) {
      if (cue.name === "bark" || cue.name === "moo") hits.push({ index, ...cue });
    }
  }
  return { plan, hits };
}

test("a nearby dog barks and a nearby cow moos, and only after a wait", () => {
  const cow = { id: "cow-1-1", kind: "animal", call: "moo", s: 44, offset: 8 };
  const sheep = { id: "sheep-1-2", kind: "animal", s: 42, offset: 3 };
  const dog = { id: "person-2-4", kind: "person", call: "bark", s: 43, offset: 2 };
  const quiet = hear([cow, sheep, dog], 1.4);
  assert.equal(quiet.hits.length, 0);

  const heard = hear([cow, sheep, dog], 6.2);
  const moos = heard.hits.filter((cue) => cue.name === "moo");
  const barks = heard.hits.filter((cue) => cue.name === "bark");
  assert.equal(moos.length, 1);
  assert.equal(barks.length, 1);
  assert.ok(moos[0].index >= 30);
  assert.ok(barks[0].index >= 30);
  assert.ok(moos[0].gain > 0.2);
  assert.ok(barks[0].gain > 0.2);

  const later = hear([cow], 21);
  const gaps = [];
  for (let index = 1; index < later.hits.length; index += 1) {
    gaps.push((later.hits[index].index - later.hits[index - 1].index) * 0.05);
  }
  assert.ok(later.hits.length >= 2);
  assert.ok(gaps.every((gap) => gap >= 7));

  const away = hear([{ id: "cow-9-9", kind: "animal", call: "moo", s: 40, offset: 40 }], 8);
  assert.equal(away.hits.length, 0);
  const flock = hear([{ id: "sheep-3-1", kind: "animal", call: null, s: 41, offset: 2 }], 8);
  assert.equal(flock.hits.length, 0);

  const left = hear([cow], 0.4);
  const gone = hear([{ ...cow, s: 90 }], 3, left.plan.memory);
  assert.equal(gone.plan.memory.calls[cow.id], undefined);
  const back = hear([cow], 1, gone.plan.memory);
  assert.equal(back.hits.length, 0);
});

test("a new hill does not replay the previous crash", () => {
  const crashed = planCues(null, frame({
    seed: 1,
    ride: ride({ crashes: 2, events: [{ type: "eject" }] }),
  }));
  const next = planCues(crashed.memory, frame({ seed: 2, ride: ride() }));
  assert.equal(next.ones.length, 0);
  assert.equal(next.loops.roll, 0);
});
