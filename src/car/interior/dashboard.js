import * as THREE from 'three';
import { surfaceNets } from '../../geo/surfaceNets.js';
import { clipMesh } from '../../geo/clip.js';
import { hemPanel } from '../../geo/hem.js';
import { roundMax, roundMin, sdRoundBox } from '../../geo/sdf.js';
import { ellipseSection, mesh, roundedBox, sweepProfile, roundRectSection } from '../../geo/primitives.js';
import { smoothstep } from '../../core/math.js';
import { bodyField } from '../body/shape.js';
import { clusterTextures, controlLabel, radioDisplay, speakerGrille, GAUGES, CLUSTER_PX, gaugeAngle } from '../../render/gaugeTextures.js';

/**
 * Dashboard ("торпеда") and driver controls. The dash body is an implicit shape clipped to stay
 * 25 mm inside the body skin, so it can never poke through the windshield or the doors.
 */
export const DRIVER_X = -0.37;
export const WHEEL_CENTER = new THREE.Vector3(DRIVER_X, 0.925, -0.4);
export const COLUMN_DIR = new THREE.Vector3(0, -0.42, -0.907).normalize(); // wheel → dash

const faceZ = (x, y) => {
  const ax = Math.abs(x);
  let z = -0.5 + 0.03 * Math.sin(Math.min(Math.max((y - 0.72) / 0.28, 0), 1) * Math.PI) - 0.13 * smoothstep(0.74, 0.5, y);
  return z - 0.1 * (ax / 0.78) ** 2;
};
const topY = (z) => 1.032 + (z + 0.5) * 0.12;

export function dashField(x, y, z) {
  const ax = Math.abs(x);
  const face = z - faceZ(x, y);
  const top = y - topY(z);
  const bottom = 0.56 - y - Math.max(0, -0.75 - z) * 0.6;
  const side = ax - 0.765;
  let d = roundMax(face, top, 0.035);
  d = roundMax(d, bottom, 0.05);
  d = roundMax(d, side, 0.01);
  // instrument binnacle over the cluster
  const bin = sdRoundBox(x - DRIVER_X, y - 1.035, z + 0.555, 0.235, 0.05, 0.095, 0.045);
  d = roundMin(d, bin, 0.03);
  // centre stack down to the tunnel
  const stack = sdRoundBox(x, y - 0.62, z + 0.56, 0.155, 0.33, 0.125, 0.03);
  d = roundMin(d, stack, 0.02);
  // recesses: cluster, central and side vents, radio, climate panel
  const cut = (cx, cy, cz, hx, hy, hz, r = 0.012) => sdRoundBox(x - cx, y - cy, z - cz, hx, hy, hz, r);
  d = roundMax(d, -cut(DRIVER_X, 0.968, -0.47, 0.19, 0.062, 0.09, 0.03), 0.008);
  for (const s of [-1, 1]) {
    d = Math.max(d, -cut(s * 0.082, 0.925, -0.44, 0.052, 0.034, 0.05));
    d = Math.max(d, -cut(s * 0.66, 0.925, faceZ(0.66, 0.925) + 0.01, 0.055, 0.034, 0.06));
  }
  d = Math.max(d, -cut(0, 0.79, -0.44, 0.105, 0.058, 0.025, 0.006));
  d = Math.max(d, -cut(0, 0.64, -0.44, 0.11, 0.05, 0.012, 0.008));
  // stay inside the skin
  return Math.max(d, bodyField(x, y, z) + 0.025);
}

const GLOVE = (x, y, z) => sdRoundBox(x - 0.4, y - 0.7, 0, 0.19, 0.075, 1, 0.03);

