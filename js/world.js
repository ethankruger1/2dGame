// Procedural world: deterministic generation + a sparse map of persisted edits.
import { fbm, hash2, clamp } from './util.js';
import { T, TILES, ZONES, SURFACE_Y, WORLD_W, STATION_X, MAX_DEPTH, zoneAtY } from './tiles.js';

const CACHE_LIMIT = 400000;

export class World {
  constructor(seed, edits) {
    this.seed = seed | 0;
    this.edits = edits || {}; // "x,y" -> tile id, survives every run
    this.cache = new Map();
    this.surf = new Map();
    this.bottomY = SURFACE_Y + MAX_DEPTH;
  }

  key(x, y) { return x + ',' + y; }

  surfaceH(x) {
    const memo = this.surf.get(x);
    if (memo !== undefined) return memo;
    const h = this.calcSurfaceH(x);
    this.surf.set(x, h);
    return h;
  }

  calcSurfaceH(x) {
    const d = Math.abs(x - STATION_X);
    if (d <= 8) return SURFACE_Y;
    const n = fbm(x * 0.055, 0.5, this.seed + 3, 3);
    const rough = Math.round((n - 0.5) * 12);
    const blend = clamp((d - 8) / 10, 0, 1);
    return SURFACE_Y + Math.round(rough * blend);
  }

  getTile(x, y) {
    x |= 0; y |= 0;
    const e = this.edits[this.key(x, y)];
    if (e !== undefined) return e;
    const ck = y * (WORLD_W + 8) + x;
    const c = this.cache.get(ck);
    if (c !== undefined) return c;
    const t = this.genTile(x, y);
    if (this.cache.size > CACHE_LIMIT) this.cache.clear();
    this.cache.set(ck, t);
    return t;
  }

  setTile(x, y, id) {
    this.edits[this.key(x, y)] = id;
  }

  // Reverts a tile to whatever the untouched world had there.
  clearEdit(x, y) { delete this.edits[this.key(x, y)]; }

  isSolid(x, y) { return TILES[this.getTile(x, y)].solid; }

  isOpen(x, y) { return !TILES[this.getTile(x, y)].solid; }

  genTile(x, y) {
    if (x < 0 || x >= WORLD_W) return T.BEDROCK;
    if (y >= this.bottomY) return T.BEDROCK;
    const surf = this.surfaceH(x);
    if (y < surf) {
      if (y === surf - 1 && x === STATION_X) return T.STATION;
      return T.AIR;
    }
    if (y === surf) return T.GRASS;
    if (y < surf + 4) return T.DIRT;

    const depth = y - SURFACE_Y;
    const zone = zoneAtY(y);

    // Cave systems: winding worm tunnels plus open chambers.
    const c = fbm(x * 0.07, y * 0.055, this.seed + 5, 3);
    const c2 = fbm(x * 0.028, y * 0.026, this.seed + 9, 2);
    const wide = 0.042 + depth * 0.00004;
    let open = Math.abs(c - 0.5) < wide || c2 > 0.735;

    // A mined-out starter shaft so the first descent has a mouth.
    if (Math.abs(x - (STATION_X + 4)) <= 1 && y < surf + 14) open = true;

    if (open) {
      // Lava settles in the bottom of chambers rather than filling them.
      if (zone.lava && fbm(x * 0.04, y * 0.045, this.seed + 13, 2) > 0.62
          && (this.solidAt(x, y + 1) || this.solidAt(x, y + 2))) return T.LAVA;
      if (zone.spores) {
        if (hash2(x, y, this.seed + 71) < 0.02) return T.SPORE_VENT;
        if (this.solidAt(x, y + 1) && hash2(x, y, this.seed + 73) < 0.09) return T.GLOWCAP;
      }
      if (hash2(x, y, this.seed + 77) < 0.006) return T.FUEL_CRYSTAL;
      return T.AIR;
    }

    // Ore pockets.
    const o = fbm(x * 0.17, y * 0.17, this.seed + 21, 2);
    if (o > 0.705) {
      const r = hash2(x, y, this.seed + 29);
      let acc = 0;
      for (const [tile, w] of zone.ores) {
        acc += w;
        if (r <= acc) return tile;
      }
    }
    return zone.stone;
  }

  // Solid test that never consults the cave carve of the caller (avoids recursion depth).
  solidAt(x, y) {
    if (x < 0 || x >= WORLD_W || y >= this.bottomY) return true;
    const surf = this.surfaceH(x);
    if (y <= surf) return y === surf;
    const depth = y - SURFACE_Y;
    const c = fbm(x * 0.07, y * 0.055, this.seed + 5, 3);
    const c2 = fbm(x * 0.028, y * 0.026, this.seed + 9, 2);
    const wide = 0.042 + depth * 0.00004;
    return !(Math.abs(c - 0.5) < wide || c2 > 0.735);
  }

  // Finds a standable air tile near (x, y) by walking down a column.
  findFloor(x, y, maxSteps = 80) {
    for (let i = 0; i < maxSteps; i++) {
      const yy = y + i;
      if (yy >= this.bottomY - 2) return null;
      if (this.isOpen(x, yy) && this.isOpen(x, yy - 1) && this.isSolid(x, yy + 1)) return { x, y: yy };
    }
    return null;
  }
}

export { SURFACE_Y, WORLD_W, STATION_X, MAX_DEPTH, ZONES };
