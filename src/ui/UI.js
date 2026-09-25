import './style.css';
import * as THREE from 'three';
import { t, tr, lang } from '../core/i18n.js';
import { settings } from '../core/settings.js';
import { keyLabel } from '../core/input.js';
import { TANK, PARTS } from '../car/partsCatalog.js';
import { NOTES } from '../world/Story.js';
import { clamp01 } from '../core/math.js';

/**
 * DOM user interface: boot/loading, main menu, new game, settings, about, multiplayer
 * placeholder, pause, journal dashboard, HUD, note reader and end screens.
 */
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

export class UI {
  constructor(game) {
    this.game = game;
    this.root = h('div', { class: 'ui-root' });
    document.body.append(this.root);
    this.screens = {};
    this.modal = null;
    this.buildLoading();
    this.buildHud();
    this.promptKey = '';
    this.vitalT = 0;
    this.lastVitals = {};
    settings.on('change', (k) => {
      if (k === 'language') this.rebuild();
      if (k === 'showFps') this.fps.style.display = settings.get('showFps') ? 'block' : 'none';
    });
  }

  screen(name, el) {
    this.screens[name]?.remove();
    el.classList.add('screen');
    this.screens[name] = el;
    this.root.append(el);
    return el;
  }

  show(name) {
    for (const [n, el] of Object.entries(this.screens)) el.classList.toggle('on', n === name || (name !== 'hud' && n === 'hud' && false));
  }

  click() {
    this.game.audio?.play('ui_click');
  }

  rebuild() {
    const s = this.game.state;
    this.buildHud();
    if (s === 'menu') this.showMenu();
    else if (s === 'pause') this.showPause();
  }

  // ------------------------------------------------------------------ loading

  buildLoading() {
    this.loadingEl = this.screen(
      'loading',
      h(
        'div',
        { class: 'loading' },
        h('div', { class: 'box' }, h('div', { class: 'title', html: 'The Long <b>Road</b>' }), h('div', { class: 'bar' }, h('i')), h('div', { class: 'status' }, '')),
      ),
    );
  }

  loading(text, p) {
    this.show('loading');
    this.loadingEl.classList.add('on');
    this.loadingEl.querySelector('.status').textContent = text;
    this.loadingEl.querySelector('.bar i').style.width = `${Math.round(p * 100)}%`;
  }

  // ------------------------------------------------------------------ main menu

  showMenu() {
    const g = this.game;
    const save = g.saves.peek();
    const item = (label, onclick, extra = null, cls = '') =>
      h(
        'button',
        {
          class: `mi ${cls}`,
          onclick: (e) => {
            g.ensureAudio();
            this.click();
            onclick(e);
          },
          onmouseenter: () => g.audio?.play('ui_hover', { volume: 0.4 }),
        },
        label,
        extra,
      );
    const list = h(
      'div',
      { class: 'menu-list' },
      save ? item(t('menu.continue'), () => g.loadGame(save), h('small', {}, t('menu.lastSave', save.env.day, Math.round(save.km)))) : null,
      item(t('menu.newGame'), () => this.showNewGame()),
      item(t('menu.multiplayer'), () => this.showMultiplayer(), h('span', { class: 'tag' }, lang() === 'en' ? 'SOON' : 'СКОРО')),
      item(t('menu.settings'), () => this.showSettings('menu')),
      item(t('menu.about'), () => this.showAbout()),
    );
    const el = h(
      'div',
      { class: 'menu' },
      h('div', { class: 'col' }, h('div', { class: 'logo', html: `The Long<b>Road</b>` }), h('div', { class: 'tagline' }, t('menu.tagline')), list),
      h('div', { class: 'foot' }, `${t('menu.version')} · ${save ? t('menu.lastSave', save.env.day, Math.round(save.km)) : t('menu.noSave')}`),
    );
    this.screen('menu', el);
    this.show('menu');
  }

  dialog(name, panel, onClose = null) {
    const wrap = h('div', { class: 'dim' }, panel);
    wrap.addEventListener('mousedown', (e) => {
      if (e.target === wrap && onClose) onClose();
    });
    this.screen(name, wrap);
    this.show(name);
    return wrap;
  }

