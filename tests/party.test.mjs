import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { createCourse, sampleCourse } from "../src/course.js";
import { createNameTag, nameTagScale } from "../src/name-tag.js";
import { createRideState, stepRide } from "../src/drive.js";
import { CAN_COLORS, HAIR_COLORS, OLD_HAIR, RIDER_LOOKS, SKIN_COLORS, acceptedLook, defaultLook, faceHex, lookKey, nameBlock, recallLook, recallName, rememberLook, rememberName, togglePirate } from "../src/looks.js";
import { createMaterials } from "../src/materials.js";
import {
  applyRiderEase,
  canHostDevice,
  contactsOf,
  countdownLeft,
  createPartyClient,
  applyGuestFace,
  easePose,
  holdAtLine,
  HOST_SILENCE_MS,
  hostWentSilent,
  lerpPose,
  playSite,
  poseContacts,
  poseOf,
  SLOT_LOOKS,
  separatePack,
  settleGuestPrediction,
  slotIndex,
  stickCommand,
  takeJump,
  wantsSolo,
} from "../src/party.js";
import { animatePerson, createProps } from "../src/props.js";
import { createRemoteRiders } from "../src/remotes.js";
import { createRider } from "../src/rider.js";

test("the countdown is one shared clock and the hold stays on the line", () => {
  const start = Date.parse("2026-01-01T00:00:00.000Z");
  assert.equal(countdownLeft("2026-01-01T00:00:15.000Z", start), 15);
  assert.equal(countdownLeft("2026-01-01T00:00:00.000Z", start + 10000), 0);
  const ride = { s: 80, speed: 7.2, offset: 1.25, spin: 0.4, eject: null };
  holdAtLine(ride, 36);
  assert.equal(ride.s, 36);
  assert.equal(ride.speed, 0);
  assert.equal(ride.offset, 1.25);
  assert.equal(ride.spin, 0.4);
});

test("solo=1 starts a ride and the plain address stays in the lobby", () => {
  assert.equal(wantsSolo(""), false);
  assert.equal(wantsSolo("?play=http://127.0.0.1:4339"), false);
  assert.equal(wantsSolo("?solo=1"), true);
  assert.equal(wantsSolo("solo=true"), true);
  assert.equal(wantsSolo("?solo"), true);
  assert.equal(wantsSolo("?solo=0"), false);
  assert.equal(wantsSolo("?solo=no"), false);
  assert.equal(wantsSolo("?seed=4&solo=yes"), true);
});

