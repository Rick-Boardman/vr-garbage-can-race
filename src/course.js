// Downhill path in the Three.js y-up, right-handed frame.
// Travel at heading 0 is world -z. Right is (-forward.z, 0, forward.x) on the
// ground plane, which is +x when forward is -z. Grade lowers y as s grows.

import {
  DISTRICT_LENGTH,
  SAMPLE_STEP,
  START_Y,
} from "./constants.js";

const THEMES = ["downtown", "neighborhood", "market", "country", "ocean", "forest"];
const TIMES = ["dawn", "day", "dusk", "night"];
const NAMES = {
  downtown: ["Brickworks", "Glasshouse Row", "Station Hill", "Lantern Avenue"],
  neighborhood: ["Elm Court", "Cedar Hill", "Maple Bend", "Orchard Lane"],
  market: ["Market Street", "Taxi Bend", "Cafe Corner", "Bus Stop Hill"],
  country: ["Pasture Hill", "Fence Line", "Dairy Bend", "Sheep Ridge"],
  ocean: ["Tide Road", "Boardwalk", "Cove Hill", "Pier Street"],
  forest: ["Pine Hollow", "Switchback Woods", "Cedar Cut", "Fern Hill"],
};

function halfWidthFor(theme) {
  if (theme === "neighborhood") return 6.1;
  if (theme === "market") return 7.1;
  if (theme === "country") return 5.6;
  if (theme === "ocean") return 6.4;
  if (theme === "forest") return 5.4;
  return 7.8;
}

