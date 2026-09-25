import * as THREE from 'three';
import { doubleSided } from '../materials.js';
import { latheX, latheY, mesh, roundedBox, sweepProfile, roundRectSection, ellipseSection, tube } from '../../geo/primitives.js';
import { labelTexture } from '../../render/carTextures.js';

/**
 * 1.6 litre transverse inline-four with a five-speed transaxle. Local frame: crank along X,
 * origin at the centre of the block base, intake towards +Z (firewall), exhaust towards -Z.
 */
export function buildEngine(mats) {
  const g = new THREE.Group();
  g.name = 'engine';
  const add = (geo, mat, name, pos, rot) => {
    const m = mesh(geo, mat, { name });
    if (pos) m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    g.add(m);
    return m;
  };

  // block, oil pan, head
  add(roundedBox(0.46, 0.28, 0.3, 0.018), mats.engineBlock, 'block', [0, 0.14, 0]);
  add(roundedBox(0.43, 0.085, 0.25, 0.02), mats.castIron, 'oilPan', [0, -0.03, 0.01]);
  add(roundedBox(0.465, 0.12, 0.25, 0.015), mats.aluminium, 'head', [0, 0.34, 0]);
  // plastic engine cover with ribs and a nameplate
  add(roundedBox(0.42, 0.055, 0.22, 0.022), mats.engineCover, 'engineCover', [0.01, 0.43, 0.0]);
  for (let i = -2; i <= 2; i++) add(roundedBox(0.012, 0.012, 0.16, 0.004), mats.engineCover, 'coverRib', [0.07 + i * 0.028, 0.462, 0]);
  const plateMat = new THREE.MeshStandardMaterial({ map: labelTexture('1.6 16V', '#c9ccd0', '#1a1a1a'), metalness: 0.7, roughness: 0.35 });
  add(new THREE.PlaneGeometry(0.14, 0.05).rotateX(-Math.PI / 2), plateMat, 'coverPlate', [-0.1, 0.4585, 0]);
  add(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 20), mats.yellow, 'oilCap', [0.16, 0.465, -0.05]);
  // dipstick handle
  const ring = new THREE.TorusGeometry(0.016, 0.004, 6, 16);
  add(ring, mats.yellow, 'dipstick', [-0.12, 0.33, -0.17], [0, 0, 0]);
  add(new THREE.CylinderGeometry(0.004, 0.004, 0.2, 6), mats.steel, 'dipstickTube', [-0.12, 0.22, -0.165]);

  // intake: runners into a plenum along the back, throttle body on the left
  for (let i = 0; i < 4; i++) {
    const x = -0.165 + i * 0.11;
    const pts = [
      [x, 0.34, 0.12],
      [x, 0.39, 0.19],
      [x, 0.46, 0.21],
      [x, 0.5, 0.16],
    ];
    add(sweepProfile(pts.map((p) => new THREE.Vector3(...p)), ellipseSection(0.022, 0.018, 10)), mats.engineCover, 'intakeRunner');
  }
  add(new THREE.CylinderGeometry(0.045, 0.045, 0.46, 18).rotateZ(Math.PI / 2), mats.engineCover, 'plenum', [0, 0.5, 0.15]);
  add(new THREE.CylinderGeometry(0.036, 0.036, 0.06, 18).rotateZ(Math.PI / 2), mats.aluminium, 'throttleBody', [-0.26, 0.5, 0.15]);

  // exhaust manifold under a heat shield
  for (let i = 0; i < 4; i++) {
    const x = -0.165 + i * 0.11;
    add(tube([[x, 0.33, -0.12], [x * 0.7, 0.27, -0.18], [0.0, 0.16, -0.2]], 0.017, 12, 8), mats.exhaust, 'exhaustRunner');
  }
  const shield = latheX(
    [
      [0.1, -0.2],
      [0.12, -0.1],
      [0.12, 0.1],
      [0.1, 0.2],
    ],
    16,
    Math.PI * 0.95,
    Math.PI * 0.55,
  );
  add(shield, mats.satinChrome, 'heatShield', [0, 0.25, -0.14]);

  // accessory drive on the right end
  const pulley = (r, w) => latheX([[0.0001, -w / 2], [r, -w / 2], [r - 0.004, 0], [r, w / 2], [0.0001, w / 2]].reverse(), 28);
  add(pulley(0.075, 0.03), mats.steel, 'crankPulley', [0.25, 0.06, -0.02]);
  add(pulley(0.032, 0.025), doubleSided(mats.steel), 'altPulley', [0.25, 0.3, -0.16]);
  add(pulley(0.05, 0.025), mats.steel, 'pumpPulley', [0.25, 0.22, 0.08]);
  add(pulley(0.028, 0.02), doubleSided(mats.steel), 'idler', [0.25, 0.17, -0.1]);
  const belt = [];
  const pulleys = [
    [0.06, -0.02, 0.078],
    [0.17, -0.1, 0.03],
    [0.3, -0.16, 0.035],
    [0.22, 0.08, 0.053],
  ];
  for (let i = 0; i <= 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    // blend of the pulley circles gives a convincing serpentine path
    let y = 0;
    let z = 0;
    let wsum = 0;
    for (const [py, pz, r] of pulleys) {
      const w = 1 / (0.02 + Math.hypot(Math.cos(t) * 0.14 - (pz + 0.03), Math.sin(t) * 0.14 - (py - 0.14)) ** 2);
      y += (py + Math.sin(t) * r) * w;
      z += (pz + Math.cos(t) * r) * w;
      wsum += w;
    }
    belt.push(new THREE.Vector3(0.262, y / wsum, z / wsum));
  }
  add(sweepProfile(belt, roundRectSection(0.004, 0.02, 0.0015), { closed: true }), mats.rubber, 'belt');
  add(roundedBox(0.03, 0.3, 0.2, 0.012), mats.engineCover, 'timingCover', [0.245, 0.24, 0.05]);
  const alt = add(new THREE.CylinderGeometry(0.058, 0.058, 0.11, 22).rotateZ(Math.PI / 2), mats.aluminium, 'alternator', [0.18, 0.3, -0.16]);
  alt.userData.part = 'alternator';

  // transaxle on the left
  const bell = latheX(
    [
      [0.19, 0.0],
      [0.17, -0.05],
      [0.12, -0.14],
      [0.1, -0.24],
    ],
    28,
  );
  add(bell, mats.aluminium, 'bellHousing', [-0.23, 0.1, 0.02]);
  add(roundedBox(0.16, 0.2, 0.26, 0.04), mats.aluminium, 'gearCase', [-0.4, 0.08, 0.04]);
  add(tube([[-0.42, 0.18, 0.15], [-0.42, 0.3, 0.3], [-0.3, 0.3, 0.55]], 0.006, 12, 6), mats.hose, 'shiftCable');
  add(new THREE.CylinderGeometry(0.04, 0.04, 0.16, 16).rotateZ(Math.PI / 2), mats.castIron, 'starter', [-0.24, 0.0, 0.15]);

  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}
