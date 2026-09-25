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

/** Distance from the road centre over which the terrain blends into the road embankment. */
const ROAD_BLEND = 40;

export class WorldGen {
  constructor(seed) {
    this.seed = seed;
    this.n = new Noise(seed);
    this.n2 = new Noise(seed * 7 + 13);
    this.n3 = new Noise(seed * 13 + 101);
    this.roadCache = new Map();
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

  /** Base terrain before the road is cut in. `rx` = road centre x at this z (if known). */
  rawHeight(x, z, rx = this.roadX(z)) {
    const n = this.n;
    const d = Math.abs(x - rx);
    // wide rolling plains
    let h = n.fbm2(x * 0.0012, z * 0.0012, 4) * 26;
    h += n.fbm2(x * 0.006, z * 0.006, 3) * 4;
    // dune fields: elongated ridges; the highway corridor was graded, so they build up only
    // some way off the road (a car that leaves the road meets sand, not a ramp)
    const duneMask = smoothstep(0.1, 0.55, n.noise2(x * 0.0009 + 40, z * 0.0009 - 12) * 0.5 + 0.5);
    const corridor = 0.2 + 0.8 * smoothstep(25, 95, d);
    const dx = x * 0.012 + n.noise2(x * 0.004, z * 0.004) * 1.5;
    const dz = z * 0.004;
    h += n.ridged2(dx, dz, 3) * 9 * duneMask * corridor;
    // small ripples
    h += n.noise2(x * 0.08, z * 0.08) * 0.18;
    // distant buttes/mesas: flat topped rises far from the highway
    const m = n.noise2(x * 0.0022 + 91, z * 0.0022 - 17);
    const mesa = smoothstep(0.62, 0.7, m) * 38;
    h += mesa * smoothstep(120, 260, d);
    return h;
  }

  /** Large-scale terrain only (no dunes or ripples): what the road embankment is graded to. */
  lowHeight(x, z) {
    const n = this.n;
    return n.fbm2(x * 0.0012, z * 0.0012, 4) * 26 + n.fbm2(x * 0.006, z * 0.006, 2) * 2.5;
  }

  /**
   * Road surface height along the centre line: the low-frequency terrain under the road, low-pass
   * filtered along z so the highway rolls gently instead of copying dune detail.
   */
  roadY(z) {
    const key = Math.round(z * 2);
    const hit = this.roadCache.get(key);
    if (hit !== undefined) return hit;
    let s = 0;
    let w = 0;
    for (let k = -5; k <= 5; k++) {
      const kw = 1 - Math.abs(k) / 6;
      const zz = key / 2 + k * 30;
      s += this.lowHeight(this.roadX(zz), zz) * kw;
      w += kw;
    }
    // the embankment flattens the land's swell: gentler grades, cuts and fills at the sides
    const y = (s / w) * 0.72 + 0.35;
    if (this.roadCache.size > 8192) this.roadCache.clear();
    this.roadCache.set(key, y);
    return y;
  }

  /**
   * Final ground height: terrain blended into the road embankment near the highway. Callers
   * that sample many points along one z should use heightAt with a cached road sample.
   */
  height(x, z) {
    const h = this.baseHeight(x, z);
    const pad = this.padAt?.(x, z);
    return pad ? lerp(h, pad.h, pad.w) : h;
  }

  /** Terrain with the road embankment; `rx`/`ry` may be passed when sampling a whole row. */
  baseHeight(x, z, rx = this.roadX(z), ry = null) {
    const d = Math.abs(x - rx);
    const raw = this.rawHeight(x, z, rx);
    if (d > ROAD_BLEND) return raw;
    const flat = d < ROAD.totalHalf + 0.5 ? 1 : 1 - smoothstep(ROAD.totalHalf + 0.5, ROAD_BLEND, d);
    // slight crown/camber: shoulders a little lower than the centre
    const crown = -(clamp(d / ROAD.totalHalf, 0, 1) ** 2) * 0.08;
    // a shallow drainage swale, no deeper than a tyre can roll through: a steep V-ditch launched
    // cars that left the road at speed
    const swale = d > ROAD.totalHalf + 1 && d < 16 ? -Math.sin(((d - ROAD.totalHalf - 1) / (15 - ROAD.totalHalf)) * Math.PI) * 0.16 : 0;
    return lerp(raw, (ry ?? this.roadY(z)) + crown, flat) + swale;
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
