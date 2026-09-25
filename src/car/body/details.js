import * as THREE from 'three';
import { MeshData } from '../../geo/meshData.js';
import { clipMesh } from '../../geo/clip.js';
import { surfaceNets } from '../../geo/surfaceNets.js';
import { sdRoundBox, sdEllipsoid, smin } from '../../geo/sdf.js';
import { ellipseSection, mesh, roundedBox, sweepProfile, tube } from '../../geo/primitives.js';
import { REGIONS, LAYOUT } from './regions.js';
import { beltY } from './shape.js';
import { bodyNormal, frontPoint, rearPoint, sidePoint, topPoint, surfaceFrame } from './surface.js';
import { hexNormal, plateTexture, badgeTexture } from '../../render/carTextures.js';

/**
 * Trims and small parts that sit on the body skin: grille, intake, fog lamps, plates, mirrors,
 * handles, wipers, antenna, exhaust tip. Everything is placed by tracing the real skin.
 */

/** Grid patch over an (|x|, y) rectangle mapped onto the nose/tail surface, clipped to a region. */
function endPatch(region, x0, x1, y0, y1, { rear = false, recess = 0.03, res = 0.012, grow = 0.012 } = {}) {
  const md = new MeshData();
  const nx = Math.max(2, Math.ceil((x1 - x0) / res));
  const ny = Math.max(2, Math.ceil((y1 - y0) / res));
  const idx = [];
  for (let j = 0; j <= ny; j++) {
    const row = [];
    for (let i = 0; i <= nx; i++) {
      const x = x0 + ((x1 - x0) * i) / nx;
      const y = y0 + ((y1 - y0) * j) / ny;
      const p = rear ? rearPoint(x, y) : frontPoint(x, y);
      if (!p) {
        row.push(-1);
        continue;
      }
      p.z += rear ? -recess : recess;
      row.push(md.addVertex(p.x, p.y, p.z, 0, 0, rear ? 1 : -1));
    }
    idx.push(row);
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = idx[j][i];
      const b = idx[j][i + 1];
      const c = idx[j + 1][i + 1];
      const d = idx[j + 1][i];
      if (a < 0 || b < 0 || c < 0 || d < 0) continue;
      if (rear) md.addQuad(a, b, c, d);
      else md.addQuad(a, d, c, b);
    }
  }
  md.computeNormals();
  return clipMesh(md, (x, y, z) => region(x, y, z) - grow);
}

/** Polyline across the nose at height y, following the surface at a given recess. */
function noseLine(xa, xb, y, recess, steps = 16, rear = false) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const x = xa + ((xb - xa) * i) / steps;
    const p = rear ? rearPoint(x, y) : frontPoint(x, y);
    if (p) {
      p.z += rear ? -recess : recess;
      pts.push(p);
    }
  }
  return pts;
}

/** Closed outline of an (|x|, y) polygon region on the nose (both halves), for chrome trims. */
function noseOutline(poly, recess, rear = false) {
  const half = [];
  for (let i = 0; i < poly.length; i += 2) half.push([Math.max(poly[i], 0), poly[i + 1]]);
  const loop = [...half.map(([x, y]) => [x, y]), ...[...half].reverse().map(([x, y]) => [-x, y])];
  const pts = [];
  for (let i = 0; i < loop.length; i++) {
    const [xa, ya] = loop[i];
    const [xb, yb] = loop[(i + 1) % loop.length];
    const n = Math.max(1, Math.ceil(Math.hypot(xb - xa, yb - ya) / 0.02));
    for (let k = 0; k < n; k++) {
      const x = xa + ((xb - xa) * k) / n;
      const y = ya + ((yb - ya) * k) / n;
      const p = rear ? rearPoint(x, y) : frontPoint(x, y);
      if (p) {
        p.z += rear ? -recess : recess;
        pts.push(p);
      }
    }
  }
  return pts;
}

function meshFromField(field, min, max, cell) {
  return surfaceNets(field, { min, max, cell, project: 4 }).toGeometry();
}

