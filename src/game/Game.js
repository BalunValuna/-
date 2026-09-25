import * as THREE from 'three';
import { Physics, GROUP } from '../physics/physics.js';
import { Renderer } from '../render/renderer.js';
import { Environment } from '../render/environment.js';
import { Input } from '../core/input.js';
import { settings } from '../core/settings.js';
import { t, tr } from '../core/i18n.js';
import { clamp, clamp01 } from '../core/math.js';
import { AudioSystem } from '../audio/audio.js';
import { buildCarModel } from '../car/model.js';
import { carMaterials } from '../car/materials.js';
import { cloneCarModel } from '../car/cloneModel.js';
import { CarEntity, SEATS } from '../car/CarEntity.js';
import { Player } from '../player/Player.js';
import { Hands } from '../player/Hands.js';
import { Interaction } from '../player/Interaction.js';
import { World } from '../world/World.js';
import { ItemSystem } from '../items/ItemSystem.js';
import { Creatures } from '../creatures/Creatures.js';
import { SURFACE, SURFACE_GRIP } from '../world/worldgen.js';
import { UI } from '../ui/UI.js';
import { Tutorial } from './Tutorial.js';
import { SaveStore } from './save.js';

export const DIFFICULTY = {
  easy: { thirst: 0.7, hunger: 0.7, consumption: 0.8, creatures: 0.55, damage: 0.7, loot: 1.3 },
  normal: { thirst: 1, hunger: 1, consumption: 1, creatures: 1, damage: 1, loot: 1 },
  harsh: { thirst: 1.35, hunger: 1.3, consumption: 1.25, creatures: 1.5, damage: 1.35, loot: 0.75 },
};

const STEP = 1 / 120;
const GOAL_KM = 5000;
const SURFACE_KIND = {
  [SURFACE.SAND]: 'sand',
  [SURFACE.ASPHALT]: 'asphalt',
  [SURFACE.GRAVEL]: 'gravel',
  [SURFACE.ROCK]: 'rock',
  [SURFACE.DIRT]: 'dirt',
  [SURFACE.WOOD]: 'wood',
  [SURFACE.TILE]: 'concrete',
  [SURFACE.CONCRETE]: 'concrete',
};

/**
 * The game: owns the renderer, physics, world, car, player and UI, runs the main loop and the
 * state machine (boot → menu → play ⇄ pause/journal → dead/won).
 */
