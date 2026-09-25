import { settings } from './settings.js';

/**
 * Keyboard and mouse state with rebindable actions. `down(action)` is held state,
 * `pressed(action)` fires once per press and is cleared by `endFrame()`.
 * Mouse look deltas accumulate between frames while the pointer is locked.
 */
export class Input {
  constructor(element) {
    this.el = element;
    this.keys = new Set();
    this.justPressed = new Set();
    this.justReleased = new Set();
    this.buttons = 0;
    this.buttonsPressed = 0;
    this.buttonsReleased = 0;
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.locked = false;
    this.enabled = true;
    this.onKey = null; // key capture for rebinding

    addEventListener('keydown', (e) => {
      if (this.onKey) {
        e.preventDefault();
        this.onKey(e.code);
        return;
      }
      if (e.code === 'Tab' || (this.locked && e.code.startsWith('Arrow'))) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.justPressed.add(e.code);
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.justReleased.add(e.code);
    });
    addEventListener('blur', () => {
      this.keys.clear();
      this.buttons = 0;
    });
    element.addEventListener('mousedown', (e) => {
      this.buttons |= 1 << e.button;
      this.buttonsPressed |= 1 << e.button;
    });
    addEventListener('mouseup', (e) => {
      this.buttons &= ~(1 << e.button);
      this.buttonsReleased |= 1 << e.button;
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    element.addEventListener('wheel', (e) => (this.wheel += Math.sign(e.deltaY)), { passive: true });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === element;
      if (!this.locked) this.keys.clear();
    });
  }

  code(action) {
    return settings.get('bindings')[action];
  }

  down(action) {
    return this.enabled && this.keys.has(this.code(action));
  }

  pressed(action) {
    return this.enabled && this.justPressed.has(this.code(action));
  }

  released(action) {
    return this.justReleased.has(this.code(action));
  }

  keyPressed(code) {
    return this.enabled && this.justPressed.has(code);
  }

  mouse(button = 0) {
    return this.enabled && (this.buttons & (1 << button)) !== 0;
  }

  mousePressed(button = 0) {
    return this.enabled && (this.buttonsPressed & (1 << button)) !== 0;
  }

  mouseReleased(button = 0) {
    return (this.buttonsReleased & (1 << button)) !== 0;
  }

  takeLook() {
    const d = { x: this.dx, y: this.dy };
    this.dx = 0;
    this.dy = 0;
    return d;
  }

  takeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  lock() {
    if (!this.locked) this.el.requestPointerLock?.()?.catch?.(() => {});
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  endFrame() {
    this.justPressed.clear();
    this.justReleased.clear();
    this.buttonsPressed = 0;
    this.buttonsReleased = 0;
  }
}

/** Human-readable key name for a KeyboardEvent.code. */
export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map = {
    Space: 'Пробел',
    ShiftLeft: 'Shift',
    ShiftRight: 'R Shift',
    ControlLeft: 'Ctrl',
    ControlRight: 'R Ctrl',
    AltLeft: 'Alt',
    Tab: 'Tab',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: ';',
    Quote: "'",
    BracketLeft: '[',
    BracketRight: ']',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    Enter: 'Enter',
    Backspace: 'Backspace',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    CapsLock: 'Caps',
  };
  return map[code] || code;
}
