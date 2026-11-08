import * as THREE from "three";
import { createSceneHudBootstrap, renderHudFrame, startAnimationLoop } from "@rb/halo";
import { createHudChatPanel } from "../node_modules/@rb/halo/src/ui/chat-panel.js";
import {
  HUD_LAYOUT_DEFAULT_HEIGHT_PX,
  HUD_LAYOUT_DEFAULT_WIDTH_PX,
} from "../node_modules/@rb/halo/src/hud-layout-policy.js";

import { createSound } from "./audio.js";
import { createGraphicsPanel, nextSettingsPlacement } from "./graphics-panel.js";
import { createHotbarIcons } from "./hotbar-icons.js";
import { RELEASE } from "./release.js";
import { FOOT_RADIUS, START_S } from "./constants.js";
import { createLobby } from "./lobby.js";
import {
  canHostDevice,
  countdownLeft,
  createPartyClient,
  applyRiderEase,
  contactsOf,
  easePose,
  holdAtLine,
  playBase,
  playSite,
  poseContacts,
  poseOf,
  wantsSolo,
  separatePack,
  settleGuestPrediction,
  slotIndex,
  stickCommand,
  takeJump,
} from "./party.js";
import { createRemoteRiders } from "./remotes.js";
import { checkCourseFrame, createCourse, districtAt, headingYaw, sampleCourse, wrapAngle } from "./course.js";
import { createDaylight } from "./daylight.js";
import { createRideState, stepRide, walkerForward } from "./drive.js";
import { createExtremeScraps, readExtreme } from "./extreme.js";
import { acceptedLook, cleanName, lookKey, nameBlock } from "./looks.js";
import { releasedLook, tumbleLook, undoTouchYaw } from "./look.js";
import { createMaterials } from "./materials.js";
import { createProps } from "./props.js";
import { checkRibbonFacesUp } from "./road.js";
import { createRider } from "./rider.js";
import { createTown } from "./town.js";
import { VIEWS, referenceYaw, viewIndexFor, vrFootAnchor, vrPresentRig, vrViewAnchor } from "./views.js";
import { layoutVrChrome } from "./vr-chrome.js";
import {
  footDragStick,
  footStrafe,
  inputFromHands,
  inputFromKeys,
  inputFromLook,
  inputFromTilt,
  inputFromVrStick,
  inputFromVrTurn,
  onFootJump,
  onFootSteer,
  selectRideInput,
  tiltAxes,
  vrJumpDown,
  vrStickPair,
} from "./input.js";

const BEST_KEY = "garbage-can-race-best";
const HOTBAR = {
  camera: 0,
  course: 1,
  settings: 2,
  style: 3,
  help: 4,
  start: 5,
  leave: 6,
  lobby: 7,
};
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
let scraps = null;
let seenCrash = 0;
let seenBumps = 0;
let seenBump = 0;
ride.best = readBest();
let viewIndex = viewIndexFor(viewParam);
let vrSeatEye = null;
let vrChromeOn = false;
let vrDesktop = null;
let vrHelpWanted = false;
const stickLocks = new WeakMap();
let head = null;
let lastHeading = null;
let yawAtFrameEnd = null;
let dragIsTouch = false;
let pending = { steer: 0, throttle: 0, jump: false, source: "keys" };
let posed = null;
let elapsed = 0;
let hudTimer = 0;
let lastFrameAt = 0;
let frameSamples = 0;
let frameTime = 0;
let frameRate = 0;
let persistedBest = ride.best;
let latestTilt = null;
let tiltNeutral = null;
let tiltListening = false;
let hudSystem = null;
let remotes = null;
let partyMode = "";
let gate = "lobby";
let hillNote = "";
let heldStartsAt = "";
let heldCode = "";
let sawSnapshot = false;
let lastSnapshotAt = 0;
let latestSnapshot = null;
let mySlot = 0;
let roomSealed = false;
let jumpSeq = 0;
let jumpHeld = false;
let relaySendAt = 0;
let chatPanel = null;
let partySlots = [];
let leavingParty = false;
let namePublish = 0;
const remoteRides = new Map();
const sticksByActor = new Map();
const shownSnapshot = new Map();
const partyClient = createPartyClient({
  base: playBase(window.location.search),
  site: playSite(window.location.hostname),
});
const lobby = createLobby({
  canHost: canHostDevice(deviceFacts()),
  onHost: (name, slots) => { void beginHost(name, slots); },
  onJoin: (code, name) => { void beginJoin(code, name); },
  onSeal: () => { void beginSeal(); },
  onLeave: () => beginLeave(),
  onAlone: () => rideAlone(),
  onInvite: (actor) => { void beginInvite(actor); },
  onAccept: () => { void beginAccept(); },
  onBack: () => backToLobby(),
  onLook: () => wearLook(),
  onName: (name) => {
    partyClient.setName(name);
    window.clearTimeout(namePublish);
    namePublish = window.setTimeout(() => {
      partyClient.publishName(name).catch((error) => {
        if (error?.code === "name_taken") lobby.setStatus(error.message || "That name is already in use.");
      });
    }, 400);
  },
});

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

function readGamepadStick(session, handedness) {
  const sources = session?.inputSources;
  if (!sources) return null;
  let gamepad = null;
  for (const source of sources) {
    if (source?.handedness === handedness && source.gamepad?.axes?.length >= 2) {
      gamepad = source.gamepad;
      break;
    }
  }
  if (!gamepad) return null;
  const pair = vrStickPair(gamepad.axes, stickLocks.get(gamepad));
  if (!pair) return null;
  if (pair.lock) stickLocks.set(gamepad, pair.index);
  return {
    x: gamepad.axes[pair.index] || 0,
    y: gamepad.axes[pair.index + 1] || 0,
  };
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

window.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "touch") dragIsTouch = true;
  else if (event.pointerType === "mouse" || event.pointerType === "pen") dragIsTouch = false;
  if (!isCoarse() || tiltListening) return;
  enableTilt(false);
});

function releaseHeldKey(event) {
  const keys = navigation?.keysDown;
  if (!keys) return;
  const raw = event?.key;
  const upper = typeof raw === "string" && raw.length === 1 ? raw.toUpperCase() : String(raw || "");
  if (upper) keys.delete(upper);
  if (event?.code === "ShiftLeft" || event?.code === "ShiftRight" || upper === "Shift") keys.delete("Shift");
  if (typeof event?.code === "string" && event.code.startsWith("Key") && event.code.length === 4) {
    keys.delete(event.code.slice(3).toUpperCase());
  }
}

// Halo ignores keyup while chat is focused, so a W released there stays down
// and you keep walking after you leave the field. Blur drops the same stuck set.
// Autowalk is a toggle, so it is left alone.
window.addEventListener("keyup", releaseHeldKey);
window.addEventListener("blur", () => {
  navigation?.keysDown?.clear();
});

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (chatFocused() || typingInDom() || lobby.stylingOpen()) return;
  const key = String(event.key || "").toLowerCase();
  if (key === "v") cycleView();
  else if (key === "1") setView(0);
  else if (key === "2") setView(1);
  else if (key === "3") setView(2);
  else if (key === "n") pressNew();
});

const canvas = document.getElementById("c");
let look = null;
let town = null;
let rider = null;
let materials = null;
let rideProps = null;
let wornKey = "";
let daylight = null;
let player = null;
let playerYaw = null;
let navigation = null;
let renderer = null;
let enterVrSupported = false;

function syncEnterVrButton() {
  const button = document.getElementById("enter-vr");
  if (!button) return;
  const lobby = document.getElementById("lobby");
  const inLobby = !!lobby && !lobby.hidden;
  button.hidden = !enterVrSupported || !!renderer?.xr?.isPresenting || !inLobby;
}
let controllers = null;

const sound = createSound();
let graphicsTyping = () => false;

