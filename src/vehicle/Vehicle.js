import * as THREE from 'three';
import { SPEC } from './spec.js';
import { GROUP, groups } from '../physics/physics.js';
import { clamp, lerp } from '../core/math.js';

/**
 * Raycast vehicle on a Rapier rigid body.
 *
 * - Suspension: spring + bump/rebound damper + anti-roll bar per axle, bump stops.
 * - Tyres: combined-slip Pacejka-style curves, friction ellipse, surface grip and wetness,
 *   forces applied at the axle's roll-centre height (keeps load transfer realistic).
 * - Wheels: implicit integration of spin (stable with stiff tyres), brakes that lock cleanly.
 * - Drivetrain: torque curve, auto clutch, 5-speed gearbox (manual or automatic), engine
 *   inertia reflected to the driven wheels.
 *
 * With a 0.5 m centre of mass and 1.48 m track the car needs well over 1 g of lateral force to
 * tip, which the tyres cannot produce on flat ground: rollovers only come from sliding into
 * slopes, ditches and obstacles at speed — as in reality.
 */
const UP = new THREE.Vector3(0, 1, 0);
const tmp = {
  q: new THREE.Quaternion(),
  up: new THREE.Vector3(),
  fwd: new THREE.Vector3(),
  right: new THREE.Vector3(),
  mount: new THREE.Vector3(),
  wf: new THREE.Vector3(),
  ws: new THREE.Vector3(),
  f: new THREE.Vector3(),
  p: new THREE.Vector3(),
  v: new THREE.Vector3(),
};

function curve(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i][0]) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
}

export class Vehicle {
  /**
   * @param physics Physics wrapper
   * @param opts.position {x,y,z} world position of the car origin (ground level between axles)
   * @param opts.yaw heading, radians
   * @param opts.surfaceAt (collider, point) => { grip, roll, kind }
   */
  constructor(physics, { position, yaw = 0, surfaceAt, owner }) {
    this.physics = physics;
    this.R = physics.R;
    this.spec = SPEC;
    this.surfaceAt = surfaceAt || (() => ({ grip: 1, roll: SPEC.tyre.rolling, kind: 'asphalt' }));
    const R = this.R;
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    const desc = R.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setLinearDamping(0.02)
      .setAngularDamping(0.25)
      .setCanSleep(true)
      .setCcdEnabled(true);
    this.body = physics.world.createRigidBody(desc);
    this.colliders = SPEC.colliders.map((c) => {
      const cd = R.ColliderDesc.roundCuboid(c.half[0], c.half[1], c.half[2], c.radius)
        .setTranslation(...c.at)
        .setDensity(0)
        .setFriction(0.55)
        .setRestitution(0.05)
        .setCollisionGroups(groups(GROUP.CAR))
        .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(9000);
      const col = physics.world.createCollider(cd, this.body);
      if (owner) physics.setOwner(col, owner);
      return col;
    });
    this.extraMass = 0;
    this.setMass(SPEC.mass);

    const S = SPEC.suspension;
    this.wheels = SPEC.wheels.map((w) => {
      const axle = w.front ? S.front : S.rear;
      return {
        id: w.id,
        front: w.front,
        left: w.left,
        driven: SPEC.driven.includes(w.id),
        axle,
        mount: new THREE.Vector3(w.x, SPEC.wheelY + S.bump, w.z),
        maxLen: S.bump + S.droop,
        freeLen: 0,
        len: S.bump,
        prevLen: S.bump,
        present: true,
        radius: SPEC.radius,
        grip: 1,
        flat: false,
        omega: 0,
        spin: 0,
        steer: 0,
        grounded: false,
        Fz: 0,
        slipRatio: 0,
        slipAngle: 0,
        surface: 'asphalt',
        contact: new THREE.Vector3(),
        normal: new THREE.Vector3(0, 1, 0),
        brakeTorque: 0,
        driveTorque: 0,
      };
    });
    this.calibrateSprings();

    this.input = { throttle: 0, brake: 0, handbrake: 0, steer: 0 };
    this.steerAngle = 0;
    this.automatic = true;
    this.gear = 1; // neutral
    this.shiftT = 0;
    this.rpm = 0;
    this.engineOn = false;
    this.torqueScale = 1; // engine health, misfire
    this.clutchSlip = 0;
    this.speed = 0; // signed forward speed m/s
    this.skid = 0;
    this.onSand = 0;
    this.airborne = false;
    this.wetness = 0;
    this.reverseHold = 0;
  }