export function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function headingYaw(tx, tz) {
  // Local -z faces (tx, tz). yaw 0 looks down -z; yaw -pi/2 looks down +x.
  return Math.atan2(-tx, -tz);
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function makeDistrict(rand, index) {
  const theme = THEMES[Math.floor(rand() * THEMES.length)];
  let time = TIMES[Math.floor(rand() * TIMES.length)];
  if (index === 0 && time !== "day" && time !== "dawn") time = "day";
  return {
    theme,
    time,
    grade: 0.055 + rand() * 0.12,
    curveAmp: 0.004 + rand() * 0.009,
    curveFreq: 0.007 + rand() * 0.012,
    phase: rand() * Math.PI * 2,
    halfWidth: halfWidthFor(theme),
    waterSide: rand() > 0.5 ? 1 : -1,
    name: NAMES[theme][Math.floor(rand() * NAMES[theme].length)],
  };
}

export function createCourse(seed) {
  const numeric = Number.isFinite(seed) ? seed >>> 0 : 1;
  const rand = mulberry32(numeric || 1);
  const districts = [];
  for (let index = 0; index < 80; index += 1) districts.push(makeDistrict(rand, index));
  return {
    seed: numeric || 1,
    districts,
    samples: [],
  };
}

export function districtIndex(s) {
  return Math.max(0, Math.floor(s / DISTRICT_LENGTH));
}

export function districtAt(course, s) {
  const index = districtIndex(Math.max(0, s));
  return course.districts[Math.min(index, course.districts.length - 1)];
}

function blendDistricts(course, s) {
  const index = districtIndex(Math.max(0, s));
  const current = course.districts[Math.min(index, course.districts.length - 1)];
  const next = course.districts[Math.min(index + 1, course.districts.length - 1)];
  const local = Math.max(0, s) - index * DISTRICT_LENGTH;
  const edge = 20;
  if (local <= DISTRICT_LENGTH - edge) return { current, next, t: 0 };
  return { current, next, t: smoothstep((local - (DISTRICT_LENGTH - edge)) / edge) };
}

export function gradeAt(course, s) {
  const { current, next, t } = blendDistricts(course, s);
  const base = current.grade + (next.grade - current.grade) * t;
  const wobble = Math.sin(s * 0.031 + current.phase) * 0.012;
  return clamp(base + wobble, 0.045, 0.22);
}

export function halfWidthAt(course, s) {
  const { current, next, t } = blendDistricts(course, s);
  return current.halfWidth + (next.halfWidth - current.halfWidth) * t;
}

function curvatureAt(course, s) {
  const district = districtAt(course, s);
  const ramp = s < 22 ? Math.max(0, s) / 22 : 1;
  return Math.sin(s * district.curveFreq + district.phase) * district.curveAmp * ramp;
}

function ensureSamples(course, sMax) {
  if (course.samples.length === 0) {
    course.samples.push({
      s: 0,
      x: 0,
      y: START_Y,
      z: 0,
      psi: 0,
      grade: gradeAt(course, 0),
    });
  }
  let guard = 0;
  while (course.samples[course.samples.length - 1].s < sMax && guard < 20000) {
    const last = course.samples[course.samples.length - 1];
    const grade = gradeAt(course, last.s);
    const cosGrade = Math.cos(grade);
    const next = {
      s: last.s + SAMPLE_STEP,
      x: last.x + Math.sin(last.psi) * cosGrade * SAMPLE_STEP,
      y: last.y - Math.sin(grade) * SAMPLE_STEP,
      z: last.z - Math.cos(last.psi) * cosGrade * SAMPLE_STEP,
      psi: last.psi + curvatureAt(course, last.s) * SAMPLE_STEP,
      grade,
    };
    course.samples.push(next);
    guard += 1;
  }
}

function lerpAngle(a, b, t) {
  return a + wrapAngle(b - a) * t;
}

// Right of a ground-plane forward: (-fz, 0, fx). forward × worldUp when forward is flat.
export function frameFromTangent(tx, ty, tz) {
  const length = Math.hypot(tx, ty, tz) || 1;
  const fx = tx / length;
  const fy = ty / length;
  const fz = tz / length;
  const horizontal = Math.hypot(fx, fz) || 1;
  const rx = -fz / horizontal;
  const rz = fx / horizontal;
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  const upLength = Math.hypot(ux, uy, uz) || 1;
  return {
    forward: { x: fx, y: fy, z: fz },
    right: { x: rx, y: 0, z: rz },
    up: { x: ux / upLength, y: uy / upLength, z: uz / upLength },
  };
}

export function sampleCourse(course, s) {
  const distance = Math.max(0, s);
  ensureSamples(course, distance + SAMPLE_STEP);
  let index = Math.floor(distance / SAMPLE_STEP);
  if (index >= course.samples.length - 1) index = course.samples.length - 2;
  const a = course.samples[index];
  const b = course.samples[index + 1];
  const t = clamp((distance - a.s) / SAMPLE_STEP, 0, 1);
  const psi = lerpAngle(a.psi, b.psi, t);
  const grade = a.grade + (b.grade - a.grade) * t;
  const cosGrade = Math.cos(grade);
  const frame = frameFromTangent(
    Math.sin(psi) * cosGrade,
    -Math.sin(grade),
    -Math.cos(psi) * cosGrade,
  );
  const district = districtAt(course, distance);
  return {
    s: distance,
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    forward: frame.forward,
    right: frame.right,
    up: frame.up,
    slope: grade,
    halfWidth: halfWidthAt(course, distance),
    theme: district.theme,
    time: district.time,
    name: district.name,
    waterSide: district.waterSide,
    psi,
  };
}

export function checkCourseFrame(course) {
  const errors = [];
  const start = sampleCourse(course, 0);
  const later = sampleCourse(course, 80);
  if (!(later.y < start.y - 3)) errors.push(`expected a drop, y ${start.y.toFixed(2)} -> ${later.y.toFixed(2)}`);
  const horizontal = Math.hypot(start.forward.x, start.forward.z) || 1;
  const expectedX = -start.forward.z / horizontal;
  const expectedZ = start.forward.x / horizontal;
  if (Math.abs(start.right.x - expectedX) > 1e-3 || Math.abs(start.right.z - expectedZ) > 1e-3) {
    errors.push(`right (${start.right.x.toFixed(3)}, ${start.right.z.toFixed(3)}) != (${expectedX.toFixed(3)}, ${expectedZ.toFixed(3)})`);
  }
  if (Math.abs(start.right.y) > 1e-4) errors.push("right.y should be 0");
  if (start.up.y < 0.9) errors.push("up is not above the road");
  if (Math.abs(headingYaw(0, -1)) > 1e-6) errors.push("heading 0 should face -z");
  if (Math.abs(headingYaw(1, 0) + Math.PI / 2) > 1e-6) errors.push("heading should face +x at yaw -pi/2");
  const again = sampleCourse(createCourse(course.seed), 80);
  if (Math.abs(again.y - later.y) > 1e-6 || Math.abs(again.x - later.x) > 1e-6) {
    errors.push("course is not deterministic");
  }
  return errors;
}
