import * as THREE from 'three';
import { coilSpring, latheY, mesh, roundedBox, sweepProfile, roundRectSection, tube } from '../../geo/primitives.js';
import { CAR, WHEELS } from '../design.js';

/**
 * Running gear under the body: MacPherson front struts, lower arms, driveshafts, steering rack,
 * rear torsion beam with springs and dampers, exhaust line with muffler, fuel tank.
 * Corner assemblies expose `update(travel, steer)` so the physics can drive them.
 */
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildChassis(mats) {
  const g = new THREE.Group();
  g.name = 'chassis';
  const corners = {};
  const add = (parent, geo, mat, name) => {
    const m = mesh(geo, mat, { name });
    parent.add(m);
    return m;
  };

  for (const [id, w] of Object.entries(WHEELS)) {
    const side = w.left ? -1 : 1;
    const corner = new THREE.Group();
    corner.name = `suspension_${id}`;
    g.add(corner);
    if (w.front) {
      // strut: damper body, coil spring and top between the knuckle and the tower
      const strut = new THREE.Group();
      strut.name = 'strut';
      strut.position.set(side * (Math.abs(w.x) - 0.12), CAR.wheelY + 0.08, w.z);
      add(strut, new THREE.CylinderGeometry(0.026, 0.026, 0.3, 14), mats.steel, 'damper').position.y = 0.15;
      const spring = add(strut, coilSpring(0.068, 0.0075, 0.24, 5.5), mats.spring, 'coil');
      spring.position.y = 0.2;
      add(strut, new THREE.CylinderGeometry(0.075, 0.075, 0.012, 20), mats.steel, 'springSeat').position.y = 0.2;
      add(strut, new THREE.CylinderGeometry(0.012, 0.012, 0.18, 10), mats.chrome, 'piston').position.y = 0.4;
      strut.rotation.z = side * 0.12;
      corner.add(strut);
      // lower arm from the subframe to the knuckle
      add(corner, sweepProfile([V(side * 0.36, 0.2, w.z - 0.12), V(side * 0.62, 0.21, w.z), V(side * 0.36, 0.2, w.z + 0.16)], roundRectSection(0.05, 0.02, 0.006)), mats.castIron, 'lowerArm');
      // driveshaft with CV boots
      add(corner, tube([V(side * 0.26, CAR.wheelY - 0.01, w.z + 0.03), V(side * 0.66, CAR.wheelY, w.z)], 0.014, 8, 8), mats.steel, 'driveshaft');
      const boot = add(corner, latheY([[0.022, 0], [0.036, 0.02], [0.028, 0.04], [0.038, 0.06], [0.03, 0.08], [0.02, 0.1]], 14), mats.rubber, 'cvBoot');
      boot.position.set(side * 0.6, CAR.wheelY, w.z);
      boot.rotation.z = side * (Math.PI / 2);
      // tie rod
      add(corner, tube([V(side * 0.3, 0.32, w.z + 0.16), V(side * 0.64, 0.33, w.z + 0.14)], 0.009, 6, 6), mats.steel, 'tieRod');
    } else {
      // rear: damper and a separate spring on the beam
      const damper = add(corner, new THREE.CylinderGeometry(0.022, 0.022, 0.34, 12), mats.steel, 'rearDamper');
      damper.position.set(side * 0.58, CAR.wheelY + 0.18, w.z + 0.12);
      damper.rotation.x = 0.2;
      const spring = add(corner, coilSpring(0.055, 0.0075, 0.2, 5), mats.spring, 'rearCoil');
      spring.position.set(side * 0.5, CAR.wheelY - 0.04, w.z - 0.02);
    }
    corners[id] = corner;
  }
  // rear torsion beam axle
  add(g, sweepProfile([V(-0.62, CAR.wheelY - 0.04, CAR.axleR), V(0, CAR.wheelY - 0.06, CAR.axleR - 0.05), V(0.62, CAR.wheelY - 0.04, CAR.axleR)], roundRectSection(0.09, 0.07, 0.01)), mats.castIron, 'torsionBeam');
  for (const side of [-1, 1]) {
    add(g, sweepProfile([V(side * 0.62, CAR.wheelY - 0.03, CAR.axleR + 0.02), V(side * 0.58, 0.28, CAR.axleR - 0.45)], roundRectSection(0.06, 0.08, 0.01)), mats.castIron, 'trailingArm');
  }
  // front subframe and steering rack
  add(g, sweepProfile([V(-0.42, 0.2, -1.45), V(0, 0.19, -1.5), V(0.42, 0.2, -1.45)], roundRectSection(0.1, 0.05, 0.01)), mats.castIron, 'subframe');
  add(g, new THREE.CylinderGeometry(0.025, 0.025, 0.62, 12).rotateZ(Math.PI / 2), mats.aluminium, 'steeringRack').position.set(0, 0.32, -1.16);

  // exhaust: downpipe, catalyst, centre pipe, muffler, tail pipe
  const exhaust = [V(0.0, 0.34, -1.62), V(0.02, 0.2, -1.5), V(0.04, 0.2, -1.1), V(0.02, 0.24, -0.4), V(-0.05, 0.25, 0.6), V(-0.3, 0.26, 1.35), V(-0.44, 0.26, 1.7)];
  add(g, tube(exhaust, 0.024, 60, 10), mats.exhaust, 'exhaustPipe');
  const cat = add(g, roundedBox(0.13, 0.1, 0.3, 0.04), mats.satinChrome, 'catalyst');
  cat.position.set(0.035, 0.21, -0.95);
  const muffler = add(g, roundedBox(0.34, 0.14, 0.34, 0.06), mats.exhaust, 'muffler');
  muffler.position.set(-0.4, 0.27, 1.88);
  add(g, tube([V(-0.44, 0.27, 2.02), V(-0.46, 0.27, 2.12)], 0.028, 4, 12), mats.exhaust, 'tailPipe');
  // fuel tank under the rear seat, filler neck to the right quarter
  const tank = add(g, roundedBox(0.8, 0.2, 0.44, 0.06), mats.blackPlastic, 'fuelTank');
  tank.position.set(0.05, 0.3, 0.92);
  add(g, tube([V(0.35, 0.34, 0.95), V(0.62, 0.55, 1.4), V(0.8, 0.86, 1.74)], 0.02, 20, 8), mats.hose, 'fillerNeck');

  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { root: g, corners };
}