test("a phone cannot host and a headset can", () => {
  assert.equal(canHostDevice({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" }), false);
  assert.equal(canHostDevice({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) Mobile" }), false);
  assert.equal(canHostDevice({ userAgent: "Mozilla/5.0 (iPad)", screenMin: 800, touchPoints: 5 }), true);
  assert.equal(canHostDevice({ screenMin: 600, touchPoints: 2 }), false);
  assert.equal(canHostDevice({ userAgent: "Mozilla/5.0 OculusBrowser Quest", screenMin: 500, touchPoints: 2 }), true);
  assert.equal(canHostDevice({ headset: true, screenMin: 400, touchPoints: 2 }), true);
  assert.equal(canHostDevice({ userAgent: "Mozilla/5.0 Chrome", screenMin: 1080, touchPoints: 0 }), true);
});

test("poses round to centimeters and an ejected can reports the can", () => {
  const mounted = poseOf({ s: 1.239, offset: 0.236, speed: 7.2, spin: 0.004, hop: 0.001 });
  assert.equal(mounted.s, 1.24);
  assert.equal(mounted.offset, 0.24);
  assert.equal(mounted.ejected, false);
  assert.equal(mounted.spin, 0);
  const ejected = poseOf({
    s: 3,
    offset: 1,
    speed: 0,
    spin: 9,
    hop: 9,
    eject: { canSpin: 1.239, canHop: 0.2, canS: 4.556, canOffset: -1.2, bodyS: 5, bodyOffset: 0.5 },
  });
  assert.equal(ejected.ejected, true);
  assert.equal(ejected.spin, 1.24);
  assert.equal(ejected.hop, 0.2);
  assert.equal(ejected.canS, 4.56);
  assert.equal(ejected.canOffset, -1.2);
  assert.equal(ejected.bodyS, 5);
  assert.equal(ejected.s, 3);
  assert.equal(ejected.face, 0);
  const turned = poseOf({
    s: 3,
    eject: { face: Math.PI, bodyS: 3, bodyOffset: 0, canS: 3, canOffset: 0 },
  });
  assert.equal(turned.face, 3.14);
  const blended = lerpPose(
    { ejected: true, face: 3, s: 0, offset: 0 },
    { ejected: true, face: -3, s: 0, offset: 0 },
    0.25,
  );
  assert.ok(blended.face > 3 && blended.face < 3.2, `face took the long way ${blended.face}`);
});

test("easing follows the host pose and snaps when the cans are far apart", () => {
  const local = { s: 0, offset: 0, speed: 1 };
  const eased = easePose(local, { s: 10, offset: 0, speed: 5 }, 0.1);
  assert.equal(eased.s, 4);
  const lead = easePose({ s: 5, offset: 0, speed: 2 }, { s: 5.4, offset: 0, speed: 2 }, 0.016);
  assert.equal(lead.s, 5);
  const walking = easePose({ s: 20, offset: 1, speed: 3.4 }, { s: 18.6, offset: 1, speed: 3.4 }, 0.016);
  assert.equal(walking.s, 20, "a walk stays ahead of a host pose one step behind");
  const guest = { eject: { face: 0 } };
  applyGuestFace(guest, { face: Math.PI });
  assert.equal(guest.eject.face, Math.PI);
  assert.equal(local.s, 0);
  assert.equal(local.speed, 1);
  const snapped = easePose(local, { s: 20, offset: 0, speed: 4 }, 0.1);
  assert.equal(snapped.s, 20);
  assert.equal(snapped.speed, 4);
  assert.equal(local.s, 0);
});

test("stacked riders push apart along the hill", () => {
  const riders = [
    { s: 36, offset: 0, speed: 10 },
    { s: 36, offset: 0, speed: 0 },
  ];
  separatePack(riders);
  assert.ok(riders[1].s - riders[0].s >= 1.15);
  assert.equal(riders[0].offset, 0);
  assert.equal(riders[1].offset, 0);
  assert.ok(riders[0].speed < 10);
  assert.ok(riders[1].speed > 0);
});

test("a fast can cannot ride through a stopped rider", () => {
  const chase = { s: 0, offset: 0, speed: 24, latVel: 0, owner: "chase" };
  const lead = { s: 1.2, offset: 0, speed: 0, latVel: 0, movable: false, owner: "lead" };
  for (let step = 0; step < 8; step += 1) {
    chase.s += Math.max(0, chase.speed) * 0.02;
    separatePack([chase, lead]);
  }
  assert.equal(lead.s, 1.2);
  assert.ok(lead.s - chase.s >= 1.15 - 1e-6);
  assert.ok(chase.speed <= 1e-6);
});

test("two rolling cans stay apart along the road", () => {
  const rear = { s: 0, offset: 0, speed: 20, latVel: 0, owner: "rear" };
  const front = { s: 1.2, offset: 0, speed: 4, latVel: 0, owner: "front" };
  for (let step = 0; step < 40; step += 1) {
    rear.s += Math.max(0, rear.speed) * 0.02;
    front.s += Math.max(0, front.speed) * 0.02;
    separatePack([rear, front]);
    assert.ok(front.s - rear.s >= 1.15 - 1e-6, `crossed on step ${step}`);
  }
});

test("a can cannot steer through the can beside it", () => {
  const me = { s: 20, offset: 0, speed: 6, latVel: 4, owner: "me" };
  const them = { s: 20, offset: 0.4, speed: 6, latVel: 0, movable: false, owner: "them" };
  me.offset += me.latVel * 0.02;
  separatePack([me, them]);
  const gap = Math.hypot(them.s - me.s, them.offset - me.offset);
  assert.ok(gap >= 1.15 - 1e-6);
  assert.equal(them.offset, 0.4);
  assert.ok(me.offset < them.offset);
  assert.ok(me.latVel <= 1e-6);
});

test("a rider does not collide with their own loose can", () => {
  const state = {
    s: 5,
    offset: 0,
    speed: 0,
    latVel: 0,
    eject: {
      bodyS: 5,
      bodyOffset: 0,
      bodyAlong: 0,
      bodyLat: 0,
      canS: 5,
      canOffset: 0,
      canSpeed: 4,
      canLat: 0,
    },
  };
  separatePack(contactsOf(state, "ada", true));
  assert.equal(state.eject.bodyS, 5);
  assert.equal(state.eject.canS, 5);
  assert.equal(state.eject.canSpeed, 4);
});

test("a can stops against another rider who hopped out", () => {
  const can = { s: 10.1, offset: 0, speed: 8, latVel: 0, bump: 0 };
  const walker = {
    s: 10,
    offset: 0,
    speed: 0,
    latVel: 0,
    eject: {
      bodyS: 10.3,
      bodyOffset: 0,
      bodyAlong: 0,
      bodyLat: 0,
      canS: 40,
      canOffset: 8,
      canSpeed: 0,
      canLat: 0,
    },
  };
  separatePack([
    ...contactsOf(can, "can", true),
    ...contactsOf(walker, "walker", false),
  ]);
  const gap = Math.abs(walker.eject.bodyS - can.s);
  assert.ok(gap >= 0.45 + 0.575 - 1e-6);
  assert.equal(walker.eject.bodyS, 10.3);
  assert.equal(walker.eject.canS, 40);
  assert.ok(can.s < walker.eject.bodyS);
  assert.ok(can.bump >= 0.5);
});

test("a guest snaps to a clear host pose instead of easing through a rider", () => {
  const state = { s: 10, offset: 0, speed: 12 };
  const eased = easePose(state, { s: 7, offset: 0, speed: 8 }, 0.05);
  const blocker = poseContacts({ s: 9, offset: 0, speed: 0, ejected: false }, 2);
  applyRiderEase(state, eased, { s: 7, offset: 0, speed: 8 }, blocker);
  assert.equal(state.s, 7);
  assert.equal(state.offset, 0);
  assert.equal(state.speed, 8);
  assert.equal(blocker[0].s, 9);
});

test("the host step cannot carry one can through another", () => {
  const course = createCourse(7);
  const rear = createRideState(40);
  const front = createRideState(41.2);
  rear.speed = 24;
  front.speed = 0;
  for (let frame = 0; frame < 30; frame += 1) {
    const step = 0.05;
    const slices = Math.max(1, Math.ceil(step / 0.02));
    const slice = step / slices;
    for (let index = 0; index < slices; index += 1) {
      stepRide(rear, {
        dt: slice,
        steer: 0,
        throttle: 1,
        sample: sampleCourse(course, rear.s),
        hazards: [],
      });
      stepRide(front, {
        dt: slice,
        steer: 0,
        throttle: 0,
        sample: sampleCourse(course, front.s),
        hazards: [],
      });
      separatePack([
        ...contactsOf(rear, "rear", true),
        ...contactsOf(front, "front", true),
      ]);
    }
    assert.ok(front.s - rear.s >= 1.15 - 1e-4, `frame ${frame} gap ${front.s - rear.s}`);
  }
});

test("a guest stays on the near side when the host pose is inside another rider", () => {
  const state = { s: 10, offset: 0, speed: 12 };
  const target = { s: 9, offset: 0, speed: 4 };
  const eased = easePose(state, target, 0.05);
  const blocker = poseContacts({ s: 9, offset: 0, speed: 0, ejected: false }, 2);
  applyRiderEase(state, eased, target, blocker);
  assert.ok(state.s - blocker[0].s >= 1.15 - 1e-6);
  assert.equal(blocker[0].s, 9);
});

test("a guest beside a rider snaps behind when the host still has them behind", () => {
  const state = { s: 102, offset: 1.2, speed: 16 };
  const target = { s: 98, offset: 1.2, speed: 8 };
  const eased = easePose(state, target, 0.016);
  const blocker = poseContacts({ s: 100, offset: 0, speed: 8, ejected: false }, 0);
  applyRiderEase(state, eased, target, blocker);
  assert.equal(state.s, 98);
  assert.equal(state.offset, 1.2);
  assert.equal(state.speed, 8);
  assert.equal(blocker[0].s, 100);
});

test("a wide lane whose host pose is also ahead is not pulled back", () => {
  const state = { s: 102, offset: 6, speed: 16 };
  const target = { s: 110, offset: 6, speed: 16 };
  const eased = easePose(state, target, 0.016);
  const blocker = poseContacts({ s: 100, offset: 0, speed: 8, ejected: false }, 0);
  applyRiderEase(state, eased, target, blocker);
  assert.ok(state.s > blocker[0].s);
  assert.ok(state.s > 102);
  assert.equal(blocker[0].s, 100);
});

test("a guest on the other fork is not pulled behind a rider", () => {
  const state = { s: 102, offset: 8, speed: 16 };
  const target = { s: 98, offset: 8, speed: 12 };
  const eased = easePose(state, target, 0.016);
  const blocker = poseContacts({ s: 100, offset: 0, speed: 8, ejected: false }, 0);
  applyRiderEase(state, eased, target, blocker);
  assert.ok(state.s > 101);
  assert.ok(state.s < 102);
  assert.equal(blocker[0].s, 100);
});

test("a near lane does not teleport through a rider the host says is still ahead", () => {
  const state = { s: 96, offset: 1.2, speed: 16 };
  const target = { s: 106, offset: 1.2, speed: 16 };
  const eased = easePose(state, target, 0.016);
  const blocker = poseContacts({ s: 100, offset: 0, speed: 8, ejected: false }, 0);
  applyRiderEase(state, eased, target, blocker);
  assert.ok(state.s < blocker[0].s);
  assert.ok(state.s > 96);
  assert.notEqual(state.s, target.s);
});

test("easing past a missed rider stays legal once the host pose is ahead", () => {
  const state = { s: 99.5, offset: 1.2, speed: 16 };
  const target = { s: 106, offset: 1.2, speed: 16 };
  const eased = easePose(state, target, 0.05);
  const blocker = poseContacts({ s: 100, offset: 0, speed: 8, ejected: false }, 0);
  applyRiderEase(state, eased, target, blocker);
  assert.ok(state.s > blocker[0].s);
  assert.ok(state.s < 102);
  assert.equal(blocker[0].s, 100);
});

test("guest prediction stays behind a rider the snapshot still has them behind", () => {
  const course = createCourse(7);
  const guest = createRideState(102);
  guest.offset = 1.2;
  guest.speed = 16;
  const target = { s: 98, offset: 1.2, speed: 8, ejected: false };
  const blockerPose = { s: 100, offset: 0, speed: 8, ejected: false };
  let previous = null;
  for (let frame = 0; frame < 40; frame += 1) {
    const step = 0.05;
    const slices = Math.max(1, Math.ceil(step / 0.02));
    const slice = step / slices;
    for (let index = 0; index < slices; index += 1) {
      stepRide(guest, {
        dt: slice,
        steer: 0,
        throttle: 1,
        sample: sampleCourse(course, guest.s),
        hazards: [],
      });
      const blockers = poseContacts(blockerPose, 0);
      settleGuestPrediction(guest, target, blockers, 1);
      assert.equal(blockers[0].s, 100);
    }
    const blockers = poseContacts(blockerPose, 0);
    const eased = easePose(guest, target, step);
    applyRiderEase(guest, eased, target, blockers);
    assert.ok(guest.s < blockerPose.s, `frame ${frame} guest s ${guest.s}`);
    assert.equal(blockers[0].s, 100);
    if (previous != null) {
      assert.ok(Math.abs(guest.s - previous) < 0.75, `frame ${frame} jump ${guest.s - previous}`);
    }
    previous = guest.s;
  }
});

test("a jump is an edge and a quiet stick holds then drops", () => {
  const state = { seenJump: 0 };
  assert.equal(takeJump(state, { jumpSeq: 0 }), false);
  assert.equal(state.seenJump, 0);
  assert.equal(takeJump(state, { jumpSeq: 2 }), true);
  assert.equal(state.seenJump, 2);
  assert.equal(takeJump(state, { jumpSeq: 2 }), false);

  assert.equal(stickCommand(null, 0).hold, true);
  assert.equal(stickCommand({ steer: 1, throttle: 1, strafe: 1, jumpSeq: 3 }, 1.49).steer, 1);
  const coast = stickCommand({ steer: 1, throttle: 1, strafe: 1, jumpSeq: 3 }, 1.5);
  assert.equal(coast.steer, 0);
  assert.equal(coast.throttle, 0);
  assert.equal(coast.jumpSeq, 3);
  assert.equal(stickCommand({ steer: 1 }, 8), null);
  assert.equal(slotIndex({ index: 2 }), 2);
  assert.equal(slotIndex({ slot: 1 }), 1);
  assert.equal(slotIndex({}), null);
});

test("the local can stays green and a remote can clones its band", () => {
  const materials = createMaterials(THREE);
  const props = createProps(THREE, materials);
  const local = createRider(THREE, materials, props);
  const again = createRider(THREE, materials, props);
  const remote = createRider(THREE, materials, props, { shirtRand: 0.3, can: 0xc23b3b });
  const localBand = bandMesh(local);
  const againBand = bandMesh(again);
  const remoteBand = bandMesh(remote);
  assert.equal(localBand.material, againBand.material);
  assert.equal(localBand.material.color.getHex(), 0x2f7d4a);
  assert.notEqual(remoteBand.material, localBand.material);
  assert.equal(shellHex(remote), 0xc23b3b);
  assert.notEqual(remoteBand.material.color.getHex(), 0xc23b3b);
  assert.equal(localBand.material.color.getHex(), 0x2f7d4a);
  assert.notEqual(shirtColor(local), shirtColor(remote));
});

test("the default look is the rider createRider builds when no look is passed", () => {
  const materials = createMaterials(THREE);
  const props = createProps(THREE, materials);
  const plain = createRider(THREE, materials, props);
  const chosen = createRider(THREE, materials, props, defaultLook());
  assert.equal(shirtColor(plain), shirtColor(chosen));
  assert.equal(shirtColor(plain), RIDER_LOOKS[1].color);
  assert.equal(shellHex(chosen), CAN_COLORS[0].can);
  assert.notEqual(bandMesh(chosen).material, bandMesh(plain).material);
  assert.notEqual(bandMesh(chosen).material.color.getHex(), CAN_COLORS[0].can);
  const red = createRider(THREE, materials, props, { shirtRand: RIDER_LOOKS[0].shirtRand, can: CAN_COLORS[1].can });
  assert.equal(shirtColor(red), RIDER_LOOKS[0].color);
  assert.equal(shellHex(red), CAN_COLORS[1].can);
  assert.equal(acceptedLook({ shirtRand: 0.01, can: CAN_COLORS[0].can }), null);
});

test("clothes, hair, the can, and a logo are part of the look", () => {
  const materials = createMaterials(THREE);
  const props = createProps(THREE, materials);
  const plain = createRider(THREE, materials, props);
  const styled = createRider(THREE, materials, props, {
    ...defaultLook(),
    body: "woman",
    top: "blouse",
    bottom: "skirt",
    hair: "long",
    canShape: "square",
    canMaterial: "rubber",
    logo: "star",
  });
  assert.ok(meshAtY(styled.person, 1.24).scale.x < meshAtY(plain.person, 1.24).scale.x);
  assert.ok(findNamed(styled.person, "person-skirt"));
  assert.equal(findNamed(plain.person, "person-skirt"), null);
  assert.ok(findNamed(styled.person, "person-blouse"));
  assert.ok(findNamed(styled.person, "person-hair-long"));
  assert.equal(findNamed(plain.person, "person-hair-long"), null);
  const wall = findNamed(styled.root, "can-square");
  assert.equal(wall.material.metalness, 0);
  assert.equal(findNamed(plain.root, "can-square"), null);
  const logo = findNamed(styled.root, "can-logo");
  assert.ok(logo.position.z > 0.3, `logo z ${logo.position.z}`);
  assert.ok(logo.geometry.parameters.width >= 0.5, `logo width ${logo.geometry.parameters.width}`);
  assert.ok(logo.position.y < 0.5, `logo should sit below the stripe, y ${logo.position.y}`);
  const skirt = findNamed(styled.person, "person-skirt");
  const skirtPos = skirt.geometry.attributes.position;
  let waist = 0;
  let hem = 0;
  let high = -Infinity;
  let low = Infinity;
  for (let i = 0; i < skirtPos.count; i += 1) {
    const y = skirtPos.getY(i);
    const radius = Math.hypot(skirtPos.getX(i), skirtPos.getZ(i));
    if (y > high) {
      high = y;
      waist = radius;
    }
    if (y < low) {
      low = y;
      hem = radius;
    }
  }
  assert.ok(hem > waist * 1.4, `skirt hem ${hem} waist ${waist}`);
  assert.ok(hem > 0.72, `skirt hem ${hem} does not cover a stepping calf`);
  assert.equal(skirt.material.transparent, false);
  assert.equal(skirt.material.opacity, 1);
  const thigh = styled.person.userData.limbs.legL.children.find((child) => child.isMesh);
  assert.equal(thigh.material.color.getHex(), skirt.material.color.getHex());
  const skirtNormal = skirt.geometry.attributes.normal;
  let outer = 0;
  for (let i = 0; i < skirtPos.count; i += 1) {
    if (Math.abs(skirtPos.getZ(i)) > 0.05) continue;
    outer = Math.max(outer, skirtPos.getX(i));
  }
  let outward = 0;
  let seen = 0;
  for (let i = 0; i < skirtPos.count; i += 1) {
    const x = skirtPos.getX(i);
    const z = skirtPos.getZ(i);
    if (x < outer - 0.03 || Math.abs(z) > 0.05) continue;
    seen += 1;
    outward += skirtNormal.getX(i) * x + skirtNormal.getZ(i) * z;
  }
  assert.ok(seen > 0 && outward > 0, `skirt normals face inward (${outward})`);
  const drum = createRider(THREE, materials, props, { ...defaultLook(), canShape: "drum", logo: "bolt" });
  assert.equal(findNamed(drum.root, "can-square"), null);
  assert.ok(findNamed(drum.root, "can-drum"));
  const drumLogo = findNamed(drum.root, "can-logo");
  const drumShell = findNamed(drum.root, "can-drum");
  const shellPos = drumShell.geometry.attributes.position;
  let belly = 0;
  for (let i = 0; i < shellPos.count; i += 1) {
    if (Math.abs(shellPos.getY(i) - drumLogo.position.y) > 0.06) continue;
    if (Math.abs(shellPos.getX(i)) > 0.08) continue;
    belly = Math.max(belly, shellPos.getZ(i));
  }
  assert.ok(belly > 0.2, `drum belly z ${belly}`);
  assert.ok(drumLogo.position.z > belly, `logo buried in the shell, z ${drumLogo.position.z} belly ${belly}`);
  assert.ok(drumLogo.position.z < belly + 0.03, `logo floats off the shell, z ${drumLogo.position.z} belly ${belly}`);
  drum.place({
    x: 0,
    y: 0,
    z: 0,
    forward: { x: 0, y: 0, z: -1 },
    right: { x: 1, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
  }, 0, Math.PI / 2, 0, 0, true);
  drum.root.updateMatrixWorld(true);
  const spun = new THREE.Vector3();
  drumLogo.getWorldPosition(spun);
  assert.ok(spun.z > 0.4, `spun logo should stay on the camera side, z ${spun.z}`);
  assert.ok(Math.abs(spun.x) < 0.05, `spun logo should not swing sideways, x ${spun.x}`);
  const bin = createRider(THREE, materials, props, { ...defaultLook(), canShape: "square" });
  assert.equal(findNamed(bin.root, "can-square").material.metalness, 0.72);
  assert.equal(findNamed(bin.root, "can-logo"), null);
  const bald = props.createPerson(() => 0.2, "ride", { hair: "bald" });
  assert.equal(findNamed(bald, "person-hair-short"), null);
  assert.equal(findNamed(bald, "person-hair-bun"), null);
  const kept = acceptedLook({ shirtRand: 0.2, can: 0x2f7d4a, bottom: "skirt", logo: "cape" });
  assert.equal(kept.bottom, "skirt");
  assert.equal(kept.logo, "none");
  assert.equal(kept.body, "man");
  assert.equal(kept.canShape, "round");
  assert.equal(kept.age, "adult");
  assert.equal(kept.canSize, "regular");
});

test("age and can size are part of the look", () => {
  const materials = createMaterials(THREE);
  const props = createProps(THREE, materials);
  const plain = createRider(THREE, materials, props);
  const adult = createRider(THREE, materials, props, defaultLook());
  const young = createRider(THREE, materials, props, { ...defaultLook(), age: "young", canSize: "small" });
  const elder = createRider(THREE, materials, props, { ...defaultLook(), age: "old", canSize: "big" });
  assert.equal(findNamed(plain.root, "rider-can").scale.x, 1);
  assert.equal(findNamed(adult.root, "rider-can").scale.x, 1);
  assert.equal(findNamed(adult.person, "person-glasses"), null);
  assert.ok(findNamed(young.person, "person-head").scale.x > findNamed(adult.person, "person-head").scale.x);
  assert.ok(findNamed(young.person, "person-head").parent.position.y < 1.3);
  assert.equal(findNamed(young.root, "rider-can").scale.x, 0.72);
  assert.ok(young.person.scale.x < adult.person.scale.x);
  assert.ok(young.person.position.y > adult.person.position.y);
  assert.ok(findNamed(elder.person, "person-glasses"));
  // defaultLook already chose a hair color, so Old does not paint over it.
  assert.equal(findNamed(elder.person, "person-hair-short").material.color.getHex(), defaultLook().hairColor);
  assert.equal(findNamed(elder.root, "rider-can").scale.x, 1.28);
  assert.ok(elder.person.scale.x > adult.person.scale.x);
  animatePerson(elder.person, 0);
  assert.ok(elder.person.userData.limbs.head.rotation.x > 0.4);
  const bald = props.createPerson(() => 0.2, "ride", { age: "old", hair: "bald" });
  assert.ok(findNamed(bald, "person-glasses"));
  assert.equal(findNamed(bald, "person-hair-short"), null);
  const town = props.createPerson(() => 0.2, "walk");
  assert.equal(findNamed(town, "person-glasses"), null);
  assert.equal(findNamed(town, "person-head").scale.x, 0.15);
  assert.ok(findNamed(adult.person, "person-head").scale.x > findNamed(town, "person-head").scale.x);
  const odd = acceptedLook({ shirtRand: 0.2, can: 0x2f7d4a, age: "ancient", canSize: "huge" });
  assert.equal(odd.age, "adult");
  assert.equal(odd.canSize, "regular");
  assert.notEqual(lookKey(defaultLook()), lookKey({ ...defaultLook(), age: "young" }));
  assert.notEqual(lookKey(defaultLook()), lookKey({ ...defaultLook(), canSize: "small" }));
  assert.equal(acceptedLook({ shirtRand: 0.2, can: 0x2f7d4a, canShape: "flare" }).canShape, "flare");
  const bag = new Map();
  const storage = {
    getItem: (key) => (bag.has(key) ? bag.get(key) : null),
    setItem: (key, value) => bag.set(key, String(value)),
  };
  rememberLook(storage, { ...defaultLook(), bottom: "skirt", canShape: "oval", hair: "bun" });
  assert.equal(recallLook(storage).bottom, "skirt");
  assert.equal(recallLook(storage).canShape, "oval");
  assert.equal(recallLook(storage).hair, "bun");
  rememberLook(storage, { canShape: "cape" });
  assert.equal(recallLook(storage).canShape, "round");
  storage.setItem("gcr.look.v1", "{");
  assert.equal(recallLook(storage).body, "man");
  rememberName(storage, "  Ada  ");
  assert.equal(recallName(storage), "Ada");
});

test("skin, hair color, complexion, and a shirt mark are part of the look", () => {
  const materials = createMaterials(THREE);
  const props = createProps(THREE, materials);
  const legacy = acceptedLook({ shirtRand: 0.2, can: 0x2f7d4a });
  assert.equal(legacy.skin, 0xd9a47a);
  assert.equal(legacy.hairColor, 0x5a3a28);
  assert.equal(legacy.complexion, "even");
  assert.equal(lookKey(legacy), lookKey(defaultLook()));
  assert.equal(acceptedLook({ shirtRand: 0.01, can: 0x2f7d4a, skin: 0x8d5a3c }), null);
  const red = acceptedLook({ shirtRand: RIDER_LOOKS[0].shirtRand, can: CAN_COLORS[0].can });
  assert.equal(red.skin, 0xf0c2a0);
  assert.equal(red.hairColor, 0x2a211c);
  const oldBare = acceptedLook({ shirtRand: 0.2, can: 0x2f7d4a, age: "old" });
  assert.equal(oldBare.hairColor, OLD_HAIR);
  assert.equal(oldBare.complexion, "even");
  const dyed = acceptedLook({ shirtRand: 0.2, can: 0x2f7d4a, age: "old", hairColor: 0x1a1a1a, complexion: "spotted" });
  assert.equal(dyed.hairColor, 0x1a1a1a);
  assert.equal(dyed.complexion, "even");
  assert.equal(dyed.age, "old");
  assert.notEqual(lookKey(legacy), lookKey({ ...legacy, skin: SKIN_COLORS[4].skin }));
  assert.notEqual(lookKey(legacy), lookKey({ ...legacy, hairColor: HAIR_COLORS[0].hairColor }));
  assert.notEqual(lookKey(legacy), lookKey({ ...legacy, complexion: "olive" }));

  const town = props.createPerson(() => 0.2, "walk");
  const townHead = findNamed(town, "person-head");
  const townHex = townHead.material.color.getHex();
  const deep = SKIN_COLORS[4].skin;
  const rosy = createRider(THREE, materials, props, {
    ...defaultLook(),
    skin: deep,
    hairColor: HAIR_COLORS[4].hairColor,
    complexion: "rosy",
    logo: "star",
    logoColor: 0xc23b3b,
  });
  assert.equal(townHead.material.color.getHex(), townHex);
  assert.equal(findNamed(rosy.person, "person-head").material.color.getHex(), faceHex(deep, "rosy"));
  assert.notEqual(findNamed(rosy.person, "person-head").material, townHead.material);
  let bodySkin = null;
  rosy.person.traverse((object) => {
    if (bodySkin || !object.isMesh || object.name === "person-head") return;
    if (object.material?.color?.getHex() === deep) bodySkin = object;
  });
  assert.ok(bodySkin, "arms keep the skin swatch");
  assert.equal(findNamed(rosy.person, "person-hair-short").material.color.getHex(), HAIR_COLORS[4].hairColor);
  assert.equal(findNamed(rosy.person, "person-freckle"), null);
  const freckled = createRider(THREE, materials, props, { ...defaultLook(), complexion: "freckled" });
  const spot = findNamed(freckled.person, "person-freckle");
  assert.ok(spot);
  assert.ok(spot.position.z < -0.05, `freckles sit on the face, z ${spot.position.z}`);
  assert.equal(findNamed(town, "person-freckle"), null);
  assert.equal(findNamed(town, "shirt-logo"), null);
  const gray = createRider(THREE, materials, props, oldBare);
  assert.equal(findNamed(gray.person, "person-hair-short").material.color.getHex(), OLD_HAIR);
  const black = createRider(THREE, materials, props, dyed);
  assert.equal(findNamed(black.person, "person-hair-short").material.color.getHex(), 0x1a1a1a);

  const sample = {
    x: 0, y: 0, z: 0,
    forward: { x: 0, y: 0, z: -1 },
    right: { x: 1, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
  };
  rosy.place(sample, 0, Math.PI / 2, 0, 0, true);
  rosy.root.updateMatrixWorld(true);
  const back = findNamed(rosy.person, "shirt-logo-back");
  const front = findNamed(rosy.person, "shirt-logo");
  assert.ok(back);
  assert.ok(front);
  assert.equal(back.material, front.material);
  assert.equal(back.material.color.getHex(), 0xc23b3b);
  assert.notEqual(back.material, findNamed(rosy.root, "can-logo").material);
  const backPos = new THREE.Vector3();
  const frontPos = new THREE.Vector3();
  back.getWorldPosition(backPos);
  front.getWorldPosition(frontPos);
  const half = (back.geometry.parameters.height * rosy.person.scale.y) / 2;
  assert.ok(backPos.z > 0.05, `shirt mark should face the chase camera, z ${backPos.z}`);
  assert.ok(frontPos.z < -0.05, `shirt mark should also face the nose, z ${frontPos.z}`);
  assert.ok(backPos.y - half > 0.98, `shirt mark should clear the rim, bottom ${backPos.y - half}`);
  const backNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(back.getWorldQuaternion(new THREE.Quaternion()));
  const frontNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(front.getWorldQuaternion(new THREE.Quaternion()));
  assert.ok(backNormal.z > 0.9, `back mark normal ${backNormal.z}`);
  assert.ok(frontNormal.z < -0.9, `front mark normal ${frontNormal.z}`);
  const blouse = createRider(THREE, materials, props, { ...defaultLook(), top: "blouse", logo: "bolt" });
  assert.ok(findNamed(blouse.person, "person-blouse"));
  assert.ok(findNamed(blouse.person, "shirt-logo"));
  assert.equal(findNamed(createRider(THREE, materials, props, defaultLook()).person, "shirt-logo"), null);
  const big = createRider(THREE, materials, props, { ...defaultLook(), logo: "diamond", canSize: "big" });
  big.place(sample, 0, 0, 0, 0, true);
  big.root.updateMatrixWorld(true);
  const bigMark = findNamed(big.person, "shirt-logo-back");
  const bigPos = new THREE.Vector3();
  bigMark.getWorldPosition(bigPos);
  const bigHalf = (bigMark.geometry.parameters.height * big.person.scale.y) / 2;
  assert.ok(bigPos.y - bigHalf > 0.98 * 1.28, `big can mark bottom ${bigPos.y - bigHalf}`);
});

test("a sealed town person is one mesh and an unsealed one keeps a head", () => {
  const materials = createMaterials(THREE);
  const props = createProps(THREE, materials);
  const loose = props.createPerson(() => 0.2, "walk");
  assert.ok(loose.userData.limbs);
  assert.ok(findNamed(loose, "person-head"));

  const sealed = props.seal(props.createPerson(() => 0.4, "walk"));
  assert.equal(sealed.userData.limbs, undefined);
  assert.equal(findNamed(sealed, "person-head"), null);
  let painted = 0;
  sealed.traverse((node) => {
    if (node.isMesh) painted += 1;
  });
  assert.equal(painted, 1);

  const block = new THREE.Group();
  const kept = props.createPerson(() => 0.2, "walk");
  kept.userData.actor = true;
  block.add(kept);
  block.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materials.lambert(0x2244aa)));
  const other = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), materials.lambert(0xaa4422));
  other.position.x = 2;
  block.add(other);
  props.compile(block);
  assert.ok(findNamed(kept, "person-head"));
  let folded = 0;
  block.traverse((node) => {
    if (node.isMesh && node.material.vertexColors && !kept.getObjectById?.(node.id)) folded += 1;
  });
  // The person is skipped, so only the two boxes share one painted mesh.
  assert.equal(folded, 1);
  const colors = block.children.find((node) => node.isMesh && node.material.vertexColors)?.geometry.getAttribute("color");
  assert.ok(colors && colors.count > 8);
  assert.ok(Math.abs(colors.getX(0) - colors.getX(colors.count - 3)) > 0.05);

  const lamps = new THREE.Group();
  lamps.add(new THREE.Mesh(new THREE.BoxGeometry(), materials.headlight));
  const second = new THREE.Mesh(new THREE.BoxGeometry(), materials.headlight);
  second.position.x = 1;
  lamps.add(second);
  const beacon = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshLambertMaterial({ color: 0xff2200, emissive: 0xff2200 }),
  );
  beacon.name = "beacon";
  lamps.add(beacon);
  props.seal(lamps);
  assert.equal(lamps.getObjectByName("beacon"), beacon);
  let heads = 0;
  lamps.traverse((node) => {
    if (node.isMesh && node.material === materials.headlight) heads += 1;
  });
  assert.equal(heads, 1);

  const car = props.seal(props.createCar(() => 0.2, "plain"));
  assert.ok(car.userData.wheels.length >= 4);
  for (const pivot of car.userData.wheels) {
    assert.equal(pivot.parent, car);
    const meshes = [];
    pivot.traverse((node) => {
      if (node.isMesh) meshes.push(node);
    });
    assert.equal(meshes.length, 2);
    assert.equal(meshes.filter((node) => node.userData.hub).length, 1);
    const hub = meshes.find((node) => node.userData.hub);
    assert.equal(hub.material.metalness, 0.72);
  }
  const scene = new THREE.Scene();
  const draws = props.createDrawSet(scene);
  draws.adopt(car);
  draws.finish();
  for (const pivot of car.userData.wheels) {
    const meshes = [];
    pivot.traverse((node) => {
      if (node.isMesh) meshes.push(node);
    });
    assert.equal(meshes.length, 1);
    assert.equal(meshes[0].userData.hub, true);
    assert.equal(pivot.parent, car);
  }
  const lot = new THREE.Group();
  const capMat = materials.standard(0xd5dbe2, { flat: true, roughness: 0.3, metalness: 0.72 });
  for (const x of [0, 2]) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(), capMat);
    cap.userData.hub = true;
    cap.position.x = x;
    lot.add(cap);
  }
  props.compile(lot);
  let parkedCaps = 0;
  lot.traverse((node) => {
    if (node.isMesh && node.material === capMat) parkedCaps += 1;
  });
  assert.equal(parkedCaps, 1);
  car.position.set(4, 0, -2);
  car.userData.wheels[0].rotation.x = 0.7;
  draws.sync();
  const batch = scene.children.find((node) => node.isBatchedMesh);
  assert.ok(batch);
  assert.ok(batch.geometry.getAttribute("position").count > 100);
  draws.dispose();
  assert.equal(scene.children.length, 0);
});

