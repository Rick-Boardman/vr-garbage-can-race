import assert from "node:assert/strict";
import test from "node:test";

import { createOrientationInput, orientationAxes, requestOrientationPermission } from "@rb/halo/input";
import { inputFromTilt, NO_READINGS, TILT_LOG, TILT_MESSAGES } from "../src/input.js";

// Halo reads the sensor; these tests hold the ride's wording and mapping to it.
function tiltAxes(raw) {
  const axes = orientationAxes(raw);
  return { steerDeg: axes.rollDeg, leanDeg: axes.pitchDeg };
}
function ride({ steerDeg, leanDeg, neutralLean = 0 }) {
  return inputFromTilt({ roll: steerDeg, pitch: leanDeg - neutralLean });
}
function requestTilt(options) {
  return requestOrientationPermission({ ...options, messages: TILT_MESSAGES });
}

const DEG = Math.PI / 180;

// What a browser reports for a phone held at `lean` (top tipped away, degrees)
// and `roll` (right edge of the screen down, degrees) with the screen turned to
// `screenAngle`. Beta is in [-180, 180) and gamma in [-90, 90), as the spec
// gives them, so a pose past upright wraps the way a real phone does.
function reading(lean, roll, screenAngle) {
  const sx = Math.sin(roll * DEG);
  const sy = Math.cos(roll * DEG) * Math.sin(lean * DEG);
  const dz = -Math.cos(roll * DEG) * Math.cos(lean * DEG);
  const c = Math.cos(screenAngle * DEG);
  const s = Math.sin(screenAngle * DEG);
  const dx = sx * c + sy * s;
  const dy = -sx * s + sy * c;
  const gamma = Math.atan(dx / -dz) / DEG;
  const beta = Math.atan2(-dy, -dz / Math.cos(gamma * DEG)) / DEG;
  return { beta, gamma, screenAngle };
}

