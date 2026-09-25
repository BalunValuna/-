import * as THREE from 'three';
import { mesh, roundedBox, tube, latheY } from '../../geo/primitives.js';
import { labelTexture } from '../../render/carTextures.js';

/**
 * Serviceable engine-bay parts. Each builder returns a group in car space so the car can attach
 * and detach them as separate items (battery, radiator, air filter...).
 */
const place = (m, x, y, z) => {
  m.position.set(x, y, z);
  return m;
};
const shade = (g) => {
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
};

export function buildBattery(mats) {
  const g = new THREE.Group();
  g.name = 'battery';
  const body = mesh(roundedBox(0.24, 0.17, 0.175, 0.008), mats.battery, { name: 'batteryCase' });
  g.add(body);
  const lid = mesh(roundedBox(0.244, 0.02, 0.179, 0.006), mats.blackPlastic, { name: 'batteryLid' });
  lid.position.y = 0.093;
  g.add(lid);
  const label = new THREE.MeshStandardMaterial({ map: labelTexture('SEVER 60Ah', '#f0f0f0', '#1f5fa8'), roughness: 0.5 });
  const lb = mesh(new THREE.PlaneGeometry(0.2, 0.09), label, { name: 'batteryLabel', cast: false });
  lb.position.set(0, 0.0, -0.0885);
  lb.rotation.y = Math.PI;
  g.add(lb);
  const red = new THREE.MeshStandardMaterial({ color: 0xb01818, roughness: 0.5 });
  for (const [x, mat, name] of [
    [0.085, red, 'terminalPlus'],
    [-0.085, mats.blackPlastic, 'terminalMinus'],
  ]) {
    const post = mesh(new THREE.CylinderGeometry(0.009, 0.01, 0.02, 12), mats.steel, { name: 'post' });
    post.position.set(x, 0.112, 0.055);
    g.add(post);
    const cover = mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.02, 12), mat, { name });
    cover.position.set(x, 0.12, 0.055);
    g.add(cover);
  }
  return shade(g);
}

export function buildRadiator(mats) {
  const g = new THREE.Group();
  g.name = 'radiator';
  const coreMat = mats.radiator.clone();
  coreMat.normalMap = finNormal();
  const core = mesh(new THREE.BoxGeometry(0.6, 0.36, 0.026), coreMat, { name: 'radiatorCore' });
  g.add(core);
  for (const s of [-1, 1]) {
    const tank = mesh(roundedBox(0.04, 0.4, 0.04, 0.01), mats.blackPlastic, { name: 'radiatorTank' });
    tank.position.x = s * 0.32;
    g.add(tank);
  }
  const cap = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 16), mats.steel, { name: 'radiatorCap' });
  cap.position.set(0.32, 0.215, 0);
  g.add(cap);
  // fan shroud and fan behind the core
  const shroud = mesh(roundedBox(0.58, 0.34, 0.04, 0.02), mats.blackPlastic, { name: 'fanShroud' });
  shroud.position.z = 0.035;
  g.add(shroud);
  const fan = new THREE.Group();
  fan.name = 'fan';
  for (let i = 0; i < 7; i++) {
    const blade = mesh(new THREE.BoxGeometry(0.02, 0.13, 0.004), mats.blackPlastic, { name: 'fanBlade' });
    blade.position.y = 0.075;
    const holder = new THREE.Group();
    holder.rotation.z = (i / 7) * Math.PI * 2;
    blade.rotation.y = 0.5;
    holder.add(blade);
    fan.add(holder);
  }
  const motor = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 16).rotateX(Math.PI / 2), mats.castIron, { name: 'fanMotor' });
  fan.add(motor);
  fan.position.set(0.08, 0, 0.065);
  g.add(fan);
  return shade(g);
}

export function buildAirBox(mats) {
  const g = new THREE.Group();
  g.name = 'airFilter';
  g.add(mesh(roundedBox(0.26, 0.1, 0.22, 0.02), mats.blackPlastic, { name: 'airBoxBase' }));
  const lid = mesh(roundedBox(0.265, 0.06, 0.225, 0.025), mats.blackPlastic, { name: 'airBoxLid' });
  lid.position.y = 0.075;
  g.add(lid);
  for (const [x, z] of [
    [-0.12, 0],
    [0.12, 0],
  ]) {
    const clip = mesh(new THREE.BoxGeometry(0.012, 0.05, 0.03), mats.steel, { name: 'airBoxClip' });
    clip.position.set(x * 1.06, 0.05, z);
    g.add(clip);
  }
  return shade(g);
}

