import * as THREE from 'three';

/**
 * Real light sources of the car: low/high beam spot lights, a red glow at the rear, the dome
 * light and the reversing glow. Emissive lamp materials (from the model) follow the same state.
 */
const BEAM_ANGLE = 0.5;
const LOW_CD = 9000;
const HIGH_CD = 55000;

export class CarLights {
  constructor(root, mats, controls, { shadows = false } = {}) {
    this.mats = mats;
    this.controls = controls;
    this.beams = [];
    beamMaps ??= { low: beamMap(false), high: beamMap(true) };
    for (const x of [-0.6, 0.6]) {
      // the cookie map shapes the beam (cut-off line, hot spot); the cone only bounds it
      const spot = new THREE.SpotLight(0xfff1dc, 0, 260, BEAM_ANGLE, 0.12, 2);
      spot.map = beamMaps.low;
      spot.position.set(x, 0.74, -1.95);
      spot.target.position.set(x, 0.74, -30);
      spot.castShadow = shadows && x < 0;
      if (spot.castShadow) {
        spot.shadow.mapSize.set(1024, 1024);
        spot.shadow.bias = -0.0004;
        spot.shadow.camera.near = 0.4;
        spot.shadow.camera.far = 60;
      }
      root.add(spot, spot.target);
      this.beams.push(spot);
    }
    // Tail, brake and reversing lamps light the ground behind the car through additive decals:
    // a point light there would also shine through the body into the cabin (no light occlusion).
    this.rear = groundGlow(root, 0xff2410, 2.6, 2.0, 3.2);
    this.reverse = groundGlow(root, 0xfff4e8, 2.0, 2.6, 3.6);
    this.dome = new THREE.PointLight(0xffe2b8, 0, 2.6, 1.6);
    this.dome.position.set(0, 1.33, 0.25);
    root.add(this.dome);
  }

  /**
   * @param s { beams: 0 | 1 | 2, drl, brake, reverse, turnL, turnR, dome, cluster, radio, power }
   * `power` (0..1) dims everything with a weak battery.
   */
  apply(s) {
    const L = this.mats.lamps;
    const p = s.power;
    const low = s.beams >= 1 ? p : 0;
    const high = s.beams === 2 ? p : 0;
    this.beams.forEach((b) => {
      b.map = high ? beamMaps.high : beamMaps.low;
      b.intensity = high ? HIGH_CD * high : LOW_CD * low;
    });
    L.low.emissiveIntensity = low * 6;
    L.projector.emissiveIntensity = low * 2.5;
    L.high.emissiveIntensity = high * 6;
    L.drl.emissiveIntensity = (s.drl ? 3.2 : 0) * p;
    const tail = (s.beams >= 1 ? 1 : 0) * p;
    L.tail.emissiveIntensity = tail * 2.2 + s.brake * 3 * p;
    L.brake.emissiveIntensity = s.brake * 4 * p + tail * 0.8;
    L.reverse.emissiveIntensity = s.reverse * 3 * p;
    L.turnL.emissiveIntensity = L.turnRearL.emissiveIntensity = s.turnL ? 4 * p : 0;
    L.turnR.emissiveIntensity = L.turnRearR.emissiveIntensity = s.turnR ? 4 * p : 0;
    this.rear.material.opacity = Math.min(1, (tail * 0.12 + s.brake * 0.3) * p);
    this.reverse.material.opacity = s.reverse * 0.45 * p;
    this.rear.visible = this.rear.material.opacity > 0.01;
    this.reverse.visible = this.reverse.material.opacity > 0.01;
    this.dome.intensity = s.dome * 0.9 * p;
    if (this.controls.domeMaterial) this.controls.domeMaterial.emissiveIntensity = s.dome * 1.4 * p;
    if (this.controls.clusterMaterial) this.controls.clusterMaterial.emissiveIntensity = s.cluster * 1.2 * p;
    if (this.controls.radioMaterial) this.controls.radioMaterial.emissiveIntensity = s.radio * 1.1 * p;
  }
}

let beamMaps = null;

/**
 * Headlamp beam pattern as a spot-light cookie (angles in degrees, +y up, +x right). Low beam: a
 * sharp cut-off just below the horizon with the 15° kink rising on the kerb side, the hot spot
 * just under it and a dim foreground so the road near the bumper is not glaring. High beam adds a
 * long-throw spot on the axis.
 */
function beamMap(high) {
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const img = g.createImageData(N, N);
  const tA = Math.tan(BEAM_ANGLE);
  const deg = 180 / Math.PI;
  for (let j = 0; j < N; j++) {
    // canvas row 0 is the top of the light's frustum (textures are flipped on upload)
    const ay = Math.atan((1 - ((j + 0.5) / N) * 2) * tA) * deg;
    for (let i = 0; i < N; i++) {
      const ax = Math.atan((((i + 0.5) / N) * 2 - 1) * tA) * deg;
      const cut = -0.6 + Math.min(Math.max(ax, 0), 6) * 0.27;
      const below = 1 - smooth(cut - 0.3, cut + 0.3, ay);
      const peak = cut - 1.3;
      const vert = ay > peak ? 1 : 0.02 + 0.98 * Math.exp(-(((ay - peak) / 2.1) ** 2));
      const hor = 0.18 + 0.82 * Math.exp(-(((ax - 1.5) / 12) ** 2));
      let v = (below * vert + 0.012) * hor;
      if (high) {
        // high beam: long-throw spot on the axis plus the low beam's spread (as a fraction of peak)
        const spot = Math.exp(-(((ay + 0.7) / 2.2) ** 2) - ((ax / 8) ** 2));
        v = Math.max(spot, v * (LOW_CD / HIGH_CD));
      }
      const k = (j * N + i) * 4;
      const b = Math.round(Math.min(1, v) * 255);
      img.data[k] = img.data[k + 1] = img.data[k + 2] = b;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

let glowTexture = null;

/** Soft additive light pool on the ground (car space), `w` × `l` metres centred at z. */
function groundGlow(root, color, w, l, z) {
  if (!glowTexture) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 40, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    glowTexture = new THREE.CanvasTexture(c);
  }
  const mat = new THREE.MeshBasicMaterial({
    color,
    map: glowTexture,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2), mat);
  m.position.set(0, 0.03, z);
  m.renderOrder = 2;
  m.visible = false;
  m.name = 'groundGlow';
  root.add(m);
  return m;
}
