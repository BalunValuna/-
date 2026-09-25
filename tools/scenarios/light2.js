await start();
game.dev.readyCar();
game.dev.carOnRoad(1500);
await seat();
const plan = [
  [13, 0, 'chase', 'a_noon'], [13, 0, 'cockpit', 'b_noon'], [19.35, 0, 'chase', 'c_golden'],
  [20.25, 1, 'chase', 'd_sunset'], [20.8, 1, 'cockpit', 'e_dusk'], [23.5, 1, 'chase', 'f_night'],
  [23.5, 1, 'cockpit', 'g_night_low'], [23.5, 2, 'cockpit', 'h_night_high'],
];
for (const [h, beams, view, name] of plan) {
  await setTime(h);
  game.car.s.beams = beams;
  if (view === 'chase') game.dev.chaseCam(9, 3); else freeCam();
  await frames(4);
  await shot(name);
}
log({ exposure: game.gfx.renderer.toneMappingExposure, elev: game.env.elev });
