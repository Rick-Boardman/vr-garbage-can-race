import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

// Run the actual application handlers without booting WebGL or a live service.
const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const handlers = [
  "showWaitingTable", "enterHill", "sitDown", "leaveCurrentTable", "beginHost",
  "beginJoin", "beginInvite", "beginAccept", "beginSeal", "onPartyEvent",
  "showHill", "hillChrome", "waitingNote", "paintCountdown", "releaseLine", "rideAlone",
].map((name) => {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  assert.ok(start >= 0, `Missing application handler ${name}`);
  const end = source.indexOf("\n}", start) + 2;
  return source.slice(start, end);
}).join("\n");

function player(role = "host", phase = "waiting", sealed = false) {
  const tableChat = {};
  const room = { code: "TABLE", phase, sealed, seed: 42, slots: [{ actor: "host", slot: 0 }, { actor: "guest", slot: 1 }] };
  const result = { room, you: { role, slot: role === "host" ? 0 : 1 } };
  const lobby = {
    hidden: false, status: "", countdown: "", table: null, invited: [],
    setStatus(text) { this.status = text; },
    setRoom(next) { this.table = next; },
    setCountdown(text) { this.countdown = text; },
    setHillChrome() {},
    bindChat(transport) { this.chat = transport; },
    show() { this.hidden = false; },
    hide() { this.hidden = true; },
    name: () => role, slots: () => 2,
    noteInvite(actor) { this.invited.push(actor); },
    takeInvite: () => ({ code: "TABLE" }),
  };
  const client = {
    code: "", room: null, actor: role,
    async publishName() {},
    async host() { this.code = room.code; this.room = room; return result; },
    async join() { this.code = room.code; this.room = room; return result; },
    async invite() {},
    async seal() { return { room: { ...room, phase: "counting", sealed: true, startsAt: new Date(Date.now() + 15000).toISOString() } }; },
    chatTransport: () => tableChat,
  };
  const context = vm.createContext({
    lobby, partyClient: client, partyMode: "", gate: "lobby", course: { seed: 1 }, ride: {}, START_S: 36,
    sawSnapshot: false, latestSnapshot: null, roomSealed: false, mySlot: 0,
    heldCode: "", heldStartsAt: "", hillNote: "", chatPanel: null,
    remoteRides: new Map(), shownSnapshot: new Map(),
    wearLook() {}, refuseName: () => false, canHostDevice: () => true, deviceFacts: () => ({}),
    slotIndex: (row) => row.slot,
    rememberSlots(slots) { lobby.seated = slots; },
    holdAtLine(ride, s) { ride.s = s; ride.speed = 0; },
    newHill(seed) { context.course.seed = seed; context.hills += 1; }, hills: 0,
    openChat() { context.chatPanel = { dispose() {} }; },
    countdownLeft: (startsAt, now) => (Date.parse(startsAt) - now) / 1000,
    createRideState: () => ({ speed: 7 }), Date,
    failBackToLobby(message) { assert.fail(message); },
  });
  vm.runInContext(handlers, context);
  return context;
}

test("inviting and accepting keep both players at their lobby table until countdown", async () => {
  const host = player();
  const guest = player("player");
  await host.beginInvite("guest");
  await guest.beginAccept();
  for (const person of [host, guest]) {
    assert.equal(person.gate, "lobby");
    assert.equal(person.lobby.hidden, false);
    assert.equal(person.lobby.table.code, "TABLE");
    assert.equal(person.lobby.seated.length, 2);
    assert.equal(person.lobby.chat, person.partyClient.chatTransport());
    assert.equal(person.hills, 0);
  }
  assert.deepEqual(host.lobby.invited, ["guest"]);
  // Even a successful seal response must wait for the shared event.
  await host.beginSeal();
  assert.equal(host.lobby.hidden, false);
  const event = { kind: "countdown", seed: 42, startsAt: host.partyClient.room.startsAt };
  for (const person of [host, guest]) {
    person.onPartyEvent(event);
    assert.equal(person.gate, "countdown");
    assert.equal(person.lobby.hidden, true);
    assert.equal(person.heldStartsAt, event.startsAt);
    assert.equal(person.course.seed, 42);
    assert.equal(person.hills, 1);
    assert.equal(person.lobby.chat, null);
    assert.ok(person.chatPanel);
    person.onPartyEvent(event);
    assert.equal(person.hills, 1, "duplicate events preserve the hill");
    person.onPartyEvent({ kind: "countdown-cancelled" });
    assert.equal(person.gate, "lobby");
    assert.equal(person.lobby.hidden, false);
    assert.equal(person.lobby.table.sealed, false);
    assert.equal(person.lobby.chat, person.partyClient.chatTransport());
  }
});

