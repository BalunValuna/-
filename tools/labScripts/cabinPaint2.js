const out = {};
for (const v of ['driver', 'driverBack', 'rearSeat']) {
  lab.setView(v);
  const look = lab.snap();
  const p = lab.paintSources(5);
  out[v] = { look, paint: p.image, pct: p.pct, top: p.top };
}
return out;
