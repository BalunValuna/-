/**
 * Removable parts of the car. `model` is the part id in the visual model; `bolted` parts need a
 * wrench to unbolt and bolt back; `heavy` parts can only be dragged, not carried; `access` names
 * the closure that must be open (or removed) to reach the part.
 */
export const PARTS = {
  hood: { name: ['Капот', 'Hood'], mass: 16, bolted: true, painted: true, pivot: true },
  trunk: { name: ['Крышка багажника', 'Trunk lid'], mass: 12, bolted: true, painted: true, pivot: true },
  frontDoor_L: { name: ['Передняя левая дверь', 'Front left door'], mass: 24, bolted: true, painted: true, pivot: true },
  frontDoor_R: { name: ['Передняя правая дверь', 'Front right door'], mass: 24, bolted: true, painted: true, pivot: true },
  rearDoor_L: { name: ['Задняя левая дверь', 'Rear left door'], mass: 21, bolted: true, painted: true, pivot: true },
  rearDoor_R: { name: ['Задняя правая дверь', 'Rear right door'], mass: 21, bolted: true, painted: true, pivot: true },
  fender_L: { name: ['Левое крыло', 'Left fender'], mass: 6, bolted: true, painted: true },
  fender_R: { name: ['Правое крыло', 'Right fender'], mass: 6, bolted: true, painted: true },
  frontBumper: { name: ['Передний бампер', 'Front bumper'], mass: 8, bolted: true, painted: true },
  rearBumper: { name: ['Задний бампер', 'Rear bumper'], mass: 8, bolted: true, painted: true },
  headlight_L: { name: ['Левая фара', 'Left headlight'], mass: 2.5, bolted: false },
  headlight_R: { name: ['Правая фара', 'Right headlight'], mass: 2.5, bolted: false },
  taillight_L: { name: ['Левый фонарь', 'Left tail light'], mass: 1.4, bolted: false },
  taillight_R: { name: ['Правый фонарь', 'Right tail light'], mass: 1.4, bolted: false },
  windshield: { name: ['Лобовое стекло', 'Windshield'], mass: 13, bolted: false, glass: true },
  rearWindow: { name: ['Заднее стекло', 'Rear window'], mass: 9, bolted: false, glass: true },
  wheel_fl: { name: ['Колесо', 'Wheel'], mass: 18, bolted: true, wheel: true },
  wheel_fr: { name: ['Колесо', 'Wheel'], mass: 18, bolted: true, wheel: true },
  wheel_rl: { name: ['Колесо', 'Wheel'], mass: 18, bolted: true, wheel: true },
  wheel_rr: { name: ['Колесо', 'Wheel'], mass: 18, bolted: true, wheel: true },
  engine: { name: ['Двигатель', 'Engine'], mass: 135, bolted: true, heavy: true, access: 'hood' },
  battery: { name: ['Аккумулятор', 'Battery'], mass: 15, bolted: false, access: 'hood' },
  radiator: { name: ['Радиатор', 'Radiator'], mass: 7, bolted: true, access: 'hood' },
  airFilter: { name: ['Корпус воздушного фильтра', 'Air filter box'], mass: 2, bolted: false, access: 'hood' },
  seat_FL: { name: ['Сиденье водителя', "Driver's seat"], mass: 17, bolted: true, access: 'frontDoor_L' },
  seat_FR: { name: ['Сиденье пассажира', 'Passenger seat'], mass: 17, bolted: true, access: 'frontDoor_R' },
  rearSeat: { name: ['Заднее сиденье', 'Rear seat'], mass: 20, bolted: true, access: 'rearDoor_L' },
};

/** Interchangeable slots: a wheel fits any corner, a door only its own opening. */
export function kindOf(partId) {
  return partId.startsWith('wheel_') ? 'wheel' : partId;
}

/** Base mass of the bare car (body in white, interior trim, running gear, fluids excluded). */
export const BARE_MASS = 1180 - Object.values(PARTS).reduce((s, p) => s + p.mass, 0);

export const TANK = { fuel: 50, oil: 3.6, coolant: 5.5 };
