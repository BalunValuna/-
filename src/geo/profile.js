/**
 * Smooth 1D curve y(x) through control points, evaluated through a dense lookup table.
 * A control point is [x, y] or [x, y, slope]; missing slopes are derived from neighbours
 * (non-uniform Catmull-Rom). With `monotone` the Fritsch–Carlson limiter prevents overshoot.
 */
export class Profile {
  constructor(points, { samples = 1024, monotone = false, extrapolate = 'clamp' } = {}) {
    if (points.length < 2) throw new Error('Profile needs at least two points');
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const n = xs.length;
    const m = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const given = points[i][2];
      if (given !== undefined && given !== null) {
        m[i] = given;
        continue;
      }
      if (i === 0) m[i] = (ys[1] - ys[0]) / (xs[1] - xs[0]);
      else if (i === n - 1) m[i] = (ys[n - 1] - ys[n - 2]) / (xs[n - 1] - xs[n - 2]);
      else {
        const h0 = xs[i] - xs[i - 1];
        const h1 = xs[i + 1] - xs[i];
        const d0 = (ys[i] - ys[i - 1]) / h0;
        const d1 = (ys[i + 1] - ys[i]) / h1;
        if (monotone) {
          m[i] = d0 * d1 <= 0 ? 0 : (3 * (h0 + h1)) / ((2 * h1 + h0) / d0 + (h1 + 2 * h0) / d1);
        } else {
          m[i] = (h1 * d0 + h0 * d1) / (h0 + h1);
        }
      }
    }
    this.xs = xs;
    this.ys = ys;
    this.m = m;
    this.x0 = xs[0];
    this.x1 = xs[n - 1];
    this.extrapolate = extrapolate;
    this.samples = samples;
    this.lut = new Float64Array(samples + 1);
    this.step = (this.x1 - this.x0) / samples;
    for (let i = 0; i <= samples; i++) this.lut[i] = this.exact(this.x0 + i * this.step);
  }

  exact(x) {
    const { xs, ys, m } = this;
    const n = xs.length;
    if (x <= xs[0]) return ys[0] + (this.extrapolate === 'linear' ? m[0] * (x - xs[0]) : 0);
    if (x >= xs[n - 1]) return ys[n - 1] + (this.extrapolate === 'linear' ? m[n - 1] * (x - xs[n - 1]) : 0);
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= x) lo = mid;
      else hi = mid;
    }
    const h = xs[hi] - xs[lo];
    const t = (x - xs[lo]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[lo] +
      (t3 - 2 * t2 + t) * h * m[lo] +
      (-2 * t3 + 3 * t2) * ys[hi] +
      (t3 - t2) * h * m[hi]
    );
  }

  at(x) {
    const f = (x - this.x0) / this.step;
    if (f <= 0) return this.extrapolate === 'linear' ? this.lut[0] + this.m[0] * (x - this.x0) : this.lut[0];
    if (f >= this.samples) {
      const last = this.lut[this.samples];
      return this.extrapolate === 'linear' ? last + this.m[this.m.length - 1] * (x - this.x1) : last;
    }
    const i = f | 0;
    const t = f - i;
    return this.lut[i] + (this.lut[i + 1] - this.lut[i]) * t;
  }

  slope(x, h = 1e-3) {
    return (this.at(x + h) - this.at(x - h)) / (2 * h);
  }
}

/** Convenience: build a profile from a flat list of [x, y(, slope)] rows. */
export const profile = (points, opts) => new Profile(points, opts);
