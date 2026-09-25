import { buildCarModel } from '../car/model.js';
import { carMaterials } from '../car/materials.js';

/**
 * Lab model: the full car with named part groups the critic can toggle and hinged closures it
 * can open. State keywords: hood, trunk, doors (left side), doorsAll, fuel, all.
 */
export function buildLabModel() {
  const mats = carMaterials(0x7d1a20);
  const car = buildCarModel(mats);
  const groups = {};
  for (const [id, obj] of Object.entries(car.parts)) groups[id] = car.pivots[id] || obj;

  function setState(state) {
    const open = new Set(String(state || '').split(',').filter(Boolean));
    const all = open.has('all');
    for (const id of Object.keys(car.pivots)) {
      let amount = 0;
      if ((all || open.has('hood')) && id === 'hood') amount = 1;
      if ((all || open.has('trunk')) && id === 'trunk') amount = 1;
      if ((all || open.has('doorsAll')) && id.includes('Door_')) amount = 1;
      if (open.has('doors') && id.includes('Door_L')) amount = 1;
      if ((all || open.has('fuel')) && id === 'fuelDoor') amount = 1;
      car.setHinge(id, amount);
    }
  }

  function showOnly(list) {
    const want = [...new Set(list)];
    for (const [id, g] of Object.entries(groups)) g.visible = want.some((w) => id === w || id.startsWith(w));
  }

  return {
    root: car.root,
    groups,
    car,
    setState,
    showOnly,
    showAll: () => Object.values(groups).forEach((g) => (g.visible = true)),
    stats: () => car.stats,
  };
}