export class Game {
  constructor() {
    this.state = 'boot';
    this.origin = { x: 0, z: 0 };
    this.scene = new THREE.Scene();
    this.viewScene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.get('fov'), innerWidth / innerHeight, 0.05, 3000);
    this.scene.add(this.camera);
    this.gfx = new Renderer();
    this.gfx.setup(this.scene, this.camera);
    this.input = new Input(this.gfx.dom);
    this.audio = new AudioSystem();
    this.ui = new UI(this);
    this.saves = new SaveStore();
    this.difficulty = DIFFICULTY.normal;
    this.options = null;
    this.stats = { kills: 0, playTime: 0, money: 0, notes: [], maxKm: 0 };
    this.fps = 60;
    this.acc = 0;
    this.last = performance.now();
    this.menuT = 0;
    this.hudTimers = {};
    settings.on('change', (k, v) => {
      if (k === 'fov') {
        this.camera.fov = v;
        this.camera.updateProjectionMatrix();
      }
      if (k === 'dayLength' && this.env) this.env.secondsPerHour = (v * 60) / 24;
      if (['master', 'sfx', 'engine', 'ambient', 'radio', 'music'].includes(k)) this.applyVolumes();
    });
    window.game = this;
  }

  // ------------------------------------------------------------------ boot

  async boot() {
    const ui = this.ui;
    ui.loading(t('load.physics'), 0.05);
    this.physics = await Physics.create();
    await frame();
    ui.loading(t('load.car'), 0.2);
    await frame();
    // every car in the world is a clone of one pristine prototype (shared geometry)
    this.protoMats = carMaterials(0x7d1a20);
    this.carProto = buildCarModel(this.protoMats);
    this.carMats = carMaterials(0x7d1a20);
    this.carModel = cloneCarModel(this.carProto, this.protoMats, this.carMats);
    ui.loading(t('load.world'), 0.7);
    await frame();
    this.env = new Environment(this.gfx.renderer, this.scene, { seed: 1 });
    this.env.secondsPerHour = (settings.get('dayLength') * 60) / 24;
    this.env.onThunder = (d) => this.audio.play('thunder', { volume: clamp01(1 - d / 3000) });
    // Fixed pool of world lamps: light *counts* never change at runtime, so shaders never
    // recompile when buildings stream in or lights switch.
    this.lampPool = Array.from({ length: 3 }, () => {
      const l = new THREE.PointLight(0xffffff, 0, 10, 1.6);
      this.scene.add(l);
      return l;
    });
    this.hands = new Hands();
    this.viewScene.add(this.camera.clone());
    this.viewLight = new THREE.DirectionalLight(0xffffff, 2);
    this.viewHemi = new THREE.HemisphereLight(0xffffff, 0x404040, 0.5);
    this.viewFlash = new THREE.PointLight(0xfff0d8, 0, 3, 2);
    this.viewScene.add(this.viewLight, this.viewHemi, this.viewFlash);
    this.viewRoot = new THREE.Group();
    this.viewRoot.add(this.hands.view);
    this.viewScene.add(this.viewRoot);
    this.setupWorld(Number(this.saves.peek()?.seed) || 20130512, { menu: true });
    ui.loading(t('load.done'), 0.95);
    await frame();
    this.enterMenu();
    this.menuFrame(0);
    await this.precompile();
    requestAnimationFrame((t) => this.loop(t));
  }

  /** (Re)creates the world for a seed: terrain, POIs, items, creatures, car and player. */
  setupWorld(seed, { menu = false, start = 'ready', save = null } = {}) {
    this.disposeWorld();
    this.seed = seed;
    this.origin = { x: 0, z: 0 };
    this.world = new World(this, seed);
    this.items = new ItemSystem(this);
    this.creatures = new Creatures(this);
    const home = this.world.home;
    const carPos = save?.car ? { x: save.car.pos[0], y: save.car.pos[1], z: save.car.pos[2] } : home.carSpot;
    this.world.warm(carPos.x, carPos.z);
    if (!this.car) {
      this.car = new CarEntity(this, { model: this.carModel, mats: this.carMats, position: carPos, yaw: home.carYaw, shadows: this.gfx.q.carShadows });
      this.scene.add(this.car.root);
    } else {
      this.car.vehicle.teleport(carPos, home.carYaw);
    }
    const playerPos = save?.player ? new THREE.Vector3(...save.player.pos) : home.playerSpot;
    if (!this.player) this.player = new Player(this, playerPos);
    else this.player.teleport(playerPos);
    this.player.yaw = save?.player?.yaw ?? home.playerYaw;
    this.interaction = new Interaction(this);
    this.world.populate({ start, save, menu });
    this.tutorial = new Tutorial(this, start === 'garage' && !save);
  }

  disposeWorld() {
    this.interaction?.dispose();
    this.creatures?.dispose();
    this.items?.dispose();
    this.world?.dispose();
  }

  // ------------------------------------------------------------------ states

  enterMenu() {
    this.state = 'menu';
    this.input.unlock();
    this.env.time = 19.35;
    this.env.frozenWeather = true;
    this.env.setWeather('clear', 0.01);
    this.car.s.beams = 1;
    this.car.s.ignition = true;
    this.ui.showMenu();
    this.audio.initialized && this.audio.playMenuMusic();
  }

  /** options: { seed, difficulty, start: 'garage'|'ready', transmission: 'auto'|'manual' } */
  async newGame(options) {
    this.options = options;
    this.difficulty = DIFFICULTY[options.difficulty] || DIFFICULTY.normal;
    this.ui.loading(t('load.world'), 0.3);
    await frame();
    this.setupWorld(options.seed, { start: options.start });
    this.car.vehicle.automatic = options.transmission !== 'manual';
    this.stats = { kills: 0, playTime: 0, money: 12, notes: [], maxKm: 0 };
    this.env.frozenWeather = false;
    this.env.time = 8.2;
    this.env.day = 1;
    this.env.setWeather('clear', 0.01);
    this.car.s.beams = 0;
    this.car.s.ignition = false;
    await this.startPlay();
  }

  async loadGame(data) {
    this.ui.loading(t('load.world'), 0.3);
    await frame();
    this.options = data.options;
    this.difficulty = DIFFICULTY[data.options.difficulty] || DIFFICULTY.normal;
    this.setupWorld(data.seed, { start: data.options.start, save: data });
    this.stats = { ...this.stats, ...data.stats };
    this.env.time = data.env.time;
    this.env.day = data.env.day;
    this.env.frozenWeather = false;
    this.env.setWeather(data.env.weather || 'clear', 0.01);
    await this.startPlay();
  }

  async startPlay() {
    this.ui.loading(t('load.done'), 0.95);
    this.player.updateCamera(0);
    this.env.update(0, this.camera.position);
    await this.precompile();
    this.state = 'play';
    this.audio.stopMenuMusic?.();
    this.ui.showHud();
    this.input.lock();
    this.ensureAudio();
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'pause';
    this.input.unlock();
    this.audio.setPaused?.(true);
    this.ui.showPause();
  }

  resume() {
    if (this.state !== 'pause' && this.state !== 'journal') return;
    this.state = 'play';
    this.audio.setPaused?.(false);
    this.ui.showHud();
    this.input.lock();
  }

  openJournal() {
    if (this.state !== 'play') return;
    this.state = 'journal';
    this.input.unlock();
    this.ui.showJournal();
  }

  quitToMenu() {
    this.audio.setPaused?.(false);
    this.player.seat && this.player.standUp();
    this.setupWorld(this.seed, { menu: true });
    this.enterMenu();
  }

  /** Sleep in a bed: fade out, skip to morning (or a few hours), wake rested. */
  sleep() {
    const p = this.player;
    const env = this.env;
    if (p.stats.energy > 80 && env.night < 0.5) {
      this.ui.toast(tr(['Спать пока не хочется', 'You are not tired yet']));
      return;
    }
    if (this.sleeping) return;
    this.sleeping = true;
    this.ui.fade(true);
    this.audio.play('sleep');
    setTimeout(() => {
      const wake = 6.5;
      const hours = env.night > 0.5 ? (wake - env.time + 24) % 24 : 3;
      env.time += hours;
      if (env.time >= 24) {
        env.time -= 24;
        env.day++;
      }
      p.tickStats(hours * 0.45, this.difficulty);
      p.stats.energy = 100;
      this.ui.fade(false);
      this.sleeping = false;
    }, 1400);
  }

  onPlayerDeath(cause) {
    this.state = 'dead';
    this.input.unlock();
    this.audio.play('death');
    setTimeout(() => this.ui.showDeath(cause), 1400);
  }

  ensureAudio() {
    if (this.audio.initialized) return;
    this.audio.init().then(() => {
      this.applyVolumes();
      if (this.state === 'menu') this.audio.playMenuMusic();
    });
  }

  applyVolumes() {
    if (!this.audio.initialized) return;
    this.audio.setVolumes({
      master: settings.get('master'),
      sfx: settings.get('sfx'),
      engine: settings.get('engine'),
      ambient: settings.get('ambient'),
      radio: settings.get('radio'),
      music: settings.get('music'),
    });
  }

  save() {
    const data = {
      v: 2,
      seed: this.seed,
      options: this.options,
      stats: this.stats,
      env: { time: this.env.time, day: this.env.day, weather: this.env.weather },
      car: this.car.save(),
      player: this.player.save(),
      items: this.items.save(),
      world: this.world.save(),
      interaction: this.interaction.save(),
      tutorial: this.tutorial.save(),
      km: this.km(),
      date: Date.now(),
    };
    this.saves.write(data);
    this.ui.toast(t('hud.saved'));
  }

  // ------------------------------------------------------------------ world queries

  groundHeight(x, z) {
    return this.world ? this.world.gen.height(x + this.origin.x, z + this.origin.z) : null;
  }

  surfaceAt(collider, p) {
    const owner = this.physics.ownerOf(collider);
    if (owner?.surface) return { ...SURFACE_GRIP[SURFACE.CONCRETE], kind: owner.surface };
    const s = this.world.gen.surface(p.x + this.origin.x, p.z + this.origin.z);
    return { ...(SURFACE_GRIP[s] || SURFACE_GRIP[SURFACE.SAND]), kind: SURFACE_KIND[s] || 'sand' };
  }

  surfaceUnder(p) {
    const hit = this.physics.raycast({ x: p.x, y: p.y + 0.3, z: p.z }, { x: 0, y: -1, z: 0 }, 1, { filter: GROUP.STATIC | GROUP.CAR });
    if (hit?.owner?.surface) return hit.owner.surface === 'wood' ? 'wood' : hit.owner.surface === 'metal' ? 'metal' : 'concrete';
    if (hit?.owner?.kind === 'car') return 'metal';
    const s = this.world.gen.surface(p.x + this.origin.x, p.z + this.origin.z);
    return s === SURFACE.ASPHALT ? 'asphalt' : s === SURFACE.GRAVEL || s === SURFACE.ROCK ? 'concrete' : 'sand';
  }

  /** Air temperature (°C) from time of day and weather. */
  ambientTemp() {
    const env = this.env;
    if (!env) return 25;
    const day = Math.sin(((env.time - 9) / 24) * Math.PI * 2) * 0.5 + 0.5;
    return 12 + day * 24 - env.cur.rain * 6 - env.cur.cloud * 3;
  }

  km() {
    const p = this.car && this.player?.seat ? this.car.position : this.player?.position;
    return p ? Math.max(0, (p.z + this.origin.z) / 1000) : 0;
  }

  goalKm() {
    return GOAL_KM;
  }

  /** Floating origin: keeps the play area near (0, 0) so float precision stays high. */
  maybeShiftOrigin() {
    const p = this.player.seat ? this.car.position : this.player.position;
    if (Math.abs(p.x) < 1500 && Math.abs(p.z) < 1500) return;
    const dx = Math.round(p.x / 64) * 64;
    const dz = Math.round(p.z / 64) * 64;
    this.origin = { x: this.origin.x + dx, z: this.origin.z + dz };
    this.physics.shiftOrigin(dx, dz);
    this.world.shift(dx, dz);
    this.items.shift(dx, dz);
    this.creatures.shift(dx, dz);
    this.car.syncVisual();
  }

  // ------------------------------------------------------------------ loop

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05;
    try {
      this.frame(dt);
    } catch (e) {
      console.error(e);
      window.__gameError = String(e?.stack || e);
    }
    this.input.endFrame();
  }

  frame(dt) {
    const s = this.state;
    if (s === 'menu') this.menuFrame(dt);
    else if (s === 'play') this.playFrame(dt);
    else if (s === 'pause' || s === 'journal' || s === 'dead' || s === 'won') this.idleFrame(dt);
    this.ui.update(dt);
  }

  /** Menu: the car on the roadside at dusk under a slowly orbiting camera. */
  menuFrame(dt) {
    this.menuT += dt;
    this.car.idleInputs();
    this.stepPhysics(dt, false);
    this.car.update(dt);
    this.car.syncVisual();
    const c = this.car.position;
    const a = this.menuT * 0.045 + 2.2;
    const r = 7.4;
    this.camera.position.set(c.x + Math.cos(a) * r, c.y + 1.45 + Math.sin(this.menuT * 0.07) * 0.2, c.z + Math.sin(a) * r);
    this.camera.lookAt(c.x, c.y + 0.75, c.z);
    this.env.update(dt * 0.08, this.camera.position);
    this.world.update(dt, this.camera.position);
    this.syncViewLights();
    this.gfx.render();
    if (this.audio.initialized) this.audio.update(dt);
  }

  idleFrame(dt) {
    this.syncViewLights();
    this.gfx.render(this.viewScene);
  }

  playFrame(dt) {
    const input = this.input;
    const player = this.player;
    this.stats.playTime += dt;
    if (input.keyPressed('Escape')) return this.pause();
    if (input.pressed('journal')) return this.openJournal();
    if (!input.locked && !this.ui.modal) this.ui.showClickToPlay(true);

    player.look(input);
    this.stepPhysics(dt, true);
    this.car.update(dt);
    this.car.syncVisual();
    player.move(dt, input, { frozen: !!this.ui.modal });
    player.updateCamera(dt);
    if (this.debugCam) {
      // dev/screenshot hook: a free camera that ignores the player
      this.camera.position.copy(this.debugCam.pos);
      this.camera.lookAt(this.debugCam.target);
    }
    this.interaction.update(dt);
    this.hands.update(dt, { moving: player.moving, speed: player.speed, look: player.lastLook });

    const hours = (dt / this.env.secondsPerHour) * (this.env.timeScale ?? 1);
    this.env.update(dt, this.camera.position);
    this.applyInterior(dt);
    this.updateLampPool();
    player.tickStats(hours, this.difficulty);
    this.world.update(dt, this.camera.position);
    this.items.update(dt);
    this.creatures.update(dt);
    this.tutorial.update(dt);
    this.maybeShiftOrigin();
    this.updateAudio(dt);
    this.stats.maxKm = Math.max(this.stats.maxKm, this.km());
    if (this.km() >= GOAL_KM && !this.stats.won) {
      this.stats.won = true;
      this.state = 'won';
      this.input.unlock();
      this.ui.showWin();
    }
    this.syncViewLights();
    this.gfx.render(this.viewScene);
  }

  updateLampPool() {
    const lamps = this.world.lampsNear(this.camera.position, this.lampPool.length);
    this.lampPool.forEach((l, i) => {
      const src = lamps[i];
      if (!src) {
        l.intensity = 0;
        return;
      }
      l.position.copy(src.pos);
      l.color.set(src.color);
      l.distance = src.distance;
      l.intensity = src.intensity;
    });
  }

  /** Compiles every material in view during loading instead of stalling the first frames. */
  async precompile() {
    const r = this.gfx.renderer;
    try {
      await r.compileAsync(this.scene, this.camera);
      await r.compileAsync(this.viewScene, this.camera);
    } catch (e) {
      console.warn('precompile', e);
    }
  }

  /** Inside buildings the sky light is mostly blocked: dim ambient and reflections smoothly. */
  applyInterior(dt) {
    this.interiorT = this.interiorT ?? 0;
    this.interiorCheck = (this.interiorCheck ?? 0) - dt;
    if (this.interiorCheck <= 0) {
      this.interiorCheck = 0.25;
      this.inside = this.world.insideBuilding(this.camera.position);
    }
    this.interiorT += ((this.inside ? 1 : 0) - this.interiorT) * Math.min(1, dt * 3);
    const k = this.interiorT;
    this.env.hemi.intensity *= 1 - 0.55 * k;
    this.scene.environmentIntensity = (this.env.baseEnvIntensity ?? 1) * (1 - 0.45 * k);
  }

  stepPhysics(dt, playing) {
    this.acc += dt;
    let n = 0;
    const driving = playing && this.player.seat?.which === 'driver';
    while (this.acc >= STEP && n < 6) {
      if (driving && this.player.seat.car === this.car) {
        const i = this.input;
        this.car.drive({
          forward: i.down('forward'),
          back: i.down('back'),
          handbrake: i.down('jump'),
          steer: (i.down('right') ? 1 : 0) - (i.down('left') ? 1 : 0),
        });
      } else this.car.idleInputs();
      this.car.physicsStep(STEP);
      this.world?.wrecks.physicsStep(STEP);
      this.interaction?.physicsStep(STEP);
      this.creatures?.physicsStep?.(STEP);
      this.physics.step(STEP);
      this.acc -= STEP;
      n++;
    }
    if (n === 6) this.acc = 0;
  }

  /** The overlay scene has its own lights; mirror the world's so hands match their surroundings. */
  syncViewLights() {
    const env = this.env;
    this.viewLight.color.copy(env.sun.color);
    this.viewLight.intensity = env.sun.intensity * 0.9;
    this.viewLight.position.copy(env.sun.position).sub(env.sun.target.position).normalize();
    this.viewHemi.color.copy(env.hemi.color);
    this.viewHemi.groundColor.copy(env.hemi.groundColor);
    this.viewHemi.intensity = env.hemi.intensity;
    this.viewScene.environment = this.scene.environment;
    this.viewScene.environmentIntensity = this.scene.environmentIntensity ?? 1;
    const cam = this.viewScene.children[0];
    cam.position.copy(this.camera.position);
    cam.quaternion.copy(this.camera.quaternion);
    this.viewRoot.position.copy(this.camera.position);
    this.viewRoot.quaternion.copy(this.camera.quaternion);
    this.viewRoot.updateMatrixWorld(true);
    const inCar = this.player?.seat;
    const flash = this.interaction?.flashlightOn;
    this.viewFlash.intensity = flash ? 1.2 : inCar && this.car.domeLit() ? 0.5 : 0;
    this.viewFlash.position.copy(this.camera.position);
  }

  updateAudio(dt) {
    const a = this.audio;
    if (!a.initialized) return;
    const cam = this.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    a.setListener(cam.position, fwd, up);
    const car = this.car;
    const inside = this.player.seat?.car === car;
    a.insideCar = inside;
    if (!car.engineSound) car.engineSound = a.createEngine();
    const v = car.vehicle;
    car.engineSound?.set({
      rpm: car.s.running ? v.rpm : car.s.cranking ? 260 : 0,
      throttle: v.input.throttle,
      load: v.gear !== 1 ? v.input.throttle : v.input.throttle * 0.25,
      running: car.s.running,
      cranking: car.s.cranking,
      crankStrength: clamp01(car.power * 1.25),
      misfire: car.misfire || 0,
      damage: 1 - car.cond('engine'),
      pos: car.worldPoint(new THREE.Vector3(0, 0.6, -1.5)),
      inside,
    });
    a.setCar({
      speed: v.speed,
      skid: v.skid,
      sand: v.onSand,
      inside,
      pos: car.position,
      horn: car.s.horn,
      bumps: 0,
    });
    a.setAmbient(
      {
        wind: this.env.windSpeed ?? this.env.wind.length(),
        carSpeed: inside ? Math.abs(v.speed) : 0,
        insideCar: inside,
        insideBuilding: this.world.insideBuilding(this.camera.position),
        night: this.env.night,
        rain: this.env.cur.rain,
        sand: this.env.cur.sand,
      },
      dt,
    );
    if (a.radio) {
      a.radio.on = this.state === 'play' && car.s.radioOn && car.s.ignition && car.power > 0.05;
      a.radio.freq = car.s.radioFreq;
      a.radio.setPos(car.worldPoint(new THREE.Vector3(0, 0.95, -0.75)), inside);
    }
    a.update(dt);
  }
}

function frame() {
  return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
}
