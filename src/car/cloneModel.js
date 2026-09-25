import { setHinge } from './body/body.js';
import { gaugeAngle } from '../render/gaugeTextures.js';

/**
 * Clones a built car model (geometry shared) and remaps its part/pivot/control tables onto the
 * clone. Paint and lamp materials are swapped for the given material set so every car keeps its
 * own colour and lights.
 */
export function cloneCarModel(model, fromMats, toMats) {
  const root = model.root.clone(true);
  const map = new Map();
  const walk = (a, b) => {
    map.set(a, b);
    for (let i = 0; i < a.children.length; i++) walk(a.children[i], b.children[i]);
  };
  walk(model.root, root);
  const m = (o) => map.get(o);
  const swap = new Map([
    [fromMats.paint, toMats.paint],
    [fromMats.paintShell, toMats.paintShell],
    [fromMats.paintInner, toMats.paintInner],
    ...Object.keys(fromMats.lamps).map((k) => [fromMats.lamps[k], toMats.lamps[k]]),
  ]);
  root.traverse((o) => {
    if (o.isMesh && swap.has(o.material)) o.material = swap.get(o.material);
  });
  const parts = Object.fromEntries(Object.entries(model.parts).map(([k, v]) => [k, m(v)]));
  const pivots = Object.fromEntries(Object.entries(model.pivots).map(([k, v]) => [k, m(v)]));
  for (const p of Object.values(pivots)) p.userData = { hinge: { ...p.userData.hinge } };
  const wheels = Object.fromEntries(Object.entries(model.wheels).map(([k, w]) => [k, { ...w, root: m(w.root), spin: m(w.spin) }]));
  const corners = Object.fromEntries(Object.entries(model.chassis.corners || {}).map(([k, v]) => [k, m(v)]));
  const c = model.controls;
  // dashboard lighting materials are per car, otherwise every clone would light up together
  const own = {};
  for (const key of ['clusterMaterial', 'domeMaterial', 'radioMaterial']) {
    if (!c[key]) continue;
    own[key] = c[key].clone();
    root.traverse((o) => {
      if (o.isMesh && o.material === c[key]) o.material = own[key];
    });
  }
  const controls = {
    ...own,
    needles: Object.fromEntries(
      Object.entries(c.needles || {}).map(([k, n]) => {
        const hub = m(n.object);
        const spec = n.object.userData.spec;
        return [k, { object: hub, set: (frac) => (hub.rotation.z = -gaugeAngle(spec, frac)) }];
      }),
    ),
    steeringWheel: m(c.steeringWheel),
    pedals: Object.fromEntries(Object.entries(c.pedals || {}).map(([k, v]) => [k, m(v)])),
    glovebox: c.glovebox && m(c.glovebox),
    key: c.key && m(c.key),
    radio: c.radio && m(c.radio),
  };
  return {
    root,
    parts,
    pivots,
    wheels,
    chassis: { root: m(model.chassis.root), corners },
    controls,
    setHinge: (id, amount) => pivots[id] && setHinge(pivots[id], amount),
  };
}
