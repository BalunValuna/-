import { Noise } from '../core/noise.js';
import { clamp, lerp, smoothstep } from '../core/math.js';

/**
 * Deterministic world shape: the highway path and the desert height field around it. All inputs
 * are absolute world coordinates (metres); the journey runs along +Z.
 */
export const ROAD = {
  laneWidth: 3.5,
  lanes: 2,
  shoulder: 1.4,
  get halfWidth() {
    return (this.laneWidth * this.lanes) / 2;
  },
  get totalHalf() {
    return this.halfWidth + this.shoulder;
  },
};

export const SURFACE = { SAND: 0, ASPHALT: 1, GRAVEL: 2, ROCK: 3, DIRT: 4, WOOD: 5, TILE: 6, CONCRETE: 7 };

/** Tyre grip and rolling resistance per surface (dry). */
export const SURFACE_GRIP = {
  [SURFACE.SAND]: { grip: 0.62, roll: 0.06 },
  [SURFACE.ASPHALT]: { grip: 1.0, roll: 0.012 },
  [SURFACE.GRAVEL]: { grip: 0.72, roll: 0.03 },
  [SURFACE.ROCK]: { grip: 0.8, roll: 0.02 },
  [SURFACE.DIRT]: { grip: 0.7, roll: 0.035 },
  [SURFACE.CONCRETE]: { grip: 0.95, roll: 0.014 },
};

export class WorldGen {
  constructor(seed) {
    this.seed = seed;
    this.n = new Noise(seed);
    this.n2 = new Noise(seed * 7 + 13);
    this.n3 = new Noise(seed * 13 + 101);
  }

  /** Lateral position of the road centre line at distance z. */
  roadX(z) {
    const n = this.n2;
    return (
      n.noise2(z * 0.00045, 11.3) * 180 +
      n.noise2(z * 0.0013, 3.7) * 45 +
      n.noise2(z * 0.004, 7.9) * 6 * smoothstep(0.2, 0.8, n.noise2(z * 0.0002, 1.1) * 0.5 + 0.5)
    );
  }

  roadDX(z) {
    return (this.roadX(z + 0.5) - this.roadX(z - 0.5)) / 1.0;
  }

  /** Heading (yaw) of the road at z: angle from +Z towards +X. */
  roadHeading(z) {
    return Math.atan2(this.roadDX(z), 1);
  }

  /** Base terrain before the road is cut in. */
  rawHeight(x, z) {
    const n = this.n;
    // wide rolling plains
    let h = n.fbm2(x * 0.0012, z * 0.0012, 4) * 26;
    h += n.fbm2(x * 0.006, z * 0.006, 3) * 4;
    // dune fields: elongated ridges, stronger away from the road
    const duneMask = smoothstep(0.1, 0.55, n.noise2(x * 0.0009 + 40, z * 0.0009 - 12) * 0.5 + 0.5);
    const dx = x * 0.012 + n.noise2(x * 0.004, z * 0.004) * 1.5;
    const dz = z * 0.004;
    h += n.ridged2(dx, dz, 3) * 9 * duneMask;
    // small ripples
    h += n.noise2(x * 0.08, z * 0.08) * 0.18;
    // distant buttes/mesas: flat topped rises far from the highway
    const m = n.noise2(x * 0.0022 + 91, z * 0.0022 - 17);
    const mesa = smoothstep(0.62, 0.7, m) * 38;
    h += mesa * smoothstep(120, 260, Math.abs(x - this.roadX(z)));
    return h;
  }

  /** Road surface height along the centre line (smoothed terrain). */
  roadY(z) {
    const x = this.roadX(z);
    let s = 0;
    let w = 0;
    for (let k = -3; k <= 3; k++) {
      const kw = 1 - Math.abs(k) / 4;
      s += this.rawHeight(this.roadX(z + k * 40), z + k * 40) * kw;
      w += kw;
    }
    return s / w + 0.35 + 0 * x;
  }

  /**
   * Final ground height: terrain blended into the road embankment near the highway. Callers
   * that sample many points along one z should use heightAt with a cached road sample.
   */
  height(x, z) {
    const rx = this.roadX(z);
    const d = Math.abs(x - rx);
    const raw = this.rawHeight(x, z);
    if (d > 30) return raw;
    const ry = this.roadY(z);
    const flat = d < ROAD.totalHalf + 0.5 ? 1 : 1 - smoothstep(ROAD.totalHalf + 0.5, 30, d);
    // slight crown/camber: shoulders a little lower than the centre
    const crown = -clamp(d / ROAD.totalHalf, 0, 1) ** 2 * 0.08;
    const ditch = d > ROAD.totalHalf && d < 12 ? -Math.sin(((d - ROAD.totalHalf) / (12 - ROAD.totalHalf)) * Math.PI) * 0.45 : 0;
    return lerp(raw, ry + crown, flat) + ditch * (1 - flat * 0.3);
  }

  /** Distance from the road centre and the surface type at (x, z). */
  surface(x, z) {
    const d = Math.abs(x - this.roadX(z));
    if (d < ROAD.halfWidth) return SURFACE.ASPHALT;
    if (d < ROAD.totalHalf) return SURFACE.GRAVEL;
    const rocky = this.n3.noise2(x * 0.01, z * 0.01);
    return rocky > 0.55 ? SURFACE.ROCK : rocky < -0.5 ? SURFACE.DIRT : SURFACE.SAND;
  }

  /** Kilometre marker for a z coordinate (journey distance). */
  km(z) {
    return z / 1000;
  }
}
