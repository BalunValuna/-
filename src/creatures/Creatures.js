import * as THREE from 'three';
import { fieldGeometry, sdRoundCone } from '../geo/fieldMesh.js';
import { sdEllipsoid, smin } from '../geo/sdf.js';
import { GROUP, groups } from '../physics/physics.js';
import { Rng } from '../core/rng.js';
import { clamp, clamp01, lerp, dampAngle } from '../core/math.js';
import { ROAD } from '../world/worldgen.js';

/**
 * Wildlife and night creatures: rabbits (skittish by day, vicious at night), husks (gaunt figures
 * that come out after dark and shun light) and vultures circling in the daytime sky. Models are
 * implicit surfaces on joint rigs with procedural gaits.
 */
let G = null;

function geometries() {
  if (G) return G;
  const fur = new THREE.MeshStandardMaterial({ color: 0x8a7a64, roughness: 0.95 });
  const belly = new THREE.MeshStandardMaterial({ color: 0xb8a88e, roughness: 0.95 });
  const eye = new THREE.MeshStandardMaterial({ color: 0x0a0605, emissive: 0xff3a1a, emissiveIntensity: 0, roughness: 0.2 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x5c534b, roughness: 0.78, metalness: 0.02 });
  const skinDark = new THREE.MeshStandardMaterial({ color: 0x3f3934, roughness: 0.85 });
  const huskEye = new THREE.MeshStandardMaterial({ color: 0xf0e6a0, emissive: 0xffe98a, emissiveIntensity: 1.2 });
  const feather = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.9, side: THREE.DoubleSide });
  const c = 0.012;
  const rabbit = {
    body: fieldGeometry(
      (x, y, z) => smin(sdEllipsoid(x, y - 0.17, z + 0.02, 0.105, 0.11, 0.17), sdEllipsoid(x, y - 0.2, z + 0.13, 0.075, 0.085, 0.08), 0.06),
      [-0.14, 0.03, -0.22],
      [0.14, 0.32, 0.24],
      c,
    ),
    belly: fieldGeometry((x, y, z) => sdEllipsoid(x, y - 0.12, z + 0.02, 0.08, 0.07, 0.13), [-0.1, 0.04, -0.16], [0.1, 0.2, 0.16], c),
    head: fieldGeometry(
      (x, y, z) => smin(sdEllipsoid(x, y, z, 0.06, 0.062, 0.078), sdEllipsoid(x, y - 0.02, z + 0.06, 0.035, 0.03, 0.035), 0.03),
      [-0.08, -0.08, -0.12],
      [0.08, 0.08, 0.1],
      0.008,
    ),
    ear: fieldGeometry((x, y, z) => sdEllipsoid(x, y - 0.075, z, 0.018, 0.08, 0.03), [-0.03, -0.01, -0.04], [0.03, 0.17, 0.04], 0.006),
    thigh: fieldGeometry((x, y, z) => sdEllipsoid(x, y, z, 0.045, 0.07, 0.07), [-0.06, -0.08, -0.08], [0.06, 0.08, 0.08], 0.008),
    foot: fieldGeometry((x, y, z) => sdRoundCone(x, y, z, 0, 0, 0, 0, -0.02, -0.12, 0.022, 0.016), [-0.03, -0.05, -0.15], [0.03, 0.03, 0.03], 0.006),
    leg: fieldGeometry((x, y, z) => sdRoundCone(x, y, z, 0, 0, 0, 0, -0.1, -0.02, 0.018, 0.013), [-0.025, -0.12, -0.04], [0.025, 0.025, 0.025], 0.006),
    tail: new THREE.SphereGeometry(0.03, 10, 8),
    eye: new THREE.SphereGeometry(0.011, 8, 6),
  };
  const seg = (a, b, r0, r1, pad = 0.03) =>
    fieldGeometry((x, y, z) => sdRoundCone(x, y, z, 0, 0, 0, a, b, 0, r0, r1), [Math.min(0, a) - r0 - pad, Math.min(0, b) - r0 - pad, -r0 - pad], [Math.max(0, a) + r0 + pad, Math.max(0, b) + r0 + pad, r0 + pad], 0.012);
  const husk = {
    // torso: ribcage and belly, hunched forward (local +Y up the spine)
    torso: fieldGeometry(
      (x, y, z) => {
        let d = sdEllipsoid(x, y - 0.3, z - 0.02, 0.2, 0.26, 0.13);
        d = smin(d, sdEllipsoid(x, y - 0.05, z, 0.15, 0.14, 0.1), 0.08);
        // ribs showing through
        const rib = Math.sin(y * 70) * 0.004 * clamp01((y - 0.15) * 4);
        d = smin(d, sdEllipsoid(Math.abs(x) - 0.17, y - 0.5, z, 0.07, 0.06, 0.07), 0.06);
        return d + rib;
      },
      [-0.3, -0.12, -0.2],
      [0.3, 0.6, 0.2],
      0.016,
    ),
    head: fieldGeometry(
      (x, y, z) => {
        let d = sdEllipsoid(x, y - 0.09, z + 0.01, 0.085, 0.11, 0.1);
        d = smin(d, sdEllipsoid(x, y - 0.02, z + 0.07, 0.06, 0.05, 0.06), 0.04);
        // sunken eye sockets
        d = Math.max(d, -sdEllipsoid(Math.abs(x) - 0.035, y - 0.1, z + 0.09, 0.022, 0.016, 0.02));
        return d;
      },
      [-0.11, -0.05, -0.16],
      [0.11, 0.23, 0.13],
      0.01,
    ),
    upperArm: seg(0, -0.34, 0.04, 0.033),
    foreArm: seg(0, -0.36, 0.032, 0.024),
    hand: fieldGeometry(
      (x, y, z) => {
        let d = sdEllipsoid(x, y + 0.05, z, 0.035, 0.05, 0.015);
        for (let i = 0; i < 4; i++) d = smin(d, sdRoundCone(x, y, z, -0.022 + i * 0.015, -0.08, 0, -0.03 + i * 0.02, -0.19, 0.015, 0.007, 0.004), 0.01);
        return d;
      },
      [-0.06, -0.21, -0.03],
      [0.06, 0.02, 0.04],
      0.006,
    ),
    thigh: seg(0, -0.44, 0.06, 0.042),
    shin: seg(0, -0.44, 0.042, 0.03),
    foot: fieldGeometry((x, y, z) => sdRoundCone(x, y, z, 0, 0, 0, 0, -0.02, -0.18, 0.035, 0.022), [-0.06, -0.06, -0.22], [0.06, 0.05, 0.05], 0.01),
    eye: new THREE.SphereGeometry(0.012, 8, 6),
  };
  // vulture: body and two wing cards
  const bird = {
    body: fieldGeometry((x, y, z) => smin(sdEllipsoid(x, y, z, 0.12, 0.1, 0.32), sdEllipsoid(x, y + 0.02, z + 0.36, 0.05, 0.05, 0.08), 0.05), [-0.15, -0.13, -0.36], [0.15, 0.13, 0.46], 0.02),
    wing: (() => {
      const s = new THREE.Shape();
      s.moveTo(0, 0.12);
      s.lineTo(0.9, 0.1);
      s.lineTo(1.05, -0.02);
      for (let i = 0; i < 5; i++) s.lineTo(0.95 - i * 0.12, -0.18 - (i % 2) * 0.05);
      s.lineTo(0, -0.14);
      const g = new THREE.ShapeGeometry(s);
      g.rotateX(-Math.PI / 2);
      return g;
    })(),
  };
  G = { rabbit, husk, bird, fur, belly, eye, skin, skinDark, huskEye, feather };
  return G;
}

