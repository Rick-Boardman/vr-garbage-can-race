// A party on one hill. The browser never names a topic. Sticks go up,
// poses come down, and solo play does not open either channel.

import { FOOT_RADIUS } from "./constants.js";


export const GAME = "garbage-can-race";

// Slot 0 is how everyone else sees the host. The local can stays the
// default green; createRider only uses these when a look is passed.
export const SLOT_LOOKS = [
  { shirtRand: 0.02, can: 0xc23b3b },
  { shirtRand: 0.3, can: 0x2f6fbf },
  { shirtRand: 0.42, can: 0xe0a100 },
  { shirtRand: 0.55, can: 0x7a4ea3 },
  { shirtRand: 0.67, can: 0xefefef },
  { shirtRand: 0.8, can: 0x222831 },
];

const REACH = 1.15;
const PACK_RADIUS = REACH / 2;
// Start lanes are 1.2 m apart, just outside the 1.15 m contact, so a
// straight segment misses the rider beside you. The other fork is
// several meters away and must still be a legal pass.
const ORDER_LANE = REACH + 0.75;

export function playBase(search = "") {
  const text = String(search || "");
  const params = new URLSearchParams(text.startsWith("?") ? text.slice(1) : text);
  const raw = params.get("play");
  if (raw == null || raw === "") return "";
  return String(raw).replace(/\/$/, "");
}

// API Gateway never sees the visitor's Host, so a page on NetCiv has to name
// the tenant. A local page leaves this blank and stays on the local play site.
export function playSite(hostname = "") {
  const host = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
  if (host === "netciv.com" || host === "www.netciv.com") return "netciv";
  return "";
}

// The homepage Solo Play button opens the hill already rolling. The plain
// address, and an explicit solo=0, stay on the lobby for Multiplayer.
export function wantsSolo(search = "") {
  const text = String(search || "");
  const params = new URLSearchParams(text.startsWith("?") ? text.slice(1) : text);
  if (!params.has("solo")) return false;
  const value = String(params.get("solo") || "").trim().toLowerCase();
  return value === "" || value === "1" || value === "true" || value === "yes";
}

export function canHostDevice({ userAgent = "", screenMin = 1000, touchPoints = 0, headset = false } = {}) {
  const ua = String(userAgent || "");
  if (headset || /OculusBrowser|\bQuest\b/i.test(ua)) return true;
  if (/iPhone|iPod/i.test(ua)) return false;
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return false;
  if (Number(screenMin) < 700 && Number(touchPoints) > 1) return false;
  return true;
}

export function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function slotIndex(row) {
  const value = Number(row?.slot ?? row?.index);
  return Number.isFinite(value) ? value : null;
}

export function poseOf(ride) {
  const ejected = ride?.eject || null;
  return {
    s: round2(ride?.s),
    offset: round2(ride?.offset),
    speed: round2(ride?.speed),
    spin: round2(ejected ? ejected.canSpin : ride?.spin),
    hop: round2(ejected ? ejected.canHop : ride?.hop),
    ejected: !!ejected,
    canS: round2(ejected ? ejected.canS : ride?.s),
    canOffset: round2(ejected ? ejected.canOffset : ride?.offset),
    bodyS: round2(ejected ? ejected.bodyS : ride?.s),
    bodyOffset: round2(ejected ? ejected.bodyOffset : ride?.offset),
    face: round2(ejected ? ejected.face || 0 : 0),
  };
}

export function easePose(local, remote, step) {
  const ds = (Number(remote?.s) || 0) - (Number(local?.s) || 0);
  const dOffset = (Number(remote?.offset) || 0) - (Number(local?.offset) || 0);
  const gap = Math.hypot(ds, dOffset);
  if (gap > 12) {
    return { s: Number(remote?.s) || 0, offset: Number(remote?.offset) || 0, speed: Number(remote?.speed) || 0 };
  }
  // The guest already walked this step. The host pose is a round trip behind
  // that walk. A fast can still eases once the gap is more than a short lead,
  // so a real miss is not ignored.
  const speed = Math.max(Math.abs(Number(local?.speed) || 0), Math.abs(Number(remote?.speed) || 0));
  const lead = 0.8 + Math.min(speed, 8) * 0.35;
  if (gap < lead) {
    return {
      s: Number(local?.s) || 0,
      offset: Number(local?.offset) || 0,
      speed: Number(local?.speed) || 0,
    };
  }
  const blend = Math.min(1, Math.max(0, Number(step) || 0) * 4);
  const mix = (from, to) => (Number(from) || 0) + ((Number(to) || 0) - (Number(from) || 0)) * blend;
  return {
    s: mix(local?.s, remote?.s),
    offset: mix(local?.offset, remote?.offset),
    speed: mix(local?.speed, remote?.speed),
  };
}

