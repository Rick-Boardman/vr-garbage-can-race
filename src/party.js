// A party on one hill. The browser never names a topic. Sticks go up,
// poses come down, and solo play does not open either channel.

import { cleanName, nameBlock } from "./looks.js";

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

export function playBase(search = "") {
  const text = String(search || "");
  const params = new URLSearchParams(text.startsWith("?") ? text.slice(1) : text);
  const raw = params.get("play");
  if (raw == null || raw === "") return "";
  return String(raw).replace(/\/$/, "");
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
  };
}

export function easePose(local, remote, step) {
  const ds = (Number(remote?.s) || 0) - (Number(local?.s) || 0);
  const dOffset = (Number(remote?.offset) || 0) - (Number(local?.offset) || 0);
  const snap = Math.abs(ds) + Math.abs(dOffset) > 12;
  const blend = snap ? 1 : Math.min(1, Math.max(0, Number(step) || 0) * 4);
  const mix = (from, to) => (Number(from) || 0) + ((Number(to) || 0) - (Number(from) || 0)) * blend;
  if (snap) {
    return { s: Number(remote?.s) || 0, offset: Number(remote?.offset) || 0, speed: Number(remote?.speed) || 0 };
  }
  return {
    s: mix(local?.s, remote?.s),
    offset: mix(local?.offset, remote?.offset),
    speed: mix(local?.speed, remote?.speed),
  };
}

// Push overlapping riders apart along the course (s, offset). This is not
// a camera frame: no lookAt, no yaw, no sin/cos.
export function separatePack(riders) {
  const list = riders || [];
  for (let pass = 0; pass < 4; pass += 1) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const ds = (Number(list[j].s) || 0) - (Number(list[i].s) || 0);
        const dOffset = (Number(list[j].offset) || 0) - (Number(list[i].offset) || 0);
        const dist = Math.hypot(ds, dOffset);
        if (dist >= REACH) continue;
        const gap = (REACH - dist) / 2;
        const alongS = dist < 1e-6 ? 1 : ds / dist;
        const alongOffset = dist < 1e-6 ? 0 : dOffset / dist;
        list[i].s = (Number(list[i].s) || 0) - alongS * gap;
        list[i].offset = (Number(list[i].offset) || 0) - alongOffset * gap;
        list[j].s = (Number(list[j].s) || 0) + alongS * gap;
        list[j].offset = (Number(list[j].offset) || 0) + alongOffset * gap;
        const left = Number(list[i].speed) || 0;
        const right = Number(list[j].speed) || 0;
        list[i].speed = left + (right - left) * 0.15;
        list[j].speed = right + (left - right) * 0.15;
      }
    }
  }
  return list;
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
    ejected: !!to.ejected,
  };
}