const boot = createSceneHudBootstrap({
  THREE,
  canvas,
  rendererOptions: { powerPreference: "high-performance" },
  isTyping: () => chatFocused() || typingInDom() || graphicsTyping() || lobby.stylingOpen(),
  qualityCalibration: {
    cap: 1,
    onAudio(audio) {
      sound.setMaster(audio.volume);
    },
  },
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
    hotbarSlotCount: 8,
    reserveSystemHotbarSlots: false,
    onHotbarSlot({ index }) {
      if (index === HOTBAR.camera) cycleView();
      else if (index === HOTBAR.course) pressNew();
      else if (index === HOTBAR.settings) toggleGraphics();
      else if (index === HOTBAR.style) lobby.toggleStyle();
      else if (index === HOTBAR.help) {
        if (renderer?.xr?.isPresenting) vrHelpWanted = !helpOpen();
        hudSystem?.toggleHelp();
      }
      else if (index === HOTBAR.start) {
        if (gate === "waiting" && partyMode === "host") void beginSeal();
      } else if (index === HOTBAR.leave) {
        if (partyMode === "host" || partyMode === "player") beginLeave();
      } else if (index === HOTBAR.lobby) backToLobby();
    },
    onEnterVR() {
      vrSeatEye = null;
      const sample = sampleCourse(course, ride.s);
      if (!look) return;
      look.setYaw(headingYaw(sample.forward.x, sample.forward.z));
      look.setPitch(0);
      look.setRoll(0);
      lastHeading = headingYaw(sample.forward.x, sample.forward.z);
    },
    onExitVR() {
      vrSeatEye = null;
      if (!look) return;
      look.setPitch(0);
      look.setRoll(0);
    },
  },
  configureRenderer(next) {
    next.toneMapping = THREE.NoToneMapping;
    // A 2x framebuffer is four times the pixels. That alone keeps a 144 Hz
    // panel from reaching 144 once the street is cheap enough to draw.
    next.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
  },
  buildWorld({ scene }) {
    materials = createMaterials(THREE);
    rideProps = createProps(THREE, materials);
    daylight = createDaylight(THREE, scene);
    const firstLook = lobby.look();
    rider = createRider(THREE, materials, rideProps, firstLook);
    wornKey = lookKey(firstLook);
    scene.add(rider.root);
    scraps = createExtremeScraps(THREE);
    scene.add(scraps.group);
    remotes = createRemoteRiders(THREE, scene, materials, rideProps);
    town = createTown(THREE, scene, materials, rideProps);
  },
});

({ renderer, look, navigation, controllers } = boot);
const quality = boot.quality;
sound.attach(renderer);
api.audio = () => sound.status();
const { scene, camera } = boot;
hudSystem = boot.hudSystem;
player = boot.rig.player;
playerYaw = boot.rig.playerYaw;
head = boot.rig.head;
const enterVrButton = document.getElementById("enter-vr");
if (enterVrButton) {
  enterVrButton.addEventListener("click", () => {
    void hudSystem.enterVR?.();
  });
  const vrCheck = navigator.xr?.isSessionSupported?.("immersive-vr");
  if (vrCheck) {
    vrCheck.then((supported) => {
      enterVrSupported = !!supported;
      syncEnterVrButton();
    }).catch(() => {});
  }
}

hudSystem.setHelpOverrideLines([
  "In the can",
  "A and D steer. W or Shift goes faster. S brakes.",
  "The road splits. Steer to one side. The two roads meet again.",
  "X toggles auto walk. Space hops out of the can.",
  "Drag looks around. N starts a new hill.",
  "",
  "On foot",
  "A and D strafe. Q and E turn. W walks the way you face.",
  "X keeps walking. Space jumps. Drag walks and turns.",
  "Walk back to the can to get in.",
  "",
  "Camera",
  "V or 1 2 3 changes the camera.",
  "1 sits just behind the can, looking down the road and a bit to the right.",
  "2 sits farther back. 3 looks out from the can.",
  "",
  "Headset",
  "Enter VR is the button at the top right.",
  "Lower the left controller to steer left, the right to steer right.",
  "Lower both controllers to speed up. Raise them to lean back and brake.",
  "In the can you look down the road.",
  "Out of the can, the left stick walks and strafes.",
  "The right stick turns the view and the way you walk. X or A jumps.",
  "",
  "Phone",
  "Tilt the phone. Allow motion when the browser asks.",
]);
hudSystem.setWindowHidden("status", true);
hudSystem.setWindowHidden("debug", true);
const hotbarIcons = createHotbarIcons(THREE);
hudSystem.setHotbarItems([
  { shortLabel: "CAM", tooltip: "Cycle camera (V)", iconTexture: hotbarIcons.camera, showNumber: false },
  { shortLabel: "NEW", tooltip: "New hill (N)", iconTexture: hotbarIcons.course, showNumber: false },
  { shortLabel: "GFX", tooltip: "Graphics and sound", iconTexture: hotbarIcons.gear, showNumber: false },
  { shortLabel: "STYLE", tooltip: "Character styling", iconTexture: hotbarIcons.style, showNumber: false },
  { shortLabel: "HELP", tooltip: "How to play", iconTexture: hotbarIcons.help, showNumber: false },
  { shortLabel: "START", tooltip: "Start the countdown", iconTexture: hotbarIcons.start, showNumber: false, interactive: false, bgOpacity: 0.34, outlineOpacity: 0.28 },
  { shortLabel: "LEAVE", tooltip: "Leave the room", iconTexture: hotbarIcons.leave, showNumber: false, interactive: false, bgOpacity: 0.34, outlineOpacity: 0.28 },
  { shortLabel: "LOBBY", tooltip: "Lobby", iconTexture: hotbarIcons.lobby, showNumber: false },
]);
// Settings boots off the screen. Opening it here is what put GRAPHICS up
// before the rider asked for it.
if (typeof hudSystem.setWindowLines === "function") {
  hudSystem.setWindowLines("settings", []);
  const setWindowLines = hudSystem.setWindowLines.bind(hudSystem);
  hudSystem.setWindowLines = (key, lines, options) => {
    if (key === "settings") return;
    setWindowLines(key, lines, options);
  };
}
const graphicsPanel = quality
  ? createGraphicsPanel({
      THREE,
      hudSystem,
      calibration: quality,
      renderer,
      notes: settingsNotes,
    })
  : null;