function part(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function joint(parent, x, y, z) {
  const j = new THREE.Group();
  j.position.set(x, y, z);
  parent.add(j);
  return j;
}

class Creature {
  constructor(sys, kind, pos) {
    this.sys = sys;
    this.game = sys.game;
    this.kind = kind;
    this.root = new THREE.Group();
    this.root.position.copy(pos);
    this.hp = kind === 'rabbit' ? 45 : 130;
    this.state = 'wander';
    this.t = Math.random() * 10;
    this.heading = Math.random() * Math.PI * 2;
    this.speed = 0;
    this.attackCool = 0;
    this.dead = false;
    this.deadT = 0;
    this.hopT = 0;
    this.wanderT = 0;
    this.build();
    sys.group.add(this.root);
    const R = this.game.physics.R;
    this.body = this.game.physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y, pos.z));
    const h = kind === 'rabbit' ? 0.12 : 0.6;
    const r = kind === 'rabbit' ? 0.14 : 0.28;
    this.collider = this.game.physics.world.createCollider(R.ColliderDesc.capsule(h, r).setTranslation(0, h + r, 0).setCollisionGroups(groups(GROUP.CREATURE, GROUP.STATIC | GROUP.PLAYER | GROUP.ITEM)), this.body);
    this.game.physics.setOwner(this.collider, { kind: 'creature', creature: this });
  }

  build() {
    const g = geometries();
    const r = this.root;
    if (this.kind === 'rabbit') {
      const R = g.rabbit;
      this.pelvis = joint(r, 0, 0, 0);
      part(R.body, g.fur, this.pelvis);
      part(R.belly, g.belly, this.pelvis);
      part(R.tail, g.belly, this.pelvis, 0, 0.2, 0.2);
      this.head = joint(this.pelvis, 0, 0.27, -0.17);
      part(R.head, g.fur, this.head);
      for (const s of [-1, 1]) {
        const ear = joint(this.head, s * 0.028, 0.045, 0.02);
        ear.rotation.set(0.35, 0, s * 0.18);
        part(R.ear, g.fur, ear);
        part(R.eye, g.eye, this.head, s * 0.045, 0.015, -0.045);
      }
      this.legs = [];
      for (const s of [-1, 1]) {
        const hip = joint(this.pelvis, s * 0.07, 0.14, 0.1);
        part(R.thigh, g.fur, hip);
        const foot = joint(hip, 0, -0.1, 0.05);
        part(R.foot, g.fur, foot);
        const sh = joint(this.pelvis, s * 0.05, 0.14, -0.12);
        part(R.leg, g.fur, sh);
        this.legs.push({ hip, foot, sh });
      }
    } else {
      const H = g.husk;
      this.hips = joint(r, 0, 0.98, 0);
      this.spine = joint(this.hips, 0, 0.02, 0);
      part(H.torso, g.skin, this.spine);
      this.neck = joint(this.spine, 0, 0.6, 0.04);
      this.head = joint(this.neck, 0, 0.02, -0.02);
      part(H.head, g.skin, this.head);
      for (const s of [-1, 1]) part(H.eye, g.huskEye, this.head, s * 0.035, 0.1, -0.085);
      this.arms = [];
      this.legs = [];
      for (const s of [-1, 1]) {
        const sh = joint(this.spine, s * 0.22, 0.52, 0);
        part(H.upperArm, g.skin, sh);
        const el = joint(sh, 0, -0.34, 0);
        part(H.foreArm, g.skin, el);
        const wr = joint(el, 0, -0.36, 0);
        part(H.hand, g.skinDark, wr);
        this.arms.push({ sh, el, wr });
        const hip = joint(this.hips, s * 0.1, -0.02, 0);
        part(H.thigh, g.skin, hip);
        const knee = joint(hip, 0, -0.44, 0);
        part(H.shin, g.skin, knee);
        const ankle = joint(knee, 0, -0.44, 0);
        part(H.foot, g.skinDark, ankle);
        this.legs.push({ hip, knee, ankle });
      }
    }
  }

  damage(amount, dir) {
    if (this.dead) return;
    this.hp -= amount;
    this.state = this.kind === 'rabbit' && this.hp < 20 ? 'flee' : 'chase';
    this.root.position.addScaledVector(dir.clone().setY(0).normalize(), 0.3);
    const g = this.game;
    g.audio?.play('flesh_hit', { pos: this.root.position });
    if (this.hp <= 0) this.die();
  }

  die() {
    this.dead = true;
    this.state = 'dead';
    this.game.stats.kills++;
    this.game.audio?.play(this.kind === 'rabbit' ? 'rabbit_die' : 'husk_die', { pos: this.root.position });
    this.collider.setEnabled(false);
  }

  update(dt, player, env) {
    const g = this.game;
    this.t += dt;
    if (this.dead) {
      this.deadT += dt;
      const k = clamp01(this.deadT * 3);
      this.root.rotation.z = lerp(this.root.rotation.z, this.kind === 'rabbit' ? Math.PI / 2 : Math.PI / 2.2, k);
      if (this.kind !== 'rabbit') this.root.position.y = lerp(this.root.position.y, this.ground() + 0.1, k);
      return this.deadT > 25;
    }
    const pp = player.seat ? player.seat.car.position : player.position;
    const to = pp.clone().sub(this.root.position).setY(0);
    const dist = to.length();
    const night = env.night;
    const lit = this.inLight();
    if (this.kind === 'rabbit') {
      const aggro = night > 0.5 ? 16 : 5;
      if (this.state !== 'flee' && dist < aggro && !player.dead) this.state = dist < 1.3 ? 'attack' : 'chase';
      else if (this.state === 'chase' && dist > aggro * 2) this.state = 'wander';
    } else {
      if (lit && dist < 14) this.state = 'flee';
      else if (dist < 40 + night * 20 && !player.dead) this.state = dist < 1.6 ? 'attack' : 'chase';
      else this.state = 'wander';
    }
    let targetHeading = this.heading;
    let want = 0;
    if (this.state === 'wander') {
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = 2 + Math.random() * 4;
        this.heading += (Math.random() - 0.5) * 2.4;
      }
      want = this.kind === 'rabbit' ? (Math.sin(this.t * 0.7) > 0.3 ? 1.6 : 0) : 0.7;
    } else if (this.state === 'chase' || this.state === 'attack') {
      targetHeading = Math.atan2(to.x, to.z);
      want = this.kind === 'rabbit' ? 6.5 : dist < 9 ? 3.6 : 2;
      if (this.state === 'attack') want = 0.3;
    } else if (this.state === 'flee') {
      targetHeading = Math.atan2(-to.x, -to.z);
      want = this.kind === 'rabbit' ? 7.5 : 3;
      if (dist > 30 && !lit) this.state = 'wander';
    }
    if (this.state !== 'wander') this.heading = dampAngle(this.heading, targetHeading, 6, dt);
    this.speed = lerp(this.speed, want, 1 - Math.exp(-dt * 4));
    const step = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)).multiplyScalar(this.speed * dt);
    this.root.position.add(step);
    const gy = this.ground();
    let hop = 0;
    if (this.kind === 'rabbit' && this.speed > 0.5) {
      this.hopT += dt * (2.2 + this.speed * 0.5);
      hop = Math.abs(Math.sin(this.hopT * Math.PI)) * 0.18 * clamp01(this.speed / 3);
    }
    this.root.position.y = gy + hop;
    this.root.rotation.y = this.heading + Math.PI;
    this.body.setNextKinematicTranslation(this.root.position);
    this.animate(dt);
    // attacks
    this.attackCool -= dt;
    if (this.state === 'attack' && this.attackCool <= 0 && dist < (this.kind === 'rabbit' ? 1.5 : 1.9)) {
      this.attackCool = this.kind === 'rabbit' ? 1.1 : 1.8;
      g.audio?.play(this.kind === 'rabbit' ? 'rabbit_attack' : 'husk_attack', { pos: this.root.position });
      if (player.seat) {
        const car = player.seat.car;
        const part = car.parts[['frontDoor_L', 'frontDoor_R', 'hood', 'windshield'][Math.floor(Math.random() * 4)]];
        if (part?.installed) part.cond = Math.max(0, part.cond - 0.03);
      } else player.hurt((this.kind === 'rabbit' ? 11 : 24) * (g.difficulty.creatures ?? 1), 'creature');
    }
    // run over by the car
    const car = g.car;
    const cv = Math.abs(car.vehicle.speed);
    if (cv > 4 && car.position.distanceTo(this.root.position) < 1.9) {
      this.die();
      g.audio?.play('impact_soft', { pos: this.root.position, volume: 1 });
      const bumper = car.parts.frontBumper;
      if (bumper?.installed) bumper.cond = Math.max(0, bumper.cond - (this.kind === 'rabbit' ? 0.01 : 0.06));
    }
    // growls
    if (this.state === 'chase' && Math.random() < dt * 0.15) g.audio?.play(this.kind === 'rabbit' ? 'rabbit_squeal' : 'husk_growl', { pos: this.root.position, volume: 0.6 });
    return dist > 190;
  }

  ground() {
    const g = this.game;
    return g.groundHeight(this.root.position.x, this.root.position.z) ?? 0;
  }

  /** Headlights or a flashlight pointed at the creature. */
  inLight() {
    const g = this.game;
    const car = g.car;
    const p = this.root.position;
    if (car.s.beams && car.power > 0.1) {
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(car.root.quaternion);
      const d = p.clone().sub(car.position);
      const len = d.length();
      if (len < 45 && d.normalize().dot(f) > 0.82) return true;
    }
    if (g.interaction?.flashlightOn) {
      const cam = g.camera;
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      const d = p.clone().add(new THREE.Vector3(0, 1, 0)).sub(cam.position);
      if (d.length() < 22 && d.normalize().dot(f) > 0.9) return true;
    }
    return false;
  }

  animate(dt) {
    const s = this.speed;
    const ph = this.t * (this.kind === 'rabbit' ? 0 : 1.6 + s * 1.2);
    if (this.kind === 'rabbit') {
      const k = clamp01(s / 3);
      const hop = Math.sin(this.hopT * Math.PI * 2);
      this.pelvis.rotation.x = -hop * 0.15 * k;
      for (const l of this.legs) {
        l.hip.rotation.x = hop * 0.7 * k;
        l.foot.rotation.x = -hop * 0.5 * k;
        l.sh.rotation.x = -hop * 0.8 * k;
      }
      this.head.rotation.x = Math.sin(this.t * 7) * 0.05 * (1 - k);
      const G2 = geometries();
      G2.eye.emissiveIntensity = this.game.env.night * 3;
      return;
    }
    const k = clamp01(s / 2.5);
    this.spine.rotation.x = 0.45 + k * 0.2 + Math.sin(this.t * 1.3) * 0.03;
    this.neck.rotation.x = -0.35 - k * 0.1;
    this.head.rotation.y = Math.sin(this.t * 0.9) * 0.25 * (1 - k);
    this.head.rotation.z = Math.sin(this.t * 0.6) * 0.12;
    this.legs.forEach((l, i) => {
      const p = ph + i * Math.PI;
      l.hip.rotation.x = Math.sin(p) * 0.55 * k - 0.1;
      l.knee.rotation.x = Math.max(0, -Math.cos(p)) * 0.9 * k + 0.15;
      l.ankle.rotation.x = -0.1;
    });
    this.hips.position.y = 0.98 - Math.abs(Math.sin(ph)) * 0.04 * k - 0.05;
    const attack = this.state === 'attack';
    this.arms.forEach((a, i) => {
      const p = ph + i * Math.PI + Math.PI;
      a.sh.rotation.x = attack ? -1.6 + Math.sin(this.t * 9 + i) * 0.4 : Math.sin(p) * 0.35 * k - 0.25;
      a.sh.rotation.z = (i ? -1 : 1) * 0.12;
      a.el.rotation.x = attack ? -0.5 : -0.35 - k * 0.2;
    });
  }

  dispose() {
    this.game.physics.removeBody(this.body);
    this.sys.group.remove(this.root);
  }
}

