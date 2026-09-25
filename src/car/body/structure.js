import * as THREE from 'three';
import { loft, planarPanel } from '../../geo/loft.js';
import { mesh, roundedBox, sweepProfile, roundRectSection, latheY } from '../../geo/primitives.js';
import { hoodEdgeX, DLO, LAYOUT, roofRailY } from './regions.js';
import { lowerTopY, beltY, greenSideX, frontZ, rearZ } from './shape.js';
import { CAR } from '../design.js';

/**
 * Body-in-white structure under the skin ("каркас"): floor, sills, firewall, engine bay aprons
 * with strut towers and rails, radiator support, crash beams, pillar and roof structure, trunk
 * floor with spare wheel well. It is a separate part so a build can start from the bare frame.
 */
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const APRON_X = 0.486;
const FIREWALL_Z = -0.958;
const RADSUP_Z = -1.945;
export const FLOOR_Y = 0.235;

export function buildStructure(mats) {
  const g = new THREE.Group();
  g.name = 'frame';
  const add = (geo, mat, name) => {
    const m = mesh(geo, mat, { name });
    g.add(m);
    return m;
  };

  // ---------------------------------------------------------------- engine bay
  for (const side of [-1, 1]) {
    // apron: vertical wall, then an upper rail running out under the hood/fender seam
    const sections = [];
    for (let z = RADSUP_Z + 0.01; z <= FIREWALL_Z - 0.005; z += 0.035) {
      const outer = hoodEdgeX.at(z) + 0.05;
      const topY = lowerTopY(z, outer) - 0.032;
      const pts = [V(APRON_X, 0.3, z), V(APRON_X, 0.66, z), V(APRON_X + 0.035, topY - 0.02, z), V(outer, topY, z), V(outer + 0.03, topY - 0.012, z)];
      sections.push(pts.map((p) => V(p.x * side, p.y, p.z)));
    }
    add(loft(sections, { flip: side > 0 }), mats.paint, 'apron');
    add(loft(sections, { flip: side < 0 }), mats.paintInner, 'apronBack');
    // strut tower: half dome bulging out of the apron into the bay
    const tower = latheY(
      [
        [0.105, 0.6],
        [0.105, 0.78],
        [0.095, 0.815],
        [0.07, 0.835],
        [0.0, 0.84],
      ],
      20,
      side > 0 ? Math.PI : 0,
      Math.PI,
    );
    const t = add(tower, mats.paint, 'strutTower');
    t.position.set(side * APRON_X, 0, CAR.axleF);
    const mount = add(new THREE.CylinderGeometry(0.035, 0.04, 0.03, 16), mats.rubber, 'strutMount');
    mount.position.set(side * (APRON_X - 0.035), 0.85, CAR.axleF);
    const nut = add(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 6), mats.steel, 'strutNut');
    nut.position.set(side * (APRON_X - 0.035), 0.87, CAR.axleF);
    // front rail under the apron
    const rail = sweepProfile(
      [V(side * 0.445, 0.33, RADSUP_Z - 0.09), V(side * 0.445, 0.32, -1.3), V(side * 0.45, 0.27, FIREWALL_Z), V(side * 0.46, 0.24, -0.5)],
      roundRectSection(0.08, 0.1, 0.012),
    );
    add(rail, mats.paint, 'frontRail');
  }

  // firewall with toe board, from the floor up to the cowl
  const fw = [];
  for (let x = -APRON_X; x <= APRON_X + 1e-6; x += APRON_X / 6) {
    fw.push([V(x, FLOOR_Y + 0.02, FIREWALL_Z + 0.2), V(x, 0.42, FIREWALL_Z + 0.02), V(x, 0.86, FIREWALL_Z), V(x, 0.905, FIREWALL_Z - 0.04)]);
  }
  add(loft(fw), mats.paint, 'firewall');
  add(loft(fw, { flip: true }), mats.paintInner, 'firewallCabin');
  // cowl plenum under the cowl panel
  const plenum = [];
  for (let x = -0.72; x <= 0.72 + 1e-6; x += 0.08) {
    const z0 = -1.06 + 0.12 * (x / 0.6) ** 2;
    plenum.push([V(x, 0.905, FIREWALL_Z - 0.04), V(x, 0.885, z0 + 0.02), V(x, lowerTopY(z0, Math.abs(x)) - 0.03, z0)]);
  }
  add(loft(plenum, { flip: true }), mats.paint, 'plenum');

  // radiator support (black front-end module)
  const top = add(roundedBox(1.12, 0.05, 0.06, 0.01), mats.blackPlastic, 'radSupportTop');
  top.position.set(0, 0.748, RADSUP_Z);
  const bottom = add(roundedBox(0.98, 0.05, 0.06, 0.01), mats.blackPlastic, 'radSupportBottom');
  bottom.position.set(0, 0.33, RADSUP_Z);
  for (const side of [-1, 1]) {
    const post = add(roundedBox(0.06, 0.44, 0.06, 0.01), mats.blackPlastic, 'radSupportPost');
    post.position.set(side * 0.47, 0.54, RADSUP_Z);
    const brace = add(roundedBox(0.2, 0.05, 0.05, 0.01), mats.blackPlastic, 'headlightMount');
    brace.position.set(side * 0.6, 0.74, RADSUP_Z - 0.02);
  }
  // crash beams behind the bumper covers
  const beamF = [];
  const beamR = [];
  for (let x = -0.64; x <= 0.64 + 1e-6; x += 0.08) {
    beamF.push(V(x, 0.46, frontZ(Math.abs(x), 0.46) + 0.075));
    beamR.push(V(x, 0.53, rearZ(Math.abs(x), 0.53) - 0.07));
  }
  add(sweepProfile(beamF, roundRectSection(0.05, 0.11, 0.01)), mats.steel, 'crashBeamFront');
  add(sweepProfile(beamR, roundRectSection(0.05, 0.11, 0.01)), mats.steel, 'crashBeamRear');
  // undertray under the engine bay
  const tray = planarPanel(
    [
      [-0.5, RADSUP_Z - 0.06],
      [0.5, RADSUP_Z - 0.06],
      [0.5, FIREWALL_Z + 0.1],
      [-0.5, FIREWALL_Z + 0.1],
    ],
    (u, v, w, out) => out.set(u, 0.21, v),
    { normal: V(0, 1, 0) },
  );
  add(tray, mats.blackPlastic, 'undertray');

  // ---------------------------------------------------------------- cabin floor and sills
  const floorSections = [];
  for (let z = FIREWALL_Z + 0.2; z <= 1.28; z += 0.05) {
    const kick = z > 0.5 ? Math.min((z - 0.5) / 0.08, 1) * 0.1 : 0;
    const tunnelH = Math.max(0.035, 0.15 - Math.max(z + 0.6, 0) * 0.08);
    const y = FLOOR_Y + kick;
    const sec = [];
    for (const [x, dy] of [
      [-0.74, 0.06],
      [-0.7, 0],
      [-0.2, 0],
      [-0.12, tunnelH * 0.9],
      [0, tunnelH],
      [0.12, tunnelH * 0.9],
      [0.2, 0],
      [0.7, 0],
      [0.74, 0.06],
    ]) {
      sec.push(V(x, y + dy, z));
    }
    floorSections.push(sec);
  }
  add(loft(floorSections, { flip: true }), mats.paint, 'floor');
  add(loft(floorSections), mats.primer, 'floorUnder');
  for (const side of [-1, 1]) {
    const sill = sweepProfile(
      [V(side * 0.78, 0.265, -0.86), V(side * 0.78, 0.265, 1.02)],
      roundRectSection(0.1, 0.1, 0.015),
    );
    add(sill, mats.paint, 'sill');
  }

  // ---------------------------------------------------------------- pillars and roof structure
  const inset = (p, d) => {
    const x = greenSideX(p[0], p[1]) - d;
    return x;
  };
  for (const side of [-1, 1]) {
    const aPts = DLO.filter(([z, y]) => y < 1.38 && z < 0.0).map(([z, y]) => V(side * inset([z, y], 0.035), y - 0.012, z + 0.03));
    add(sweepProfile(aPts, roundRectSection(0.05, 0.035, 0.01)), mats.paint, 'aPillar');
    const railPts = [];
    for (let z = -0.1; z <= 0.9; z += 0.05) railPts.push(V(side * (greenSideX(z, roofRailY.at(z)) - 0.04), roofRailY.at(z) - 0.012, z));
    add(sweepProfile(railPts, roundRectSection(0.06, 0.04, 0.012)), mats.paint, 'roofRail');
    const bz = LAYOUT.bSeam(0.8);
    const bTop = roofRailY.at(bz) - 0.02;
    const bPts = [V(side * 0.77, 0.3, bz), V(side * 0.785, 0.7, bz), V(side * (greenSideX(bz, 1.0) - 0.03), 1.0, bz - 0.005), V(side * (greenSideX(bz, bTop) - 0.035), bTop, bz - 0.01)];
    add(sweepProfile(bPts, roundRectSection(0.075, 0.03, 0.01)), mats.paint, 'bPillar');
    const cPts = DLO.filter(([z, y]) => z > 0.75 && y < 1.38).map(([z, y]) => V(side * inset([z, y], 0.04), y - 0.015, z - 0.03));
    add(sweepProfile(cPts, roundRectSection(0.07, 0.035, 0.01)), mats.paint, 'cPillar');
  }
  for (const z of [-0.14, 0.38, 0.82]) {
    const pts = [];
    for (let x = -0.62; x <= 0.62 + 1e-6; x += 0.08) pts.push(V(x, roofRailY.at(z) + 0.04 - 0.06 * (x / 0.62) ** 2 - 0.02, z));
    add(sweepProfile(pts, roundRectSection(0.05, 0.02, 0.006)), mats.paint, 'roofBow');
  }

  // ---------------------------------------------------------------- rear structure
  const trunkY = 0.39;
  const tf = [];
  for (let z = 1.3; z <= 2.14; z += 0.04) {
    const sec = [];
    for (let x = -0.72; x <= 0.72 + 1e-6; x += 0.06) {
      const r = Math.hypot(x, z - 1.78);
      const well = r < 0.34 ? -0.16 * Math.cos((r / 0.34) * Math.PI * 0.5) ** 0.6 : 0;
      sec.push(V(x, trunkY + well, z));
    }
    tf.push(sec);
  }
  add(loft(tf), mats.paint, 'trunkFloor');
  add(loft(tf, { flip: true }), mats.primer, 'trunkFloorUnder');
  // rear panel below the trunk opening
  const rp = [];
  for (let x = -0.7; x <= 0.7 + 1e-6; x += 0.07) {
    const ax = Math.abs(x);
    rp.push([V(x, trunkY, rearZ(ax, 0.45) - 0.04), V(x, 0.74, rearZ(ax, 0.74) - 0.03), V(x, 0.77, rearZ(ax, 0.77) - 0.06)]);
  }
  add(loft(rp, { flip: true }), mats.paint, 'rearPanel');
  // parcel shelf behind the rear seat
  const shelf = planarPanel(
    [
      [-0.66, 1.08],
      [0.66, 1.08],
      [0.6, 1.5],
      [-0.6, 1.5],
    ],
    (u, v, w, out) => out.set(u, beltY.at(v) + 0.0, v),
    { normal: V(0, 1, 0) },
  );
  add(shelf, mats.trimPlastic, 'parcelShelf');
  // seat back bulkhead between cabin and trunk
  const bh = planarPanel(
    [
      [-0.68, trunkY],
      [0.68, trunkY],
      [0.66, 1.03],
      [-0.66, 1.03],
    ],
    (u, v, w, out) => out.set(u, v, 1.3 - (v - trunkY) * 0.3),
    { normal: V(0, 0, 1) },
  );
  add(bh, mats.paint, 'rearBulkhead');

  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}
