/**
 * Master dimensions of the player car: a 2010-era four-door compact sedan ("Sever S4").
 * Car space: +X right, +Y up, -Z forward. Origin between the axles at ground level.
 */
export const CAR = {
  name: 'Sever S4',
  length: 4.4,
  width: 1.72,
  height: 1.47,
  wheelbase: 2.6,
  axleF: -1.3,
  axleR: 1.3,
  front: -2.145,
  rear: 2.265,
  halfWidth: 0.86,
  trackF: 1.48,
  trackR: 1.47,
  // 195/55 R16
  wheelRadius: 0.3105,
  rimRadius: 0.2032,
  tireWidth: 0.195,
  wheelY: 0.3,
  archRadius: 0.37,
  groundClearance: 0.16,
  mass: 1180,
};

/** Wheel hub positions in car space, keyed by corner id. */
export const WHEELS = {
  fl: { x: -CAR.trackF / 2, z: CAR.axleF, front: true, left: true },
  fr: { x: CAR.trackF / 2, z: CAR.axleF, front: true, left: false },
  rl: { x: -CAR.trackR / 2, z: CAR.axleR, front: false, left: true },
  rr: { x: CAR.trackR / 2, z: CAR.axleR, front: false, left: false },
};
