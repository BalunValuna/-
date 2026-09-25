import * as THREE from 'three';
import { ITEMS } from './defs.js';
import { itemModel } from './models.js';
import { GROUP, groups } from '../physics/physics.js';
import { PARTS } from '../car/partsCatalog.js';
import { localBox } from '../car/CarEntity.js';

/**
 * Loose objects in the world: items and detached car parts. Each has a model and (while near
 * the player) a dynamic rigid body; far away they are frozen to data. Items taken from a POI
 * become "free" and are saved by position; untouched loot stays owned by its POI.
 */
let uid = 1;
const FREEZE = 260;
const THAW = 220;

export class ItemSystem {
  constructor(game) {
    this.game = game;
    this.items = new Set();
    this.group = new THREE.Group();
    this.group.name = 'items';
    game.scene.add(this.group);
    this.checkT = 0;
  }

  /** Spawns an item of type `id` at a local position. */
  spawn(id, pos, { rotY = 0, quat = null, state = null, poi = null, loot = null, free = false } = {}) {
    const def = ITEMS[id];
    if (!def) return null;
    const root = itemModel(id);
    const item = { uid: uid++, kind: 'item', id, def, state: state || defaultState(id, def), root, body: null, poi, loot, free, frozen: false, mass: def.mass };
    root.userData.item = item;
    root.position.copy(pos);
    if (quat) root.quaternion.copy(quat);
    else root.rotation.y = rotY;
    this.group.add(root);
    this.makeBody(item);
    this.items.add(item);
    return item;
  }

  /** Wraps a detached car part as a loose item (its object keeps its current world transform). */
  spawnPart(partId, object, { cond = 1, free = true, source = null } = {}) {
    const def = PARTS[partId];
    const item = { uid: uid++, kind: 'part', id: 'part', partId, def: { ...def, big: true }, state: { cond }, root: object, body: null, free, frozen: false, mass: def.mass, source };
    object.userData.item = item;
    this.group.add(object);
    item.box = localBox(object);
    this.makeBody(item);
    this.items.add(item);
    return item;
  }

