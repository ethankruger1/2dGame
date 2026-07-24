// Relics, contracts, bestiary text and cache loot — the "things to do" layer.
import { RESOURCES, ZONES } from './tiles.js';

export const RELICS = [
  {
    id: 'eye', name: "Prospector's Eye", depth: 40,
    desc: 'Ore seams within 14 m shine faintly through solid rock.',
    flavor: 'A lens of somebody else\'s eye, ground flat and set in brass.',
  },
  {
    id: 'ballast', name: 'Ballast Weight', depth: 70,
    desc: 'Fall damage halved.',
    flavor: 'Heavier than it has any business being. Sits low in the pack.',
  },
  {
    id: 'lantern', name: 'Ghost Lantern', depth: 150,
    desc: '+3 m light radius and the lamp burns 15% slower.',
    flavor: 'The flame inside leans toward whatever you are looking at.',
  },
  {
    id: 'filter', name: 'Spore Filter', depth: 170,
    desc: 'Oxygen drains 30% slower.',
    flavor: 'Cloth, charcoal, and a long habit of not breathing deeply.',
  },
  {
    id: 'satchel', name: 'Deep Satchel', depth: 260,
    desc: 'Creatures and caches give twice the ore.',
    flavor: 'Bottomless in the way that all good satchels claim to be.',
  },
  {
    id: 'cinder', name: 'Cinder Ward', depth: 290,
    desc: 'Heat and magma damage reduced by 60%.',
    flavor: 'Warm to the touch, always, even at the surface.',
  },
  {
    id: 'coil', name: 'Static Coil', depth: 400,
    desc: 'Gravity stutters in the Static Strata no longer reach you.',
    flavor: 'Hums a note that is not quite a note.',
  },
  {
    id: 'anchor', name: 'Void Anchor', depth: 540,
    desc: 'You keep your footing through inversions, and fall slower everywhere.',
    flavor: 'Points down. Not the down you are standing on — a different one.',
  },
];

export const relicById = (id) => RELICS.find((r) => r.id === id);

export const BESTIARY = {
  crawler: {
    name: 'Rock Crawler', where: 'Limestone and magma',
    text: 'Six legs, no eyes worth the name, and an appetite for warmth. Follows lamps.',
  },
  wisp: {
    name: 'Shard Wisp', where: 'Crystal hollows and fungal deep',
    text: 'A cluster of crystal that decided to drift. Cuts on contact, shatters loudly.',
  },
  sporeling: {
    name: 'Sporeling', where: 'Fungal deep and the hollow',
    text: 'Hops. Bursts. The cloud it leaves eats the air out of your lungs.',
  },
  slug: {
    name: 'Ember Slug', where: 'Magma veins and static strata',
    text: 'Slow, heavy, and full of molten rock. Nothing down here hits harder by accident.',
  },
  wraith: {
    name: 'Static Wraith', where: 'Static strata and the hollow',
    text: 'Passes through stone as if it were a rumour. Drinks the light out of your lamp.',
  },
};

// --- contracts -------------------------------------------------------

const ORE_BY_TIER = ['copper', 'iron', 'glimmer', 'amber', 'ember', 'voidglass'];

function pick(rnd, arr) { return arr[Math.floor(rnd() * arr.length)]; }

export function makeContract(rnd, deepest, id) {
  const tier = Math.min(ORE_BY_TIER.length - 1, Math.floor(deepest / 95));
  const kind = pick(rnd, ['haul', 'haul', 'depth', 'kill', 'salvage', 'outpost']);

  if (kind === 'haul') {
    const res = ORE_BY_TIER[Math.max(0, tier - Math.floor(rnd() * 2))];
    const n = 6 + Math.floor(rnd() * 10);
    return {
      id, kind, res, need: n, have: 0,
      reward: Math.round(n * RESOURCES[res].value * 1.6) + 40,
      title: `Haul ${n} ${RESOURCES[res].name.toLowerCase()}`,
      note: 'Deposit it at the station.',
    };
  }
  if (kind === 'depth') {
    const step = Math.max(60, Math.round((deepest + 45 + rnd() * 60) / 10) * 10);
    return {
      id, kind, need: step, have: 0,
      reward: Math.round(step * 1.7) + 60,
      title: `Survey ${step} m`,
      note: 'Reach that depth and come back alive.',
    };
  }
  if (kind === 'kill') {
    const n = 5 + Math.floor(rnd() * 8);
    return {
      id, kind, need: n, have: 0,
      reward: 60 + n * 22 + tier * 30,
      title: `Clear ${n} creatures`,
      note: 'Anything that moves counts.',
    };
  }
  if (kind === 'salvage') {
    const n = 1 + Math.floor(rnd() * 2);
    return {
      id, kind, need: n, have: 0,
      reward: 140 * n + tier * 40,
      title: `Recover ${n} set${n > 1 ? 's' : ''} of remains`,
      note: 'The families ask. Sometimes.',
    };
  }
  const d = ZONES[Math.min(ZONES.length - 1, 1 + Math.floor(rnd() * (1 + tier)))].from;
  return {
    id, kind: 'outpost', need: d, have: 0,
    reward: 220 + d,
    title: `Plant an outpost below ${d} m`,
    note: 'The company wants a foothold down there.',
  };
}

export function contractProgressText(c) {
  if (c.kind === 'depth') return `deepest this contract: ${c.have} / ${c.need} m`;
  if (c.kind === 'outpost') return c.have ? 'planted' : `nothing below ${c.need} m yet`;
  if (c.kind === 'haul') return `${c.have} / ${c.need} delivered`;
  return `${c.have} / ${c.need}`;
}

// --- caches ----------------------------------------------------------

export function cacheLoot(depth, rnd) {
  const tier = Math.min(ORE_BY_TIER.length - 1, Math.floor(depth / 90));
  const loot = {};
  const rolls = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < rolls; i++) {
    const res = ORE_BY_TIER[Math.max(0, tier - Math.floor(rnd() * 2))];
    loot[res] = (loot[res] || 0) + 2 + Math.floor(rnd() * 6);
  }
  return loot;
}

export const CACHE_NOTES = [
  'Somebody stacked this neatly and never came back for it.',
  'The lid is scratched with tally marks. Forty-one of them.',
  'Packed for a longer trip than the one they got.',
  'A child\'s name is written inside the lid.',
  'Still smells faintly of lamp oil and orange peel.',
];
