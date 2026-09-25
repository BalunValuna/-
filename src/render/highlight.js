import * as THREE from 'three';

/**
 * Hover highlight: overlay meshes sharing the target's geometry, drawn with an additive rim
 * glow; and install "ghosts" — translucent copies of a part shown at its free slot.
 */
const vertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  #include <common>
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const fragment = /* glsl */ `
  uniform vec3 color;
  uniform float strength;
  uniform float time;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
    float pulse = 0.75 + 0.25 * sin(time * 5.0);
    gl_FragColor = vec4(color * (rim * 0.9 + 0.1) * strength * pulse, 1.0);
  }`;

export class Highlighter {
  constructor() {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(0xffd08a) }, strength: { value: 0.9 }, time: { value: 0 } },
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x7fd6ff, transparent: true, opacity: 0.28, depthWrite: false });
    this.current = null;
    this.overlays = [];
    this.ghost = null;
    this.ghostFor = null;
  }

  set(object, color = 0xffd08a) {
    this.mat.uniforms.color.value.set(color);
    if (object === this.current) return;
    this.clear();
    this.current = object;
    if (!object) return;
    object.traverse((o) => {
      if (!o.isMesh || !o.visible || o.userData.noHighlight) return;
      const m = new THREE.Mesh(o.geometry, this.mat);
      m.renderOrder = 5;
      m.userData.noHighlight = true;
      m.raycast = () => {};
      o.add(m);
      this.overlays.push(m);
    });
  }

  clear() {
    for (const m of this.overlays) m.parent?.remove(m);
    this.overlays = [];
    this.current = null;
  }

  /** Shows `source` (a part object) as a ghost under `parent` with a local transform. */
  showGhost(source, parent, home) {
    if (this.ghostFor === source && this.ghost?.parent === parent) return;
    this.hideGhost();
    const g = source.clone(true);
    g.traverse((o) => {
      if (o.isMesh) {
        o.material = this.ghostMat;
        o.castShadow = false;
        o.raycast = () => {};
      }
      if (o.isLight) o.visible = false;
    });
    g.position.copy(home.position);
    g.quaternion.copy(home.quaternion);
    g.scale.copy(home.scale);
    parent.add(g);
    this.ghost = g;
    this.ghostFor = source;
  }

  hideGhost() {
    this.ghost?.parent?.remove(this.ghost);
    this.ghost = null;
    this.ghostFor = null;
  }

  update(dt) {
    this.mat.uniforms.time.value += dt;
    this.ghostMat.opacity = 0.2 + 0.1 * Math.sin(this.mat.uniforms.time.value * 4);
  }
}
