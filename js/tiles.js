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
};

// solid: blocks movement. hard: seconds to mine with a level-1 pick.
// glow: light radius in tiles. hazard: damage per second on contact.
export const TILES = [];
function def(id, o) { TILES[id] = Object.assign({ id, solid: true, hard: 0.5, glow: 0, hazard: 0, drop: null, climb: false, name: '?' }, o); }

def(T.AIR, { name: 'Air', solid: false, hard: 0 });
def(T.BEDROCK, { name: 'Bedrock', hard: Infinity, color: rgb(28, 28, 34) });
def(T.DIRT, { name: 'Dirt', hard: 0.22, color: rgb(94, 68, 44), drop: ['dirt', 1] });
def(T.GRASS, { name: 'Turf', hard: 0.25, color: rgb(74, 104, 54), drop: ['dirt', 1] });
def(T.STONE, { name: 'Limestone', hard: 0.55, color: rgb(104, 104, 112), drop: ['stone', 1] });
def(T.CRYSTAL_STONE, { name: 'Crystal Rock', hard: 0.8, color: rgb(84, 92, 132), drop: ['stone', 1] });
def(T.FUNGAL_STONE, { name: 'Mycelite', hard: 0.95, color: rgb(78, 96, 84), drop: ['stone', 1] });
def(T.MAGMA_STONE, { name: 'Basalt', hard: 1.25, color: rgb(74, 52, 50), drop: ['stone', 1] });
def(T.STATIC_STONE, { name: 'Staticrock', hard: 1.6, color: rgb(66, 62, 84), drop: ['stone', 1] });
def(T.VOID_STONE, { name: 'Voidrock', hard: 2.1, color: rgb(44, 40, 60), drop: ['stone', 1] });

def(T.ORE_COPPER, { name: 'Copper Seam', hard: 0.75, color: rgb(178, 108, 62), drop: ['copper', 1] });
def(T.ORE_IRON, { name: 'Iron Seam', hard: 1.0, color: rgb(158, 146, 138), drop: ['iron', 1] });
def(T.ORE_GLIMMER, { name: 'Glimmer Vein', hard: 1.2, color: rgb(120, 200, 232), glow: 1.8, drop: ['glimmer', 1] });
def(T.ORE_AMBER, { name: 'Amberspore', hard: 1.4, color: rgb(214, 158, 62), glow: 1.5, drop: ['amber', 1] });
def(T.ORE_EMBER, { name: 'Emberite', hard: 1.7, color: rgb(226, 96, 52), glow: 1.8, drop: ['ember', 1] });
def(T.ORE_VOIDGLASS, { name: 'Voidglass', hard: 2.3, color: rgb(158, 108, 226), glow: 2, drop: ['voidglass', 1] });

def(T.FUEL_CRYSTAL, { name: 'Lumen Crystal', hard: 0.6, color: rgb(240, 226, 130), glow: 5, drop: ['fuel', 1] });
def(T.GLOWCAP, { name: 'Glowcap', hard: 0.2, solid: false, color: rgb(126, 232, 168), glow: 4.5, drop: ['dirt', 1] });
def(T.LAVA, { name: 'Magma', solid: false, hard: Infinity, color: rgb(228, 92, 30), glow: 6, hazard: 34 });
def(T.SPORE_VENT, { name: 'Spore Vent', solid: false, hard: 0.4, color: rgb(150, 110, 190), glow: 2, hazard: 6 });

def(T.PLATFORM, { name: 'Platform', hard: 0.12, color: rgb(150, 122, 84), built: true });
def(T.LADDER, { name: 'Ladder', solid: false, climb: true, hard: 0.12, color: rgb(176, 140, 92), built: true });
def(T.TORCH, { name: 'Torch', solid: false, hard: 0.1, color: rgb(255, 196, 90), glow: 7.5, built: true });
def(T.OUTPOST, { name: 'Outpost Core', hard: Infinity, color: rgb(96, 214, 190), glow: 9, built: true });
def(T.STATION, { name: 'Surface Station', hard: Infinity, color: rgb(120, 190, 240), glow: 8 });

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