// The guest owns the facing they are looking. The host uses it for the
// step instead of a face that was never turned.
export function applyGuestFace(state, command) {
  if (!state?.eject) return;
  const face = Number(command?.face);
  if (!Number.isFinite(face)) return;
  state.eject.face = face;
}

// Push overlapping riders apart along the course (s, offset). This is not
// a camera frame: no lookAt, no yaw, no sin/cos. A frozen body (movable
// false) stays put and the other rider takes the whole shove. Two bodies
// with the same owner, a person and their own loose can, do not shove.
export function separatePack(riders) {
  const list = riders || [];
  for (let pass = 0; pass < 4; pass += 1) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        if (list[i].owner != null && list[i].owner === list[j].owner) continue;
        const reach = radiusOf(list[i]) + radiusOf(list[j]);
        const ds = (Number(list[j].s) || 0) - (Number(list[i].s) || 0);
        const dOffset = (Number(list[j].offset) || 0) - (Number(list[i].offset) || 0);
        const dist = Math.hypot(ds, dOffset);
        if (dist >= reach) continue;
        const alongS = dist < 1e-6 ? 1 : ds / dist;
        const alongOffset = dist < 1e-6 ? 0 : dOffset / dist;
        const full = reach - dist;
        const iMoves = list[i].movable !== false;
        const jMoves = list[j].movable !== false;
        const shareI = iMoves && jMoves ? 0.5 : iMoves ? 1 : 0;
        const shareJ = iMoves && jMoves ? 0.5 : jMoves ? 1 : 0;
        if (shareI > 0) {
          list[i].s = (Number(list[i].s) || 0) - alongS * full * shareI;
          list[i].offset = (Number(list[i].offset) || 0) - alongOffset * full * shareI;
          if (Number.isFinite(list[i].bump)) list[i].bump = Math.max(list[i].bump, 0.5);
        }
        if (shareJ > 0) {
          list[j].s = (Number(list[j].s) || 0) + alongS * full * shareJ;
          list[j].offset = (Number(list[j].offset) || 0) + alongOffset * full * shareJ;
          if (Number.isFinite(list[j].bump)) list[j].bump = Math.max(list[j].bump, 0.5);
        }
        stopClosing(list[i], list[j], alongS, alongOffset);
      }
    }
  }
  return list;
}

function radiusOf(body) {
  return Number.isFinite(body?.radius) ? Number(body.radius) : PACK_RADIUS;
}

function stopClosing(left, right, alongS, alongOffset) {
  const leftMoves = left.movable !== false;
  const rightMoves = right.movable !== false;
  if (!leftMoves && !rightMoves) return;
  const relS = (Number(right.speed) || 0) - (Number(left.speed) || 0);
  const relOffset = (Number(right.latVel) || 0) - (Number(left.latVel) || 0);
  const closing = relS * alongS + relOffset * alongOffset;
  if (closing >= 0) return;
  if (leftMoves && rightMoves) {
    const half = -closing / 2;
    addCourseVel(left, -alongS * half, -alongOffset * half);
    addCourseVel(right, alongS * half, alongOffset * half);
    return;
  }
  if (leftMoves) addCourseVel(left, alongS * closing, alongOffset * closing);
  else addCourseVel(right, -alongS * closing, -alongOffset * closing);
}

function addCourseVel(body, alongS, alongOffset) {
  body.speed = (Number(body.speed) || 0) + alongS;
  body.latVel = (Number(body.latVel) || 0) + alongOffset;
}

// Circles bound to one ride. A seated rider is one can. A rider who hopped
// out is a person plus a loose can, and those two do not collide.
export function contactsOf(state, owner, movable = true) {
  if (!state) return [];
  const eject = state.eject;
  if (!eject) {
    return [{
      owner,
      movable,
      radius: PACK_RADIUS,
      get s() { return state.s; },
      set s(value) { state.s = value; },
      get offset() { return state.offset; },
      set offset(value) { state.offset = value; },
      get speed() { return state.speed; },
      set speed(value) { state.speed = value; },
      get latVel() { return state.latVel || 0; },
      set latVel(value) { state.latVel = value; },
      get bump() { return state.bump || 0; },
      set bump(value) { state.bump = value; },
    }];
  }
  return [
    {
      owner,
      movable,
      radius: FOOT_RADIUS,
      get s() { return eject.bodyS; },
      set s(value) { eject.bodyS = value; state.s = value; },
      get offset() { return eject.bodyOffset; },
      set offset(value) { eject.bodyOffset = value; state.offset = value; },
      get speed() { return eject.bodyAlong || 0; },
      set speed(value) { eject.bodyAlong = value; },
      get latVel() { return eject.bodyLat || 0; },
      set latVel(value) { eject.bodyLat = value; },
    },
    {
      owner,
      movable,
      radius: PACK_RADIUS,
      get s() { return eject.canS; },
      set s(value) { eject.canS = value; },
      get offset() { return eject.canOffset; },
      set offset(value) { eject.canOffset = value; },
      get speed() { return eject.canSpeed || 0; },
      set speed(value) { eject.canSpeed = value; },
      get latVel() { return eject.canLat || 0; },
      set latVel(value) { eject.canLat = value; },
    },
  ];
}