  /** Total mass incl. installed parts; keeps the tuned centre of mass and inertia ratios. */
  setMass(mass) {
    this.mass = mass;
    const k = mass / SPEC.mass;
    const i = SPEC.inertia;
    this.body.setAdditionalMassProperties(
      mass,
      SPEC.com,
      { x: i.x * k, y: i.y * k, z: i.z * k },
      { x: 0, y: 0, z: 0, w: 1 },
      true,
    );
    if (this.wheels) this.calibrateSprings();
  }

  /** Spring free lengths so the car sits at its design ride height with the current mass. */
  calibrateSprings() {
    const g = 9.81;
    const wb = SPEC.wheels.find((w) => !w.front).z - SPEC.wheels.find((w) => w.front).z;
    const zF = SPEC.wheels.find((w) => w.front).z;
    const rearShare = (SPEC.com.z - zF) / wb;
    for (const w of this.wheels) {
      const share = (w.front ? 1 - rearShare : rearShare) / 2;
      w.freeLen = SPEC.suspension.bump + (this.mass * g * share) / w.axle.k;
    }
  }

  get position() {
    return this.body.translation();
  }

  /** Car-to-world rotation. */
  quaternion(out = new THREE.Quaternion()) {
    const r = this.body.rotation();
    return out.set(r.x, r.y, r.z, r.w);
  }

  setInput(i) {
    Object.assign(this.input, i);
  }

  gearLabel() {
    if (this.gear === 0) return 'R';
    if (this.gear === 1) return 'N';
    return String(this.gear - 1);
  }

  shift(delta) {
    const n = SPEC.gearbox.ratios.length;
    const g = clamp(this.gear + delta, 0, n - 1);
    if (g === this.gear) return false;
    this.gear = g;
    this.shiftT = SPEC.gearbox.shiftTime;
    return true;
  }

