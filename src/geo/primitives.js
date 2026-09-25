import * as THREE from 'three';

/**
 * Lathe around the local X axis (car axle direction). `profile` is [[radius, axial], ...].
 */
export function latheX(profile, segments = 64, phiStart = 0, phiLength = Math.PI * 2) {
  const pts = profile.map(([r, a]) => new THREE.Vector2(r, a));
  const g = new THREE.LatheGeometry(pts, segments, phiStart, phiLength);
  // LatheGeometry revolves around +Y with the profile's y as height: map Y → X.
  g.rotateZ(-Math.PI / 2);
  return g;
}

/** Lathe around the Y axis. */
export function latheY(profile, segments = 48, phiStart = 0, phiLength = Math.PI * 2) {
  return new THREE.LatheGeometry(
    profile.map(([r, h]) => new THREE.Vector2(r, h)),
    segments,
    phiStart,
    phiLength,
  );
}

/** Rounded box with bevelled edges (radius r) centred at the origin. */
export function roundedBox(w, h, d, r = 0.01, segments = 3) {
  const shape = new THREE.Shape();
  const x = w / 2 - r;
  const y = h / 2 - r;
  shape.moveTo(-x, -h / 2);
  shape.lineTo(x, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -y);
  shape.lineTo(w / 2, y);
  shape.quadraticCurveTo(w / 2, h / 2, x, h / 2);
  shape.lineTo(-x, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, y);
  shape.lineTo(-w / 2, -y);
  shape.quadraticCurveTo(-w / 2, -h / 2, -x, -h / 2);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(d - 2 * r, 0.0001),
    bevelEnabled: true,
    bevelSize: r * 0.999,
    bevelThickness: r,
    bevelSegments: segments,
    curveSegments: segments * 2,
  });
  g.translate(0, 0, -(d - 2 * r) / 2);
  return g;
}

/** Closed 2D rounded polygon (corner radius per vertex) as a THREE.Shape. */
export function roundedShape(points, radius = 0.01, segments = 4) {
  const n = points.length;
  const shape = new THREE.Shape();
  const rs = Array.isArray(radius) ? radius : points.map(() => radius);
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const d0 = Math.hypot(p0[0] - p1[0], p0[1] - p1[1]);
    const d1 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const r = Math.min(rs[i], d0 * 0.45, d1 * 0.45);
    const a = [p1[0] + ((p0[0] - p1[0]) / d0) * r, p1[1] + ((p0[1] - p1[1]) / d0) * r];
    const b = [p1[0] + ((p2[0] - p1[0]) / d1) * r, p1[1] + ((p2[1] - p1[1]) / d1) * r];
    if (i === 0) shape.moveTo(a[0], a[1]);
    else shape.lineTo(a[0], a[1]);
    shape.quadraticCurveTo(p1[0], p1[1], b[0], b[1]);
  }
  shape.closePath();
  shape.userData = { segments };
  return shape;
}

/** Tube along a polyline/curve with a circular section. */
export function tube(points, radius, tubularSegments = 32, radialSegments = 10, closed = false) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))),
    closed,
    'centripetal',
  );
  return new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, closed);
}

/**
 * Sweeps a closed 2D cross-section (array of [u, v], u across, v "up") along a 3D polyline using
 * parallel-transported frames. `up` seeds the initial frame orientation.
 */
export function sweepProfile(points, section, { up = new THREE.Vector3(0, 1, 0), closed = false, caps = true } = {}) {
  const pts = points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p)));
  const n = pts.length;
  const tangents = pts.map((p, i) => {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(i - 1, 0)];
    const b = pts[closed ? (i + 1) % n : Math.min(i + 1, n - 1)];
    return b.clone().sub(a).normalize();
  });
  const normals = [];
  let prevN = up.clone().addScaledVector(tangents[0], -up.dot(tangents[0])).normalize();
  if (prevN.lengthSq() < 1e-6) prevN = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < n; i++) {
    const t = tangents[i];
    const nrm = prevN.clone().addScaledVector(t, -prevN.dot(t)).normalize();
    normals.push(nrm);
    prevN = nrm;
  }
  const positions = [];
  const indices = [];
  const m = section.length;
  for (let i = 0; i < n; i++) {
    const t = tangents[i];
    const v = normals[i];
    const u = new THREE.Vector3().crossVectors(v, t);
    for (const [su, sv] of section) {
      const p = pts[i].clone().addScaledVector(u, su).addScaledVector(v, sv);
      positions.push(p.x, p.y, p.z);
    }
  }
  const rings = closed ? n : n - 1;
  for (let i = 0; i < rings; i++) {
    const i2 = (i + 1) % n;
    for (let j = 0; j < m; j++) {
      const j2 = (j + 1) % m;
      const a = i * m + j;
      const b = i * m + j2;
      const c = i2 * m + j2;
      const d = i2 * m + j;
      indices.push(a, b, c, a, c, d);
    }
  }
  if (caps && !closed) {
    for (const [ring, flip] of [
      [0, true],
      [n - 1, false],
    ]) {
      const base = positions.length / 3;
      const c = pts[ring];
      positions.push(c.x, c.y, c.z);
      for (let j = 0; j < m; j++) {
        const j2 = (j + 1) % m;
        if (flip) indices.push(base, ring * m + j, ring * m + j2);
        else indices.push(base, ring * m + j2, ring * m + j);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Rounded-rectangle cross-section for sweepProfile (width w across, height h). */
export function roundRectSection(w, h, r = Math.min(w, h) * 0.3, seg = 3) {
  const out = [];
  const corners = [
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, Math.PI / 2],
    [-w / 2 + r, -h / 2 + r, Math.PI],
    [w / 2 - r, -h / 2 + r, (3 * Math.PI) / 2],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k <= seg; k++) {
      const a = a0 + (k / seg) * (Math.PI / 2);
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  return out;
}

/** Elliptical cross-section. */
export function ellipseSection(rx, ry, seg = 10) {
  const out = [];
  for (let k = 0; k < seg; k++) {
    const a = (k / seg) * Math.PI * 2;
    out.push([Math.cos(a) * rx, Math.sin(a) * ry]);
  }
  return out;
}

/** Helical coil spring along +Y. */
export function coilSpring(radius, wire, height, turns, segmentsPerTurn = 18) {
  const pts = [];
  const n = Math.ceil(turns * segmentsPerTurn);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, t * height, Math.sin(a) * radius));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, n * 2, wire, 8, false);
}

export function mesh(geometry, material, { cast = true, receive = true, name = '' } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  if (name) m.name = name;
  return m;
}
