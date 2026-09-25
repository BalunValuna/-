import * as THREE from 'three';
import { doubleSided } from '../materials.js';
import { latheX, mesh, roundedBox } from '../../geo/primitives.js';
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
  const outerWall = latheX(sidewall.map(([r, a]) => [r, a]).reverse(), 56);
  const innerWall = latheX(sidewall.map(([r, a]) => [r, -a]), 40);
  const treadProfile = [[R - 0.0005, -0.074]];
  for (const gz of [-0.042, -0.013, 0.016, 0.045]) {
    treadProfile.push([R, gz - 0.006], [R - 0.008, gz - 0.004], [R - 0.008, gz + 0.004], [R, gz + 0.006]);
  }
  treadProfile.push([R - 0.0005, 0.074]);
  const tread = latheX(treadProfile, 64);
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
  spin.add(mesh(lip, doubleSided(mats.alloy), { name: 'rimLip' }));

  // --- five double spokes, concave: the hub sits deeper than the lip
  spin.add(mesh(spokeGeometry(spokes), mats.alloy, { name: 'rimFace' }));
  const hubPlate = latheX(
    [
      [0.0301, 0.0555],
      [0.056, 0.0565],
      [0.07, 0.0535],
      [0.078, 0.044],
      [0.079, 0.028],
      [0.072, 0.02],
    ],
    40,
  );
  spin.add(mesh(hubPlate, doubleSided(mats.alloy), { name: 'rimHub' }));

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
  spin.add(mesh(disc, doubleSided(mats.brakeDisc), { name: 'brakeDisc' }));
  const caliper = mesh(roundedBox(0.05, 0.1, 0.055, 0.012), mats.caliper, { name: 'caliper' });
  caliper.position.set(-0.012, 0.075, 0.1);
  caliper.rotation.x = -0.65;
  root.add(caliper);

  return { root, spin, caliper };
}


/** Axial position of the spoke top surface at radius r (concave dish towards the hub). */
const spokeTop = (r) => 0.05 + 0.026 * Math.pow(r / 0.19, 1.5);

/**
 * Double spokes as lofted bars with chamfered, slightly crowned tops. Every side of the section
 * is its own strip so edges stay crisp while shading is smooth along the spoke.
 */
function spokeGeometry(pairs) {
  const positions = [];
  const indices = [];
  const steps = 14;
  const r0 = 0.052;
  const r1 = 0.197;
  const section = (w, t) => {
    const c = Math.min(0.004, w * 0.2);
    return [
      [-w / 2, -t],
      [w / 2, -t],
      [w / 2, -0.35 * t],
      [w / 2 - c, 0],
      [0, 0.08 * t],
      [-w / 2 + c, 0],
      [-w / 2, -0.35 * t],
    ];
  };
  const axis = new THREE.Vector3(1, 0, 0);
  for (let k = 0; k < pairs; k++) {
    const theta = (k / pairs) * Math.PI * 2;
    const rho = new THREE.Vector3(0, Math.cos(theta), Math.sin(theta));
    const tau = new THREE.Vector3(0, -Math.sin(theta), Math.cos(theta));
    for (const side of [-1, 1]) {
      const offs = (r) => side * (0.009 + 0.022 * ((r - r0) / (r1 - r0)) ** 1.3);
      const rings = [];
      for (let i = 0; i <= steps; i++) {
        const r = r0 + ((r1 - r0) * i) / steps;
        const u = (r - r0) / (r1 - r0);
        const centre = rho.clone().multiplyScalar(r).addScaledVector(tau, offs(r)).addScaledVector(axis, spokeTop(r));
        const dr = 1e-3;
        const ahead = rho.clone().multiplyScalar(r + dr).addScaledVector(tau, offs(r + dr));
        const dir = ahead.sub(rho.clone().multiplyScalar(r).addScaledVector(tau, offs(r))).normalize();
        const lateral = new THREE.Vector3().crossVectors(axis, dir).normalize();
        const w = 0.034 - 0.01 * u;
        const t = 0.024 - 0.008 * u;
        rings.push(section(w, t).map(([sx, sa]) => centre.clone().addScaledVector(lateral, sx).addScaledVector(axis, sa)));
      }
      const m = rings[0].length;
      for (let e = 0; e < m; e++) {
        const e2 = (e + 1) % m;
        const base = positions.length / 3;
        for (const ring of rings) positions.push(ring[e].x, ring[e].y, ring[e].z, ring[e2].x, ring[e2].y, ring[e2].z);
        for (let i = 0; i < steps; i++) {
          const a = base + i * 2;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
