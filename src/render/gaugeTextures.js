import * as THREE from 'three';

/**
 * Instrument textures drawn on canvas: gauge faces (with emissive twins for night lighting),
 * the radio display and control labels. Gauge geometry is shared with the needle logic via
 * GAUGES (sweep angles and ranges).
 */

/** Angles are canvas angles (clockwise from +x, y down): dials run from 7:30 over the top to 4:30. */
export const GAUGES = {
  speed: { max: 220, start: (135 * Math.PI) / 180, sweep: (270 * Math.PI) / 180, major: 20, minor: 10, cx: 754, cy: 200, r: 180 },
  rpm: { max: 8, start: (135 * Math.PI) / 180, sweep: (270 * Math.PI) / 180, major: 1, minor: 0.5, red: 6.5, cx: 270, cy: 200, r: 180 },
  fuel: { start: (210 * Math.PI) / 180, sweep: (120 * Math.PI) / 180, cx: 512, cy: 120, r: 62 },
  temp: { start: (210 * Math.PI) / 180, sweep: (120 * Math.PI) / 180, cx: 512, cy: 285, r: 62 },
};
export const CLUSTER_PX = { w: 1024, h: 400 };

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Angle (radians, canvas convention, clockwise from +x) for a gauge value. */
export function gaugeAngle(g, frac) {
  return g.start + g.sweep * Math.min(Math.max(frac, 0), 1.02);
}

function dial(g, cx, cy, r, spec, labels, { color, accent }) {
  const { max, major, minor } = spec;
  g.lineCap = 'round';
  for (let v = 0; v <= max + 1e-6; v += minor) {
    const a = gaugeAngle(spec, v / max);
    const isMajor = Math.abs(v / major - Math.round(v / major)) < 1e-6;
    const r0 = r * (isMajor ? 0.8 : 0.87);
    const red = spec.red && v >= spec.red;
    g.strokeStyle = red ? accent : color;
    g.lineWidth = isMajor ? r * 0.035 : r * 0.018;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    g.lineTo(cx + Math.cos(a) * r * 0.94, cy + Math.sin(a) * r * 0.94);
    g.stroke();
    if (isMajor && labels) {
      g.fillStyle = red ? accent : color;
      g.font = `600 ${Math.round(r * 0.14)}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(Math.round(v)), cx + Math.cos(a) * r * 0.64, cy + Math.sin(a) * r * 0.64);
    }
  }
}

/**
 * Cluster face: tachometer left, speedometer right, fuel and temperature inside the dials.
 * Returns { map, emissive } textures (emissive = lit markings only).
 */
export function clusterTextures() {
  const make = (lit) => {
    const W = 1024;
    const H = 400;
    const c = canvas(W, H);
    const g = c.getContext('2d');
    g.fillStyle = lit ? '#000' : '#0b0c0e';
    g.fillRect(0, 0, W, H);
    const color = lit ? '#9fe2ff' : '#e8ecef';
    const accent = lit ? '#ff4a3a' : '#e0412f';
    for (const [cx, spec, title] of [
      [270, GAUGES.rpm, 'x1000 r/min'],
      [754, GAUGES.speed, 'km/h'],
    ]) {
      if (!lit) {
        const grad = g.createRadialGradient(cx, 200, 20, cx, 200, 190);
        grad.addColorStop(0, '#16181c');
        grad.addColorStop(1, '#08090a');
        g.fillStyle = grad;
        g.beginPath();
        g.arc(cx, 200, 190, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#9aa0a6';
        g.lineWidth = 6;
        g.stroke();
      }
      dial(g, cx, 200, 180, spec, true, { color, accent });
      g.fillStyle = color;
      g.font = '500 22px sans-serif';
      g.textAlign = 'center';
      g.fillText(title, cx, 272);
    }
    // fuel and temperature mini gauges in the middle
    g.strokeStyle = color;
    g.lineWidth = 4;
    for (const [cy, spec, lo, hi] of [
      [120, GAUGES.fuel, 'E', 'F'],
      [285, GAUGES.temp, 'C', 'H'],
    ]) {
      g.beginPath();
      g.arc(512, cy, 62, gaugeAngle(spec, 0), gaugeAngle(spec, 1));
      g.stroke();
      g.fillStyle = color;
      g.font = '600 22px sans-serif';
      g.textAlign = 'center';
      const a0 = gaugeAngle(spec, 0);
      const a1 = gaugeAngle(spec, 1);
      g.fillText(lo, 512 + Math.cos(a0) * 82, cy + Math.sin(a0) * 82 + 8);
      g.fillText(hi, 512 + Math.cos(a1) * 82, cy + Math.sin(a1) * 82 + 8);
    }
    // odometer window
    g.fillStyle = lit ? '#0d2a33' : '#101418';
    g.fillRect(690, 300, 128, 36);
    return tex(c);
  };
  return { map: make(false), emissive: make(true) };
}

/** Radio display (monochrome LCD). */
export function radioDisplay(text = 'FM 101.4', sub = 'RADIO') {
  const c = canvas(512, 160);
  const g = c.getContext('2d');
  g.fillStyle = '#041318';
  g.fillRect(0, 0, 512, 160);
  g.fillStyle = '#5fe0ff';
  g.font = '600 64px "DejaVu Sans Mono", monospace';
  g.textAlign = 'center';
  g.fillText(text, 256, 92);
  g.font = '500 28px sans-serif';
  g.fillText(sub, 256, 138);
  return tex(c);
}

/** Small icon/label sheet for buttons and knobs. */
export function controlLabel(text, { w = 128, h = 64, bg = '#15171a', fg = '#d6dade', size = 30 } = {}) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = `600 ${size}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 1);
  return tex(c);
}

/** Speaker grille perforation (alpha-less colour map). */
export function speakerGrille() {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#2a2b2e';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#060606';
  for (let y = 4; y < 128; y += 8) for (let x = (y / 8) % 2 ? 8 : 4; x < 128; x += 8) {
    g.beginPath();
    g.arc(x, y, 2.2, 0, Math.PI * 2);
    g.fill();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
