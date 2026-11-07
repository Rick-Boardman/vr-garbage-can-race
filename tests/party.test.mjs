import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { CAN_COLORS, RIDER_LOOKS, acceptedLook, defaultLook, lookKey, nameBlock } from "../src/looks.js";
import { createMaterials } from "../src/materials.js";
import {
  canHostDevice,
  countdownLeft,
  createPartyClient,
  easePose,
  holdAtLine,
  poseOf,
  SLOT_LOOKS,
  separatePack,
  slotIndex,
  stickCommand,
  takeJump,
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
});

test("easing follows the host pose and snaps when the cans are far apart", () => {
  const local = { s: 0, offset: 0, speed: 1 };
  const eased = easePose(local, { s: 10, offset: 0, speed: 5 }, 0.1);
  assert.equal(eased.s, 4);
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

test("sticks go out on the relay socket, not the chat socket", async () => {
  const made = [];
  class FakeSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 1;
      this.sent = [];
      this.listeners = {};
      made.push(this);
    }
    addEventListener(type, fn) {
      (this.listeners[type] ||= []).push(fn);
    }
    send(data) {
      this.sent.push(String(data));
    }
    close() {
      this.readyState = 3;
      for (const fn of this.listeners.close || []) fn();
    }
  }
  const pages = {
    "/api/play/guest": { kind: "guest" },
    "/api/play/rooms": {
      room: {
        code: "K7QP",
        seed: 9,
        slots: [{ index: 0, actor: "guest:a", displayName: "Ada", role: "host" }],
      },
      you: { slot: 0, role: "host" },
    },
    "/api/play/rooms/K7QP/messages": { messages: [{ id: "m2", body: "second" }, { id: "m1", body: "first" }] },
    "/api/play/rooms/K7QP/chat-ticket": { ticket: "chat-ticket", url: "ws://chat" },
    "/api/play/rooms/K7QP/relay-ticket": { ticket: "relay-ticket", url: "ws://relay" },
  };
  const client = createPartyClient({
    base: "http://play",
    fetch: async (url) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(pages[url.replace("http://play", "")] || {}),
    }),
    WebSocket: FakeSocket,
  });
  try {
    await client.host({ seed: 9, name: "Ada" });
    assert.equal(made.length, 2);
    assert.equal(made[0].__relay, undefined);
    assert.equal(made[1].__relay, true);
    assert.equal(client.sendStick({ steer: 0.2, throttle: 1, strafe: 0, jumpSeq: 0 }), true);
    assert.equal(made[0].sent.some((row) => row.includes('"action":"relay"')), false);
    const relay = made[1].sent.find((row) => row.includes('"action":"relay"'));
    assert.equal(JSON.parse(relay).body.steer, 0.2);
    assert.equal(JSON.parse(relay).body.kind, "stick");
  } finally {
    client.stop();
  }
});

test("a failed join leaves the sockets that are already open", async () => {
  const made = [];
  class FakeSocket {
    constructor() {
      this.readyState = 1;
      this.listeners = {};
      made.push(this);
    }
    addEventListener(type, fn) {
      (this.listeners[type] ||= []).push(fn);
    }
    send() {}
    close() {
      this.readyState = 3;
      for (const fn of this.listeners.close || []) fn();
    }
  }
  const client = createPartyClient({
    base: "http://play",
    fetch: async (url) => {
      if (String(url).includes("/join")) {
        return {
          ok: false,
          status: 409,
          text: async () => JSON.stringify({ code: "host_gone", message: "The host has left." }),
        };
      }
      const path = String(url).replace("http://play", "");
      const pages = {
        "/api/play/guest": { kind: "guest", actor: "guest:a" },
        "/api/play/rooms": {
          room: { code: "K7QP", seed: 9, slots: [{ index: 0, actor: "guest:a", role: "host" }] },
          you: { slot: 0, role: "host" },
        },
        "/api/play/rooms/K7QP/messages": { messages: [] },
        "/api/play/rooms/K7QP/chat-ticket": { ticket: "chat-ticket", url: "ws://chat" },
        "/api/play/rooms/K7QP/relay-ticket": { ticket: "relay-ticket", url: "ws://relay" },
      };
      return { ok: true, status: 200, text: async () => JSON.stringify(pages[path] || {}) };
    },
    WebSocket: FakeSocket,
  });
  try {
    await client.host({ seed: 9, name: "Ada" });
    assert.equal(made.length, 2);
    await assert.rejects(() => client.join({ code: "GONE", name: "Ada" }), /host has left/);
    assert.equal(made.length, 2);
    assert.equal(made[0].readyState, 1);
    assert.equal(made[1].readyState, 1);
    assert.equal(client.code, "K7QP");
  } finally {
    client.stop();
  }
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
  assert.equal(remoteBand.material.color.getHex(), 0xc23b3b);
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
  assert.equal(bandMesh(chosen).material.color.getHex(), CAN_COLORS[0].can);
  assert.notEqual(bandMesh(chosen).material, bandMesh(plain).material);
  const red = createRider(THREE, materials, props, { shirtRand: RIDER_LOOKS[0].shirtRand, can: CAN_COLORS[1].can });
  assert.equal(shirtColor(red), RIDER_LOOKS[0].color);
  assert.equal(bandMesh(red).material.color.getHex(), CAN_COLORS[1].can);
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
  assert.equal(findNamed(elder.person, "person-hair-short").material.color.getHex(), 0xcfc8bc);
  assert.equal(findNamed(elder.root, "rider-can").scale.x, 1.28);
  assert.ok(elder.person.scale.x > adult.person.scale.x);
  animatePerson(elder.person, 0);
  assert.ok(elder.person.userData.limbs.head.rotation.x > 0.4);
  const bald = props.createPerson(() => 0.2, "ride", { age: "old", hair: "bald" });
  assert.ok(findNamed(bald, "person-glasses"));
  assert.equal(findNamed(bald, "person-hair-short"), null);
  const town = props.createPerson(() => 0.2, "walk");
  assert.equal(findNamed(town, "person-glasses"), null);
  assert.equal(findNamed(town, "person-head").scale.x, findNamed(adult.person, "person-head").scale.x);
  const odd = acceptedLook({ shirtRand: 0.2, can: 0x2f7d4a, age: "ancient", canSize: "huge" });
  assert.equal(odd.age, "adult");
  assert.equal(odd.canSize, "regular");
  assert.notEqual(lookKey(defaultLook()), lookKey({ ...defaultLook(), age: "young" }));
  assert.notEqual(lookKey(defaultLook()), lookKey({ ...defaultLook(), canSize: "small" }));
});