export function createPartyClient({
  fetch: fetchImpl = globalThis.fetch,
  WebSocket: Socket = globalThis.WebSocket,
  base = "",
  site = "",
  game = GAME,
} = {}) {
  let guest = null;
  let actor = "";
  let room = null;
  let you = null;
  let slots = [];
  let people = [];
  let games = [];
  let maxPlayers = 6;
  let lobbyName = "";
  let stopped = false;
  let seq = 0;
  const sockets = [];
  let lobbySocket = null;
  let presenceBeat = null;
  const relayListeners = new Set();
  const chatListeners = new Set();
  const lobbyListeners = new Set();
  const lobbyChatListeners = new Set();
  let chatMessages = [];
  let chatStatus = "offline";
  let lobbyMessages = [];
  let lobbyStatus = "offline";

  async function request(path, { method = "GET", body } = {}) {
    const headers = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (site) headers["x-magna-site"] = site;
    const response = await fetchImpl(`${base}${path}`, {
      method,
      credentials: "include",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { message: text };
      }
    }
    if (!response.ok) {
      const friendly = payload.code ? payload.message : "";
      const error = new Error(String(friendly || `Could not reach the room (${response.status}).`).slice(0, 180));
      error.status = response.status;
      error.code = payload.code || "";
      throw error;
    }
    return payload;
  }

  function emitChat() {
    const view = { messages: chatMessages, status: chatStatus, watching: slots.length, hasMore: false };
    for (const listener of chatListeners) listener(view);
  }

  function rememberMessage(message) {
    if (!message?.id || chatMessages.some((row) => row.id === message.id)) return;
    chatMessages = [...chatMessages, message].slice(-200);
    emitChat();
  }

  function openSocket(ticket, onEvent, { relay = false, lobby = false } = {}) {
    const socket = new Socket(ticket.url, ["magna-realtime", `magna-ticket.${ticket.ticket}`]);
    if (relay) socket.__relay = true;
    const beat = setInterval(() => {
      if (socket.readyState === 1) socket.send(JSON.stringify({ action: "heartbeat" }));
    }, 60000);
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ action: "subscribe" }));
    });
    socket.addEventListener("message", (message) => {
      if (stopped && !lobby) return;
      let payload;
      try {
        payload = JSON.parse(String(message.data));
      } catch {
        return;
      }
      if (payload?.type === "event" && payload.event && payload.event.kind !== "probe") onEvent(payload.event);
    });
    socket.addEventListener("close", () => clearInterval(beat));
    if (lobby) lobbySocket = socket;
    else sockets.push(socket);
    return socket;
  }

  function dropSockets() {
    for (const socket of sockets) {
      try {
        socket.close();
      } catch {
        // Already closed.
      }
    }
    sockets.length = 0;
  }

  function dropLobbySocket() {
    if (!lobbySocket) return;
    try {
      lobbySocket.close();
    } catch {
      // Already closed.
    }
    lobbySocket = null;
  }

  async function connect() {
    const code = room.code;
    const [history, chat, relay] = await Promise.all([
      request(`/api/play/rooms/${encodeURIComponent(code)}/messages`),
      request(`/api/play/rooms/${encodeURIComponent(code)}/chat-ticket`, { method: "POST", body: {} }),
      request(`/api/play/rooms/${encodeURIComponent(code)}/relay-ticket`, { method: "POST", body: {} }),
    ]);
    chatMessages = [...(history.messages || [])].reverse();
    chatStatus = "connecting";
    emitChat();
    openSocket(chat, (event) => {
      if (event.kind === "message" && event.message) {
        rememberMessage(event.message);
        return;
      }
      for (const listener of relayListeners) listener(event);
    }).addEventListener("open", () => {
      chatStatus = "live";
      emitChat();
    });
    openSocket(relay, (event) => {
      for (const listener of relayListeners) listener(event);
    }, { relay: true });
  }

  async function ensureGuest() {
    guest = await request("/api/play/guest", { method: "POST", body: {} });
    actor = guest?.actor || actor;
    return guest;
  }

  function emitLobby() {
    const event = { kind: "lobby", people, games };
    for (const listener of lobbyListeners) listener(event);
  }

  function emitLobbyChat() {
    const view = { messages: lobbyMessages, status: lobbyStatus, watching: people.length, hasMore: false };
    for (const listener of lobbyChatListeners) listener(view);
  }

  function rememberLobby(message) {
    if (!message?.id || lobbyMessages.some((row) => row.id === message.id)) return;
    lobbyMessages = [...lobbyMessages, message].slice(-200);
    emitLobbyChat();
  }

  function onLobbyEvent(event) {
    if (!event || event.kind === "probe") return;
    if (event.kind === "message" && event.message) {
      rememberLobby(event.message);
      return;
    }
    if (event.kind === "lobby") {
      if (Array.isArray(event.people)) people = event.people;
      if (Array.isArray(event.games)) games = event.games;
    }
    for (const listener of lobbyListeners) listener(event);
  }

  function startPresence() {
    if (presenceBeat) clearInterval(presenceBeat);
    presenceBeat = setInterval(() => {
      request("/api/play/lobby", { method: "POST", body: { game, ...named(lobbyName) } })
        .then((view) => {
          people = view.people || people;
          games = view.games || games;
          if (view.maxPlayers) maxPlayers = Number(view.maxPlayers) || maxPlayers;
          emitLobby();
        })
        .catch(() => {});
    }, 15000);
  }

  async function openLobby() {
    dropLobbySocket();
    const [history, ticket] = await Promise.all([
      request(`/api/play/lobby/messages?game=${encodeURIComponent(game)}`),
      request("/api/play/lobby/chat-ticket", { method: "POST", body: { game } }),
    ]);
    lobbyMessages = [...(history.messages || [])].reverse();
    lobbyStatus = "connecting";
    emitLobbyChat();
    openSocket(ticket, onLobbyEvent, { lobby: true }).addEventListener("open", () => {
      lobbyStatus = "live";
      emitLobbyChat();
    });
  }

  function named(name) {
    return { displayName: cleanName(name) };
  }

  function nameRoster() {
    return [...people, ...slots];
  }

  async function publishName(name) {
    lobbyName = cleanName(name ?? lobbyName);
    await ensureGuest();
    const view = await request("/api/play/lobby", { method: "POST", body: { game, ...named(lobbyName) } });
    people = view.people || [];
    games = view.games || [];
    if (view.maxPlayers) maxPlayers = Number(view.maxPlayers) || maxPlayers;
    emitLobby();
    return view;
  }

  function adopt(next) {
    room = next?.room || room;
    you = next?.you || you;
    if (room?.slots) slots = room.slots;
  }

  return {
    ensureGuest,
    get room() {
      return room;
    },
    get you() {
      return you;
    },
    get code() {
      return room?.code || "";
    },
    get actor() {
      return actor;
    },
    get people() {
      return people;
    },
    get games() {
      return games;
    },
    get maxPlayers() {
      return maxPlayers;
    },
    setName(name) {
      lobbyName = cleanName(name);
    },
    publishName,
    noteSlots(next) {
      if (Array.isArray(next)) slots = next;
    },
    async enterLobby({ name } = {}) {
      lobbyName = cleanName(name ?? lobbyName);
      await ensureGuest();
      const view = await request("/api/play/lobby", { method: "POST", body: { game, ...named(lobbyName) } });
      people = view.people || [];
      games = view.games || [];
      if (view.maxPlayers) maxPlayers = Number(view.maxPlayers) || maxPlayers;
      await openLobby();
      startPresence();
      emitLobby();
      return view;
    },
    leaveLobby() {
      if (presenceBeat) clearInterval(presenceBeat);
      presenceBeat = null;
      dropLobbySocket();
      lobbyStatus = "offline";
      return request("/api/play/lobby/leave", { method: "POST", body: { game } }).catch(() => null);
    },
    leaveLobbyKeepalive() {
      if (!fetchImpl) return;
      const headers = { "content-type": "application/json" };
      if (site) headers["x-magna-site"] = site;
      try {
        fetchImpl(`${base}/api/play/lobby/leave`, {
          method: "POST",
          credentials: "include",
          keepalive: true,
          headers,
          body: JSON.stringify({ game }),
        });
      } catch {
        // The page is leaving.
      }
    },
    async host({ seed, name, slots } = {}) {
      stopped = false;
      await ensureGuest();
      const body = { game, ...named(name), seed };
      if (slots != null) body.slots = Number(slots);
      const next = await request("/api/play/rooms", { method: "POST", body });
      dropSockets();
      adopt(next);
      await connect();
      return { room, you };
    },
    async join({ code, name } = {}) {
      stopped = false;
      await ensureGuest();
      const normalized = String(code || "").trim().toUpperCase();
      const next = await request(`/api/play/rooms/${encodeURIComponent(normalized)}/join`, {
        method: "POST",
        body: named(name),
      });
      dropSockets();
      adopt(next);
      await connect();
      return { room, you };
    },
    seal() {
      return request(`/api/play/rooms/${encodeURIComponent(room.code)}/seal`, { method: "POST", body: {} });
    },
    invite(actorId) {
      return request(`/api/play/rooms/${encodeURIComponent(room.code)}/invite`, {
        method: "POST",
        body: { actor: actorId },
      });
    },
    leave() {
      if (!room?.code) return Promise.resolve(null);
      return request(`/api/play/rooms/${encodeURIComponent(room.code)}/leave`, { method: "POST", body: {} });
    },
    leaveKeepalive() {
      if (!room?.code || !fetchImpl) return;
      const headers = { "content-type": "application/json" };
      if (site) headers["x-magna-site"] = site;
      try {
        fetchImpl(`${base}/api/play/rooms/${encodeURIComponent(room.code)}/leave`, {
          method: "POST",
          credentials: "include",
          keepalive: true,
          headers,
          body: "{}",
        });
      } catch {
        // The page is leaving.
      }
    },
    close() {
      if (!room?.code) return Promise.resolve(null);
      return request(`/api/play/rooms/${encodeURIComponent(room.code)}/close`, { method: "POST", body: {} });
    },
    closeKeepalive() {
      if (!room?.code || !fetchImpl) return;
      const headers = { "content-type": "application/json" };
      if (site) headers["x-magna-site"] = site;
      try {
        fetchImpl(`${base}/api/play/rooms/${encodeURIComponent(room.code)}/close`, {
          method: "POST",
          credentials: "include",
          keepalive: true,
          headers,
          body: "{}",
        });
      } catch {
        // The page is leaving.
      }
    },
    sendStick(stick) {
      return sendRelay({ kind: "stick", seq: ++seq, ...stick });
    },
    sendSnapshot(snapshot) {
      return sendRelay({ kind: "snapshot", seq: ++seq, ...snapshot });
    },
    onRelay(listener) {
      relayListeners.add(listener);
      return () => relayListeners.delete(listener);
    },
    chatTransport() {
      return {
        subscribe(listener) {
          chatListeners.add(listener);
          listener({ messages: chatMessages, status: chatStatus, watching: slots.length, hasMore: false });
          return () => chatListeners.delete(listener);
        },
        async send(text) {
          if (nameBlock(lobbyName, nameRoster(), actor)) return false;
          const saved = await request(`/api/play/rooms/${encodeURIComponent(room.code)}/messages`, {
            method: "POST",
            body: { body: text },
          });
          if (saved.message) rememberMessage(saved.message);
          return saved;
        },
        nameFor(userId) {
          const slot = slots.find((row) => row.actor === userId);
          return slot?.displayName || "";
        },
      };
    },
    lobbyTransport() {
      return {
        subscribe(listener) {
          lobbyChatListeners.add(listener);
          listener({ messages: lobbyMessages, status: lobbyStatus, watching: people.length, hasMore: false });
          return () => lobbyChatListeners.delete(listener);
        },
        async send(text) {
          if (nameBlock(lobbyName, nameRoster(), actor)) return false;
          await publishName(lobbyName);
          if (nameBlock(lobbyName, nameRoster(), actor)) return false;
          const saved = await request("/api/play/lobby/messages", {
            method: "POST",
            body: { game, body: text },
          });
          if (saved.message) rememberLobby(saved.message);
          return saved;
        },
        nameFor(userId) {
          const person = people.find((row) => row.actor === userId);
          return person?.displayName || "";
        },
      };
    },
    onLobby(listener) {
      lobbyListeners.add(listener);
      return () => lobbyListeners.delete(listener);
    },
    stop() {
      stopped = true;
      room = null;
      you = null;
      slots = [];
      chatMessages = [];
      chatStatus = "offline";
      dropSockets();
      emitChat();
    },
  };

  function sendRelay(body) {
    const target = sockets.find((candidate) => candidate.__relay && candidate.readyState === 1);
    if (!target || stopped) return false;
    target.send(JSON.stringify({ action: "relay", body }));
    return true;
  }
}
