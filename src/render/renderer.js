import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { settings } from '../core/settings.js';

export const QUALITY = {
  low: { pixel: 0.7, shadows: false, shadowSize: 1024, bloom: false, viewDist: 900, carShadows: false },
  medium: { pixel: 0.9, shadows: true, shadowSize: 1024, bloom: false, viewDist: 1300, carShadows: false },
  high: { pixel: 1, shadows: true, shadowSize: 2048, bloom: true, viewDist: 1800, carShadows: false },
  ultra: { pixel: 1.25, shadows: true, shadowSize: 4096, bloom: true, viewDist: 2400, carShadows: true },
};

/**
 * WebGL renderer with quality presets, optional bloom (makes lamps glow at night) and a second
 * overlay pass for the first-person view model (hands and held items).
 */
export class Renderer {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!window.__captureMode });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.domElement.id = 'view';
    document.body.appendChild(r.domElement);
    this.composer = null;
    this.bloom = null;
    this.q = QUALITY.high;
    this.fixed = null;
    addEventListener('resize', () => this.resize());
    settings.on('change', (k) => {
      if (k === 'quality' || k === 'renderScale') this.applyQuality();
      if (k === 'brightness') r.toneMappingExposure = settings.get('brightness');
    });
    r.toneMappingExposure = settings.get('brightness');
  }

  get dom() {
    return this.renderer.domElement;
  }

  setup(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.applyQuality();
  }

  applyQuality() {
    const q = (this.q = QUALITY[settings.get('quality')] || QUALITY.high);
    const r = this.renderer;
    const ratio = Math.min(devicePixelRatio, 2) * q.pixel * settings.get('renderScale');
    r.setPixelRatio(this.fixed ? 1 : ratio);
    r.shadowMap.enabled = q.shadows;
    this.composer?.dispose?.();
    this.composer = null;
    if (q.bloom && this.scene) {
      const size = this.size();
      const target = new THREE.WebGLRenderTarget(size.w, size.h, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(r, target);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.w, size.h), 0.35, 0.55, 0.92);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this.resize();
    r.shadowMap.needsUpdate = true;
  }

  size() {
    return this.fixed || { w: innerWidth, h: innerHeight };
  }

  resize() {
    const { w, h } = this.size();
    this.renderer.setSize(w, h, !this.fixed);
    this.composer?.setSize(w, h);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Main scene (with bloom when enabled), then the view-model overlay on a cleared depth buffer. */
  render(overlay = null) {
    const r = this.renderer;
    if (this.composer) this.composer.render();
    else r.render(this.scene, this.camera);
    if (overlay) {
      r.autoClear = false;
      r.clearDepth();
      r.render(overlay, this.camera);
      r.autoClear = true;
    }
  }
}