export function poseContacts(pose, owner) {
  if (!pose) return [];
  if (pose.ejected) {
    return [
      frozenContact(owner, pose.bodyS, pose.bodyOffset, FOOT_RADIUS, 0, 0),
      frozenContact(owner, pose.canS, pose.canOffset, PACK_RADIUS, pose.speed, 0),
    ];
  }
  return [frozenContact(owner, pose.s, pose.offset, PACK_RADIUS, pose.speed, 0)];
}

function frozenContact(owner, s, offset, radius, speed, latVel) {
  return {
    owner,
    movable: false,
    radius,
    s: Number(s) || 0,
    offset: Number(offset) || 0,
    speed: Number(speed) || 0,
    latVel: Number(latVel) || 0,
  };
}

// Keep a guest can on the host's pose without sliding through another rider.
// The course pair (s, offset) is the same frame separatePack uses. A guest
// who predicted past a nearby rider, while the host still has them behind,
// snaps back even when the straight segment misses that rider.
export function applyRiderEase(state, eased, target, blockers) {
  if (!state) return state;
  const blocks = Array.isArray(blockers) ? blockers : [];
  const targetS = Number(target?.s) || 0;
  const targetOffset = Number(target?.offset) || 0;
  const overlapping = circleHits(state.s, state.offset, PACK_RADIUS, blocks);
  const targetBlocked = circleHits(targetS, targetOffset, PACK_RADIUS, blocks);
  const pathBlocked = segmentHits(state.s, state.offset, targetS, targetOffset, PACK_RADIUS, blocks);
  const orderBlocked = !targetBlocked && (
    crossedAhead(state.s, state.offset, targetS, targetOffset, blocks)
    || crossedAhead(Number(eased?.s) || 0, Number(eased?.offset) || 0, targetS, targetOffset, blocks)
  );
  if (!targetBlocked && (overlapping || pathBlocked || orderBlocked)) {
    state.s = targetS;
    state.offset = targetOffset;
    state.speed = Number(target?.speed) || 0;
    return state;
  }
  state.s = Number(eased?.s) || 0;
  state.offset = Number(eased?.offset) || 0;
  state.speed = Number(eased?.speed) || 0;
  separatePack([...contactsOf(state, state.owner ?? "local", true), ...blocks]);
  return state;
}

// Guest slices run before the ease. Stop that prediction from crossing a
// nearby rider the host still has this can behind, then let the ease pull
// the rest of the way. Same-sign sides stay free so a real pass can finish.
export function settleGuestPrediction(state, target, blockers, owner = "local") {
  const blocks = Array.isArray(blockers) ? blockers : [];
  if (!state || !blocks.length) return state;
  separatePack([...contactsOf(state, owner, true), ...blocks]);
  holdCourseOrder(state, target, blocks);
  separatePack([...contactsOf(state, owner, true), ...blocks]);
  return state;
}

function holdCourseOrder(state, target, blocks) {
  if (!state || !target) return;
  if (state.eject) {
    if (!target.ejected) return;
    clampAhead(state.eject, "bodyS", "bodyOffset", "bodyAlong", Number(target.bodyS) || 0, Number(target.bodyOffset) || 0, blocks);
    clampAhead(state.eject, "canS", "canOffset", "canSpeed", Number(target.canS) || 0, Number(target.canOffset) || 0, blocks);
    state.s = state.eject.bodyS;
    state.offset = state.eject.bodyOffset;
    return;
  }
  clampAhead(state, "s", "offset", "speed", Number(target.s) || 0, Number(target.offset) || 0, blocks);
}