test("joining the same waiting table stays in the lobby", async () => {
  const person = player("player");
  await person.beginJoin("TABLE", "player");
  await person.beginJoin("table", "player");
  assert.equal(person.lobby.hidden, false);
  assert.equal(person.hills, 0);
});

for (const [phase, sealed] of [["counting", false], ["racing", false], ["waiting", true]]) {
  test(`rejoining a ${phase}, sealed=${sealed} table enters the hill directly`, async () => {
    const person = player("player", phase, sealed);
    person.partyClient.join = async function () {
      this.code = "TABLE";
      this.room = { code: "TABLE", phase, sealed, seed: 42, startsAt: new Date(Date.now() + 15000).toISOString() };
      return { room: this.room, you: { role: "player", slot: 1 } };
    };
    await person.beginJoin("TABLE", "player");
    assert.equal(person.lobby.hidden, true);
    assert.equal(person.gate, "countdown");
  });
}

test("solo still opens the hill immediately", () => {
  const person = player();
  person.rideAlone();
  assert.equal(person.gate, "solo");
  assert.equal(person.lobby.hidden, true);
  assert.equal(person.ride.speed, 7);
});

test("the lobby table shows seats, outstanding invites, host Start and Leave", () => {
  const lobbySource = readFileSync(new URL("../src/lobby.js", import.meta.url), "utf8");
  const tableHandlers = ["setRoom", "setSlots", "noteInvite", "paintNames"].map((name) => {
    const start = lobbySource.indexOf(`  function ${name}(`);
    assert.ok(start >= 0);
    return lobbySource.slice(start, lobbySource.indexOf("\n  }", start) + 4);
  }).join("\n");
  const context = vm.createContext({
    roomCode: "", invited: new Map(), seated: [],
    roster: [{ actor: "guest", displayName: "Guest" }], soloPrompt: true,
    roomCard: {}, soloButton: {}, codeLine: {}, names: {}, startButton: {},
    shownName: (name) => name || "Picking a name", refreshGate() {},
  });
  vm.runInContext(tableHandlers, context);
  context.setRoom({ code: "TABLE", role: "host", phase: "waiting" });
  context.setSlots([{ actor: "host", displayName: "Host" }]);
  context.noteInvite("guest");
  assert.equal(context.codeLine.textContent, "TABLE");
  assert.equal(context.roomCard.hidden, false);
  assert.equal(context.startButton.hidden, false);
  assert.equal(context.names.textContent, "Seated: Host · Invited: Guest");
  context.setSlots([{ actor: "host", displayName: "Host" }, { actor: "guest", displayName: "Guest" }]);
  assert.equal(context.names.textContent, "Seated: Host, Guest");
  context.setRoom({ code: "TABLE", role: "player", phase: "waiting" });
  assert.equal(context.startButton.hidden, true);
  // Leave remains inside the visible table for both roles.
  assert.match(lobbySource, /roomCard\.append\(codeLine, names, startButton, leaveButton\)/);
  assert.match(lobbySource, /leaveButton\.addEventListener\("click", \(\) => onLeave\?\.\(\)\)/);
  context.noteInvite("other");
  context.setRoom(null);
  assert.equal(context.roomCard.hidden, true);
  assert.equal(context.invited.size, 0);
});