graphicsTyping = () => !!graphicsPanel?.isTyping();
{
  const win = settingsWindow();
  if (win) {
    if (!(win.minW >= 440)) win.minW = 440;
    if (!(win.minH >= 520)) win.minH = 520;
  }
}
let settingsMoved = false;
let settingsWanted = false;
function settingsWindow() {
  return hudSystem.hud?.ui?.windows?.settings ?? null;
}
function graphicsOpen() {
  const win = settingsWindow();
  return !!win && win.y > -1000;
}
function toggleGraphics() {
  settingsWanted = !graphicsOpen();
  hudSystem?.toggleSettings();
}
function placeSettings() {
  const win = settingsWindow();
  const layoutW = Number(hudSystem.hud?.layoutW) || 0;
  // A saved layout can put GRAPHICS back on screen. Keep that spot for the
  // next open, then leave the panel hidden until GFX is pressed.
  if (!settingsWanted && win && win.y > -1000) {
    settingsMoved = true;
    hudSystem.toggleSettings();
  }
  if (settingsWanted) {
    settingsMoved = nextSettingsPlacement(win, layoutW, settingsMoved);
  }
  const items = hudSystem.hud?.ui?.data?.hotbarItems;
  if (!Array.isArray(items)) return;
  if (items[HOTBAR.settings]) items[HOTBAR.settings].active = graphicsOpen();
  if (items[HOTBAR.style]) items[HOTBAR.style].active = lobby.styleOpen();
  if (items[HOTBAR.help]) items[HOTBAR.help].active = helpOpen();
  syncHillSlots(items);
}
function holdVrPanels() {
  const ui = hudSystem?.hud?.ui;
  // Halo grids every open panel across the headset. That covers the road.
  if (ui) ui._vrAutoLayoutDone = true;
  layoutVrChrome({
    windows: ui?.windows,
    layoutW: HUD_LAYOUT_DEFAULT_WIDTH_PX,
    layoutH: HUD_LAYOUT_DEFAULT_HEIGHT_PX,
    helpWanted: vrHelpWanted,
    settingsWanted,
  });
}
function captureVrDesktop() {
  const windows = hudSystem?.hud?.ui?.windows;
  if (!windows) return;
  const saved = {};
  for (const key of Object.keys(windows)) {
    const win = windows[key];
    if (!win) continue;
    saved[key] = { x: win.x, y: win.y };
  }
  vrDesktop = saved;
}
function restoreVrDesktop() {
  const windows = hudSystem?.hud?.ui?.windows;
  const saved = vrDesktop;
  vrDesktop = null;
  if (!windows || !saved) return;
  for (const key of Object.keys(saved)) {
    const win = windows[key];
    const spot = saved[key];
    if (!win || !spot) continue;
    win.x = spot.x;
    win.y = spot.y;
  }
}
let helpPlaced = false;
function helpWindow() {
  return hudSystem.hud?.ui?.windows?.help ?? null;
}
function helpOpen() {
  const win = helpWindow();
  return !!win && win.y > -1000;
}
function syncHillSlots(items) {
  const canStart = gate === "waiting" && partyMode === "host";
  const canLeave = partyMode === "host" || partyMode === "player";
  const start = items[HOTBAR.start];
  const leave = items[HOTBAR.leave];
  if (start) {
    start.interactive = canStart;
    start.bgOpacity = canStart ? 0.98 : 0.34;
    start.outlineOpacity = canStart ? 0.98 : 0.28;
  }
  if (leave) {
    leave.interactive = canLeave;
    leave.bgOpacity = canLeave ? 0.98 : 0.34;
    leave.outlineOpacity = canLeave ? 0.98 : 0.28;
  }
}
function placeHelp() {
  if (helpPlaced) return;
  const hud = hudSystem.hud;
  if (!hud?.ui?._layoutInitialized) return;
  const win = helpWindow();
  if (!win) return;
  helpPlaced = true;
  if (win.y > -1000) return;
  hudSystem.toggleHelp();
  const layoutH = Number(hud.layoutH) || 0;
  win.x = 16;
  win.y = 302;
  if (layoutH > win.h + 32) {
    win.y = Math.min(win.y, Math.max(16, layoutH - win.h - 16));
  }
  win._helpHiddenX = win.x;
  win._helpHiddenY = win.y;
}
function liftHotbarTooltip() {
  const hud = hudSystem.hud;
  if (!hud || renderer?.xr?.isPresenting) return;
  const tip = hud.overlay?.tooltip;
  if (!tip?.visible || !String(tip._hoverId || "").startsWith("hotbar:")) return;
  const layoutH = Number(hud.layoutH);
  if (!(layoutH > 1)) return;
  const bar = hud.ui?.windows?.hotbar;
  if (!bar || bar.y < -1000) return;
  const bg = hud.objects?.overlay?.tooltipBg;
  const text = hud.objects?.overlay?.tooltipText?.mesh;
  if (!bg?.visible || !Number.isFinite(bg.position?.y) || !Number.isFinite(bg.scale?.y)) return;
  const height = Math.abs(bg.scale.y) * layoutH;
  if (!(height > 1)) return;
  const centerY = (0.5 - bg.position.y) * layoutH;
  const currentTop = centerY - height / 2;
  const top = Math.max(8, bar.y - height - 8);
  const delta = currentTop - top;
  if (delta <= 1) return;
  const local = delta / layoutH;
  bg.position.y += local;
  if (text?.position) text.position.y += local;
}
function inputLabel() {
  if (pending.source === "vr") return "Controls: headset";
  if (pending.source === "tilt") return "Controls: phone tilt";
  return "Controls: keyboard";
}
function settingsNotes() {
  const lines = [];
  if (course?.seed != null) lines.push(`This hill was grown from ${course.seed}`);
  lines.push(inputLabel());
  if (partyClient?.code) lines.push(`Room ${partyClient.code}`);
  lines.push(`Release ${RELEASE.commit}`, RELEASE.date);
  return lines;
}
hudSystem.createWindow("race", {
  title: "STATUS",
  x: 16,
  y: 16,
  w: 420,
  h: 270,
  closeable: false,
  minimizable: true,
  scrollable: false,
});
let hudSkin = null;
function applyHudSkin(keys) {
  if (!hudSystem?.loadWindowSkinTextures || !hudSystem?.applyWindowSkinToWindows) return;
  if (!hudSkin) hudSkin = hudSystem.loadWindowSkinTextures("assets/hud/");
  hudSystem.applyWindowSkinToWindows(keys, hudSkin, { cornerSize: 40 });
}
applyHudSkin(["race", "settings", "help"]);

function updateHud() {
  const district = districtAt(course, ride.s);
  const traveled = Math.max(0, ride.s - START_S);
  const best = Math.max(0, ride.best - START_S);
  if (frameTime > 0) {
    frameRate = frameSamples / frameTime;
    frameSamples = 0;
    frameTime = 0;
  }
  const lines = [
    `${district.name} · ${district.time}`,
    `${Math.round(ride.speed * 3.6)} km/h`,
  ];
  if (frameRate > 0) lines.push(`${Math.round(frameRate)} fps`);
  lines.push(
    `${traveled.toFixed(0)} m    best ${best.toFixed(0)} m`,
    `crashes ${ride.crashes}   near ${ride.nearMisses}   bumps ${ride.bumps}   bonus ${Math.floor(ride.bonus || 0)}`,
  );
  if (hillNote) {
    for (const line of hillNote.split("\n")) {
      if (line) lines.push(line);
    }
  }
  hudSystem.setWindowLines("race", lines);
}

function correctTouchDragYaw() {
  if (!dragIsTouch || yawAtFrameEnd == null || !look) return;
  const corrected = undoTouchYaw(yawAtFrameEnd, look.getYaw());
  if (Math.abs(wrapAngle(corrected - look.getYaw())) > 1e-6) look.setYaw(corrected);
}

