import * as THREE from 'three';

/**
 * Lofts a sequence of cross-sections (each an array of THREE.Vector3 with the same length).
 * Faces point to the right of the section direction when walking along the sequence, i.e. for
 * sections running counter-clockwise when seen from the start, faces point outward.
 */
export function loft(sections, { closedSection = false, capStart = false, capEnd = false, flip = false } = {}) {
  const positions = [];
  const indices = [];
  const m = sections[0].length;
  for (const sec of sections) for (const p of sec) positions.push(p.x, p.y, p.z);
  const segs = closedSection ? m : m - 1;
  for (let i = 0; i < sections.length - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const j2 = (j + 1) % m;
      const a = i * m + j;
      const b = i * m + j2;
      const c = (i + 1) * m + j2;
      const d = (i + 1) * m + j;
      if (flip) indices.push(a, b, c, a, c, d);
      else indices.push(a, d, c, a, c, b);
    }
  }
  const cap = (sec, base, reverse) => {
    const center = sec.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(1 / sec.length);
    const ci = positions.length / 3;
    positions.push(center.x, center.y, center.z);
    for (let j = 0; j < m; j++) {
      const j2 = (j + 1) % m;
      if (reverse !== flip) indices.push(ci, base + j, base + j2);
      else indices.push(ci, base + j2, base + j);
    }
  };
  if (capStart) cap(sections[0], 0, true);
  if (capEnd) cap(sections[sections.length - 1], (sections.length - 1) * m, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Flat panel from a 2D outline in a plane: `toWorld(u, v)` maps outline coords to 3D. */
export function planarPanel(outline, toWorld, { holes = [], thickness = 0, normal = null } = {}) {
  const shape = new THREE.Shape(outline.map(([u, v]) => new THREE.Vector2(u, v)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([u, v]) => new THREE.Vector2(u, v))));
  const geo = thickness > 0 ? new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false }) : new THREE.ShapeGeometry(shape, 8);
  const pos = geo.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    toWorld(pos.getX(i), pos.getY(i), pos.getZ(i), v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  if (normal) {
    // make sure the faces point along `normal`
    geo.computeBoundingBox();
    const n = geo.getAttribute('normal');
    let dot = 0;
    for (let i = 0; i < n.count; i++) dot += n.getX(i) * normal.x + n.getY(i) * normal.y + n.getZ(i) * normal.z;
    if (dot < 0 && thickness === 0) {
      const idx = geo.index;
      for (let i = 0; i < idx.count; i += 3) {
        const t = idx.getX(i + 1);
        idx.setX(i + 1, idx.getX(i + 2));
        idx.setX(i + 2, t);
      }
      geo.computeVertexNormals();
    }
  }
  return geo;
}