function clampAhead(body, sKey, offsetKey, speedKey, targetS, targetOffset, blocks) {
  const fromS = Number(body[sKey]) || 0;
  const offset = Number(body[offsetKey]) || 0;
  let cap = Infinity;
  let matchSpeed = 0;
  for (const block of blocks) {
    const blockS = Number(block.s) || 0;
    const blockOffset = Number(block.offset) || 0;
    if (!(targetS < blockS && fromS > blockS)) continue;
    const gap = Math.min(Math.abs(offset - blockOffset), Math.abs(targetOffset - blockOffset));
    if (gap > ORDER_LANE) continue;
    const next = blockS - 1e-3;
    if (next < cap) {
      cap = next;
      matchSpeed = Number(block.speed) || 0;
    }
  }
  if (cap === Infinity) return;
  body[sKey] = cap;
  if ((Number(body[speedKey]) || 0) > matchSpeed) body[speedKey] = matchSpeed;
}

// True when `from` is downhill of a nearby rider and the host pose is still
// uphill of that rider. Looking back up the hill is what makes course-relative
// A/D feel reversed on the guest's screen.
function crossedAhead(fromS, fromOffset, targetS, targetOffset, blocks) {
  const from = Number(fromS) || 0;
  const target = Number(targetS) || 0;
  for (const block of blocks) {
    const blockS = Number(block.s) || 0;
    if (!(target < blockS && from > blockS)) continue;
    const blockOffset = Number(block.offset) || 0;
    const gap = Math.min(
      Math.abs((Number(fromOffset) || 0) - blockOffset),
      Math.abs((Number(targetOffset) || 0) - blockOffset),
    );
    if (gap <= ORDER_LANE) return true;
  }
  return false;
}

function circleHits(s, offset, radius, blocks) {
  for (const block of blocks) {
    const reach = radius + radiusOf(block);
    const ds = (Number(block.s) || 0) - (Number(s) || 0);
    const dOffset = (Number(block.offset) || 0) - (Number(offset) || 0);
    if (ds * ds + dOffset * dOffset < reach * reach) return true;
  }
  return false;
}

function segmentHits(s0, offset0, s1, offset1, radius, blocks) {
  const abS = (Number(s1) || 0) - (Number(s0) || 0);
  const abOffset = (Number(offset1) || 0) - (Number(offset0) || 0);
  const len2 = abS * abS + abOffset * abOffset;
  for (const block of blocks) {
    const reach = radius + radiusOf(block);
    let t = 0;
    if (len2 > 1e-8) {
      t = (((Number(block.s) || 0) - (Number(s0) || 0)) * abS
        + ((Number(block.offset) || 0) - (Number(offset0) || 0)) * abOffset) / len2;
      t = Math.max(0, Math.min(1, t));
    }
    const ds = (Number(s0) || 0) + abS * t - (Number(block.s) || 0);
    const dOffset = (Number(offset0) || 0) + abOffset * t - (Number(block.offset) || 0);
    if (ds * ds + dOffset * dOffset < reach * reach) return true;
  }
  return false;
}

// Snapshots can pause while a headset hitches. The socket closing is still
// an immediate leave. This is only the backup when the socket stays open.
export const HOST_SILENCE_MS = 12000;

export function hostWentSilent(sinceMs, nowMs, limitMs = HOST_SILENCE_MS) {
  const since = Number(sinceMs);
  const now = Number(nowMs);
  if (!Number.isFinite(since) || !Number.isFinite(now)) return false;
  return now - since > limitMs;
}

export function takeJump(state, stick) {
  const next = Number(stick?.jumpSeq) || 0;
  const seen = Number(state?.seenJump) || 0;
  const jump = next !== 0 && next !== seen;
  if (next !== 0 && state) state.seenJump = next;
  return jump;
}

export function stickCommand(stick, ageSeconds) {
  if (!stick) return { steer: 0, throttle: 0, strafe: 0, jumpSeq: 0, hold: true };
  const age = Number(ageSeconds) || 0;
  if (age >= 8) return null;
  if (age >= 1.5) return { ...stick, steer: 0, throttle: 0, strafe: 0 };
  return stick;
}

// Seconds until the server's start instant. Zero once that clock has passed.
export function countdownLeft(startsAt, nowMs) {
  const at = Date.parse(String(startsAt || ""));
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, (at - Number(nowMs)) / 1000);
}

// Keep a can on the start line. This only writes s and speed. It does not
// pick a heading, a yaw, or a new frame.
export function holdAtLine(ride, startS) {
  if (!ride) return ride;
  const line = Number(startS) || 0;
  ride.s = line;
  ride.speed = 0;
  const ejected = ride.eject;
  if (ejected) {
    ejected.canS = line;
    ejected.bodyS = line;
    ejected.canSpeed = 0;
    ejected.canLat = 0;
    ejected.bodyAlong = 0;
    ejected.bodyLat = 0;
  }
  return ride;
}

