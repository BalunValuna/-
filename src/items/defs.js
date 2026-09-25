/**
 * Item definitions. `shape` is the collider (box half-extents or cylinder radius/half-height);
 * `hold` how the right hand grips it; `liquid` containers carry { cap, kinds, rate (L/s) };
 * `food` restores stats; `tool` enables actions (wrench, melee, gun, light, compass, repair).
 */
export const ITEMS = {
  jerrycan: { name: ['Канистра 20 л', 'Jerry can 20 L'], mass: 4, shape: { box: [0.08, 0.2, 0.17] }, hold: 'grip', liquid: { cap: 20, kinds: ['petrol', 'diesel', 'water'], rate: 1.4 }, big: true },
  jerrycan_s: { name: ['Канистра 10 л', 'Jerry can 10 L'], mass: 2.5, shape: { box: [0.065, 0.16, 0.13] }, hold: 'grip', liquid: { cap: 10, kinds: ['petrol', 'diesel', 'water'], rate: 1.1 } },
  oilcan: { name: ['Моторное масло', 'Motor oil'], mass: 1, shape: { box: [0.06, 0.13, 0.1] }, hold: 'grip', liquid: { cap: 4, kinds: ['oil'], rate: 0.45 } },
  coolant: { name: ['Антифриз', 'Coolant'], mass: 1.2, shape: { box: [0.07, 0.14, 0.1] }, hold: 'grip', liquid: { cap: 5, kinds: ['coolant', 'water'], rate: 0.5 } },
  water: { name: ['Бутылка воды', 'Water bottle'], mass: 0.3, shape: { cyl: [0.042, 0.15] }, hold: 'hold', liquid: { cap: 1.5, kinds: ['water'], rate: 0.35, drinkable: true }, small: true },
  canister: { name: ['Бидон для воды', 'Water canister'], mass: 1.2, shape: { cyl: [0.13, 0.19] }, hold: 'grip', liquid: { cap: 10, kinds: ['water', 'petrol', 'diesel'], rate: 1, drinkable: true } },
  stew: { name: ['Тушёнка', 'Canned stew'], mass: 0.4, shape: { cyl: [0.05, 0.055] }, hold: 'hold', food: { hunger: 34, thirst: -4, time: 1.4, sound: 'eat' }, small: true },
  beans: { name: ['Фасоль', 'Beans'], mass: 0.4, shape: { cyl: [0.045, 0.06] }, hold: 'hold', food: { hunger: 26, thirst: -2, time: 1.2, sound: 'eat' }, small: true },
  sprats: { name: ['Шпроты', 'Sprats'], mass: 0.25, shape: { box: [0.08, 0.015, 0.05] }, hold: 'pinch', food: { hunger: 20, thirst: -6, time: 1.2, sound: 'eat' }, small: true },
  soda: { name: ['Газировка', 'Soda'], mass: 0.35, shape: { cyl: [0.033, 0.062] }, hold: 'hold', food: { hunger: 4, thirst: 22, energy: 6, time: 1, sound: 'drink' }, small: true },
  chocolate: { name: ['Шоколад', 'Chocolate'], mass: 0.1, shape: { box: [0.08, 0.008, 0.04] }, hold: 'pinch', food: { hunger: 14, thirst: -3, energy: 8, time: 0.8, sound: 'eat' }, small: true },
  chips: { name: ['Чипсы', 'Crisps'], mass: 0.1, shape: { box: [0.09, 0.13, 0.035] }, hold: 'pinch', food: { hunger: 12, thirst: -8, time: 1, sound: 'eat' }, small: true },
  coffee: { name: ['Термос с кофе', 'Coffee thermos'], mass: 0.9, shape: { cyl: [0.045, 0.14] }, hold: 'hold', food: { hunger: 2, thirst: 14, energy: 35, time: 1.4, sound: 'drink' }, small: true },
  medkit: { name: ['Аптечка', 'First aid kit'], mass: 0.8, shape: { box: [0.12, 0.05, 0.09] }, hold: 'hold', food: { health: 55, time: 2.2, sound: 'zip' }, small: true },
  bandage: { name: ['Бинт', 'Bandage'], mass: 0.05, shape: { cyl: [0.03, 0.03] }, hold: 'pinch', food: { health: 20, time: 1.5, sound: 'paper' }, small: true },
  wrench: { name: ['Гаечный ключ', 'Wrench'], mass: 0.6, shape: { box: [0.02, 0.012, 0.15] }, hold: 'grip', tool: 'wrench', small: true },
  crowbar: { name: ['Монтировка', 'Crowbar'], mass: 1.6, shape: { box: [0.02, 0.02, 0.38] }, hold: 'grip', tool: 'melee', damage: 34 },
  pipe: { name: ['Труба', 'Iron pipe'], mass: 1.4, shape: { cyl: [0.018, 0.33] }, hold: 'grip', tool: 'melee', damage: 28 },
  revolver: { name: ['Револьвер', 'Revolver'], mass: 1, shape: { box: [0.018, 0.07, 0.13] }, hold: 'grip', tool: 'gun', small: true },
  ammo: { name: ['Патроны .38', '.38 ammo'], mass: 0.4, shape: { box: [0.04, 0.025, 0.03] }, hold: 'pinch', ammo: 12, small: true },
  flashlight: { name: ['Фонарик', 'Flashlight'], mass: 0.4, shape: { cyl: [0.02, 0.1] }, hold: 'grip', tool: 'light', small: true },
  money: { name: ['Деньги', 'Money'], mass: 0.02, shape: { box: [0.07, 0.006, 0.035] }, hold: 'pinch', money: true, small: true },
  compass: { name: ['Компас', 'Compass'], mass: 0.2, shape: { cyl: [0.03, 0.01] }, hold: 'hold', tool: 'compass', small: true },
  repairkit: { name: ['Ремкомплект', 'Repair kit'], mass: 3, shape: { box: [0.2, 0.09, 0.1] }, hold: 'grip', tool: 'repair', uses: 3 },
  tape: { name: ['Изолента', 'Duct tape'], mass: 0.2, shape: { cyl: [0.05, 0.025] }, hold: 'hold', tool: 'repair', uses: 1, small: true },
  crate: { name: ['Деревянный ящик', 'Wooden crate'], mass: 14, shape: { box: [0.3, 0.22, 0.22] }, container: true, breakable: true },
  box: { name: ['Коробка', 'Cardboard box'], mass: 2, shape: { box: [0.22, 0.16, 0.17] }, container: true },
  barrel: { name: ['Бочка', 'Barrel'], mass: 30, shape: { cyl: [0.29, 0.44] }, liquid: { cap: 120, kinds: ['petrol', 'diesel', 'water'], rate: 1.6 } },
  note: { name: ['Записка', 'Note'], mass: 0.01, shape: { box: [0.075, 0.003, 0.105] }, hold: 'pinch', tool: 'note', small: true },
};

