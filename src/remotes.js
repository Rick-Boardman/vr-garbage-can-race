import { sampleCourse } from "./course.js";
import { acceptedLook, lookKey } from "./looks.js";
import { SLOT_LOOKS, lerpPose } from "./party.js";
import { createRider } from "./rider.js";

const BLEND_MS = 50;

// Other cans on this hill. Placement goes through sampleCourse and the
// rider's own place / placeApart, the same frames the local can uses.
export function createRemoteRiders(THREE, scene, materials, props) {
  const riders = new Map();
  const shown = new Map();

  function ensure(slot, pose) {
    const chosen = acceptedLook(pose);
    const look = chosen || SLOT_LOOKS[slot % SLOT_LOOKS.length];
    const key = chosen ? lookKey(chosen) : `slot:${slot % SLOT_LOOKS.length}`;
    const existing = riders.get(slot);
    if (existing?.lookKey === key) return existing;
    if (existing) existing.root.removeFromParent();
    const rider = createRider(THREE, materials, props, look);
    rider.lookKey = key;
    rider.root.name = `rider-slot-${slot}`;
    rider.root.visible = !!existing?.root.visible;
    scene.add(rider.root);
    riders.set(slot, rider);
    return rider;
  }

  function show(slot, pose, now, snap = false) {
    ensure(slot, pose);
    const previous = shown.get(slot);
    if (snap || !previous) {
      shown.set(slot, { from: pose, to: pose, at: now });
      return;
    }
    const from = lerpPose(previous.from, previous.to, (now - previous.at) / BLEND_MS);
    shown.set(slot, { from, to: pose, at: now });
  }

  function retain(live) {
    for (const [slot, rider] of riders) {
      if (live.has(slot)) continue;
      rider.root.visible = false;
      shown.delete(slot);
    }
  }

  function place(course, now, elapsed) {
    for (const [slot, rider] of riders) {
      const entry = shown.get(slot);
      if (!entry) {
        rider.root.visible = false;
        continue;
      }
      rider.root.visible = true;
      const pose = lerpPose(entry.from, entry.to, (now - entry.at) / BLEND_MS);
      placeRider(rider, course, pose, elapsed);
    }
  }

  function clear() {
    for (const rider of riders.values()) rider.root.removeFromParent();
    riders.clear();
    shown.clear();
  }

  return { show, retain, place, clear };
}

function placeRider(rider, course, pose, elapsed) {
  if (pose.ejected) {
    const canSample = sampleCourse(course, pose.canS);
    const bodySample = sampleCourse(course, pose.bodyS);
    rider.placeApart({
      canSample,
      canOffset: pose.canOffset || 0,
      canSpin: pose.spin || 0,
      canHop: pose.hop || 0,
      bodySample,
      bodyOffset: pose.bodyOffset || 0,
      facing: { x: bodySample.forward.x, z: bodySample.forward.z },
      showPerson: true,
      moving: Math.abs(pose.speed || 0) > 0.12,
    });
  } else {
    const sample = sampleCourse(course, pose.s);
    rider.place(sample, pose.offset || 0, pose.spin || 0, 0, pose.hop || 0, true);
  }
  rider.animate(elapsed);
}
