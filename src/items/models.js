import * as THREE from 'three';
import { roundedBox, latheY } from '../geo/primitives.js';
import { fieldGeometry } from '../geo/fieldMesh.js';
import { sdRoundBox, smax } from '../geo/sdf.js';
import { M } from '../world/build/materials.js';

/**
 * Procedural item models, centred on their collider. `userData.grip` = { pos, rot } is where the
 * right hand holds the item (item space), so held items sit in the fist instead of floating.
 */
const cache = new Map();

function labelTexture(text, bg, fg, band = null) {
  const key = `${text}${bg}${fg}${band}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 128);
  if (band) {
    g.fillStyle = band;
    g.fillRect(0, 40, 256, 48);
  }
  g.fillStyle = fg;
  g.font = 'bold 34px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 64);
  g.fillText(text, 0, 64);
  g.fillText(text, 256, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  cache.set(key, t);
  return t;
}

const std = (o) => new THREE.MeshStandardMaterial(o);
const mesh = (g, m) => {
  const x = new THREE.Mesh(g, m);
  x.castShadow = true;
  x.receiveShadow = true;
  return x;
};
const grip = (x, y, z, rx = 0, ry = 0, rz = 0) => ({ pos: new THREE.Vector3(x, y, z), rot: new THREE.Euler(rx, ry, rz) });

function can(r, h, label) {
  const g = new THREE.Group();
  const body = mesh(new THREE.CylinderGeometry(r, r, h * 0.92, 24, 1, true), std({ map: label, roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide }));
  g.add(body);
  for (const s of [-1, 1]) {
    const lid = mesh(new THREE.CylinderGeometry(r * 0.97, r * 0.97, h * 0.04, 24), M.metal(0xc8c8c8, 0.3));
    lid.position.y = (s * h * 0.48);
    g.add(lid);
  }
  return g;
}

const BUILDERS = {
  jerrycan: () => jerrycan(0.16, 0.4, 0.34, 0x5a6a3a),
  jerrycan_s: () => jerrycan(0.13, 0.32, 0.26, 0xa03020),
  oilcan: () => jug(0x2a3a8a, 'OIL 5W-40', 0.12, 0.26, 0.2),
  coolant: () => jug(0x3aa050, 'ANTIFREEZE', 0.14, 0.28, 0.2),
  water() {
    const g = new THREE.Group();
    const prof = [
      [0.001, -0.15],
      [0.036, -0.15],
      [0.042, -0.14],
      [0.042, 0.05],
      [0.03, 0.1],
      [0.014, 0.125],
      [0.014, 0.14],
    ];
    g.add(mesh(latheY(prof, 24), new THREE.MeshPhysicalMaterial({ color: 0xbfe0f0, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.55, clearcoat: 1 })));
    const cap = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.022, 16), M.plastic(0x2a6ac0, 0.4));
    cap.position.y = 0.15;
    g.add(cap);
    const lab = mesh(new THREE.CylinderGeometry(0.0425, 0.0425, 0.07, 24, 1, true), std({ map: labelTexture('ВОДА', '#e8f2f8', '#2a6ac0', '#2a6ac0'), roughness: 0.6 }));
    lab.position.y = -0.04;
    g.add(lab);
    g.userData.grip = grip(0, -0.02, 0, 0, 0, Math.PI / 2);
    return g;
  },
  canister() {
    const g = new THREE.Group();
    g.add(mesh(latheY([[0.001, -0.19], [0.12, -0.19], [0.13, -0.17], [0.13, 0.12], [0.1, 0.17], [0.05, 0.19], [0.05, 0.22]], 28), M.plastic(0xd8d0b8, 0.5)));
    const handle = mesh(new THREE.TorusGeometry(0.07, 0.012, 8, 20, Math.PI), M.plastic(0xd8d0b8, 0.5));
    handle.position.y = 0.17;
    g.add(handle);
    g.userData.grip = grip(0, 0.23, 0, 0, Math.PI / 2, 0);
    return g;
  },
  stew: () => withGrip(can(0.05, 0.11, labelTexture('ТУШЁНКА', '#c8b070', '#6a2a1a', '#e8d8a0')), grip(0, 0, 0, 0, 0, Math.PI / 2)),
  beans: () => withGrip(can(0.045, 0.12, labelTexture('ФАСОЛЬ', '#8a3020', '#f0e0c0', '#a84030')), grip(0, 0, 0, 0, 0, Math.PI / 2)),
  soda() {
    const g = new THREE.Group();
    g.add(mesh(latheY([[0.001, -0.062], [0.026, -0.062], [0.033, -0.055], [0.033, 0.05], [0.026, 0.062], [0.001, 0.062]], 24), std({ map: labelTexture('COLA', '#c02020', '#ffffff'), roughness: 0.3, metalness: 0.6 })));
    g.userData.grip = grip(0, 0, 0, 0, 0, Math.PI / 2);
    return g;
  },
  sprats() {
    const g = new THREE.Group();
    g.add(mesh(roundedBox(0.16, 0.028, 0.1, 0.012, 2), std({ map: labelTexture('ШПРОТЫ', '#d8b040', '#3a2a10'), roughness: 0.3, metalness: 0.6 })));
    g.userData.grip = grip(0.06, 0, 0, 0, 0, 0);
    return g;
  },
  chocolate() {
    const g = new THREE.Group();
    g.add(mesh(roundedBox(0.16, 0.014, 0.075, 0.004, 1), std({ map: labelTexture('Шоколад', '#5a2a1a', '#e8d0a0', '#7a3a24'), roughness: 0.5 })));
    g.userData.grip = grip(0.06, 0, 0);
    return g;
  },
  chips() {
    const g = new THREE.Group();
    const bag = fieldGeometry((x, y, z) => sdRoundBox(x, y, z * (1 + (y * y) * 30), 0.07, 0.11, 0.012, 0.012), [-0.1, -0.14, -0.05], [0.1, 0.14, 0.05], 0.006);
    g.add(mesh(bag, std({ color: 0xe8b020, roughness: 0.35, metalness: 0.3 })));
    g.userData.grip = grip(0, -0.06, 0);
    return g;
  },
  coffee() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.24, 24), M.metal(0x3a5a4a, 0.35)));
    const cup = mesh(new THREE.CylinderGeometry(0.047, 0.045, 0.06, 24), M.plastic(0x2a2a2a, 0.4));
    cup.position.y = 0.14;
    g.add(cup);
    g.userData.grip = grip(0, -0.02, 0, 0, 0, Math.PI / 2);
    return g;
  },
  medkit() {
    const g = new THREE.Group();
    g.add(mesh(roundedBox(0.24, 0.1, 0.18, 0.015, 2), M.plastic(0xe8e4dc, 0.5)));
    for (const [w, d] of [[0.1, 0.03], [0.03, 0.1]]) {
      const c = mesh(new THREE.BoxGeometry(w, 0.004, d), M.paint(0xc02020, 0.5));
      c.position.y = 0.051;
      g.add(c);
    }
    g.userData.grip = grip(0, 0, 0.06, 0, 0, 0);
    return g;
  },
  bandage() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 20), M.fabric(0xf0ece4, 'weave')));
    g.userData.grip = grip(0, 0, 0);
    return g;
  },
  wrench() {
    const g = new THREE.Group();
    const steel = M.metal(0xb8bcc0, 0.25);
    const shaft = mesh(roundedBox(0.022, 0.009, 0.22, 0.004, 1), steel);
    g.add(shaft);
    const ring = mesh(new THREE.TorusGeometry(0.018, 0.007, 8, 18).rotateX(Math.PI / 2), steel);
    ring.position.z = -0.12;
    g.add(ring);
    const jaw = mesh(fieldGeometry((x, y, z) => smax(sdRoundBox(x, y, z, 0.022, 0.005, 0.02, 0.004), -sdRoundBox(x, y, z + 0.016, 0.012, 0.02, 0.02, 0.001), 0.002), [-0.03, -0.01, -0.03], [0.03, 0.01, 0.03], 0.002), steel);
    jaw.position.z = 0.13;
    g.add(jaw);
    g.userData.grip = grip(0, 0, 0.03, 0, Math.PI / 2, Math.PI / 2);
    return g;
  },
  crowbar() {
    const g = new THREE.Group();
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.02, -0.38), new THREE.Vector3(0, 0, -0.3), new THREE.Vector3(0, 0, 0.32), new THREE.Vector3(0, 0.03, 0.37), new THREE.Vector3(0, 0.07, 0.36)]);
    g.add(mesh(new THREE.TubeGeometry(c, 30, 0.011, 8), M.paint(0x2a2a2a, 0.5)));
    g.userData.grip = grip(0, 0, -0.2, 0, Math.PI / 2, Math.PI / 2);
    return g;
  },
  pipe() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.66, 14), M.rust()));
    g.userData.grip = grip(0, -0.22, 0, 0, 0, Math.PI / 2);
    return g;
  },
  revolver() {
    const g = new THREE.Group();
    const steel = M.metal(0x2a2c30, 0.3);
    const barrel = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.14, 12).rotateX(Math.PI / 2), steel);
    barrel.position.set(0, 0.04, -0.07);
    const cyl = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 12).rotateX(Math.PI / 2), steel);
    cyl.position.set(0, 0.035, 0.01);
    const frame = mesh(roundedBox(0.022, 0.035, 0.08, 0.005, 1), steel);
    frame.position.set(0, 0.04, 0.03);
    const gripM = mesh(roundedBox(0.024, 0.085, 0.035, 0.008, 2), M.wood(0x5a3a22));
    gripM.position.set(0, -0.01, 0.07);
    gripM.rotation.x = 0.35;
    g.add(barrel, cyl, frame, gripM);
    g.userData.grip = grip(0, -0.01, 0.07, 0, Math.PI / 2, 0);
    return g;
  },
  ammo() {
    const g = new THREE.Group();
    g.add(mesh(roundedBox(0.08, 0.05, 0.06, 0.004, 1), std({ map: labelTexture('.38', '#c8a040', '#2a1a0a'), roughness: 0.6 })));
    g.userData.grip = grip(0, 0, 0);
    return g;
  },
  flashlight() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.16, 16).rotateX(Math.PI / 2), M.metal(0x2a2a2a, 0.4)));
    const head = mesh(new THREE.CylinderGeometry(0.028, 0.019, 0.05, 16).rotateX(Math.PI / 2), M.metal(0x3a3a3a, 0.35));
    head.position.z = -0.1;
    const lens = mesh(new THREE.CircleGeometry(0.025, 16).rotateY(Math.PI), M.emissive(0xfff4e0, 0));
    lens.position.z = -0.126;
    lens.name = 'lens';
    g.add(head, lens);
    g.userData.grip = grip(0, 0, 0.03, 0, Math.PI / 2, Math.PI / 2);
    return g;
  },
  money() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.14, 0.012, 0.07), std({ map: labelTexture('1000', '#a8b890', '#4a5a3a'), roughness: 0.9 })));
    const band = mesh(new THREE.BoxGeometry(0.02, 0.014, 0.072), M.paint(0xd8c890, 0.8));
    g.add(band);
    g.userData.grip = grip(0.05, 0, 0);
    return g;
  },
  compass() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.018, 24), M.metal(0xb89a60, 0.3)));
    const face = mesh(new THREE.CircleGeometry(0.026, 24).rotateX(-Math.PI / 2), std({ map: compassFace(), roughness: 0.4 }));
    face.position.y = 0.0095;
    face.name = 'compassFace';
    g.add(face);
    g.userData.grip = grip(0, -0.01, 0);
    return g;
  },
  repairkit() {
    const g = new THREE.Group();
    g.add(mesh(roundedBox(0.4, 0.16, 0.2, 0.01, 1), M.paint(0xb02820, 0.45)));
    const h = mesh(new THREE.TorusGeometry(0.05, 0.01, 8, 16, Math.PI), M.paint(0x1a1a1a, 0.5));
    h.position.y = 0.08;
    g.add(h);
    g.userData.grip = grip(0, 0.12, 0, 0, Math.PI / 2, 0);
    return g;
  },
  tape() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.TorusGeometry(0.038, 0.014, 10, 24).scale(1, 1, 2.2), M.plastic(0x7a7e82, 0.4)));
    g.userData.grip = grip(0, 0, 0);
    return g;
  },
  crate() {
    const g = new THREE.Group();
    const w = M.planks(0x9a7a52, 51);
    g.add(mesh(new THREE.BoxGeometry(0.6, 0.44, 0.44), w));
    return g;
  },
  box() {
    const g = new THREE.Group();
    g.add(mesh(roundedBox(0.44, 0.32, 0.34, 0.006, 1), M.paint(0xa8845a, 0.9)));
    const tapeM = mesh(new THREE.BoxGeometry(0.1, 0.322, 0.342), M.paint(0xc8b890, 0.3));
    g.add(tapeM);
    return g;
  },
  barrel() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 24), M.paint(0x2a4a7a, 0.5)));
    return g;
  },
  note() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.15, 0.002, 0.21), std({ map: paperTexture(), roughness: 0.95 })));
    g.userData.grip = grip(0.05, 0, 0.06);
    return g;
  },
};

function withGrip(g, gr) {
  g.userData.grip = gr;
  return g;
}

function jerrycan(w, h, d, color) {
  const g = new THREE.Group();
  const mat = M.paint(color, 0.55);
  const body = fieldGeometry(
    (x, y, z) => {
      let s = sdRoundBox(x, y + 0.02, z, w / 2 - 0.012, h / 2 - 0.05, d / 2 - 0.012, 0.012);
      // stamped X on both faces
      const ex = Math.abs(Math.abs(y + 0.02) - Math.abs(z) * ((h - 0.1) / d)) < 0.012 && Math.abs(z) < d / 2 - 0.03 && Math.abs(y + 0.02) < h / 2 - 0.08 ? 0.004 : 0;
      s += ex * (Math.abs(x) > w / 2 - 0.02 ? 1 : 0);
      return s;
    },
    [-w / 2 - 0.01, -h / 2 - 0.01, -d / 2 - 0.01],
    [w / 2 + 0.01, h / 2 - 0.02, d / 2 + 0.01],
    0.008,
  );
  g.add(mesh(body, mat));
  // three-bar handle and spout
  for (const z of [-d / 4, 0, d / 4]) {
    const bar = mesh(new THREE.CylinderGeometry(0.009, 0.009, w * 0.6, 8).rotateZ(Math.PI / 2), mat);
    bar.position.set(0, h / 2 - 0.02, z);
    g.add(bar);
  }
  const ridge = mesh(new THREE.BoxGeometry(w * 0.3, 0.03, d * 0.7), mat);
  ridge.position.y = h / 2 - 0.045;
  g.add(ridge);
  const spout = mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.05, 12), M.metal(0x6a6a6a, 0.4));
  spout.position.set(0, h / 2 - 0.03, d / 2 - 0.04);
  spout.rotation.x = 0.4;
  g.add(spout);
  g.userData.grip = grip(0, h / 2 - 0.02, 0, 0, Math.PI / 2, 0);
  return g;
}

function jug(color, text, w, h, d) {
  const g = new THREE.Group();
  const body = fieldGeometry((x, y, z) => sdRoundBox(x, y + 0.02, z, w / 2 - 0.02, h / 2 - 0.04, d / 2 - 0.02, 0.02), [-w / 2, -h / 2, -d / 2], [w / 2, h / 2 - 0.01, d / 2], 0.007);
  g.add(mesh(body, M.plastic(color, 0.45)));
  const lab = mesh(new THREE.PlaneGeometry(d * 0.7, h * 0.45), std({ map: labelTexture(text, '#f0f0f0', '#1a1a1a'), roughness: 0.6 }));
  lab.position.set(w / 2 - 0.018, -0.02, 0);
  lab.rotation.y = Math.PI / 2;
  g.add(lab);
  const handle = mesh(new THREE.TorusGeometry(0.035, 0.01, 8, 16, Math.PI), M.plastic(color, 0.45));
  handle.position.set(0, h / 2 - 0.035, -d / 4);
  handle.rotation.y = Math.PI / 2;
  g.add(handle);
  const cap = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.025, 12), M.plastic(0x1a1a1a, 0.4));
  cap.position.set(0, h / 2 - 0.01, d / 4);
  g.add(cap);
  g.userData.grip = grip(0, h / 2 - 0.03, -d / 4, 0, Math.PI / 2, 0);
  return g;
}

function compassFace() {
  if (cache.has('compass')) return cache.get('compass');
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#e8e2d0';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#1a1a1a';
  g.font = 'bold 20px Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const [txt, a] of [['С', 0], ['В', 90], ['Ю', 180], ['З', 270]]) {
    const r = (a * Math.PI) / 180;
    g.fillText(txt, 64 + Math.sin(r) * 44, 64 - Math.cos(r) * 44);
  }
  g.fillStyle = '#c02020';
  g.beginPath();
  g.moveTo(64, 28);
  g.lineTo(70, 64);
  g.lineTo(58, 64);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set('compass', t);
  return t;
}

function paperTexture() {
  if (cache.has('paper')) return cache.get('paper');
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 180;
  const g = c.getContext('2d');
  g.fillStyle = '#ece4d0';
  g.fillRect(0, 0, 128, 180);
  g.strokeStyle = 'rgba(40,40,80,0.55)';
  for (let y = 22; y < 170; y += 11) {
    g.beginPath();
    g.moveTo(12, y);
    let x = 12;
    while (x < 112) {
      x += 4 + Math.random() * 8;
      g.lineTo(x, y + (Math.random() - 0.5) * 2);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set('paper', t);
  return t;
}

const protos = new Map();

/** A new instance of the item model (geometry and materials shared). */
export function itemModel(id) {
  if (!protos.has(id)) {
    const make = BUILDERS[id] || BUILDERS.box;
    const g = make();
    g.name = id;
    protos.set(id, g);
  }
  const p = protos.get(id);
  const c = p.clone(true);
  c.userData = { ...p.userData };
  return c;
}
