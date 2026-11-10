// Phone tilt: asks for the motion sensor, listens, and keeps the latest ride
// input. A failure it shows (no readings yet, a retryable permission error) is
// its own, so it takes that note down again when readings arrive after all or
// a later permission attempt succeeds. A status line someone else wrote since
// is left alone.

import { inputFromTilt, requestTilt, tiltAxes, TILT_LOG } from "./input.js";

export const NO_READINGS = "No motion readings came from this phone.\nTilt cannot steer. Drag to steer.";

// win: the window (addEventListener, DeviceOrientationEvent, isSecureContext,
// screen.orientation.angle). status: { get(), set(text) }, the lobby's line.
export function createTilt({ win, status, setTimer = setTimeout, log = console, quietMs = 2000 }) {
  let input = null;
  let neutralLean = null;
  let listening = false;
  let asking = false;
  let gaveUp = false;
  let seen = false;
  let note = "";
  let shown = "";

  function report(message) {
    note = message;
    shown = message.replace(/\n/g, " ");
    log.warn(`${TILT_LOG} ${shown}`);
    status.set(shown);
  }

  function clearNote(why) {
    if (!note) return;
    note = "";
    if (status.get() === shown) status.set("");
    shown = "";
    log.info(`${TILT_LOG} ${why}`);
  }

  function onOrientation(event) {
    const angle = win.screen?.orientation?.angle ?? win.orientation ?? 0;
    const axes = tiltAxes({ beta: event?.beta, gamma: event?.gamma, screenAngle: angle });
    if (!Number.isFinite(axes.steerDeg) || !Number.isFinite(axes.leanDeg)) return;
    seen = true;
    clearNote("readings arrived");
    if (neutralLean == null) neutralLean = axes.leanDeg;
    input = inputFromTilt({
      steerDeg: axes.steerDeg,
      leanDeg: axes.leanDeg,
      neutralSteer: 0,
      neutralLean,
    });
  }

  function start() {
    if (listening) return;
    win.addEventListener("deviceorientation", onOrientation);
    listening = true;
    clearNote("permission granted");
    log.info(`${TILT_LOG} listening`);
    setTimer(() => {
      if (!seen) report(NO_READINGS);
    }, quietMs);
  }

  // Call from touchend / click / a touch pointerup, which are activating
  // gestures. A touch pointerdown is not, and iOS rejects requestPermission there.
  function enable() {
    if (listening || asking || gaveUp) return Promise.resolve();
    asking = true;
    return requestTilt({ orientationEvent: win.DeviceOrientationEvent, secure: win.isSecureContext }).then((answer) => {
      asking = false;
      if (answer.ok) {
        start();
        return;
      }
      if (!answer.retry) gaveUp = true;
      report(answer.message);
    });
  }

  return {
    enable,
    // The lean neutral is how the phone is held when a hill starts.
    resetLean() {
      neutralLean = null;
    },
    get input() {
      return input;
    },
    get note() {
      return note;
    },
  };
}