export function buildDetails(mats) {
  const front = new THREE.Group();
  front.name = 'frontDetails';
  const rear = new THREE.Group();
  rear.name = 'rearDetails';

  // ---------------------------------------------------------- grille
  const grillePoly = [-0.01, 0.642, 0.29, 0.642, 0.338, 0.662, 0.354, 0.736, -0.01, 0.744];
  const backing = endPatch(REGIONS.grille, -0.38, 0.38, 0.62, 0.77, { recess: 0.038 });
  front.add(mesh(backing.toGeometry(), mats.glossBlack, { name: 'grilleBacking' }));
  for (const y of [0.664, 0.689, 0.714]) {
    const pts = noseLine(-0.33, 0.33, y, 0.016, 20);
    front.add(mesh(sweepProfile(pts, ellipseSection(0.0045, 0.0075, 10)), mats.chrome, { name: 'grilleBar' }));
  }
  front.add(mesh(tube(noseOutline(grillePoly, 0.004), 0.0048, 160, 8, true), mats.chrome, { name: 'grilleSurround' }));
  front.add(badge(mats, frontPoint(0, 0.693), new THREE.Vector3(0, 0, -1), 0.05));

  // ---------------------------------------------------------- lower intake + fog lamps
  const intake = endPatch(REGIONS.lowerIntake, -0.52, 0.52, 0.24, 0.5, { recess: 0.05 });
  const intakeMat = mats.blackPlastic.clone();
  intakeMat.normalMap = hexNormal();
  intakeMat.normalScale = new THREE.Vector2(1.4, 1.4);
  const intakeGeo = intake.toGeometry();
  planarUV(intakeGeo, 'xy', 18);
  front.add(mesh(intakeGeo, intakeMat, { name: 'intakeMesh' }));
  const barPts = noseLine(-0.43, 0.43, 0.372, 0.02, 20);
  front.add(mesh(sweepProfile(barPts, ellipseSection(0.008, 0.013, 10)), mats.glossBlack, { name: 'intakeBar' }));
  for (const side of [-1, 1]) {
    const pocket = endPatch(
      (x, y, z) => Math.max(REGIONS.fogPocket(x, y, z), -side * x),
      side < 0 ? -0.8 : 0.5,
      side < 0 ? -0.5 : 0.8,
      0.28,
      0.49,
      { recess: 0.026 },
    );
    front.add(mesh(pocket.toGeometry(), mats.blackPlastic, { name: 'fogPocket' }));
    const c = frontPoint(side * 0.66, 0.39);
    c.z += 0.018;
    const fog = new THREE.Group();
    fog.name = 'fogLamp';
    fog.position.copy(c);
    fog.quaternion.copy(surfaceFrame(frontPoint(side * 0.66, 0.39)));
    const bowl = new THREE.LatheGeometry(
      [
        [0.005, -0.03],
        [0.025, -0.024],
        [0.036, -0.01],
        [0.039, 0.0],
      ].map(([r, h]) => new THREE.Vector2(r, h)),
      24,
    ).rotateX(Math.PI / 2);
    fog.add(mesh(bowl, mats.reflector, { name: 'fogReflector' }));
    const lens = new THREE.CircleGeometry(0.039, 24);
    const lensMesh = mesh(lens, mats.lens, { name: 'fogLens', cast: false });
    lensMesh.position.z = 0.002;
    lensMesh.userData.glass = true;
    fog.add(lensMesh);
    const ring = new THREE.TorusGeometry(0.041, 0.004, 6, 28);
    fog.add(mesh(ring, mats.chrome, { name: 'fogRing' }));
    front.add(fog);
  }

  // ---------------------------------------------------------- plates
  front.add(plate(mats, frontPoint(0, 0.556), 'front', new THREE.Vector3(-1, 0, 0)));
  const rp = rearPoint(0, 0.893);
  rear.add(plate(mats, rp, 'rear'));
  const garnish = noseLine(-0.31, 0.31, 0.975, -0.003, 16, true);
  rear.add(mesh(sweepProfile(garnish, ellipseSection(0.005, 0.009, 10)), mats.chrome, { name: 'trunkGarnish' }));
  rear.add(badge(mats, rearPoint(0, 1.035), new THREE.Vector3(0, 0, 1), 0.045));

  // exhaust tip under the left of the rear bumper
  const tip = new THREE.CylinderGeometry(0.036, 0.034, 0.12, 20, 1, true).rotateX(Math.PI / 2);
  const tipMesh = mesh(tip, mats.chrome, { name: 'exhaustTip' });
  tipMesh.position.set(-0.46, 0.27, 2.14);
  tipMesh.scale.set(1.25, 0.8, 1);
  rear.add(tipMesh);
  const tipInner = mesh(new THREE.CircleGeometry(0.033, 20).rotateY(Math.PI), mats.frit, { name: 'exhaustInner', cast: false });
  tipInner.position.set(-0.46, 0.27, 2.17);
  tipInner.scale.set(1.25, 0.8, 1);
  rear.add(tipInner);

  // ---------------------------------------------------------- wipers and antenna
  const top = new THREE.Group();
  top.name = 'topDetails';
  for (const [pivotX, len, dir] of [
    [0.06, 0.56, -1],
    [0.5, 0.46, -1],
  ]) {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const x = pivotX + dir * len * (i / 10);
      const z = -0.925 + 0.12 * ((x / 0.6) ** 2) * 0.8;
      const p = topPoint(x, z);
      if (p) pts.push(p.add(new THREE.Vector3(0, 0.012, 0)));
    }
    top.add(mesh(sweepProfile(pts, ellipseSection(0.007, 0.0045, 8)), mats.satinBlack, { name: 'wiper' }));
    const blade = mesh(tube(pts.slice(1).map((p) => p.clone().add(new THREE.Vector3(0, -0.005, 0.02))), 0.007, 20, 6), mats.rubber, {
      name: 'wiperBlade',
    });
    top.add(blade);
  }
  const finBase = topPoint(0, 0.8);
  const fin = meshFromField(
    (x, y, z) => {
      const lz = z - finBase.z;
      const ly = y - finBase.y;
      const along = Math.min(Math.max((lz + 0.09) / 0.18, 0), 1);
      const h = 0.065 * (1 - along) ** 0.7;
      return Math.max(sdEllipsoid(x, ly, lz, 0.022, 0.07, 0.1), -ly - 0.002, ly - h);
    },
    [-0.03, finBase.y - 0.01, finBase.z - 0.11],
    [0.03, finBase.y + 0.08, finBase.z + 0.11],
    0.006,
  );
  top.add(mesh(fin, mats.glossBlack, { name: 'antenna' }));

  return { front, rear, top };
}

