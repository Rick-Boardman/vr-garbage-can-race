// Extreme crashes throw cartoon trash off the can. The bits move in the
// course frame: s along the hill, offset across it, hop up the road normal.
// They do not steer the can and they are not a second yaw.

import { applyFrame } from "./frame.js";
import { sampleCourse } from "./course.js";

export const EXTREME_STORE = "gcr.extreme.v1";

const GRAVITY = 9.81;
const POOL = 28;
const BURST = 8;

const KINDS = [
  { color: 0xf4f0e6, sx: 0.16, sy: 0.02, sz: 0.12 },
  { color: 0xd7a441, sx: 0.1, sy: 0.04, sz: 0.14 },
  { color: 0x9aa0a6, sx: 0.08, sy: 0.08, sz: 0.08 },
  { color: 0xc45a3a, sx: 0.09, sy: 0.09, sz: 0.09 },
];

export function readExtreme() {
  try {
    return localStorage.getItem(EXTREME_STORE) === "1";
  } catch {
    return false;
  }
}

export function writeExtreme(on) {
  try {
    localStorage.setItem(EXTREME_STORE, on ? "1" : "0");
  } catch {
    // A private window can refuse the write. The checkbox still toggles.
  }
}

// side > 0 throws toward sample.right. index picks a spread, not a random yaw.
export function scrapLaunch(index, side) {
  const n = Math.abs(index | 0);
  const sign = side >= 0 ? 1 : -1;
  const along = n % 2 === 0 ? 1 : -0.45;
  return {
    vs: along * (3.2 + (n % 5) * 0.7),
    vo: sign * (2.4 + (n % 3) * 1.15),
    vy: 4.4 + (n % 4) * 0.85,
    hop: 0.55,
    life: 1.2 + (n % 4) * 0.1,
    spin: 0,
    turn: 3.2 + (n % 3) * 1.4,
  };
}

export function stepScrap(bit, dt) {
  const step = Math.min(Math.max(Number(dt) || 0, 0), 0.05);
  bit.life -= step;
  if (bit.life <= 0) {
    bit.life = 0;
    return false;
  }
  bit.vy -= GRAVITY * step;
  bit.s += bit.vs * step;
  bit.offset += bit.vo * step;
  bit.hop += bit.vy * step;
  bit.spin += bit.turn * step;
  if (bit.hop < 0) {
    bit.hop = 0;
    bit.vy = Math.abs(bit.vy) > 1.2 ? -bit.vy * 0.35 : 0;
    bit.vs *= 0.62;
    bit.vo *= 0.62;
  }
  return true;
}

function ownedLambert(THREE, color) {
  const material = new THREE.MeshLambertMaterial({ color });
  material.userData.owned = true;
  return material;
}

export function createExtremeScraps(THREE) {
  const group = new THREE.Group();
  group.name = "extreme-scraps";
  const bits = [];
  for (let i = 0; i < POOL; i += 1) {
    const kind = KINDS[i % KINDS.length];
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(kind.sx, kind.sy, kind.sz),
      ownedLambert(THREE, kind.color),
    );
    mesh.name = "extreme-scrap";
    mesh.visible = false;
    mesh.frustumCulled = false;
    group.add(mesh);
    bits.push({
      mesh,
      life: 0,
      s: 0,
      offset: 0,
      hop: 0,
      vs: 0,
      vo: 0,
      vy: 0,
      spin: 0,
      turn: 0,
    });
  }
  let cursor = 0;

  function burst(sample, offset, side) {
    if (!sample) return;
    for (let i = 0; i < BURST; i += 1) {
      const bit = bits[cursor];
      cursor = (cursor + 1) % bits.length;
      const launch = scrapLaunch(cursor + i, side);
      bit.s = sample.s;
      bit.offset = (Number(offset) || 0) + launch.vo * 0.02;
      bit.hop = launch.hop;
      bit.vs = launch.vs;
      bit.vo = launch.vo;
      bit.vy = launch.vy;
      bit.life = launch.life;
      bit.spin = launch.spin;
      bit.turn = launch.turn;
      bit.mesh.visible = true;
    }
  }

  function step(dt, course) {
    if (!course) return;
    for (const bit of bits) {
      if (bit.life <= 0) {
        bit.mesh.visible = false;
        continue;
      }
      if (!stepScrap(bit, dt)) {
        bit.mesh.visible = false;
        continue;
      }
      const at = sampleCourse(course, bit.s);
      bit.mesh.position.set(
        at.x + at.right.x * bit.offset,
        at.y + bit.hop,
        at.z + at.right.z * bit.offset,
      );
      applyFrame(bit.mesh, at, 0);
      bit.mesh.rotateX(bit.spin);
    }
  }

  function clear() {
    for (const bit of bits) {
      bit.life = 0;
      bit.mesh.visible = false;
    }
  }

  function alive() {
    return bits.filter((bit) => bit.life > 0);
  }

  function dispose() {
    clear();
    group.traverse((obj) => {
      if (obj.geometry && !obj.geometry.userData.shared) obj.geometry.dispose();
      if (obj.material?.userData?.owned) obj.material.dispose();
    });
  }

  return { group, burst, step, clear, alive, dispose };
}