function placeWorld(presenting) {
  // A finger drag has to be turned around before face and steer read it.
  correctTouchDragYaw();
  const ejected = ride.eject;
  const followS = ejected ? ejected.bodyS : ride.s;
  const followOffset = ejected ? ejected.bodyOffset : ride.offset;
  posed = sampleCourse(course, followS);
  const dragging = !presenting && !!navigation?.isLookDragging;
  const thrown = !!(ejected && !ejected.bail && (
    Math.hypot(ejected.bodyAlong || 0, ejected.bodyLat || 0) > 1.4
    || Math.abs(ejected.bodySpin || 0) > 0.12
    || Math.abs(ejected.bodyRoll || 0) > 0.12
  ));
  // Positive yaw looks left. Face grows toward sample.right, so a leftward
  // drag decreases face and the next heading follows the body.
  // While the rider is tumbling, the lens follows that spin instead of the drag.
  if (ejected && !presenting && dragging && !thrown && lastHeading != null) {
    const yawDelta = wrapAngle(look.getYaw() - lastHeading);
    ejected.face = wrapAngle((ejected.face || 0) - yawDelta);
  }
  const facing = ejected
    ? walkerForward(posed.forward, posed.right, ejected.face || 0)
    : null;
  const courseHeading = headingYaw(posed.forward.x, posed.forward.z);
  // On foot, eject.face is the view and the walk. The right stick owns it.
  // In the can, heading stays on the course. The headset yaw is cancelled
  // below so a rider turned around in the room still looks along heading.
  const heading = facing
    ? headingYaw(facing.x, facing.z)
    : courseHeading;
  // A touch drag holds its pitch for the whole press. Zeroing it here
  // threw the walk stick away before sampleInput could read it.
  const fingerDown = ejected && !presenting && dragging && dragIsTouch;
  if (ejected && !presenting) {
    look.setYaw(heading);
    if (!fingerDown) look.setPitch(0);
    look.setRoll(0);
  } else if (lastHeading == null || presenting) {
    look.setYaw(heading);
    look.setPitch(0);
    look.setRoll(0);
  } else {
    const next = releasedLook({
      dragging,
      heading,
      yaw: look.getYaw(),
      pitch: look.getPitch(),
      roll: look.getRoll(),
    });
    if (next.released) {
      look.setYaw(next.yaw);
      look.setPitch(next.pitch);
      look.setRoll(next.roll);
    } else {
      look.rotateYaw(wrapAngle(heading - lastHeading));
    }
  }
  lastHeading = heading;

  const view = VIEWS[viewIndex];
  const shoulder = Math.abs(followOffset) > posed.halfWidth ? 0.14 : 0;
  const bumpHop = Math.sin(Math.min(1, ride.bump) * Math.PI) * 0.22;
  const air = ejected ? 0 : (ride.hop || 0);
  const bodyAir = ejected ? (ejected.bodyHop || 0) : 0;
  const meshHop = (ejected ? 0 : bumpHop) + air;
  const viewHop = ejected ? bodyAir : bumpHop * 0.25 + Math.min(0.08, air * 0.15);
  const followX = posed.x + posed.right.x * followOffset;
  const followZ = posed.z + posed.right.z * followOffset;
  rider.setName(lobby.name());
  rider.setTuck?.(ejected ? 0 : Math.max(0, pending.throttle || 0));
  if (ejected) {
    const canSample = sampleCourse(course, ejected.canS);
    rider.placeApart({
      canSample,
      canOffset: ejected.canOffset,
      canSpin: ejected.canSpin,
      canTilt: ejected.canTilt,
      canHop: ejected.canHop,
      bodySample: posed,
      bodyOffset: followOffset,
      bodyHop: ejected.bodyHop || 0,
      bodySpin: ejected.bodySpin || 0,
      bodyRoll: ejected.bodyRoll || 0,
      facing,
      showPerson: presenting ? false : view.showPerson,
      moving: Math.hypot(pending.throttle || 0, pending.strafe || 0) > 0.08
        || Math.hypot(ejected.bodyAlong || 0, ejected.bodyLat || 0) > 0.35,
    });
  } else {
    const bank = Math.max(-0.35, Math.min(0.35, -ride.latVel * 0.05));
    rider.place(
      { ...posed, y: posed.y + shoulder },
      ride.offset,
      ride.spin,
      bank,
      meshHop,
      view.showPerson,
    );
  }
  rider.animate(elapsed);

  if (presenting) {
    const sensed = Number(renderer?.xr?.getCamera?.()?.position?.y);
    if (Number.isFinite(sensed)) {
      if (vrSeatEye == null) vrSeatEye = sensed;
      else if (vrSeatEye === 0 && Math.abs(sensed) > 0.2) vrSeatEye = sensed;
    }
    const onFoot = !!ejected;
    const pitch = onFoot ? 0 : view.pitch;
    const eye = onFoot
      ? vrFootAnchor(
        { x: followX, y: posed.y + shoulder + viewHop, z: followZ },
        posed.right,
        posed.forward,
        vrSeatEye ?? 0,
      )
      : vrViewAnchor(
        { x: followX, y: posed.y + shoulder + view.pivot + viewHop, z: followZ },
        posed.right,
        posed.forward,
        view.cam,
        view.pitch,
        vrSeatEye ?? 0,
      );
    // look yaw stays the road (or the walk face). The node yaw cancels the
    // headset so the picture matches that heading. Set this after setYaw,
    // which writes the logical heading onto the node.
    const xrCam = renderer?.xr?.getCamera?.();
    const poseQ = xrCam?.quaternion;
    const poseP = xrCam?.position;
    const placed = vrPresentRig(
      eye,
      heading,
      poseQ ? referenceYaw(poseQ.x, poseQ.y, poseQ.z, poseQ.w) : 0,
      pitch,
      poseP,
    );
    if (playerYaw) playerYaw.rotation.set(0, placed.rigYaw, 0);
    player.position.set(placed.x, placed.y, placed.z);
    if (head) head.quaternion.set(placed.headX, placed.headY, placed.headZ, placed.headW);
    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);
  } else {
    if (head) head.rotation.set(0, 0, 0);
    player.position.set(followX, posed.y + shoulder + view.pivot + viewHop, followZ);
    const kickScale = readExtreme() ? 0.35 : 0.012;
    const kick = ride.shake > 0.02 ? ride.shake * kickScale : 0;
    camera.position.set(
      view.cam[0] + (kick ? (Math.random() - 0.5) * kick : 0),
      view.cam[1] + (kick ? (Math.random() - 0.5) * kick : 0),
      view.cam[2],
    );
    const lens = tumbleLook({
      bodySpin: ejected ? ejected.bodySpin || 0 : 0,
      bodyRoll: ejected ? ejected.bodyRoll || 0 : 0,
      settled: !thrown,
      viewPitch: view.pitch,
    });
    camera.rotation.set(lens.pitch, 0, lens.roll);
    const fov = 70 + ride.speed * 0.35;
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    // Halo sizes this quad once, from the field of view at boot. A toss
    // drops speed to 0 and the view narrows, so the same quad sticks out
    // past the top-left and the title bar leaves the screen.
    fitHudToCamera();
  }

  const lighting = daylight.apply(course, ride.s, player.position);
  materials.syncNight(lighting.night);
}

function fitHudToCamera() {
  const root = hudSystem?.hud?.root;
  if (!root || !camera) return;
  const distance = Math.abs(root.position.z);
  if (!(distance > 0.05)) return;
  const fovRad = THREE.MathUtils.degToRad(camera.fov);
  const viewH = 2 * distance * Math.tan(fovRad / 2);
  const aspect = camera.aspect > 0 ? camera.aspect : 1;
  root.scale.set(viewH * aspect, viewH, 1);
}

function sampleInput(presenting) {
  // An open dresser holds the can. Throttle 0 only coasts, so a moving shell
  // brakes until the panel closes. On foot, 0 plants the feet.
  if (lobby.stylingOpen()) {
    return {
      steer: 0,
      throttle: held() || ride.eject ? 0 : -1,
      jump: false,
      strafe: 0,
      source: pending.source,
    };
  }
  if (held() || chatFocused() || typingInDom()) {
    return { steer: 0, throttle: 0, jump: false, strafe: 0, source: pending.source };
  }
  const yawOffset = wrapAngle(look.getYaw() - (lastHeading ?? 0));
  const dragging = !!navigation?.isLookDragging;
  const finger = footDragStick({
    ejected: !!ride.eject,
    dragging,
    touch: dragIsTouch,
    pitch: look.getPitch(),
  });
  const lookSteer = !finger && isCoarse() && !latestTilt && !presenting
    ? inputFromLook(yawOffset, look.getPitch())
    : null;
  const keys = inputFromKeys({
    keys: navigation.keysDown,
    autoWalk: navigation.autoWalk,
    lookSteer,
  });
  if (ride.eject) {
    keys.strafe = keys.steer;
    keys.steer = dragging ? 0 : onFootSteer(0, navigation.keysDown);
  } else {
    keys.strafe = 0;
  }
  if (finger && keys.throttle === 0) keys.throttle = finger.throttle;
  const session = presenting && ride.eject ? renderer.xr.getSession?.() : null;
  const leftStick = session ? readGamepadStick(session, "left") : null;
  const rightStick = session ? readGamepadStick(session, "right") : null;
  const vrStick = leftStick ? inputFromVrStick(leftStick.x, leftStick.y) : null;
  const selected = selectRideInput({
    presenting,
    ejected: !!ride.eject,
    hands: presenting ? readHands(controllers, camera) : null,
    vrStick,
    vrTurn: rightStick ? rightStick.x : 0,
    tilt: finger ? null : latestTilt,
    keys,
    preferTilt: !finger && isCoarse() && !!latestTilt,
  });
  selected.jump = onFootJump(navigation.keysDown);
  if (presenting && ride.eject && vrJumpDown(session?.inputSources)) {
    selected.jump = true;
  }
  selected.strafe = footStrafe(selected.source, !!ride.eject, keys.strafe, selected.strafe);
  if (presenting && ride.eject && selected.source !== "vr-walk") {
    selected.steer = inputFromVrTurn(rightStick ? rightStick.x : 0);
  }
  return selected;
}

