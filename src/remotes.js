import { createRemotePresentation } from "@rb/arcade/presentation";
import { sampleCourse } from "./course.js";
import { walkerForward } from "./drive.js";
import { acceptedLook, lookKey } from "./looks.js";
import { SLOT_LOOKS, lerpPose } from "./party.js";
import { createRider } from "./rider.js";

// Other cans on this hill, through Arcade's remote presentation: one rider per
// slot, rebuilt on a look change, blended between updates, hidden when it
// leaves. The game supplies the rider builder, its look rules and the course
// placement (sampleCourse and the rider's own place / placeApart, the same
// frames the local can uses). The rider wears its own name tag.
export function createRemoteRiders(THREE, scene, materials, props) {
  const presentation = createRemotePresentation({
    parent: scene,
    blendMs: 50,
    lookOf: (pose, slot) => acceptedLook(pose) || SLOT_LOOKS[slot % SLOT_LOOKS.length],
    lookKey: (look, slot) => (look === SLOT_LOOKS[slot % SLOT_LOOKS.length] ? `slot:${slot % SLOT_LOOKS.length}` : lookKey(look)),
    lerp: lerpPose,
    create(slot, look) {
      const rider = createRider(THREE, materials, props, look);
      rider.root.name = `rider-slot-${slot}`;
      return rider;
    },
    place(rider, pose, { course, elapsed }) {
      rider.setName(pose.displayName);
      placeRider(rider, course, pose, elapsed);
    },
  });

  return {
    show: (slot, pose, now, snap = false) => presentation.show(slot, pose, now, { snap }),
    retain: (live) => presentation.retain(live),
    place: (course, now, elapsed) => presentation.place(now, { course, elapsed }),
    clear: () => presentation.clear(),
    // The pose on screen this instant. A guest collides with this, which is
    // the same blend place() draws. slot is the map key, not a field on the pose.
    poses: (now) => presentation.poses(now).map((pose) => ({ ...pose, slot: pose.id })),
  };
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
      facing: walkerForward(bodySample.forward, bodySample.right, pose.face || 0),
      showPerson: true,
      moving: Math.abs(pose.speed || 0) > 0.12,
    });
  } else {
    const sample = sampleCourse(course, pose.s);
    rider.place(sample, pose.offset || 0, pose.spin || 0, 0, pose.hop || 0, true);
  }
  rider.setTuck?.(pose.ejected ? 0 : ((pose.speed || 0) > 12 ? 1 : 0));
  rider.animate(elapsed);
}
