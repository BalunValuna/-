import * as THREE from 'three';
import { latheX, mesh, roundedBox, roundedShape } from '../../geo/primitives.js';
import { CAR } from '../design.js';

/**
 * 16" five double-spoke alloy wheel with a 195/55 R16 tyre, brake disc and caliper.
 * Built with the outer face towards +X; the axle is the local X axis.
 * Returns { root, spin, caliper }: `spin` rotates with the wheel, `caliper` stays with the knuckle.
 */
export function buildWheel(mats, { spokes = 5 } = {}) {
  const root = new THREE.Group();
  root.name = 'wheel';
  const spin = new THREE.Group();
  spin.name = 'wheelSpin';
  root.add(spin);

  const R = CAR.wheelRadius;
  const w = CAR.tireWidth / 2;
  const bead = CAR.rimRadius + 0.004;

  // --- tyre: two sidewalls and a grooved tread band
  const sidewall = [
    [bead, 0.086],
    [bead + 0.012, 0.093],
    [0.238, 0.0985],
    [0.262, 0.1],
    [0.283, 0.0975],
    [0.298, 0.092],
    [0.306, 0.084],
    [R - 0.0005, 0.074],
  ];
  const outerWall = latheX(sidewall.map(([r, a]) => [r, a]).reverse(), 72);
  const innerWall = latheX(sidewall.map(([r, a]) => [r, -a]), 72);
  const treadProfile = [[R - 0.0005, -0.074]];
  for (const gz of [-0.042, -0.013, 0.016, 0.045]) {
    treadProfile.push([R, gz - 0.006], [R - 0.008, gz - 0.004], [R - 0.008, gz + 0.004], [R, gz + 0.006]);
  }
  treadProfile.push([R - 0.0005, 0.074]);
  const tread = latheX(treadProfile, 96);
  spin.add(mesh(outerWall, mats.rubber, { name: 'tyreWall' }));
  spin.add(mesh(innerWall, mats.rubber, { name: 'tyreWall' }));
  spin.add(mesh(tread, mats.tread, { name: 'tyreTread' }));

  // --- rim barrel (visible through the spokes) and outer lip
  const barrel = latheX(
    [
      [0.19, 0.07],
      [0.186, 0.0],
      [0.186, -0.07],
      [0.19, -0.09],
      [bead + 0.004, -0.094],
    ],
    64,
  );
  spin.add(mesh(barrel, mats.alloyDark, { name: 'rimBarrel' }));
  const lip = latheX(
    [
      [0.186, 0.068],
      [0.196, 0.078],
      [bead + 0.006, 0.086],
      [bead + 0.009, 0.092],
      [bead + 0.002, 0.097],
      [0.19, 0.093],
    ],
    72,
  );
  spin.add(mesh(lip, mats.alloy, { name: 'rimLip' }));

  // --- spoke face: disc with windows, dished towards the hub
  const faceR = 0.192;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, faceR, 0, Math.PI * 2, false);
  const windows = [];
  for (let k = 0; k < spokes; k++) {
    const c = (k / spokes) * Math.PI * 2;
    windows.push(windowShape(c, 0.086, 0.176, 0.17, 0.36));
    windows.push(windowShape(c + Math.PI / spokes, 0.1, 0.176, 0.028, 0.045));
  }
  shape.holes.push(...windows);
  for (let k = 0; k < spokes; k++) {
    const a = (k / spokes) * Math.PI * 2 + Math.PI / spokes;
    const hole = new THREE.Path();
    hole.absarc(Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0.0085, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const face = new THREE.ExtrudeGeometry(shape, {
    depth: 0.016,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.003,
    bevelSegments: 2,
    curveSegments: 20,
  });
  face.rotateY(Math.PI / 2); // extrusion +Z → +X
  const pos = face.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getY(i), pos.getZ(i));
    pos.setX(i, pos.getX(i) + 0.036 + 0.034 * Math.pow(Math.min(r / faceR, 1), 1.6));
  }
  face.computeVertexNormals();
  spin.add(mesh(face, mats.alloy, { name: 'rimFace' }));

  // --- hub: centre cap and lug nuts
  const cap = latheX(
    [
      [0.031, 0.05],
      [0.03, 0.06],
      [0.022, 0.063],
      [0.0001, 0.064],
    ],
    32,
  );
  spin.add(mesh(cap, mats.satinChrome, { name: 'centreCap' }));
  const nutGeo = new THREE.CylinderGeometry(0.0095, 0.0095, 0.02, 6).rotateZ(Math.PI / 2);
  for (let k = 0; k < spokes; k++) {
    const a = (k / spokes) * Math.PI * 2 + Math.PI / spokes;
    const nut = mesh(nutGeo, mats.chrome, { name: 'lugNut', cast: false });
    nut.position.set(0.052, Math.cos(a) * 0.05, Math.sin(a) * 0.05);
    spin.add(nut);
  }

  // --- brake disc (spins) and caliper (fixed to the knuckle)
  const disc = latheX(
    [
      [0.03, 0.021],
      [0.06, 0.02],
      [0.075, -0.01],
      [0.08, -0.026],
      [0.14, -0.026],
      [0.141, -0.015],
      [0.14, -0.004],
      [0.08, -0.004],
    ],
    48,
  );
  spin.add(mesh(disc, mats.brakeDisc, { name: 'brakeDisc' }));
  const caliper = mesh(roundedBox(0.05, 0.1, 0.055, 0.012), mats.caliper, { name: 'caliper' });
  caliper.position.set(-0.012, 0.075, 0.1);
  caliper.rotation.x = -0.65;
  root.add(caliper);

  return { root, spin, caliper };
}

/** Rounded wheel window centred on angle c between radii r0 and r1 (half angles at r0 / r1). */
function windowShape(c, r0, r1, halfInner, halfOuter) {
  const pts = [];
  const outerSteps = 6;
  for (let i = 0; i <= outerSteps; i++) {
    const a = c - halfOuter + (2 * halfOuter * i) / outerSteps;
    pts.push([Math.cos(a) * r1, Math.sin(a) * r1]);
  }
  for (let i = 0; i <= 2; i++) {
    const a = c + halfInner - halfInner * i;
    pts.push([Math.cos(a) * r0, Math.sin(a) * r0]);
  }
  const radii = pts.map((_, i) => (i === 0 || i === outerSteps ? 0.012 : i > outerSteps ? 0.01 : 0.004));
  const s = roundedShape(pts, radii);
  const path = new THREE.Path(s.getPoints(4).reverse());
  return path;
}
