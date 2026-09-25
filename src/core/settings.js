/**
 * Player settings with defaults, persisted in localStorage. `settings.on('change', fn)` fires with
 * the changed key so systems can apply it live.
 */
import { Emitter } from './events.js';

const KEY = 'tlr2_settings';

export const DEFAULT_BINDINGS = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  sprint: 'ShiftLeft',
  crouch: 'ControlLeft',
  interact: 'KeyE',
  drop: 'KeyG',
  pocket: 'KeyQ',
  rotate: 'KeyR',
  headlights: 'KeyL',
  horn: 'KeyH',
  ignition: 'KeyI',
  camera: 'KeyC',
  journal: 'KeyJ',
  flashlight: 'KeyF',
  shiftUp: 'KeyX',
  shiftDown: 'KeyZ',
  indicatorLeft: 'Comma',
  indicatorRight: 'Period',
};

export const DEFAULTS = {
  language: 'ru',
  quality: 'high',
  renderScale: 1,
  brightness: 1,
  fov: 72,
  mirrors: true,
  headBob: true,
  showFps: false,
  master: 0.8,
  sfx: 0.9,
  engine: 0.9,
  ambient: 0.8,
  radio: 0.7,
  music: 0.6,
  sensitivity: 1,
  invertY: false,
  hints: true,
  carPanel: true,
  dayLength: 40,
  bindings: { ...DEFAULT_BINDINGS },
};

class Settings extends Emitter {
  constructor() {
    super();
    this.values = structuredClone(DEFAULTS);
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved) {
        Object.assign(this.values, saved);
        this.values.bindings = { ...DEFAULT_BINDINGS, ...(saved.bindings || {}) };
      }
    } catch {
      /* corrupted settings fall back to defaults */
    }
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    if (this.values[key] === value) return;
    this.values[key] = value;
    this.save();
    this.emit('change', key, value);
  }

  bind(action, code) {
    const b = { ...this.values.bindings };
    // a key can only drive one action: swap with whatever used it
    for (const [a, c] of Object.entries(b)) if (c === code && a !== action) b[a] = b[action];
    b[action] = code;
    this.values.bindings = b;
    this.save();
    this.emit('change', 'bindings', b);
  }

  resetBindings() {
    this.values.bindings = { ...DEFAULT_BINDINGS };
    this.save();
    this.emit('change', 'bindings', this.values.bindings);
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.values));
    } catch {
      /* storage may be unavailable (private mode); settings stay in memory */
    }
  }
}

export const settings = new Settings();