// Each zone owns its physics, palette, ores and creatures.
export const ZONES = [
  {
    name: 'Limestone Hollows', short: 'LIMESTONE', from: 0, to: 60,
    stone: T.STONE, gravity: 1, jump: 1, drag: 0.0, ambient: 0.13,
    tint: 'rgba(30,34,46,0)', fuelDrain: 1, oxygen: false,
    ores: [[T.ORE_COPPER, 0.62], [T.ORE_IRON, 0.3], [T.FUEL_CRYSTAL, 0.08]],
    mobs: ['crawler'], density: 0.55,
    quirk: 'Ordinary rock. Ordinary gravity. Enjoy it.',
  },
  {
    name: 'Crystal Hollows', short: 'CRYSTAL', from: 60, to: 145,
    stone: T.CRYSTAL_STONE, gravity: 0.86, jump: 1.06, drag: 0.0, ambient: 0.075,
    tint: 'rgba(60,90,160,0.10)', fuelDrain: 1.15, oxygen: false, bounce: true,
    ores: [[T.ORE_COPPER, 0.24], [T.ORE_IRON, 0.34], [T.ORE_GLIMMER, 0.32], [T.FUEL_CRYSTAL, 0.1]],
    mobs: ['wisp', 'crawler'], density: 0.8,
    quirk: 'The rock is springy. You land, and it hands you back.',
  },
  {
    name: 'Fungal Deep', short: 'FUNGAL', from: 145, to: 250,
    stone: T.FUNGAL_STONE, gravity: 0.42, jump: 1.28, drag: 0.9, ambient: 0.055,
    tint: 'rgba(70,140,90,0.12)', fuelDrain: 1.3, oxygen: true, o2Drain: 0.9, spores: true,
    ores: [[T.ORE_IRON, 0.3], [T.ORE_GLIMMER, 0.28], [T.ORE_AMBER, 0.32], [T.FUEL_CRYSTAL, 0.1]],
    mobs: ['sporeling', 'wisp'], density: 1.0,
    quirk: 'Spore-thick air: you fall slowly, and you breathe worse.',
  },
  {
    name: 'Magma Veins', short: 'MAGMA', from: 250, to: 380,
    stone: T.MAGMA_STONE, gravity: 1.35, jump: 0.94, drag: 0.0, ambient: 0.035,
    tint: 'rgba(180,60,20,0.12)', fuelDrain: 2.0, oxygen: true, o2Drain: 1.25, lava: true, heat: true,
    ores: [[T.ORE_IRON, 0.22], [T.ORE_AMBER, 0.26], [T.ORE_EMBER, 0.42], [T.FUEL_CRYSTAL, 0.1]],
    mobs: ['slug', 'crawler'], density: 1.1,
    quirk: 'Heavy, hot, and hungry for lamp oil.',
  },
  {
    name: 'Static Strata', short: 'STATIC', from: 380, to: 520,
    stone: T.STATIC_STONE, gravity: 1, jump: 1.05, drag: 0.2, ambient: 0.03,
    tint: 'rgba(120,110,190,0.13)', fuelDrain: 2.4, oxygen: true, o2Drain: 1.6, flicker: true,
    ores: [[T.ORE_AMBER, 0.2], [T.ORE_EMBER, 0.4], [T.ORE_VOIDGLASS, 0.3], [T.FUEL_CRYSTAL, 0.1]],
    mobs: ['wraith', 'slug'], density: 1.15,
    quirk: 'Gravity stutters here, like a signal losing its carrier.',
  },
  {
    name: 'The Hollow Below', short: 'HOLLOW', from: 520, to: MAX_DEPTH + 1,
    stone: T.VOID_STONE, gravity: 0.3, jump: 1.15, drag: 0.5, ambient: 0.018,
    tint: 'rgba(90,50,150,0.18)', fuelDrain: 3.0, oxygen: true, o2Drain: 2.0, invert: true,
    ores: [[T.ORE_EMBER, 0.3], [T.ORE_VOIDGLASS, 0.58], [T.FUEL_CRYSTAL, 0.12]],
    mobs: ['wraith', 'sporeling'], density: 1.25,
    quirk: 'Down is a suggestion. Sometimes the dark disagrees.',
  },
];

export function zoneAtDepth(depth) {
  for (let i = ZONES.length - 1; i >= 0; i--) if (depth >= ZONES[i].from) return ZONES[i];
  return ZONES[0];
}

export function zoneAtY(y) {
  return zoneAtDepth(y - SURFACE_Y);
}
