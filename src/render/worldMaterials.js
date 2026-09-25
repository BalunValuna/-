import * as THREE from 'three';
import { heightToNormal } from './textures.js';
import { Rng } from '../core/rng.js';

/**
 * Materials for the landscape: vertex-coloured desert ground with a tiling detail normal map,
 * and asphalt with shoulders and lane markings drawn into one repeating texture.
 */
export function makeWorldMaterials() {
  const terrain = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    normalMap: sandNormal(),
    normalScale: new THREE.Vector2(0.6, 0.6),
  });
  // world-space UVs for the detail map (terrain chunks have no UVs)
  terrain.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace('#include <normal_fragment_maps>', `
        vec2 dUv = vWorldPos.xz * 0.35;
        vec3 mapN = texture2D( normalMap, dUv ).xyz * 2.0 - 1.0;
        vec3 mapN2 = texture2D( normalMap, dUv * 0.23 + 0.37 ).xyz * 2.0 - 1.0;
        mapN = normalize(mapN + mapN2 * 0.8);
        mapN.xy *= normalScale;
        normal = normalize( tbn * mapN );
      `)
      .replace('#include <color_fragment>', `
        #include <color_fragment>
        float grain = fract(sin(dot(floor(vWorldPos.xz * 6.0), vec2(12.9898, 78.233))) * 43758.5453);
        diffuseColor.rgb *= 0.94 + grain * 0.08;
      `);
  };
  terrain.customProgramCacheKey = () => 'terrain-v1';

  const road = new THREE.MeshStandardMaterial({
    map: asphaltTexture(),
    roughness: 0.85,
    metalness: 0,
    normalMap: asphaltNormal(),
    normalScale: new THREE.Vector2(0.5, 0.5),
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  return { terrain, road };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function sandNormal() {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  const rng = new Rng(3);
  const img = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const ripple = Math.sin((x + Math.sin(y * 0.05) * 12) * 0.25) * 0.5 + 0.5;
      const v = 100 + ripple * 40 + rng.next() * 60;
      const i = (y * 256 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(heightToNormal(c, 1.5));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** u: across the road (shoulder, lane, lane, shoulder), v: along (12 m per repeat). */
function asphaltTexture() {
  const W = 512;
  const H = 1024;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  const rng = new Rng(11);
  // shoulders gravel, lanes asphalt
  const total = 2 * (3.5 + 1.4);
  const px = (m) => (m / total) * W;
  g.fillStyle = '#6f6a63';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#3a3a3c';
  g.fillRect(px(1.4), 0, px(7), H);
  const img = g.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rng.next() - 0.5) * 26;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // wear patches and cracks
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(20,20,22,${rng.range(0.05, 0.15)})`;
    g.beginPath();
    g.ellipse(px(rng.range(1.6, 8.2)), rng.range(0, H), rng.range(8, 40), rng.range(20, 90), 0, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(15,15,15,0.5)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 14; i++) {
    let x = px(rng.range(1.6, 8.2));
    let y = rng.range(0, H);
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += rng.range(-10, 10);
      y += rng.range(5, 25);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // wheel track darkening
  for (const m of [2.2, 3.9, 5.6, 7.3]) {
    const grad = g.createLinearGradient(px(m - 0.5), 0, px(m + 0.5), 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.12)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(px(m - 0.5), 0, px(1), H);
  }
  // edge lines (solid white) and centre line (dashed, 3 m on / 9 m off)
  g.fillStyle = 'rgba(236,232,220,0.9)';
  g.fillRect(px(1.5), 0, px(0.12), H);
  g.fillRect(px(8.28), 0, px(0.12), H);
  g.fillStyle = 'rgba(236,232,220,0.92)';
  g.fillRect(px(4.84), 0, px(0.12), H * 0.25);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

function asphaltNormal() {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  const rng = new Rng(5);
  const img = g.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 90 + rng.next() * 90;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(heightToNormal(c, 1.2));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 8);
  return t;
}