export const LIQUID_NAMES = {
  petrol: ['бензин', 'petrol'],
  diesel: ['дизель', 'diesel'],
  water: ['вода', 'water'],
  oil: ['масло', 'oil'],
  coolant: ['антифриз', 'coolant'],
};

/** Loot tables: [itemId, weight]. */
export const LOOT = {
  kitchen: [['stew', 10], ['beans', 8], ['sprats', 6], ['water', 12], ['soda', 7], ['chocolate', 5], ['chips', 5], ['coffee', 3], ['money', 4]],
  fridge: [['water', 14], ['soda', 10], ['stew', 4], ['beans', 3], ['coffee', 2]],
  cabinet: [['stew', 8], ['beans', 8], ['sprats', 6], ['water', 6], ['tape', 2], ['flashlight', 2], ['money', 2]],
  table: [['money', 5], ['note', 4], ['soda', 4], ['chips', 3], ['compass', 1], ['flashlight', 1], ['coffee', 2]],
  couch: [['money', 6], ['chips', 3], ['note', 2]],
  bed: [['note', 3], ['money', 2], ['revolver', 0.5], ['bandage', 2]],
  drawer: [['money', 6], ['bandage', 4], ['medkit', 2], ['ammo', 2], ['flashlight', 2], ['note', 3], ['compass', 1], ['tape', 2]],
  shelf: [['tape', 3], ['flashlight', 2], ['oilcan', 3], ['water', 3], ['box', 2], ['note', 2], ['money', 2]],
  bathroom: [['medkit', 3], ['bandage', 6], ['water', 2]],
  junk: [['box', 3], ['tape', 2], ['pipe', 2], ['water', 2], ['jerrycan_s', 1]],
  workbench: [['wrench', 4], ['tape', 4], ['repairkit', 3], ['oilcan', 4], ['flashlight', 2], ['crowbar', 2]],
  garage: [['oilcan', 8], ['jerrycan', 5], ['jerrycan_s', 5], ['coolant', 5], ['wrench', 2], ['crowbar', 2], ['pipe', 2], ['repairkit', 3], ['tape', 4]],
  store: [['stew', 10], ['beans', 10], ['sprats', 8], ['water', 12], ['soda', 7], ['chocolate', 5], ['coffee', 4], ['chips', 5], ['oilcan', 3], ['coolant', 2]],
  register: [['money', 20], ['note', 2]],
  wreck: [['money', 4], ['water', 3], ['oilcan', 3], ['tape', 2], ['note', 2], ['jerrycan_s', 2], ['wrench', 1]],
  military: [['ammo', 10], ['revolver', 3], ['medkit', 6], ['bandage', 6], ['water', 6], ['stew', 6], ['compass', 3], ['flashlight', 3], ['money', 3]],
  trailer: [['stew', 6], ['beans', 5], ['water', 8], ['money', 5], ['jerrycan_s', 3], ['tape', 3], ['compass', 1], ['note', 3]],
};