/** Door details (mirror, handle, belt molding, B-pillar cover) for one door. */
export function buildDoorDetails(mats, door, side) {
  const g = new THREE.Group();
  g.name = `${door}DoorDetails`;
  const handleZ = door === 'front' ? 0.08 : 0.86;
  const handleY = 0.872;
  const hp = sidePoint(handleZ, handleY, side);
  if (hp) {
    const handle = meshFromField(
      (x, y, z) => sdRoundBox(z, y, x, 0.082, 0.013, 0.014, 0.012),
      [-0.03, -0.02, -0.095],
      [0.03, 0.02, 0.095],
      0.005,
    );
    const hm = mesh(handle, mats.paint, { name: 'doorHandle' });
    hm.position.copy(hp).addScaledVector(bodyNormal(hp), 0.009);
    hm.quaternion.copy(surfaceFrame(hp, new THREE.Vector3(0, 0, 1)));
    hm.rotateY(-Math.PI / 2);
    g.add(hm);
    const cup = mesh(new THREE.CircleGeometry(0.05, 24), mats.frit, { name: 'handleRecess', cast: false });
    cup.scale.set(1.6, 0.42, 1);
    cup.position.copy(hp).addScaledVector(bodyNormal(hp), 0.0008);
    cup.quaternion.copy(surfaceFrame(hp, new THREE.Vector3(0, 0, 1)));
    g.add(cup);
    const strip = mesh(roundedBox(0.12, 0.006, 0.004, 0.002), mats.chrome, { name: 'handleChrome' });
    strip.position.copy(hp).addScaledVector(bodyNormal(hp), 0.022);
    strip.quaternion.copy(surfaceFrame(hp, new THREE.Vector3(0, 0, 1)));
    g.add(strip);
  }

  // belt molding along the top of the door skin
  const z0 = door === 'front' ? -0.66 : LAYOUT.bSeam(1.0) + 0.02;
  const z1 = door === 'front' ? LAYOUT.bSeam(1.0) - 0.02 : 1.09;
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const z = z0 + ((z1 - z0) * i) / 24;
    const p = sidePoint(z, beltY.at(z) + 0.003, side);
    if (p) pts.push(p.addScaledVector(new THREE.Vector3(-side, 0, 0), 0.004));
  }
  if (pts.length > 3) g.add(mesh(tube(pts, 0.0055, 48, 6), mats.seal, { name: 'beltMolding' }));

  if (door === 'front') g.add(buildMirror(mats, side));
  return g;
}

