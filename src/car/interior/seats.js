import * as THREE from 'three';
import { surfaceNets } from '../../geo/surfaceNets.js';
import { sdRoundBox, smin, smax } from '../../geo/sdf.js';
import { mesh, roundedBox } from '../../geo/primitives.js';

/**
 * Seats built from implicit padded shapes: sculpted bolsters, a softer centre insert and a
 * separate headrest on steel posts. Front seats share one geometry (mirrored by position only).
 */
export const FRONT_SEAT = { z: 0.06, recline: 0.38 };
export const REAR_SEAT = { z: 0.86 };

const CUSHION_Y = 0.405;

function cushionField(x, y, z) {
  const lz = z - 0.0;
  const ax = Math.abs(x);
  const frontLift = Math.max(0, -lz - 0.05) * 0.18;
  let d = sdRoundBox(x, y - CUSHION_Y - 0.055 - frontLift * 0.5, lz, 0.25, 0.058 + frontLift * 0.5, 0.25, 0.045);
  // side bolsters
  const bol = sdRoundBox(ax - 0.205, y - CUSHION_Y - 0.085, lz + 0.02, 0.05, 0.05, 0.22, 0.045);
  d = smin(d, bol, 0.035);
  // gentle hollow for the occupant
  d = smax(d, -(Math.hypot(x / 1.4, (y - CUSHION_Y - 0.2) * 1.3, (lz + 0.02) / 1.6) - 0.1), 0.05);
  return d;
}

function backField(x, u, w) {
  // u = up along the back from the pivot, w = forward (towards the occupant)
  const ax = Math.abs(x);
  const taper = 1 - 0.14 * Math.max(0, (u - 0.3) / 0.35);
  let d = sdRoundBox(x / taper, u - 0.33, w + 0.02, 0.25, 0.32, 0.055, 0.045);
  const bol = sdRoundBox(ax - 0.215 * taper, u - 0.26, w - 0.025, 0.045, 0.24, 0.05, 0.04);
  d = smin(d, bol, 0.04);
  // lumbar support
  d = smin(d, sdRoundBox(x, u - 0.16, w - 0.015, 0.15, 0.07, 0.03, 0.03), 0.05);
  return d;
}

/** Front seat group; origin at the seat's centre line on the floor, facing -Z. */
export function buildFrontSeatGeometry(mats) {
  const g = new THREE.Group();
  g.name = 'seat';
  const cushion = surfaceNets(cushionField, { min: [-0.3, 0.33, -0.3], max: [0.3, 0.6, 0.3], cell: 0.009 });
  const cParts = cushion.partition((x, y) => (Math.abs(x) < 0.15 && y > CUSHION_Y + 0.07 ? 'insert' : 'side'));
  g.add(mesh(cParts.get('side').toGeometry(), mats.fabric, { name: 'cushion' }));
  if (cParts.get('insert')) g.add(mesh(cParts.get('insert').toGeometry(), mats.fabricInsert, { name: 'cushionInsert' }));

  // backrest in a reclined frame
  const back = new THREE.Group();
  back.name = 'backrest';
  back.position.set(0, CUSHION_Y + 0.07, 0.24);
  back.rotation.x = FRONT_SEAT.recline;
  const backMesh = surfaceNets((x, y, z) => backField(x, y, -z), { min: [-0.3, -0.02, -0.12], max: [0.3, 0.7, 0.12], cell: 0.009 });
  const bParts = backMesh.partition((x, y, z) => (Math.abs(x) < 0.15 && z < -0.05 && y > 0.08 && y < 0.58 ? 'insert' : 'side'));
  back.add(mesh(bParts.get('side').toGeometry(), mats.fabric, { name: 'back' }));
  if (bParts.get('insert')) back.add(mesh(bParts.get('insert').toGeometry(), mats.fabricInsert, { name: 'backInsert' }));
  // headrest on two posts
  const hr = surfaceNets((x, y, z) => sdRoundBox(x, y - 0.8, z - 0.005, 0.125, 0.085, 0.05, 0.04), { min: [-0.15, 0.7, -0.07], max: [0.15, 0.9, 0.07], cell: 0.008 });
  back.add(mesh(hr.toGeometry(), mats.fabric, { name: 'headrest' }));
  for (const s of [-1, 1]) {
    const post = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 8), mats.chrome, { name: 'headrestPost' });
    post.position.set(s * 0.07, 0.68, 0.0);
    back.add(post);
  }
  g.add(back);

  // plastic side shroud, rails, recline lever, belt buckle stalk
  for (const s of [-1, 1]) {
    const rail = mesh(new THREE.BoxGeometry(0.03, 0.03, 0.62), mats.steel, { name: 'seatRail' });
    rail.position.set(s * 0.18, 0.255, -0.02);
    g.add(rail);
  }
  const base = mesh(roundedBox(0.44, 0.12, 0.46, 0.02), mats.satinBlack, { name: 'seatBase' });
  base.position.set(0, 0.33, 0.0);
  g.add(base);
  const shroud = mesh(roundedBox(0.02, 0.1, 0.4, 0.01), mats.trimPlastic, { name: 'seatShroud' });
  shroud.position.set(-0.255, 0.4, 0.02);
  g.add(shroud);
  const lever = mesh(roundedBox(0.012, 0.03, 0.12, 0.006), mats.satinBlack, { name: 'reclineLever' });
  lever.position.set(-0.268, 0.43, 0.12);
  g.add(lever);
  const buckle = new THREE.Group();
  buckle.name = 'buckle';
  const stalk = mesh(new THREE.BoxGeometry(0.02, 0.14, 0.012), mats.satinBlack, { name: 'buckleStalk' });
  stalk.position.y = 0.07;
  buckle.add(stalk);
  const head = mesh(roundedBox(0.03, 0.055, 0.022, 0.006), mats.blackPlastic, { name: 'buckleHead' });
  head.position.y = 0.16;
  buckle.add(head);
  buckle.position.set(0.27, 0.36, 0.16);
  buckle.rotation.x = -0.3;
  g.add(buckle);
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

