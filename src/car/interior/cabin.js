import * as THREE from 'three';
import { doubleSided } from '../materials.js';
import { surfaceNets } from '../../geo/surfaceNets.js';
import { sdRoundBox, sdPolygon, smin } from '../../geo/sdf.js';
import { loft } from '../../geo/loft.js';
import { clipMesh } from '../../geo/clip.js';
import { MeshData } from '../../geo/meshData.js';
import { mesh, roundedBox, sweepProfile, roundRectSection, ellipseSection, latheY } from '../../geo/primitives.js';
import { FLOOR_Y } from '../body/structure.js';
import { FRONT_DOOR, REAR_DOOR, DLO, LAYOUT, roofRailY } from '../body/regions.js';
import { beltY, greenSideX } from '../body/shape.js';
import { topPoint } from '../body/surface.js';
import { speakerGrille } from '../../render/gaugeTextures.js';
import { buildDashboard, DRIVER_X } from './dashboard.js';
import { buildFrontSeatGeometry, buildRearBench, FRONT_SEAT } from './seats.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Everything inside the cabin. Returns { parts, doorCards, controls }: parts are separate
 * removable items (dashboard, seats...), door cards are attached to their doors by the model.
 */
export function buildCabin(mats) {
  const parts = {};
  const dash = buildDashboard(mats);
  parts.dashboard = dash.root;

  const seatProto = buildFrontSeatGeometry(mats);
  for (const [id, x] of [
    ['seat_FL', DRIVER_X],
    ['seat_FR', -DRIVER_X],
  ]) {
    const s = seatProto.clone();
    s.name = id;
    s.position.set(x, 0, FRONT_SEAT.z);
    if (x > 0) s.getObjectByName('buckle').position.x *= -1;
    if (x > 0) {
      const shroud = s.getObjectByName('seatShroud');
      shroud.position.x *= -1;
      s.getObjectByName('reclineLever').position.x *= -1;
    }
    parts[id] = s;
  }
  parts.rearSeat = buildRearBench(mats);

  const trim = new THREE.Group();
  trim.name = 'interiorTrim';
  parts.interiorTrim = trim;
  const add = (geo, mat, name, parent = trim) => {
    const m = mesh(geo, mat, { name });
    parent.add(m);
    return m;
  };

  // ---- carpet over the floor and tunnel
  const carpet = [];
  for (let z = -0.74; z <= 0.64; z += 0.04) {
    const kick = z > 0.5 ? Math.min((z - 0.5) / 0.08, 1) * 0.1 : 0;
    const tunnelH = Math.max(0.035, 0.15 - Math.max(z + 0.6, 0) * 0.08);
    const toe = z < -0.55 ? (-0.55 - z) * 1.2 : 0;
    const y = FLOOR_Y + 0.012 + kick + toe;
    carpet.push(
      [
        [-0.73, 0.07],
        [-0.69, 0.005],
        [-0.2, 0],
        [-0.12, tunnelH * 0.9],
        [0, tunnelH + 0.005],
        [0.12, tunnelH * 0.9],
        [0.2, 0],
        [0.69, 0.005],
        [0.73, 0.07],
      ].map(([x, dy]) => V(x, y + dy, z)),
    );
  }
  add(loft(carpet, { flip: true }), mats.carpet, 'carpet');
  // carpet continues up the toe board and the kick panels under the dash
  const toe = [];
  for (let x = -0.73; x <= 0.73 + 1e-6; x += 0.073) {
    const ax = Math.abs(x);
    const tunnel = ax < 0.2 ? 0.15 * Math.cos((ax / 0.2) * Math.PI * 0.5) : 0;
    toe.push([V(x, FLOOR_Y + 0.02 + 0.228 + tunnel, -0.745), V(x, 0.44 + tunnel * 0.5, -0.92), V(x, 0.6, -0.925)]);
  }
  add(loft(toe), mats.carpet, 'toeCarpet');
  for (const side of [-1, 1]) {
    const kick = [];
    for (let z = -0.93; z <= -0.74; z += 0.035) kick.push([V(side * 0.745, FLOOR_Y + 0.02, z), V(side * 0.745, 0.62, z)]);
    add(loft(kick, { flip: side > 0 }), mats.trimPlastic, 'kickPanel');
  }
  const matMat = mats.rubber;
  for (const [x, z, w, d] of [
    [DRIVER_X + 0.02, -0.42, 0.42, 0.5],
    [-DRIVER_X, -0.42, 0.42, 0.5],
    [-0.38, 0.45, 0.38, 0.28],
    [0.38, 0.45, 0.38, 0.28],
  ]) {
    const m = add(roundedBox(w, 0.008, d, 0.004), matMat, 'floorMat');
    m.position.set(x, FLOOR_Y + 0.022 + (z > 0.4 ? 0 : 0), z);
  }

  // ---- centre console: shifter, handbrake, cup holders, armrest
  const consoleField = (x, y, z) => {
    let d = sdRoundBox(x, y - 0.44, z + 0.08, 0.11, 0.08, 0.36, 0.03);
    d = smin(d, sdRoundBox(x, y - 0.555, z - 0.28, 0.1, 0.06, 0.17, 0.035), 0.03);
    for (const s of [-1, 1]) d = Math.max(d, -(Math.hypot(x - s * 0.045, z + 0.02) - 0.036) + Math.max(0, 0.5 - y) * 10 - 0.001);
    return Math.max(d, 0.32 - y);
  };
  const cons = surfaceNets(consoleField, { min: [-0.14, 0.3, -0.48], max: [0.14, 0.64, 0.48], cell: 0.012 });
  add(cons.toGeometry(), mats.trimPlastic, 'console');
  const boot = add(latheY([[0.045, 0], [0.05, 0.03], [0.035, 0.07], [0.012, 0.1]], 16), mats.leather, 'shiftBoot');
  boot.position.set(0, 0.52, -0.2);
  const shifter = new THREE.Group();
  shifter.name = 'shifter';
  shifter.position.set(0, 0.62, -0.2);
  add(new THREE.SphereGeometry(0.026, 16, 12), mats.leather, 'shiftKnob', shifter).scale.set(1, 1.15, 1);
  add(new THREE.CylinderGeometry(0.006, 0.006, 0.06, 8), mats.satinChrome, 'shiftStick', shifter).position.y = -0.03;
  trim.add(shifter);
  const hb = new THREE.Group();
  hb.name = 'handbrake';
  hb.position.set(0, 0.52, 0.03);
  add(sweepProfile([V(0, 0, 0.06), V(0, 0.02, -0.08), V(0, 0.045, -0.2)], roundRectSection(0.032, 0.026, 0.01)), mats.satinBlack, 'handbrakeLever', hb);
  add(new THREE.CylinderGeometry(0.007, 0.007, 0.012, 10).rotateX(Math.PI / 2), mats.satinChrome, 'handbrakeButton', hb).position.set(0, 0.045, -0.21);
  trim.add(hb);

  // ---- headliner, visors, mirror, dome light
  const hl = new MeshData();
  const nx = 32;
  const nz = 30;
  const ids = [];
  for (let j = 0; j <= nz; j++) {
    const row = [];
    for (let i = 0; i <= nx; i++) {
      const x = -0.66 + (1.32 * i) / nx;
      const z = -0.3 + (1.22 * j) / nz;
      const p = topPoint(x, z);
      if (!p) {
        row.push(-1);
        continue;
      }
      row.push(hl.addVertex(x, p.y - 0.034, z, 0, -1, 0));
    }
    ids.push(row);
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = ids[j][i];
      const b = ids[j][i + 1];
      const c = ids[j + 1][i + 1];
      const d = ids[j + 1][i];
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) hl.addQuad(a, b, c, d);
    }
  }
  hl.computeNormals();
  const railInner = (z) => greenSideX(z, roofRailY.at(z)) - 0.03;
  const headliner = clipMesh(hl, (x, y, z) => Math.max(Math.abs(x) - railInner(Math.min(Math.max(z, -0.25), 1.0)), -0.26 - z, z - 0.88));
  add(headliner.toGeometry(), mats.headliner, 'headliner');
  for (const s of [-1, 1]) {
    const visor = add(roundedBox(0.3, 0.018, 0.15, 0.008), mats.headliner, 'sunVisor');
    visor.position.set(s * 0.37, (topPoint(s * 0.37, -0.12)?.y ?? 1.38) - 0.05, -0.12);
    visor.rotation.x = 0.12;
  }
  const mirror = new THREE.Group();
  mirror.name = 'rearViewMirror';
  mirror.position.set(0, 1.295, -0.3);
  add(roundedBox(0.24, 0.065, 0.03, 0.014), mats.satinBlack, 'mirrorBody', mirror);
  const mg = add(new THREE.PlaneGeometry(0.22, 0.05), doubleSided(mats.chrome), 'mirrorGlass', mirror);
  mg.position.z = 0.0155;
  add(new THREE.CylinderGeometry(0.008, 0.01, 0.07, 10), mats.satinBlack, 'mirrorStem', mirror).position.set(0, 0.045, -0.02);
  mirror.rotation.x = -0.08;
  trim.add(mirror);
  const domeMat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, emissive: 0xfff1d6, emissiveIntensity: 0, roughness: 0.4 });
  const domeY = (topPoint(0, 0.1)?.y ?? 1.43) - 0.036;
  const dome = add(roundedBox(0.14, 0.012, 0.07, 0.005), domeMat, 'domeLight');
  dome.position.set(0, domeY - 0.005, 0.1);
  const domeFrame = add(roundedBox(0.16, 0.008, 0.09, 0.004), mats.lightTrim, 'domeFrame');
  domeFrame.position.set(0, domeY - 0.001, 0.1);

  // ---- pillar trims (A, B, C) and sills
  for (const side of [-1, 1]) {
    const inset = (z, y, d) => greenSideX(z, y) - d;
    const aPts = DLO.filter(([z, y]) => y > 0.99 && y < 1.37 && z < 0.0).map(([z, y]) => V(side * inset(z, y, 0.06), y - 0.02, z + 0.045));
    add(sweepProfile(aPts, roundRectSection(0.075, 0.02, 0.009), { up: V(side, 0.4, 0) }), mats.lightTrim, 'aPillarTrim');
    const bz = LAYOUT.bSeam(0.9) - 0.01;
    const bPts = [];
    for (let y = 0.95; y <= roofRailY.at(bz) - 0.04; y += 0.05) bPts.push(V(side * (greenSideX(bz, Math.max(y, beltY.at(bz) + 0.01)) - 0.075), y, bz));
    add(sweepProfile(bPts, roundRectSection(0.11, 0.03, 0.012), { up: V(side, 0, 0) }), mats.lightTrim, 'bPillarTrim');
    const lowB = [V(side * 0.745, 0.3, bz), V(side * 0.75, 0.96, bz)];
    add(sweepProfile(lowB, roundRectSection(0.1, 0.035, 0.012), { up: V(side, 0, 0) }), mats.trimPlastic, 'bPillarLower');
    const cPts = DLO.filter(([z, y]) => z > 0.8 && y < 1.36 && y > 1.1).map(([z, y]) => V(side * inset(z, y, 0.07), y - 0.02, z - 0.06));
    add(sweepProfile(cPts, roundRectSection(0.12, 0.022, 0.01), { up: V(side, 0.3, 0) }), mats.lightTrim, 'cPillarTrim');
    // belt: stowed strap down the B-pillar
    add(sweepProfile([V(side * 0.72, 1.2, bz + 0.03), V(side * 0.72, 0.8, bz + 0.035), V(side * 0.71, 0.36, bz + 0.05)], roundRectSection(0.045, 0.004, 0.0015), { up: V(side, 0, 0) }), mats.satinBlack, 'seatbelt');
    const anchor = add(roundedBox(0.015, 0.06, 0.04, 0.006), mats.satinChrome, 'beltAnchor');
    anchor.position.set(side * 0.725, 1.2, bz + 0.03);
    // sill scuff plates
    const scuff = add(roundedBox(0.07, 0.006, 0.95, 0.003), mats.satinChrome, 'scuffPlate');
    scuff.position.set(side * 0.79, 0.322, -0.28);
    const scuffR = add(roundedBox(0.07, 0.006, 0.52, 0.003), mats.satinChrome, 'scuffPlate');
    scuffR.position.set(side * 0.79, 0.322, 0.66);
  }
  // parcel shelf speakers
  const grille = new THREE.MeshStandardMaterial({ map: speakerGrille(), roughness: 0.8 });
  for (const s of [-1, 1]) {
    const sp = add(new THREE.CircleGeometry(0.075, 24).rotateX(-Math.PI / 2), grille, 'shelfSpeaker');
    sp.scale.set(1.3, 1, 1);
    sp.position.set(s * 0.42, beltY.at(1.32) + 0.004, 1.32);
  }

  // ---- door cards
  const doorCards = {};
  for (const [s, side] of [
    ['L', -1],
    ['R', 1],
  ]) {
    doorCards[`frontDoor_${s}`] = buildDoorCard(mats, 'front', side);
    doorCards[`rearDoor_${s}`] = buildDoorCard(mats, 'rear', side);
  }

  trim.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return {
    parts,
    doorCards,
    controls: { ...dash.controls, domeMaterial: domeMat, shifter, handbrake: hb },
  };
}