  showMultiplayer() {
    const back = () => this.showMenu();
    this.dialog(
      'mp',
      h(
        'div',
        { class: 'panel', style: 'width:min(440px,92vw)' },
        h('h2', {}, t('menu.multiplayer')),
        h('p', { class: 'sub', style: 'margin-top:14px' }, t('menu.mpSoon')),
        h('div', { class: 'row-end' }, h('button', { class: 'btn primary', onclick: back }, 'OK')),
      ),
      back,
    );
  }

  showAbout() {
    const back = () => this.showMenu();
    this.dialog(
      'about',
      h(
        'div',
        { class: 'panel', style: 'width:min(560px,92vw)' },
        h('h2', {}, t('menu.about')),
        h('p', { class: 'sub', style: 'margin-top:14px;line-height:1.6', html: t('menu.aboutText') }),
        h('div', { class: 'row-end' }, h('button', { class: 'btn', onclick: back }, t('menu.back'))),
      ),
      back,
    );
  }

  // ------------------------------------------------------------------ new game

  showNewGame() {
    const g = this.game;
    const opt = { seed: Math.floor(Math.random() * 90000000) + 10000000, difficulty: 'normal', start: 'ready', transmission: 'auto' };
    const seg = (key, values) =>
      h(
        'div',
        { class: 'seg' },
        values.map(([v, label]) => {
          const b = h('button', { class: opt[key] === v ? 'on' : '' }, label);
          b.onclick = () => {
            opt[key] = v;
            this.click();
            b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
            if (key === 'difficulty') hint.textContent = t(`new.${v}Hint`);
          };
          return b;
        }),
      );
    const hint = h('div', { class: 'hint' }, t('new.normalHint'));
    const card = (v, title, text) => {
      const c = h('button', { class: `card-opt ${opt.start === v ? 'on' : ''}` }, h('h3', {}, title), h('p', {}, text));
      c.onclick = () => {
        opt.start = v;
        this.click();
        c.parentElement.querySelectorAll('.card-opt').forEach((x) => x.classList.toggle('on', x === c));
      };
      return c;
    };
    const seedInput = h('input', { value: String(opt.seed), maxlength: 9, spellcheck: 'false' });
    seedInput.oninput = () => (opt.seed = Number(seedInput.value.replace(/\D/g, '')) || 1);
    const back = () => this.showMenu();
    this.dialog(
      'newgame',
      h(
        'div',
        { class: 'panel newgame' },
        h('h2', {}, t('new.title')),
        h('p', { class: 'story' }, t('new.story')),
        h('div', { class: 'cards' }, card('ready', t('new.startReady'), t('new.startReadyHint')), card('garage', t('new.startGarage'), t('new.startGarageHint'))),
        h(
          'div',
          { class: 'form-grid' },
          h('label', {}, t('new.difficulty')),
          h('div', {}, seg('difficulty', [['easy', t('new.easy')], ['normal', t('new.normal')], ['harsh', t('new.harsh')]]), hint),
          h('label', {}, t('new.transmission')),
          seg('transmission', [['auto', t('new.auto')], ['manual', t('new.manual')]]),
          h('label', {}, t('new.seed')),
          h('div', {}, h('div', { class: 'seed' }, seedInput, h('button', { class: 'btn ghost', onclick: () => ((opt.seed = Math.floor(Math.random() * 9e7) + 1e7), (seedInput.value = String(opt.seed))) }, t('new.random'))), h('div', { class: 'hint' }, t('new.seedHint'))),
        ),
        h('div', { class: 'row-end' }, h('button', { class: 'btn ghost', onclick: back }, t('menu.back')), h('button', { class: 'btn primary', onclick: () => g.newGame({ ...opt }) }, t('new.start'))),
      ),
      back,
    );
  }

  // ------------------------------------------------------------------ settings

