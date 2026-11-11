// Clips in /audio were generated with Stable Audio 3 Medium.
// The mix stays quiet under the street: a bed, then one-shots on contact.
// Arcade's audio module (`@rb/arcade/audio`) owns the lifecycle: unlock from a
// gesture, master gain, voices, stopping and disposal. The game owns the clips,
// the cue plan and the crossfading loop bed, which sits behind Arcade's
// custom-adapter interface.

import { createAudio, createWebAudioAdapter } from "@rb/arcade/audio";

const CLIPS = {
  soundtrack: "audio/soundtrack.ogg",
  roll: "audio/roll.ogg",
  wind: "audio/wind.ogg",
  traffic: "audio/traffic.ogg",
  chatter: "audio/chatter.ogg",
  siren: "audio/siren.ogg",
  horn: "audio/horn.ogg",
  brakes: "audio/brakes.ogg",
  bump: "audio/bump.ogg",
  crash: "audio/crash.ogg",
  gasp: "audio/gasp.ogg",
  scream: "audio/scream.ogg",
  bail: "audio/bail.ogg",
  mount: "audio/mount.ogg",
  skid: "audio/skid.ogg",
  thud: "audio/thud.ogg",
  whoosh: "audio/whoosh.ogg",
  bark: "audio/bark.ogg",
  moo: "audio/moo.ogg",
};

const LOOPS = ["soundtrack", "roll", "wind", "traffic", "chatter", "siren"];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function riderOf(ride) {
  if (ride.eject) {
    const body = ride.eject;
    return {
      s: body.bodyS,
      offset: body.bodyOffset,
      speed: Math.hypot(body.bodyAlong || 0, body.bodyLat || 0),
      canS: body.canS,
      canOffset: body.canOffset,
      canSpeed: Math.hypot(body.canSpeed || 0, body.canLat || 0),
    };
  }
  return {
    s: ride.s,
    offset: ride.offset || 0,
    speed: Math.abs(ride.speed || 0),
    canS: ride.s,
    canOffset: ride.offset || 0,
    canSpeed: Math.abs(ride.speed || 0),
  };
}

export function freshCueMemory(frame) {
  const ride = frame.ride;
  return {
    seed: frame.seed,
    crashes: ride.crashes || 0,
    bumps: ride.bumps || 0,
    near: ride.nearMisses || 0,
    lat: ride.eject ? 0 : (ride.latVel || 0),
    hornCool: 0,
    brakeCool: 0,
    whooshCool: 0,
    skidCool: 0,
    barkCool: 0,
    mooCool: 0,
    calls: {},
    duck: 0,
    gaps: {},
    wrecks: {},
  };
}

const CALL_REACH = { bark: 16, moo: 26 };