class Vulture {
  constructor(sys, i) {
    const g = geometries();
    this.sys = sys;
    this.root = new THREE.Group();
    this.body = part(g.bird.body, g.feather, this.root);
    this.wings = [-1, 1].map((s) => {
      const w = new THREE.Mesh(g.bird.wing, g.feather);
      w.scale.x = s;
      w.position.set(s * 0.08, 0.02, 0);
      this.root.add(w);
      return w;
    });
    this.a = i * 2.1;
    this.r = 35 + i * 12;
    this.h = 55 + i * 9;
    this.speed = 0.12 + i * 0.02;
    sys.group.add(this.root);
  }

  update(dt, centre, day) {
    this.a += dt * this.speed;
    this.root.visible = day > 0.4;
    this.root.position.set(centre.x + Math.cos(this.a) * this.r, centre.y + this.h + Math.sin(this.a * 3) * 2, centre.z + Math.sin(this.a) * this.r);
    this.root.rotation.set(0, -this.a, 0.35);
    const flap = Math.sin(performance.now() / 180 + this.a * 5) * 0.15;
    this.wings[0].rotation.z = flap;
    this.wings[1].rotation.z = -flap;
  }
}

export class Creatures {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'creatures';
    game.scene.add(this.group);
    this.list = [];
    this.birds = [0, 1, 2].map((i) => new Vulture(this, i));
    this.spawnT = 3;
    this.rng = new Rng(game.seed + 99);
  }

  update(dt) {
    const g = this.game;
    const env = g.env;
    const player = g.player;
    const centre = player.seat ? player.seat.car.position : player.position;
    for (const b of this.birds) b.update(dt, centre, 1 - env.night);
    for (const c of [...this.list]) {
      if (c.update(dt, player, env)) {
        c.dispose();
        this.list.splice(this.list.indexOf(c), 1);
      }
    }
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = 6 + this.rng.range(0, 6);
    const k = g.difficulty.creatures ?? 1;
    const husks = this.list.filter((c) => c.kind === 'husk' && !c.dead).length;
    const rabbits = this.list.filter((c) => c.kind === 'rabbit' && !c.dead).length;
    const km = g.km();
    if (km < 0.4) return; // leave the home plot in peace
    if (env.night > 0.6 && husks < Math.round(2 * k) && this.rng.chance(0.55)) this.spawn('husk', centre, 45, 75);
    else if (rabbits < Math.round(3 * k) && this.rng.chance(0.35)) this.spawn('rabbit', centre, 25, 70);
    // husks leave at dawn
    if (env.night < 0.3) for (const c of this.list) if (c.kind === 'husk' && !c.dead) c.state = 'flee';
  }

  spawn(kind, centre, r0, r1) {
    const g = this.game;
    const a = this.rng.range(0, Math.PI * 2);
    const r = this.rng.range(r0, r1);
    const p = centre.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    // not on the road and not inside buildings
    const rx = g.world.gen.roadX(p.z + g.origin.z) - g.origin.x;
    if (Math.abs(p.x - rx) < ROAD.totalHalf + 2) p.x += (p.x > rx ? 1 : -1) * 8;
    if (g.world.insideBuilding(p.clone().setY(g.groundHeight(p.x, p.z) + 1))) return;
    p.y = g.groundHeight(p.x, p.z);
    this.list.push(new Creature(this, kind, p));
  }

  shift(dx, dz) {
    for (const c of this.list) {
      c.root.position.x -= dx;
      c.root.position.z -= dz;
    }
  }

  dispose() {
    for (const c of this.list) c.dispose();
    this.list = [];
    this.game.scene.remove(this.group);
  }
}