function held() {
  return gate === "lobby" || gate === "waiting" || gate === "countdown";
}

function pressNew() {
  const onHill = gate === "waiting" || gate === "countdown" || gate === "racing" || gate === "solo";
  if (partyMode) leaveParty("Left the room.", { tellHost: true });
  if (onHill) {
    newHill();
    gate = "solo";
    showHill("back");
    return;
  }
  rideAlone();
}

function newHill(nextSeed) {
  const explicit = arguments.length > 0 && Number.isFinite(Number(nextSeed));
  if (!explicit && partyMode) leaveParty("Left the room.", { tellHost: true });
  const numeric = Number.isFinite(Number(nextSeed))
    ? (Number(nextSeed) >>> 0)
    : (Math.random() * 0xffffffff) >>> 0;
  course = createCourse(numeric || 1);
  town?.clear();
  const best = Math.max(ride.best, readBest());
  ride = createRideState(START_S);
  ride.best = best;
  seenCrash = 0;
  seenBumps = 0;
  seenBump = 0;
  scraps?.clear();
  persistedBest = best;
  lastHeading = null;
  pending = { steer: 0, throttle: 0, jump: false, strafe: 0, source: "keys" };
  api.frameErrors = checkCourseFrame(course);
  if (look && town) placeWorld(!!renderer?.xr?.isPresenting);
  updateHud();
}

function deviceFacts() {
  const width = window.screen?.width || window.innerWidth || 1000;
  const height = window.screen?.height || window.innerHeight || 1000;
  const userAgent = navigator.userAgent || "";
  return {
    userAgent,
    screenMin: Math.min(width, height),
    touchPoints: navigator.maxTouchPoints || 0,
    headset: /OculusBrowser|\bQuest\b/i.test(userAgent),
  };
}

function chatFocused() {
  return !!chatPanel?.isTyping?.();
}

function typingInDom() {
  const tag = document.activeElement?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA";
}

function rememberSlots(rows) {
  partySlots = (rows || []).map((row) => ({
    slot: slotIndex(row),
    actor: row.actor || "",
    displayName: row.displayName || "",
    role: row.role || "",
  })).filter((row) => row.slot != null);
  partyClient.noteSlots(partySlots);
  lobby.setSlots(partySlots);
  if (partyMode !== "host") return;
  for (const row of partySlots) {
    if (row.slot === mySlot) continue;
    const waiting = sticksByActor.get(row.actor);
    if (!waiting) continue;
    const entry = ensureRemote(row.slot);
    entry.stick = waiting;
    noteLook(entry, waiting);
    sticksByActor.delete(row.actor);
    if (held()) continue;
    wakeRemote(entry);
    entry.lastStickAt = performance.now();
  }
}

function slotFromActor(actor) {
  const found = partySlots.find((row) => row.actor === actor);
  return found ? found.slot : null;
}

function wakeRemote(entry) {
  // Held at rest so an empty slot does not coast. The first stick starts it
  // at the same speed a new hill gives the local can.
  if (entry.lastStickAt !== 0) return;
  entry.state.speed = createRideState(entry.state.s).speed;
}

function noteLook(entry, event) {
  const look = acceptedLook(event);
  if (look) entry.look = look;
}

function lookFields(raw) {
  const look = acceptedLook(raw);
  if (!look) return {};
  return { ...look };
}

function nameForSlot(slot, entry) {
  if (slot === mySlot) return cleanName(lobby.name());
  return cleanName(entry?.name) || cleanName(partySlots.find((row) => row.slot === slot)?.displayName);
}

function wearLook() {
  if (!rideProps || !materials || !rider) return;
  const next = lobby.look();
  const key = lookKey(next);
  if (key === wornKey) return;
  const parent = rider.root.parent;
  const old = rider.root;
  const position = old.position.clone();
  const quaternion = old.quaternion.clone();
  const scale = old.scale.clone();
  rider.dispose?.();
  old.removeFromParent();
  rider = createRider(THREE, materials, rideProps, next);
  rider.root.position.copy(position);
  rider.root.quaternion.copy(quaternion);
  rider.root.scale.copy(scale);
  wornKey = key;
  if (parent) parent.add(rider.root);
}

function nameRoster() {
  return [...(partyClient.people || []), ...partySlots];
}

function refuseName(name) {
  const problem = nameBlock(name, nameRoster(), partyClient.actor, { join: true });
  if (!problem) return false;
  lobby.setStatus(problem);
  return true;
}

function ensureRemote(slot) {
  let entry = remoteRides.get(slot);
  if (!entry) {
    const state = createRideState(START_S);
    state.speed = 0;
    state.seenJump = 0;
    entry = { state, stick: null, lastStickAt: 0 };
    remoteRides.set(slot, entry);
  }
  return entry;
}

function dropSlot(slot) {
  if (slot == null) return;
  remoteRides.delete(slot);
  partySlots = partySlots.filter((row) => row.slot !== slot);
  partyClient.noteSlots(partySlots);
  lobby.setSlots(partySlots);
}

function openChat() {
  if (chatPanel || !hudSystem) return;
  chatPanel = createHudChatPanel({
    hudSystem,
    renderer,
    transport: partyClient.chatTransport(),
    key: "race-chat",
    title: "RIDERS",
    x: 448,
    y: 16,
    w: 360,
    h: 260,
    composerHeight: 72,
    open: true,
  });
  applyHudSkin(["race-chat"]);
  hudSystem.bringToFront("race");
}

function leaveParty(message, { tellHost = false } = {}) {
  if (leavingParty) return;
  leavingParty = true;
  const role = partyMode;
  partyMode = "";
  gate = "lobby";
  heldStartsAt = "";
  heldCode = "";
  sawSnapshot = false;
  latestSnapshot = null;
  lastSnapshotAt = 0;
  roomSealed = false;
  partySlots = [];
  sticksByActor.clear();
  remoteRides.clear();
  shownSnapshot.clear();
  try {
    if (tellHost && role === "host") partyClient.close().catch(() => {});
    else if (tellHost && role === "player") partyClient.leave().catch(() => {});
    partyClient.stop();
    chatPanel?.dispose();
    chatPanel = null;
    remotes?.clear();
    lobby.setCountdown("");
    lobby.setRoom(null);
    lobby.setSlots([]);
    lobby.show();
    hillNote = "";
    lobby.setHillChrome("none");
    lobby.bindChat(partyClient.lobbyTransport());
    if (message) lobby.setStatus(message);
  } finally {
    leavingParty = false;
  }
}

function showHill(chrome, note = "") {
  lobby.hide();
  hillNote = typeof note === "string" ? note : "";
  lobby.setHillChrome(chrome);
}

function waitingNote() {
  const code = partyClient.code;
  if (gate !== "waiting" || !code) return "";
  if (partyMode === "host") {
    return `Waiting at the start line. Others join with ${code}.\nThe start slot begins the ride.`;
  }
  return `Waiting at the start line.\nThe host starts ${code}.`;
}

function hillChrome() {
  if (gate === "waiting" && partyMode === "host") return "host";
  if (gate === "solo") return "back";
  return "leave";
}

