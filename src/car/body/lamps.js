import * as THREE from 'three';
import { latheY, mesh } from '../../geo/primitives.js';

/**
 * Lamp internals behind the headlight and tail-light lenses: chrome reflector bowls, a projector
 * module, bulbs, a daytime-running light guide and indicator chambers. Emitting parts use the
 * shared lamp materials in `mats.lamps`, which the car's light controller drives at runtime.
 */

/** Lens frame: centroid, mean outward normal and the long axis of the lens patch. */
function lensFrame(skin) {
  const n = skin.vertexCount;
  const v = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    centroid.add(skin.getPos(i, v));
    normal.add(skin.getNormal(i, v));
  }
  centroid.divideScalar(n);
  normal.normalize();
  let axis = new THREE.Vector3(1, 0, 0);
  for (let it = 0; it < 24; it++) {
    const acc = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      skin.getPos(i, v).sub(centroid);
      acc.addScaledVector(v, v.dot(axis));
    }
    axis = acc.normalize();
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const t = skin.getPos(i, v).sub(centroid).dot(axis);
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
  }
  return { centroid, normal, axis, lo, hi };
}

/** Mean lens point, normal and local height of the band of lens vertices around axis position t. */
function sampleLens(skin, frame, t, band = 0.035) {
  const v = new THREE.Vector3();
  const p = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const side = new THREE.Vector3().crossVectors(frame.normal, frame.axis).normalize();
  let count = 0;
  let sLo = Infinity;
  let sHi = -Infinity;
  for (let i = 0; i < skin.vertexCount; i++) {
    skin.getPos(i, v);
    const rel = v.clone().sub(frame.centroid);
    if (Math.abs(rel.dot(frame.axis) - t) > band) continue;
    p.add(v);
    nrm.add(skin.getNormal(i, new THREE.Vector3()));
    const s = rel.dot(side);
    sLo = Math.min(sLo, s);
    sHi = Math.max(sHi, s);
    count++;
  }
  if (!count) return null;
  return { p: p.divideScalar(count), n: nrm.normalize(), height: sHi - sLo };
}

/** Paraboloid reflector bowl opening towards local +Y (lathe), radius r, depth d. */
function bowl(r, d, seg = 28) {
  const prof = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    prof.push([Math.max(r * u, 0.0005), -d + d * u * u]);
  }
  return latheY(prof, seg);
}

/** Orients a Y-up part so +Y points along `dir`, placed at `at`. */
function place(obj, at, dir) {
  obj.position.copy(at);
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return obj;
}

function reflectorModule(mats, r, depth, bulbMat, name) {
  const g = new THREE.Group();
  g.name = name;
  const b = mesh(bowl(r, depth), mats.reflector, { name: `${name}_bowl`, cast: false });
  g.add(b);
  const ring = mesh(new THREE.TorusGeometry(r, 0.0025, 6, 28).rotateX(Math.PI / 2), mats.satinChrome, { name: `${name}_ring`, cast: false });
  g.add(ring);
  const bulb = mesh(new THREE.SphereGeometry(r * 0.2, 12, 8), bulbMat, { name: `${name}_bulb`, cast: false });
  bulb.position.y = -depth * 0.55;
  g.add(bulb);
  const shield = mesh(new THREE.SphereGeometry(r * 0.24, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mats.satinChrome, { name: `${name}_cap`, cast: false });
  shield.position.y = -depth * 0.35;
  g.add(shield);
  return g;
}

function projectorModule(mats, r, name) {
  const g = new THREE.Group();
  g.name = name;
  const barrel = mesh(new THREE.CylinderGeometry(r * 1.02, r * 0.9, r * 1.6, 24, 1, true).translate(0, -r * 0.8, 0), mats.satinBlack, { name: `${name}_barrel`, cast: false });
  barrel.material = barrel.material.clone();
  barrel.material.side = THREE.DoubleSide;
  g.add(barrel);
  const lens = mesh(new THREE.SphereGeometry(r, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.32).translate(0, -r * 0.86, 0), mats.lamps.projector, { name: `${name}_lens`, cast: false });
  g.add(lens);
  const ring = mesh(new THREE.TorusGeometry(r * 1.03, 0.003, 6, 32).rotateX(Math.PI / 2), mats.chrome, { name: `${name}_ring`, cast: false });
  ring.position.y = -r * 0.02;
  g.add(ring);
  const back = mesh(bowl(r * 1.1, r * 1.4), mats.reflector, { name: `${name}_back`, cast: false });
  back.position.y = -r * 1.5;
  g.add(back);
  return g;
}

/** Light guide following the lower edge of the lens, just inside it. */
function lightGuide(skin, frame, mats, from, to, drop, name) {
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const t = from + ((to - from) * i) / 6;
    const s = sampleLens(skin, frame, t, 0.05);
    if (!s) continue;
    const down = new THREE.Vector3().crossVectors(frame.axis, s.n).normalize();
    pts.push(s.p.clone().addScaledVector(s.n, -0.022).addScaledVector(down, s.height * drop));
  }
  if (pts.length < 3) return null;
  const curve = new THREE.CatmullRomCurve3(pts);
  return mesh(new THREE.TubeGeometry(curve, 40, 0.0045, 8, false), mats.lamps.drl, { name, cast: false });
}

