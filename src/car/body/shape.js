import { Profile } from '../../geo/profile.js';
import { roundMax, roundMin } from '../../geo/sdf.js';
import { smoothstep } from '../../core/math.js';
import { CAR } from '../design.js';

/**
 * Implicit definition of the outer body skin (f < 0 inside). The body is the union of a lower
 * body (sides, hood, belt deck, trunk, front and rear faces) and a greenhouse (windshield, roof,
 * rear window, side glass). Every panel, glass and light lens is cut out of this one surface,
 * which is what keeps the panels flush and the gaps even.
 */

const P = (points, opts) => new Profile(points, opts);

// ---------------------------------------------------------------- lower body

/** Half width of the side at crease height (slight bow in plan view). */
export const halfWidth = P([
  [-2.3, 0.83],
  [-1.7, 0.851],
  [-1.0, 0.856],
  [0.0, 0.858],
  [1.0, 0.859],
  [1.7, 0.855],
  [2.3, 0.84],
]);

/** Sharp side character line, rising towards the tail. */
export const creaseY = P([
  [-2.3, 0.8],
  [-1.3, 0.848],
  [0.0, 0.888],
  [1.3, 0.928],
  [2.3, 0.955],
]);

/** Window sill (belt) line, wedge shaped. */
export const beltY = P([
  [-2.3, 0.93],
  [-1.1, 0.95],
  [-0.8, 0.962],
  [-0.4, 0.985],
  [0.4, 1.018],
  [1.0, 1.045],
  [1.45, 1.075],
  [1.8, 1.14],
  [2.3, 1.2],
]);

/** Lower side section offset over t (0 = sill bottom, 1 = crease). */
const lowerSection = P([
  [0, -0.042],
  [0.14, -0.019],
  [0.34, -0.005],
  [0.62, 0.004],
  [1.0, 0.0],
]);

/** Inward travel of the shoulder between the crease and the belt. */
export const SHOULDER_IN = 0.066;

/** Lower body top along the centre line: hood, cowl, belt deck (under the glass), trunk lid. */
export const lowerTop = P([
  [-2.25, 0.73, 0.55],
  [-2.06, 0.805, 0.34],
  [-1.9, 0.843, 0.19],
  [-1.5, 0.906, 0.13],
  [-1.1, 0.95, 0.1],
  [-0.8, 0.975, 0.07],
  [-0.4, 0.995, 0.04],
  [0.4, 1.022, 0.035],
  [1.0, 1.05, 0.05],
  [1.5, 1.085, 0.07],
  [1.7, 1.1, 0.04],
  [2.0, 1.108, 0.03],
  [2.18, 1.124, 0.08],
  [2.35, 1.13, 0],
]);

/** Crown of the lower top: height drop at |x| = CROWN_REF. */
const lowerCrown = P([
  [-2.3, 0.036],
  [-1.1, 0.04],
  [-0.82, 0.008],
  [-0.62, 0.0],
  [1.45, 0.0],
  [1.7, 0.026],
  [2.3, 0.028],
]);
const CROWN_REF = 0.72;

/** Front face depth along the centre line as a function of height. */
const frontCenter = P([
  [0.1, -1.96],
  [0.2, -2.05],
  [0.28, -2.11],
  [0.38, -2.142],
  [0.48, -2.145],
  [0.58, -2.128],
  [0.67, -2.1],
  [0.74, -2.07],
  [0.79, -2.035],
  [1.0, -1.88],
]);

/** Rear face depth along the centre line as a function of height. */
const rearCenter = P([
  [0.2, 2.08],
  [0.28, 2.15],
  [0.38, 2.225],
  [0.5, 2.26],
  [0.62, 2.265],
  [0.74, 2.252],
  [0.88, 2.232],
  [1.0, 2.214],
  [1.07, 2.196],
  [1.2, 2.1],
]);

/** Underside height. */
const bottomY = P([
  [-2.3, 0.33],
  [-2.05, 0.22],
  [-1.8, 0.19],
  [0.0, 0.185],
  [1.7, 0.19],
  [2.0, 0.24],
  [2.3, 0.33],
]);

// ---------------------------------------------------------------- greenhouse

/** Greenhouse top along the centre line: windshield, roof, rear window. */
export const greenTop = P([
  [-1.2, 0.842, 0.54],
  [-1.02, 0.94, 0.54],
  [-0.2, 1.38, 0.53],
  [0.02, 1.447, 0.17],
  [0.28, 1.47, 0.0],
  [0.62, 1.458, -0.08],
  [0.9, 1.415, -0.3],
  [1.2, 1.3, -0.44],
  [1.62, 1.105, -0.47],
  [1.9, 0.97, -0.48],
], { extrapolate: 'linear' });

const greenCrown = P([
  [-1.2, 0.1],
  [-0.3, 0.09],
  [0.05, 0.06],
  [0.7, 0.06],
  [1.0, 0.08],
  [1.9, 0.07],
]);

/** Side glass lean (dx/dy) and curvature above the belt. */
const TUMBLE = 0.36;
const TUMBLE_CURVE = 0.12;

