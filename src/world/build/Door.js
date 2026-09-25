import * as THREE from 'three';
import { GROUP, groups } from '../../physics/physics.js';
import { roundedBox } from '../../geo/primitives.js';
import { M } from './materials.js';

/**
 * Hinged door (house, garage side door, cabinet): visual panel on a pivot and a kinematic box
 * collider that swings with it. Interaction toggles it.
 */
export class Door {
  /**
   * @param opts.w,h,t panel size; opts.hinge 'left'|'right' seen from the push side (+Z of the frame)
   * @param opts.at local position of the opening centre on the floor; opts.rotY facing of the opening
   */
  constructor(game, parent, { w = 0.86, h = 2.02, t = 0.04, at, rotY = 0, hinge = 'left', mat = null, open = 0, kind = 'door', swing = 1.75, locked = false }) {
    this.game = game;
    this.kind = kind;
    this.w = w;
    this.h = h;
    this.swing = swing * (hinge === 'left' ? 1 : -1);
    this.locked = locked;
    this.pivot = new THREE.Group();
    const side = hinge === 'left' ? -1 : 1;
    this.frame = new THREE.Group();
    this.frame.position.copy(at);
    this.frame.rotation.y = rotY;
    parent.add(this.frame);
    this.pivot.position.set((side * w) / 2, 0, 0);
    this.frame.add(this.pivot);
    this.panel = new THREE.Group();
    this.panel.position.set((-side * w) / 2, h / 2, 0);
    this.pivot.add(this.panel);
    const panelMat = mat || M.paint(0x8a6a4a, 0.6);
    const slab = new THREE.Mesh(roundedBox(w - 0.01, h - 0.01, t, 0.006, 1), panelMat);
    slab.castShadow = slab.receiveShadow = true;
    this.panel.add(slab);
    if (kind === 'door') {
      // raised panels and a lever handle on both faces
      for (const z of [-1, 1]) {
        for (const [py, ph] of [
          [0.42, 0.62],
          [-0.38, 0.72],
        ]) {
          const p = new THREE.Mesh(roundedBox(w - 0.22, ph, 0.012, 0.004, 1), panelMat);
          p.position.set(0, (py * h) / 2.02, (z * t) / 2);
          this.panel.add(p);
        }
        const lever = new THREE.Mesh(roundedBox(0.12, 0.02, 0.02, 0.008, 2), M.metal(0xb89a60, 0.3));
        lever.position.set((side * (w / 2 - 0.08)) * -1 + side * 0.03, -0.04, z * (t / 2 + 0.03));
        const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.012, 16).rotateX(Math.PI / 2), M.metal(0xb89a60, 0.3));
        rose.position.set((side * (w / 2 - 0.08)) * -1, -0.04, z * (t / 2 + 0.006));
        this.panel.add(lever, rose);
      }
    }
    this.open = open;
    this.target = open;
    // collider on a kinematic body
    const R = game.physics.R;
    this.body = game.physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
    this.collider = game.physics.world.createCollider(
      R.ColliderDesc.cuboid(w / 2, h / 2, Math.max(t / 2, 0.02)).setCollisionGroups(groups(GROUP.STATIC)),
      this.body,
    );
    game.physics.setOwner(this.collider, { kind: 'door', door: this, surface: 'wood' });
    this.apply(true);
  }

  toggle() {
    if (this.locked) {
      this.game.audio?.play('latch', { pos: this.worldPos() });
      return false;
    }
    this.target = this.target > 0.5 ? 0 : 1;
    this.game.audio?.play(this.target ? 'door_open' : 'door_close', { pos: this.worldPos(), pitch: this.kind === 'door' ? 1 : 1.3 });
    return true;
  }

  worldPos() {
    return this.panel.getWorldPosition(new THREE.Vector3());
  }

  update(dt) {
    if (this.open === this.target) return;
    const sp = 2.2;
    this.open = this.target > this.open ? Math.min(this.target, this.open + dt * sp) : Math.max(this.target, this.open - dt * sp);
    this.apply();
  }

  apply(teleport = false) {
    const e = this.open * this.open * (3 - 2 * this.open);
    this.pivot.rotation.y = e * this.swing;
    this.panel.updateWorldMatrix(true, false);
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    this.panel.matrixWorld.decompose(p, q, new THREE.Vector3());
    if (teleport) {
      this.body.setTranslation(p, false);
      this.body.setRotation(q, false);
    }
    this.body.setNextKinematicTranslation(p);
    this.body.setNextKinematicRotation(q);
  }

  shift(dx, dz) {
    this.apply(true);
    void dx;
    void dz;
  }

  dispose() {
    this.game.physics.removeBody(this.body);
    this.frame.parent?.remove(this.frame);
  }
}