function rideAlone() {
  if (partyMode) leaveParty("", { tellHost: true });
  gate = "solo";
  wearLook();
  if (!ride.eject) ride.speed = createRideState(START_S).speed;
  lobby.setCountdown("");
  showHill("back");
}

function backToLobby() {
  if (partyMode) leaveParty("", { tellHost: true });
  gate = "lobby";
  holdAtLine(ride, START_S);
  hillNote = "";
  lobby.setCountdown("");
  lobby.show();
  lobby.setHillChrome("none");
  lobby.bindChat(partyClient.lobbyTransport());
}

function lineOffset(slot) {
  return (Number(slot) - 2.5) * 1.2;
}

function paintCountdown() {
  if (gate !== "countdown") {
    lobby.setCountdown("");
    return;
  }
  const left = countdownLeft(partyClient.room?.startsAt, Date.now());
  if (left <= 0) {
    releaseLine();
    return;
  }
  lobby.setCountdown(String(Math.ceil(left)));
}

function releaseLine() {
  if (gate !== "countdown") return;
  gate = "racing";
  hillNote = "";
  lobby.setCountdown("");
  lobby.setHillChrome("leave");
  if (!ride.eject) ride.speed = createRideState(START_S).speed;
  for (const entry of remoteRides.values()) {
    if (entry.stick && entry.lastStickAt === 0) {
      wakeRemote(entry);
      entry.lastStickAt = performance.now();
    }
  }
}

function enterHill() {
  const next = partyClient.room;
  if (!next?.code) return;
  const startsAt = next.startsAt || "";
  const seed = Number(next.seed);
  const counting = next.phase === "counting" || next.phase === "racing" || !!next.sealed;
  const onHill = gate === "waiting" || gate === "countdown" || gate === "racing";
  const sameSeed = Number.isFinite(seed) && (Number(course.seed) >>> 0) === (seed >>> 0);
  const sameRoom = heldCode === next.code;
  if (onHill && sameRoom && heldStartsAt === startsAt && sameSeed) {
    if (counting && gate !== "racing") gate = "countdown";
    paintCountdown();
    showHill(hillChrome(), waitingNote());
    return;
  }
  const keepHill = onHill && sameRoom && sameSeed;
  heldCode = next.code;
  heldStartsAt = startsAt;
  if (!keepHill) {
    sawSnapshot = false;
    latestSnapshot = null;
    remoteRides.clear();
    shownSnapshot.clear();
    const numeric = Number.isFinite(seed) ? (seed >>> 0) : (Number(course.seed) >>> 0);
    newHill(numeric || 1);
  }
  gate = counting ? "countdown" : "waiting";
  lobby.bindChat(null);
  showHill(hillChrome(), waitingNote());
  openChat();
  paintCountdown();
}

function sitDown(result, role) {
  wearLook();
  const seated = result.you?.role === "host" || result.you?.role === "player" ? result.you.role : role;
  partyMode = seated;
  sawSnapshot = false;
  latestSnapshot = null;
  roomSealed = !!result.room?.sealed;
  mySlot = slotIndex(result.you) ?? 0;
  lobby.setStatus("");
  lobby.setRoom({
    code: result.room.code,
    role: seated,
    phase: result.room.phase || "waiting",
    sealed: !!result.room.sealed,
  });
  enterHill();
  rememberSlots(result.room?.slots);
}

async function leaveCurrentTable() {
  if (!partyClient.code) return;
  if (partyMode === "host") await partyClient.close().catch(() => {});
  else if (partyMode === "player") await partyClient.leave().catch(() => {});
  partyMode = "";
  chatPanel?.dispose();
  chatPanel = null;
}

async function beginHost(name, slots) {
  if (!canHostDevice(deviceFacts())) {
    lobby.setStatus("A phone can't host. Join from here, or host on a computer or headset.");
    return;
  }
  if (refuseName(name)) return;
  try {
    await partyClient.publishName(name);
  } catch (error) {
    lobby.setStatus(error?.message || "Could not host.");
    return;
  }
  if (refuseName(name)) return;
  try {
    await leaveCurrentTable();
    const result = await partyClient.host({ seed: course.seed, name, slots: slots ?? lobby.slots() });
    sitDown(result, "host");
  } catch (error) {
    failBackToLobby(error?.message || "Could not host.");
  }
}

async function beginJoin(code, name) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) {
    lobby.setStatus("Enter a code, or join an open game.");
    return;
  }
  if (partyClient.code === normalized && (partyMode === "host" || partyMode === "player")) {
    enterHill();
    return;
  }
  if (refuseName(name)) return;
  try {
    await partyClient.publishName(name);
  } catch (error) {
    lobby.setStatus(error?.message || "Could not join.");
    return;
  }
  if (refuseName(name)) return;
  try {
    await leaveCurrentTable();
    const result = await partyClient.join({ code: normalized, name });
    sitDown(result, result.you?.role === "host" ? "host" : "player");
  } catch (error) {
    failBackToLobby(error?.message || "Could not join.");
  }
}

function failBackToLobby(message) {
  partyClient.stop();
  partyMode = "";
  gate = "lobby";
  heldStartsAt = "";
  heldCode = "";
  chatPanel?.dispose();
  chatPanel = null;
  hillNote = "";
  lobby.setRoom(null);
  lobby.show();
  lobby.bindChat(partyClient.lobbyTransport());
  lobby.setStatus(message);
}

async function beginSeal() {
  if (partyMode !== "host") return;
  try {
    const result = await partyClient.seal();
    if (result?.room && partyClient.room) {
      partyClient.room.phase = result.room.phase;
      partyClient.room.startsAt = result.room.startsAt;
      partyClient.room.sealed = result.room.sealed;
      partyClient.room.seed = result.room.seed;
    }
    roomSealed = true;
    if (result?.room?.phase === "counting" || result?.room?.phase === "racing") enterHill();
  } catch (error) {
    const message = error?.message || "Could not start.";
    lobby.setStatus(message);
    if (gate === "waiting") {
      hillNote = message;
      lobby.setHillChrome(hillChrome());
    }
  }
}

function beginLeave() {
  leaveParty("Left the room.", { tellHost: !!partyMode });
}

async function beginInvite(actor) {
  if (!actor || actor === partyClient.actor) return;
  try {
    if (!partyClient.code) {
      if (!canHostDevice(deviceFacts())) {
        lobby.setStatus("A phone can't host. Join a game, or host on a computer or headset.");
        return;
      }
      await beginHost(lobby.name(), 2);
      if (partyMode !== "host") return;
    }
    if (partyClient.room?.phase && partyClient.room.phase !== "waiting") {
      lobby.setStatus("That game has already started.");
      return;
    }
    await partyClient.invite(actor);
    lobby.setStatus("Invite sent.");
  } catch (error) {
    lobby.setStatus(error?.message || "Could not invite.");
  }
}

async function beginAccept() {
  const invite = lobby.takeInvite();
  if (!invite?.code) return;
  if (partyClient.code && partyClient.code !== invite.code) {
    if (partyMode === "host") await partyClient.close().catch(() => {});
    else if (partyMode === "player") await partyClient.leave().catch(() => {});
    partyClient.stop();
    partyMode = "";
    chatPanel?.dispose();
    chatPanel = null;
  }
  await beginJoin(invite.code, lobby.name());
}

