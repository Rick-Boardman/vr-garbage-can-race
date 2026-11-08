// Shared scale for the downhill. Distances are meters.

export const SAMPLE_STEP = 2;
export const DISTRICT_LENGTH = 180;
export const CHUNK_LENGTH = 42;
export const START_S = 36;
export const START_Y = 26;
export const CAN_RADIUS = 0.5;
// On-foot body in the road frame. Cars stop for this circle; it is not the can.
export const FOOT_RADIUS = 0.45;
// How far past the asphalt edge the can may drift before the buildings stop it.
export const SHOULDER_REACH = 2.55;
// Facade sits past the sidewalk and a planting strip, beyond the shoulder stop.
export const BUILDING_SETBACK = 5.0;
export const SIDEWALK_CENTER = 1.7;
