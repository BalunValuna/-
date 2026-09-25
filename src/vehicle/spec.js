import { CAR, WHEELS } from '../car/design.js';

/**
 * Physical specification of the Sever S4 (1.6 l petrol, FWD, 5-speed). Units: SI.
 * Car space: +X right, +Y up, -Z forward.
 */
export const SPEC = {
  mass: 1180,
  // centre of mass: 60/40 front-heavy, 0.5 m above the ground
  com: { x: 0, y: 0.5, z: -0.26 },
  // principal inertia about car X (pitch), Y (yaw), Z (roll)
  inertia: { x: 1850, y: 2100, z: 520 },
  wheels: Object.entries(WHEELS).map(([id, w]) => ({ id, ...w })),
  wheelY: CAR.wheelY,
  radius: CAR.wheelRadius,
  wheelInertia: 1.15,
  suspension: {
    bump: 0.085, // travel above the static position
    droop: 0.12, // travel below it
    front: { k: 31400, bump: 1750, rebound: 2800, arb: 20000, rollCentre: 0.08 },
    rear: { k: 25500, bump: 1300, rebound: 2100, arb: 8000, rollCentre: 0.13 },
    bumpStop: 160000,
  },
  tyre: {
    // Pacejka-style shape factors: longitudinal peak near 10 % slip, lateral near 7 degrees
    longB: 10,
    longC: 1.65,
    latB: 9,
    latC: 1.3,
    rolling: 0.012,
  },
  steer: { max: 0.6, rate: 2.2, returnRate: 3.2, speedFade: 16 },
  brakes: { front: 1650, rear: 850, hand: 1900 },
  engine: {
    idle: 850,
    redline: 6500,
    limiter: 6650,
    inertia: 0.16,
    // torque (N·m) at rpm
    curve: [
      [0, 60],
      [1000, 104],
      [2000, 127],
      [3000, 140],
      [4000, 150],
      [5000, 146],
      [6000, 135],
      [6700, 118],
      [7000, 0],
    ],
    friction: 14,
    frictionPerRpm: 0.0042,
  },
  gearbox: {
    // index 0 = reverse, 1 = neutral, 2.. = forward gears
    ratios: [-3.25, 0, 3.45, 1.94, 1.29, 0.97, 0.78],
    final: 4.07,
    efficiency: 0.9,
    shiftTime: 0.28,
  },
  aero: { drag: 0.41 },
  driven: ['fl', 'fr'],
  colliders: [
    // lower body and cabin as rounded boxes (they slide over bumps instead of snagging)
    { half: [0.78, 0.25, 2.14], radius: 0.06, at: [0, 0.54, 0.06] },
    { half: [0.62, 0.18, 1.02], radius: 0.08, at: [0, 1.14, 0.36] },
  ],
};