function buildMirror(mats, side) {
  const g = new THREE.Group();
  g.name = 'mirror';
  const base = sidePoint(-0.64, 1.0, side);
  const n = bodyNormal(base);
  // housing in local space: +x outward, +y up, +z rearward (glass faces +z)
  const housing = (x, y, z) => {
    const taper = 1 - 0.25 * Math.max(0, Math.min(1, x / 0.2));
    const d = sdRoundBox(x - 0.1, y, (z + 0.01) / taper, 0.1, 0.058 * taper, 0.05, 0.034);
    return Math.max(d, z - 0.036);
  };
  const geo = meshFromField(housing, [-0.01, -0.07, -0.08], [0.215, 0.07, 0.045], 0.0075);
  const cap = mesh(geo, mats.paint, { name: 'mirrorHousing' });
  const glassShape = new THREE.Shape();
  const w = 0.088;
  const h = 0.048;
  const r = 0.025;
  glassShape.moveTo(-w + r, -h);
  glassShape.lineTo(w - r, -h);
  glassShape.quadraticCurveTo(w, -h, w, -h + r);
  glassShape.lineTo(w, h - r);
  glassShape.quadraticCurveTo(w, h, w - r, h);
  glassShape.lineTo(-w + r, h);
  glassShape.quadraticCurveTo(-w, h, -w, h - r);
  glassShape.lineTo(-w, -h + r);
  glassShape.quadraticCurveTo(-w, -h, -w + r, -h);
  const glass = mesh(new THREE.ShapeGeometry(glassShape, 6), mats.chrome, { name: 'mirrorGlass', cast: false });
  glass.position.set(0.105, 0, 0.037);
  const signal = mesh(roundedBox(0.09, 0.008, 0.01, 0.003), mats.amberLens, { name: 'mirrorSignal' });
  signal.position.set(0.14, -0.045, -0.02);
  signal.rotation.y = 0.35;
  const arm = mesh(
    meshFromField((x, y, z) => sdRoundBox(x - 0.03, y + 0.02, z, 0.035, 0.018, 0.045, 0.012), [-0.01, -0.05, -0.06], [0.08, 0.01, 0.06], 0.004),
    mats.satinBlack,
    { name: 'mirrorArm' },
  );
  const local = new THREE.Group();
  local.add(cap, glass, signal, arm);
  local.position.set(0.035, 0.03, 0);
  local.rotation.set(0, -0.12, 0);
  if (side < 0) local.scale.x = -1;
  g.add(local);
  g.position.copy(base).addScaledVector(n, 0.002);
  return g;
}

function plate(mats, p, kind, along = new THREE.Vector3(1, 0, 0)) {
  const g = new THREE.Group();
  g.name = `${kind}Plate`;
  const q = surfaceFrame(p, along);
  g.position.copy(p).addScaledVector(bodyNormal(p), 0.006);
  g.quaternion.copy(q);
  const frame = mesh(roundedBox(0.535, 0.126, 0.008, 0.004), mats.blackPlastic, { name: 'plateFrame' });
  g.add(frame);
  const mat = mats.plate.clone();
  mat.map = plateTexture(kind === 'front' ? 'А 016 ВК 34' : 'А 016 ВК 34');
  const face = mesh(new THREE.PlaneGeometry(0.52, 0.112), mat, { name: 'plate', cast: false });
  face.position.z = 0.0045;
  g.add(face);
  return g;
}

function badge(mats, p, normal, size) {
  const g = new THREE.Group();
  g.name = 'badge';
  const ring = mesh(new THREE.TorusGeometry(size * 0.5, size * 0.07, 8, 32), mats.chrome, { name: 'badgeRing' });
  ring.scale.set(1.35, 1, 0.6);
  g.add(ring);
  const mat = new THREE.MeshStandardMaterial({ map: badgeTexture(), metalness: 1, roughness: 0.15, transparent: true, alphaTest: 0.4 });
  const face = mesh(new THREE.PlaneGeometry(size * 1.2, size * 0.85), mat, { name: 'badgeFace', cast: false });
  face.position.z = 0.002;
  g.add(face);
  g.position.copy(p).addScaledVector(normal, 0.008);
  g.lookAt(p.clone().addScaledVector(normal, 1));
  return g;
}

/** Planar UVs from world coordinates, scaled by `repeat` per metre. */
function planarUV(geo, plane, repeat) {
  const pos = geo.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (plane === 'xy' ? pos.getX(i) : pos.getZ(i)) * repeat;
    uv[i * 2 + 1] = pos.getY(i) * repeat;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export { smin };
