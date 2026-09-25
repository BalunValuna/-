import { Profile } from '../../geo/profile.js';
import { sdPolygon } from '../../geo/sdf.js';
import { CAR } from '../design.js';
import { beltY, greenSideX, greenTopY, lowerTopY } from './shape.js';

/**
 * Panel layout of the body: every separable part is a region on the body skin, described by 2D
 * outlines in the side (z, y), top (|x|, z) and rear/front (|x|, y) projections. Region functions
 * return a signed distance (negative inside); the panel builder cuts along them with an even gap.
 */

// ------------------------------------------------------------ greenhouse lines (computed)

function bisect(f, a, b, it = 40) {
  let fa = f(a);
  for (let i = 0; i < it; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (fm < 0 === fa < 0) {
      a = m;
      fa = fm;
    } else b = m;
  }
  return (a + b) / 2;
}

const ghGap = (z, y) => greenTopY(z, greenSideX(z, y)) - y;

/** Side-view edge of the greenhouse: A-pillar, roof rail and C-pillar as one polyline (z, y). */
export const DLO = (() => {
  const pts = [];
  for (let y = 0.955; y < 1.36; y += 0.025) pts.push([bisect((z) => ghGap(z, y), -1.3, 0.3), y]);
  for (let z = -0.08; z < 0.86; z += 0.04) pts.push([z, bisect((y) => ghGap(z, y), beltY.at(z), 1.6)]);
  for (let y = 1.36; y > 1.06; y -= 0.025) pts.push([bisect((z) => ghGap(z, y), 0.3, 2.0), y]);
  return pts;
})();

/** Roof rail height (side view) along z. */
export const roofRailY = new Profile(
  (() => {
    const pts = [];
    for (let z = -0.25; z <= 1.05; z += 0.05) pts.push([z, bisect((y) => ghGap(z, y), beltY.at(z), 1.6)]);
    return pts;
  })(),
);

/** A-pillar edge: z of the pillar edge at height y. */
export const aPillarZ = new Profile(
  (() => {
    const pts = [];
    for (let y = 0.94; y <= 1.38; y += 0.02) pts.push([y, bisect((z) => ghGap(z, y), -1.3, 0.3)]);
    return pts;
  })(),
);

/** C-pillar edge: z of the pillar edge at height y. */
export const cPillarZ = new Profile(
  (() => {
    const pts = [];
    for (let y = 1.06; y <= 1.38; y += 0.02) pts.push([y, bisect((z) => ghGap(z, y), 0.3, 2.0)]);
    return pts;
  })(),
);

/** Horizontal inboard distance from the greenhouse side surface (pillar width measure). */
export const pillarInset = (ax, y, z) => greenSideX(z, y) - ax;

// ------------------------------------------------------------ helpers

const poly = (pts) => pts.flat();
export const sideSD = (P) => (x, y, z) => sdPolygon(z, y, P);
export const topSD = (P) => (x, y, z) => sdPolygon(Math.abs(x), z, P);
export const endSD = (P) => (x, y, z) => sdPolygon(Math.abs(x), y, P);
export const and = (...fs) => (x, y, z) => {
  let d = -Infinity;
  for (const f of fs) {
    const v = f(x, y, z);
    if (v > d) d = v;
  }
  return d;
};
export const or = (...fs) => (x, y, z) => {
  let d = Infinity;
  for (const f of fs) {
    const v = f(x, y, z);
    if (v < d) d = v;
  }
  return d;
};
export const not = (f) => (x, y, z) => -f(x, y, z);
/** Restricts a region to one side of the car: side = -1 (left, driver) or +1 (right). */
export const onSide = (f, side) => (x, y, z) => Math.max(f(x, y, z), -side * x);

/** Offsets a side-view polyline perpendicular to itself (positive = to the right of travel). */
function offsetPolyline(pts, d) {
  return pts.map((p, i) => {
    const a = pts[Math.max(i - 1, 0)];
    const b = pts[Math.min(i + 1, pts.length - 1)];
    const tz = b[0] - a[0];
    const ty = b[1] - a[1];
    const l = Math.hypot(tz, ty) || 1;
    return [p[0] + (ty / l) * d, p[1] - (tz / l) * d];
  });
}

