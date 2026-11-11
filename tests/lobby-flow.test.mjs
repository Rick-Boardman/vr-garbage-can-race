import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import vm from "node:vm";
import { createPartyClient } from "../src/party.js";

test("the vendored lobby is the exact immutable Magna release", () => {
  const bytes = readFileSync(new URL("../vendor/magna-play/61275e8c5542/play-lobby.js", import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"),
    "4128c24f64e7ece791ad9dec63968c2f5b8b388b8c6ce6b669acbcaab52e2f6d");
});

const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const handlers = ["enterGame", "reportArrival", "applyTable", "paintCountdown"].map(name => {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf("\n}", start) + 2);
}).join("\n");

function player({ headset = false, actor = "host" } = {}) {
  const table = { code: "ABCD", phase: "loading", seed: 42, startsAt: null, instance: { hasHost: true },
    slots: [{ index: 0, actor: "host", role: "host" }, { index: 1, actor: "guest", role: "player" }] };
  const seat = table.slots.find(row => row.actor === actor);
  const handoff = { table, seat };
  const lobby = { hidden: false, countdown: "", setName() {}, setCountdown(value) { this.countdown = value; } };
  const client = { code: "", actor: "", arrives: 0,
    async connect() { this.code = table.code; this.actor = actor; context.applyTable(table); },
    async arrive() { this.arrives++; },
  };
  const context = vm.createContext({
    partyClient: client, magnaLobby: { client: {} }, lobby, gate: "lobby", partyMode: "",
    arrivalReady: false, arrivalRequested: false, gameEntry: 0, heldCode: "", heldStartsAt: "", hills: 0, left: "",
    sawSnapshot: false, latestSnapshot: null, mySlot: 0, hillNote: "", ride: {}, START_S: 36,
    remoteRides: new Map(), shownSnapshot: new Map(), enterVrSupported: headset,
    renderer: { xr: { isPresenting: false } }, deviceFacts: () => ({ headset }),
    wearLook() {}, openChat() {}, syncEnterVrButton() {},
    rememberSlots(slots) { context.slots = slots; },
    slotIndex: row => row.index, newHill() { context.hills++; },
    holdAtLine(ride, s) { ride.s = s; ride.speed = 0; },
    showHill() { lobby.hidden = true; }, waitingNote: () => "Waiting for riders",
    hillChrome: () => "leave", leaveParty(message) { context.left = message; context.partyMode = ""; },
    releaseLine() { context.gate = "racing"; },
    countdownLeft: (at, now) => Math.max(0, (Date.parse(at) - now) / 1000),
    Date, console,
  });
  vm.runInContext(handlers, context);
  return { context, client, table, handoff, lobby };
}

test("desktop reaches the hill and reports in; headset waits for successful Enter VR", async () => {
  const desktop = player(), quest = player({ headset: true, actor: "guest" });
  for (const person of [desktop, quest]) {
    await person.context.enterGame(person.handoff);
    assert.equal(person.context.gate, "waiting");
    assert.equal(person.lobby.hidden, true);
    assert.equal(person.lobby.countdown, "");
    assert.equal(person.context.hills, 1);
  }
  assert.equal(desktop.client.arrives, 1);
  assert.equal(quest.client.arrives, 0);
  await quest.context.reportArrival();
  assert.equal(quest.client.arrives, 0, "2D cannot report headset arrival");
  quest.context.renderer.xr.isPresenting = true;
  await quest.context.reportArrival();
  assert.equal(quest.client.arrives, 1);
  await quest.context.reportArrival();
  assert.equal(quest.client.arrives, 1, "duplicate VR hooks do not re-arrive");

  const startsAt = new Date(Date.now() + 15000).toISOString();
  for (const person of [desktop, quest]) {
    person.context.applyTable({ ...person.table, phase: "counting", startsAt });
    assert.equal(person.context.gate, "countdown");
    assert.equal(person.context.heldStartsAt, startsAt);
    assert.equal(person.context.hills, 1, "arrival event preserves the loaded hill");
    assert.ok(Number(person.lobby.countdown) > 0);
    person.context.applyTable({ ...person.table, phase: "counting", startsAt });
    assert.equal(person.context.hills, 1);
    person.context.applyTable({ ...person.table, phase: "racing", startsAt: new Date(Date.now() - 1000).toISOString() });
    assert.equal(person.context.gate, "racing");
  }
});

test("arrival failures permit an explicit retry; seat removal returns to the lobby", async () => {
  const { context, client, handoff, table } = player();
  await context.enterGame(handoff);
  context.arrivalRequested = false;
  client.arrive = async () => { throw new Error("Arrival refused"); };
  context.console = { error() {} };
  await context.reportArrival();
  assert.equal(context.arrivalRequested, false);
  assert.equal(context.hillNote, "Arrival refused");
  context.applyTable({ ...table, slots: [] });
  assert.match(context.left, /seat was removed/);
});

