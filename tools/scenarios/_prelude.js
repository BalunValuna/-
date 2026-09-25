// Shared helpers for gameShot scenarios (prepended to every scenario body).
const THREE = game.THREE;
/** Starts a new game and waits until play; pointer lock is faked so no overlay covers the view. */
const start = async (opts = {}) => {
  game.input.lock = () => { game.input.locked = true; };
  await game.newGame({ seed: 20130512, difficulty: 'normal', start: 'ready', transmission: 'auto', ...opts });
  game.input.locked = true;
  game.ui.showClickToPlay(false);
  await frames(3);
};
/** Sets the time of day and refreshes lighting/env map immediately. */
const setTime = async (h, weather = null) => {
  const env = game.env;
  env.time = h;
  if (weather) { env.setWeather(weather, 0.01); for (const k of Object.keys(env.cur)) env.cur[k] = env.target[k]; }
  env.update(0, game.camera.position);
  env.refreshEnvMap('force' + Math.random());
  await frames(3);
};
/** Seats the player in the car (driver by default). */
const seat = async (which = 'driver') => { game.interaction.enterCar(game.car, which); await frames(2); };
const stand = async () => { game.interaction.exitCar(); await frames(2); };
/** Free camera for screenshots: from `pos` looking at `target` (arrays, car-local if car=true). */
const cam = (pos, target, car = false) => {
  const P = new THREE.Vector3(...pos);
  const T = new THREE.Vector3(...target);
  if (car) { game.car.worldPoint(P, P); game.car.worldPoint(T, T); }
  game.debugCam = { pos: P, target: T };
};
const freeCam = () => { game.debugCam = null; };
/** Player look direction (yaw, pitch in radians). */
const look = (yaw, pitch = 0) => { game.player.yaw = yaw; game.player.pitch = pitch; };
const round = (v, n = 2) => (Array.isArray(v) ? v.map((x) => +x.toFixed(n)) : +v.toFixed(n));
