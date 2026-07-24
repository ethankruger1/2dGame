// Tile table, resource values and the biome (zone) table.
import { rgb } from './util.js';

export const T = {
  AIR: 0,
  BEDROCK: 1,
  DIRT: 2,
  GRASS: 3,
  STONE: 4,
  CRYSTAL_STONE: 5,
  FUNGAL_STONE: 6,
  MAGMA_STONE: 7,
  STATIC_STONE: 8,
  VOID_STONE: 9,
  ORE_COPPER: 10,
  ORE_IRON: 11,
  ORE_GLIMMER: 12,
  ORE_AMBER: 13,
  ORE_EMBER: 14,
  ORE_VOIDGLASS: 15,
  FUEL_CRYSTAL: 16,
  GLOWCAP: 17,
  LAVA: 18,
  SPORE_VENT: 19,
  PLATFORM: 20,
  LADDER: 21,
  TORCH: 22,
  OUTPOST: 23,
  STATION: 24,
  CHEST: 25,
  BEAM: 26,
  RUBBLE: 27,
  CRYSTAL_CLUSTER: 28,
  MUSHROOM: 29,
  EMBER_VENT: 30,
  RELIC_PEDESTAL: 31,
};

// solid: blocks movement. hard: seconds to mine with a level-1 pick.
// glow: light radius in tiles. lc: light colour. hazard: damage per second.
export const TILES = [];
function def(id, o) {
  TILES[id] = Object.assign({
    id, solid: true, hard: 0.5, glow: 0, lc: [1, 0.92, 0.78], hazard: 0,
    drop: null, climb: false, name: '?', tex: 'rock',
  }, o);
}

def(T.AIR, { name: 'Air', solid: false, hard: 0, tex: null });
def(T.BEDROCK, { name: 'Bedrock', hard: Infinity, color: rgb(26, 26, 32), tex: 'hard' });
def(T.DIRT, { name: 'Dirt', hard: 0.22, color: rgb(96, 70, 46), drop: ['dirt', 1], tex: 'soil' });
def(T.GRASS, { name: 'Turf', hard: 0.25, color: rgb(78, 110, 56), drop: ['dirt', 1], tex: 'soil' });
def(T.STONE, { name: 'Limestone', hard: 0.55, color: rgb(108, 108, 118), drop: ['stone', 1] });
def(T.CRYSTAL_STONE, { name: 'Crystal Rock', hard: 0.8, color: rgb(86, 96, 138), drop: ['stone', 1] });
def(T.FUNGAL_STONE, { name: 'Mycelite', hard: 0.95, color: rgb(80, 100, 86), drop: ['stone', 1] });
def(T.MAGMA_STONE, { name: 'Basalt', hard: 1.25, color: rgb(76, 54, 52), drop: ['stone', 1] });
def(T.STATIC_STONE, { name: 'Staticrock', hard: 1.6, color: rgb(68, 64, 88), drop: ['stone', 1] });
def(T.VOID_STONE, { name: 'Voidrock', hard: 2.1, color: rgb(46, 42, 62), drop: ['stone', 1] });

def(T.ORE_COPPER, { name: 'Copper Seam', hard: 0.75, color: rgb(178, 108, 62), drop: ['copper', 1], tex: 'ore' });
def(T.ORE_IRON, { name: 'Iron Seam', hard: 1.0, color: rgb(162, 150, 142), drop: ['iron', 1], tex: 'ore' });
def(T.ORE_GLIMMER, {
  name: 'Glimmer Vein', hard: 1.2, color: rgb(120, 200, 232), glow: 2.2,
  lc: [0.5, 0.85, 1], drop: ['glimmer', 1], tex: 'ore',
});
def(T.ORE_AMBER, {
  name: 'Amberspore', hard: 1.4, color: rgb(216, 160, 64), glow: 2,
  lc: [1, 0.78, 0.35], drop: ['amber', 1], tex: 'ore',
});
def(T.ORE_EMBER, {
  name: 'Emberite', hard: 1.7, color: rgb(228, 98, 54), glow: 2.2,
  lc: [1, 0.5, 0.28], drop: ['ember', 1], tex: 'ore',
});
def(T.ORE_VOIDGLASS, {
  name: 'Voidglass', hard: 2.3, color: rgb(160, 110, 228), glow: 2.4,
  lc: [0.72, 0.45, 1], drop: ['voidglass', 1], tex: 'ore',
});