export function buildDashboard(mats) {
  const g = new THREE.Group();
  g.name = 'dashboard';
  const controls = { needles: {} };
  const t0 = performance.now();
  const raw = surfaceNets(dashField, { min: [-0.8, 0.3, -1.05], max: [0.8, 1.12, -0.36], cell: 0.011 });
  // glovebox lid is cut out of the dash face with a small gap
  const lidSkin = clipMesh(raw, (x, y, z) => Math.max(GLOVE(x, y, z) + 0.002, z + 0.72));
  const dashSkin = clipMesh(raw, (x, y, z) => Math.min(0.002 - GLOVE(x, y, z), -0.72 - z));
  const two = dashSkin.partition((x, y) => (y > 0.87 ? 'upper' : 'lower'));
  g.add(mesh(two.get('upper').toGeometry(), mats.dashPlastic, { name: 'dashUpper' }));
  g.add(mesh(two.get('lower').toGeometry(), mats.trimPlastic, { name: 'dashLower' }));
  const lid = hemPanel(lidSkin, { roll: 0.002, depth: 0.02, thickness: 0.002 });
  const lidGroup = new THREE.Group();
  lidGroup.name = 'glovebox';
  lidGroup.add(mesh(lid.outer.toGeometry(), mats.trimPlastic, { name: 'gloveLid' }));
  lidGroup.add(mesh(lid.inner.toGeometry(), mats.blackPlastic, { name: 'gloveLidInner' }));
  const gh = mesh(roundedBox(0.09, 0.02, 0.018, 0.006), mats.satinChrome, { name: 'gloveHandle' });
  gh.position.set(0.4, 0.755, faceZ(0.4, 0.755) + 0.012);
  lidGroup.add(gh);
  // pivot along the lower edge of the lid
  const pivot = new THREE.Group();
  pivot.name = 'glovebox_pivot';
  pivot.position.set(0.4, 0.625, faceZ(0.4, 0.625));
  lidGroup.position.sub(pivot.position);
  pivot.add(lidGroup);
  pivot.userData.hinge = { axis: new THREE.Vector3(1, 0, 0), open: 0.9, amount: 0 };
  g.add(pivot);
  controls.glovebox = pivot;

  // ---- instrument cluster
  const { map, emissive } = clusterTextures();
  const clusterMat = new THREE.MeshStandardMaterial({ map, emissiveMap: emissive, emissive: 0xffffff, emissiveIntensity: 0.0, roughness: 0.6 });
  controls.clusterMaterial = clusterMat;
  const cluster = new THREE.Group();
  cluster.name = 'cluster';
  cluster.position.set(DRIVER_X, 0.968, -0.545);
  cluster.rotation.x = -0.12;
  const cw = 0.36;
  const ch = (cw * CLUSTER_PX.h) / CLUSTER_PX.w;
  cluster.add(mesh(new THREE.PlaneGeometry(cw, ch), clusterMat, { name: 'clusterFace', cast: false }));
  const needleMat = new THREE.MeshStandardMaterial({ color: 0xff3b1f, emissive: 0xff2a10, emissiveIntensity: 0.6, roughness: 0.4 });
  for (const key of ['speed', 'rpm', 'fuel', 'temp']) {
    const spec = GAUGES[key];
    const px = (u) => (u / CLUSTER_PX.w - 0.5) * cw;
    const py = (v) => (0.5 - v / CLUSTER_PX.h) * ch;
    const len = (spec.r / CLUSTER_PX.w) * cw * 0.92;
    const hub = new THREE.Group();
    hub.position.set(px(spec.cx), py(spec.cy), 0.004);
    const needle = mesh(new THREE.BoxGeometry(len, len * 0.045, 0.002), needleMat, { name: 'needle', cast: false });
    needle.position.x = len / 2 - len * 0.12;
    hub.add(needle);
    hub.add(mesh(new THREE.CylinderGeometry(len * 0.08, len * 0.08, 0.004, 16).rotateX(Math.PI / 2), mats.satinBlack, { name: 'needleCap', cast: false }));
    hub.userData.spec = spec;
    const set = (frac) => (hub.rotation.z = -gaugeAngle(spec, frac));
    set(0);
    controls.needles[key] = { object: hub, set };
    cluster.add(hub);
  }
  const cover = mesh(new THREE.PlaneGeometry(cw * 1.02, ch * 1.05), mats.lens, { name: 'clusterGlass', cast: false });
  cover.position.z = 0.03;
  cover.userData.glass = true;
  cluster.add(cover);
  g.add(cluster);

  // ---- vents: frame + horizontal slats
  const vent = (x, y, z, w, h, ry = 0) => {
    const v = new THREE.Group();
    v.name = 'vent';
    v.position.set(x, y, z);
    v.rotation.y = ry;
    const ring = sweepProfile(
      [
        [-w / 2, -h / 2, 0],
        [w / 2, -h / 2, 0],
        [w / 2, h / 2, 0],
        [-w / 2, h / 2, 0],
      ].map((p) => new THREE.Vector3(...p)),
      roundRectSection(0.008, 0.012, 0.003),
      { closed: true },
    );
    v.add(mesh(ring, mats.satinChrome, { name: 'ventRing' }));
    for (let i = 0; i < 4; i++) {
      const slat = mesh(new THREE.BoxGeometry(w - 0.008, 0.003, 0.02), mats.satinBlack, { name: 'ventSlat', cast: false });
      slat.position.set(0, -h / 2 + (h * (i + 0.5)) / 4, -0.012);
      slat.rotation.x = -0.25;
      v.add(slat);
    }
    const back = mesh(new THREE.PlaneGeometry(w, h), mats.frit, { name: 'ventBack', cast: false });
    back.position.z = -0.03;
    v.add(back);
    return v;
  };
  for (const s of [-1, 1]) {
    g.add(vent(s * 0.082, 0.925, -0.442, 0.1, 0.064));
    g.add(vent(s * 0.66, 0.925, faceZ(0.66, 0.925) + 0.008, 0.106, 0.064, -s * 0.25));
  }
  const hazard = mesh(roundedBox(0.03, 0.022, 0.012, 0.004), new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.4 }), { name: 'hazard' });
  hazard.position.set(0, 0.925, -0.44);
  g.add(hazard);

  // ---- radio head unit
  const radio = new THREE.Group();
  radio.name = 'radio';
  radio.position.set(0, 0.79, -0.462);
  radio.add(mesh(roundedBox(0.205, 0.11, 0.02, 0.006), mats.glossBlack, { name: 'radioFace' }));
  const screenMat = new THREE.MeshStandardMaterial({ map: radioDisplay(), emissiveMap: radioDisplay(), emissive: 0xffffff, emissiveIntensity: 0.0, roughness: 0.3 });
  controls.radioMaterial = screenMat;
  const screen = mesh(new THREE.PlaneGeometry(0.11, 0.034), screenMat, { name: 'radioScreen', cast: false });
  screen.position.set(0, 0.018, 0.0105);
  radio.add(screen);
  for (const [x, r] of [
    [-0.078, 0.014],
    [0.078, 0.012],
  ]) {
    const knob = mesh(new THREE.CylinderGeometry(r, r, 0.016, 20).rotateX(Math.PI / 2), mats.satinChrome, { name: 'radioKnob' });
    knob.position.set(x, 0.012, 0.016);
    radio.add(knob);
  }
  for (let i = 0; i < 6; i++) {
    const b = mesh(roundedBox(0.024, 0.012, 0.006, 0.002), mats.satinBlack, { name: 'radioButton', cast: false });
    b.position.set(-0.07 + i * 0.028, -0.032, 0.012);
    radio.add(b);
  }
  g.add(radio);
  controls.radio = radio;

  // ---- climate panel: three knobs with labels
  const climate = new THREE.Group();
  climate.name = 'climate';
  climate.position.set(0, 0.64, -0.452);
  climate.add(mesh(roundedBox(0.22, 0.1, 0.008, 0.006), mats.satinBlack, { name: 'climatePanel' }));
  ['TEMP', 'FAN', 'MODE'].forEach((label, i) => {
    const x = -0.07 + i * 0.07;
    const knob = mesh(new THREE.CylinderGeometry(0.02, 0.021, 0.02, 24).rotateX(Math.PI / 2), mats.trimPlastic, { name: 'climateKnob' });
    knob.position.set(x, 0.008, 0.012);
    climate.add(knob);
    const ring = mesh(new THREE.TorusGeometry(0.021, 0.0025, 6, 24), mats.satinChrome, { name: 'knobRing', cast: false });
    ring.position.set(x, 0.008, 0.021);
    climate.add(ring);
    const lbl = mesh(new THREE.PlaneGeometry(0.04, 0.012), new THREE.MeshBasicMaterial({ map: controlLabel(label, { size: 34 }) }), { name: 'climateLabel', cast: false });
    lbl.position.set(x, -0.034, 0.0045);
    climate.add(lbl);
  });
  g.add(climate);

  // corner speaker grilles on the dash top
  const grilleMat = new THREE.MeshStandardMaterial({ map: speakerGrille(), roughness: 0.8 });
  for (const s of [-1, 1]) {
    const sp = mesh(new THREE.CircleGeometry(0.045, 20).rotateX(-Math.PI / 2 + 0.12), grilleMat, { name: 'dashSpeaker', cast: false });
    sp.position.set(s * 0.62, topY(-0.68) + 0.004, -0.68);
    g.add(sp);
  }

  // ---- steering column, wheel, stalks, key
  const col = new THREE.Group();
  col.name = 'steering';
  col.position.copy(WHEEL_CENTER);
  col.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), COLUMN_DIR);
  const shroud = mesh(roundedBox(0.12, 0.1, 0.24, 0.035), mats.trimPlastic, { name: 'columnShroud' });
  shroud.position.z = -0.2;
  col.add(shroud);
  const wheel = buildSteeringWheel(mats);
  col.add(wheel);
  controls.steeringWheel = wheel;
  for (const s of [-1, 1]) {
    const stalk = mesh(sweepProfile([new THREE.Vector3(s * 0.05, 0.01, -0.13), new THREE.Vector3(s * 0.13, 0.0, -0.12), new THREE.Vector3(s * 0.16, -0.005, -0.11)], ellipseSection(0.008, 0.008, 8)), mats.satinBlack, {
      name: s < 0 ? 'indicatorStalk' : 'wiperStalk',
    });
    col.add(stalk);
  }
  const key = new THREE.Group();
  key.name = 'key';
  key.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 16).rotateX(Math.PI / 2), mats.satinChrome, { name: 'ignitionBezel' }));
  const fob = mesh(roundedBox(0.03, 0.05, 0.012, 0.006), mats.blackPlastic, { name: 'keyFob' });
  fob.position.set(0, -0.03, 0.02);
  key.add(fob);
  key.position.set(0.075, -0.01, -0.2);
  key.rotation.y = 0.9;
  col.add(key);
  controls.key = key;
  g.add(col);

  // ---- pedals (hinged at the top)
  controls.pedals = {};
  for (const [name, x, w] of [
    ['clutch', DRIVER_X - 0.12, 0.06],
    ['brake', DRIVER_X + 0.0, 0.075],
    ['throttle', DRIVER_X + 0.14, 0.045],
  ]) {
    const p = new THREE.Group();
    p.name = `pedal_${name}`;
    p.position.set(x, 0.62, -0.72);
    const arm = mesh(new THREE.BoxGeometry(0.012, 0.28, 0.012), mats.steel, { name: 'pedalArm' });
    arm.position.set(0, -0.14, -0.02);
    arm.rotation.x = 0.25;
    p.add(arm);
    const pad = mesh(roundedBox(w, name === 'throttle' ? 0.11 : 0.065, 0.014, 0.006), mats.rubber, { name: 'pedalPad' });
    pad.position.set(0, -0.28, 0.03);
    pad.rotation.x = -0.5;
    p.add(pad);
    g.add(p);
    controls.pedals[name] = p;
  }

  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = o.castShadow && !o.userData.glass;
      o.receiveShadow = true;
    }
  });
  return { root: g, controls, buildMs: Math.round(performance.now() - t0) };
}

