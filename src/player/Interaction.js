import * as THREE from 'three';
import { GROUP } from '../physics/physics.js';
import { Highlighter } from '../render/highlight.js';
import { Hands } from './Hands.js';
import { ITEMS, LIQUID_NAMES } from '../items/defs.js';
import { PARTS, TANK, kindOf } from '../car/partsCatalog.js';
import { SEATS, SERVICE } from '../car/CarEntity.js';
import { t, tr } from '../core/i18n.js';
import { keyLabel } from '../core/input.js';
import { clamp, clamp01 } from '../core/math.js';

/**
 * Everything the player does with their hands: hover targeting with highlight, taking items
 * into the hand, physical dragging (hands follow the grab point), pockets, using items, doors,
 * car closures, seats and controls, unbolting and installing car parts, pouring fluids, pumps.
 */
const REACH = 2.5;
const SEATED_REACH = 1.15;
const ray = new THREE.Ray();
const tmpM = new THREE.Matrix4();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

export class Interaction {
  constructor(game) {
    this.game = game;
    this.hl = new Highlighter();
    this.held = null;
    this.drag = null;
    this.pockets = [null, null, null, null];
    this.target = null;
    this.progress = null;
    this.use = null;
    this.flashlightOn = false;
    this.flash = new THREE.SpotLight(0xfff0d8, 0, 45, 0.42, 0.5, 2);
    this.flash.castShadow = false;
    game.camera.add(this.flash);
    game.camera.add(this.flash.target);
    this.flash.position.set(0.15, -0.1, 0);
    this.flash.target.position.set(0.05, -0.2, -5);
    this.swingT = 0;
    this.recoil = 0;
    this.pourT = 0;
  }

  dispose() {
    this.hl.clear();
    this.hl.hideGhost();
    if (this.held) this.dropHeld(false);
    this.game.camera.remove(this.flash, this.flash.target);
  }

  carryPenalty() {
    if (!this.drag) return this.held?.mass > 8 ? 0.8 : 1;
    return clamp(1 - this.drag.item.mass / 90, 0.35, 1);
  }

  // ------------------------------------------------------------------ targeting

  cars() {
    const g = this.game;
    const list = [g.car, ...g.world.wrecks.all()];
    return list.filter((c) => c.root.position.distanceTo(g.camera.position) < 9);
  }