function hashUnit(text) {
  let hash = 2166136261;
  const value = String(text);
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

// The first call waits, so walking into earshot does not bark on that frame.
// Later calls from the same animal are farther apart. The hash keeps tests stable.
function callDelay(id, again) {
  const unit = hashUnit(`${id}:${again ? "again" : "first"}`);
  return again ? 7 + unit * 7 : 1.5 + unit * 4.5;
}

// Pure mix. Mutates memory so the next frame can hear what changed.
export function planCues(memory, frame) {
  const dt = Math.max(0, frame.dt || 0);
  if (!memory || memory.seed !== frame.seed) memory = freshCueMemory(frame);
  memory.hornCool = Math.max(0, memory.hornCool - dt);
  memory.brakeCool = Math.max(0, memory.brakeCool - dt);
  memory.whooshCool = Math.max(0, memory.whooshCool - dt);
  memory.skidCool = Math.max(0, memory.skidCool - dt);
  memory.barkCool = Math.max(0, (memory.barkCool || 0) - dt);
  memory.mooCool = Math.max(0, (memory.mooCool || 0) - dt);
  memory.duck = Math.max(0, memory.duck - dt);
  if (!memory.calls) memory.calls = {};

  const ride = frame.ride;
  const rider = riderOf(ride);
  const ones = [];

  let crashLeft = (ride.crashes || 0) - memory.crashes;
  memory.crashes = ride.crashes || 0;
  const bumpDelta = (ride.bumps || 0) - memory.bumps;
  memory.bumps = ride.bumps || 0;
  const nearDelta = (ride.nearMisses || 0) - memory.near;
  memory.near = ride.nearMisses || 0;

  for (const event of ride.events || []) {
    if (event.type === "eject") {
      ones.push({ name: "crash", gain: 0.85 });
      ones.push({ name: "scream", gain: 0.7 });
      memory.duck = Math.max(memory.duck, 1.8);
      crashLeft -= 1;
    } else if (event.type === "bail") {
      ones.push({ name: "bail", gain: 0.55 });
      ones.push({ name: "gasp", gain: 0.28 });
    } else if (event.type === "mount") {
      ones.push({ name: "mount", gain: 0.6 });
    } else if (event.type === "fell") {
      if (event.who === "animal") {
        ones.push({ name: "thud", gain: 0.5 });
      } else if ((event.force || 0) >= 0.6) {
        ones.push({ name: "scream", gain: 0.62 });
        ones.push({ name: "thud", gain: 0.35 });
        memory.duck = Math.max(memory.duck, 1.2);
      } else {
        ones.push({ name: "gasp", gain: 0.5 });
        ones.push({ name: "thud", gain: 0.28 });
      }
      crashLeft -= 1;
    }
  }
  if (crashLeft > 0) {
    ones.push({ name: "crash", gain: 0.62 });
    memory.duck = Math.max(memory.duck, 1.2);
  }
  if (bumpDelta > 0) ones.push({ name: "bump", gain: 0.6 });
  if (nearDelta > 0 && memory.whooshCool <= 0) {
    ones.push({ name: "whoosh", gain: 0.4 });
    memory.whooshCool = 0.45;
  }

  const lat = ride.eject ? 0 : (ride.latVel || 0);
  const latJump = lat - memory.lat;
  memory.lat = lat;
  if (!ride.eject && memory.skidCool <= 0 && Math.abs(latJump) > 2.4 && Math.abs(lat) > 2.2 && crashLeft <= 0) {
    ones.push({ name: "skid", gain: 0.5 });
    memory.skidCool = 0.7;
  }

  if (!ride.eject && (frame.throttle || 0) < -0.2 && rider.speed > 6 && memory.brakeCool <= 0) {
    ones.push({ name: "brakes", gain: 0.5 });
    memory.brakeCool = 1.5;
  }

  let chatter = 0;
  let traffic = 0;
  let siren = 0;
  const seen = new Set();
  const nearCalls = new Set();
  const voices = [];
  for (const hazard of frame.hazards || []) {
    if (!hazard || hazard.s == null) continue;
    const distance = Math.hypot(hazard.s - rider.s, (hazard.offset || 0) - rider.offset);
    if (hazard.kind === "person" && distance < 28) {
      chatter = Math.max(chatter, (1 - distance / 28) * 0.28);
    }
    const call = hazard.call === "bark" || hazard.call === "moo" ? hazard.call : "";
    if (call && hazard.id && distance < CALL_REACH[call]) {
      nearCalls.add(hazard.id);
      const wait = memory.calls[hazard.id];
      if (wait == null) {
        memory.calls[hazard.id] = callDelay(hazard.id, false);
      } else {
        const left = wait - dt;
        memory.calls[hazard.id] = left;
        if (left <= 0) voices.push({ id: hazard.id, name: call, distance });
      }
    }
    if (hazard.kind !== "car") continue;
    const speed = Math.abs(hazard.speed || 0);
    if (speed > 1.5 && distance < 46) {
      traffic = Math.min(0.34, traffic + (1 - distance / 46) * 0.12);
    }
    if (hazard.style === "cop" && !hazard.wreck && speed > 2 && distance < 80) {
      siren = Math.max(siren, (1 - distance / 80) ** 1.35 * 0.55);
    }
    if (!hazard.id) continue;
    seen.add(hazard.id);
    const previous = memory.gaps[hazard.id];
    memory.gaps[hazard.id] = distance;
    if (
      previous != null
      && previous > 18
      && distance < 11
      && speed > 5
      && hazard.style !== "cop"
      && memory.hornCool <= 0
    ) {
      ones.push({ name: "horn", gain: 0.42 * (1 - distance / 18) });
      memory.hornCool = 6.5;
    }
    if (hazard.wreck && !memory.wrecks[hazard.id]) {
      memory.wrecks[hazard.id] = 1;
      ones.push({ name: "crash", gain: 0.28 * (1 - Math.min(distance, 40) / 40) });
    } else if (!hazard.wreck) {
      delete memory.wrecks[hazard.id];
    }
  }
  if (Object.keys(memory.gaps).length > 80) {
    for (const id of Object.keys(memory.gaps)) {
      if (!seen.has(id)) delete memory.gaps[id];
    }
  }
  for (const id of Object.keys(memory.calls)) {
    if (!nearCalls.has(id)) delete memory.calls[id];
  }
  for (const name of ["bark", "moo"]) {
    const coolKey = name === "bark" ? "barkCool" : "mooCool";
    if (memory[coolKey] > 0) continue;
    let best = null;
    for (const voice of voices) {
      if (voice.name !== name) continue;
      if (!best || voice.distance < best.distance) best = voice;
    }
    if (!best) continue;
    const closeness = 1 - best.distance / CALL_REACH[name];
    const base = name === "bark" ? 0.44 : 0.5;
    ones.push({ name, gain: base * (0.62 + 0.38 * closeness) });
    memory.calls[best.id] = callDelay(best.id, true);
    memory[coolKey] = 2.8;
  }

  const canDistance = Math.hypot(rider.canS - rider.s, rider.canOffset - rider.offset);
  const rolling = rider.canSpeed < 0.4 ? 0 : clamp((rider.canSpeed - 0.4) / 13, 0, 1);
  const loops = {
    soundtrack: memory.duck > 0 ? 0.045 : 0.12,
    roll: rolling * (1 - clamp(canDistance / 22, 0, 1)) * 0.5,
    wind: clamp(rider.speed / 16, 0, 1) * 0.22,
    traffic,
    chatter,
    siren,
  };
  return { memory, loops, ones: loudest(ones) };
}

function loudest(ones) {
  const best = new Map();
  for (const one of ones) {
    const previous = best.get(one.name);
    if (!previous || one.gain > previous.gain) best.set(one.name, one);
  }
  return [...best.values()];
}

// A loop that crossfades into its own next pass, so a clip without a seamless
// tail still loops without a click. Its level follows setGain with a short
// glide, as the bed always has.
function LoopBed(ctx, buffer, output, gain) {
  this.ctx = ctx;
  this.buffer = buffer;
  this.gain = ctx.createGain();
  this.gain.gain.value = 0;
  this.gain.connect(output);
  this.level = gain;
  this.fade = Math.min(1.5, Math.max(0.25, buffer.duration * 0.12));
  this.timer = 0;
  this.live = [];
  this.armed = false;
}

LoopBed.prototype.start = function start() {
  if (this.armed) return;
  this.armed = true;
  this.setGain(this.level);
  this.spawn(this.ctx.currentTime + 0.02);
};

LoopBed.prototype.setGain = function setGain(level) {
  this.level = level;
  this.gain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.08);
};

