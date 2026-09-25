import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Hands, POSES } from '../player/Hands.js';

/** Dev page: the first-person hands in each pose, for screenshots (window.lab API like the car lab). */
const params = new URLSearchParams(location.search);
addEventListener('error', (e) => (window.__labError = `${e.message} @ ${e.filename}:${e.lineno}`));
const w = Number(params.get('w')) || innerWidth;
const h = Number(params.get('h')) || innerHeight;
document.body.style.cssText = 'margin:0;background:#222;overflow:hidden';
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(w, h);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3b4148);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;
const sun = new THREE.DirectionalLight(0xfff2e0, 2.2);
sun.position.set(-2, 3, 1);
scene.add(sun, new THREE.HemisphereLight(0xcfe0ff, 0x6b5a48, 0.5));
const camera = new THREE.PerspectiveCamera(70, w / h, 0.01, 50);
scene.add(camera);
const hands = new Hands();
camera.add(hands.view);

function show(mode, poseR = 'relaxed', poseL = poseR, extra = {}) {
  hands.place('right', mode, poseR);
  hands.place('left', extra.left || mode, poseL);
  for (let i = 0; i < 90; i++) hands.update(1 / 60, {});
}

function closeup(pose, side = 1, yaw = 0.6, pitch = 0.2) {
  const hand = side > 0 ? hands.right : hands.left;
  hand.setPose(pose);
  for (let i = 0; i < 90; i++) hand.update(1 / 60);
  hands.left.root.visible = side < 0;
  hands.right.root.visible = side > 0;
  hand.root.position.set(0, 0, -0.3);
  hand.root.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0));
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/png');
}

window.lab = {
  poses: Object.keys(POSES),
  show,
  closeup,
  snap: () => {
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  },
  hands,
  camera,
};
show('rest');
renderer.render(scene, camera);
window.__labReady = true;
