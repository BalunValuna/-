import * as THREE from 'three';
import { GROUP, groups } from '../physics/physics.js';
import { clamp, clamp01, lerp } from '../core/math.js';
import { settings } from '../core/settings.js';

/**
 * First-person player: kinematic character controller (walk, sprint, crouch, jump, steps and
 * slopes), mouse look, head bob, seating in cars and the survival stats.
 */
const STAND = 1.64;
const CROUCH = 1.08;
const RADIUS = 0.28;
const HALF = 0.62;

export class Player {
  constructor(game, position) {
    this.game = game;
    const { world, R } = game.physics;
    this.camera = game.camera;
    this.body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x, position.y + HALF + RADIUS, position.z));
    this.collider = world.createCollider(
      R.ColliderDesc.capsule(HALF, RADIUS).setCollisionGroups(groups(GROUP.PLAYER, 0xffff & ~GROUP.TRIGGER)).setFriction(0),
      this.body,
    );
    game.physics.setOwner(this.collider, { kind: 'player', player: this });
    this.kcc = world.createCharacterController(0.02);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.setMaxSlopeClimbAngle((48 * Math.PI) / 180);
    this.kcc.setMinSlopeSlideAngle((55 * Math.PI) / 180);
    this.kcc.enableAutostep(0.36, 0.18, false);
    this.kcc.enableSnapToGround(0.35);
    this.kcc.setApplyImpulsesToDynamicBodies(true);
    this.kcc.setCharacterMass(80);
    this.kcc.setSlideEnabled(true);

    this.yaw = 0;
    this.pitch = 0;
    this.vel = new THREE.Vector3();
    this.grounded = false;
    this.eye = STAND;
    this.crouching = false;
    this.bobT = 0;
    this.bobAmount = 0;
    this.fallSpeed = 0;
    this.stepDist = 0;
    this.seat = null; // { car, which }
    this.seatYaw = 0;
    this.seatPitch = 0;
    this.moving = 0;
    this.speed = 0;

    this.stats = { health: 100, food: 82, water: 76, energy: 88 };
    this.dead = false;
    this.deathCause = '';
    this.hurtT = 0;
    this.sprintT = 0;
  }

  get position() {
    const t = this.body.translation();
    return new THREE.Vector3(t.x, t.y - HALF - RADIUS, t.z);
  }

  teleport(p, yaw = this.yaw) {
    this.body.setTranslation({ x: p.x, y: p.y + HALF + RADIUS + 0.02, z: p.z }, true);
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y + HALF + RADIUS + 0.02, z: p.z });
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
  }

  look(input) {
    const d = input.takeLook();
    const s = 0.0022 * settings.get('sensitivity');
    const inv = settings.get('invertY') ? -1 : 1;
    this.lastLook = d;
    if (this.seat) {
      this.seatYaw = clamp(this.seatYaw - d.x * s, -2.4, 2.4);
      this.seatPitch = clamp(this.seatPitch - d.y * s * inv, -1.25, 1.1);
    } else {
      this.yaw -= d.x * s;
      this.pitch = clamp(this.pitch - d.y * s * inv, -1.52, 1.52);
    }
  }

  /** Walking movement for one frame. */
  move(dt, input, { frozen = false } = {}) {
    if (this.seat) return;
    const wish = new THREE.Vector3();
    if (!frozen) {
      if (input.down('forward')) wish.z -= 1;
      if (input.down('back')) wish.z += 1;
      if (input.down('left')) wish.x -= 1;
      if (input.down('right')) wish.x += 1;
    }
    wish.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    this.crouching = !frozen && input.down('crouch');
    const sprint = !frozen && input.down('sprint') && !this.crouching && wish.lengthSq() > 0 && this.stats.energy > 3;
    const carry = this.game.interaction?.carryPenalty?.() ?? 1;
    const speed = (this.crouching ? 1.6 : sprint ? 6.2 : 3.3) * carry;
    const accel = this.grounded ? 14 : 2.5;
    const target = wish.multiplyScalar(speed);
    this.vel.x = lerp(this.vel.x, target.x, 1 - Math.exp(-accel * dt));
    this.vel.z = lerp(this.vel.z, target.z, 1 - Math.exp(-accel * dt));
    if (this.grounded && !frozen && input.pressed('jump') && !this.crouching) {
      this.vel.y = 4.6;
      this.game.audio?.play('footstep_sand', { volume: 0.6 });
    }
    this.vel.y -= 9.81 * dt;
    if (this.grounded && this.vel.y < -1) this.vel.y = -1;

    const desired = this.vel.clone().multiplyScalar(dt);
    this.kcc.computeColliderMovement(this.collider, desired, this.game.physics.R.QueryFilterFlags.EXCLUDE_SENSORS, groups(GROUP.PLAYER, GROUP.STATIC | GROUP.CAR | GROUP.ITEM | GROUP.DEBRIS | GROUP.CREATURE));
    const m = this.kcc.computedMovement();
    const t = this.body.translation();
    const wasGrounded = this.grounded;
    this.grounded = this.kcc.computedGrounded();
    this.body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
    if (dt > 0) {
      const vy = m.y / dt;
      if (this.grounded && !wasGrounded && this.fallSpeed < -7) this.land(this.fallSpeed);
      this.fallSpeed = this.grounded ? 0 : Math.min(this.fallSpeed, vy);
      if (this.grounded) this.vel.y = Math.max(this.vel.y, 0);
    }
    // ground falls away under the controller when a chunk unloads: keep above terrain
    const ground = this.game.groundHeight(t.x, t.z);
    if (ground !== null && t.y - HALF - RADIUS < ground - 0.5) this.body.setNextKinematicTranslation({ x: t.x, y: ground + HALF + RADIUS + 0.05, z: t.z });

    const horiz = Math.hypot(m.x, m.z) / Math.max(dt, 1e-4);
    this.speed = horiz;
    this.moving = this.grounded ? clamp01(horiz / 3) : 0;
    this.sprinting = sprint && horiz > 4;
    this.stepDist += horiz * dt;
    const stride = sprint ? 1.9 : this.crouching ? 0.9 : 1.45;
    if (this.grounded && this.stepDist > stride) {
      this.stepDist = 0;
      const surf = this.game.surfaceUnder(this.position);
      this.game.audio?.play(`footstep_${surf}`, { volume: this.crouching ? 0.35 : sprint ? 1 : 0.7 });
    }
    this.eye = lerp(this.eye, this.crouching ? CROUCH : STAND, 1 - Math.exp(-dt * 10));
  }

  land(v) {
    const dmg = Math.max(0, (-v - 8.5) * 9);
    this.game.audio?.play('land', { volume: clamp01(-v / 12) });
    if (dmg > 0) this.hurt(dmg, 'fall');
  }

  /** Places the camera: eye height with head bob, or the car seat. */
  updateCamera(dt) {
    const cam = this.camera;
    if (this.seat) {
      const car = this.seat.car;
      const eye = car.worldPoint(this.seat.eye);
      cam.position.copy(eye);
      const q = car.root.quaternion.clone();
      const look = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.seatPitch, this.seatYaw, 0, 'YXZ'));
      cam.quaternion.copy(q.multiply(look));
      return;
    }
    const t = this.body.translation();
    const bobOn = settings.get('headBob');
    this.bobT += dt * (this.sprinting ? 11 : 7.6) * this.moving;
    this.bobAmount = lerp(this.bobAmount, this.moving * (bobOn ? 1 : 0), 1 - Math.exp(-dt * 6));
    const bobY = Math.sin(this.bobT * 2) * 0.035 * this.bobAmount;
    const bobX = Math.cos(this.bobT) * 0.025 * this.bobAmount;
    cam.position.set(t.x, t.y - HALF - RADIUS + this.eye + bobY, t.z);
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    cam.position.addScaledVector(right, bobX);
    cam.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, Math.sin(this.bobT) * 0.004 * this.bobAmount, 'YXZ'));
  }

  /** Sits in a car seat; the controller is switched off while seated. */
  sit(car, which, seatInfo) {
    this.seat = { car, which, eye: seatInfo.eye, exit: seatInfo.exit };
    this.collider.setEnabled(false);
    this.seatYaw = 0;
    this.seatPitch = -0.05;
    this.vel.set(0, 0, 0);
    if (which === 'driver') car.driver = this;
  }

  standUp() {
    const { car } = this.seat;
    const exit = car.worldPoint(this.seat.exit);
    const ground = this.game.groundHeight(exit.x, exit.z) ?? exit.y;
    exit.y = Math.max(exit.y, ground) + 0.05;
    // face the way the car faces
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(car.root.quaternion);
    if (car.driver === this) car.driver = null;
    this.seat = null;
    this.collider.setEnabled(true);
    this.teleport(exit, Math.atan2(-f.x, -f.z));
    this.pitch = 0;
  }

  // ------------------------------------------------------------------ survival

  /** Game-time survival: `hours` of game time passed. */
  tickStats(hours, diff) {
    const s = this.stats;
    const exert = this.sprinting ? 2.2 : this.moving > 0.2 ? 1.25 : 1;
    const hot = this.game.ambientTemp() > 34 ? 1.35 : 1;
    s.water = clamp(s.water - hours * 4.2 * diff.thirst * exert * hot, 0, 100);
    s.food = clamp(s.food - hours * 2.8 * diff.hunger * exert, 0, 100);
    s.energy = clamp(s.energy - hours * 3.4 * exert, 0, 100);
    if (s.water <= 0) this.hurt(hours * 22, 'thirst', true);
    if (s.food <= 0) this.hurt(hours * 9, 'hunger', true);
    if (s.water > 25 && s.food > 25 && s.health < 100) s.health = Math.min(100, s.health + hours * 3);
  }

  hurt(amount, cause, silent = false) {
    if (this.dead || amount <= 0) return;
    this.stats.health -= amount;
    this.hurtT = Math.min(1, this.hurtT + amount / 30);
    if (!silent) this.game.audio?.play('hurt', { volume: clamp01(amount / 25) + 0.3 });
    if (this.stats.health <= 0) {
      this.stats.health = 0;
      this.dead = true;
      this.deathCause = cause;
      this.game.onPlayerDeath(cause);
    }
  }

  consume(food) {
    const s = this.stats;
    s.food = clamp(s.food + (food.hunger || 0), 0, 100);
    s.water = clamp(s.water + (food.thirst || 0), 0, 100);
    s.energy = clamp(s.energy + (food.energy || 0), 0, 100);
    s.health = clamp(s.health + (food.health || 0), 0, 100);
  }

  save() {
    const p = this.position;
    const o = this.game.origin;
    return {
      pos: [p.x + o.x, p.y, p.z + o.z],
      yaw: this.yaw,
      stats: { ...this.stats },
      seat: this.seat ? this.seat.which : null,
    };
  }
}