/** Rear bench: contoured cushion and backrest with two outer headrests. */
export function buildRearBench(mats) {
  const g = new THREE.Group();
  g.name = 'rearSeat';
  const cy = 0.43;
  const cushion = (x, y, z) => {
    const lz = z - REAR_SEAT.z;
    let d = sdRoundBox(x, y - cy - 0.06, lz, 0.64, 0.065, 0.22, 0.05);
    for (const s of [-1, 1]) d = smax(d, -(Math.hypot((x - s * 0.34) / 1.8, (y - cy - 0.21) * 1.4, lz / 1.5) - 0.1), 0.04);
    return d;
  };
  const cm = surfaceNets(cushion, { min: [-0.7, cy - 0.03, REAR_SEAT.z - 0.26], max: [0.7, cy + 0.17, REAR_SEAT.z + 0.26], cell: 0.011 });
  g.add(mesh(cm.toGeometry(), mats.fabric, { name: 'rearCushion' }));
  const back = new THREE.Group();
  back.name = 'rearBack';
  back.position.set(0, cy + 0.08, REAR_SEAT.z + 0.24);
  back.rotation.x = 0.44;
  const bf = (x, u, w) => {
    let d = sdRoundBox(x, u - 0.27, w, 0.64, 0.27, 0.05, 0.045);
    for (const s of [-1, 1]) d = smin(d, sdRoundBox(x - s * 0.34, u - 0.24, w - 0.02, 0.2, 0.18, 0.03, 0.03), 0.05);
    return d;
  };
  const bm = surfaceNets((x, y, z) => bf(x, y, -z), { min: [-0.7, -0.02, -0.08], max: [0.7, 0.58, 0.1], cell: 0.011 });
  back.add(mesh(bm.toGeometry(), mats.fabric, { name: 'rearBackrest' }));
  for (const s of [-1, 1]) {
    const hr = surfaceNets((x, y, z) => sdRoundBox(x, y, z, 0.11, 0.06, 0.045, 0.035), { min: [-0.13, -0.08, -0.06], max: [0.13, 0.08, 0.06], cell: 0.008 });
    const h = mesh(hr.toGeometry(), mats.fabric, { name: 'rearHeadrest' });
    h.position.set(s * 0.34, 0.6, 0.0);
    back.add(h);
  }
  g.add(back);
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}