export function buildReservoir(mats, kind) {
  const g = new THREE.Group();
  g.name = kind === 'coolant' ? 'coolantTank' : 'washerTank';
  if (kind === 'coolant') {
    g.add(mesh(roundedBox(0.12, 0.11, 0.1, 0.025), mats.coolantTank, { name: 'coolantBody' }));
    const cap = mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.025, 16), mats.blackPlastic, { name: 'coolantCap' });
    cap.position.set(0.02, 0.066, 0);
    g.add(cap);
    const fluid = mesh(roundedBox(0.112, 0.06, 0.092, 0.02), new THREE.MeshStandardMaterial({ color: 0x3fd4a0, roughness: 0.3, transparent: true, opacity: 0.8 }), { name: 'coolantFluid' });
    fluid.position.y = -0.02;
    g.add(fluid);
  } else {
    const cap = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 16), new THREE.MeshStandardMaterial({ color: 0x1f55b8, roughness: 0.45 }), { name: 'washerCap' });
    g.add(cap);
    const neck = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 12), mats.coolantTank, { name: 'washerNeck' });
    neck.position.y = -0.05;
    g.add(neck);
  }
  return shade(g);
}

export function buildBrakeBooster(mats) {
  const g = new THREE.Group();
  g.name = 'brakeBooster';
  const drum = mesh(latheY([[0.0001, -0.045], [0.1, -0.045], [0.118, -0.02], [0.118, 0.02], [0.1, 0.045], [0.0001, 0.045]], 28).rotateX(Math.PI / 2), mats.alloyDark, {
    name: 'booster',
  });
  g.add(drum);
  const mc = mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.14, 16).rotateX(Math.PI / 2), mats.aluminium, { name: 'masterCylinder' });
  mc.position.z = -0.11;
  g.add(mc);
  const res = mesh(roundedBox(0.09, 0.06, 0.06, 0.015), mats.coolantTank, { name: 'brakeReservoir' });
  res.position.set(0, 0.05, -0.11);
  g.add(res);
  const cap = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.015, 16), mats.yellow, { name: 'brakeCap' });
  cap.position.set(0, 0.087, -0.11);
  g.add(cap);
  return shade(g);
}

export function buildFuseBox(mats) {
  const g = new THREE.Group();
  g.name = 'fuseBox';
  g.add(mesh(roundedBox(0.16, 0.08, 0.12, 0.012), mats.blackPlastic, { name: 'fuseBoxBody' }));
  const lid = mesh(roundedBox(0.164, 0.025, 0.124, 0.01), mats.satinBlack, { name: 'fuseBoxLid' });
  lid.position.y = 0.045;
  g.add(lid);
  return shade(g);
}

/** Hoses and harness routing between the bay parts (car space). */
export function buildBayPlumbing(mats) {
  const g = new THREE.Group();
  g.name = 'plumbing';
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  g.add(mesh(tube([V(0.3, 0.7, -1.9), V(0.3, 0.74, -1.78), V(0.22, 0.78, -1.62), V(0.2, 0.76, -1.52)], 0.018, 20, 10), mats.hose, { name: 'upperHose' }));
  g.add(mesh(tube([V(-0.3, 0.4, -1.88), V(-0.2, 0.36, -1.75), V(-0.05, 0.4, -1.65)], 0.018, 20, 10), mats.hose, { name: 'lowerHose' }));
  g.add(mesh(tube([V(-0.3, 0.78, -1.28), V(-0.34, 0.82, -1.4), V(-0.3, 0.84, -1.52), V(-0.24, 0.84, -1.55)], 0.03, 20, 12), mats.hose, { name: 'intakeDuct' }));
  g.add(mesh(tube([V(-0.32, 0.72, -1.12), V(-0.38, 0.8, -1.3), V(-0.44, 0.76, -1.8)], 0.028, 20, 12), mats.blackPlastic, { name: 'airSnorkel' }));
  g.add(mesh(tube([V(-0.24, 0.79, -1.67), V(-0.1, 0.84, -1.6), V(0.05, 0.86, -1.5), V(0.18, 0.84, -1.2)], 0.007, 24, 6), mats.hose, { name: 'harness' }));
  g.add(mesh(tube([V(-0.4, 0.79, -1.67), V(-0.45, 0.6, -1.55), V(-0.42, 0.4, -1.4)], 0.008, 16, 6), new THREE.MeshStandardMaterial({ color: 0xa01414, roughness: 0.6 }), { name: 'batteryCable' }));
  return shade(g);
}

let finCache = null;
function finNormal() {
  if (finCache) return finCache;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 64;
  const g = c.getContext('2d');
  for (let y = 0; y < 64; y++) {
    const v = y % 4 < 2 ? 220 : 40;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(0, y, 16, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(20, 30);
  finCache = t;
  return t;
}

export { place };
