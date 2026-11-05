import * as THREE from "three";
import { createSceneHudBootstrap, renderHudFrame, startAnimationLoop } from "@rb/halo";

import { START_S } from "./constants.js";
import { checkCourseFrame, createCourse, districtAt, headingYaw, sampleCourse, wrapAngle } from "./course.js";
import { createDaylight } from "./daylight.js";
import { createRideState, stepRide } from "./drive.js";
import { createMaterials } from "./materials.js";
import { createProps } from "./props.js";
import { checkRibbonFacesUp } from "./road.js";
import { createRider } from "./rider.js";
import { createTown } from "./town.js";
import {
  inputFromHands,
  inputFromKeys,
  inputFromLook,
  inputFromTilt,
  selectRideInput,
  tiltAxes,
} from "./input.js";

const BEST_KEY = "garbage-can-race-best";
const VIEWS = [
  { id: "first", name: "first person", pivot: 1.62, cam: [0, 0, 0.12], pitch: -0.22, showPerson: false },
  { id: "close", name: "just behind", pivot: 0.72, cam: [0, 1.45, 3.35], pitch: -0.32, showPerson: true },
  { id: "far", name: "way back", pivot: 0.9, cam: [0, 4.8, 9.1], pitch: -0.42, showPerson: true },
];

function readBest() {
  try {
    const value = Number(sessionStorage.getItem(BEST_KEY));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeBest(value) {
  try {
    sessionStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Private mode can reject storage. The session best still shows.
  }
}

function isCoarse() {
  return window.matchMedia?.("(pointer: coarse)")?.matches === true;
}

const params = new URLSearchParams(window.location.search);
const seedParam = Number(params.get("seed"));
const viewParam = params.get("view");

let course = createCourse(Number.isFinite(seedParam) && seedParam > 0 ? seedParam : (Math.random() * 0xffffffff) >>> 0);
let ride = createRideState(START_S);
ride.best = readBest();
let viewIndex = viewParam === "first" ? 0 : viewParam === "far" ? 2 : 1;
let lastHeading = null;
let pending = { steer: 0, throttle: 0, source: "keys" };
let posed = null;
let elapsed = 0;
let hudTimer = 0;
let persistedBest = ride.best;
let latestTilt = null;
let tiltNeutral = null;
let tiltListening = false;

const point = new THREE.Vector3();

const api = {
  ready: false,
  errors: [],
  frameErrors: checkCourseFrame(course),
  ribbonErrors: checkRibbonFacesUp(),
  getState() {
    return {
      s: ride.s,
      x: posed?.x ?? 0,
      y: posed?.y ?? 0,
      z: posed?.z ?? 0,
      offset: ride.offset,
      speed: ride.speed,
      view: VIEWS[viewIndex].name,
      viewId: VIEWS[viewIndex].id,
      crashes: ride.crashes,
      nearMisses: ride.nearMisses,
      bumps: ride.bumps,
      theme: posed?.theme ?? "",
      time: posed?.time ?? "",
      seed: course.seed,
      source: pending.source,
      ready: api.ready,
    };
  },
  cycleView,
  newHill,
};
globalThis.__garbageCanRace = api;
for (const error of [...api.frameErrors, ...api.ribbonErrors]) console.error(error);
window.addEventListener("error", (event) => api.errors.push(String(event.message)));
window.addEventListener("unhandledrejection", (event) => api.errors.push(String(event.reason)));

function cycleView() {
  viewIndex = (viewIndex + 1) % VIEWS.length;
}

function setView(index) {
  if (index >= 0 && index < VIEWS.length) viewIndex = index;
}

function worldY(object) {
  object.getWorldPosition(point);
  return point.y;
}

function readHands(controllers, camera) {
  let left = null;
  let right = null;
  for (const ray of [controllers.ray0, controllers.ray1]) {
    const hand = ray?.userData?.inputSource?.handedness;
    if (hand === "left") left = ray;
    else if (hand === "right") right = ray;
  }
  if (!left || !right) return null;
  return inputFromHands({
    leftY: worldY(left),
    rightY: worldY(right),
    headY: worldY(camera),
  });
}

function onOrientation(event) {
  const angle = window.screen?.orientation?.angle ?? window.orientation ?? 0;
  const axes = tiltAxes({ beta: event.beta, gamma: event.gamma, screenAngle: angle });
  if (!tiltNeutral) tiltNeutral = { steer: axes.steerDeg, lean: axes.leanDeg };
  latestTilt = inputFromTilt({
    steerDeg: axes.steerDeg,
    leanDeg: axes.leanDeg,
    neutralSteer: tiltNeutral.steer,
    neutralLean: tiltNeutral.lean,
  });
}

function enableTilt(recalibrate) {
  if (recalibrate) tiltNeutral = null;
  if (tiltListening) return;
  const orientationEvent = window.DeviceOrientationEvent;
  if (orientationEvent && typeof orientationEvent.requestPermission === "function") {
    orientationEvent.requestPermission().then((result) => {
      if (result === "granted") startTilt();
    }).catch(() => {});
    return;
  }
  startTilt();
}

function startTilt() {
  if (tiltListening) return;
  window.addEventListener("deviceorientation", onOrientation);
  tiltListening = true;
}

window.addEventListener("pointerdown", () => {
  if (!isCoarse() || tiltListening) return;
  enableTilt(false);
});

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  const key = String(event.key || "").toLowerCase();
  if (key === "v") cycleView();
  else if (key === "1") setView(0);
  else if (key === "2") setView(1);
  else if (key === "3") setView(2);
  else if (key === "n") newHill();
});