function onPartyEvent(event) {
  if (!event || event.kind === "probe" || event.type === "probe") return;
  if (event.kind === "countdown") {
    if (partyClient.room) {
      partyClient.room.startsAt = event.startsAt;
      partyClient.room.phase = "counting";
      partyClient.room.sealed = true;
      if (event.seed != null) partyClient.room.seed = event.seed;
    }
    enterHill();
    return;
  }
  if (event.kind === "countdown-cancelled") {
    if (partyClient.room) {
      partyClient.room.phase = "waiting";
      partyClient.room.sealed = false;
      partyClient.room.startsAt = null;
    }
    roomSealed = false;
    heldStartsAt = "";
    if (gate === "countdown" || gate === "waiting" || gate === "racing") {
      gate = "waiting";
      lobby.setCountdown("");
      showHill(hillChrome(), waitingNote());
    }
    return;
  }
  if (event.kind === "snapshot" && partyMode === "player") {
    latestSnapshot = event;
    lastSnapshotAt = performance.now();
    sawSnapshot = true;
    return;
  }
  if (event.kind === "joined") {
    rememberSlots(event.slots);
    const slot = slotIndex(event);
    if (partyMode === "host" && slot != null && slot !== mySlot) ensureRemote(slot);
    return;
  }
  if (event.kind === "stick" && partyMode === "host") {
    if (!event.actor || slotFromActor(event.actor) === mySlot) return;
    const slot = slotFromActor(event.actor);
    if (slot == null) {
      sticksByActor.set(event.actor, event);
      return;
    }
    sticksByActor.delete(event.actor);
    const entry = ensureRemote(slot);
    entry.stick = event;
    noteLook(entry, event);
    const named = cleanName(event.displayName);
    if (named) entry.name = named;
    if (held()) return;
    wakeRemote(entry);
    entry.lastStickAt = performance.now();
    return;
  }
  if (event.kind === "closed") {
    leaveParty(event.reason === "host-left" ? "The host left." : "The room closed.");
    return;
  }
  if (event.kind === "left") {
    const slot = slotFromActor(event.actor);
    if (slot === mySlot) leaveParty("Left the room.");
    else dropSlot(slot);
    return;
  }
  if (event.kind === "dropped") {
    const slot = slotIndex(event);
    if (slot === mySlot) leaveParty("You were dropped.");
    else dropSlot(slot);
    return;
  }
  if (event.kind === "sealed") {
    roomSealed = true;
  }
}

function noteHostSilence() {
  if (gate === "racing" && partyMode === "player" && sawSnapshot && performance.now() - lastSnapshotAt > 4000) {
    leaveParty("The host left.");
  }
}

function planRemoteFrame() {
  const now = performance.now();
  const planned = [];
  for (const [slot, entry] of [...remoteRides]) {
    if (entry.lastStickAt === 0) continue;
    const age = (now - entry.lastStickAt) / 1000;
    const command = stickCommand(entry.stick, age);
    if (!command) {
      remoteRides.delete(slot);
      continue;
    }
    planned.push({
      slot,
      entry,
      command,
      jump: takeJump(entry.state, command),
    });
  }
  return planned;
}

function stepPlannedRemote(planned, slice, hazards) {
  for (const row of planned) {
    if (!remoteRides.has(row.slot)) continue;
    const command = row.command;
    stepRide(row.entry.state, {
      dt: slice,
      steer: command.steer || 0,
      throttle: command.throttle || 0,
      jump: row.jump,
      strafe: command.strafe || 0,
      feature: row.entry.look?.feature || "none",
      sample: sampleCourse(course, row.entry.state.s),
      canSample: row.entry.state.eject ? sampleCourse(course, row.entry.state.eject.canS) : null,
      hazards,
    });
    row.entry.state.events.length = 0;
  }
}

function resolvePlayers() {
  const bodies = contactsOf(ride, mySlot, true);
  for (const [slot, entry] of remoteRides) {
    bodies.push(...contactsOf(entry.state, slot, true));
  }
  if (bodies.length > 1) separatePack(bodies);
}

function guestSnapshotBodies() {
  const blockers = [];
  let mine = null;
  for (const pose of latestSnapshot?.riders || []) {
    const slot = slotIndex(pose);
    if (slot == null) continue;
    if (slot === mySlot) mine = pose;
    else blockers.push(...poseContacts(pose, slot));
  }
  return { mine, blockers };
}

function remoteBlockers(now) {
  const drawn = remotes?.poses?.(now) || [];
  const blockers = [];
  for (const pose of drawn) {
    const slot = slotIndex(pose);
    if (slot == null || slot === mySlot) continue;
    blockers.push(...poseContacts(pose, slot));
  }
  return blockers;
}

function easeLocalRider(step, now) {
  if (!latestSnapshot || held()) return;
  const mine = (latestSnapshot.riders || []).find((row) => slotIndex(row) === mySlot);
  if (!mine) return;
  const blockers = remoteBlockers(now);
  if (ride.eject && mine.ejected) {
    const canEased = easePose(
      { s: ride.eject.canS, offset: ride.eject.canOffset, speed: ride.eject.canSpeed || 0 },
      { s: mine.canS, offset: mine.canOffset, speed: mine.speed },
      step,
    );
    ride.eject.canS = canEased.s;
    ride.eject.canOffset = canEased.offset;
    const bodyEased = easePose(
      { s: ride.eject.bodyS, offset: ride.eject.bodyOffset, speed: 0 },
      { s: mine.bodyS, offset: mine.bodyOffset, speed: mine.speed },
      step,
    );
    ride.eject.bodyS = bodyEased.s;
    ride.eject.bodyOffset = bodyEased.offset;
    ride.s = bodyEased.s;
    ride.offset = bodyEased.offset;
    settleGuestPrediction(ride, mine, blockers, mySlot);
    return;
  }
  const eased = easePose(ride, mine, step);
  applyRiderEase(ride, eased, mine, blockers);
}

function publishRemotePoses(now) {
  const live = new Set();
  if (partyMode === "host") {
    for (const [slot, entry] of remoteRides) {
      live.add(slot);
      remotes.show(slot, {
        ...poseOf(entry.state),
        ...lookFields(entry.look),
        displayName: nameForSlot(slot, entry),
      }, now, true);
    }
    remotes.retain(live);
    return;
  }
  if (partyMode !== "player" || !latestSnapshot) {
    remotes.retain(live);
    return;
  }
  for (const pose of latestSnapshot.riders || []) {
    const slot = slotIndex(pose);
    if (slot == null || slot === mySlot) continue;
    live.add(slot);
    if (pose !== shownSnapshot.get(slot)) {
      remotes.show(slot, {
        ...pose,
        displayName: cleanName(pose.displayName) || nameForSlot(slot),
      }, now);
      shownSnapshot.set(slot, pose);
    }
  }
  for (const slot of [...shownSnapshot.keys()]) {
    if (!live.has(slot)) shownSnapshot.delete(slot);
  }
  remotes.retain(live);
}

function sendParty(step) {
  if (gate !== "waiting" && gate !== "countdown" && gate !== "racing") return;
  if (partyMode === "player") {
    if (pending.jump && !jumpHeld) jumpSeq += 1;
    jumpHeld = !!pending.jump;
  } else {
    jumpHeld = false;
  }
  if (!partyMode) return;
  relaySendAt += step;
  if (relaySendAt < 0.05) return;
  relaySendAt = 0;
  if (partyMode === "player") {
    const resting = held();
    partyClient.sendStick({
      steer: resting ? 0 : pending.steer || 0,
      throttle: resting ? 0 : pending.throttle || 0,
      strafe: resting ? 0 : pending.strafe || 0,
      jumpSeq,
      displayName: cleanName(lobby.name()),
      ...lookFields(lobby.look()),
    });
    return;
  }
  const riders = [{
    slot: mySlot,
    ...poseOf(ride),
    ...lookFields(lobby.look()),
    displayName: nameForSlot(mySlot),
  }];
  for (const [slot, entry] of remoteRides) {
    riders.push({
      slot,
      ...poseOf(entry.state),
      ...lookFields(entry.look),
      displayName: nameForSlot(slot, entry),
    });
  }
  partyClient.sendSnapshot({ riders });
}

function noteFrame() {
  const now = performance.now();
  if (lastFrameAt > 0) {
    const dt = (now - lastFrameAt) / 1000;
    if (dt > 0 && dt < 2) {
      frameSamples += 1;
      frameTime += dt;
    }
  }
  lastFrameAt = now;
}