test("a name has to be filled in and free in this session", () => {
  const people = [{ actor: "guest:bea", displayName: "Ada" }];
  assert.equal(nameBlock("  ", people, "guest:me"), "Pick a name before you talk.");
  assert.equal(nameBlock("", people, "guest:me", { join: true }), "Pick a name before you join.");
  assert.equal(nameBlock(" ada ", people, "guest:me"), "That name is already in use.");
  assert.equal(nameBlock("Ada", [{ actor: "guest:me", displayName: "Ada" }], "guest:me"), "");
  assert.equal(nameBlock("Bea", people, "guest:me"), "");
});

test("a blank name is published blank and cannot chat", async () => {
  const calls = [];
  const client = createPartyClient({
    base: "http://play",
    fetch: async (url, init) => {
      const path = String(url).replace("http://play", "");
      const body = init?.body ? JSON.parse(init.body) : null;
      calls.push({ path, body });
      if (path === "/api/play/guest") {
        return { ok: true, status: 200, text: async () => JSON.stringify({ kind: "guest", actor: "guest:me" }) };
      }
      if (path === "/api/play/lobby") {
        const mine = body?.displayName || "";
        const people = mine
          ? [{ actor: "guest:them", displayName: "Ada" }, { actor: "guest:me", displayName: mine }]
          : [{ actor: "guest:me", displayName: "" }];
        return { ok: true, status: 200, text: async () => JSON.stringify({ people, games: [], maxPlayers: 6 }) };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({}) };
    },
    WebSocket: class {
      constructor() {
        this.readyState = 1;
      }
      addEventListener() {}
      send() {}
      close() {}
    },
  });
  await client.publishName("   ");
  assert.equal(calls.find((row) => row.path === "/api/play/lobby").body.displayName, "");
  assert.equal(await client.lobbyTransport().send("hello"), false);
  assert.equal(calls.some((row) => String(row.path).includes("/messages")), false);
  await client.publishName("Ada");
  assert.equal(await client.lobbyTransport().send("hello"), false);
  assert.equal(await client.chatTransport().send("hello"), false);
});

test("a remote rider wears a sent look and keeps the slot color when the look is missing", () => {
  const materials = createMaterials(THREE);
  const props = createProps(THREE, materials);
  const scene = new THREE.Scene();
  const remotes = createRemoteRiders(THREE, scene, materials, props);
  const pink = { s: 1, shirtRand: RIDER_LOOKS[4].shirtRand, can: CAN_COLORS[4].can };
  remotes.show(2, pink, 0, true);
  const first = scene.getObjectByName("rider-slot-2");
  assert.equal(bandMesh({ root: first }).material.color.getHex(), CAN_COLORS[4].can);
  assert.equal(shirtColor({ person: first }), RIDER_LOOKS[4].color);
  remotes.show(2, { s: 2, shirtRand: RIDER_LOOKS[0].shirtRand, can: CAN_COLORS[2].can }, 30, true);
  const next = scene.getObjectByName("rider-slot-2");
  assert.notEqual(next, first);
  assert.equal(bandMesh({ root: next }).material.color.getHex(), CAN_COLORS[2].can);
  assert.equal(scene.children.filter((child) => child.name === "rider-slot-2").length, 1);
  remotes.show(3, { s: 1 }, 0, true);
  const fallback = scene.getObjectByName("rider-slot-3");
  assert.equal(bandMesh({ root: fallback }).material.color.getHex(), SLOT_LOOKS[3].can);
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