const canvas = document.getElementById("c");
let look = null;
let town = null;
let rider = null;
let materials = null;
let daylight = null;
let player = null;
let navigation = null;
let renderer = null;
let controllers = null;

const boot = createSceneHudBootstrap({
  THREE,
  canvas,
  rigOptions: {
    fov: 72,
    near: 0.08,
    far: 650,
    vrPivotCompensation: false,
    vrResetOnEnter: false,
  },
  navigationOptions: {
    baseSpeed: 0,
    vrMoveSpeed: 0,
    zoomEnabled: false,
    debugFacingCrosshair: false,
  },
  hudOptions: {
    uiPreset: "minimal",
    hotbarSlotCount: 3,
    reserveSystemHotbarSlots: false,
    onHotbarSlot({ index }) {
      if (index === 0) cycleView();
      else if (index === 1) enableTilt(tiltListening);
      else if (index === 2) newHill();
    },
    onEnterVR() {
      const sample = sampleCourse(course, ride.s);
      if (!look) return;
      look.setYaw(headingYaw(sample.forward.x, sample.forward.z));
      look.setPitch(0);
      look.setRoll(0);
      lastHeading = headingYaw(sample.forward.x, sample.forward.z);
    },
    onExitVR() {
      if (!look) return;
      look.setPitch(0);
      look.setRoll(0);
    },
  },
  configureRenderer(next) {
    next.toneMapping = THREE.NoToneMapping;
  },
  buildWorld({ scene }) {
    materials = createMaterials(THREE);
    const props = createProps(THREE, materials);
    daylight = createDaylight(THREE, scene);
    rider = createRider(THREE, materials, props);
    scene.add(rider.root);
    town = createTown(THREE, scene, materials, props);
  },
});

({ renderer, look, navigation, controllers } = boot);
const { scene, camera, hudSystem } = boot;
player = boot.rig.player;

hudSystem.setHelpOverrideLines([
  "A / D steer. W, Shift, or X tuck. S brakes.",
  "Drag the mouse to look. Q / E yaw. R / F pitch.",
  "V or 1 2 3 changes the camera. N starts a new hill.",
  "VR: lower the left controller to steer left, the right to steer right.",
  "Lower both controllers to speed up. Raise them to lean back and brake.",
  "Phone: tilt. Allow motion when the browser asks. The TILT slot recalibrates.",
]);
hudSystem.setWindowHidden("status", true);
hudSystem.setWindowHidden("debug", true);
hudSystem.setWindowHidden("help", true);
hudSystem.setHotbarItems([
  { shortLabel: "CAM", iconText: "CAM", tooltip: "Cycle camera (V)" },
  { shortLabel: "TILT", iconText: "TILT", tooltip: "Phone tilt. Activate again to recalibrate." },
  { shortLabel: "NEW", iconText: "NEW", tooltip: "New hill (N)" },
]);
hudSystem.createWindow("race", {
  title: "HILL",
  x: 16,
  y: 16,
  w: 320,
  h: 196,
  closeable: false,
  minimizable: true,
  scrollable: false,
});

function updateHud() {
  const view = VIEWS[viewIndex];
  const district = districtAt(course, ride.s);
  const traveled = Math.max(0, ride.s - START_S);
  const best = Math.max(0, ride.best - START_S);
  hudSystem.setWindowLines("race", [
    `${Math.round(ride.speed * 3.6)} km/h`,
    `${traveled.toFixed(0)} m    best ${best.toFixed(0)} m`,
    `${district.name} · ${district.time}`,
    `crashes ${ride.crashes}   near ${ride.nearMisses}   bumps ${ride.bumps}`,
    view.name,
    `seed ${course.seed} · ${pending.source}`,
  ]);
}

