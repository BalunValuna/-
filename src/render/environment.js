import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { clamp, clamp01, lerp, smoothstep } from '../core/math.js';
import { Rng } from '../core/rng.js';

/**
 * Time of day, sun/moon lighting, sky dome, clouds, stars, fog and weather.
 * `time` is in hours [0, 24); `update(dt, playerPos)` advances time and follows the player.
 */
export const WEATHER = {
  clear: { cloud: 0.08, fog: 1, sun: 1, rain: 0, sand: 0, wet: 0 },
  cloudy: { cloud: 0.45, fog: 1.2, sun: 0.8, rain: 0, sand: 0, wet: 0 },
  overcast: { cloud: 0.85, fog: 1.8, sun: 0.35, rain: 0, sand: 0, wet: 0 },
  rain: { cloud: 0.95, fog: 3.2, sun: 0.22, rain: 1, sand: 0, wet: 1 },
  sandstorm: { cloud: 0.5, fog: 14, sun: 0.35, rain: 0, sand: 1, wet: 0 },
};

export class Environment {
  constructor(renderer, scene, { seed = 1 } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.rng = new Rng(seed * 31 + 7);
    this.time = 7.5;
    this.day = 1;
    this.secondsPerHour = 60;
    this.weather = 'clear';
    this.cur = { ...WEATHER.clear };
    this.target = { ...WEATHER.clear };
    this.weatherT = 600;
    this.frozenWeather = false;
    this.wind = new THREE.Vector2(1, 0.3);
    this.night = 0;
    this.onThunder = null;
    this.thunderT = 20;

    this.sky = new Sky();
    this.sky.scale.setScalar(9000);
    this.sky.material.depthWrite = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);
    this.clouds = makeCloudDome();
    scene.add(this.clouds);
    this.stars = makeStars();
    scene.add(this.stars);
    this.moon = makeMoon();
    scene.add(this.moon);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const S = 45;
    Object.assign(this.sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 320 });
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd6ff, 0x8a6a48, 0.6);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xc9d3dc, 0.0012);

    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.scale.setScalar(100);
    this.envScene.add(this.envSky);
    this.envTarget = null;
    this.envTimer = 0;
    this.lastEnvKey = '';

    this.rain = makeRain();
    scene.add(this.rain);
  }

  setWeather(name, blend = 60) {
    this.weather = name;
    this.target = { ...WEATHER[name] };
    this.weatherBlend = Math.max(blend, 0.01);
  }

  /** Sun elevation/azimuth for the current time (desert summer: 5:40 sunrise, 20:20 sunset). */
  computeSun() {
    const t = this.time;
    const dayFrac = (t - 5.67) / (20.33 - 5.67);
    const elev = Math.sin(dayFrac * Math.PI) * THREE.MathUtils.degToRad(68) - (dayFrac < 0 || dayFrac > 1 ? 0.35 : 0);
    const az = Math.PI * 0.5 + dayFrac * Math.PI + 0.35;
    this.sunDir.set(Math.cos(elev) * Math.cos(az), Math.sin(elev), Math.cos(elev) * Math.sin(az));
    const mt = (t + 12) % 24;
    const mFrac = (mt - 5.67) / (20.33 - 5.67);
    const mElev = Math.sin(mFrac * Math.PI) * THREE.MathUtils.degToRad(55);
    const mAz = Math.PI * 0.5 + mFrac * Math.PI + 0.5;
    this.moonDir.set(Math.cos(mElev) * Math.cos(mAz), Math.sin(mElev), Math.cos(mElev) * Math.sin(mAz));
    return elev;
  }

  update(dt, focus) {
    this.time += (dt / this.secondsPerHour) * (this.timeScale ?? 1);
    if (this.time >= 24) {
      this.time -= 24;
      this.day++;
    }
    // weather: blend towards target, occasionally pick a new one
    if (!this.frozenWeather) {
      this.weatherT -= dt;
      if (this.weatherT <= 0) {
        this.weatherT = this.rng.range(420, 1100);
        this.setWeather(
          this.rng.weighted([
            ['clear', 42],
            ['cloudy', 24],
            ['overcast', 12],
            ['rain', 10],
            ['sandstorm', 7],
          ]),
          90,
        );
      }
    }
    const k = 1 - Math.exp(-dt / (this.weatherBlend ?? 60));
    for (const key of Object.keys(this.cur)) this.cur[key] = lerp(this.cur[key], this.target[key], k);

    const elev = this.computeSun();
    const day = smoothstep(-0.12, 0.12, elev);
    this.night = 1 - day;
    const golden = smoothstep(0.5, 0.05, elev) * day;

    // sky shader
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir);
    u.turbidity.value = lerp(2.6, 9, this.cur.cloud) + this.cur.sand * 8;
    u.rayleigh.value = lerp(1.1, 0.5, this.cur.cloud) + golden * 0.8;
    u.mieCoefficient.value = 0.004 + this.cur.sand * 0.02;
    u.mieDirectionalG.value = 0.82;
    this.sky.visible = true;

    // lights
    const cloudDim = lerp(1, 0.3, this.cur.cloud) * this.cur.sun;
    const sunColor = new THREE.Color().setHSL(0.09 - golden * 0.03, 0.6 + golden * 0.3, 0.6 + (1 - golden) * 0.35);
    const moonUp = clamp01(this.moonDir.y * 3);
    if (day > 0.02) {
      this.sun.color.copy(sunColor);
      this.sun.intensity = 3.2 * day * cloudDim;
      this.lightDir = this.sunDir;
    } else {
      this.sun.color.setRGB(0.55, 0.65, 0.9);
      this.sun.intensity = 0.22 * moonUp * (1 - this.cur.cloud * 0.7);
      this.lightDir = this.moonDir;
    }
    const skyTint = new THREE.Color().setHSL(0.58, 0.35, 0.55).lerp(new THREE.Color(0x0b1224), this.night);
    const groundTint = new THREE.Color(0x9a7650).lerp(new THREE.Color(0x0a0908), this.night);
    this.hemi.color.copy(skyTint);
    this.hemi.groundColor.copy(groundTint);
    this.hemi.intensity = lerp(0.08, 0.75, day) * lerp(1, 0.75, this.cur.cloud) + this.cur.sand * 0.3 * day;

    // fog colour follows the horizon; sandstorm tints it orange
    const horizon = new THREE.Color(0xd2dde6).lerp(new THREE.Color(0xe7b186), golden * 0.8).lerp(new THREE.Color(0x05070c), this.night * 0.97);
    horizon.lerp(new THREE.Color(0xb98a5a).multiplyScalar(lerp(0.12, 1, day)), this.cur.sand);
    horizon.lerp(new THREE.Color(0x8a9096).multiplyScalar(lerp(0.1, 1, day)), this.cur.rain * 0.6);
    this.scene.fog.color.copy(horizon);
    this.scene.fog.density = 0.0011 * this.cur.fog + 0.0004 * this.night;
    this.fogColor = horizon;

    // clouds, stars, moon
    const cu = this.clouds.material.uniforms;
    cu.cover.value = this.cur.cloud;
    cu.time.value += dt * 0.004;
    cu.sunDir.value.copy(this.sunDir);
    cu.day.value = day;
    cu.tint.value.copy(horizon);
    this.stars.material.opacity = this.night * (1 - this.cur.cloud) * 0.95;
    this.moon.material.opacity = moonUp * (1 - this.cur.cloud * 0.8);

    // follow the focus point
    if (focus) {
      this.sky.position.copy(focus);
      this.clouds.position.copy(focus);
      this.stars.position.copy(focus);
      this.moon.position.copy(focus).addScaledVector(this.moonDir, 4000);
      this.moon.lookAt(focus);
      // shadow camera snapped to texels to avoid shimmering
      const S = 90 / 2048;
      const tx = Math.round(focus.x / S) * S;
      const tz = Math.round(focus.z / S) * S;
      this.sun.target.position.set(tx, focus.y, tz);
      this.sun.position.set(tx, focus.y, tz).addScaledVector(this.lightDir, 150);
      this.rain.position.copy(focus);
    }
    this.rain.visible = this.cur.rain > 0.05;
    if (this.rain.visible) {
      this.rain.material.uniforms.time.value += dt;
      this.rain.material.uniforms.amount.value = this.cur.rain;
    }
    // thunder during rain
    if (this.cur.rain > 0.6) {
      this.thunderT -= dt;
      if (this.thunderT < 0) {
        this.thunderT = this.rng.range(12, 40);
        this.flash = 1;
        this.onThunder?.(this.rng.range(0.5, 4), this.rng.range(0.5, 1));
      }
    }
    if (this.flash) {
      this.flash = Math.max(0, this.flash - dt * 4);
      this.hemi.intensity += this.flash * 1.5;
    }

    // environment map refresh when the light changed enough
    this.envTimer -= dt;
    const key = `${Math.round(this.time * 6)}|${Math.round(this.cur.cloud * 10)}|${Math.round(this.cur.sand * 10)}`;
    if (this.envTimer <= 0 && key !== this.lastEnvKey) this.refreshEnvMap(key);
  }

  refreshEnvMap(key = '') {
    this.lastEnvKey = key;
    this.envTimer = 2;
    const u = this.envSky.material.uniforms;
    const su = this.sky.material.uniforms;
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) u[k].value = su[k].value;
    u.sunPosition.value.copy(this.sunDir);
    this.envScene.background = null;
    const old = this.envTarget;
    this.envTarget = this.pmrem.fromScene(this.envScene, 0, 0.1, 200);
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = lerp(0.05, 1, 1 - this.night) * lerp(1, 0.6, this.cur.cloud);
    old?.dispose();
  }

  /** Wet road factor (0..1) for tyre grip and puddles. */
  get wetness() {
    return this.cur.wet;
  }
}

