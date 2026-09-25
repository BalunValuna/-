await start();
game.dev.readyCar();
game.dev.carOnRoad(1500);
await seat();
const t = game.world.terrain;
const roads = [...t.chunks.values()].filter((c) => c.road).length;
const car = game.car.position;
log({ roads, chunks: t.chunks.size, car: round([car.x, car.y, car.z]) });
for (const [h, name] of [[9, 'a_morning'], [13, 'b_noon'], [18.6, 'c_evening'], [20.4, 'd_sunset'], [21.3, 'e_dusk'], [23.5, 'f_night']]) {
  await setTime(h);
  game.car.s.beams = h > 20 ? 1 : 0;
  game.dev.chaseCam(9, 3);
  await frames(4);
  await shot(name + '_chase');
  freeCam();
  await frames(3);
  await shot(name + '_cockpit');
}
game.car.s.beams = 2;
await frames(3);
await shot('g_night_high');