def(T.FUEL_CRYSTAL, {
  name: 'Lumen Crystal', hard: 0.6, color: rgb(242, 228, 132), glow: 5.5,
  lc: [1, 0.96, 0.6], drop: ['fuel', 1], tex: 'crystal',
});
def(T.GLOWCAP, {
  name: 'Glowcap', hard: 0.2, solid: false, color: rgb(126, 232, 168), glow: 4.5,
  lc: [0.5, 1, 0.7], drop: ['dirt', 1], tex: 'cap',
});
def(T.LAVA, {
  name: 'Magma', solid: false, hard: Infinity, color: rgb(228, 92, 30), glow: 6.5,
  lc: [1, 0.45, 0.18], hazard: 34, tex: 'lava',
});
def(T.SPORE_VENT, {
  name: 'Spore Vent', solid: false, hard: 0.4, color: rgb(152, 112, 192), glow: 2.4,
  lc: [0.75, 0.5, 1], hazard: 6, tex: 'cap',
});
def(T.CRYSTAL_CLUSTER, {
  name: 'Crystal Cluster', solid: false, hard: 0.5, color: rgb(140, 214, 240), glow: 3.4,
  lc: [0.55, 0.9, 1], drop: ['glimmer', 1], tex: 'crystal',
});
def(T.MUSHROOM, {
  name: 'Cave Bloom', solid: false, hard: 0.15, color: rgb(198, 118, 150), glow: 1.8,
  lc: [1, 0.6, 0.8], drop: ['dirt', 1], tex: 'cap',
});
def(T.EMBER_VENT, {
  name: 'Ember Vent', solid: false, hard: Infinity, color: rgb(226, 120, 50), glow: 3.6,
  lc: [1, 0.55, 0.25], hazard: 9, tex: 'lava',
});

def(T.PLATFORM, { name: 'Platform', hard: 0.12, color: rgb(152, 124, 86), built: true, tex: 'plank' });
def(T.LADDER, { name: 'Ladder', solid: false, climb: true, hard: 0.12, color: rgb(178, 142, 94), built: true, tex: null });
def(T.TORCH, {
  name: 'Torch', solid: false, hard: 0.1, color: rgb(255, 198, 92), glow: 8,
  lc: [1, 0.78, 0.42], built: true, tex: null,
});
def(T.OUTPOST, {
  name: 'Outpost Core', hard: Infinity, color: rgb(96, 214, 190), glow: 10,
  lc: [0.5, 1, 0.9], built: true, tex: null,
});
def(T.STATION, {
  name: 'Surface Station', hard: Infinity, color: rgb(120, 190, 240), glow: 9,
  lc: [0.7, 0.88, 1], tex: null,
});
def(T.CHEST, {
  name: 'Supply Cache', hard: Infinity, color: rgb(150, 112, 66), glow: 2.6,
  lc: [1, 0.85, 0.5], tex: null,
});
def(T.RELIC_PEDESTAL, {
  name: 'Pedestal', hard: Infinity, color: rgb(126, 122, 158), glow: 4,
  lc: [0.8, 0.7, 1], tex: null,
});
def(T.BEAM, { name: 'Pit Prop', hard: 0.3, color: rgb(120, 88, 54), drop: ['stone', 1], tex: 'plank' });
def(T.RUBBLE, { name: 'Rubble', hard: 0.3, color: rgb(96, 88, 82), drop: ['stone', 1], tex: 'soil' });

export const RESOURCES = {
  dirt: { name: 'Dirt', value: 0, color: '#5e442c' },
  stone: { name: 'Stone', value: 1, color: '#686870' },
  copper: { name: 'Copper', value: 5, color: '#b26c3e' },
  iron: { name: 'Iron', value: 12, color: '#9e928a' },
  glimmer: { name: 'Glimmer', value: 30, color: '#78c8e8' },
  amber: { name: 'Amberspore', value: 65, color: '#d69e3e' },
  ember: { name: 'Emberite', value: 130, color: '#e26034' },
  voidglass: { name: 'Voidglass', value: 280, color: '#9e6ce2' },
};

export const SURFACE_Y = 14;
export const WORLD_W = 200;
export const STATION_X = 100;
export const MAX_DEPTH = 660; // metres below the surface