export function lerpPose(from, to, t) {
  if (!from || !to || !!from.ejected !== !!to.ejected) return { ...to };
  const blend = Math.min(1, Math.max(0, Number(t) || 0));
  const mix = (a, b) => (Number(a) || 0) + ((Number(b) || 0) - (Number(a) || 0)) * blend;
  return {
    ...to,
    s: mix(from.s, to.s),
    offset: mix(from.offset, to.offset),
    speed: mix(from.speed, to.speed),
    spin: mix(from.spin, to.spin),
    hop: mix(from.hop, to.hop),
    canS: mix(from.canS, to.canS),
    canOffset: mix(from.canOffset, to.canOffset),
    bodyS: mix(from.bodyS, to.bodyS),
    bodyOffset: mix(from.bodyOffset, to.bodyOffset),
    face: mixAngle(from.face, to.face, blend),
    ejected: !!to.ejected,
  };
}

function mixAngle(from, to, blend) {
  const start = Number(from) || 0;
  const end = Number(to) || 0;
  const turn = Math.atan2(Math.sin(end - start), Math.cos(end - start));
  return start + turn * blend;
}

// The stick/pose relay for one table. Entry, table state, arrival and the
// RIDERS chat come from @rb/arcade/entry over the same handoff; this socket
// only carries the game's own sticks and poses (and the room events Magna
// fans out on it).
export function createPartyClient({ WebSocket: Socket = globalThis.WebSocket } = {}) {
  let handoff = null, client = null, room = null, socket = null;
  let beat = null, generation = 0, seq = 0;
  const relayListeners = new Set();
  const emit = event => { for (const listener of relayListeners) listener(event); };
  function stop() {
    generation++;
    clearInterval(beat); beat = null;
    const previous = socket; socket = null;
    previous?.close();
    handoff = null; client = null; room = null;
  }
  async function connect(next, playClient) {
    stop();
    const current = generation;
    handoff = next; client = playClient; room = next.table;
    function failed(error) {
      if (current !== generation) return;
      console.error("[gcr:party]", error);
      emit({ kind: "transport-error", message: error.message });
    }
    try {
      const ticket = await playClient.request(`/rooms/${encodeURIComponent(next.table.code)}/relay-ticket`, {});
      if (current !== generation) return;
      const relay = new Socket(ticket.url, ["magna-realtime", `magna-ticket.${ticket.ticket}`]);
      socket = relay;
      beat = setInterval(() => {
        if (relay.readyState === 1) relay.send(JSON.stringify({ action: "heartbeat" }));
      }, 60000);
      relay.addEventListener("open", () => relay.send(JSON.stringify({ action: "subscribe" })));
      relay.addEventListener("message", message => {
        if (current !== generation) return;
        let payload;
        try { payload = JSON.parse(String(message.data)); } catch { return; }
        if (payload.type === "event" && payload.event?.kind !== "probe") emit(payload.event);
      });
      relay.addEventListener("close", () => {
        if (current === generation) failed(new Error("The race relay disconnected. Return to the lobby to rejoin."));
      });
      relay.addEventListener("error", () => failed(new Error("The race relay could not connect.")));
      await new Promise((resolve, reject) => {
        if (relay.readyState === 1) return resolve();
        relay.addEventListener("open", resolve, { once: true });
        relay.addEventListener("error", () => reject(new Error("The race relay could not connect.")), { once: true });
        relay.addEventListener("close", () => reject(new Error("The race relay closed.")), { once: true });
      });
    } catch (error) {
      if (current === generation) stop();
      throw error;
    }
  }
  function sendRelay(body) {
    if (!socket || socket.readyState !== 1 || !handoff) return false;
    socket.send(JSON.stringify({ action: "relay", body }));
    return true;
  }
  return {
    connect, stop,
    get room() { return room; },
    get code() { return room?.code || ""; },
    get actor() { return handoff?.identity.actor || ""; },
    get you() { return handoff?.seat || null; },
    noteSlots(slots) { if (room) room = { ...room, slots }; },
    async leave() { if (room) await client.action(room.code, "leave"); },
    sendStick(stick) { return sendRelay({ kind: "stick", seq: ++seq, ...stick }); },
    sendSnapshot(snapshot) { return sendRelay({ kind: "snapshot", seq: ++seq, ...snapshot }); },
    onRelay(listener) { relayListeners.add(listener); return () => relayListeners.delete(listener); },
  };
}
