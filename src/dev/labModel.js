import * as THREE from 'three';
import { buildBody, setHinge } from '../car/body/body.js';
import { buildWheel } from '../car/parts/wheel.js';
import { carMaterials } from '../car/materials.js';
import { CAR, WHEELS } from '../car/design.js';

/**
 * Lab model: the car assembled from its procedural parts, with named groups the critic can
 * toggle and hinged closures it can open.
 */
export function buildLabModel() {
  const root = new THREE.Group();
  const mats = carMaterials(0x7d1a20);
  const body = buildBody(mats);
  const groups = {};
  for (const [id, obj] of Object.entries(body.parts)) {
    const top = body.pivots[id] || obj;
    root.add(top);
    groups[id] = top;
  }
  for (const [id, w] of Object.entries(WHEELS)) {
    const wheel = buildWheel(mats);
    wheel.root.position.set(w.x, CAR.wheelY, w.z);
    if (w.left) wheel.root.rotation.y = Math.PI;
    wheel.root.name = `wheel_${id}`;
    root.add(wheel.root);
    groups[`wheel_${id}`] = wheel.root;
  }
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = o.castShadow && !o.userData.glass;
    }
  });

  function setState(state) {
    const open = new Set(String(state || '').split(',').filter(Boolean));
    const all = open.has('all');
    for (const [id, pivot] of Object.entries(body.pivots)) {
      let amount = 0;
      if ((all || open.has('hood')) && id === 'hood') amount = 1;
      if ((all || open.has('trunk')) && id === 'trunk') amount = 1;
      if ((all || open.has('doors')) && id.includes('Door_')) amount = 1;
      if ((all || open.has('fuel')) && id === 'fuelDoor') amount = 1;
      setHinge(pivot, amount);
    }
  }

  function showOnly(list) {
    const want = new Set(list);
    for (const [id, g] of Object.entries(groups)) g.visible = [...want].some((w) => id === w || id.startsWith(w));
  }

  return {
    root,
    groups,
    setState,
    showOnly,
    showAll: () => Object.values(groups).forEach((g) => (g.visible = true)),
    stats: () => body.stats,
  };
}
