// Save/load round trip: change state, save, quit to menu, continue, compare.
await start({ start: 'ready', difficulty: 'harsh', transmission: 'manual' });
game.dev.readyCar();
game.dev.carOnRoad(2400);
game.dev.simulate(2, {});
const car = game.car;
car.s.fuel = 23.4;
car.s.oil = 2.9;
car.detach('hood') && null;
game.env.time = 15.5;
game.env.day = 3;
game.player.stats.water = 41;
game.stats.money = 77;
game.stats.notes.push('home');
const before = {
  seed: game.seed,
  carPos: round([car.position.x + game.origin.x, car.position.y, car.position.z + game.origin.z], 1),
  fuel: car.s.fuel, oil: car.s.oil, hood: car.installed('hood'),
  time: game.env.time, day: game.env.day, water: game.player.stats.water, money: game.stats.money,
  notes: [...game.stats.notes], manual: !game.car.vehicle.automatic, difficulty: game.options.difficulty,
};
game.save();
game.quitToMenu();
await frames(5);
const menuState = game.state;
await game.loadGame(game.saves.peek());
game.input.locked = true;
await frames(5);
const c2 = game.car;
const after = {
  seed: game.seed,
  carPos: round([c2.position.x + game.origin.x, c2.position.y, c2.position.z + game.origin.z], 1),
  fuel: c2.s.fuel, oil: c2.s.oil, hood: c2.installed('hood'),
  time: round(game.env.time, 1), day: game.env.day, water: game.player.stats.water, money: game.stats.money,
  notes: [...game.stats.notes], manual: !c2.vehicle.automatic, difficulty: game.options.difficulty,
};
const diffs = Object.keys(before).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
return { menuState, state: game.state, diffs, before, after };
