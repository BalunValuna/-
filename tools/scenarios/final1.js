// Re-verification of late changes: settings layout, ghost slot while carrying, flashlight level.
await frames(10);
game.ui.showSettings('menu');
document.querySelectorAll('.tabs button')[2].click();
await frames(3);
await shotPage('01_settings_controls');
game.ui.showMenu();
await start({ start: 'garage' });
const P = game.player;
const car = game.car;
const face = (eye, at) => {
  const d = at.clone().sub(eye);
  P.teleport(eye.clone().setY(eye.y - 0.7), Math.atan2(-d.x, -d.z));
  P.yaw = Math.atan2(-d.x, -d.z);
  P.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
};
const items = [...game.items.items];
const wheel = items.find((it) => it.kind === 'part' && it.partId === 'wheel_fl') || items.find((it) => it.kind === 'part' && it.partId.startsWith('wheel'));
const hub = car.worldPoint(new THREE.Vector3(-0.74, 0.3, -1.3));
const eye = car.worldPoint(new THREE.Vector3(-2.3, 1.55, -1.1));
face(eye, hub);
await frames(4);
const wp = wheel.body.translation();
game.interaction.beginDrag(wheel, new THREE.Vector3(wp.x, wp.y, wp.z));
game.input.buttons |= 1;
await frames(90);
const tgt = game.interaction.target;
await shot('02_carry_to_hub');
game.input.buttons = 0;
game.interaction.releaseDrag(false);
await setTime(23.2);
const light = items.find((it) => it.def?.tool === 'light');
if (light) { game.interaction.takeInHand(light); game.interaction.toggleFlashlight(); }
face(car.worldPoint(new THREE.Vector3(-3.5, 1.6, 2.5)), car.worldPoint(new THREE.Vector3(0, 0.5, 0)));
await frames(8);
await shot('03_flashlight');
return { target: tgt?.kind, slot: tgt?.slot?.id ?? null, dragging: !!game.interaction.drag };
