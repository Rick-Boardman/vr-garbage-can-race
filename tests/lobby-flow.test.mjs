import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import vm from "node:vm";
import { createGameEntry } from "@rb/arcade/entry";
import { createPartyClient } from "../src/party.js";

test("the vendored lobby is the exact immutable Magna release", () => {
  const bytes = readFileSync(new URL("../src/vendor/magna-play/61275e8c5542/play-lobby.js", import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"),
    "4128c24f64e7ece791ad9dec63968c2f5b8b388b8c6ce6b669acbcaab52e2f6d");
});

const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const handlers = ["enterGame", "entryHooks", "reportArrival", "applyTable", "paintCountdown"].map(name => {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf("\n}", start) + 2);
}).join("\n");

function player({ headset = false, actor = "host", arrive } = {}) {
  const table = { code: "ABCD", phase: "loading", seed: 42, startsAt: null, instance: { hasHost: true },
    slots: [{ index: 0, actor: "host", role: "host", displayName: "Ada" }, { index: 1, actor: "guest", role: "player", displayName: "Bo" }] };
  const seat = table.slots.find(row => row.actor === actor);
  let callbacks = null;
  const counts = { arrives: 0, watches: 0, unwatched: 0 };
  const handoff = {
    identity: { actor }, table, seat,
    async arrive() {
      counts.arrives++;
      if (arrive) return arrive();
      return { ...table, slots: table.slots.map(row => ({ ...row })) };
    },
    read: async () => table,
    chat: {
      roomId: "room-ABCD", code: "ABCD",
      watch(value) { counts.watches++; callbacks = value; return () => counts.unwatched++; },
      messages: async () => [],
      say: async body => ({ id: "sent", body, createdAt: "3" }),
    },
  };
  const lobby = { hidden: false, countdown: "", setName() {}, setCountdown(value) { this.countdown = value; } };
  const client = { code: "", actor: "", room: null, connects: 0,
    async connect(next) { this.connects++; this.code = table.code; this.actor = actor; this.room = next.table; },
  };
  const context = vm.createContext({
    partyClient: client, magnaLobby: { client: {} }, lobby, gate: "lobby", partyMode: "", tableEntry: null,
    arrivalReady: false, arrivalRequested: false, gameEntry: 0, heldCode: "", heldStartsAt: "", hills: 0,
    left: "", toldHost: false, opened: null,
    sawSnapshot: false, latestSnapshot: null, mySlot: 0, hillNote: "", ride: {}, START_S: 36,
    remoteRides: new Map(), shownSnapshot: new Map(), enterVrSupported: headset,
    renderer: { xr: { isPresenting: false } }, deviceFacts: () => ({ headset }),
    createGameEntry,
    wearLook() {}, syncEnterVrButton() {},
    openChat() { context.opened = context.tableEntry.transport; },
    rememberSlots(slots) { context.slots = slots; },
    slotIndex: row => row.index, newHill() { context.hills++; },
    holdAtLine(ride, s) { ride.s = s; ride.speed = 0; },
    showHill() { lobby.hidden = true; }, waitingNote: () => "Waiting for riders",
    hillChrome: () => "leave",
    // As the real leaveParty does: bump the entry generation, then dispose the entry.
    leaveParty(message, { tellHost = false } = {}) {
      context.gameEntry++;
      context.left = message; context.toldHost = tellHost; context.partyMode = ""; context.gate = "lobby";
      context.arrivalReady = false; context.arrivalRequested = false;
      const ended = context.tableEntry;
      context.tableEntry = null;
      ended?.dispose();
    },
    releaseLine() { if (context.gate === "countdown") context.gate = "racing"; },
    countdownLeft: (at, now) => Math.max(0, (Date.parse(at) - now) / 1000),
    Date, console: { error() {} },
  });
  vm.runInContext(handlers, context);
  return { context, client, table, handoff, lobby, counts, get callbacks() { return callbacks; } };
}

