// Driver's-eye views: rendered look + body paint seen directly from inside (should be ~0).
const out = {};
for (const v of ['driver', 'driverLeft', 'driverRight', 'driverUp', 'driverBack']) {
  lab.setView(v);
  const look = lab.snap();
  const p = lab.paintSources(6);
  out[v] = { look, paint: p.image, pct: p.pct, top: p.top };
}
return out;