  /** Applies suspension, tyre and drivetrain forces for one physics step of length dt. */
  step(dt) {
    const body = this.body;
    body.resetForces(false);
    body.resetTorques(false);
    const q = this.quaternion(tmp.q);
    const up = tmp.up.set(0, 1, 0).applyQuaternion(q);
    const fwd = tmp.fwd.set(0, 0, -1).applyQuaternion(q);
    const right = tmp.right.set(1, 0, 0).applyQuaternion(q);
    const t = body.translation();
    const lv = body.linvel();
    const vel = tmp.v.set(lv.x, lv.y, lv.z);
    this.speed = vel.dot(fwd);
    const speedAbs = Math.abs(this.speed);
    if (body.isSleeping() && this.input.throttle === 0 && !this.engineOn) return;

    this.updateSteering(dt, speedAbs);
    this.updateGearbox(dt);

    const S = SPEC.suspension;
    const world = this.physics.world;
    const R = this.R;
    let grounded = 0;
    let skid = 0;
    let sand = 0;
    // --- suspension raycasts and spring forces
    for (const w of this.wheels) {
      w.grounded = false;
      w.Fz = 0;
      if (!w.present) continue;
      const mount = tmp.mount.copy(w.mount).applyQuaternion(q).add(t);
      const ray = new R.Ray({ x: mount.x, y: mount.y, z: mount.z }, { x: -up.x, y: -up.y, z: -up.z });
      const hit = world.castRayAndGetNormal(ray, w.maxLen + w.radius, true, undefined, groups(GROUP.CAR, GROUP.STATIC | GROUP.DEBRIS), undefined, body);
      w.prevLen = w.len;
      if (!hit) {
        w.len = Math.min(w.maxLen, w.len + dt * 2.5);
        continue;
      }
      const rawLen = hit.timeOfImpact - w.radius;
      w.len = clamp(rawLen, 0, w.maxLen);
      w.grounded = true;
      grounded++;
      w.contact.set(mount.x - up.x * hit.timeOfImpact, mount.y - up.y * hit.timeOfImpact, mount.z - up.z * hit.timeOfImpact);
      w.normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
      const surf = this.surfaceAt(hit.collider, w.contact);
      w.surface = surf.kind;
      w.surfGrip = surf.grip;
      w.surfRoll = surf.roll;
      if (surf.kind === 'sand') sand++;
      // A ray that jumps over a crest or a triangle edge in one step is not a real compression
      // speed: clamp it, or the damper alone kicks the car into the air.
      const compressV = clamp((w.prevLen - w.len) / dt, -S.maxSpeed, S.maxSpeed);
      const spring = w.axle.k * (w.freeLen - w.len);
      const damper = compressV * (compressV > 0 ? w.axle.bump : w.axle.rebound);
      let F = spring + damper;
      // bump stop past full travel (the tyre squashing): stiff, but damped rather than springy,
      // and bounded, so a hard landing is absorbed instead of catapulting the car
      const pen = 0.012 - rawLen;
      if (pen > 0) F += S.bumpStop * Math.min(pen, 0.06) + S.bumpDamp * Math.max(compressV, 0);
      w.suspForce = Math.min(F, S.maxForce);
    }
    // anti-roll bars move load between the two wheels of an axle
    for (const [a, b] of [
      [0, 1],
      [2, 3],
    ]) {
      const wa = this.wheels[a];
      const wb = this.wheels[b];
      if (!wa.grounded || !wb.grounded) continue;
      const d = (wb.len - wa.len) * wa.axle.arb;
      wa.suspForce += d;
      wb.suspForce -= d;
    }

    // --- drivetrain torque at the driven wheels
    const drive = this.driveTorque(dt);
    const nDriven = this.wheels.filter((w) => w.driven && w.present).length || 1;
    const B = SPEC.brakes;
    const T = SPEC.tyre;

    // --- tyres
    let latSlipSum = 0;
    for (const w of this.wheels) {
      w.driveTorque = w.driven && w.present ? drive.torque / nDriven : 0;
      w.brakeTorque = this.input.brake * (w.front ? B.front : B.rear) + (!w.front ? this.input.handbrake * B.hand : 0);
      const inertia = SPEC.wheelInertia + (w.driven ? drive.reflectedInertia / nDriven : 0);
      if (!w.present) continue;
      if (!w.grounded) {
        // free spin: drive and brakes only
        let om = w.omega + (w.driveTorque / inertia) * dt;
        const db = ((w.brakeTorque + 5) / inertia) * dt;
        om = Math.abs(om) <= db ? 0 : om - Math.sign(om) * db;
        w.omega = om;
        w.spin += w.omega * dt;
        continue;
      }
      const Fz = Math.max(0, w.suspForce);
      w.Fz = Fz;
      body.addForceAtPoint({ x: up.x * Fz, y: up.y * Fz, z: up.z * Fz }, { x: w.contact.x, y: w.contact.y, z: w.contact.z }, true);

      // wheel frame on the contact plane
      const n = w.normal;
      const wf = tmp.wf.copy(fwd).applyAxisAngle(up, -w.steer);
      wf.addScaledVector(n, -wf.dot(n)).normalize();
      const ws = tmp.ws.crossVectors(wf, n).normalize(); // points to the car's right
      const pv = body.velocityAtPoint({ x: w.contact.x, y: w.contact.y, z: w.contact.z });
      const vLong = pv.x * wf.x + pv.y * wf.y + pv.z * wf.z;
      const vLat = pv.x * ws.x + pv.y * ws.y + pv.z * ws.z;
      const mu = (w.surfGrip ?? 1) * w.grip * (1 - 0.28 * this.wetness * (w.surface === 'asphalt' ? 1 : 0.4));
      const Fmax = mu * Fz;
      const r = w.radius;

      // implicit wheel spin: linearise Fx around the current slip (secant slope)
      const denom = Math.max(Math.abs(vLong), 3);
      const kappa0 = (w.omega * r - vLong) / denom;
      const fx0 = Math.sin(T.longC * Math.atan(T.longB * kappa0));
      const slope = Math.abs(kappa0) > 1e-4 ? (Fmax * fx0) / kappa0 : Fmax * T.longB * T.longC;
      const rollT = (w.surfRoll ?? T.rolling) * Fz * r * (w.flat ? 3 : 1);
      const Tnet = w.driveTorque - Math.sign(w.omega) * rollT;
      const a = inertia / dt + (slope * r * r) / denom;
      let om = (inertia * w.omega / dt + Tnet + (slope * r * vLong) / denom) / a;
      const db = (w.brakeTorque / inertia) * dt;
      if (db > 0) {
        // brake towards the ground speed of the wheel, never through zero
        if (Math.abs(om) <= db) om = 0;
        else om -= Math.sign(om) * db;
      }
      w.omega = om;
      w.spin += om * dt;

      const kappa = (om * r - vLong) / denom;
      let fx = Math.sin(T.longC * Math.atan(T.longB * kappa));
      const alpha = Math.atan2(vLat, Math.max(Math.abs(vLong), 1.5));
      let fy = -Math.sin(T.latC * Math.atan(T.latB * alpha));
      // friction ellipse
      const m = Math.hypot(fx, fy);
      if (m > 1) {
        fx /= m;
        fy /= m;
      }
      let Fx = fx * Fmax;
      let Fy = fy * Fmax;
      // near standstill: stiction so a braked/parked car does not creep on slopes
      const cornerMass = Fz / 9.81;
      if (Math.abs(vLong) < 0.35 && om === 0 && w.brakeTorque > 0) {
        Fx = clamp((-vLong * cornerMass) / dt, -Fmax, Fmax);
      }
      if (Math.abs(vLong) < 1.2 && Math.abs(vLat) < 0.6) {
        Fy = clamp((-vLat * cornerMass) / dt * 0.5, -Fmax, Fmax) * (1 - Math.abs(vLong) / 1.2) + Fy * (Math.abs(vLong) / 1.2);
      }
      w.slipRatio = kappa;
      w.slipAngle = alpha;
      const slipMag = Math.max(Math.abs(kappa) - 0.12, 0) * 2 + Math.max(Math.abs(alpha) - 0.1, 0) * 3;
      skid = Math.max(skid, clamp(slipMag, 0, 1) * clamp(Math.hypot(vLong, vLat) / 4, 0, 1));
      latSlipSum += Math.abs(alpha);

      // tyre force at the roll-centre height above the contact
      const rc = w.axle.rollCentre;
      const px = w.contact.x + up.x * rc;
      const py = w.contact.y + up.y * rc;
      const pz = w.contact.z + up.z * rc;
      tmp.f.copy(wf).multiplyScalar(Fx).addScaledVector(ws, Fy);
      body.addForceAtPoint({ x: tmp.f.x, y: tmp.f.y, z: tmp.f.z }, { x: px, y: py, z: pz }, true);
    }
    this.skid = skid;
    this.onSand = grounded ? sand / grounded : 0;
    this.airborne = grounded === 0;
    this.latSlip = latSlipSum / 4;

    // aerodynamic drag at the centre of mass
    const sp = vel.length();
    if (sp > 0.5) {
      const k = -SPEC.aero.drag * sp;
      body.addForce({ x: vel.x * k, y: vel.y * k, z: vel.z * k }, true);
    }
  }