test("the READY retry slot is gone and arrival goes only through @rb/arcade/entry", () => {
  assert.doesNotMatch(source, /READY|Retry reporting arrival|HOTBAR\.start/);
  assert.match(source, /import \{ createGameEntry \} from "@rb\/arcade\/entry";/);
  const party = readFileSync(new URL("../src/party.js", import.meta.url), "utf8");
  assert.doesNotMatch(party, /\.watch\(|\.read\(|\.arrive\(|chatTransport|\.say\(|\.messages\(/);
});

test("desktop arrives through the entry; headset waits for successful Enter VR", async () => {
  const desktop = player(), quest = player({ headset: true, actor: "guest" });
  for (const person of [desktop, quest]) {
    await person.context.enterGame(person.handoff);
    assert.equal(person.context.gate, "waiting");
    assert.equal(person.lobby.hidden, true);
    assert.equal(person.lobby.countdown, "");
    assert.equal(person.context.hills, 1);
    assert.equal(person.client.connects, 1, "the relay stays the game's");
    assert.equal(person.context.opened, person.context.tableEntry.transport, "RIDERS chat uses Arcade's transport");
  }
  assert.equal(desktop.counts.arrives, 1);
  assert.equal(desktop.counts.watches, 1);
  assert.equal(quest.counts.arrives, 0);
  await quest.context.reportArrival();
  assert.equal(quest.counts.arrives, 0, "2D cannot report headset arrival");
  quest.context.renderer.xr.isPresenting = true;
  await quest.context.reportArrival();
  assert.equal(quest.counts.arrives, 1);
  await quest.context.reportArrival();
  assert.equal(quest.counts.arrives, 1, "duplicate VR hooks do not re-arrive");

  const startsAt = new Date(Date.now() + 15000).toISOString();
  for (const person of [desktop, quest]) {
    assert.equal(person.context.tableEntry.state.phase, "entered");
    person.callbacks.event({ kind: "countdown", code: "ABCD", startsAt });
    assert.equal(person.context.gate, "countdown");
    assert.equal(person.context.heldStartsAt, startsAt);
    assert.equal(person.context.hills, 1, "a countdown preserves the loaded hill");
    assert.ok(Number(person.lobby.countdown) > 0);
    person.callbacks.event({ kind: "countdown", code: "ABCD", startsAt });
    assert.equal(person.context.hills, 1);
    person.callbacks.event({ kind: "message", message: { id: "m1", authorUserId: "host", body: "go", createdAt: "1" } });
    const views = [];
    person.context.opened.subscribe(view => views.push(view));
    assert.deepEqual(views.at(-1).messages.map(row => row.body), ["go"]);
    assert.equal(person.context.opened.nameFor("guest"), "Bo");
    person.context.tableEntry.dispose();
  }
});

test("a late countdown releases the line at once", async () => {
  const person = player();
  await person.context.enterGame(person.handoff);
  person.callbacks.event({ kind: "countdown", code: "ABCD", startsAt: new Date(Date.now() - 1000).toISOString() });
  assert.equal(person.context.gate, "racing");
  person.context.tableEntry.dispose();
});

test("a failed arrival is terminal: no retry, the seat is given up, back to the lobby", async () => {
  const person = player({ arrive: async () => { throw new Error("Arrival refused"); } });
  const { context, counts } = person;
  await context.enterGame(person.handoff);
  assert.equal(counts.arrives, 1);
  assert.equal(context.left, "Arrival refused");
  assert.equal(context.toldHost, true);
  assert.equal(context.gate, "lobby");
  assert.equal(counts.unwatched, 1, "the entry released its watch");
  await context.reportArrival();
  assert.equal(counts.arrives, 1, "nothing reports arrival again");
});

test("entry leave reasons return to the lobby with the reason", async () => {
  const seatless = player();
  await seatless.context.enterGame(seatless.handoff);
  seatless.callbacks.event({ kind: "instance", code: "ABCD", room: { ...seatless.table, slots: [seatless.table.slots[1]] } });
  assert.match(seatless.context.left, /seat was removed/);

  const cancelled = player();
  await cancelled.context.enterGame(cancelled.handoff);
  cancelled.callbacks.event({ kind: "countdown", code: "ABCD", startsAt: new Date(Date.now() + 15000).toISOString() });
  cancelled.callbacks.event({ kind: "countdown-cancelled", code: "ABCD" });
  assert.equal(cancelled.context.left, "The table returned to the lobby.");

  const closed = player();
  await closed.context.enterGame(closed.handoff);
  closed.callbacks.event({ kind: "closed", code: "ABCD" });
  assert.equal(closed.context.left, "The room closed.");
  assert.equal(closed.counts.unwatched, 1);
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
  const requests = [];
  const refuse = () => { throw new Error("the relay must not use the handoff's entry capabilities"); };
  const handoff = {
    identity: { actor: "a" }, seat: { index: 0, role: "host" }, table,
    read: refuse, arrive: refuse, chat: { watch: refuse, messages: refuse, say: refuse },
  };
  const play = {
    async request(path) { requests.push(path); return { url: "ws://relay", ticket: "test" }; },
    async action(code, action) { requests.push([code, action]); },
  };
  const client = createPartyClient({ WebSocket: Socket });
  return { client, handoff, play, requests };
}

test("the relay is game-owned and uses nothing of the handoff but its table and identity", async () => {
  const c = connection();
  try {
    const events = [];
    c.client.onRelay(event => events.push(event));
    await c.client.connect(c.handoff, c.play);
    const socket = Socket.made.at(-1);
    assert.equal(c.client.code, "ABCD");
    assert.equal(c.client.actor, "a");
    assert.equal(c.client.sendStick({ steer: 0.5 }), true);
    assert.equal(c.client.sendSnapshot({ riders: [] }), true);
    assert.equal(socket.sent.at(-2).body.kind, "stick");
    assert.equal(socket.sent.at(-1).body.kind, "snapshot");
    socket.fire("message", { data: JSON.stringify({ type: "event", event: { kind: "stick", actor: "other" } }) });
    assert.equal(events.at(-1).kind, "stick");
    await c.client.leave();
    assert.deepEqual(c.requests, ["/rooms/ABCD/relay-ticket", ["ABCD", "leave"]]);
    c.client.stop();
    assert.equal(c.client.room, null);
    assert.equal(socket.readyState, 3);
    assert.equal(c.client.sendStick({}), false);
  } finally { c.client.stop(); }
});

test("a failed relay connection leaves no room", async () => {
  const c = connection();
  c.play.request = async () => { throw new Error("Relay refused"); };
  await assert.rejects(() => c.client.connect(c.handoff, c.play), /Relay refused/);
  assert.equal(c.client.room, null);
});
