import { Game } from './game/Game.js';

// Entry point: boot the game (physics, car model, world) and show the main menu.
const game = new Game();
game.boot().catch((e) => {
  console.error(e);
  window.__gameError = String(e?.stack || e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:20px;color:#f88;white-space:pre-wrap;z-index:99">${String(e?.stack || e)}</pre>`);
});

// dev builds expose test helpers (fast-forward simulation, cameras) as game.dev
if (import.meta.env.DEV) import('./dev/devTools.js').then((m) => m.attachDevTools(game));
