// World and interaction pass: hover highlight, carrying, ghost slot, house interior, night, creatures.
await start({ start: 'garage' });
const P = game.player;
const eyeLook = (from, to) => {
  const d = to.clone().sub(from);
  P.teleport(from.clone().setY(from.y - 1.6 + 0.9), Math.atan2(-d.x, -d.z));
  P.yaw = Math.atan2(-d.x, -d.z);
  P.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
};
const items = [...game.items.items];
const wheel = items.find((it) => it.kind === 'part' && it.partId.startsWith('wheel'));
const wrench = items.find((it) => it.def?.tool === 'wrench');
const wp = wheel.root.getWorldPosition(new THREE.Vector3());
const car = game.car;
const toCar = car.position.clone().sub(wp).setY(0).normalize();
eyeLook(wp.clone().addScaledVector(toCar, -1.5).setY(wp.y + 1.6), wp);
await frames(6);
await shot('01_hover_wheel');
// carry: grab the wheel and walk it to its hub
game.interaction.beginDrag(wheel, wp.clone());
game.input.buttons |= 1;
const hub = car.worldPoint(new THREE.Vector3(-0.74, 0.3, -1.3));
eyeLook(hub.clone().add(new THREE.Vector3(-1.4, 1.5, 0.9)), hub);
await frames(40);
await shot('02_drag_ghost');
game.input.buttons = 0;
game.interaction.releaseDrag(false);
// wrench in hand looking at the engine bay
game.interaction.takeInHand(wrench);
const bay = car.worldPoint(new THREE.Vector3(0, 0.7, -1.4));
eyeLook(bay.clone().add(new THREE.Vector3(-1.2, 1.2, -1.2)), bay);
await frames(10);
await shot('03_wrench_bay');
// house interior, four directions from the middle of the entrance room
const ent = game.world.home.houseEntrance ?? game.world.home.playerSpot;
const inside = ent.clone();
for (const [i, yaw] of [[4, 0], [5, Math.PI / 2], [6, Math.PI], [7, -Math.PI / 2]]) {
  P.teleport(inside.clone(), yaw);
  P.yaw = yaw;
  P.pitch = -0.12;
  await frames(8);
  await shot(`0${i}_house_${i}`);
}
// night: flashlight in the yard, then creatures up close
await setTime(23.2);
game.interaction.dropHeld(false);
const fl = items.find((it) => it.def?.tool === 'light');
if (fl) { game.interaction.takeInHand(fl); game.interaction.toggleFlashlight(); }
eyeLook(car.position.clone().add(new THREE.Vector3(3.5, 1.6, 3.5)), car.position.clone().add(new THREE.Vector3(0, 0.6, 0)));
await frames(10);
await shot('08_night_flashlight');
const c0 = P.position.clone();
game.creatures.spawn('husk', c0, 6, 7);
game.creatures.spawn('rabbit', c0, 4, 5);
const husk = game.creatures.list.find((c) => c.kind === 'husk');
const rabbit = game.creatures.list.find((c) => c.kind === 'rabbit');
if (husk) {
  husk.state = 'idle';
  const hp = husk.root.position;
  cam([hp.x + 1.6, hp.y + 1.5, hp.z + 1.6], [hp.x, hp.y + 1.1, hp.z]);
  await frames(6);
  await shot('09_husk');
}
await setTime(10);
if (rabbit) {
  const rp = rabbit.root.position;
  cam([rp.x + 0.9, rp.y + 0.45, rp.z + 0.9], [rp.x, rp.y + 0.15, rp.z]);
  await frames(6);
  await shot('10_rabbit');
}
return { wheel: wheel.partId, husk: !!husk, rabbit: !!rabbit, target: game.interaction.target?.kind };