/** Four-spoke-look steering wheel with an airbag hub; faces local +Z (the driver). */
function buildSteeringWheel(mats) {
  const w = new THREE.Group();
  w.name = 'steeringWheel';
  const R = 0.183;
  const rim = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    rim.push(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0));
  }
  w.add(mesh(sweepProfile(rim, ellipseSection(0.0145, 0.019, 14), { closed: true, up: new THREE.Vector3(0, 0, 1) }), mats.leather, { name: 'rim' }));
  const hub = surfaceNets((x, y, z) => sdRoundBox(x, y + 0.012, z - 0.01, 0.068, 0.058, 0.028, 0.026), { min: [-0.09, -0.09, -0.03], max: [0.09, 0.07, 0.05], cell: 0.005 });
  w.add(mesh(hub.toGeometry(), mats.blackPlastic, { name: 'airbagHub' }));
  const badge = mesh(new THREE.TorusGeometry(0.014, 0.003, 6, 24), mats.chrome, { name: 'wheelBadge' });
  badge.position.set(0, -0.005, 0.04);
  badge.scale.set(1.35, 1, 1);
  w.add(badge);
  for (const [a, width] of [
    [0, 0.05],
    [Math.PI, 0.05],
    [-Math.PI / 2, 0.045],
  ]) {
    const pts = [];
    for (let t = 0; t <= 1.001; t += 0.25) {
      const r = 0.055 + (R - 0.07) * t;
      pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r - 0.012 * (1 - t), 0.01 - 0.02 * t));
    }
    w.add(mesh(sweepProfile(pts, roundRectSection(width, 0.014, 0.006), { up: new THREE.Vector3(0, 0, 1) }), mats.satinBlack, { name: 'spoke' }));
  }
  for (const s of [-1, 1]) {
    const pad = mesh(roundedBox(0.03, 0.022, 0.006, 0.003), mats.satinChrome, { name: 'wheelButtons', cast: false });
    pad.position.set(s * 0.1, 0.0, 0.02);
    w.add(pad);
  }
  return w;
}
