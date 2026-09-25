import RAPIER from '@dimforge/rapier3d-compat';

/**
 * Thin wrapper over Rapier: world stepping, collision groups, ray queries, an owner registry
 * (collider handle → game object) and floating-origin shifts.
 */
export const GROUP = {
  STATIC: 1 << 0,
  CAR: 1 << 1,
  ITEM: 1 << 2,
  PLAYER: 1 << 3,
  CREATURE: 1 << 4,
  DEBRIS: 1 << 5,
  TRIGGER: 1 << 6,
};

/** Packs membership and filter into Rapier's 32-bit interaction groups. */
// `>>> 0` keeps the packed value unsigned: with the top bit set a signed int matches nothing.
export const groups = (member, filter = 0xffff) => ((((member & 0xffff) << 16) | (filter & 0xffff)) >>> 0);

export const ALL = 0xffff;

export class Physics {
  static async create() {
    await RAPIER.init();
    return new Physics();
  }

  constructor() {
    this.R = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.integrationParameters.numSolverIterations = 6;
    this.events = new RAPIER.EventQueue(true);
    this.owners = new Map();
    this.contactListeners = [];
  }

  step(dt) {
    this.world.timestep = dt;
    this.world.step(this.events);
    if (this.contactListeners.length) {
      this.events.drainContactForceEvents((e) => {
        const a = this.owners.get(e.collider1());
        const b = this.owners.get(e.collider2());
        const f = e.totalForceMagnitude();
        for (const l of this.contactListeners) l(a, b, f, e);
      });
    } else {
      this.events.clear();
    }
  }

  setOwner(collider, owner) {
    this.owners.set(collider.handle, owner);
  }

  ownerOf(collider) {
    return collider ? this.owners.get(collider.handle) : undefined;
  }

  removeCollider(collider) {
    this.owners.delete(collider.handle);
    this.world.removeCollider(collider, false);
  }

  removeBody(body) {
    for (let i = 0; i < body.numColliders(); i++) this.owners.delete(body.collider(i).handle);
    this.world.removeRigidBody(body);
  }

  /** Ray query; returns { collider, owner, toi, point, normal } or null. */
  raycast(origin, dir, maxToi, { filter = ALL, exclude = null, solid = true } = {}) {
    const ray = new RAPIER.Ray(origin, dir);
    const hit = this.world.castRayAndGetNormal(
      ray,
      maxToi,
      solid,
      undefined,
      groups(ALL, filter),
      undefined,
      exclude || undefined,
    );
    if (!hit) return null;
    const t = hit.timeOfImpact;
    return {
      collider: hit.collider,
      owner: this.owners.get(hit.collider.handle),
      toi: t,
      point: { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t },
      normal: hit.normal,
    };
  }

  /** Moves every body by (-dx, 0, -dz) for a floating-origin shift. */
  shiftOrigin(dx, dz) {
    this.world.forEachRigidBody((b) => {
      const t = b.translation();
      b.setTranslation({ x: t.x - dx, y: t.y, z: t.z - dz }, false);
      if (b.isKinematic()) {
        const n = b.nextTranslation?.() ?? t;
        b.setNextKinematicTranslation({ x: n.x - dx, y: n.y, z: n.z - dz });
      }
    });
    this.world.forEachCollider((c) => {
      if (!c.parent()) {
        const t = c.translation();
        c.setTranslation({ x: t.x - dx, y: t.y, z: t.z - dz });
      }
    });
  }
}