export function buildHeadlightInternals(skin, mats, sign) {
  const g = new THREE.Group();
  g.name = 'headlightInternals';
  const frame = lensFrame(skin);
  // lens axis runs from the inner nose (-t) to the outer fender end (+t)
  if (frame.axis.x * sign < 0) frame.axis.negate();
  const forward = new THREE.Vector3(0, 0, -1);
  const span = frame.hi - frame.lo;
  const at = (u, depth) => {
    const s = sampleLens(skin, frame, frame.lo + span * u);
    return s && { ...s, c: s.p.clone().addScaledVector(s.n, -depth) };
  };
  const proj = at(0.2, 0.05);
  if (proj) {
    const r = Math.min(0.03, proj.height * 0.42);
    g.add(place(projectorModule(mats, r, 'lowBeam'), proj.c, forward));
  }
  const high = at(0.42, 0.048);
  if (high) {
    const r = Math.min(0.03, high.height * 0.4);
    g.add(place(reflectorModule(mats, r, r * 0.9, mats.lamps.high, 'highBeam'), high.c, forward));
  }
  const turn = at(0.66, 0.04);
  if (turn) {
    const r = Math.min(0.024, turn.height * 0.36);
    g.add(place(reflectorModule(mats, r, r * 0.8, mats.lamps.turn, 'turnSignal'), turn.c, forward));
  }
  const guide = lightGuide(skin, frame, mats, frame.lo + span * 0.06, frame.lo + span * 0.8, 0.3, 'drl');
  if (guide) g.add(guide);
  return g;
}

export function buildTaillightInternals(skin, mats, sign) {
  const g = new THREE.Group();
  g.name = 'taillightInternals';
  const frame = lensFrame(skin);
  if (frame.axis.x * sign < 0) frame.axis.negate();
  const back = new THREE.Vector3(0, 0, 1);
  const span = frame.hi - frame.lo;
  const at = (u, depth) => {
    const s = sampleLens(skin, frame, frame.lo + span * u);
    return s && { ...s, c: s.p.clone().addScaledVector(s.n, -depth) };
  };
  // inner chamber: reverse lamp; middle: brake/tail ring; outer: indicator
  const slots = [
    [0.2, mats.lamps.reverse, 'reverse', 0.36],
    [0.47, mats.lamps.brake, 'brake', 0.44],
    [0.74, mats.lamps.turnRear, 'turnSignalRear', 0.36],
  ];
  for (const [u, bulb, name, k] of slots) {
    const s = at(u, 0.032);
    if (!s) continue;
    const r = Math.min(0.034, s.height * k);
    const m = reflectorModule(mats, r, r * 0.7, bulb, name);
    g.add(place(m, s.c, back));
    if (name === 'brake') {
      const ring = mesh(new THREE.TorusGeometry(r * 0.72, 0.004, 8, 32).rotateX(Math.PI / 2), mats.lamps.tail, { name: 'tailRing', cast: false });
      ring.position.y = -r * 0.2;
      m.add(ring);
    }
  }
  return g;
}