function makeCloudDome() {
  const geo = new THREE.SphereGeometry(3000, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    fog: false,
    uniforms: {
      cover: { value: 0.1 },
      time: { value: 0 },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      day: { value: 1 },
      tint: { value: new THREE.Color(0xffffff) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform float cover; uniform float time; uniform vec3 sunDir; uniform float day; uniform vec3 tint;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
      void main() {
        if (vDir.y < 0.0) discard;
        vec2 uv = vDir.xz / (vDir.y + 0.12) * 1.6 + vec2(time, time * 0.4);
        float n = fbm(uv);
        float d = smoothstep(1.0 - cover - 0.1, 1.0 - cover + 0.35, n);
        float horizonFade = smoothstep(0.0, 0.18, vDir.y);
        float lit = 0.55 + 0.45 * max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        vec3 col = mix(vec3(0.06, 0.07, 0.1), vec3(1.0), day) * lit;
        col = mix(col, tint, 0.35 + cover * 0.4);
        col *= mix(1.0, 0.55, cover * d);
        gl_FragColor = vec4(col, d * horizonFade * 0.95);
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -9;
  m.frustumCulled = false;
  return m;
}

function makeStars() {
  const rng = new Rng(4242);
  const n = 2400;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = rng.next() * 2 - 1;
    const a = rng.next() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * r * 3500, Math.abs(u) * 3500, Math.sin(a) * r * 3500], i * 3);
    const b = 0.5 + rng.next() * 0.5;
    col.set([b, b, b * (0.9 + rng.next() * 0.2)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const p = new THREE.Points(g, m);
  p.renderOrder = -8;
  p.frustumCulled = false;
  return p;
}

function makeMoon() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 10, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,250,235,1)');
  grad.addColorStop(0.42, 'rgba(240,238,225,1)');
  grad.addColorStop(0.5, 'rgba(200,210,230,0.25)');
  grad.addColorStop(1, 'rgba(160,180,220,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  m.renderOrder = -7;
  return m;
}

function makeRain() {
  const n = 5000;
  const pos = new Float32Array(n * 2 * 3);
  const seed = new Float32Array(n * 2);
  const rng = new Rng(99);
  for (let i = 0; i < n; i++) {
    const x = rng.range(-30, 30);
    const y = rng.range(0, 30);
    const z = rng.range(-30, 30);
    const s = rng.next();
    pos.set([x, y, z, x, y - 0.5, z], i * 6);
    seed[i * 2] = s;
    seed[i * 2 + 1] = s;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 }, amount: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float seed; uniform float time; varying float vA; uniform float amount;
      void main() {
        vec3 p = position;
        p.y = mod(p.y - time * (14.0 + seed * 6.0), 30.0) - 8.0;
        vA = step(seed, amount) * 0.35;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() { gl_FragColor = vec4(0.75, 0.8, 0.88, vA); }`,
  });
  const lines = new THREE.LineSegments(g, m);
  lines.frustumCulled = false;
  lines.visible = false;
  return lines;
}