function near(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} != ${expected}`);
}

test("tilt axes follow the screen at every screen angle", () => {
  const poses = [
    [0, 0], [-30, 0], [20, 0], [0, 25], [0, -25],
    [-45, 15], [-70, -20], [10, 30], [-85, 10],
  ];
  for (const angle of [0, 90, 180, 270]) {
    for (const [lean, roll] of poses) {
      const axes = tiltAxes(reading(lean, roll, angle));
      near(axes.steerDeg, roll, `angle ${angle} lean ${lean} roll ${roll} steer`);
      near(axes.leanDeg, lean, `angle ${angle} lean ${lean} roll ${roll} lean`);
    }
  }
});

test("tilt axes match raw readings in portrait and landscape", () => {
  const portrait = tiltAxes({ beta: 30, gamma: 0, screenAngle: 0 });
  near(portrait.steerDeg, 0, "portrait steer");
  near(portrait.leanDeg, -30, "portrait lean");
  const rightDown = tiltAxes({ beta: 0, gamma: 20, screenAngle: 0 });
  near(rightDown.steerDeg, 20, "portrait right edge down");
  // Landscape 90: the device top is on the left, so screen right is the device bottom.
  const landscape = tiltAxes({ beta: 20, gamma: 0, screenAngle: 90 });
  near(landscape.steerDeg, 20, "landscape 90 steer");
  const away = tiltAxes({ beta: 0, gamma: 15, screenAngle: 90 });
  near(away.leanDeg, 15, "landscape 90 top away");
  const other = tiltAxes({ beta: 20, gamma: 0, screenAngle: 270 });
  near(other.steerDeg, -20, "landscape 270 steer");
  near(tiltAxes({ beta: 20, gamma: 0, screenAngle: -90 }).steerDeg, -20, "-90 is 270");
  const flipped = tiltAxes({ beta: -10, gamma: 0, screenAngle: 180 });
  near(flipped.leanDeg, -10, "portrait 180 lean");
});

test("a landscape phone held past upright does not flip the steer", () => {
  // Past upright, gamma wraps from -90 to +90 and beta jumps by 180.
  const before = reading(-88, 5, 90);
  const after = reading(-92, 5, 90);
  assert.ok(Math.abs(before.beta - after.beta) > 90 || Math.abs(before.gamma - after.gamma) > 90, "the reading should wrap");
  const a = tiltAxes(before);
  const b = tiltAxes(after);
  near(a.steerDeg, 5, "before steer");
  near(b.steerDeg, 5, "after steer");
  assert.ok(Math.abs(a.leanDeg - b.leanDeg) < 4.01, `lean jumped ${a.leanDeg} → ${b.leanDeg}`);
});

test("tilting from the neutral hold steers and throttles", () => {
  const neutral = tiltAxes(reading(-40, 0, 90)).leanDeg;
  for (const angle of [0, 90, 180, 270]) {
    const right = tiltAxes(reading(-40, 24, angle));
    const turn = ride({ ...right, neutralLean: neutral });
    assert.ok(turn.steer > 0.99, `angle ${angle} steer ${turn.steer}`);
    assert.equal(turn.throttle, 0);
    const forward = ride({ ...tiltAxes(reading(-18, 0, angle)), neutralLean: neutral });
    assert.ok(forward.throttle > 0.99, `angle ${angle} tip away ${forward.throttle}`);
    const back = ride({ ...tiltAxes(reading(-62, 0, angle)), neutralLean: neutral });
    assert.ok(back.throttle < -0.99, `angle ${angle} tip back ${back.throttle}`);
    const left = ride({ ...tiltAxes(reading(-40, -12, angle)), neutralLean: neutral });
    assert.ok(left.steer < -0.4, `angle ${angle} left ${left.steer}`);
  }
});

test("a reading without beta or gamma is no tilt input", () => {
  const axes = tiltAxes({ beta: null, gamma: null, screenAngle: 0 });
  assert.equal(ride(axes), null);
  assert.equal(ride({ steerDeg: 1, leanDeg: 1, neutralLean: Number.NaN }), null);
  assert.equal(inputFromTilt(null), null);
});

test("motion permission: granted, refused, no gesture, insecure, unsupported", async () => {
  const granted = await requestTilt({ secure: true, orientationEvent: { requestPermission: async () => "granted" } });
  assert.deepEqual(granted, { ok: true });

  const android = await requestTilt({ secure: true, orientationEvent: function DeviceOrientationEvent() {} });
  assert.deepEqual(android, { ok: true });

  const denied = await requestTilt({ secure: true, orientationEvent: { requestPermission: async () => "denied" } });
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, "denied");
  assert.equal(denied.retry, false);
  assert.match(denied.message, /refused/);

  const noGesture = await requestTilt({
    secure: true,
    orientationEvent: {
      requestPermission: async () => {
        const error = new Error("Requesting device orientation access requires a user gesture");
        error.name = "NotAllowedError";
        throw error;
      },
    },
  });
  assert.equal(noGesture.ok, false);
  assert.equal(noGesture.reason, "error");
  assert.equal(noGesture.retry, true);
  assert.match(noGesture.message, /NotAllowedError/);

  let asked = false;
  const insecure = await requestTilt({ secure: false, orientationEvent: { requestPermission: async () => { asked = true; return "granted"; } } });
  assert.equal(insecure.reason, "insecure");
  assert.equal(asked, false);
  assert.match(insecure.message, /https/);

  const none = await requestTilt({ secure: true, orientationEvent: undefined });
  assert.equal(none.reason, "unsupported");

  for (const answer of [denied, noGesture, insecure, none]) {
    assert.ok(answer.message.split("\n").length <= 2, answer.message);
  }
  assert.equal(TILT_LOG, "[gcr:tilt]");
});

// The application's tilt handlers, against a fake window, lobby line and timer.
function harness({ requestPermission, statusText = "" } = {}) {
  const listeners = {};
  const timers = [];
  const logs = [];
  const orientationEvent = requestPermission ? { requestPermission } : function DeviceOrientationEvent() {};
  const win = {
    isSecureContext: true,
    DeviceOrientationEvent: orientationEvent,
    screen: { orientation: { angle: 0 } },
    addEventListener(type, fn) { listeners[type] = fn; },
    removeEventListener(type) { delete listeners[type]; },
  };
  const lobby = { text: statusText };
  const status = { get: () => lobby.text, set: (text) => { lobby.text = text; } };
  const log = { warn: (line) => logs.push(line), info: (line) => logs.push(line) };
  const orientation = createOrientationInput({
    win, status, log, messages: TILT_MESSAGES, logPrefix: TILT_LOG, setTimer: (fn) => timers.push(fn),
  });
  const tilt = {
    enable: () => orientation.enable(),
    get note() { return orientation.note; },
    get input() { return inputFromTilt(orientation.axes); },
  };
  const orient = (beta, gamma) => listeners.deviceorientation({ beta, gamma });
  return { tilt, lobby, timers, logs, listeners, orient };
}

test("late motion readings take the no-readings failure down", async () => {
  const h = harness();
  await h.tilt.enable();
  assert.equal(typeof h.listeners.deviceorientation, "function");
  for (const fire of h.timers) fire();
  assert.equal(h.tilt.note, NO_READINGS);
  assert.equal(h.lobby.text, NO_READINGS.replace("\n", " "));
  assert.ok(h.logs.some((line) => line.startsWith(`${TILT_LOG} No motion readings`)));

  h.orient(30, 0);
  h.orient(20, 15);
  assert.equal(h.tilt.note, "");
  assert.equal(h.lobby.text, "");
  assert.ok(h.tilt.input.steer > 0.5, `steer ${h.tilt.input.steer}`);
  assert.ok(h.tilt.input.throttle > 0.4, `throttle ${h.tilt.input.throttle}`);
  assert.ok(h.logs.includes(`${TILT_LOG} readings arrived`));
});

test("late readings leave a lobby message someone else wrote", async () => {
  const h = harness();
  await h.tilt.enable();
  for (const fire of h.timers) fire();
  h.lobby.text = "Invite sent.";
  h.orient(30, 0);
  assert.equal(h.tilt.note, "");
  assert.equal(h.lobby.text, "Invite sent.");
});

test("readings in time never show a failure", async () => {
  const h = harness({ statusText: "Enter a code, or join an open game." });
  await h.tilt.enable();
  h.orient(30, 0);
  for (const fire of h.timers) fire();
  assert.equal(h.tilt.note, "");
  assert.equal(h.lobby.text, "Enter a code, or join an open game.");
});

test("a permission retry that succeeds takes the warning down and listens", async () => {
  let calls = 0;
  const h = harness({
    requestPermission: async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error("needs a user gesture");
        error.name = "NotAllowedError";
        throw error;
      }
      return "granted";
    },
  });
  await h.tilt.enable();
  assert.match(h.tilt.note, /NotAllowedError/);
  assert.match(h.lobby.text, /NotAllowedError/);
  assert.equal(h.listeners.deviceorientation, undefined);

  await h.tilt.enable();
  assert.equal(calls, 2);
  assert.equal(h.tilt.note, "");
  assert.equal(h.lobby.text, "");
  assert.equal(typeof h.listeners.deviceorientation, "function");
  h.orient(0, 20);
  assert.ok(h.tilt.input.steer > 0.7, `steer ${h.tilt.input.steer}`);
});

test("a refused permission stays shown and is not asked again", async () => {
  let calls = 0;
  const h = harness({ requestPermission: async () => { calls += 1; return "denied"; } });
  await h.tilt.enable();
  await h.tilt.enable();
  assert.equal(calls, 1);
  assert.match(h.tilt.note, /refused/);
  assert.match(h.lobby.text, /refused/);
  assert.equal(h.listeners.deviceorientation, undefined);
  assert.ok(h.logs.some((line) => line.startsWith(`${TILT_LOG} Motion was refused`)));
});