test("a name has to be filled in and free in this session", () => {
  const people = [{ actor: "guest:bea", displayName: "Ada" }];
  assert.equal(nameBlock("  ", people, "guest:me"), "Pick a name before you talk.");
  assert.equal(nameBlock("", people, "guest:me", { join: true }), "Pick a name before you join.");
  assert.equal(nameBlock(" ada ", people, "guest:me"), "That name is already in use.");
  assert.equal(nameBlock("Ada", [{ actor: "guest:me", displayName: "Ada" }], "guest:me"), "");
  assert.equal(nameBlock("Bea", people, "guest:me"), "");
});

test("a netciv page names the netciv play site", () => {
  assert.equal(playSite("www.netciv.com"), "netciv");
  assert.equal(playSite("netciv.com"), "netciv");
  assert.equal(playSite("WWW.NETCIV.COM:443"), "netciv");
  assert.equal(playSite("127.0.0.1"), "");
  assert.equal(playSite("localhost"), "");
});

test("a four second hitch is not the host leaving", () => {
  assert.equal(hostWentSilent(1000, 1000 + 4000), false);
  assert.equal(hostWentSilent(1000, 1000 + HOST_SILENCE_MS), false);
  assert.equal(hostWentSilent(1000, 1000 + HOST_SILENCE_MS + 1), true);
  assert.equal(hostWentSilent(Number.NaN, 5000), false);
});

