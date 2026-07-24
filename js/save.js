// Persistent state: everything here survives death, reload and every future run.
import { mulberry32 } from './util.js';
import { SURFACE_Y, STATION_X, WORLD_W } from './tiles.js';

export const SAVE_KEY = 'depthminer.save.v1';

const NAMES = ['Bex Harrow', 'Ilse Vantt', 'Old Mun', 'Corrin Ash', 'Dree Sallow', 'Marl Quint',
  'Tessaly Bore', 'Hobb Kerrick', 'Yun Aster', 'Petra Glim', 'Sig Underhalt', 'Wren Coalfoot',
  'Duvo Thane', 'Anje Merrow', 'Kest Pallid', 'Rho Vandermeer', 'Little Otto', 'Sabina Drift'];

const EPITAPHS = [
  'Lamp went out four metres from the ladder they built themselves.',
  'Left a note: "the humming is not the machines".',
  'Found curled around a full ore satchel. Would not let go.',
  'Their platforms are still up there. Still holding.',
  'Ran out of air arguing with something that answered.',
  'Cut a shaft straight down. Did not check what was under it.',
  'Went back for a friend. Neither came up.',
  'Marked the walls every ten metres. The marks stop here.',
  'Traded a lung for one more descent. Got the descent.',
  'The rock above them was mined from the wrong side.',
  'Sat down to rest in a place with no floor.',
  'Kept digging after the gravity turned. Kept digging.',
  'Last entry in their log is a single tally mark.',
  'Wore the good boots down here. Wanted to look right.',
];

const GEAR = ['a cracked lamp housing', 'a bent shortpick', 'an empty air canister',
  'a coil of rope, rotted', 'a tin of lamp oil, half full', 'a child\'s drawing, laminated',
  'a rusted claim marker', 'a spare boot', 'a bundle of unlit torches', 'a folded, illegible map'];

export function newSave(seed) {
  return {
    v: 1,
    seed: seed >>> 0,
    edits: {},
    outposts: [],
    remains: [],
    ancientsSeeded: false,
    credits: 0,
    upgrades: { lamp: 1, efficiency: 1, pick: 1, tank: 1, armor: 1 },
    stats: { runs: 0, deaths: 0, deepest: 0, playMs: 0, mined: 0, recovered: 0 },
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.v !== 1) return null;
    // Defensive defaults in case an older/partial save shows up.
    s.edits = s.edits || {};
    s.outposts = s.outposts || [];
    s.remains = s.remains || [];
    s.upgrades = Object.assign({ lamp: 1, efficiency: 1, pick: 1, tank: 1, armor: 1 }, s.upgrades);
    s.stats = Object.assign({ runs: 0, deaths: 0, deepest: 0, playMs: 0, mined: 0, recovered: 0 }, s.stats);
    return s;
  } catch (e) {
    console.warn('save load failed', e);
    return null;
  }
}

export function writeSave(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch (e) {
    console.warn('save write failed', e);
    return false;
  }
}

export function wipeSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}

// The miners who came down before you. Seeded once per world, then persisted.
export function seedAncients(world, save) {
  if (save.ancientsSeeded) return;
  const rnd = mulberry32(save.seed ^ 0x9e3779b9);
  const count = 22;
  for (let i = 0; i < count; i++) {
    const depth = Math.floor(18 + Math.pow(rnd(), 1.35) * 600);
    const x = Math.floor(12 + rnd() * (WORLD_W - 24));
    const spot = world.findFloor(x, SURFACE_Y + depth, 70);
    if (!spot) continue;
    const loot = {};
    const tier = Math.min(7, Math.floor(depth / 90));
    const pool = ['stone', 'copper', 'iron', 'glimmer', 'amber', 'ember', 'voidglass'];
    const picks = 1 + Math.floor(rnd() * 2);
    for (let p = 0; p < picks; p++) {
      const k = pool[Math.max(0, Math.min(pool.length - 1, tier - Math.floor(rnd() * 2)))];
      loot[k] = (loot[k] || 0) + 1 + Math.floor(rnd() * 4);
    }
    save.remains.push({
      id: 'anc' + i,
      x: spot.x, y: spot.y,
      depth: spot.y - SURFACE_Y,
      loot,
      mine: false,
      name: NAMES[Math.floor(rnd() * NAMES.length)],
      epitaph: EPITAPHS[Math.floor(rnd() * EPITAPHS.length)],
      gear: GEAR[Math.floor(rnd() * GEAR.length)],
    });
  }
  save.ancientsSeeded = true;
}

export function stationSpawn() {
  return { x: STATION_X, y: SURFACE_Y - 1 };
}