/** Door trim panel: moulded card with armrest, pull cup, release handle, speaker and pocket. */
function buildDoorCard(mats, door, side) {
  const g = new THREE.Group();
  g.name = `${door}DoorCard`;
  const outline = door === 'front' ? FRONT_DOOR : REAR_DOOR;
  const zMin = door === 'front' ? -0.79 : LAYOUT.bSeam(0.5) + 0.02;
  const zMax = door === 'front' ? LAYOUT.bSeam(0.5) - 0.02 : 1.08;
  const planeX = door === 'front' ? 0.748 : 0.752;
  const cardField = (x, y, z) => {
    const lx = side * x;
    const inOutline = sdPolygon(z, y, outline) + 0.028;
    const belt = y - (beltY.at(z) + 0.005);
    let d = Math.max(Math.abs(lx - planeX + 0.012) - 0.014, inOutline, belt, 0.31 - y);
    // armrest and pull cup
    const arm = sdRoundBox(lx - planeX + 0.045, y - 0.66, z - (zMin + zMax) / 2 - 0.02, 0.035, 0.03, (zMax - zMin) * 0.36, 0.02);
    d = smin(d, arm, 0.03);
    // upper sill pad
    d = smin(d, sdRoundBox(lx - planeX + 0.02, y - beltY.at(z) + 0.035, z - (zMin + zMax) / 2, 0.02, 0.03, (zMax - zMin) * 0.46, 0.015), 0.02);
    // map pocket along the bottom
    d = smin(d, sdRoundBox(lx - planeX + 0.04, y - 0.4, z - (zMin + zMax) / 2 + 0.05, 0.015, 0.06, (zMax - zMin) * 0.32, 0.012), 0.015);
    return d;
  };
  const x0 = side > 0 ? 0.62 : -0.8;
  const x1 = side > 0 ? 0.8 : -0.62;
  const card = surfaceNets(cardField, { min: [x0, 0.28, zMin - 0.05], max: [x1, 1.1, zMax + 0.05], cell: 0.014 });
  const split = card.partition((x, y) => (y > 0.74 ? 'upper' : 'lower'));
  if (split.get('upper')) g.add(mesh(split.get('upper').toGeometry(), mats.dashPlastic, { name: 'doorCardUpper' }));
  if (split.get('lower')) g.add(mesh(split.get('lower').toGeometry(), mats.trimPlastic, { name: 'doorCardLower' }));
  const insert = mesh(new THREE.PlaneGeometry((zMax - zMin) * 0.7, 0.1), mats.fabricInsert, { name: 'doorInsert', cast: false });
  insert.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  insert.position.set(side * (planeX - 0.027), 0.77, (zMin + zMax) / 2 + 0.03);
  g.add(insert);
  const handle = mesh(roundedBox(0.012, 0.022, 0.09, 0.006), mats.satinChrome, { name: 'innerHandle' });
  handle.position.set(side * (planeX - 0.03), 0.84, zMin + 0.16);
  g.add(handle);
  const sp = mesh(new THREE.CircleGeometry(0.065, 24), new THREE.MeshStandardMaterial({ map: speakerGrille(), roughness: 0.8 }), { name: 'doorSpeaker', cast: false });
  sp.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  sp.position.set(side * (planeX - 0.027), 0.47, zMin + 0.13);
  g.add(sp);
  if (door === 'front') {
    const pack = mesh(roundedBox(0.05, 0.012, 0.11, 0.005), mats.satinBlack, { name: 'windowSwitches' });
    pack.position.set(side * (planeX - 0.05), 0.695, zMin + 0.42);
    g.add(pack);
  }
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}
