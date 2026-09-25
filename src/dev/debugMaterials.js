import * as THREE from 'three';

/**
 * Material overrides for model inspection.
 *  defects: front faces grey-lit, back faces pure green (visible inside of a skin = a hole or a gap
 *           into the void); used with a magenta background to reveal see-through holes.
 *  normals: normal-colour shading.   wire: wireframe over flat grey.
 */
export class DebugMaterials {
  constructor() {
    this.saved = new Map();
    this.defects = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec3 vN;
        void main() {
          vN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vN;
        void main() {
          if (!gl_FrontFacing) { gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0); return; }
          float l = 0.35 + 0.55 * max(dot(normalize(vN), normalize(vec3(-0.4, 0.8, -0.3))), 0.0);
          gl_FragColor = vec4(vec3(l), 1.0);
        }`,
    });
    // Double-sided materials show their back faces on purpose: shade them grey instead of green.
    this.defectsTwoSided = this.defects.clone();
    this.defectsTwoSided.fragmentShader = this.defects.fragmentShader.replace(
      'if (!gl_FrontFacing) { gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0); return; }',
      'if (!gl_FrontFacing) { gl_FragColor = vec4(vec3(0.3), 1.0); return; }',
    );
    this.normals = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
    this.wire = new THREE.MeshBasicMaterial({ color: 0x9fd3ff, wireframe: true });
    // Glass is solid in defect mode, otherwise the background behind it would read as a hole.
    this.glass = new THREE.MeshBasicMaterial({ color: 0x3fa7c9, side: THREE.DoubleSide });
    this.idMaterials = new Map();
  }

  /**
   * Source attribution pass: every single-sided mesh draws its back faces in a unique id colour
   * (r,g = id, b = 255) and its front faces black, so defect pixels can be traced to meshes.
   */
  idMaterial(id) {
    let m = this.idMaterials.get(id);
    if (!m) {
      m = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: { idColor: { value: new THREE.Vector3((id & 255) / 255, ((id >> 8) & 255) / 255, 1) } },
        vertexShader: 'void main() { gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 idColor; void main() { gl_FragColor = gl_FrontFacing ? vec4(0.0, 0.0, 0.0, 1.0) : vec4(idColor, 1.0); }',
      });
      this.idMaterials.set(id, m);
    }
    return m;
  }

  applyIds(root) {
    const meshes = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      if (!this.saved.has(o)) this.saved.set(o, o.material);
      const orig = this.saved.get(o);
      const twoSided = o.userData.glass || orig.side === THREE.DoubleSide;
      meshes.push(o);
      o.material = twoSided ? this.glass : this.idMaterial(meshes.length);
    });
    return meshes;
  }

  apply(root, mode) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      if (!this.saved.has(o)) this.saved.set(o, o.material);
      if (!mode || mode === 'none') o.material = this.saved.get(o);
      else if (mode === 'defects') {
        const orig = this.saved.get(o);
        o.material = o.userData.glass ? this.glass : orig.side === THREE.DoubleSide ? this.defectsTwoSided : this.defects;
      }
      else if (mode === 'normals') o.material = this.normals;
      else if (mode === 'wire') o.material = this.wire;
    });
  }
}