class Socket {
  static made = [];
  constructor() { this.readyState = 1; this.sent = []; this.events = {}; Socket.made.push(this); }
  addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.readyState = 3; this.fire("close"); }
  fire(type, value) { for (const fn of this.events[type] || []) fn(value); }
}
function connection() {
  const table = { code: "ABCD", slots: [{ actor: "a", displayName: "Ada" }], phase: "loading" };
  let callbacks, stopped = 0;
  const requests = [], sentChat = [];
  const handoff = {
    identity: { actor: "a" }, seat: { index: 0, role: "host" }, table,
    read: async () => table, arrive: async () => ({ ...table, phase: "counting", startsAt: "shared" }),
    chat: {
      watch(value) { callbacks = value; return () => stopped++; },
      messages: async () => [{ id: "old", body: "earlier", createdAt: "1" }],
      async say(body) { sentChat.push(body); return { id: "sent", body, createdAt: "3" }; },
    },
  };
  const play = {
    async request(path) { requests.push(path); return { url: "ws://relay", ticket: "test" }; },
    async action(code, action) { requests.push([code, action]); },
  };
  const client = createPartyClient({ WebSocket: Socket });
  return { client, handoff, play, requests, sentChat, get callbacks() { return callbacks; }, get stopped() { return stopped; } };
}

test("relay is game-owned; HUD chat and table state use only Magna handoff capabilities", async () => {
  const c = connection();
  try {
    const tables = [], events = [], views = [];
    c.client.onTable(table => tables.push(table));
    c.client.onRelay(event => events.push(event));
    await c.client.connect(c.handoff, c.play);
    c.client.chatTransport().subscribe(view => views.push(view));
    const socket = Socket.made.at(-1);
    c.callbacks.status("live");
    c.callbacks.snapshot();
    await new Promise(resolve => setImmediate(resolve));
    c.callbacks.event({ kind: "message", message: { id: "new", body: "hello", createdAt: "2" } });
    c.callbacks.event({ kind: "message", message: { id: "new", body: "hello", createdAt: "2" } });
    assert.deepEqual(views.at(-1).messages.map(row => row.body), ["earlier", "hello"]);
    assert.equal(views.at(-1).status, "live");
    assert.equal(c.client.chatTransport().nameFor("a"), "Ada");
    await c.client.chatTransport().send("on the hill");
    assert.deepEqual(c.sentChat, ["on the hill"]);
    assert.equal(c.client.sendStick({ steer: 0.5 }), true);
    assert.equal(c.client.sendSnapshot({ riders: [] }), true);
    assert.equal(socket.sent.at(-2).body.kind, "stick");
    assert.equal(socket.sent.at(-1).body.kind, "snapshot");
    socket.fire("message", { data: JSON.stringify({ type: "event", event: { kind: "stick", actor: "other" } }) });
    assert.equal(events.at(-1).kind, "stick");
    await c.client.arrive();
    assert.equal(tables.at(-1).startsAt, "shared");
    await c.client.leave();
    assert.deepEqual(c.requests, ["/rooms/ABCD/relay-ticket", ["ABCD", "leave"]]);
    const previous = c.callbacks;
    c.client.stop();
    previous.event({ kind: "instance", room: c.handoff.table });
    assert.equal(c.client.room, null);
    assert.equal(socket.readyState, 3);
    assert.equal(c.stopped, 1);
    assert.equal(c.client.sendStick({}), false);
    assert.equal(views.at(-1).messages.length, 0);
  } finally { c.client.stop(); }
});

test("failed relay connection closes the handoff watch", async () => {
  const c = connection();
  c.play.request = async () => { throw new Error("Relay refused"); };
  await assert.rejects(() => c.client.connect(c.handoff, c.play), /Relay refused/);
  assert.equal(c.stopped, 1);
  assert.equal(c.client.room, null);
});

test("an older HTTP snapshot cannot undo a newer countdown event or resurrect a stopped room", async () => {
  const c = connection();
  try {
    await c.client.connect(c.handoff, c.play);
    let resolveRead;
    c.handoff.read = () => new Promise(resolve => { resolveRead = resolve; });
    c.callbacks.snapshot();
    c.callbacks.event({ kind: "instance", room: { ...c.handoff.table, phase: "counting", startsAt: "shared" } });
    resolveRead(c.handoff.table);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(c.client.room.startsAt, "shared");
    c.callbacks.snapshot();
    c.client.stop();
    resolveRead(c.handoff.table);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(c.client.room, null);
  } finally { c.client.stop(); }
});