test("six riders and the fleet fit in one relay packet", () => {
  const look = defaultLook();
  const rider = {
    slot: 0,
    s: 123.45,
    offset: -1.23,
    speed: 12.34,
    spin: 1.23,
    hop: 0.5,
    ejected: true,
    canS: 120.11,
    canOffset: 2.34,
    bodyS: 118.5,
    bodyOffset: -0.4,
    face: 3.14,
    ...look,
    displayName: "ABCDEFGHIJKLMNOPQRSTUVWX",
  };
  const cars = Array.from({ length: 5 }, (_, index) => ({
    id: `traffic-${index}`,
    s: 180.25,
    offset: -1.23,
    speed: 8.5,
    roll: 3.2,
    dir: -1,
    wreck: 1,
    spin: 0.4,
    hop: 0.2,
    shift: 0.15,
    paint: 0x2f6adf,
  }));
  const body = {
    kind: "snapshot",
    seq: 99999,
    riders: Array.from({ length: 6 }, (_, slot) => ({ ...rider, slot })),
    cars,
  };
  const bytes = Buffer.byteLength(JSON.stringify(body));
  assert.ok(bytes < 8192, `snapshot is ${bytes} bytes`);
});

test("a short name stays tall enough to read and a long name only grows wider", () => {
  const ada = nameTagScale(180, 100);
  const longer = nameTagScale(720, 100);
  assert.ok(ada.y >= 0.3);
  assert.ok(ada.x > 0.4);
  assert.equal(longer.y, ada.y);
  assert.ok(longer.x > ada.x * 2);
});