function tick({ dt }) {
  noteFrame();
  tickBody(dt);
}

function noteExtremeHit() {
  if (!scraps) return;
  if (!readExtreme()) {
    scraps.clear();
    seenCrash = ride.crashes;
    seenBumps = ride.bumps;
    seenBump = ride.bump;
    return;
  }
  const hit = ride.crashes > seenCrash
    || ride.bumps > seenBumps
    || (ride.bump >= 0.5 && seenBump < 0.5);
  seenCrash = ride.crashes;
  seenBumps = ride.bumps;
  seenBump = ride.bump;
  if (!hit) return;
  const sample = sampleCourse(course, ride.eject ? ride.eject.canS : ride.s);
  const offset = ride.eject ? ride.eject.canOffset : ride.offset;
  const side = Math.sign(offset) || Math.sign(ride.latVel) || 1;
  scraps.burst(sample, offset, side);
}

function tickBody(dt) {
  syncEnterVrButton();
  const presentingEarly = !!renderer.xr?.isPresenting;
  if (presentingEarly && !vrChromeOn) {
    captureVrDesktop();
    vrHelpWanted = false;
    vrChromeOn = true;
  } else if (!presentingEarly && vrChromeOn) {
    restoreVrDesktop();
    vrChromeOn = false;
    vrHelpWanted = false;
  }
  if (presentingEarly) holdVrPanels();
  const step = Math.min(Math.max(dt || 0, 0), 0.05);
  elapsed += step;
  noteHostSilence();
  const presenting = !!renderer.xr?.isPresenting;
  const ejectedNow = ride.eject;
  const body = ejectedNow
    ? {
        s: ejectedNow.bodyS,
        offset: ejectedNow.bodyOffset,
        radius: FOOT_RADIUS,
        speed: Math.hypot(ejectedNow.bodyAlong || 0, ejectedNow.bodyLat || 0),
        onFoot: true,
      }
    : { s: ride.s, offset: ride.offset, radius: 0.5, speed: ride.speed };
  if (ejectedNow) {
    body.also = [{
      s: ejectedNow.canS,
      offset: ejectedNow.canOffset,
      radius: 0.55,
      speed: Math.hypot(ejectedNow.canSpeed || 0, ejectedNow.canLat || 0),
    }];
  }
  if (partyMode === "host") {
    const feet = [];
    for (const entry of remoteRides.values()) {
      const remote = entry.state.eject;
      if (!remote) continue;
      feet.push({
        s: remote.bodyS,
        offset: remote.bodyOffset,
        radius: FOOT_RADIUS,
        speed: Math.hypot(remote.bodyAlong || 0, remote.bodyLat || 0),
        onFoot: true,
      });
    }
    if (feet.length) body.feet = feet;
  }
  const focusS = ride.eject ? Math.max(ride.eject.bodyS, ride.eject.canS) : ride.s;
  let rideS = focusS;
  if (partyMode === "host") {
    for (const entry of remoteRides.values()) rideS = Math.min(rideS, entry.state.s);
  }
  const hazards = town.update(course, rideS, step, elapsed, body);
  ride.events.length = 0;
  const slices = Math.max(1, Math.ceil(step / 0.02));
  const slice = step / slices;
  const planned = partyMode === "host" && !held() ? planRemoteFrame() : null;
  if (held()) {
    holdAtLine(ride, START_S);
    const stagger = gate === "countdown";
    ride.offset = stagger ? lineOffset(mySlot) : 0;
    for (const [slot, entry] of remoteRides) {
      holdAtLine(entry.state, START_S);
      entry.state.offset = stagger ? lineOffset(slot) : 0;
    }
  } else {
    for (let index = 0; index < slices; index += 1) {
      stepRide(ride, {
        dt: slice,
        steer: pending.steer,
        throttle: pending.throttle,
        jump: pending.jump,
        strafe: pending.strafe || 0,
        feature: lobby.look()?.feature || "none",
        sample: sampleCourse(course, ride.s),
        canSample: ride.eject ? sampleCourse(course, ride.eject.canS) : null,
        hazards,
      });
      if (partyMode === "player" && latestSnapshot) {
        const { mine, blockers } = guestSnapshotBodies();
        if (remotes) blockers.push(...remoteBlockers(performance.now()));
        if (blockers.length) settleGuestPrediction(ride, mine, blockers, mySlot);
      }
      if (planned) {
        stepPlannedRemote(planned, slice, hazards);
        resolvePlayers();
      }
    }
  }
  town.noteHits(ride.events);
  noteExtremeHit();
  scraps?.step(step, course);
  let guestPoseAt = 0;
  if (partyMode === "player" && !held()) {
    guestPoseAt = performance.now();
    if (remotes) publishRemotePoses(guestPoseAt);
    easeLocalRider(step, guestPoseAt);
  }
  sound.update({
    dt: step,
    ride,
    hazards,
    throttle: pending.throttle || 0,
    seed: course.seed,
  });
  if (ride.best > persistedBest) {
    persistedBest = ride.best;
    writeBest(persistedBest);
  }
  placeWorld(presenting);
  if (partyMode && remotes) {
    const now = guestPoseAt || performance.now();
    if (!guestPoseAt) publishRemotePoses(now);
    remotes.place(course, now, elapsed);
  }
  hudTimer += step;
  if (hudTimer >= 0.2) {
    hudTimer = 0;
    updateHud();
  }
  graphicsPanel?.prepare();
  renderHudFrame({ renderer, scene, camera, dt: step, hudSystem, navigation });
  hudSystem.syncHotbarWindowSize?.();
  liftHotbarTooltip();
  placeHelp();
  graphicsPanel?.afterHud();
  placeSettings();
  if (presenting) holdVrPanels();
  paintCountdown();
  pending = sampleInput(presenting);
  sendParty(step);
  yawAtFrameEnd = look.getYaw();
  api.ready = api.frameErrors.length === 0 && api.ribbonErrors.length === 0;
  hideSplash();
}

function hideSplash() {
  const splash = document.getElementById("splash");
  if (!splash || splash.classList.contains("is-gone")) return;
  splash.classList.add("is-gone");
  const remove = () => splash.remove();
  splash.addEventListener("transitionend", remove, { once: true });
  window.setTimeout(remove, 700);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  hudSystem.handleResize?.();
});

placeWorld(false);
yawAtFrameEnd = look.getYaw();
updateHud();
town.update(course, ride.s, 0, 0, { s: ride.s, offset: ride.offset, radius: 0.5 });

partyClient.onRelay(onPartyEvent);
partyClient.onLobby((event) => {
  if (!event) return;
  if (event.kind === "lobby") {
    lobby.setPeople(event.people, partyClient.actor);
    lobby.setGames(event.games);
    return;
  }
  if (event.kind === "invite" && event.to && event.to === partyClient.actor) {
    lobby.showInvite(event);
    return;
  }
  if ((event.kind === "countdown" || event.kind === "countdown-cancelled") && event.code && event.code === partyClient.code) {
    onPartyEvent(event);
  }
});
lobby.bindChat(partyClient.lobbyTransport());
if (wantsSolo(window.location.search)) rideAlone();
void bootLobby();
window.addEventListener("pagehide", () => {
  partyClient.leaveLobbyKeepalive();
  if (partyMode === "host") partyClient.closeKeepalive();
  else if (partyMode === "player") partyClient.leaveKeepalive();
});

async function bootLobby() {
  try {
    const view = await partyClient.enterLobby({ name: lobby.name() });
    lobby.setMaxPlayers(view.maxPlayers);
    lobby.setPeople(view.people, partyClient.actor);
    lobby.setGames(view.games);
  } catch (error) {
    lobby.setStatus(error?.message || "The lobby is offline. Ride alone still works.");
  }
}

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