LoopBed.prototype.spawn = function spawn(when) {
  const source = this.ctx.createBufferSource();
  source.buffer = this.buffer;
  const fade = this.ctx.createGain();
  source.connect(fade);
  fade.connect(this.gain);
  const duration = this.buffer.duration;
  const fadeTime = Math.min(this.fade, duration * 0.45);
  fade.gain.setValueAtTime(0, when);
  fade.gain.linearRampToValueAtTime(1, when + fadeTime);
  fade.gain.setValueAtTime(1, Math.max(when + fadeTime, when + duration - fadeTime));
  fade.gain.linearRampToValueAtTime(0, when + duration);
  source.start(when);
  source.stop(when + duration + 0.05);
  this.live.push(source);
  source.onended = () => {
    const index = this.live.indexOf(source);
    if (index >= 0) this.live.splice(index, 1);
    source.disconnect();
    fade.disconnect();
  };
  const nextAt = when + duration - fadeTime;
  const wait = Math.max(0, (nextAt - this.ctx.currentTime) * 1000 - 40);
  clearTimeout(this.timer);
  this.timer = setTimeout(() => {
    if (!this.armed) return;
    this.spawn(Math.max(this.ctx.currentTime + 0.01, nextAt));
  }, wait);
};

LoopBed.prototype.stop = function stop() {
  this.armed = false;
  clearTimeout(this.timer);
  this.timer = 0;
  for (const source of this.live.splice(0)) {
    source.onended = null;
    source.stop();
    source.disconnect();
  }
};