  makeBody(item, vel = null) {
    const R = this.game.physics.R;
    const world = this.game.physics.world;
    const p = item.root.position;
    const q = item.root.quaternion;
    const body = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(p.x, p.y, p.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinearDamping(0.12)
        .setAngularDamping(0.35)
        .setCcdEnabled(item.mass < 3),
    );
    let desc;
    const s = item.kind === 'part' ? null : item.def.shape;
    let volume = 1;
    if (item.kind === 'part') {
      const b = item.box;
      const c = b.getCenter(new THREE.Vector3());
      const h = b.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      if (item.partId.startsWith('wheel_')) {
        desc = R.ColliderDesc.cylinder(0.1, 0.31).setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 });
        volume = Math.PI * 0.31 * 0.31 * 0.2;
      } else {
        h.x = Math.max(h.x, 0.02);
        h.y = Math.max(h.y, 0.02);
        h.z = Math.max(h.z, 0.02);
        desc = R.ColliderDesc.cuboid(h.x, h.y, h.z);
        volume = 8 * h.x * h.y * h.z;
      }
      desc.setTranslation(c.x, c.y, c.z);
    } else if (s.cyl) {
      desc = R.ColliderDesc.cylinder(s.cyl[1], s.cyl[0]);
      volume = Math.PI * s.cyl[0] * s.cyl[0] * s.cyl[1] * 2;
    } else {
      desc = R.ColliderDesc.cuboid(...s.box);
      volume = 8 * s.box[0] * s.box[1] * s.box[2];
    }
    desc
      .setDensity(item.mass / Math.max(volume, 1e-4))
      .setFriction(0.7)
      .setRestitution(0.12)
      .setCollisionGroups(groups(GROUP.ITEM))
      .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(40 + item.mass * 30);
    const col = world.createCollider(desc, body);
    this.game.physics.setOwner(col, { kind: 'item', item });
    if (vel) body.setLinvel(vel, true);
    item.body = body;
    item.collider = col;
  }

  dropBody(item) {
    if (!item.body) return;
    this.game.physics.removeBody(item.body);
    item.body = null;
    item.collider = null;
  }

  /** Removes the item from the world simulation (taken into the hand). */
  take(item) {
    this.dropBody(item);
    item.free = true;
    if (item.poi && item.loot != null) this.game.world.markLooted(item.poi, item.loot);
    item.poi = null;
    this.group.remove(item.root);
  }

  /** Puts an item (back) into the world at a world transform. */
  place(item, pos, quat, vel = null) {
    item.root.position.copy(pos);
    item.root.quaternion.copy(quat);
    item.root.scale.set(1, 1, 1);
    this.group.add(item.root);
    this.items.add(item);
    this.makeBody(item, vel);
  }

  remove(item) {
    this.dropBody(item);
    item.root.parent?.remove(item.root);
    this.items.delete(item);
  }

  removePoi(key) {
    for (const it of [...this.items]) if (it.poi === key && !it.free) this.remove(it);
  }

  update(dt) {
    for (const it of this.items) {
      if (!it.body || it.body.isSleeping()) continue;
      const t = it.body.translation();
      const r = it.body.rotation();
      it.root.position.set(t.x, t.y, t.z);
      it.root.quaternion.set(r.x, r.y, r.z, r.w);
      if (t.y < -200) this.remove(it);
    }
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 1;
    const p = this.game.camera.position;
    for (const it of this.items) {
      if (it.held) continue;
      const d = it.root.position.distanceTo(p);
      if (!it.frozen && d > FREEZE) {
        this.dropBody(it);
        it.frozen = true;
        it.root.visible = false;
      } else if (it.frozen && d < THAW) {
        it.frozen = false;
        it.root.visible = true;
        this.makeBody(it);
      }
    }
  }

  shift(dx, dz) {
    for (const it of this.items) {
      if (it.frozen || !it.body) {
        it.root.position.x -= dx;
        it.root.position.z -= dz;
      }
    }
  }

  /** Items and parts near a point (for loot checks and tutorials). */
  near(p, r) {
    return [...this.items].filter((it) => it.root.position.distanceTo(p) < r);
  }

  save() {
    const o = this.game.origin;
    const out = [];
    for (const it of this.items) {
      if (!it.free || it.held) continue;
      const p = it.root.position;
      const q = it.root.quaternion;
      out.push({ id: it.id, partId: it.partId, p: [p.x + o.x, p.y, p.z + o.z], q: [q.x, q.y, q.z, q.w], s: it.state });
    }
    return out;
  }

  dispose() {
    for (const it of [...this.items]) this.remove(it);
    this.game.scene.remove(this.group);
  }
}

export function defaultState(id, def) {
  const s = {};
  if (def.liquid) {
    s.kind = def.liquid.kinds[0];
    s.amount = 0;
  }
  if (def.ammo) s.ammo = def.ammo;
  if (def.tool === 'gun') s.loaded = 0;
  if (def.uses) s.uses = def.uses;
  if (id === 'money') s.amount = 5;
  return s;
}

/** Liquid contents for spawned containers (varies by container). */
export function randomFill(id, rng) {
  const def = ITEMS[id];
  if (!def?.liquid) return null;
  const kinds = def.liquid.kinds;
  let kind = kinds[0];
  if (id === 'canister' || id === 'water') kind = 'water';
  if (id.startsWith('jerrycan')) kind = rng.chance(0.8) ? 'petrol' : rng.chance(0.5) ? 'diesel' : 'water';
  const amount = id === 'water' ? def.liquid.cap * rng.range(0.6, 1) : rng.chance(0.25) ? 0 : def.liquid.cap * rng.range(0.15, 0.85);
  return { kind, amount: +amount.toFixed(1) };
}