  findTarget() {
    const g = this.game;
    const cam = g.camera;
    const origin = cam.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    const seated = g.player.seat;
    const reach = seated ? SEATED_REACH : REACH;
    ray.set(origin, dir);
    let best = null;
    const consider = (tgt) => {
      if (tgt && tgt.dist <= reach && (!best || tgt.dist < best.dist)) best = tgt;
    };
    // physics: items, static world, doors, creatures (car bodies are handled by part boxes)
    const exclude = this.drag?.item.collider || (seated ? null : g.player.collider);
    const hit = g.physics.raycast(origin, dir, reach, { filter: GROUP.STATIC | GROUP.ITEM | GROUP.CREATURE, exclude });
    let wallDist = reach;
    if (hit) {
      const o = hit.owner;
      wallDist = hit.toi;
      const point = new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z);
      if (o?.kind === 'item' && o.item !== this.drag?.item) consider({ kind: 'item', item: o.item, dist: hit.toi, point });
      else if (o?.kind === 'door') consider({ kind: 'door', door: o.door, dist: hit.toi, point });
      else if (o?.kind === 'creature') consider({ kind: 'creature', creature: o.creature, dist: hit.toi, point });
      else consider(this.poiSpecial(point, hit.toi));
    }
    // car parts, slots, seats and service points
    for (const car of this.cars()) {
      for (const tgt of this.carTargets(car, seated)) consider(tgt.dist < wallDist + 0.05 ? tgt : null);
    }
    return best;
  }

  /** Ray against a local box of an object; returns the entry distance or null. */
  boxHit(object, box, matrix = null) {
    tmpM.copy(matrix || object.matrixWorld).invert();
    const r = ray.clone().applyMatrix4(tmpM);
    const p = r.intersectBox(box, tmpV);
    if (!p) return null;
    const w = p.clone().applyMatrix4(matrix || object.matrixWorld);
    return { dist: w.distanceTo(ray.origin), point: w };
  }

  carTargets(car, seated) {
    const out = [];
    const inThis = seated?.car === car;
    if (inThis) {
      for (const c of this.cabinControls(car)) out.push(c);
      return out;
    }
    car.root.updateMatrixWorld(true);
    // free slot the held/dragged part fits
    const carried = this.drag?.item.kind === 'part' ? this.drag.item : this.held?.kind === 'part' ? this.held : null;
    if (carried) {
      for (const slot of car.freeSlotFor(carried.partId)) {
        const parent = slot.pivot || car.root;
        parent.updateMatrixWorld(true);
        const m = new THREE.Matrix4().compose(slot.home.position, slot.home.quaternion, slot.home.scale).premultiply(parent.matrixWorld);
        const h = this.boxHit(null, slot.box, m);
        const near = carried.root.position.distanceTo(slot.box.getCenter(new THREE.Vector3()).applyMatrix4(m)) < 1.1;
        if (h || near) out.push({ kind: 'slot', car, slot, item: carried, dist: h ? h.dist : 0.5, point: h?.point, matrix: m });
      }
    }
    for (const p of Object.values(car.parts)) {
      if (!p.installed || !car.accessible(p.id)) continue;
      const h = this.boxHit(p.object, p.box);
      if (h) out.push({ kind: 'part', car, partId: p.id, dist: h.dist, point: h.point });
    }
    // service points: fuel filler (flap open), oil and coolant (hood open)
    const service = [
      ['fuel', SERVICE.fuel, car.isOpen('fuelDoor')],
      ['oil', SERVICE.oil, car.isOpen('hood') && car.installed('engine')],
      ['coolant', SERVICE.coolant, car.isOpen('hood')],
    ];
    for (const [what, local, open] of service) {
      const c = car.worldPoint(local);
      const s = new THREE.Sphere(c, what === 'fuel' ? 0.14 : 0.1);
      const p = ray.intersectSphere(s, tmpV2);
      if (p) out.push({ kind: what === 'fuel' && !open ? 'fuelDoor' : 'service', car, what, open, dist: p.distanceTo(ray.origin) - 0.05, point: p.clone() });
    }
    // fuel flap itself
    const flap = car.model.pivots.fuelDoor;
    if (flap) {
      const c = car.worldPoint(SERVICE.fuel);
      const p = ray.intersectSphere(new THREE.Sphere(c, 0.12), tmpV2);
      if (p && !car.isOpen('fuelDoor')) out.push({ kind: 'fuelDoor', car, dist: p.distanceTo(ray.origin) - 0.06, point: p.clone() });
    }
    // flipped: push it back onto its wheels
    if (car.vehicle.isFlipped() && !car.wreck) {
      const c = car.root.position;
      const p = ray.intersectSphere(new THREE.Sphere(c.clone().add(new THREE.Vector3(0, 0.6, 0)), 2.1), tmpV2);
      if (p) out.push({ kind: 'flip', car, dist: p.distanceTo(ray.origin), point: p.clone() });
    }
    return out;
  }

  /** In-cabin controls for the seated player. */
  cabinControls(car) {
    const out = [];
    const c = car.controls;
    const add = (what, obj, r = 0.06, offset = null) => {
      if (!obj) return;
      const pos = obj.getWorldPosition(new THREE.Vector3());
      if (offset) pos.add(offset);
      const p = ray.intersectSphere(new THREE.Sphere(pos, r), tmpV2);
      if (p) out.push({ kind: 'control', car, what, object: obj, dist: p.distanceTo(ray.origin), point: p.clone() });
    };
    add('key', c.key, 0.05);
    add('radio', c.radio, 0.09);
    add('glovebox', c.glovebox, 0.16);
    const dome = car.root.getObjectByName?.('domeLight');
    add('dome', dome, 0.08);
    return out;
  }

  poiSpecial(point, dist) {
    for (const poi of this.game.world.pois.all()) {
      for (const pump of poi.pumps) if (pump.pos.distanceTo(point) < 0.9) return { kind: 'pump', pump, poi, dist, point };
      for (const tap of poi.taps) if (tap.distanceTo(point) < 0.6) return { kind: 'tap', dist, point };
      for (const bed of poi.sleep) if (bed.distanceTo(point) < 1.3) return { kind: 'bed', dist, point, bed };
    }
    return null;
  }

  // ------------------------------------------------------------------ frame update

  update(dt) {
    const g = this.game;
    const input = g.input;
    this.hl.update(dt);
    const seated = g.player.seat;
    if (g.ui.modal) {
      this.hl.set(null);
      g.ui.setPrompt([]);
      this.placeHands(dt, null);
      return;
    }
    if (seated) this.seatedControls(dt);
    this.target = this.findTarget();
    const tgt = this.target;
    const actions = this.actionsFor(tgt);

    // highlight / ghost
    if (tgt?.kind === 'slot') {
      this.hl.set(null);
      this.hl.showGhost(tgt.item.root, tgt.slot.pivot || tgt.car.root, tgt.slot.home);
    } else {
      this.hl.hideGhost();
      this.hl.set(this.highlightObject(tgt), tgt?.kind === 'part' && this.held?.def.tool === 'wrench' ? 0xff9a5a : 0xffd08a);
    }

    // input → actions
    if (!this.progress) {
      for (const a of actions) {
        if (a.key === 'E' && input.pressed('interact')) a.run();
        else if (a.key === 'LMB' && input.mousePressed(0)) a.run();
        else if (a.key === 'RMB' && input.mousePressed(2)) a.run();
        else if (a.key === 'holdLMB' && input.mouse(0) && !this.drag) this.beginProgress(a, tgt);
        else if (a.key === 'dragLMB' && input.mousePressed(0) && !this.held) a.run();
      }
    }
    if (this.progress) this.tickProgress(dt, input);
    this.updateHeld(dt, input);
    this.updateDragInput(dt, input);
    this.pocketKeys(input);
    g.ui.setPrompt(this.progress ? [] : actions.map((a) => ({ key: a.key, label: a.label })), this.progress, this.describe(tgt));
    this.placeHands(dt, tgt);
  }

  highlightObject(tgt) {
    if (!tgt) return null;
    if (tgt.kind === 'item') return tgt.item.root;
    if (tgt.kind === 'part') return tgt.car.parts[tgt.partId].object;
    if (tgt.kind === 'door') return tgt.door.panel;
    if (tgt.kind === 'fuelDoor') return tgt.car.model.pivots.fuelDoor;
    if (tgt.kind === 'control') return tgt.object;
    return null;
  }

  describe(tgt) {
    if (!tgt) return null;
    if (tgt.kind === 'item') return itemTitle(tgt.item);
    if (tgt.kind === 'part') {
      const p = tgt.car.parts[tgt.partId];
      return `${tr(PARTS[tgt.partId].name)} · ${Math.round(p.cond * 100)}%`;
    }
    if (tgt.kind === 'slot') return tr(PARTS[tgt.item.partId].name);
    if (tgt.kind === 'service') {
      const s = tgt.car.s;
      if (tgt.what === 'fuel') return `${tr(['Бак', 'Fuel tank'])} · ${s.fuel.toFixed(1)} / ${TANK.fuel} ${tr(['л', 'L'])}`;
      if (tgt.what === 'oil') return `${tr(['Масло', 'Oil'])} · ${s.oil.toFixed(1)} / ${TANK.oil} ${tr(['л', 'L'])}`;
      return `${tr(['Антифриз', 'Coolant'])} · ${s.coolant.toFixed(1)} / ${TANK.coolant} ${tr(['л', 'L'])}`;
    }
    if (tgt.kind === 'pump') return `${tr(['Колонка', 'Pump'])} · ${tr(LIQUID_NAMES[tgt.pump.fuel])} · ${tgt.pump.stock > 0 ? `${tgt.pump.stock.toFixed(0)} ${tr(['л', 'L'])}` : tr(['пусто', 'empty'])} · ${tr(['цена', 'price'])} 2`;
    return null;
  }

  /** Available actions for the current target and hands. */
  actionsFor(tgt) {
    const g = this.game;
    const acts = [];
    const held = this.held;
    const seated = g.player.seat;
    const A = (key, label, run) => acts.push({ key, label, run });
    if (seated) A('E', t('act.exit'), () => this.exitCar());
    if (this.drag) {
      A('RMB', t('act.throw'), () => this.releaseDrag(true));
      if (tgt?.kind === 'slot') A('E', t('act.install'), () => this.install(tgt));
      return acts;
    }
    if (tgt) {
      switch (tgt.kind) {
        case 'item': {
          const it = tgt.item;
          // parts larger than a lamp are dragged, never held in front of the face
          const canHold = it.kind === 'item' ? !it.def.big || it.mass < 6 : it.mass <= 3;
          if (!held && canHold) A('E', t('act.take'), () => this.takeInHand(it));
          if (!held) A('dragLMB', t('act.drag'), () => this.beginDrag(it, tgt.point));
          if (held?.def?.liquid && it.def?.liquid) A('holdLMB', t('act.pour'), () => ({ need: 99, tick: (dt) => this.pour(held, it.state, dt, it.def.liquid.cap) }));
          if (it.def?.tool === 'note' && !held) A('RMB', t('act.read'), () => g.ui.showNote(it.state.note));
          break;
        }
        case 'door':
          A('E', tgt.door.target > 0.5 ? t('act.close') : t('act.open'), () => tgt.door.toggle());
          break;
        case 'fuelDoor':
          A('E', t('act.open'), () => tgt.car.toggle('fuelDoor'));
          break;
        case 'part':
          this.partActions(tgt, A);
          break;
        case 'slot':
          A('E', t('act.install'), () => this.install(tgt));
          break;
        case 'service': {
          if (tgt.what === 'fuel') A('E', t('act.close'), () => tgt.car.toggle('fuelDoor'));
          if (held?.def?.liquid && held.state.amount > 0) {
            const ok = (tgt.what === 'fuel' && ['petrol'].includes(held.state.kind)) || (tgt.what === 'oil' && held.state.kind === 'oil') || (tgt.what === 'coolant' && ['coolant', 'water'].includes(held.state.kind));
            if (ok) A('holdLMB', t('act.pour'), () => ({ need: 99, tick: (dt) => this.pourIntoCar(held, tgt.car, tgt.what, dt) }));
          }
          break;
        }
        case 'pump':
          if (held?.def?.liquid) A('holdLMB', t('act.fill'), () => ({ need: 99, tick: (dt) => this.pumpInto(tgt.pump, held.state, held.def.liquid.cap, dt) }));
          else if (tgt.car || this.game.car.worldPoint(SERVICE.fuel).distanceTo(tgt.pump.pos) < 4.5) A('holdLMB', t('act.fill'), () => ({ need: 99, tick: (dt) => this.pumpIntoCar(tgt.pump, dt) }));
          break;
        case 'tap':
          if (held?.def?.liquid) A('holdLMB', t('act.fill'), () => ({ need: 99, tick: (dt) => this.tapInto(held.state, held.def.liquid.cap, dt) }));
          break;
        case 'bed':
          A('E', t('act.sleep'), () => g.sleep());
          break;
        case 'flip':
          A('holdLMB', t('act.flip'), () => ({ need: 2.2, done: () => tgt.car.vehicle.flipUpright() }));
          break;
        case 'control':
          this.controlActions(tgt, A);
          break;
        case 'creature':
          break;
      }
    }
    if (held && !acts.some((a) => a.key === 'holdLMB' || a.key === 'LMB')) {
      const u = this.useAction(held, tgt);
      if (u) acts.push(u);
    }
    if (held && !seated) {
      A('RMB', t('act.throw'), () => this.dropHeld(true));
      acts.push({ key: keyLabel(g.input.code('drop')), label: t('act.drop'), run: () => this.dropHeld(false), hidden: true });
      if (held.kind === 'item' && held.def.small) acts.push({ key: keyLabel(g.input.code('pocket')), label: t('act.pocket'), run: () => this.pocketHeld(), hidden: true });
    }
    return acts;
  }

  partActions(tgt, A) {
    const { car, partId } = tgt;
    const def = PARTS[partId];
    const closure = car.closures[partId];
    const open = closure && closure.open > 0.5;
    if (closure) A('E', open ? t('act.close') : t('act.open'), () => car.toggle(partId));
    if (partId === 'seat_FL' && !car.wreck) A('E', t('act.drive'), () => this.enterCar(car, 'driver'));
    if (partId === 'seat_FR' && !car.wreck) A('E', t('act.sit'), () => this.enterCar(car, 'passenger'));
    const needsOpen = closure && !open;
    if (needsOpen) return;
    if (def.bolted) {
      if (this.held?.def?.tool === 'wrench') A('holdLMB', t('act.unbolt'), () => ({ need: 1.4 + def.mass * 0.03, sound: 'ratchet', done: () => this.removePart(car, partId) }));
      else A('info', t('hud.needWrench'), () => {});
    } else if (!this.held) A('holdLMB', t('act.remove'), () => ({ need: 0.8, sound: 'latch', done: () => this.removePart(car, partId) }));
  }

  controlActions(tgt, A) {
    const car = tgt.car;
    const s = car.s;
    switch (tgt.what) {
      case 'key':
        A('LMB', s.ignition ? t('act.switch') : t('key.ignition'), () => car.toggleIgnition());
        break;
      case 'radio':
        A('LMB', s.radioOn ? tr(['Выключить радио', 'Radio off']) : tr(['Включить радио', 'Radio on']), () => {
          s.radioOn = !s.radioOn;
          this.game.audio?.play('click');
        });
        break;
      case 'glovebox': {
        const gb = car.controls.glovebox;
        A('LMB', gb?.userData.open ? t('act.close') : t('act.open'), () => {
          if (!gb) return;
          gb.userData.open = !gb.userData.open;
          gb.rotation.x = gb.userData.open ? 0.9 : 0;
          this.game.audio?.play('latch');
        });
        break;
      }
      case 'dome':
        A('LMB', tr(['Плафон', 'Dome light']) + ': ' + tr({ door: ['по двери', 'door'], on: ['вкл', 'on'], off: ['выкл', 'off'] }[s.domeMode]), () => {
          s.domeMode = s.domeMode === 'door' ? 'on' : s.domeMode === 'on' ? 'off' : 'door';
          this.game.audio?.play('switch');
        });
        break;
    }
  }

  useAction(held, tgt) {
    const def = held.def;
    if (held.kind === 'part') return null;
    if (def.food) return { key: 'LMB', label: def.food.sound === 'drink' ? t('act.drink') : t('act.eat'), run: () => this.consume(held) };
    if (def.liquid?.drinkable && held.state.kind === 'water' && held.state.amount > 0.05) return { key: 'LMB', label: t('act.drink'), run: () => this.drinkFrom(held) };
    if (def.tool === 'light') return { key: 'LMB', label: t('act.switch'), run: () => this.toggleFlashlight() };
    if (def.tool === 'melee' || def.tool === 'wrench') return { key: 'LMB', label: t('act.swing'), run: () => this.swing(held) };
    if (def.tool === 'gun') return { key: 'LMB', label: held.state.loaded > 0 ? t('act.fire') : t('act.reload'), run: () => this.fireOrReload(held) };
    if (def.tool === 'note') return { key: 'LMB', label: t('act.read'), run: () => this.game.ui.showNote(held.state.note) };
    if (def.tool === 'repair' && tgt?.kind === 'part') return { key: 'holdLMB', label: tr(['Починить', 'Repair']), run: () => ({ need: 3, sound: 'bolt_tighten', done: () => this.repair(held, tgt) }) };
    if (def.money) return { key: 'LMB', label: tr(['Пересчитать', 'Count']), run: () => this.pocketMoney(held) };
    return null;
  }

  // ------------------------------------------------------------------ progress (hold LMB)

  beginProgress(action, tgt) {
    const spec = action.run();
    if (!spec) return;
    this.progress = { label: action.label, t: 0, need: spec.need, tick: spec.tick, done: spec.done, sound: spec.sound, soundT: 0, target: tgt };
  }

  tickProgress(dt, input) {
    const p = this.progress;
    if (!input.mouse(0) || (this.target?.kind !== p.target?.kind) || (p.target?.partId && this.target?.partId !== p.target.partId)) {
      this.progress = null;
      this.game.audio?.stopPour?.();
      return;
    }
    p.t += dt;
    p.soundT -= dt;
    if (p.sound && p.soundT <= 0) {
      this.game.audio?.play(p.sound, { volume: 0.7 });
      p.soundT = p.sound === 'ratchet' ? 0.32 : 0.6;
    }
    if (p.tick) {
      const cont = p.tick(dt);
      if (cont === false) this.progress = null;
    }
    if (p.t >= p.need) {
      this.progress = null;
      p.done?.();
    }
  }

  // ------------------------------------------------------------------ items in the hand

  takeInHand(item) {
    if (this.held) return;
    const g = this.game;
    g.items.take(item);
    item.held = true;
    this.held = item;
    const hand = g.hands.right;
    hand.grip.add(item.root);
    this.fitToGrip(item);
    g.audio?.play('pickup', { volume: 0.6 });
    g.tutorial?.event('take', item);
  }

  /** Places the item so its grip point sits in the fist. */
  fitToGrip(item) {
    const r = item.root;
    if (item.kind === 'part') {
      // carried in front with both hands: centre the part's box on the grip
      const c = item.box.getCenter(new THREE.Vector3());
      r.quaternion.setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
      r.position.copy(c).applyQuaternion(r.quaternion).negate().add(new THREE.Vector3(-0.12, 0.02, -0.12));
      return;
    }
    const gr = r.userData.grip;
    const q = new THREE.Quaternion().setFromEuler(gr?.rot || new THREE.Euler());
    r.quaternion.copy(q).invert();
    r.position.copy(gr?.pos || new THREE.Vector3()).applyQuaternion(r.quaternion).negate();
  }

  dropHeld(throwIt) {
    const it = this.held;
    if (!it) return;
    const g = this.game;
    const cam = g.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const pos = it.root.getWorldPosition(new THREE.Vector3());
    const q = it.root.getWorldQuaternion(new THREE.Quaternion());
    // keep the drop point in front of walls
    const hit = g.physics.raycast(cam.position, fwd, 0.7, { filter: GROUP.STATIC | GROUP.CAR, exclude: g.player.collider });
    if (hit) pos.copy(cam.position).addScaledVector(fwd, Math.max(0.15, hit.toi - 0.2)).add(new THREE.Vector3(0, -0.15, 0));
    it.root.parent?.remove(it.root);
    it.held = false;
    this.held = null;
    const vel = throwIt ? fwd.clone().multiplyScalar(clamp(9 / Math.sqrt(it.mass + 0.5), 2.5, 9)).add(new THREE.Vector3(0, 1.2, 0)) : fwd.clone().multiplyScalar(0.6);
    g.items.place(it, pos, q, vel);
    if (it.def?.tool === 'light' && this.flashlightOn) this.toggleFlashlight();
    if (throwIt) g.audio?.play('throw');
  }

  pocketHeld() {
    const it = this.held;
    if (!it || !it.def.small) return;
    const i = this.pockets.indexOf(null);
    if (i < 0) return this.game.ui.toast(t('hud.pocketFull'));
    if (it.def.tool === 'light' && this.flashlightOn) this.toggleFlashlight();
    it.root.parent?.remove(it.root);
    this.pockets[i] = it;
    this.held = null;
    this.game.audio?.play('zip', { volume: 0.5 });
  }

  pocketKeys(input) {
    if (input.pressed('drop') && this.held && !this.game.player.seat) this.dropHeld(false);
    if (input.pressed('pocket') && this.held) this.pocketHeld();
    for (let i = 0; i < 4; i++) {
      if (!input.keyPressed(`Digit${i + 1}`)) continue;
      const it = this.pockets[i];
      if (!it) continue;
      if (this.held) {
        if (!this.held.def.small) continue;
        const h = this.held;
        h.root.parent?.remove(h.root);
        this.pockets[i] = h;
      } else this.pockets[i] = null;
      this.held = it;
      this.game.hands.right.grip.add(it.root);
      this.fitToGrip(it);
      this.game.audio?.play('zip', { volume: 0.4 });
    }
  }

  /** Per-frame state of the item in the hand (flashlight beam, compass needle). */
  updateHeld(dt, input) {
    const it = this.held;
    const light = it?.def?.tool === 'light';
    if (!light && this.flashlightOn) this.flashlightOn = false;
    this.flash.intensity = this.flashlightOn ? 70 : 0;
    if (it?.def?.tool === 'compass') {
      const face = it.root.getObjectByName('compassFace');
      if (face) face.rotation.y = -heading(this.game.camera);
    }
    void dt;
    void input;
  }

  hasWrench() {
    return this.held?.def?.tool === 'wrench' || this.pockets.some((p) => p?.def.tool === 'wrench');
  }

  pocketMoney(held) {
    const g = this.game;
    g.stats.money += held.state.amount || 5;
    g.audio?.play('coins');
    g.ui.toast(`+${held.state.amount || 5} ₽`);
    held.root.parent?.remove(held.root);
    this.held = null;
  }

  // ------------------------------------------------------------------ physical dragging

  beginDrag(item, point) {
    if (!item.body) return;
    const body = item.body;
    const t0 = body.translation();
    const r = body.rotation();
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    const local = point.clone().sub(new THREE.Vector3(t0.x, t0.y, t0.z)).applyQuaternion(q.clone().invert());
    const dist = clamp(point.distanceTo(this.game.camera.position), 0.9, 2.2);
    this.drag = { item, local, dist, rotating: false };
    body.setAngularDamping(3.5);
    body.setLinearDamping(1.5);
    body.wakeUp();
    this.game.audio?.play('pickup', { volume: 0.4, pitch: 0.8 });
    this.game.tutorial?.event('drag', item);
  }

  releaseDrag(throwIt = false) {
    const d = this.drag;
    if (!d) return;
    const body = d.item.body;
    if (body) {
      body.setAngularDamping(0.35);
      body.setLinearDamping(0.12);
      if (throwIt) {
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.game.camera.quaternion);
        const imp = clamp(55 / Math.sqrt(d.item.mass), 1, 7) * d.item.mass;
        body.applyImpulse({ x: fwd.x * imp, y: fwd.y * imp + imp * 0.2, z: fwd.z * imp }, true);
        this.game.audio?.play('throw');
      }
    }
    this.drag = null;
  }

  updateDragInput(dt, input) {
    const d = this.drag;
    if (!d) return;
    if (!d.item.body || !input.mouse(0)) {
      if (!input.mouse(0)) this.releaseDrag(false);
      else this.drag = null;
      return;
    }
    const w = input.takeWheel();
    if (w) d.dist = clamp(d.dist - w * 0.15, 0.7, 2.4);
    d.rotating = input.down('rotate');
    if (d.rotating) {
      const look = this.game.player.lastLook || { x: 0, y: 0 };
      d.spin = { x: look.y * 0.02, y: look.x * 0.02 };
    } else d.spin = null;
  }

  /** Spring towards the hold point at the grab offset (called each physics step). */
  physicsStep(dt) {
    const d = this.drag;
    if (!d || !d.item.body) return;
    const body = d.item.body;
    const cam = this.game.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const target = cam.position.clone().addScaledVector(fwd, d.dist);
    const t0 = body.translation();
    const r = body.rotation();
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    const grab = d.local.clone().applyQuaternion(q).add(new THREE.Vector3(t0.x, t0.y, t0.z));
    const err = target.sub(grab);
    if (err.length() > 2.6) return this.releaseDrag(false);
    const m = d.item.mass;
    const pv = body.velocityAtPoint(grab);
    // stiff for light things, weak for heavy ones: a person can lift ~35 kg, drag more
    const strength = 900;
    const want = err.multiplyScalar(12).sub(new THREE.Vector3(pv.x, pv.y, pv.z).multiplyScalar(1.6));
    const F = want.multiplyScalar(Math.min(m, 40));
    F.y += Math.min(m, 36) * 9.81;
    if (F.length() > strength) F.setLength(strength);
    body.applyImpulseAtPoint({ x: F.x * dt, y: F.y * dt, z: F.z * dt }, grab, true);
    if (d.spin) {
      const up = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      const I = Math.min(m, 30) * 0.08;
      body.applyTorqueImpulse({ x: (right.x * d.spin.x + up.x * d.spin.y) * I, y: (right.y * d.spin.x + up.y * d.spin.y) * I, z: (right.z * d.spin.x + up.z * d.spin.y) * I }, true);
    }
  }

  // ------------------------------------------------------------------ car parts

  removePart(car, partId) {
    const g = this.game;
    if (!car.installed(partId)) return;
    const cond = car.parts[partId].cond;
    const obj = car.detach(partId);
    if (!obj) return;
    // nudge it out so it does not start inside the car's colliders
    const out = obj.position.clone().sub(car.root.position).setY(0).normalize().multiplyScalar(0.05);
    obj.position.add(out).add(new THREE.Vector3(0, 0.02, 0));
    const item = g.items.spawnPart(partId, obj, { cond, source: car });
    g.audio?.play(PARTS[partId].bolted ? 'bolt_loosen' : 'latch');
    g.tutorial?.event('remove', partId);
    if (!PARTS[partId].heavy && item.mass < 25) this.beginDrag(item, this.target?.point || obj.getWorldPosition(new THREE.Vector3()));
  }

  install(tgt) {
    const g = this.game;
    const item = tgt.item;
    const def = PARTS[item.partId];
    if (def.bolted && !this.hasWrench()) {
      g.ui.toast(t('hud.needWrench'));
      return;
    }
    if (this.drag?.item === item) this.drag = null;
    if (this.held === item) {
      item.root.parent?.remove(item.root);
      this.held = null;
    }
    g.items.remove(item);
    item.root.userData.item = null;
    tgt.car.attach(tgt.slot.id, item.root, item.state.cond ?? 1);
    this.hl.hideGhost();
    g.audio?.play(def.bolted ? 'bolt_tighten' : 'latch');
    g.tutorial?.event('install', tgt.slot.id);
  }

  repair(held, tgt) {
    const p = tgt.car.parts[tgt.partId];
    p.cond = Math.min(1, p.cond + (held.id === 'tape' ? 0.15 : 0.35));
    held.state.uses = (held.state.uses ?? 1) - 1;
    if (held.state.uses <= 0) {
      held.root.parent?.remove(held.root);
      this.held = null;
    }
    tgt.car.refreshMass();
  }

  // ------------------------------------------------------------------ liquids

  pour(from, toState, dt, cap) {
    if (!from.state.amount) return false;
    if (toState.amount > 0.01 && toState.kind !== from.state.kind) return false;
    const q = Math.min(from.def.liquid.rate * dt, from.state.amount, cap - (toState.amount || 0));
    if (q <= 0) return false;
    from.state.amount -= q;
    toState.kind = from.state.kind;
    toState.amount = (toState.amount || 0) + q;
    this.pourSound(dt);
    return true;
  }

  pourIntoCar(held, car, what, dt) {
    const s = car.s;
    const cap = what === 'fuel' ? TANK.fuel : what === 'oil' ? TANK.oil : TANK.coolant;
    const key = what === 'fuel' ? 'fuel' : what;
    const q = Math.min(held.def.liquid.rate * dt, held.state.amount, cap - s[key]);
    if (q <= 0) return false;
    held.state.amount -= q;
    s[key] += q;
    if (what === 'fuel') car.refreshMass();
    this.pourSound(dt);
    this.game.tutorial?.event('pour', what);
    return true;
  }

  pumpInto(pump, state, cap, dt) {
    const g = this.game;
    if (pump.stock <= 0) return false;
    if (state.amount > 0.01 && state.kind !== pump.fuel) return false;
    const q = Math.min(1.2 * dt, pump.stock, cap - state.amount);
    const cost = q * 2;
    if (q <= 0 || g.stats.money < cost) return false;
    g.stats.money -= cost;
    pump.stock -= q;
    state.kind = pump.fuel;
    state.amount += q;
    this.pourSound(dt, true);
    return true;
  }

  pumpIntoCar(pump, dt) {
    const g = this.game;
    const car = g.car;
    if (pump.stock <= 0 || pump.fuel !== 'petrol' || !car.isOpen('fuelDoor')) return false;
    const q = Math.min(1.4 * dt, pump.stock, TANK.fuel - car.s.fuel);
    const cost = q * 2;
    if (q <= 0 || g.stats.money < cost) return false;
    g.stats.money -= cost;
    pump.stock -= q;
    car.s.fuel += q;
    this.pourSound(dt, true);
    return true;
  }

  tapInto(state, cap, dt) {
    if (state.amount > 0.01 && state.kind !== 'water') return false;
    const q = Math.min(0.8 * dt, cap - state.amount);
    if (q <= 0) return false;
    state.kind = 'water';
    state.amount += q;
    this.pourSound(dt);
    return true;
  }

  pourSound(dt, pump = false) {
    this.pourT -= dt;
    if (this.pourT > 0) return;
    this.pourT = 0.9;
    if (pump) this.game.audio?.pumpLoop?.(1);
    else this.game.audio?.startPour?.();
  }

  // ------------------------------------------------------------------ using items

  consume(held) {
    const g = this.game;
    const f = held.def.food;
    this.use = { kind: 'mouth', t: 0, dur: f.time, done: () => g.player.consume(f) };
    g.audio?.play(f.sound === 'drink' ? 'drink' : f.sound || 'eat');
    // item is used up
    setTimeout(() => {
      if (this.held === held) {
        held.root.parent?.remove(held.root);
        this.held = null;
      }
    }, f.time * 1000);
  }

  drinkFrom(held) {
    const g = this.game;
    const q = Math.min(0.35, held.state.amount);
    held.state.amount -= q;
    this.use = { kind: 'mouth', t: 0, dur: 1.1, done: () => g.player.consume({ thirst: q * 55 }) };
    g.audio?.play('gulp');
  }

  toggleFlashlight() {
    this.flashlightOn = !this.flashlightOn;
    this.game.audio?.play('switch');
    const lens = this.held?.root.getObjectByName('lens');
    if (lens) lens.material.emissiveIntensity = this.flashlightOn ? 3 : 0;
  }

  swing(held) {
    if (this.swingT > 0) return;
    this.swingT = 0.45;
    const g = this.game;
    g.audio?.play('swing');
    setTimeout(() => {
      const cam = g.camera;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      const hit = g.physics.raycast(cam.position, fwd, 1.9, { filter: GROUP.CREATURE | GROUP.STATIC | GROUP.ITEM, exclude: g.player.collider });
      if (!hit) return;
      if (hit.owner?.kind === 'creature') {
        hit.owner.creature.damage(held.def.damage || 15, fwd);
        g.audio?.play('melee_hit', { pos: hit.point });
      } else g.audio?.play(hit.owner?.kind === 'item' ? 'impact_metal' : 'impact_wood', { pos: hit.point, volume: 0.7 });
    }, 180);
  }

  fireOrReload(held) {
    const g = this.game;
    const s = held.state;
    if (s.loaded > 0) {
      s.loaded--;
      this.recoil = 1;
      g.audio?.play('gunshot');
      const cam = g.camera;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      const hit = g.physics.raycast(cam.position, fwd, 80, { filter: GROUP.CREATURE | GROUP.STATIC | GROUP.ITEM, exclude: g.player.collider });
      if (hit?.owner?.kind === 'creature') hit.owner.creature.damage(60, fwd);
      return;
    }
    const ammoIdx = this.pockets.findIndex((p) => p?.id === 'ammo' && p.state.ammo > 0);
    if (ammoIdx < 0) {
      g.audio?.play('empty_click');
      g.ui.toast(tr(['Нет патронов', 'No ammo']));
      return;
    }
    const box = this.pockets[ammoIdx];
    const n = Math.min(6, box.state.ammo);
    box.state.ammo -= n;
    s.loaded = n;
    if (box.state.ammo <= 0) this.pockets[ammoIdx] = null;
    g.audio?.play('reload');
  }

  // ------------------------------------------------------------------ car seats and controls

  enterCar(car, which) {
    const g = this.game;
    if (this.drag) this.releaseDrag(false);
    if (this.held && !this.held.def?.small) this.dropHeld(false);
    const seat = SEATS[which];
    const door = seat.door;
    g.player.sit(car, which, seat);
    if (car.installed(door) && car.closures[door].open > 0.3) setTimeout(() => car.closures[door].open > 0.3 && car.toggle(door), 350);
    g.tutorial?.event('sit', which);
  }

  exitCar() {
    const g = this.game;
    const seat = g.player.seat;
    if (!seat) return;
    const car = seat.car;
    const door = SEATS[seat.which].door;
    if (car.installed(door) && car.closures[door].open < 0.5) car.toggle(door);
    car.s.horn = false;
    g.player.standUp();
  }

  seatedControls(dt) {
    const g = this.game;
    const input = g.input;
    const seat = g.player.seat;
    if (seat.which !== 'driver') return;
    const car = seat.car;
    const s = car.s;
    if (input.pressed('ignition')) {
      if (!s.ignition) car.toggleIgnition();
      else if (!s.running) car.startCrank();
      else car.toggleIgnition();
      g.tutorial?.event('ignition');
    }
    if (input.released('ignition')) car.stopCrank();
    if (input.pressed('headlights')) {
      s.beams = (s.beams + 1) % 3;
      g.audio?.play('switch');
    }
    s.horn = input.down('horn') && car.power > 0.1;
    if (input.pressed('indicatorLeft')) s.indicator = s.indicator === -1 ? 0 : -1;
    if (input.pressed('indicatorRight')) s.indicator = s.indicator === 1 ? 0 : 1;
    if (!car.vehicle.automatic) {
      if (input.pressed('shiftUp') && car.vehicle.shift(1)) g.audio?.play('shift');
      if (input.pressed('shiftDown') && car.vehicle.shift(-1)) g.audio?.play('shift');
    }
    if (this.target?.kind === 'control' && this.target.what === 'radio') {
      const w = input.takeWheel();
      if (w) s.radioFreq = clamp(Math.round((s.radioFreq - w * 0.1) * 10) / 10, 87.5, 108);
    }
  }

  // ------------------------------------------------------------------ hands

  placeHands(dt, tgt) {
    const g = this.game;
    const hands = g.hands;
    const cam = g.camera;
    const seat = g.player.seat;
    this.swingT = Math.max(0, this.swingT - dt);
    this.recoil = Math.max(0, this.recoil - dt * 5);
    const toCam = (w) => cam.worldToLocal(w.clone());
    if (this.use) {
      this.use.t += dt;
      if (this.use.t >= this.use.dur) {
        this.use.done();
        this.use = null;
      }
    }
    // right hand
    if (this.use) hands.place('right', 'mouth', this.held?.def.hold || 'hold', null, null, 7);
    else if (this.drag) {
      const grab = this.dragPoint();
      const p = hands.reach('right', toCam(grab).add(new THREE.Vector3(0.05, -0.03, 0.05)));
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.4, 0.3, -0.5));
      hands.place('right', 'target', 'grip', p, q, 14);
    } else if (this.held) {
      const q = this.heldQuat();
      const r = Hands.restPlacement(1, this.held.kind === 'part' ? 'present' : 'hold');
      if (this.progress && tgt?.point) {
        // reach towards the work point, ratcheting the wrench
        const p = hands.reach('right', toCam(tgt.point).add(new THREE.Vector3(0, -0.04, 0.12)));
        const wob = Math.sin(this.progress.t * 18) * 0.35;
        hands.place('right', 'target', 'grip', p, r.quat.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(wob, 0, 0))), 12);
      } else hands.place('right', 'target', this.held.kind === 'part' ? 'hold' : this.held.def.hold || 'hold', r.pos.add(new THREE.Vector3(0, this.recoil * 0.03, this.recoil * 0.06)), q, 10);
    } else if (seat?.which === 'driver') {
      this.steerHand('right', 1);
    } else if (this.progress && tgt?.point) {
      const p = hands.reach('right', toCam(tgt.point).add(new THREE.Vector3(0.02, -0.05, 0.08)));
      hands.place('right', 'target', 'grip', p, new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, 0.2, -1.2)), 12);
    } else if (tgt && tgt.kind !== 'bed') {
      hands.place('right', 'rest', 'relaxed', null, null, 6);
    } else hands.place('right', 'hidden');
    // left hand
    if (this.drag) {
      const grab = this.dragPoint();
      const p = hands.reach('left', toCam(grab).add(new THREE.Vector3(-0.12, -0.02, 0.07)));
      hands.place('left', 'target', 'grip', p, new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.4, -0.3, 0.5)), 14);
    } else if (this.held?.kind === 'part') {
      const r = Hands.restPlacement(-1, 'present');
      hands.place('left', 'target', 'hold', r.pos, r.quat, 10);
    } else if (seat?.which === 'driver') this.steerHand('left', -1);
    else hands.place('left', 'hidden');
  }

  heldQuat() {
    const r = Hands.restPlacement(1, this.held.kind === 'part' ? 'present' : 'hold');
    if (this.swingT > 0) {
      const k = Math.sin((1 - this.swingT / 0.45) * Math.PI);
      return r.quat.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-k * 1.3, k * 0.4, 0)));
    }
    return r.quat;
  }

  dragPoint() {
    const d = this.drag;
    const b = d.item.body;
    if (!b) return d.item.root.position.clone();
    const t0 = b.translation();
    const r = b.rotation();
    return d.local.clone().applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w)).add(new THREE.Vector3(t0.x, t0.y, t0.z));
  }

  /** Hands on the steering-wheel rim at ten-to-two, turning with the wheel. */
  steerHand(which, side) {
    const g = this.game;
    const car = g.player.seat.car;
    const wheel = car.controls.steeringWheel;
    if (!wheel) return;
    wheel.updateWorldMatrix(true, false);
    const a = side > 0 ? -0.55 : Math.PI + 0.55;
    const R = 0.183;
    const local = new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0.012);
    const world = local.applyMatrix4(wheel.matrixWorld);
    const p = g.camera.worldToLocal(world);
    const wq = wheel.getWorldQuaternion(new THREE.Quaternion());
    const cq = g.camera.getWorldQuaternion(new THREE.Quaternion()).invert();
    const base = cq.multiply(wq);
    const rim = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.25, side * 0.2, side * (-0.4 + (side > 0 ? 0 : 0))));
    g.hands.place(which, 'target', 'wheel', p.add(new THREE.Vector3(side * 0.012, -0.03, 0.035)), base.multiply(rim), 20);
  }

  // ------------------------------------------------------------------ save

  save() {
    const pack = (it) => it && (it.kind === 'part' ? null : { id: it.id, s: it.state });
    return { held: pack(this.held), pockets: this.pockets.map(pack) };
  }
}

/** Compass heading of the camera (radians clockwise from north; the journey runs west, +Z). */
export function heading(camera) {
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  return Math.atan2(-f.z, -f.x);
}

export function itemTitle(it) {
  if (it.kind === 'part') return `${tr(PARTS[it.partId].name)} · ${Math.round((it.state.cond ?? 1) * 100)}%`;
  const def = ITEMS[it.id];
  let s = tr(def.name);
  if (def.liquid) s += ` · ${it.state.amount > 0.05 ? `${it.state.amount.toFixed(1)} ${tr(['л', 'L'])} ${tr(LIQUID_NAMES[it.state.kind])}` : tr(['пусто', 'empty'])}`;
  if (def.tool === 'gun') s += ` · ${it.state.loaded}/6`;
  if (def.ammo) s += ` · ${it.state.ammo}`;
  if (def.money) s += ` · ${it.state.amount} ₽`;
  return s;
}

export { kindOf, clamp01 };