function arcPoints(cz, cy, r, a0, a1, steps) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push([cz + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

const DEG = Math.PI / 180;

// ------------------------------------------------------------ layout constants

export const LAYOUT = {
  doorBottomY: 0.285,
  frontDoorFront: [
    [-0.832, 0.285],
    [-0.8, 0.62],
    [-0.776, 0.962],
  ],
  bSeam: (y) => 0.305 - 0.035 * ((y - 0.285) / 1.15),
  rearDoorTopRear: [
    [1.0, 1.3],
    [1.13, 1.058],
  ],
  aPillarWidth: 0.052,
  railWidth: 0.03,
  doorFrame: 0.03,
  bFrame: 0.042,
};

/**
 * Door frame upper edge in DLO order (up the A-pillar, then rearwards along the roof rail),
 * offset inside the greenhouse edge by the pillar/rail width.
 */
const doorTopLine = offsetPolyline(
  DLO.filter(([z]) => z < 1.02),
  LAYOUT.railWidth,
).filter(([z, y]) => y > beltY.at(z) + 0.01);

/** Same line pushed further in by the door frame width: the upper edge of the door glass. */
const glassTopLine = offsetPolyline(doorTopLine, LAYOUT.doorFrame).filter(([z, y]) => y > beltY.at(z) + 0.012);

function frontDoorOutline() {
  const topB = roofRailY.at(0.27) - LAYOUT.railWidth;
  const pts = [
    [LAYOUT.bSeam(0.285), 0.285],
    [LAYOUT.bSeam(topB), topB],
    // roof rail forwards, then down the A-pillar
    ...[...doorTopLine].reverse().filter((p) => p[0] < LAYOUT.bSeam(p[1]) - 0.02),
    [-0.735, 0.985],
    ...[...LAYOUT.frontDoorFront].reverse(),
  ];
  return poly(pts);
}

function rearDoorOutline() {
  const topB = roofRailY.at(0.29) - LAYOUT.railWidth;
  const pts = [
    [LAYOUT.bSeam(topB), topB],
    [LAYOUT.bSeam(0.285), 0.285],
    [0.9, 0.285],
    ...arcPoints(CAR.axleR, CAR.wheelY, 0.405, 180 * DEG, 118 * DEG, 8),
    [1.125, 0.8],
    ...[...LAYOUT.rearDoorTopRear].reverse(),
    // roof rail forwards back to the B seam
    ...[...doorTopLine].reverse().filter((p) => p[0] > LAYOUT.bSeam(p[1]) + 0.02 && p[0] < 0.99),
  ];
  return poly(pts);
}

function frontDoorGlassOutline() {
  const zb = LAYOUT.bSeam(1.2) - LAYOUT.bFrame;
  const pts = [
    [zb, beltY.at(zb) + 0.004],
    [zb, roofRailY.at(zb) - LAYOUT.railWidth - LAYOUT.doorFrame],
    ...[...glassTopLine].reverse().filter((p) => p[0] < zb - 0.02),
    [-0.69, beltY.at(-0.69) + 0.004],
  ];
  return poly(pts);
}

function rearDoorGlassOutline() {
  const zf = LAYOUT.bSeam(1.2) + LAYOUT.bFrame;
  const pts = [
    [zf, roofRailY.at(zf) - LAYOUT.railWidth - LAYOUT.doorFrame],
    [zf, beltY.at(zf) + 0.004],
    [1.095, beltY.at(1.095) + 0.004],
    [0.975, 1.268],
    ...[...glassTopLine].reverse().filter((p) => p[0] > zf + 0.02 && p[0] < 0.95),
  ];
  return poly(pts);
}

export const FRONT_DOOR = frontDoorOutline();
export const REAR_DOOR = rearDoorOutline();

// Hood outline (top view): side edges and the rear edge ahead of the windshield base.
export const hoodEdgeX = new Profile([
  [-2.12, 0.5],
  [-1.96, 0.6],
  [-1.76, 0.662],
  [-1.4, 0.702],
  [-1.0, 0.724],
  [-0.8, 0.73],
]);
export const hoodRearZ = (ax) => -1.035 + 0.135 * (ax / 0.6) ** 2;

// Trunk outline (top view)
export const trunkEdgeX = new Profile([
  [1.5, 0.75],
  [1.8, 0.748],
  [2.1, 0.742],
  [2.4, 0.73],
]);
export const trunkFrontZ = (ax) => 1.683 - 0.083 * (ax / 0.6) ** 2;

// ------------------------------------------------------------ region functions

const hoodTop = (x, y, z) => {
  const ax = Math.abs(x);
  return Math.max(ax - hoodEdgeX.at(z), z - hoodRearZ(ax));
};
/** Hood front cut line on the nose (front view). */
export const hoodFrontY = (ax) => 0.772 + 0.03 * (ax / 0.5) ** 2;
const hoodRegion = (x, y, z) => Math.max(hoodTop(x, y, z), hoodFrontY(Math.abs(x)) - y);

const trunkTop = (x, y, z) => {
  const ax = Math.abs(x);
  return Math.max(ax - trunkEdgeX.at(z), trunkFrontZ(ax) - z);
};

const trunkRegion = and(
  trunkTop,
  endSD(
    poly([
      [-0.01, 0.775],
      [0.47, 0.775],
      [0.492, 0.797],
      [0.495, 1.025],
      [0.8, 1.085],
      [0.8, 1.6],
      [-0.01, 1.6],
    ]),
  ),
);

export const REGIONS = {
  windshield: (x, y, z) => {
    const ax = Math.abs(x);
    const zTop = -0.25 + 0.1 * (ax / 0.6) ** 2;
    return Math.max(0.055 - pillarInset(ax, y, z), z - zTop, 0.028 - (y - lowerTopY(z, ax)));
  },
  rearWindow: (x, y, z) => {
    const ax = Math.abs(x);
    const zTop = 0.86 - 0.08 * (ax / 0.6) ** 2;
    return Math.max(0.075 - pillarInset(ax, y, z), zTop - z, 0.03 - (y - lowerTopY(z, ax)), 0.5 - z);
  },
  quarterGlass: sideSD(
    poly([
      [1.175, 1.078],
      [1.378, 1.098],
      [1.19, 1.222],
    ]),
  ),
  headlight: and(
    sideSD(
      poly([
        [-2.3, 0.63],
        [-2.3, 0.95],
        [-1.6, 0.95],
        [-1.585, 0.86],
        [-1.64, 0.79],
        [-1.86, 0.724],
        [-2.06, 0.672],
      ]),
    ),
    endSD(
      poly([
        [0.372, 0.654],
        [0.382, 0.77],
        [0.62, 0.815],
        [0.98, 0.93],
        [0.98, 0.7],
        [0.66, 0.664],
      ]),
    ),
    not(hoodRegion),
  ),
  taillight: and(
    sideSD(
      poly([
        [1.93, 1.078],
        [2.4, 1.11],
        [2.4, 0.81],
        [2.08, 0.812],
        [1.95, 0.95],
      ]),
    ),
    endSD(
      poly([
        [0.5, 0.815],
        [0.5, 1.012],
        [0.98, 1.105],
        [0.98, 0.81],
      ]),
    ),
    not((x, y, z) => trunkRegion(x, y, z)),
  ),
  hood: hoodRegion,
  trunk: (x, y, z) => trunkRegion(x, y, z),
  frontBumper: and(
    sideSD(
      poly([
        [-1.62, 1.2],
        [-1.63, 0.79],
        [-1.58, 0.55],
        [-1.42, 0.0],
        [-2.6, 0.0],
        [-2.6, 1.2],
      ]),
    ),
    (x, y, z) => 0.205 - y,
  ),
  rearBumper: and(
    sideSD(
      poly([
        [2.09, 1.2],
        [2.09, 0.803],
        [1.582, 0.552],
        [1.44, 0.0],
        [2.6, 0.0],
        [2.6, 1.2],
      ]),
    ),
    (x, y, z) => 0.235 - y,
    (x, y, z) => y - 0.8,
  ),
  frontDoor: sideSD(FRONT_DOOR),
  rearDoor: sideSD(REAR_DOOR),
  fender: and(
    sideSD(
      poly([
        [-0.832, 0.285],
        [-0.8, 0.62],
        [-0.776, 0.962],
        [-0.95, 0.962],
        [-0.95, 1.3],
        [-1.62, 1.3],
        [-1.63, 0.79],
        [-1.58, 0.55],
        [-1.3, 0.2],
        [-0.9, 0.2],
        [-0.9, 0.285],
      ]),
    ),
    (x, y, z) => hoodEdgeX.at(z) - Math.abs(x),
  ),
  fuelDoor: (x, y, z) => {
    const dz = Math.abs(z - 1.78) - 0.075 + 0.022;
    const dy = Math.abs(y - 0.905) - 0.06 + 0.022;
    return Math.hypot(Math.max(dz, 0), Math.max(dy, 0)) + Math.min(Math.max(dz, dy), 0) - 0.022;
  },
  cowl: (x, y, z) => {
    const ax = Math.abs(x);
    return Math.max(ax - 0.745, -1.09 - z, z + 0.72, 0.9 - y);
  },
  // openings in the bumpers (front/rear view)
  grille: endSD(
    poly([
      [-0.01, 0.642],
      [0.29, 0.642],
      [0.338, 0.662],
      [0.354, 0.736],
      [-0.01, 0.744],
    ]),
  ),
  frontPlate: endSD(
    poly([
      [-0.01, 0.502],
      [0.262, 0.502],
      [0.262, 0.61],
      [-0.01, 0.61],
    ]),
  ),
  rearPlate: endSD(
    poly([
      [-0.01, 0.832],
      [0.272, 0.832],
      [0.272, 0.955],
      [-0.01, 0.955],
    ]),
  ),
  lowerIntake: endSD(
    poly([
      [-0.01, 0.262],
      [0.36, 0.262],
      [0.47, 0.3],
      [0.5, 0.455],
      [0.42, 0.478],
      [-0.01, 0.478],
    ]),
  ),
  fogPocket: endSD(
    poly([
      [0.56, 0.3],
      [0.74, 0.33],
      [0.76, 0.44],
      [0.68, 0.47],
      [0.57, 0.455],
    ]),
  ),
  rearReflector: endSD(
    poly([
      [0.6, 0.47],
      [0.8, 0.49],
      [0.8, 0.52],
      [0.6, 0.505],
    ]),
  ),
  rearDiffuser: endSD(
    poly([
      [-0.01, 0.24],
      [0.62, 0.24],
      [0.66, 0.3],
      [0.5, 0.345],
      [-0.01, 0.345],
    ]),
  ),
  // door glass, inside the door frames
  frontDoorGlass: sideSD(frontDoorGlassOutline()),
  rearDoorGlass: sideSD(rearDoorGlassOutline()),
};