LoopBed.prototype.dispose = function dispose() {
  this.gain.disconnect();
};

// Arcade adapter: one-shots through Arcade's Web Audio adapter, loops as beds.
// A bed never ends on its own, so onEnded is never called for a loop.
export function createRideAudioAdapter({ context, getBuffer }) {
  const shots = createWebAudioAdapter({ context, getBuffer });
  return {
    unlock: () => shots.unlock(),
    createVoice(sound, options) {
      if (!options.loop) return shots.createVoice(sound, options);
      const buffer = getBuffer(sound);
      if (!buffer) throw new Error(`[gcr:audio] missing buffer ${String(sound)}`);
      const bed = new LoopBed(context, buffer, context.destination, options.gain);
      return {
        start() {
          if (context.state !== "running") throw new Error("[gcr:audio] context is not running");
          bed.start();
        },
        setGain: (value) => bed.setGain(value),
        stop: () => bed.stop(),
        dispose: () => bed.dispose(),
      };
    },
    dispose: () => shots.dispose(),
  };
}

export function createSound() {
  const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
  const status = {
    loaded: 0,
    missing: [],
    unlocked: false,
    state: "unsupported",
    gestures: 0,
    resumeError: "",
    last: { loops: {}, ones: [] },
  };
  if (!AudioCtx) {
    return {
      update() {},
      attach() {},
      setMaster() {},
      status: () => status,
    };
  }

  const ctx = new AudioCtx();
  const buffers = {};
  const audio = createAudio(
    createRideAudioAdapter({ context: ctx, getBuffer: (name) => buffers[name] }),
    { gain: 0.9 },
  );
  const loops = {};
  let memory = null;
  let loading = null;
  status.state = ctx.state;

  function failed(what, error) {
    const message = String(error && error.message ? error.message : error);
    console.warn(`[gcr:audio] ${what}: ${message}`);
    return message;
  }

  // Called straight from the gesture, before anything awaits.
  function unlock() {
    status.gestures += 1;
    audio.unlock().then(() => {
      status.resumeError = "";
    }).catch((error) => {
      status.resumeError = failed("unlock", error);
    }).finally(() => {
      status.state = ctx.state;
      status.unlocked = ctx.state === "running";
    });
    status.state = ctx.state;
    ensureLoaded();
  }

  function ensureLoaded() {
    if (loading) return loading;
    loading = Promise.all(Object.entries(CLIPS).map(async ([name, url]) => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(String(response.status));
        const decoded = await ctx.decodeAudioData(await response.arrayBuffer());
        buffers[name] = decoded;
        status.loaded += 1;
      } catch {
        status.missing.push(name);
      }
    })).then(() => {
      status.state = ctx.state;
    });
    return loading;
  }

  // A loop starts the first time its level is heard, then only changes level.
  function setLoop(name, level) {
    const loop = loops[name];
    if (loop?.voice) {
      loop.voice.setGain(level);
      return;
    }
    if (loop || level <= 0.004 || !buffers[name]) return;
    const pending = { voice: null };
    loops[name] = pending;
    audio.play(name, { loop: true, gain: level }).then((voice) => {
      pending.voice = voice;
    }).catch((error) => {
      if (loops[name] === pending) delete loops[name];
      failed(`loop ${name}`, error);
    });
  }

  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  ensureLoaded();

  return {
    attach(renderer) {
      renderer?.xr?.addEventListener?.("sessionstart", unlock);
    },
    setMaster(level) {
      const next = Number(level);
      if (!Number.isFinite(next)) return;
      audio.setGain(Math.min(1, Math.max(0, next)));
    },
    update(frame) {
      status.state = ctx.state;
      status.unlocked = ctx.state === "running";
      if (ctx.state !== "running" || status.loaded === 0) return;
      const plan = planCues(memory, frame);
      memory = plan.memory;
      status.last = {
        loops: plan.loops,
        ones: plan.ones.map((one) => one.name),
      };
      for (const name of LOOPS) setLoop(name, plan.loops[name] || 0);
      for (const one of plan.ones) {
        if (!buffers[one.name] || one.gain <= 0.02) continue;
        audio.play(one.name, { gain: Math.min(1, one.gain) }).catch((error) => failed(`cue ${one.name}`, error));
      }
    },
    status: () => status,
  };
}
