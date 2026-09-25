import * as THREE from 'three';

/**
 * Real light sources of the car: low/high beam spot lights, a red glow at the rear, the dome
 * light and the reversing glow. Emissive lamp materials (from the model) follow the same state.
 */
export class CarLights {
  constructor(root, mats, controls, { shadows = false } = {}) {
    this.mats = mats;
    this.controls = controls;
    this.beams = [];
    for (const x of [-0.6, 0.6]) {
      const spot = new THREE.SpotLight(0xfff1dc, 0, 70, 0.62, 0.55, 1.6);
      spot.position.set(x, 0.74, -1.95);
      spot.target.position.set(x * 0.6, -0.2, -22);
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
    this.rear = new THREE.PointLight(0xff2010, 0, 5, 2);
    this.rear.position.set(0, 0.9, 2.45);
    root.add(this.rear);
    this.reverse = new THREE.PointLight(0xffffff, 0, 6, 2);
    this.reverse.position.set(0, 0.7, 2.6);
    root.add(this.reverse);
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
      b.intensity = (low * 38 + high * 60) * 1;
      b.distance = high ? 140 : 70;
      b.angle = high ? 0.5 : 0.62;
      b.target.position.y = high ? 0.6 : -0.2;
      b.target.position.z = high ? -60 : -22;
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
    this.rear.intensity = (tail * 0.6 + s.brake * 1.6) * p;
    this.reverse.intensity = s.reverse * 1.5 * p;
    this.dome.intensity = s.dome * 0.9 * p;
    if (this.controls.domeMaterial) this.controls.domeMaterial.emissiveIntensity = s.dome * 1.4 * p;
    if (this.controls.clusterMaterial) this.controls.clusterMaterial.emissiveIntensity = s.cluster * 1.2 * p;
    if (this.controls.radioMaterial) this.controls.radioMaterial.emissiveIntensity = s.radio * 1.1 * p;
  }
}