  showSettings(from) {
    const tabs = ['graphics', 'audio', 'controls', 'game'];
    let tab = 'graphics';
    const body = h('div');
    const tabBar = h(
      'div',
      { class: 'tabs' },
      tabs.map((k) => {
        const b = h('button', { class: k === tab ? 'on' : '' }, t(`set.${k}`));
        b.onclick = () => {
          tab = k;
          this.click();
          tabBar.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
          render();
        };
        return b;
      }),
    );
    const row = (label, control) => h('div', { class: 'srow' }, h('span', {}, label), control);
    const segSetting = (key, values) =>
      h(
        'div',
        { class: 'seg' },
        values.map(([v, label]) => {
          const b = h('button', { class: settings.get(key) === v ? 'on' : '' }, label);
          b.onclick = () => {
            settings.set(key, v);
            this.click();
            b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
          };
          return b;
        }),
      );
    const onOff = (key) => segSetting(key, [[true, t('set.on')], [false, t('set.off')]]);
    const slider = (key, min, max, step, fmt = (v) => `${Math.round(v * 100)}%`) => {
      const out = h('output', {}, fmt(settings.get(key)));
      const input = h('input', { type: 'range', min, max, step, value: settings.get(key) });
      input.oninput = () => {
        settings.set(key, Number(input.value));
        out.textContent = fmt(Number(input.value));
      };
      return h('div', { class: 'slider' }, input, out);
    };
    const render = () => {
      body.replaceChildren();
      if (tab === 'graphics') {
        body.append(
          row(t('set.quality'), segSetting('quality', ['low', 'medium', 'high', 'ultra'].map((q) => [q, t(`set.q.${q}`)]))),
          row(t('set.renderScale'), slider('renderScale', 0.5, 1.5, 0.05)),
          row(t('set.brightness'), slider('brightness', 0.6, 1.6, 0.05)),
          row(t('set.fov'), slider('fov', 55, 100, 1, (v) => `${v}°`)),
          row(t('set.headBob'), onOff('headBob')),
          row(t('set.showFps'), onOff('showFps')),
        );
      } else if (tab === 'audio') {
        for (const k of ['master', 'sfx', 'engine', 'ambient', 'radio', 'music']) body.append(row(t(`set.${k}`), slider(k, 0, 1, 0.01)));
      } else if (tab === 'controls') {
        body.append(row(t('set.sensitivity'), slider('sensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2))), row(t('set.invertY'), onOff('invertY')));
        const grid = h('div', { class: 'keys' });
        const binds = settings.get('bindings');
        for (const action of Object.keys(binds)) {
          const cap = h('button', { class: 'keycap' }, keyLabel(binds[action]));
          cap.onclick = () => {
            cap.classList.add('wait');
            cap.textContent = '…';
            this.game.input.onKey = (code) => {
              this.game.input.onKey = null;
              if (code !== 'Escape') settings.bind(action, code);
              render();
            };
          };
          grid.append(row(t(`key.${action}`), cap));
        }
        body.append(grid, h('div', { class: 'row-end', style: 'margin-top:12px' }, h('button', { class: 'btn ghost', onclick: () => (settings.resetBindings(), render()) }, t('set.resetKeys'))));
      } else {
        body.append(
          row(t('set.language'), segSetting('language', [['ru', 'Русский'], ['en', 'English']])),
          row(t('set.hints'), onOff('hints')),
          row(t('set.carPanel'), onOff('carPanel')),
          row(t('set.dayLength'), slider('dayLength', 20, 90, 5, (v) => t('set.minutes', v))),
        );
      }
    };
    render();
    const back = () => (from === 'pause' ? this.showPause() : this.showMenu());
    this.dialog('settings', h('div', { class: 'panel settings' }, h('h2', {}, t('set.title')), tabBar, body, h('div', { class: 'row-end' }, h('button', { class: 'btn primary', onclick: back }, t('menu.back')))), back);
  }

  // ------------------------------------------------------------------ pause / journal / end

  showPause() {
    const g = this.game;
    const mi = (label, fn) => h('button', { class: 'mi', onclick: () => (this.click(), fn()) }, label);
    this.dialog(
      'pause',
      h(
        'div',
        { class: 'panel' },
        h('h2', {}, t('menu.paused')),
        h('div', { class: 'sub' }, `${t('jr.day', g.env.day)} · ${fmtTime(g.env.time)} · ${Math.round(g.km())} ${t('jr.km')}`),
        h('div', { class: 'menu-list' }, mi(t('menu.resume'), () => g.resume()), mi(t('menu.journal'), () => this.showJournal()), mi(t('menu.save'), () => (g.save(), this.showPause())), mi(t('menu.settings'), () => this.showSettings('pause')), mi(t('menu.quit'), () => g.quitToMenu())),
      ),
      () => g.resume(),
    );
    this.screens.pause.classList.add('pause');
  }

  showJournal() {
    const g = this.game;
    if (g.state === 'play') {
      g.state = 'journal';
      g.input.unlock();
    }
    const km = g.km();
    const goal = g.goalKm();
    const car = g.car;
    const p = g.player.stats;
    const ring = (v, label, color) => {
      const r = 26;
      const c = 2 * Math.PI * r;
      const svg = `<svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="${r}" fill="none" stroke="rgba(236,228,214,0.12)" stroke-width="4"/><circle cx="32" cy="32" r="${r}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${c * clamp01(v / 100)} ${c}" transform="rotate(-90 32 32)"/><text x="32" y="37" text-anchor="middle" font-size="14" font-family="Bahnschrift, Arial Narrow, sans-serif" fill="#ece4d6">${Math.round(v)}</text></svg>`;
      return h('figure', {}, h('div', { html: svg }), h('figcaption', {}, label));
    };
    const frac = clamp01(km / goal);
    const route = `<svg width="100%" height="46" viewBox="0 0 600 46" preserveAspectRatio="none"><path d="M10 30 C 120 8, 200 40, 300 22 S 480 10, 590 26" fill="none" stroke="rgba(236,228,214,0.18)" stroke-width="3" stroke-dasharray="6 6"/><path d="M10 30 C 120 8, 200 40, 300 22 S 480 10, 590 26" fill="none" stroke="#e3a23c" stroke-width="3" pathLength="1" stroke-dasharray="${frac} 1"/><circle cx="10" cy="30" r="5" fill="#ece4d6"/><circle cx="590" cy="26" r="5" fill="none" stroke="#ece4d6" stroke-width="2"/></svg>`;
    const fluid = (label, v, max, unit) => [h('span', {}, label), h('div', { class: 'b' }, h('i', { style: `width:${Math.round(clamp01(v / max) * 100)}%` })), h('span', {}, `${v.toFixed(1)} ${unit}`)];
    const missing = car.missingParts().map((id) => tr(PARTS[id].name));
    const notes = g.stats.notes || [];
    const hours = Math.floor(g.stats.playTime / 3600);
    const mins = Math.floor((g.stats.playTime % 3600) / 60);
    const panel = h(
      'div',
      { class: 'panel journal' },
      h('h2', {}, t('jr.title')),
      h(
        'div',
        { class: 'jgrid' },
        h(
          'div',
          { class: 'jcard', style: 'grid-column: span 8' },
          h('h3', {}, t('jr.journey')),
          h('div', { class: 'big', html: `${Math.round(km)}<small>${t('jr.km')}</small><small style="margin-left:18px">${t('jr.left', Math.max(0, Math.round(goal - km)))}</small>` }),
          h('div', { class: 'route', html: route }),
        ),
        h(
          'div',
          { class: 'jcard', style: 'grid-column: span 4' },
          h('h3', {}, t('jr.day', g.env.day)),
          h('div', { class: 'big' }, fmtTime(g.env.time)),
          h('div', { class: 'sub', style: 'margin-top:6px;color:var(--dim)' }, `${t(`w.${g.env.weather}`)} · ${t('jr.temp', Math.round(g.ambientTemp()))}`),
        ),
        h('div', { class: 'jcard', style: 'grid-column: span 5' }, h('h3', {}, t('jr.body')), h('div', { class: 'rings' }, ring(p.health, t('jr.health'), '#d4573f'), ring(p.food, t('jr.hunger'), '#e3a23c'), ring(p.water, t('jr.thirst'), '#6aa8d8'), ring(p.energy, t('jr.energy'), '#8fbf6a'))),
        h(
          'div',
          { class: 'jcard', style: 'grid-column: span 7' },
          h('h3', {}, t('jr.car')),
          h('div', { class: 'fluids' }, fluid(t('jr.fuel'), car.s.fuel, TANK.fuel, tr(['л', 'L'])), fluid(t('jr.oil'), car.s.oil, TANK.oil, tr(['л', 'L'])), fluid(t('jr.coolant'), car.s.coolant, TANK.coolant, tr(['л', 'L'])), fluid(t('jr.battery'), car.installed('battery') ? car.s.charge * 100 : 0, 100, '%')),
          h('div', { class: 'missing' }, missing.length ? `${t('jr.missing')}: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}` : t('jr.complete')),
          h('div', { class: 'missing' }, `${t('jr.odometer')}: ${Math.round(car.s.odometer).toLocaleString('ru-RU')} ${t('jr.km')}`),
        ),
        h(
          'div',
          { class: 'jcard', style: 'grid-column: span 5' },
          h('h3', {}, t('jr.stats')),
          h('div', { class: 'stats-list' }, h('div', {}, h('span', {}, t('jr.money')), `${Math.round(g.stats.money)} ₽`), h('div', {}, h('span', {}, t('jr.kills')), String(g.stats.kills)), h('div', {}, h('span', {}, t('jr.time')), `${hours} ч ${mins} мин`)),
        ),
        h(
          'div',
          { class: 'jcard', style: 'grid-column: span 7' },
          h('h3', {}, `${t('jr.notes')} · ${notes.length}`),
          h('div', { class: 'notes' }, notes.length ? notes.map((id) => h('button', { onclick: () => this.showNote(id, true) }, tr(NOTES[id]?.title || ['Записка', 'Note']))) : h('span', { style: 'color:var(--faint)' }, t('jr.noNotes'))),
        ),
      ),
      h('div', { class: 'row-end' }, h('button', { class: 'btn primary', onclick: () => g.resume() }, t('menu.resume'))),
    );
    this.dialog('journal', panel, () => g.resume());
  }

  showNote(id, fromJournal = false) {
    const g = this.game;
    if (!id) return;
    if (!g.stats.notes.includes(id)) g.stats.notes.push(id);
    g.audio?.play('paper');
    const close = () => {
      this.modal = null;
      if (fromJournal) this.showJournal();
      else {
        this.screens.note?.remove();
        delete this.screens.note;
        this.showHud();
        g.input.lock();
      }
    };
    this.modal = 'note';
    g.input.unlock();
    const el = this.dialog('note', h('div', { class: 'panel note' }, h('h2', {}, g.world.story.title(id)), g.world.story.text(id), h('div', { class: 'close' }, tr(['Щёлкните, чтобы закрыть', 'Click to close']))), close);
    el.querySelector('.note').addEventListener('mousedown', close);
  }

  showDeath(cause) {
    const g = this.game;
    const save = g.saves.peek();
    this.dialog(
      'end',
      h(
        'div',
        { class: 'panel' },
        h('h2', {}, t('end.died')),
        h('div', { class: 'cause' }, t(`death.${cause}`)),
        h('div', { class: 'nums' }, h('div', {}, h('b', {}, String(Math.round(g.km()))), h('span', {}, t('end.distance'))), h('div', {}, h('b', {}, String(g.env.day)), h('span', {}, t('end.days')))),
        h('div', { class: 'row-end' }, save ? h('button', { class: 'btn', onclick: () => g.loadGame(save) }, t('end.load')) : null, h('button', { class: 'btn primary', onclick: () => g.quitToMenu() }, t('end.menu'))),
      ),
    );
    this.screens.end.classList.add('endscreen');
  }

  showWin() {
    const g = this.game;
    this.dialog(
      'end',
      h(
        'div',
        { class: 'panel' },
        h('h2', {}, t('end.won')),
        h('p', { class: 'sub', style: 'margin-top:10px' }, t('end.wonText')),
        h('div', { class: 'nums' }, h('div', {}, h('b', {}, String(Math.round(g.km()))), h('span', {}, t('end.distance'))), h('div', {}, h('b', {}, String(g.env.day)), h('span', {}, t('end.days')))),
        h('div', { class: 'row-end' }, h('button', { class: 'btn', onclick: () => g.resume() }, t('end.keep')), h('button', { class: 'btn primary', onclick: () => g.quitToMenu() }, t('end.menu'))),
      ),
    );
    this.screens.end.classList.add('endscreen');
  }

  // ------------------------------------------------------------------ HUD

  buildHud() {
    const vit = (k) => h('div', { class: 'vital', 'data-k': k }, h('div', { class: 'lbl' }, t(`jr.${k === 'food' ? 'hunger' : k === 'water' ? 'thirst' : k}`)), h('div', { class: 'b' }, h('i')));
    this.cross = h('div', { class: 'crosshair' });
    this.ringEl = h('div', { class: 'ring', html: '<svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" stroke="rgba(0,0,0,0.35)"/><circle class="p" cx="22" cy="22" r="18" stroke="#e3a23c" stroke-dasharray="0 200" transform="rotate(-90 22 22)"/></svg>' });
    this.promptEl = h('div', { class: 'prompts' });
    this.vitalsEl = h('div', { class: 'vitals' }, ['health', 'food', 'water', 'energy'].map(vit));
    this.pocketsEl = h('div', { class: 'pockets' });
    this.gaugesEl = h('div', { class: 'gauges' });
    this.toastsEl = h('div', { class: 'toasts' });
    this.tutEl = h('div', { class: 'tutorial' });
    this.compassEl = h('div', { class: 'compass' }, h('div', { class: 'strip' }));
    this.hurtEl = h('div', { class: 'hurt' });
    this.fadeEl = h('div', { class: 'fade' });
    this.fps = h('div', { class: 'fps' });
    this.fps.style.display = settings.get('showFps') ? 'block' : 'none';
    this.clickEl = h('div', { class: 'clickplay', onclick: () => this.game.input.lock() }, h('span', {}, t('load.click')));
    const hud = h('div', { class: 'hud' }, this.hurtEl, this.cross, this.ringEl, this.promptEl, this.vitalsEl, this.pocketsEl, this.gaugesEl, this.tutEl, this.compassEl, this.toastsEl, this.fadeEl, this.fps, this.clickEl);
    this.hudEl = this.screen('hud', hud);
    const strip = this.compassEl.querySelector('.strip');
    const marks = ['С', '·', 'СВ', '·', 'В', '·', 'ЮВ', '·', 'Ю', '·', 'ЮЗ', '·', 'З', '·', 'СЗ', '·'];
    strip.textContent = '';
    for (let r = 0; r < 3; r++) for (const m of marks) strip.append(h('span', { style: 'display:inline-block;width:45px;text-align:center' }, m));
  }

  showHud() {
    this.modal = null;
    for (const k of Object.keys(this.screens)) if (!['hud', 'loading'].includes(k)) this.screens[k].classList.remove('on');
    this.show('hud');
    this.showClickToPlay(false);
  }

  showClickToPlay(on) {
    this.clickEl.classList.toggle('on', on && this.game.state === 'play');
  }

  toast(text) {
    const el = h('div', { class: 'toast' }, text);
    this.toastsEl.append(el);
    setTimeout(() => el.remove(), 3300);
  }

  setPrompt(actions, progress = null, name = null) {
    const vis = actions.filter((a) => !a.hidden);
    const key = `${name}|${vis.map((a) => a.key + a.label).join(',')}`;
    this.cross.classList.toggle('active', !!name || vis.length > 0);
    if (key !== this.promptKey) {
      this.promptKey = key;
      this.promptEl.replaceChildren();
      if (name) this.promptEl.append(h('div', { class: 'name' }, name));
      if (vis.length) {
        const input = this.game.input;
        const label = (k) => (k === 'E' ? keyLabel(input.code('interact')) : k === 'LMB' || k === 'dragLMB' ? tr(['ЛКМ', 'LMB']) : k === 'holdLMB' ? tr(['ЛКМ', 'LMB']) : k === 'RMB' ? tr(['ПКМ', 'RMB']) : k);
        this.promptEl.append(
          h(
            'div',
            { class: 'acts' },
            vis.map((a) => (a.key === 'info' ? h('span', { class: 'info' }, a.label) : h('span', {}, h('span', { class: 'k' }, label(a.key)), a.key === 'holdLMB' ? `${a.label} (${t('act.hold')})` : a.label))),
          ),
        );
      }
    }
    this.ringEl.classList.toggle('on', !!progress);
    if (progress) {
      const c = 2 * Math.PI * 18;
      const f = progress.need > 50 ? (progress.t % 1) : clamp01(progress.t / progress.need);
      this.ringEl.querySelector('.p').setAttribute('stroke-dasharray', `${c * f} ${c}`);
    }
  }

  setTutorial(info) {
    if (!info || !settings.get('hints')) {
      this.tutEl.classList.remove('on');
      return;
    }
    this.tutEl.classList.add('on');
    const key = `${info.title}|${info.text}|${info.index}`;
    if (this.tutKey === key) return;
    this.tutKey = key;
    this.tutEl.replaceChildren(
      h('h3', { class: 'caps' }, info.title),
      h('div', { class: 'step', html: info.text }),
      h('div', { class: 'track' }, Array.from({ length: info.total }, (_, i) => h('i', { class: i < info.index ? 'done' : '' }))),
      info.foot ? h('div', { class: 'next' }, info.foot) : null,
    );
  }

  update(dt) {
    const g = this.game;
    if (g.state !== 'play') return;
    if (settings.get('showFps')) this.fps.textContent = `${Math.round(g.fps)} fps`;
    const p = g.player.stats;
    // vitals only when low or recently changed
    this.vitalsEl.querySelectorAll('.vital').forEach((el) => {
      const k = el.dataset.k;
      const v = p[k];
      const changed = Math.abs((this.lastVitals[k] ?? v) - v) > 3;
      if (changed) {
        this.lastVitals[k] = v;
        el.dataset.until = String(performance.now() + 4000);
      }
      const low = v < 30;
      el.classList.toggle('low', low);
      el.classList.toggle('on', low || performance.now() < Number(el.dataset.until || 0));
      el.querySelector('i').style.width = `${Math.round(v)}%`;
    });
    // pockets
    const pk = g.interaction.pockets;
    const pkKey = pk.map((x) => x?.uid || 0).join(',');
    if (pkKey !== this.pkKey) {
      this.pkKey = pkKey;
      this.pocketsEl.replaceChildren(...pk.map((it, i) => (it ? h('div', { class: 'pocket' }, h('b', {}, String(i + 1)), tr(it.def.name)) : null)).filter(Boolean));
    }
    // gauges when driving
    const seat = g.player.seat;
    const showG = seat?.which === 'driver' && settings.get('carPanel');
    this.gaugesEl.classList.toggle('on', !!showG);
    if (showG) {
      const car = seat.car;
      const v = car.vehicle;
      const warn = [];
      if (car.s.temp > 115) warn.push(tr(['ПЕРЕГРЕВ', 'OVERHEAT']));
      if (car.s.oil < 0.6) warn.push(tr(['МАСЛО', 'OIL']));
      if (car.s.fuel < 3) warn.push(tr(['ТОПЛИВО', 'FUEL']));
      if (!car.installed('battery')) warn.push(tr(['НЕТ АКБ', 'NO BATTERY']));
      else if (car.s.charge < 0.2) warn.push(tr(['АКБ', 'BATTERY']));
      this.gaugesEl.innerHTML = `<div><span class="gear">${v.gearLabel()}</span><span class="spd">${Math.round(car.speedKmh())}</span><span class="unit">${t('hud.kmh')}</span></div><div class="rpm"><i style="width:${Math.round(clamp01(v.rpm / 8000) * 100)}%"></i></div><div class="mini"><span>${t('jr.fuel')} ${car.s.fuel.toFixed(0)}</span><span>${Math.round(car.s.temp)}°</span>${warn.map((w) => `<span class="warn">${w}</span>`).join('')}</div>`;
    }
    // compass when holding one
    const hasCompass = g.interaction.held?.def?.tool === 'compass';
    this.compassEl.classList.toggle('on', !!hasCompass);
    if (hasCompass) {
      const f = g.camera.getWorldDirection(new THREE.Vector3());
      const deg = ((Math.atan2(-f.z, -f.x) * 180) / Math.PI + 360) % 360;
      this.compassEl.querySelector('.strip').style.left = `${180 - (deg / 22.5) * 45 - 16 * 45 - 22}px`;
    }
    // hurt vignette
    const hurt = g.player.hurtT;
    g.player.hurtT = Math.max(0, hurt - dt * 0.8);
    this.hurtEl.style.opacity = String(Math.max(hurt, p.health < 25 ? 0.35 + Math.sin(performance.now() / 300) * 0.1 : 0));
  }

  fade(on) {
    this.fadeEl.style.opacity = on ? '1' : '0';
  }
}

export function fmtTime(h) {
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