  /**
   * Keyboard-friendly steering. At speed, full input asks for the angle that holds the tyres near
   * peak lateral grip on dry asphalt (kinematic angle for ~0.95 g plus the peak slip angle) instead
   * of a fixed fraction of full lock, so a tap at 110 km/h is a lane change, not a spin into the
   * dunes. Low-grip surfaces still break away, which is where slides and trips belong.
   */
  updateSteering(dt, speedAbs) {
    const st = SPEC.steer;
    const L = 2.6;
    const v2 = Math.max(speedAbs * speedAbs, 1e-3);
    const limit = Math.min(st.max, Math.atan((L * st.latG * 9.81) / v2) + st.peakSlip);
    const target = this.input.steer * limit;
    const fade = 1 / (1 + speedAbs / st.speedFade);
    const rate = (Math.abs(target) < Math.abs(this.steerAngle) ? st.returnRate : st.rate) * (0.35 + 0.65 * fade);
    const d = target - this.steerAngle;
    this.steerAngle += clamp(d, -rate * dt, rate * dt);
    // Ackermann: the inner wheel turns more
    const Tw = 1.48;
    const a = this.steerAngle;
    const inner = Math.abs(a) < 1e-4 ? a : Math.atan(L / (L / Math.tan(Math.abs(a)) - Tw / 2)) * Math.sign(a);
    const outer = Math.abs(a) < 1e-4 ? a : Math.atan(L / (L / Math.tan(Math.abs(a)) + Tw / 2)) * Math.sign(a);
    for (const w of this.wheels) {
      if (!w.front) continue;
      // positive steer = turn right; the right wheel is the inner one
      const isInner = a > 0 ? !w.left : w.left;
      w.steer = isInner ? inner : outer;
    }
  }

  /** Engine rpm the driven wheels would impose in a given gear. */
  wheelRpmFor(gear) {
    const G = SPEC.gearbox;
    const driven = this.wheels.filter((w) => w.driven && w.present);
    if (!driven.length) return 0;
    const omega = driven.reduce((s, w) => s + w.omega, 0) / driven.length;
    return Math.abs(omega * G.ratios[gear] * G.final) * (60 / (2 * Math.PI));
  }

