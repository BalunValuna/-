import * as THREE from 'three';
import { carpetNormal, fabricNormal, grainNormal, treadNormal } from '../render/textures.js';

/**
 * Shared materials of the car. One instance per paint colour; everything else is shared.
 */
let shared = null;

function makeShared() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  return {
    underbody: std({ color: 0x1c1c1d, roughness: 0.95, metalness: 0.0, normalMap: grainNormal(3), name: 'underbody' }),
    primer: std({ color: 0x6d7074, roughness: 0.62, metalness: 0.15, name: 'primer' }),
    blackPlastic: std({ color: 0x141517, roughness: 0.62, metalness: 0.0, normalMap: grainNormal(6), name: 'blackPlastic' }),
    glossBlack: phys({ color: 0x0b0c0d, roughness: 0.18, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.05, name: 'glossBlack' }),
    satinBlack: std({ color: 0x1b1c1e, roughness: 0.42, metalness: 0.1, name: 'satinBlack' }),
    chrome: std({ color: 0xe6e8ea, roughness: 0.06, metalness: 1.0, name: 'chrome' }),
    satinChrome: std({ color: 0xc9ccd0, roughness: 0.28, metalness: 1.0, name: 'satinChrome' }),
    alloy: phys({ color: 0xc2c5ca, roughness: 0.26, metalness: 0.92, clearcoat: 0.6, clearcoatRoughness: 0.1, name: 'alloy' }),
    alloyDark: std({ color: 0x55585d, roughness: 0.4, metalness: 0.85, name: 'alloyDark' }),
    rubber: std({ color: 0x151515, roughness: 0.93, metalness: 0.0, name: 'rubber' }),
    tread: std({ color: 0x141414, roughness: 0.96, metalness: 0.0, normalMap: treadNormal(), normalScale: new THREE.Vector2(1.2, 1.2), name: 'tread' }),
    seal: std({ color: 0x0e0e0f, roughness: 0.85, metalness: 0.0, name: 'seal' }),
    brakeDisc: std({ color: 0x8a8d91, roughness: 0.38, metalness: 0.9, name: 'brakeDisc' }),
    caliper: std({ color: 0x3a3c40, roughness: 0.5, metalness: 0.6, name: 'caliper' }),
    castIron: std({ color: 0x4a4c4f, roughness: 0.72, metalness: 0.55, name: 'castIron' }),
    aluminium: std({ color: 0xa7aaae, roughness: 0.45, metalness: 0.85, name: 'aluminium' }),
    steel: std({ color: 0x7c8084, roughness: 0.4, metalness: 0.8, name: 'steel' }),
    exhaust: std({ color: 0x5e5751, roughness: 0.6, metalness: 0.7, name: 'exhaust' }),
    glass: phys({
      color: 0x1d2a2c,
      roughness: 0.02,
      metalness: 0.0,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      side: THREE.DoubleSide,
      envMapIntensity: 1.0,
      specularIntensity: 1,
      name: 'glass',
    }),
    tintedGlass: phys({
      color: 0x0d1213,
      roughness: 0.02,
      metalness: 0.0,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      side: THREE.DoubleSide,
      envMapIntensity: 1.4,
      name: 'tintedGlass',
    }),
    frit: std({ color: 0x07080a, roughness: 0.35, metalness: 0.0, name: 'frit' }),
    lens: phys({
      color: 0xffffff,
      roughness: 0.02,
      metalness: 0.0,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
      envMapIntensity: 1.6,
      name: 'lens',
    }),
    reflector: std({ color: 0xdfe3e8, roughness: 0.12, metalness: 1.0, side: THREE.DoubleSide, name: 'reflector' }),
    lampHousing: std({ color: 0x1a1b1d, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide, name: 'lampHousing' }),
    tailLens: phys({ color: 0x8a0508, roughness: 0.08, metalness: 0.0, transmission: 0, transparent: true, opacity: 0.88, emissive: 0x000000, name: 'tailLens' }),
    reflectorRed: phys({ color: 0x6a0306, roughness: 0.15, metalness: 0.2, clearcoat: 1, name: 'reflectorRed' }),
    amberLens: phys({ color: 0xd97a10, roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.85, name: 'amberLens' }),
    dashPlastic: std({ color: 0x232426, roughness: 0.78, metalness: 0.0, normalMap: grainNormal(10), normalScale: new THREE.Vector2(0.6, 0.6), name: 'dashPlastic' }),
    trimPlastic: std({ color: 0x3a3b3e, roughness: 0.7, metalness: 0.0, normalMap: grainNormal(8), normalScale: new THREE.Vector2(0.5, 0.5), name: 'trimPlastic' }),
    lightTrim: std({ color: 0x8c8a86, roughness: 0.75, metalness: 0.0, normalMap: grainNormal(8), normalScale: new THREE.Vector2(0.4, 0.4), name: 'lightTrim' }),
    headliner: std({ color: 0x9d9a94, roughness: 0.95, metalness: 0.0, normalMap: fabricNormal(), normalScale: new THREE.Vector2(0.3, 0.3), name: 'headliner' }),
    fabric: std({ color: 0x3b3d42, roughness: 0.92, metalness: 0.0, normalMap: fabricNormal(), normalScale: new THREE.Vector2(0.8, 0.8), name: 'fabric' }),
    fabricInsert: std({ color: 0x2b2d31, roughness: 0.95, metalness: 0.0, normalMap: fabricNormal(), normalScale: new THREE.Vector2(1.1, 1.1), name: 'fabricInsert' }),
    carpet: std({ color: 0x1f1f21, roughness: 1.0, metalness: 0.0, normalMap: carpetNormal(), name: 'carpet' }),
    leather: phys({ color: 0x1a1a1c, roughness: 0.55, metalness: 0.0, sheen: 0.3, name: 'leather' }),
    gaugeFace: std({ color: 0x0d0e10, roughness: 0.4, metalness: 0.0, name: 'gaugeFace' }),
    engineBlock: std({ color: 0x77797c, roughness: 0.55, metalness: 0.6, name: 'engineBlock' }),
    engineCover: std({ color: 0x1d1e20, roughness: 0.5, metalness: 0.1, normalMap: grainNormal(4), name: 'engineCover' }),
    battery: std({ color: 0x222325, roughness: 0.55, metalness: 0.0, name: 'battery' }),
    coolantTank: phys({ color: 0xe8e4d6, roughness: 0.35, metalness: 0.0, transparent: true, opacity: 0.92, name: 'coolantTank' }),
    hose: std({ color: 0x101011, roughness: 0.8, metalness: 0.0, name: 'hose' }),
    radiator: std({ color: 0x2a2b2d, roughness: 0.6, metalness: 0.5, name: 'radiator' }),
    copper: std({ color: 0xb87333, roughness: 0.35, metalness: 1.0, name: 'copper' }),
    spring: std({ color: 0x9b1c1c, roughness: 0.45, metalness: 0.3, name: 'spring' }),
    yellow: std({ color: 0xe0b020, roughness: 0.4, metalness: 0.0, name: 'yellow' }),
    plate: std({ color: 0xf2f2ee, roughness: 0.45, metalness: 0.2, name: 'plate' }),
  };
}

export function carMaterials(paintColor = 0x8a1c22) {
  if (!shared) shared = makeShared();
  const paint = new THREE.MeshPhysicalMaterial({
    color: paintColor,
    metalness: 0.45,
    roughness: 0.36,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    name: 'paint',
  });
  const paintInner = new THREE.MeshStandardMaterial({
    color: new THREE.Color(paintColor).multiplyScalar(0.8),
    metalness: 0.3,
    roughness: 0.55,
    name: 'paintInner',
  });
  // Shell and liners are drawn double sided so their hidden inner faces never read as holes.
  const paintShell = paint.clone();
  paintShell.side = THREE.DoubleSide;
  const linerPlastic = shared.blackPlastic.clone();
  linerPlastic.side = THREE.DoubleSide;
  return { ...shared, paint, paintInner, paintShell, linerPlastic };
}