// ---------------------------------------------------------------- helpers

export function archFlare(z, y) {
  const dF = Math.hypot(z - CAR.axleF, y - CAR.wheelY);
  const dR = Math.hypot((z - CAR.axleR) * 0.9, y - CAR.wheelY);
  const f = 0.011 * (1 - smoothstep(0.35, 0.52, dF)) + 0.015 * (1 - smoothstep(0.35, 0.58, dR));
  return f * smoothstep(0.18, 0.3, y);
}

/** Half width of the lower body side at (z, y). */
export function lowerSideX(z, y) {
  const w = halfWidth.at(z) + archFlare(z, y);
  const yc = creaseY.at(z);
  if (y <= yc) return w + lowerSection.at((y - 0.24) / (yc - 0.24));
  const s = (y - yc) / (beltY.at(z) - yc);
  return w - SHOULDER_IN * (0.52 * s + 0.48 * s * s);
}

/** Half width of the greenhouse side at (z, y); tucks under the belt so it never shows below it. */
export function greenSideX(z, y) {
  const dy = y - beltY.at(z);
  const xb = halfWidth.at(z) - SHOULDER_IN;
  return dy >= 0 ? xb - TUMBLE * dy - TUMBLE_CURVE * dy * dy : xb + dy;
}

export function lowerTopY(z, ax) {
  const u = ax / CROWN_REF;
  return lowerTop.at(z) - lowerCrown.at(z) * u * u;
}

export function greenTopY(z, ax) {
  const u = ax / CROWN_REF;
  return greenTop.at(z) - greenCrown.at(z) * u * u;
}

export function frontZ(ax, y) {
  const u = ax / CAR.halfWidth;
  // Plan-view sweep grows with height so the headlights wrap back into the fenders.
  return frontCenter.at(y) + (0.1 + 0.14 * smoothstep(0.45, 0.8, y)) * u * u;
}

export function rearZ(ax, y) {
  const u = ax / CAR.halfWidth;
  return rearCenter.at(y) - (0.09 + 0.05 * smoothstep(0.6, 1.0, y)) * u * u;
}

function topEdgeRadius(z) {
  if (z < -1.7) return 0.045 + 0.035 * smoothstep(-1.7, -2.05, z);
  if (z > 2.0) return 0.035 + 0.025 * smoothstep(2.0, 2.2, z);
  if (z < -0.7) return 0.045 - 0.01 * smoothstep(-1.2, -0.7, z);
  return 0.035;
}

// ---------------------------------------------------------------- fields

export function lowerBodyField(x, y, z) {
  const ax = Math.abs(x);
  const side = ax - lowerSideX(z, y);
  const front = (frontZ(ax, y) - z) * 0.92;
  const rear = (z - rearZ(ax, y)) * 0.95;
  let d = roundMax(side, front, 0.3);
  d = roundMax(d, rear, 0.22);
  const slope = lowerTop.slope(z);
  const top = (y - lowerTopY(z, ax)) / Math.sqrt(1 + slope * slope);
  d = roundMax(d, top, topEdgeRadius(z));
  return roundMax(d, bottomY.at(z) - y, 0.055);
}

export function greenhouseField(x, y, z) {
  const ax = Math.abs(x);
  const side = (ax - greenSideX(z, y)) * 0.94;
  const slope = greenTop.slope(z);
  const top = (y - greenTopY(z, ax)) / Math.sqrt(1 + slope * slope);
  // The windshield and rear window slopes close the greenhouse; the z window only keeps its
  // buried wedge from leaking out past the bumpers.
  const ends = Math.max(GREEN_Z0 - z, z - GREEN_Z1);
  return Math.max(roundMax(side, top, 0.04), ends);
}
const GREEN_Z0 = -1.3;
const GREEN_Z1 = 2.0;

/** Wheel house cavity: arch opening in the side and the tub behind it (negative inside). */
export function wheelHouseField(x, y, z) {
  const ax = Math.abs(x);
  const za = z < 0 ? CAR.axleF : CAR.axleR;
  const r = Math.hypot(z - za, y - CAR.wheelY) - CAR.archRadius;
  return Math.max(r, WHEELHOUSE_INNER_X - ax);
}
export const WHEELHOUSE_INNER_X = 0.5;

/** Outer skin without the wheel arches (the mesher never sees the arch crease). */
export function outerField(x, y, z) {
  // Small fillet where the glass meets the body: a razor concave crease meshes badly.
  return roundMin(lowerBodyField(x, y, z), greenhouseField(x, y, z), 0.012);
}

/** Outer skin of the whole car body, arches included (surface queries and detail placement). */
export function bodyField(x, y, z) {
  return roundMax(outerField(x, y, z), -wheelHouseField(x, y, z), 0.012);
}

/** Axis-aligned bounds that contain the body with a margin, for meshing. */
export const BODY_BOUNDS = {
  min: [-0.92, 0.1, -2.22],
  max: [0.92, 1.52, 2.34],
};
