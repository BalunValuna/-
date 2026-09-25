import * as THREE from 'three';
import { cutSkin, glassPane, lateralIn, SIDES, ROLL, GAP } from './panels.js';
import { hemPanel, sweepLoop, flangeDir } from '../../geo/hem.js';
import { MeshData, boundaryLoops } from '../../geo/meshData.js';
import { loopFrames, triangulateLoop } from '../../geo/loops.js';
import { beltY } from './shape.js';
import { LAYOUT } from './regions.js';
import { buildDetails, buildDoorDetails } from './details.js';
import { buildTrunkTrim, innerFrame } from './trims.js';

const CUT = GAP / 2 + ROLL;
const DOOR_STEP = 0.02;
const DOOR_STEP_B = 0.032;
const JAMB_GAP = 0.005;

export function toMesh(md, material, name = '', { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(md.toGeometry(), material);
  m.name = name;
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/** Wraps `object` in a pivot placed at `hinge` so it can rotate about `axis`. */
export function makeHinged(object, hinge, axis, openAngle) {
  const pivot = new THREE.Group();
  pivot.name = `${object.name}_pivot`;
  pivot.position.copy(hinge);
  object.position.sub(hinge);
  pivot.add(object);
  pivot.userData.hinge = { axis: axis.clone().normalize(), open: openAngle, amount: 0 };
  return pivot;
}

export function setHinge(pivot, amount) {
  const h = pivot.userData.hinge;
  h.amount = amount;
  pivot.quaternion.setFromAxisAngle(h.axis, h.open * amount);
}

const nearBSeam = (p) => Math.abs(p.z - LAYOUT.bSeam(p.y)) < 0.035;
const aboveBelt = (p, margin = 0) => p.y > beltY.at(p.z) + margin;

/** Stepped door edge: roll, short flange, step under the skin, deep shut face. */
function doorProfile(p) {
  if (aboveBelt(p, 0.012)) return [[0, 0.012], [-0.003, 0.014], [-0.003, 0.032]];
  const step = nearBSeam(p) ? DOOR_STEP_B : DOOR_STEP;
  return [[0, 0.012], [-step, 0.016], [-step, 0.096]];
}

function doorStepAt(p) {
  if (aboveBelt(p, 0.012)) return 0.003;
  return nearBSeam(p) ? DOOR_STEP_B : DOOR_STEP;
}

/**
 * Builds the painted body: shell, bolt-on panels, doors with jambs, glass and light lenses.
 * @returns {{ parts: Record<string, THREE.Object3D>, pivots: Record<string, THREE.Object3D>, stats: object }}
 */
export function buildBody(mats) {
  const t0 = performance.now();
  const { skins, cellMs } = cutSkin();
  const tCut = performance.now() - t0;
  const parts = {};
  const pivots = {};
  let triangles = 0;

  const add = (group, md, material, name) => {
    if (!md || md.triangleCount === 0) return;
    triangles += md.triangleCount;
    group.add(toMesh(md, material, name));
  };
  const group = (name) => {
    const g = new THREE.Group();
    g.name = name;
    return g;
  };

  const panel = (id, outerMat, opts = {}, innerMat = mats.paintInner) => {
    const g = group(id);
    const { outer, inner } = hemPanel(skins[id], { roll: ROLL, depth: 0.018, thickness: 0.0012, ...opts });
    add(g, outer, outerMat, id);
    add(g, inner, innerMat, `${id}_inner`);
    parts[id] = g;
    return g;
  };

  // ---- body shell and simple panels
  {
    // body shell: paint on top, underbody coating on the downward-facing underside
    const g = group('body');
    const { outer, inner } = hemPanel(skins.body, { roll: ROLL, depth: 0.02, thickness: 0.0012 });
    const N = outer.normals;
    const idx = outer.indices;
    const split = outer.partition((x, y, z, t) => {
      const ny = (N[idx[t * 3] * 3 + 1] + N[idx[t * 3 + 1] * 3 + 1] + N[idx[t * 3 + 2] * 3 + 1]) / 3;
      return y < 0.3 && ny < -0.55 ? 'under' : 'paint';
    });
    add(g, split.get('paint'), mats.paint, 'body');
    add(g, split.get('under'), mats.underbody, 'underbody');
    add(g, inner, mats.paintInner, 'body_inner');
    parts.body = g;
  }
  panel('liner', mats.blackPlastic, { depth: 0.012, thickness: 0.002 }, mats.blackPlastic);
  panel('cowl', mats.blackPlastic, { depth: 0.02, thickness: 0.002 }, mats.blackPlastic);
  panel('frontBumper', mats.paint, { depth: 0.03, thickness: 0.003 }, mats.blackPlastic);
  panel('rearBumper', mats.paint, { depth: 0.03, thickness: 0.003 }, mats.blackPlastic);
  for (const [s] of SIDES) panel(`fender_${s}`, mats.paint, { depth: 0.018 });
  panel('rearDiffuser', mats.blackPlastic, { depth: 0.02, thickness: 0.002 }, mats.blackPlastic);
  for (const [s] of SIDES) panel(`rearReflector_${s}`, mats.reflectorRed, { depth: 0.006, thickness: 0 });
  const hood = panel('hood', mats.paint, { depth: 0.022 });
  const trunk = panel('trunk', mats.paint, { depth: 0.022 });
  const fuel = panel('fuelDoor', mats.paint, { depth: 0.008 });

  // ---- doors: stepped shut faces, inner panel, jamb in the body
  const jambs = group('jambs');
  for (const [s, sign] of SIDES) {
    for (const door of ['front', 'rear']) {
      const id = `${door}Door_${s}`;
      const skin = skins[id];
      const g = group(id);
      const { outer, inner, ends } = hemPanel(skin, {
        roll: ROLL,
        thickness: 0.0012,
        dir: lateralIn,
        perLoop: ({ index }) =>
          index === 0
            ? { profile: doorProfile }
            : { profile: (p) => (aboveBelt(p, 0.02) ? [[0, 0.03], [0, 0.031], [0, 0.032]] : [[0, 0.03], [-0.001, 0.06], [-0.001, 0.096]]) },
      });
      // gloss black cover on the B-pillar part of the window frame
      const split = outer.partition((x, y, z) =>
        y > beltY.at(z) + 0.006 && Math.abs(z - LAYOUT.bSeam(y)) < 0.05 ? 'pillar' : 'paint',
      );
      add(g, split.get('paint'), mats.paint, id);
      add(g, split.get('pillar'), mats.glossBlack, `${id}_pillar`);
      add(g, inner, mats.paintInner, `${id}_inner`);
      add(g, doorInnerPanel(ends, sign), mats.paintInner, `${id}_innerPanel`);
      g.add(buildDoorDetails(mats, door, sign));
      parts[id] = g;
      add(jambs, twoSided(doorJamb(skin), 0.0012), mats.paint, `${id}_jamb`);
      const hingeZ = door === 'front' ? -0.8 : LAYOUT.bSeam(0.6) + 0.03;
      const hinge = new THREE.Vector3(sign * 0.8, 0.6, hingeZ);
      pivots[id] = makeHinged(g, hinge, new THREE.Vector3(0, 1, 0), sign * 1.15);
    }
  }
  parts.jambs = jambs;

  // closure inner frames
  add(hood, innerFrame(skins.hood, { offset: 0.032, band: 0.09, ribs: (x, y, z) => Math.min(Math.abs(x) - 0.035, Math.abs(z + 1.45) - 0.03) }), mats.paintInner, 'hoodFrame');
  add(trunk, innerFrame(skins.trunk, { offset: 0.028, band: 0.075, ribs: (x) => Math.abs(x) - 0.03 }), mats.paintInner, 'trunkFrame');
  parts.trunkTrim = buildTrunkTrim(mats);

  pivots.hood = makeHinged(hood, new THREE.Vector3(0, 0.955, -1.02), new THREE.Vector3(1, 0, 0), 1.05);
  pivots.trunk = makeHinged(trunk, new THREE.Vector3(0, 1.1, 1.665), new THREE.Vector3(1, 0, 0), -1.1);
  pivots.fuelDoor = makeHinged(fuel, new THREE.Vector3(0.85, 0.905, 1.702), new THREE.Vector3(0, 1, 0), 1.4);

  // ---- trims placed on the skin
  const details = buildDetails(mats);
  parts.frontBumper.add(details.front);
  const plateGroup = new THREE.Group();
  plateGroup.name = 'rearTrims';
  for (const child of [...details.rear.children]) {
    if (child.name === 'exhaustTip' || child.name === 'exhaustInner') parts.body.add(child);
    else plateGroup.add(child);
  }
  trunk.add(plateGroup);
  for (const child of [...details.top.children]) (child.name === 'antenna' ? parts.body : parts.cowl).add(child);

  // ---- glass
  const glassIds = ['windshield', 'rearWindow', 'quarterGlass_L', 'quarterGlass_R'];
  for (const id of glassIds) {
    const g = group(id);
    const { pane, frit } = glassPane(skins[id], { fritWidth: id.startsWith('quarter') ? 0.018 : 0.05 });
    add(g, pane, id === 'rearWindow' || id.startsWith('quarter') ? mats.tintedGlass : mats.glass, id);
    add(g, frit, mats.frit, `${id}_frit`);
    g.children.forEach((m) => (m.userData.glass = m.material.transparent));
    parts[id] = g;
  }
  for (const [s] of SIDES) {
    for (const door of ['front', 'rear']) {
      const id = `${door}DoorGlass_${s}`;
      const g = group(id);
      const { pane } = glassPane(skins[id], { recess: 0.012, fritWidth: 0.0 });
      add(g, pane, door === 'rear' ? mats.tintedGlass : mats.glass, id);
      g.children.forEach((m) => (m.userData.glass = true));
      parts[`${door}Door_${s}`].add(g);
    }
  }

  // ---- light lenses with a simple housing (detailed internals come from lights.js)
  for (const [s] of SIDES) {
    for (const kind of ['headlight', 'taillight']) {
      const id = `${kind}_${s}`;
      parts[id] = lampShell(skins[id], mats, kind, id, (m) => (triangles += m.triangleCount));
    }
  }

  return {
    parts,
    pivots,
    stats: { cutMs: Math.round(tCut), netsMs: Math.round(cellMs), buildMs: Math.round(performance.now() - t0), triangles },
  };
}

/** Closes the door box at the shut-face depth (the inner metal panel behind the door card). */
function doorInnerPanel(ends, sign) {
  const outerEnd = ends.find((e) => e.index === 0);
  const holeEnd = ends.find((e) => e.index === 1);
  const md = new MeshData();
  if (!outerEnd) return md;
  const toV2 = (p) => new THREE.Vector2(p.z, p.y);
  const contour = outerEnd.points.map(toV2);
  const holes = holeEnd ? [holeEnd.points.map(toV2)] : [];
  const all = [...outerEnd.points, ...(holeEnd ? holeEnd.points : [])];
  const tris = THREE.ShapeUtils.triangulateShape(contour, holes);
  const n = new THREE.Vector3(-sign, 0, 0); // faces the cabin
  for (const p of all) md.addVertex(p.x, p.y, p.z, n.x, n.y, n.z);
  // Winding: facing the cabin means clockwise in (z, y) for the right side seen from inside.
  const cw = THREE.ShapeUtils.isClockWise(contour);
  for (const [a, b, c] of tris) {
    const flip = (sign > 0) === cw;
    if (flip) md.addTri(a, c, b);
    else md.addTri(a, b, c);
  }
  return md;
}

/** Door opening jamb in the body: follows the door outline, just outside the door's shut face. */
function doorJamb(skin) {
  const loops = boundaryLoops(skin).sort((a, b) => b.length - a.length);
  const f = loopFrames(skin, loops[0], { smooth: 3 });
  const frames = [];
  for (let k = 0; k < f.n; k++) {
    const P = f.P[k];
    const D = flangeDir(P, f.N[k], f.T[k], lateralIn);
    const B = f.B[k].clone().addScaledVector(D, -f.B[k].dot(D)).normalize();
    const step = doorStepAt(P);
    const origin = P.clone().addScaledVector(B, -(step - JAMB_GAP - ROLL));
    frames.push({ P: origin, B, D, T: f.T[k], reach: step - JAMB_GAP + 2 * CUT + 0.004, deep: aboveBelt(P, 0.012) ? 0.05 : 0.108 });
  }
  // one profile per loop: reach/deep vary per frame, so sweep with per-frame profiles
  const md = new MeshData();
  const rows = frames.map(({ P, B, D, T, reach, deep }) => {
    const prof = [
      [reach, 0.017],
      [0, 0.017],
      [0, deep],
      [-0.016, deep],
    ];
    return prof.map(([b, d], s) => {
      const p = P.clone().addScaledVector(B, b).addScaledVector(D, d);
      const a = prof[Math.max(s - 1, 0)];
      const c = prof[Math.min(s + 1, prof.length - 1)];
      const sb = c[0] - a[0];
      const sd = c[1] - a[1];
      // face towards the opening (-B) for wall segments and outwards (-D) for flanges
      const n = B.clone().multiplyScalar(-sd).addScaledVector(D, sb).normalize();
      return md.addVertex(p.x, p.y, p.z, n.x, n.y, n.z);
    });
  });
  const n = frames.length;
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n;
    for (let s = 0; s < 3; s++) md.addQuad(rows[k][s], rows[k2][s], rows[k2][s + 1], rows[k][s + 1]);
  }
  return md;
}

/** Offsets a strip along its normals and appends the flipped copy (thin two-sided sheet). */
export function twoSided(md, thickness = 0.001) {
  const back = md.clone();
  for (let i = 0; i < back.vertexCount; i++) for (let c = 0; c < 3; c++) back.positions[i * 3 + c] -= back.normals[i * 3 + c] * thickness;
  back.flip();
  return md.clone().append(back);
}

/** Lens flush with the body plus a closed housing box behind it. */
function lampShell(skin, mats, kind, name, count) {
  const g = new THREE.Group();
  g.name = name;
  const depth = kind === 'headlight' ? 0.12 : 0.08;
  const lensMesh = toMesh(skin, kind === 'headlight' ? mats.lens : mats.tailLens, `${name}_lens`, { cast: false });
  lensMesh.userData.glass = true;
  g.add(lensMesh);
  count(skin);
  // side walls: the lens boundary swept straight into the body (both faces)
  const { outer } = hemPanel(skin, { roll: 0.0005, depth, thickness: 0, rollSteps: 1 });
  const walls = new MeshData();
  walls.positions = outer.positions;
  walls.normals = outer.normals;
  walls.indices = outer.indices.slice(skin.indices.length);
  const wallMesh = twoSided(walls.compact(), 0.0015);
  g.add(toMesh(wallMesh, mats.lampHousing, `${name}_housing`));
  const back = skin.clone();
  for (let i = 0; i < back.vertexCount; i++) for (let c = 0; c < 3; c++) back.positions[i * 3 + c] -= back.normals[i * 3 + c] * depth;
  g.add(toMesh(twoSided(back.flip(), 0.0015), kind === 'headlight' ? mats.reflector : mats.lampHousing, `${name}_back`));
  count(wallMesh);
  count(back);
  return g;
}