test("a longer name allocates a new label texture", () => {
  const previous = globalThis.document;
  const canvases = [];
  globalThis.document = {
    createElement() {
      const canvas = { width: 0, height: 0 };
      canvases.push(canvas);
      canvas.getContext = () => ({
        measureText(text) {
          return { width: String(text || "").length * 40 };
        },
        clearRect() {},
        strokeText() {},
        fillText() {},
      });
      return canvas;
    },
  };
  class CanvasTexture {
    constructor(canvas) {
      this.width = canvas.width;
      this.height = canvas.height;
      this.disposed = false;
    }
    dispose() {
      this.disposed = true;
    }
  }
  class SpriteMaterial {
    constructor(options) {
      this.map = options.map;
      this.userData = {};
      this.needsUpdate = false;
    }
    dispose() {}
  }
  class Sprite {
    constructor(material) {
      this.material = material;
      this.center = { set() {} };
      this.scale = { set() {} };
      this.visible = false;
    }
  }
  const fake = {
    CanvasTexture,
    SpriteMaterial,
    Sprite,
    SRGBColorSpace: "srgb",
    LinearFilter: "linear",
  };
  try {
    const tag = createNameTag(fake);
    tag.setText("A");
    const first = tag.object.material.map;
    tag.setText("A");
    assert.equal(tag.object.material.map, first);
    tag.setText("Arby");
    const second = tag.object.material.map;
    assert.notEqual(second, first);
    assert.equal(first.disposed, true);
    assert.ok(second.width > first.width, `second ${second.width} first ${first.width}`);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

test("a rider wears their name above the head", () => {
  const materials = createMaterials(THREE);
  const props = createProps(THREE, materials);
  const rider = createRider(THREE, materials, props, defaultLook());
  const scene = new THREE.Scene();
  scene.add(rider.root);
  const course = createCourse(1);
  const sample = sampleCourse(course, 40);
  const tag = rider.root.getObjectByName("rider-name");
  rider.setName("   ");
  rider.place(sample, 0, 0, 0, 0, true);
  assert.equal(tag.visible, false);
  rider.setName("Ada");
  rider.place(sample, 0, 0, 0, 0, false);
  assert.equal(tag.visible, false, "a first-person rider does not wear a floating name");
  rider.place(sample, 0, 0, 0, 0, true);
  assert.equal(tag.visible, true);
  rider.root.updateWorldMatrix(true, true);
  const tagAt = new THREE.Vector3();
  tag.getWorldPosition(tagAt);
  const head = rider.person.getObjectByName("person-head");
  const box = new THREE.Box3().setFromObject(head.parent || head);
  assert.ok(tagAt.y >= box.max.y - 1e-4, `name y ${tagAt.y} under crown ${box.max.y}`);
  const dx = tagAt.x - (box.min.x + box.max.x) / 2;
  const dz = tagAt.z - (box.min.z + box.max.z) / 2;
  assert.ok(Math.hypot(dx, dz) < 0.05, `name drifted ${(Math.hypot(dx, dz)).toFixed(3)} from the head`);

  const body = sampleCourse(course, 40);
  const can = sampleCourse(course, 80);
  rider.placeApart({
    canSample: can,
    canOffset: 0,
    canSpin: 0,
    canHop: 0,
    bodySample: body,
    bodyOffset: 0,
    facing: { x: body.forward.x, z: body.forward.z },
    showPerson: true,
    moving: false,
  });
  rider.root.updateWorldMatrix(true, true);
  tag.getWorldPosition(tagAt);
  const bodyDist = Math.hypot(tagAt.x - body.x, tagAt.z - body.z);
  const canDist = Math.hypot(tagAt.x - can.x, tagAt.z - can.z);
  assert.ok(bodyDist < canDist, "the name stays with the person, not the loose can");
  rider.dispose();
});

test("a remote rider shows the name that came with the pose", () => {
  const materials = createMaterials(THREE);
  const props = createProps(THREE, materials);
  const scene = new THREE.Scene();
  const remotes = createRemoteRiders(THREE, scene, materials, props);
  const course = createCourse(1);
  remotes.show(2, { s: 12, offset: 0.4, speed: 3, displayName: "Cal" }, 0, true);
  remotes.place(course, 0, 0);
  const tag = scene.getObjectByName("rider-slot-2").getObjectByName("rider-name");
  assert.equal(tag.visible, true);
  remotes.show(2, { s: 12, offset: 0.4, speed: 3, displayName: "" }, 20, true);
  remotes.place(course, 20, 0);
  assert.equal(tag.visible, false);
});

test("a drawn remote pose is the pose place would draw", () => {
  const materials = createMaterials(THREE);
  const props = createProps(THREE, materials);
  const scene = new THREE.Scene();
  const remotes = createRemoteRiders(THREE, scene, materials, props);
  remotes.show(2, { s: 4, offset: 1, speed: 3, ejected: false }, 1000, true);
  assert.equal(remotes.poses(1000)[0].s, 4);
  assert.equal(remotes.poses(1000)[0].slot, 2);
  remotes.show(2, { s: 8, offset: 1, speed: 3, ejected: false }, 1000);
  assert.equal(remotes.poses(1000)[0].s, 4);
  const halfway = remotes.poses(1025)[0].s;
  assert.ok(halfway > 4 && halfway < 8);
  assert.equal(remotes.poses(1100)[0].s, 8);
});

test("a remote rider wears a sent look and keeps the slot color when the look is missing", () => {
  const materials = createMaterials(THREE);
  const props = createProps(THREE, materials);
  const scene = new THREE.Scene();
  const remotes = createRemoteRiders(THREE, scene, materials, props);
  const pink = { s: 1, shirtRand: RIDER_LOOKS[4].shirtRand, can: CAN_COLORS[4].can };
  remotes.show(2, pink, 0, true);
  const first = scene.getObjectByName("rider-slot-2");
  assert.equal(shellHex({ root: first }), CAN_COLORS[4].can);
  assert.equal(shirtColor({ person: first }), RIDER_LOOKS[4].color);
  remotes.show(2, { s: 2, shirtRand: RIDER_LOOKS[0].shirtRand, can: CAN_COLORS[2].can }, 30, true);
  const next = scene.getObjectByName("rider-slot-2");
  assert.notEqual(next, first);
  assert.equal(shellHex({ root: next }), CAN_COLORS[2].can);
  assert.equal(scene.children.filter((child) => child.name === "rider-slot-2").length, 1);
  remotes.show(3, { s: 1 }, 0, true);
  const fallback = scene.getObjectByName("rider-slot-3");
  assert.equal(shellHex({ root: fallback }), SLOT_LOOKS[3].can);
  remotes.show(2, { ...pink, logo: "star" }, 60, true);
  const marked = scene.getObjectByName("rider-slot-2");
  assert.ok(findNamed(marked, "can-logo"));
  assert.equal(scene.children.filter((child) => child.name === "rider-slot-2").length, 1);
});

function findNamed(root, name) {
  let found = null;
  root.traverse((object) => {
    if (!found && object.name === name) found = object;
  });
  return found;
}

function meshAtY(root, y) {
  let found = null;
  root.traverse((object) => {
    if (found || !object.isMesh) return;
    if (Math.abs(object.position.y - y) < 1e-6) found = object;
  });
  return found;
}

function shellHex(rider) {
  let found = null;
  rider.root.traverse((object) => {
    if (found || !object.isMesh) return;
    if (object.name === "can-round" || object.name === "can-square" || object.name === "can-drum"
      || object.name === "can-taper" || object.name === "can-oval" || object.name === "can-flare"
      || object.name === "can-barrel") {
      found = object;
    }
  });
  return found.material.color.getHex();
}

test("men and women differ in the body and the face", () => {
  const materials = createMaterials(THREE);
  const props = createProps(THREE, materials);
  const man = props.createPerson(() => 0.2, "stand", { body: "man" });
  const woman = props.createPerson(() => 0.2, "stand", { body: "woman" });
  const town = props.createPerson(() => 0.2, "stand");
  const head = (person) => findNamed(person, "person-head");
  assert.ok(head(woman).scale.x < head(man).scale.x, "a woman's skull is narrower");
  assert.ok(findNamed(woman, "person-lashes"));
  assert.ok(findNamed(woman, "person-bust"));
  assert.equal(findNamed(man, "person-lashes"), null);
  assert.equal(findNamed(man, "person-bust"), null);
  assert.ok(findNamed(man, "person-brow-ridge"));
  assert.ok(findNamed(man, "person-jaw"));
  assert.equal(findNamed(woman, "person-brow-ridge"), null);
  assert.equal(findNamed(town, "person-lashes"), null);
  assert.equal(findNamed(town, "person-brow-ridge"), null);
  assert.ok(meshAtY(woman, 1.24).scale.x < meshAtY(man, 1.24).scale.x);
});

test("a seated skirt stays inside the can and a standing one keeps its hem", () => {
  const materials = createMaterials(THREE);
  const props = createProps(THREE, materials);
  const look = { ...defaultLook(), body: "woman", bottom: "skirt" };
  function worldHem(rider) {
    const skirt = findNamed(rider.person, "person-skirt");
    const pos = skirt.geometry.attributes.position;
    let hem = 0;
    for (let i = 0; i < pos.count; i += 1) {
      if (pos.getY(i) > 0.02) continue;
      hem = Math.max(hem, Math.hypot(pos.getX(i), pos.getZ(i)));
    }
    return { skirt, hem, world: hem * skirt.scale.x * rider.person.scale.x };
  }
  const round = createRider(THREE, materials, props, { ...look, canShape: "round" });
  const seated = worldHem(round);
  assert.ok(seated.hem > 0.72, `hem ${seated.hem} lost its flare`);
  assert.ok(seated.skirt.scale.x < 1, "riding skirt is still full width");
  assert.ok(seated.world < 0.41, `round hem sticks out at ${seated.world}`);
  round.person.userData.pose = "stand";
  animatePerson(round.person, 0);
  assert.equal(worldHem(round).skirt.scale.x, 1);
  assert.ok(worldHem(round).world > 0.72 * round.person.scale.x * 0.95);
  const barrel = createRider(THREE, materials, props, { ...look, canShape: "barrel" });
  const cask = worldHem(barrel);
  assert.ok(cask.world < 0.38, `barrel hem sticks out at ${cask.world}`);
  const oval = createRider(THREE, materials, props, { ...look, canShape: "oval" });
  assert.ok(worldHem(oval).world < 0.27, `oval hem sticks out at ${worldHem(oval).world}`);
  barrel.person.userData.pose = "walk";
  animatePerson(barrel.person, 0);
  assert.equal(findNamed(barrel.person, "person-skirt").scale.x, 1);
});

test("a rocket outruns a plain can, a spring hops, and a bumper keeps its speed", () => {
  assert.equal(defaultLook().feature, "none");
  assert.equal(acceptedLook({ shirtRand: 0.2, can: 0x2f7d4a, feature: "rocket" }).feature, "rocket");
  assert.equal(acceptedLook({ shirtRand: 0.2, can: 0x2f7d4a, feature: "spoiler" }).feature, "none");
  assert.notEqual(lookKey(defaultLook()), lookKey({ ...defaultLook(), feature: "bumper" }));

  const course = createCourse(7);
  const plain = createRideState(80);
  const rocket = createRideState(80);
  for (let frame = 0; frame < 80; frame += 1) {
    stepRide(plain, {
      dt: 0.05,
      steer: 0,
      throttle: 1,
      sample: sampleCourse(course, plain.s),
      hazards: [],
      feature: "none",
    });
    stepRide(rocket, {
      dt: 0.05,
      steer: 0,
      throttle: 1,
      sample: sampleCourse(course, rocket.s),
      hazards: [],
      feature: "rocket",
    });
  }
  assert.ok(plain.speed <= 24 + 1e-6, `plain ${plain.speed}`);
  assert.ok(rocket.speed > 24, `rocket ${rocket.speed}`);

  const at = sampleCourse(course, 80);
  const hole = { id: "hole-feature", kind: "pothole", x: at.x, z: at.z, radius: 2 };
  const hopped = createRideState(80);
  const sprung = createRideState(80);
  hopped.speed = 10;
  sprung.speed = 10;
  stepRide(hopped, { dt: 0.05, steer: 0, throttle: 0, sample: at, hazards: [hole], feature: "none" });
  stepRide(sprung, {
    dt: 0.05,
    steer: 0,
    throttle: 0,
    sample: at,
    hazards: [{ ...hole, id: "hole-spring" }],
    feature: "spring",
  });
  assert.ok(sprung.hopVy > hopped.hopVy);

  // The shoulder hit is the step that starts already past the soft edge
  // while the last step still said the can was on the road.
  const soft = at.halfWidth - 0.35;
  const curb = createRideState(80);
  const padded = createRideState(80);
  curb.offset = soft + 0.2;
  padded.offset = soft + 0.2;
  curb.speed = 12;
  padded.speed = 12;
  stepRide(curb, { dt: 0.05, steer: 0, throttle: 0, sample: at, hazards: [], feature: "none" });
  stepRide(padded, { dt: 0.05, steer: 0, throttle: 0, sample: at, hazards: [], feature: "bumper" });
  assert.equal(curb.onShoulder, true);
  assert.equal(padded.onShoulder, true);
  assert.ok(padded.speed > curb.speed);

  const beside = {
    id: "bonus-car",
    kind: "car",
    x: at.x + at.right.x * 2,
    z: at.z + at.right.z * 2,
    halfL: 2.15,
    halfW: 0.95,
    fx: at.forward.x,
    fz: at.forward.z,
    rx: at.right.x,
    rz: at.right.z,
  };
  const miss = createRideState(80);
  stepRide(miss, { dt: 0.05, steer: 0, throttle: 0, sample: at, hazards: [beside] });
  assert.equal(miss.nearMisses, 1);
  assert.equal(miss.bonus, 15);
  miss.hop = 1;
  miss.hopVy = 2;
  stepRide(miss, { dt: 0.05, steer: 0, throttle: 0, sample: at, hazards: [] });
  assert.ok(miss.bonus > 15);

  const materials = createMaterials(THREE);
  const props = createProps(THREE, materials);
  const rider = createRider(THREE, materials, props, { ...defaultLook(), feature: "rocket" });
  rider.root.updateMatrixWorld(true);
  const nozzle = rider.root.getObjectByName("can-rocket");
  const rocketCan = new THREE.Box3().setFromObject(rider.root.getObjectByName("rider-can"));
  const rocketBox = new THREE.Box3().setFromObject(nozzle);
  assert.ok(rocketBox.max.z > rocketCan.max.z);
  const flame = rider.root.getObjectByName("can-rocket-flame");
  assert.equal(flame.visible, false);
  rider.setTuck(1);
  assert.equal(flame.visible, true);
  const sprungCan = createRider(THREE, materials, props, { ...defaultLook(), feature: "spring" });
  sprungCan.root.updateMatrixWorld(true);
  const springCan = new THREE.Box3().setFromObject(sprungCan.root.getObjectByName("rider-can"));
  const springBox = new THREE.Box3().setFromObject(sprungCan.root.getObjectByName("can-spring"));
  assert.ok(springBox.max.x > springCan.max.x);
  assert.equal(sprungCan.root.getObjectByName("can-rocket"), undefined);
  const paddedCan = createRider(THREE, materials, props, { ...defaultLook(), feature: "bumper" });
  paddedCan.root.updateMatrixWorld(true);
  const bumperShell = new THREE.Box3().setFromObject(paddedCan.root.getObjectByName("rider-can"));
  const bumperBox = new THREE.Box3().setFromObject(paddedCan.root.getObjectByName("can-bumper"));
  assert.ok(bumperBox.max.x > bumperShell.max.x);
  rider.dispose();
  sprungCan.dispose();
  paddedCan.dispose();
});

test("clicking pirate again puts back the hat and the can", () => {
  const square = { ...defaultLook(), hat: "none", canShape: "square" };
  const on = togglePirate(square, null);
  assert.equal(on.look.hat, "pirate");
  assert.equal(on.look.canShape, "barrel");
  assert.equal(on.previous.canShape, "square");
  const off = togglePirate(on.look, on.previous);
  assert.equal(off.look.hat, "none");
  assert.equal(off.look.canShape, "square");
  assert.equal(off.previous, null);
  const saved = togglePirate({ ...defaultLook(), hat: "pirate", canShape: "barrel" }, null);
  assert.equal(saved.look.hat, "none");
  assert.equal(saved.look.canShape, "round");
});

test("a pirate hat and a wooden barrel are part of the look", () => {
  const legacy = acceptedLook({ shirtRand: 0.2, can: 0x2f7d4a });
  assert.equal(legacy.hat, "none");
  assert.equal(legacy.canShape, "round");
  assert.equal(acceptedLook({ shirtRand: 0.2, can: 0x2f7d4a, hat: "crown" }).hat, "none");
  assert.equal(acceptedLook({ shirtRand: 0.2, can: 0x2f7d4a, hat: "pirate" }).hat, "pirate");
  assert.equal(acceptedLook({ shirtRand: 0.2, can: 0x2f7d4a, canShape: "barrel" }).canShape, "barrel");
  assert.equal(acceptedLook({ shirtRand: 0.2, can: 0x2f7d4a, canShape: "cask" }).canShape, "round");
  assert.notEqual(lookKey(legacy), lookKey({ ...legacy, hat: "pirate" }));
  assert.notEqual(lookKey(legacy), lookKey({ ...legacy, canShape: "barrel" }));

  const materials = createMaterials(THREE);
  const props = createProps(THREE, materials);
  const town = props.createPerson(() => 0.2, "walk");
  assert.equal(findNamed(town, "person-pirate-hat"), null);
  const plain = createRider(THREE, materials, props, defaultLook());
  assert.equal(findNamed(plain.person, "person-pirate-hat"), null);
  assert.equal(findNamed(plain.root, "can-barrel"), null);

  const rider = createRider(THREE, materials, props, {
    ...defaultLook(),
    hat: "pirate",
    hair: "long",
    canShape: "barrel",
    can: 0xc23b3b,
    canMaterial: "rubber",
    logo: "star",
  });
  const hat = findNamed(rider.person, "person-pirate-hat");
  assert.ok(hat);
  assert.ok(findNamed(rider.person, "person-hair-long"));
  const head = findNamed(rider.person, "person-head");
  head.geometry.computeBoundingBox();
  const skullTop = head.geometry.boundingBox.max.y * head.scale.y;
  assert.ok(hat.position.y >= skullTop - 0.04, `hat y ${hat.position.y} skull ${skullTop}`);
  const brim = findNamed(hat, "person-pirate-brim");
  assert.ok(findNamed(hat, "person-pirate-skull").position.z < 0, "skull faces -z");

  const front = findNamed(hat, "person-pirate-front");
  front.updateMatrix();
  const frontEdge = new THREE.Vector3(0, 0, -0.5).applyMatrix4(front.matrix);
  assert.ok(frontEdge.y > brim.position.y + 0.02, `front brim does not cock up, y ${frontEdge.y}`);
  assert.ok(frontEdge.z < -0.25, `front brim is not on -z, z ${frontEdge.z}`);
  // Hat scale is uniform. The cocked point has to clear the face, which is local -z.
  assert.ok(frontEdge.z * hat.scale.x < -head.scale.z, `front point ${frontEdge.z} stays inside the face`);
  const left = findNamed(hat, "person-pirate-left");
  left.updateMatrix();
  const leftEdge = new THREE.Vector3(-0.5, 0, 0).applyMatrix4(left.matrix);
  assert.ok(leftEdge.y > left.position.y, "left cock does not lift");
  assert.ok(leftEdge.x < left.position.x, "left cock is not on -x");
  assert.ok(leftEdge.x * hat.scale.x < -head.scale.x, `side point ${leftEdge.x} stays inside the skull`);
  const feather = findNamed(hat, "person-pirate-feather");
  feather.updateMatrix();
  const tip = new THREE.Vector3(0, 0.5, 0).applyMatrix4(feather.matrix);
  assert.ok(tip.x < feather.position.x, "feather tip does not lean left");
  assert.ok(tip.y > feather.position.y, "feather tip does not rise");
  assert.ok(tip.z > feather.position.z, "feather tip does not sweep back");

  const shell = findNamed(rider.root, "can-barrel");
  assert.ok(shell);
  assert.equal(findNamed(rider.root, "can-round"), null);
  assert.equal(findNamed(rider.root, "can-band"), null);
  assert.notEqual(shell.material.color.getHex(), 0xc23b3b);
  assert.equal(shell.material.side, THREE.DoubleSide);
  assert.ok((shell.material.metalness ?? 0) < 0.2);
  const again = createRider(THREE, materials, props, { ...defaultLook(), canShape: "barrel", can: 0x2f7d4a });
  assert.equal(findNamed(again.root, "can-barrel").material.color.getHex(), shell.material.color.getHex());
  const pos = shell.geometry.attributes.position;
  const nrm = shell.geometry.attributes.normal;
  let belly = 0;
  let outward = 0;
  let seen = 0;
  for (let i = 0; i < pos.count; i += 1) {
    if (Math.abs(pos.getY(i) - 0.34) > 0.06) continue;
    if (Math.abs(pos.getX(i)) > 0.05) continue;
    if (pos.getZ(i) > 0.2) belly = Math.max(belly, pos.getZ(i));
    if (pos.getZ(i) > 0.3) {
      seen += 1;
      outward += nrm.getZ(i);
    }
  }
  assert.ok(belly > 0.35, `barrel belly z ${belly}`);
  assert.ok(seen > 0 && outward > 0, `barrel normals face inward (${outward})`);
  const logo = findNamed(rider.root, "can-logo");
  assert.ok(logo.position.z > belly, `logo buried, z ${logo.position.z} belly ${belly}`);
  assert.ok(logo.position.z < belly + 0.03, `logo floats, z ${logo.position.z} belly ${belly}`);
  const hoops = [];
  const staves = [];
  rider.root.traverse((object) => {
    if (object.name === "can-hoop") hoops.push(object);
    if (object.name === "can-stave") staves.push(object);
  });
  assert.equal(hoops.length, 3);
  assert.equal(staves.length, 12);
  const mid = hoops.find((hoop) => Math.abs(hoop.position.y - 0.5) < 0.02);
  assert.ok(mid.scale.x > belly && mid.scale.x < 0.52, `hoop radius ${mid.scale.x}`);
  const seam = staves[0];
  seam.updateMatrix();
  const out = new THREE.Vector3(0, 0, 0.5).applyMatrix4(seam.matrix);
  const center = new THREE.Vector3().applyMatrix4(seam.matrix);
  assert.ok(Math.hypot(out.x, out.z) > Math.hypot(center.x, center.z) + 0.004, "stave faces inward");
  const floor = findNamed(rider.root, "can-floor");
  assert.equal(floor.material, shell.material);
  assert.ok(findNamed(rider.root, "can-rim"));
});

function bandMesh(rider) {
  let found = null;
  rider.root.traverse((object) => {
    const radius = object.geometry?.parameters?.radiusTop;
    if (object.isMesh && radius === 0.49 && Math.abs(object.position.y - 0.62) < 1e-6) found = object;
  });
  return found;
}

function shirtColor(rider) {
  let color = null;
  rider.person.traverse((object) => {
    if (color != null || !object.isMesh) return;
    if (Math.abs(object.position.y - 1.24) < 1e-6) color = object.material.color.getHex();
  });
  return color;
}
