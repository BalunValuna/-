import * as THREE from 'three';

/**
 * Dev/test helpers attached as `game.dev` (used by tools/gameShot.mjs scenarios). They drive the
 * real simulation — same physics, car and world code — without waiting for rendered frames,
 * which matters when the only GPU is a software rasteriser.
 */
export function attachDevTools(game) {
  const STEP = 1 / 120;
  const dev = {
    /** Runs `seconds` of simulation with fixed driver inputs; returns telemetry samples. */
    simulate(seconds, inputs = {}, { sampleEvery = 0.5, onSample = null, until = null } = {}) {
      const car = game.car;
      const samples = [];
      let t = 0;
      let nextSample = 0;
      let worldT = 0;
      while (t < seconds) {
        if (until?.(car, t)) break;
        const inp = typeof inputs === 'function' ? inputs(t, car) : inputs;
        if (game.player.seat?.which === 'driver') car.drive({ forward: !!inp.forward, back: !!inp.back, handbrake: !!inp.handbrake, steer: inp.steer || 0 });
        else car.idleInputs();
        car.physicsStep(STEP);
        game.world.wrecks.physicsStep(STEP);
        game.physics.step(STEP);
        t += STEP;
        worldT += STEP;
        if (worldT >= 0.1) {
          car.update(worldT);
          car.syncVisual();
          game.player.updateCamera(worldT);
          game.world.terrain.update(car.position.x, car.position.z, 8);
          game.world.pois.update(car.position, false, worldT);
          game.world.props.update(car.position);
          game.maybeShiftOrigin();
          worldT = 0;
        }
        if (t >= nextSample) {
          nextSample += sampleEvery;
          const v = car.vehicle;
          const up = new THREE.Vector3(0, 1, 0).applyQuaternion(car.root.quaternion);
          const s = {
            t: +t.toFixed(2),
            kmh: +car.speedKmh().toFixed(1),
            rpm: Math.round(v.rpm),
            gear: v.gearLabel(),
            roll: +((Math.asin(Math.max(-1, Math.min(1, new THREE.Vector3(1, 0, 0).applyQuaternion(car.root.quaternion).y))) * 180) / Math.PI).toFixed(1),
            upY: +up.y.toFixed(3),
            skid: +v.skid.toFixed(2),
            load: v.wheels.map((w) => Math.round(w.Fz)),
            steer: +v.steerAngle.toFixed(3),
            surf: v.wheels.map((w) => (w.contact ? (w.surface || '?')[0] : '-')).join(''),
            yawRate: +(car.vehicle.body.angvel().y).toFixed(2),
            offRoad: +(Math.abs(car.position.x + game.origin.x - game.world.gen.roadX(car.position.z + game.origin.z))).toFixed(1),
          };
          samples.push(s);
          onSample?.(s);
        }
      }
      car.update(0);
      car.syncVisual();
      return samples;
    },

    /** Puts the car on the highway at distance z (m) facing the journey direction. */
    carOnRoad(z, lane = 1.8) {
      const gen = game.world.gen;
      const o = game.origin;
      const rx = gen.roadX(z);
      const h = gen.roadHeading(z);
      const x = rx + Math.cos(h) * lane;
      const zz = z - Math.sin(h) * lane;
      game.world.terrain.warm(x - o.x, zz - o.z);
      game.car.vehicle.teleport({ x: x - o.x, y: gen.height(x, zz) + 0.45, z: zz - o.z }, h + Math.PI);
      game.car.syncVisual();
    },

    /** Input function that follows the highway at a target speed (pure pursuit). */
    follow(kmh, lane = 1.8) {
      const gen = game.world.gen;
      return (t, car) => {
        const o = game.origin;
        const p = car.position;
        const wz = p.z + o.z;
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(car.root.quaternion);
        const look = wz + 14 * Math.sign(fwd.z || 1);
        const h = gen.roadHeading(look);
        const tx = gen.roadX(look) + Math.cos(h) * lane - o.x;
        const tz = look - Math.sin(h) * lane - o.z;
        const to = new THREE.Vector3(tx - p.x, 0, tz - p.z).normalize();
        const cross = fwd.x * to.z - fwd.z * to.x;
        const steer = Math.max(-1, Math.min(1, cross * 3));
        const v = car.speedKmh();
        return { forward: v < kmh, back: v > kmh + 12, steer };
      };
    },

    readyCar() {
      const car = game.car;
      for (const it of [...game.items.items]) {
        if (it.kind === 'part' && !car.installed(it.partId)) {
          game.items.remove(it);
          car.attach(it.partId, it.root, 1);
        }
      }
      Object.assign(car.s, { fuel: 45, oil: 3.4, coolant: 5.2, charge: 0.9, ignition: true, running: true, temp: 85 });
      car.vehicle.rpm = 900;
    },

    chaseCam(back = 8, height = 2.6, side = 0) {
      const car = game.car;
      const q = car.root.quaternion;
      const p = car.position.clone().add(new THREE.Vector3(side, height, back).applyQuaternion(q));
      game.debugCam = { pos: p, target: car.position.clone().add(new THREE.Vector3(0, 0.8, 0)) };
    },
  };
  game.dev = dev;
  game.THREE = THREE;
  return dev;
}