// Each zone owns its physics, palette, ores, creatures and backdrop.
export const ZONES = [
  {
    name: 'Limestone Hollows', short: 'LIMESTONE', from: 0, to: 60,
    stone: T.STONE, gravity: 1, jump: 1, drag: 0.0,
    ambient: 0.15, ambientColor: [0.62, 0.68, 0.85],
    tint: null, fuelDrain: 1, oxygen: false,
    ores: [[T.ORE_COPPER, 0.62], [T.ORE_IRON, 0.3], [T.FUEL_CRYSTAL, 0.08]],
    mobs: ['crawler'], density: 0.55,
    decor: null, motes: { color: '#c8d4e8', rate: 0.5, drift: 0.2 },
    parallax: { shape: 'columns', color: [30, 33, 44], color2: [22, 25, 34] },
    quirk: 'Ordinary rock. Ordinary gravity. Enjoy it.',
    lore: 'Company rock. Surveyed, mapped, mined out twice over.',
  },
  {
    name: 'Crystal Hollows', short: 'CRYSTAL', from: 60, to: 145,
    stone: T.CRYSTAL_STONE, gravity: 0.86, jump: 1.06, drag: 0.0,
    ambient: 0.09, ambientColor: [0.45, 0.62, 1],
    tint: 'rgba(60,90,170,0.10)', fuelDrain: 1.15, oxygen: false, bounce: true,
    ores: [[T.ORE_COPPER, 0.24], [T.ORE_IRON, 0.34], [T.ORE_GLIMMER, 0.32], [T.FUEL_CRYSTAL, 0.1]],
    mobs: ['wisp', 'crawler'], density: 0.8,
    decor: T.CRYSTAL_CLUSTER, motes: { color: '#9fdcf5', rate: 1.4, drift: 0.5 },
    parallax: { shape: 'shards', color: [32, 44, 74], color2: [22, 30, 52] },
    quirk: 'The rock is springy. You land, and it hands you back.',
    lore: 'Every surface answers your lamp with a second, colder light.',
  },
  {
    name: 'Fungal Deep', short: 'FUNGAL', from: 145, to: 250,
    stone: T.FUNGAL_STONE, gravity: 0.42, jump: 1.28, drag: 0.9,
    ambient: 0.07, ambientColor: [0.5, 0.8, 0.6],
    tint: 'rgba(70,150,90,0.10)', fuelDrain: 1.3, oxygen: true, o2Drain: 0.9, spores: true,
    ores: [[T.ORE_IRON, 0.3], [T.ORE_GLIMMER, 0.28], [T.ORE_AMBER, 0.32], [T.FUEL_CRYSTAL, 0.1]],
    mobs: ['sporeling', 'wisp'], density: 1.0,
    decor: T.MUSHROOM, motes: { color: '#b6f0c8', rate: 2.4, drift: 0.9, rise: true },
    parallax: { shape: 'fungus', color: [26, 44, 36], color2: [18, 32, 26] },
    quirk: 'Spore-thick air: you fall slowly, and you breathe worse.',
    lore: 'The air is a soup of living dust. It gets into the lamp glass.',
  },
  {
    name: 'Magma Veins', short: 'MAGMA', from: 250, to: 380,
    stone: T.MAGMA_STONE, gravity: 1.35, jump: 0.94, drag: 0.0,
    ambient: 0.06, ambientColor: [1, 0.5, 0.3],
    tint: 'rgba(190,70,25,0.12)', fuelDrain: 2.0, oxygen: true, o2Drain: 1.25, lava: true, heat: true,
    ores: [[T.ORE_IRON, 0.22], [T.ORE_AMBER, 0.26], [T.ORE_EMBER, 0.42], [T.FUEL_CRYSTAL, 0.1]],
    mobs: ['slug', 'crawler'], density: 1.1,
    decor: T.EMBER_VENT, motes: { color: '#ffa257', rate: 2.6, drift: 0.6, rise: true },
    parallax: { shape: 'columns', color: [50, 26, 24], color2: [34, 18, 18] },
    quirk: 'Heavy, hot, and hungry for lamp oil.',
    lore: 'Heat comes up through the boots first. Then everything else.',
  },
  {
    name: 'Static Strata', short: 'STATIC', from: 380, to: 520,
    stone: T.STATIC_STONE, gravity: 1, jump: 1.05, drag: 0.2,
    ambient: 0.045, ambientColor: [0.62, 0.58, 1],
    tint: 'rgba(120,110,200,0.12)', fuelDrain: 2.4, oxygen: true, o2Drain: 1.6, flicker: true,
    ores: [[T.ORE_AMBER, 0.2], [T.ORE_EMBER, 0.4], [T.ORE_VOIDGLASS, 0.3], [T.FUEL_CRYSTAL, 0.1]],
    mobs: ['wraith', 'slug'], density: 1.15,
    decor: null, motes: { color: '#cfc4ff', rate: 1.8, drift: 1.6 },
    parallax: { shape: 'shards', color: [34, 30, 54], color2: [24, 22, 40] },
    quirk: 'Gravity stutters here, like a signal losing its carrier.',
    lore: 'Instruments disagree with each other, then with themselves.',
  },
  {
    name: 'The Hollow Below', short: 'HOLLOW', from: 520, to: MAX_DEPTH + 1,
    stone: T.VOID_STONE, gravity: 0.3, jump: 1.15, drag: 0.5,
    ambient: 0.025, ambientColor: [0.6, 0.42, 1],
    tint: 'rgba(90,50,160,0.16)', fuelDrain: 3.0, oxygen: true, o2Drain: 2.0, invert: true,
    ores: [[T.ORE_EMBER, 0.3], [T.ORE_VOIDGLASS, 0.58], [T.FUEL_CRYSTAL, 0.12]],
    mobs: ['wraith', 'sporeling'], density: 1.25,
    decor: null, motes: { color: '#c39cff', rate: 1.2, drift: 0.4, rise: true },
    parallax: { shape: 'void', color: [26, 20, 40], color2: [16, 12, 26] },
    quirk: 'Down is a suggestion. Sometimes the dark disagrees.',
    lore: 'Nothing down here was cut by a pick. Something else made these.',
  },
];

export function zoneAtDepth(depth) {
  for (let i = ZONES.length - 1; i >= 0; i--) if (depth >= ZONES[i].from) return ZONES[i];
  return ZONES[0];
}

export function zoneAtY(y) {
  return zoneAtDepth(y - SURFACE_Y);
}

export function zoneIndex(zone) {
  return ZONES.indexOf(zone);
}