function placeWorld(presenting) {
  posed = sampleCourse(course, ride.s);
  const heading = headingYaw(posed.forward.x, posed.forward.z);
  if (lastHeading == null || presenting) {
    look.setYaw(heading);
    look.setPitch(0);
    look.setRoll(0);
  } else {
    look.rotateYaw(wrapAngle(heading - lastHeading));
  }
  lastHeading = heading;

  const view = VIEWS[viewIndex];
  const shoulder = Math.abs(ride.offset) > posed.halfWidth ? 0.14 : 0;
  const hop = Math.sin(Math.min(1, ride.bump) * Math.PI) * 0.22;
  const canX = posed.x + posed.right.x * ride.offset;
  const canZ = posed.z + posed.right.z * ride.offset;
  const bank = Math.max(-0.35, Math.min(0.35, -ride.latVel * 0.05));
  rider.place(
    { ...posed, y: posed.y + shoulder },
    ride.offset,
    ride.spin,
    bank,
    hop,
    view.showPerson && !presenting,
  );
  rider.animate(elapsed);

  if (presenting) {
    player.position.set(canX, posed.y + shoulder + hop - 0.5, canZ);
    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);
  } else {
    player.position.set(canX, posed.y + shoulder + view.pivot + hop, canZ);
    const kick = ride.shake * 0.07;
    camera.position.set(
      view.cam[0] + (kick ? (Math.random() - 0.5) * kick : 0),
      view.cam[1] + (kick ? (Math.random() - 0.5) * kick : 0),
      view.cam[2],
    );
    camera.rotation.set(view.pitch, 0, 0);
    const fov = 70 + ride.speed * 0.35;
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  const lighting = daylight.apply(course, ride.s, player.position);
  materials.syncNight(lighting.night);
}

function sampleInput(presenting) {
  const yawOffset = wrapAngle(look.getYaw() - (lastHeading ?? 0));
  const lookSteer = isCoarse() && !latestTilt && !presenting
    ? inputFromLook(yawOffset, look.getPitch())
    : null;
  const keys = inputFromKeys({
    keys: navigation.keysDown,
    autoWalk: navigation.autoWalk,
    lookSteer,
  });
  return selectRideInput({
    presenting,
    hands: presenting ? readHands(controllers, camera) : null,
    tilt: latestTilt,
    keys,
    preferTilt: isCoarse() && !!latestTilt,
  });
}

function newHill(nextSeed) {
  const numeric = Number.isFinite(Number(nextSeed))
    ? (Number(nextSeed) >>> 0)
    : (Math.random() * 0xffffffff) >>> 0;
  course = createCourse(numeric || 1);
  town?.clear();
  const best = Math.max(ride.best, readBest());
  ride = createRideState(START_S);
  ride.best = best;
  persistedBest = best;
  lastHeading = null;
  pending = { steer: 0, throttle: 0, source: "keys" };
  api.frameErrors = checkCourseFrame(course);
  if (look && town) placeWorld(!!renderer?.xr?.isPresenting);
  updateHud();
}

function tick({ dt }) {
  const step = Math.min(Math.max(dt || 0, 0), 0.05);
  elapsed += step;
  const presenting = !!renderer.xr?.isPresenting;
  const hazards = town.update(course, ride.s, step, elapsed);
  const slices = Math.max(1, Math.ceil(step / 0.02));
  const slice = step / slices;
  for (let index = 0; index < slices; index += 1) {
    stepRide(ride, {
      dt: slice,
      steer: pending.steer,
      throttle: pending.throttle,
      sample: sampleCourse(course, ride.s),
      hazards,
    });
  }
  if (ride.best > persistedBest) {
    persistedBest = ride.best;
    writeBest(persistedBest);
  }
  placeWorld(presenting);
  hudTimer += step;
  if (hudTimer >= 0.2) {
    hudTimer = 0;
    updateHud();
  }
  renderHudFrame({ renderer, scene, camera, dt: step, hudSystem, navigation });
  pending = sampleInput(presenting);
  api.ready = api.frameErrors.length === 0 && api.ribbonErrors.length === 0;
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  hudSystem.handleResize?.();
});

placeWorld(false);
updateHud();
town.update(course, ride.s, 0, 0);

startAnimationLoop({
  renderer,
  THREE,
  maxDelta: 0.05,
  onFrame(payload) {
    try {
      tick(payload);
    } catch (error) {
      api.errors.push(error?.stack || String(error));
      console.error(error);
    }
  },
});