  updateGearbox(dt) {
    this.shiftT = Math.max(0, this.shiftT - dt);
    if (!this.automatic) return;
    const thr = this.input.throttle;
    const speed = this.speed;
    const wantBack = this.input.reverseRequest;
    if (this.gear <= 1 && thr > 0.05 && speed > -1 && !wantBack) this.gear = 2;
    if (wantBack && Math.abs(speed) < 1) {
      this.reverseHold += dt;
      if (this.reverseHold > 0.25 && this.gear !== 0) {
        this.gear = 0;
        this.shiftT = SPEC.gearbox.shiftTime;
      }
    } else this.reverseHold = 0;
    if (this.gear === 0 && thr > 0.05 && speed > -1 && !wantBack) this.gear = 2;
    if (this.gear < 2 || this.shiftT > 0) return;
    // decisions from wheel speed, never from a free-revving engine
    const n = SPEC.gearbox.ratios.length;
    const rpm = this.wheelRpmFor(this.gear);
    const up = 2300 + 3500 * thr;
    const down = 1150 + 1600 * thr;
    if (rpm > up && this.gear < n - 1 && this.wheelRpmFor(this.gear + 1) > 1300) this.shift(1);
    else if (rpm < down && this.gear > 2 && this.wheelRpmFor(this.gear - 1) < SPEC.engine.redline * 0.9) this.shift(-1);
  }

  /** Engine and clutch: returns total torque at the driven axle and the reflected inertia. */
  driveTorque(dt) {
    const E = SPEC.engine;
    const G = SPEC.gearbox;
    const ratio = G.ratios[this.gear] * G.final;
    const driven = this.wheels.filter((w) => w.driven && w.present);
    const wheelRpm = this.wheelRpmFor(this.gear);
    const thr = this.engineOn ? this.input.throttle : 0;
    const friction = E.friction + E.frictionPerRpm * this.rpm;
    const available = this.engineOn ? curve(E.curve, this.rpm) * this.torqueScale : 0;
    const limiter = this.rpm > E.limiter ? 0 : 1;
    const neutral = this.gear === 1 || driven.length === 0;
    let torque = 0;
    let reflected = 0;
    if (this.shiftT > 0 && !neutral) {
      // shifting: clutch open, throttle cut, engine rev-matches the new gear
      const target = Math.max(wheelRpm, this.engineOn ? E.idle : 0);
      this.rpm += (target - this.rpm) * Math.min(1, dt * 12);
      this.clutchSlip = 1;
    } else if (neutral) {
      const net = available * thr * limiter - friction;
      this.rpm += ((net / E.inertia) * dt * 60) / (2 * Math.PI);
      if (this.engineOn) this.rpm = Math.max(this.rpm, E.idle * 0.97);
      this.clutchSlip = 1;
    } else {
      const launchGear = this.gear === 0 || this.gear === 2;
      const launch = E.idle + thr * 2300;
      if (this.engineOn && launchGear && wheelRpm < launch && wheelRpm < E.idle * 1.8) {
        // pulling away: the clutch slips, the engine is held near the launch rpm
        this.rpm += (launch - this.rpm) * Math.min(1, dt * 8);
        const creep = this.automatic ? 0.12 : 0.03;
        torque = available * Math.max(thr, creep) * limiter;
        this.clutchSlip = 1 - wheelRpm / Math.max(launch, 1);
      } else {
        this.rpm = Math.max(wheelRpm, this.engineOn ? E.idle * 0.95 : 0);
        const brake = (friction + (1 - thr) * 18) * (this.rpm > 200 ? 1 : 0);
        torque = available * thr * limiter - brake;
        this.clutchSlip = 0;
        reflected = E.inertia * ratio * ratio;
        // an automatic never lugs below idle: it would have downshifted; a manual stalls
        if (this.engineOn && wheelRpm < E.idle * 0.6 && !this.automatic) this.stalled = true;
      }
      torque *= ratio * G.efficiency;
    }
    if (!this.engineOn) this.rpm = Math.max(0, this.rpm - dt * 2500);
    this.rpm = clamp(this.rpm, 0, E.limiter + 150);
    return { torque: this.shiftT > 0 ? 0 : torque, reflectedInertia: reflected };
  }

  /** Car-space hub position of a wheel for the visuals. */
  hubLocal(w, out = new THREE.Vector3()) {
    return out.set(w.mount.x, w.mount.y - w.len, w.mount.z);
  }

  /** True when the car lies on its side or roof. */
  isFlipped() {
    const up = tmp.up.set(0, 1, 0).applyQuaternion(this.quaternion(tmp.q));
    return up.y < 0.35;
  }

  /** Rights the car next to its current position (player "push" action). */
  flipUpright() {
    const t = this.body.translation();
    const q = this.quaternion(tmp.q);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const yaw = Math.atan2(-f.x, -f.z);
    const nq = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    this.body.setTranslation({ x: t.x, y: t.y + 1.2, z: t.z }, true);
    this.body.setRotation({ x: nq.x, y: nq.y, z: nq.z, w: nq.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  teleport(pos, yaw) {
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    this.body.setTranslation(pos, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    for (const w of this.wheels) w.omega = 0;
  }

  dispose() {
    this.physics.removeBody(this.body);
  }
}
