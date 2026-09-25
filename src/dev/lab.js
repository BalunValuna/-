import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildLabModel } from './labModel.js';
import { VIEWS } from './labViews.js';
import { DebugMaterials } from './debugMaterials.js';

/**
 * Car lab: studio viewer for the procedural car. Used interactively and by the model critic
 * (tools/critic) through the `window.lab` API. Query params:
 *   view=<name>  initial camera preset      debug=defects|normals|wire  material override
 *   w,h          fixed canvas size           state=hood,doors,trunk     open closures
 *   parts=...    visible part groups         clip=x:0.1                 section plane
 */
const params = new URLSearchParams(location.search);
addEventListener('error', (e) => (window.__labError = `${e.message} @ ${e.filename}:${e.lineno}`));
addEventListener('unhandledrejection', (e) => (window.__labError = String(e.reason?.stack || e.reason)));
const fixedW = Number(params.get('w')) || 0;
const fixedH = Number(params.get('h')) || 0;

document.body.style.cssText = 'margin:0;background:#1b1d20;overflow:hidden;font:13px system-ui,sans-serif;color:#ddd';
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(fixedW ? 1 : Math.min(devicePixelRatio, 2));
renderer.setSize(fixedW || innerWidth, fixedH || innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.localClippingEnabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2d31);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.9;

const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-4, 7, -3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 20 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3530, 0.35));

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(30, 64).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x5b5e63, roughness: 0.92 }),
);
ground.receiveShadow = true;
scene.add(ground);

const camera = new THREE.PerspectiveCamera(35, (fixedW || innerWidth) / (fixedH || innerHeight), 0.02, 200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const debug = new DebugMaterials();
const t0 = performance.now();
const model = buildLabModel();
const buildMs = performance.now() - t0;
scene.add(model.root);

const clipSpec = params.get('clip');
if (clipSpec) {
  const [axis, value] = clipSpec.split(':');
  const normal = new THREE.Vector3(axis === 'x' ? -1 : 0, axis === 'y' ? -1 : 0, axis === 'z' ? -1 : 0);
  renderer.clippingPlanes = [new THREE.Plane(normal, Number(value))];
}

function setView(name) {
  const v = VIEWS[name] || VIEWS.front34;
  camera.fov = v.fov ?? 35;
  camera.position.fromArray(v.pos);
  controls.target.fromArray(v.target);
  camera.near = v.near ?? 0.02;
  camera.updateProjectionMatrix();
  controls.update();
  model.setState(v.state || '');
  ground.visible = v.ground !== false;
}

function setDebug(mode) {
  debug.apply(model.root, mode);
  scene.background = new THREE.Color(mode === 'defects' ? 0xff00ff : 0x2a2d31);
  ground.visible = mode !== 'defects';
}

function render() {
  renderer.render(scene, camera);
}

function snap() {
  render();
  return renderer.domElement.toDataURL('image/png');
}

/**
 * Defect analysis of the current view: renders with back faces in green on a magenta background.
 *  - green pixels  = the inside of a skin is visible (a hole or a gap opening into the void)
 *  - enclosed magenta = background seen *through* the car (a see-through hole)
 * Returns counts and an annotated image (defects in red over a dimmed render).
 */
function analyze() {
  const prevBg = scene.background;
  const prevGround = ground.visible;
  setDebug('defects');
  render();
  const w = renderer.domElement.width;
  const h = renderer.domElement.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.drawImage(renderer.domElement, 0, 0);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const isMagenta = (i) => d[i] > 180 && d[i + 2] > 180 && d[i + 1] < 90;
  const isGreen = (i) => d[i + 1] > 170 && d[i] < 90 && d[i + 2] < 90;
  // flood fill background from the border; magenta not reached is enclosed
  const reached = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop();
    if (reached[p] || !isMagenta(p * 4)) continue;
    reached[p] = 1;
    const x = p % w;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (p >= w) stack.push(p - w);
    if (p < w * (h - 1)) stack.push(p + w);
  }
  let green = 0;
  let holes = 0;
  let body = 0;
  const out = g.createImageData(w, h);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    const bg = isMagenta(i);
    const hole = bg && !reached[p];
    const back = isGreen(i);
    if (!bg) body++;
    if (hole) holes++;
    if (back) green++;
    const lum = bg && reached[p] ? 25 : (d[i] + d[i + 1] + d[i + 2]) / 6 + 20;
    out.data[i] = hole || back ? 255 : lum;
    out.data[i + 1] = hole ? 0 : back ? 40 : lum;
    out.data[i + 2] = hole ? 255 : back ? 0 : lum;
    out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  setDebug('none');
  scene.background = prevBg;
  ground.visible = prevGround;
  return { green, holes, body, greenPct: (100 * green) / Math.max(body, 1), image: c.toDataURL('image/png') };
}

setView(params.get('view') || 'front34');
if (params.get('state')) model.setState(params.get('state'));
if (params.get('debug')) setDebug(params.get('debug'));
if (params.get('parts')) model.showOnly(params.get('parts').split(','));

window.lab = {
  views: Object.keys(VIEWS),
  setView,
  setDebug,
  setState: (s) => model.setState(s),
  showOnly: (list) => model.showOnly(list),
  showAll: () => model.showAll(),
  render,
  snap,
  analyze,
  model,
  stats: () => ({ buildMs, ...model.stats(), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
};

addEventListener('resize', () => {
  if (fixedW) return;
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

if (params.get('static')) {
  render();
} else {
  renderer.setAnimationLoop(() => {
    controls.update();
    render();
  });
}
window.__labReady = true;
