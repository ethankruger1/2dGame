// Depth Miner — main loop, player, rendering, UI.
import { clamp, lerp, hash2, shade, fmtTime } from './util.js';
import {
  T, TILES, RESOURCES, ZONES, SURFACE_Y, WORLD_W, STATION_X, zoneAtY,
} from './tiles.js';
import { World } from './world.js';
import { loadSave, newSave, writeSave, wipeSave, seedAncients } from './save.js';
import { MOBS, makeMob, updateMob, moveBody, groundedCheck, spawnParticles, updateParticles } from './entities.js';

const TILE = 22;
const REACH = 5.4;
const BUILDS = [
  { tile: T.PLATFORM, name: 'Platform', cost: { stone: 1 } },
  { tile: T.LADDER, name: 'Ladder', cost: { stone: 1 } },
  { tile: T.TORCH, name: 'Torch', cost: { stone: 2 }, fuel: 6 },
  { tile: T.OUTPOST, name: 'Outpost Core', cost: { stone: 30, iron: 12 } },
];
const UPG_BASE = { lamp: 70, efficiency: 90, pick: 110, tank: 95, armor: 130 };
const UPG_MAX = 6;

const DEATH_NOTES = [
  'Lamp still warm when the dark took it.',
  'Three metres from a ladder that was never finished.',
  'Struck the wall twice more before going down.',
  'Ore satchel full. Air empty.',
  'Wrote nothing. There was no time.',
];

const G = {
  canvas: null, ctx: null, W: 0, H: 0, dpr: 1,
  save: null, world: null, player: null,
  mobs: [], particles: [], light: null, lw: 0, lh: 0,
  cam: { x: STATION_X, y: SURFACE_Y },
  keys: {}, mouse: { x: 0, y: 0, left: false, right: false },
  time: 0, gravitySign: 1, gravityMul: 1, zone: ZONES[0], lastZone: null,
  started: false, paused: false, dead: false, panelOpen: null,
  build: 0, msgs: [], shake: 0, alert: '', tripDeepest: 0,
  lastPersist: 0, mineTile: null, mineProg: 0, swing: 0, hitCd: 0, spawnCd: 2,
};

/* ------------------------------------------------------------------ setup */

function init() {
  G.canvas = document.getElementById('game');
  G.ctx = G.canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);

  G.save = loadSave() || newSave((Math.random() * 0xffffffff) >>> 0);
  G.world = new World(G.save.seed, G.save.edits);
  seedAncients(G.world, G.save);
  if (G.save.canisters === undefined) G.save.canisters = 1;
  writeSave(G.save);

  spawnPlayer(true);
  bindInput();
  bindUI();
  refreshTitleStats();
  requestAnimationFrame(loop);
}

function resize() {
  G.dpr = Math.min(2, window.devicePixelRatio || 1);
  G.W = window.innerWidth;
  G.H = window.innerHeight;
  G.canvas.width = Math.floor(G.W * G.dpr);
  G.canvas.height = Math.floor(G.H * G.dpr);
  G.ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
  G.lw = Math.ceil(G.W / TILE) + 4;
  G.lh = Math.ceil(G.H / TILE) + 4;
  G.light = new Float32Array(G.lw * G.lh);
  G.vignette = null;
}

function upg(k) { return G.save.upgrades[k]; }
const lampRadius = () => 5.5 + 1.7 * (upg('lamp') - 1);
const fuelEff = () => 1 - 0.13 * (upg('efficiency') - 1);
const pickSpeed = () => 1 + 0.5 * (upg('pick') - 1);
const pickDamage = () => 12 + 9 * (upg('pick') - 1);
const maxO2 = () => 100 + 45 * (upg('tank') - 1);
const maxHp = () => 100 + 30 * (upg('armor') - 1);
const upgCost = (k) => Math.round(UPG_BASE[k] * Math.pow(1.9, upg(k) - 1));

function respawnPoint() {
  if (G.save.lastSpawn) return G.save.lastSpawn;
  return { x: STATION_X + 2, y: SURFACE_Y - 1 };
}

function spawnPlayer(fresh) {
  const s = respawnPoint();
  G.player = {
    x: s.x + 0.5 - 0.36, y: s.y + 1 - 1.72,
    w: 0.72, h: 1.72, vx: 0, vy: 0,
    onGround: false, ghost: false, facing: 1,
    hp: maxHp(), fuel: 100, o2: maxO2(),
    inv: {}, invuln: 0, climbing: false, coyote: 0,
  };
  G.mobs.length = 0;
  G.tripDeepest = 0;
  G.cam.x = G.player.x; G.cam.y = G.player.y;
  if (fresh) log('The shaft mouth is east of the station. Mine down.', 'good');
}

/* ------------------------------------------------------------------ input */

function bindInput() {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) { G.keys[e.code] = true; return; }
    G.keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.code === 'Escape') togglePause();
    if (e.code === 'KeyH') openHelp();
    if (e.code === 'KeyE') interact();
    if (e.code === 'KeyQ') useCanister();
    if (/^Digit[1-4]$/.test(e.code)) setBuild(+e.code.slice(5) - 1);
  });
  window.addEventListener('keyup', (e) => { G.keys[e.code] = false; });
  window.addEventListener('blur', () => { G.keys = {}; G.mouse.left = G.mouse.right = false; });

  const rect = () => G.canvas.getBoundingClientRect();
  G.canvas.addEventListener('mousemove', (e) => {
    const r = rect();
    G.mouse.x = e.clientX - r.left;
    G.mouse.y = e.clientY - r.top;
  });
  G.canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) G.mouse.left = true;
    if (e.button === 2) { G.mouse.right = true; tryBuild(); }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) { G.mouse.left = false; G.mineTile = null; G.mineProg = 0; }
    if (e.button === 2) G.mouse.right = false;
  });
  G.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('beforeunload', () => persist(true));
}

function bindUI() {
  document.getElementById('btn-start').onclick = () => {
    document.getElementById('title').classList.add('hidden');
    G.started = true;
  };
  document.getElementById('btn-wipe').onclick = () => {
    if (!confirm('Collapse the mine? Every shaft, platform, outpost and set of remains is lost forever.')) return;
    wipeSave();
    location.reload();
  };
  document.getElementById('panel-close').onclick = closePanel;
  document.getElementById('death-btn').onclick = () => {
    document.getElementById('death').classList.add('hidden');
    G.dead = false;
    spawnPlayer(false);
  };
  document.querySelectorAll('#hotbar .slot').forEach((el) => {
    el.onclick = () => setBuild(+el.dataset.slot);
  });
  setBuild(0);
}

function setBuild(i) {
  G.build = clamp(i, 0, BUILDS.length - 1);
  document.querySelectorAll('#hotbar .slot').forEach((el, idx) => {
    el.classList.toggle('active', idx === G.build);
  });
}

/* ------------------------------------------------------------------- loop */

let lastT = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (ts - lastT) / 1000 || 0);
  lastT = ts;
  if (G.started && !G.paused && !G.dead && !G.panelOpen) {
    update(dt);
    G.save.stats.playMs += dt * 1000;
  }
  render();
  updateHUD();
}

function update(dt) {
  G.time += dt;
  const p = G.player;
  const depth = playerDepth();
  G.zone = zoneAtY(p.y + p.h);

  if (G.zone !== G.lastZone) {
    if (G.lastZone) log(`${G.zone.name} — ${G.zone.quirk}`, 'good');
    G.lastZone = G.zone;
  }

  // --- physics quirks per biome
  G.gravityMul = G.zone.gravity;
  G.gravitySign = 1;
  G.alert = '';
  if (G.zone.flicker) G.gravityMul *= 0.55 + 0.75 * (0.5 + 0.5 * Math.sin(G.time * 1.7));
  if (G.zone.invert) {
    const cyc = G.time % 17;
    if (cyc > 13.5) { G.gravitySign = -1; G.alert = 'GRAVITY INVERSION'; }
    else if (cyc > 12.5) G.alert = 'THE DARK IS DISAGREEING…';
  }

  movePlayer(dt);
  resources(dt, depth);
  mineAndFight(dt);
  contacts(dt);
  spawnMobs(dt);

  for (let i = G.mobs.length - 1; i >= 0; i--) {
    const m = G.mobs[i];
    updateMob(m, G, dt);
    const dd = Math.hypot(m.x - p.x, m.y - p.y);
    if (m.dead || dd > 52 || m.y > G.world.bottomY) G.mobs.splice(i, 1);
  }
  updateParticles(G.particles, dt);

  // camera
  const lead = clamp(p.vx * 0.22, -3, 3);
  G.cam.x = lerp(G.cam.x, p.x + p.w / 2 + lead, Math.min(1, dt * 6));
  G.cam.y = lerp(G.cam.y, p.y + p.h / 2, Math.min(1, dt * 6));
  G.cam.x = clamp(G.cam.x, G.W / TILE / 2, WORLD_W - G.W / TILE / 2);
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 2.5);

  if (depth > G.tripDeepest) G.tripDeepest = depth;
  if (depth > G.save.stats.deepest) G.save.stats.deepest = Math.floor(depth);

  if (performance.now() - G.lastPersist > 5000) persist();
}

function playerDepth() {
  return Math.max(0, Math.floor(G.player.y + G.player.h - SURFACE_Y));
}

/* ----------------------------------------------------------- player motion */

function movePlayer(dt) {
  const p = G.player;
  const z = G.zone;
  const left = G.keys.KeyA || G.keys.ArrowLeft;
  const right = G.keys.KeyD || G.keys.ArrowRight;
  const up = G.keys.KeyW || G.keys.ArrowUp || G.keys.Space;
  const down = G.keys.KeyS || G.keys.ArrowDown;

  const accel = p.onGround ? 52 : 26;
  const speed = 7.2;
  if (left) { p.vx -= accel * dt; p.facing = -1; }
  if (right) { p.vx += accel * dt; p.facing = 1; }
  if (!left && !right) p.vx *= Math.pow(p.onGround ? 0.0009 : 0.22, dt);
  p.vx = clamp(p.vx, -speed, speed);

  // ladders
  const cx = Math.floor(p.x + p.w / 2), cy = Math.floor(p.y + p.h / 2);
  p.climbing = G.world.getTile(cx, cy) === T.LADDER || G.world.getTile(cx, Math.floor(p.y + 0.2)) === T.LADDER;

  if (p.climbing) {
    p.vy = (down ? 5.5 : up ? -5.5 : 0);
    if (!up && !down) p.vy = 0;
  } else {
    const g = 30 * G.gravityMul * G.gravitySign;
    p.vy += g * dt;
    const term = z.drag ? 11 - z.drag * 4 : 26;
    p.vy = clamp(p.vy, -26, term);
    if (z.drag) p.vx *= Math.pow(1 - z.drag * 0.25, dt);
  }

  if (p.onGround) p.coyote = 0.12; else p.coyote = Math.max(0, p.coyote - dt);
  if (up && (p.coyote > 0 || p.climbing) && !p.jumpLatch) {
    p.vy = -12.2 * z.jump * G.gravitySign * (G.gravityMul > 0.6 ? 1 : 0.8);
    p.coyote = 0;
    p.jumpLatch = true;
    spawnParticles(G.particles, p.x + p.w / 2, p.y + p.h, 4, '#6b6b78', { life: 0.3, spread: 3 });
  }
  if (!up) p.jumpLatch = false;

  const r = moveBody(G.world, p, p.vx * dt, p.vy * dt);
  p.onGround = G.gravitySign > 0 ? r.ground : r.ceil;
  if (!p.onGround && G.gravitySign > 0 && groundedCheck(G.world, p)) p.onGround = true;

  // crystal biome: the rock hands you back
  if (z.bounce && r.ground && r.impactY > 13) {
    p.vy = -r.impactY * 0.48;
    p.onGround = false;
    spawnParticles(G.particles, p.x + p.w / 2, p.y + p.h, 8, '#8fd8f2', { life: 0.4, spread: 5 });
  } else if (r.ground && r.impactY > 22) {
    const dmg = (r.impactY - 22) * 3.6;
    hurt(dmg, 'the fall');
    G.shake = 0.5;
  }

  p.x = clamp(p.x, 0.05, WORLD_W - p.w - 0.05);
  if (p.invuln > 0) p.invuln -= dt;
}

/* -------------------------------------------------------------- resources */

function resources(dt, depth) {
  const p = G.player;
  const z = G.zone;
  const atSurface = depth < 3;

  if (atSurface) {
    p.fuel = Math.min(100, p.fuel + 30 * dt);
    p.o2 = Math.min(maxO2(), p.o2 + 40 * dt);
    p.hp = Math.min(maxHp(), p.hp + 12 * dt);
  } else {
    p.fuel = Math.max(0, p.fuel - 0.62 * z.fuelDrain * fuelEff() * dt);
    if (z.oxygen) {
      p.o2 = Math.max(0, p.o2 - (z.o2Drain || 1) * dt);
      if (p.o2 <= 0) hurt(9 * dt, 'suffocation', true);
      if (p.o2 < maxO2() * 0.22) G.alert = G.alert || 'OXYGEN LOW';
    } else {
      p.o2 = Math.min(maxO2(), p.o2 + 6 * dt);
    }
    if (p.fuel < 18) G.alert = G.alert || 'LAMP DYING';
  }

  // outpost services
  const op = nearestOutpost(6.5);
  if (op) {
    const lvl = outpostLevel(op);
    p.fuel = Math.min(100, p.fuel + 22 * dt);
    if (lvl >= 2) p.o2 = Math.min(maxO2(), p.o2 + 30 * dt);
    if (lvl >= 3) p.hp = Math.min(maxHp(), p.hp + 7 * dt);
    if (!op.touched) {
      op.touched = true;
      G.save.lastSpawn = { x: op.x, y: op.y };
      log(`Outpost ${outpostName(op)} online — respawn anchored here.`, 'good');
    }
  } else {
    for (const o of G.save.outposts) o.touched = false;
  }

  // hazards from tiles the player is standing in
  const x0 = Math.floor(p.x), x1 = Math.floor(p.x + p.w - 0.001);
  const y0 = Math.floor(p.y), y1 = Math.floor(p.y + p.h - 0.001);
  let hazard = 0;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const t = TILES[G.world.getTile(tx, ty)];
      if (t.hazard) hazard = Math.max(hazard, t.hazard);
    }
  }
  if (hazard) {
    hurt(hazard * dt, 'the burn', true);
    if (z.spores) p.o2 = Math.max(0, p.o2 - 8 * dt);
  }
  if (z.heat && !atSurface && nearLava(p)) hurt(5 * dt, 'the heat', true);

  // remains recovery
  for (let i = G.save.remains.length - 1; i >= 0; i--) {
    const r = G.save.remains[i];
    if (Math.abs(r.x + 0.5 - (p.x + p.w / 2)) < 1.1 && Math.abs(r.y + 0.5 - (p.y + p.h / 2)) < 1.4) {
      collectRemains(i);
    }
  }
}

function nearLava(p) {
  const cx = Math.floor(p.x + p.w / 2), cy = Math.floor(p.y + p.h / 2);
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (G.world.getTile(cx + dx, cy + dy) === T.LAVA) return true;
    }
  }
  return false;
}

function hurt(amount, cause, ignoreInvuln) {
  const p = G.player;
  if (!ignoreInvuln && p.invuln > 0) return;
  p.hp -= amount;
  if (!ignoreInvuln) { p.invuln = 0.65; G.shake = Math.max(G.shake, 0.35); }
  if (p.hp <= 0 && !G.dead) die(cause);
}

/* ------------------------------------------------------------ mine & fight */

function cursorTile() {
  const tx = Math.floor(G.cam.x + (G.mouse.x - G.W / 2) / TILE);
  const ty = Math.floor(G.cam.y + (G.mouse.y - G.H / 2) / TILE);
  return { tx, ty };
}

function inReach(tx, ty) {
  const p = G.player;
  return Math.hypot(tx + 0.5 - (p.x + p.w / 2), ty + 0.5 - (p.y + p.h / 2)) <= REACH;
}

function mineAndFight(dt) {
  if (G.swing > 0) G.swing -= dt;
  if (G.hitCd > 0) G.hitCd -= dt;
  if (!G.mouse.left) return;
  const { tx, ty } = cursorTile();
  if (!inReach(tx, ty)) return;

  // attacking takes priority over the rock behind the creature
  const mx = G.cam.x + (G.mouse.x - G.W / 2) / TILE;
  const my = G.cam.y + (G.mouse.y - G.H / 2) / TILE;
  if (G.hitCd <= 0) {
    for (const m of G.mobs) {
      if (mx > m.x - 0.5 && mx < m.x + m.w + 0.5 && my > m.y - 0.5 && my < m.y + m.h + 0.5) {
        m.hp -= pickDamage();
        m.hurt = 0.18;
        m.vx += Math.sign(m.x - G.player.x) * 5;
        m.vy -= 2.5;
        G.hitCd = 0.34; G.swing = 0.18;
        spawnParticles(G.particles, mx, my, 7, MOBS[m.type].color, { life: 0.4, spread: 6 });
        if (m.hp <= 0) killMob(m, mx, my);
        return;
      }
    }
  }

  const id = G.world.getTile(tx, ty);
  const tile = TILES[id];
  if (id === T.AIR || !isFinite(tile.hard)) return;

  if (!G.mineTile || G.mineTile.tx !== tx || G.mineTile.ty !== ty) {
    G.mineTile = { tx, ty }; G.mineProg = 0;
  }
  G.mineProg += (dt * pickSpeed()) / tile.hard;
  G.swing = 0.18;
  if (Math.random() < dt * 14) {
    spawnParticles(G.particles, tx + 0.5, ty + 0.5, 1, shade(tile.color, 1), { life: 0.35, spread: 3 });
  }
  if (G.mineProg >= 1) breakTile(tx, ty, id, tile);
}

function breakTile(tx, ty, id, tile) {
  G.world.setTile(tx, ty, T.AIR);
  G.mineTile = null; G.mineProg = 0;
  G.save.stats.mined++;
  spawnParticles(G.particles, tx + 0.5, ty + 0.5, 10, shade(tile.color, 1), { life: 0.5, spread: 5 });
  if (tile.drop) {
    const [res, n] = tile.drop;
    if (res === 'fuel') {
      G.player.fuel = Math.min(100, G.player.fuel + 32);
      log('Lumen crystal cracked — lamp topped up.', 'hot');
    } else {
      addRes(res, n);
    }
  }
  if (id === T.OUTPOST) removeOutpost(tx, ty);
  persist();
}

function killMob(m, x, y) {
  m.dead = true;
  const d = MOBS[m.type];
  spawnParticles(G.particles, x, y, 18, d.color, { life: 0.7, spread: 8 });
  if (d.burst) {
    spawnParticles(G.particles, x, y, 26, '#9e6ce2', { life: 1.2, spread: 4, gravity: -2 });
    G.player.o2 = Math.max(0, G.player.o2 - 8);
  }
  if (Math.random() < 0.45) {
    const ores = G.zone.ores.filter(([t]) => TILES[t].drop && TILES[t].drop[0] !== 'fuel');
    if (ores.length) {
      const pick = ores[Math.floor(Math.random() * ores.length)];
      addRes(TILES[pick[0]].drop[0], 1);
    }
  }
}

function addRes(res, n) {
  G.player.inv[res] = (G.player.inv[res] || 0) + n;
}

function hasCost(cost) {
  for (const k in cost) if ((G.player.inv[k] || 0) < cost[k]) return false;
  return true;
}

function payCost(cost) {
  for (const k in cost) G.player.inv[k] -= cost[k];
}

function tryBuild() {
  if (!G.started || G.paused || G.dead || G.panelOpen) return;
  const b = BUILDS[G.build];
  const { tx, ty } = cursorTile();
  if (!inReach(tx, ty)) { log('Too far to build there.', 'bad'); return; }
  if (G.world.getTile(tx, ty) !== T.AIR) { log('Something is already there.', 'bad'); return; }
  const p = G.player;
  if (TILES[b.tile].solid && tx >= Math.floor(p.x) && tx <= Math.floor(p.x + p.w - 0.001)
      && ty >= Math.floor(p.y) && ty <= Math.floor(p.y + p.h - 0.001)) {
    log('You are standing there.', 'bad'); return;
  }
  if (!hasCost(b.cost)) { log(`Need ${costText(b.cost)}.`, 'bad'); return; }
  if (b.fuel && p.fuel < b.fuel) { log('Not enough lamp oil.', 'bad'); return; }
  if (b.tile === T.OUTPOST && nearestOutpost(24)) { log('Too close to another outpost.', 'bad'); return; }

  payCost(b.cost);
  if (b.fuel) p.fuel -= b.fuel;
  G.world.setTile(tx, ty, b.tile);
  spawnParticles(G.particles, tx + 0.5, ty + 0.5, 8, shade(TILES[b.tile].color, 1), { life: 0.4, spread: 4 });

  if (b.tile === T.OUTPOST) {
    G.save.outposts.push({
      x: tx, y: ty, depth: ty - SURFACE_Y, born: Date.now(), runs: G.save.stats.runs,
      stock: 0, lastTick: Date.now(), touched: false,
    });
    G.save.lastSpawn = { x: tx, y: ty };
    log(`Outpost planted at ${ty - SURFACE_Y} m. It will grow while you are away.`, 'good');
  }
  persist();
}

function costText(cost) {
  return Object.entries(cost).map(([k, v]) => `${v} ${RESOURCES[k].name.toLowerCase()}`).join(' + ');
}

/* --------------------------------------------------------------- outposts */

function outpostLevel(o) {
  const mins = (Date.now() - o.born) / 60000;
  const runs = G.save.stats.runs - o.runs;
  return clamp(1 + Math.floor(mins / 4) + Math.floor(runs / 2), 1, 5);
}

function outpostNextEta(o) {
  const lvl = outpostLevel(o);
  if (lvl >= 5) return null;
  const mins = (Date.now() - o.born) / 60000;
  return (4 - (mins % 4)) * 60000;
}

function outpostName(o) {
  const n = Math.abs(Math.floor(hash2(o.x, o.y, 99) * 900)) + 100;
  return `#${n}`;
}

function nearestOutpost(range) {
  const p = G.player;
  let best = null, bd = range;
  for (const o of G.save.outposts) {
    const d = Math.hypot(o.x + 0.5 - (p.x + p.w / 2), o.y + 0.5 - (p.y + p.h / 2));
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

function removeOutpost(x, y) {
  const i = G.save.outposts.findIndex((o) => o.x === x && o.y === y);
  if (i >= 0) {
    G.save.outposts.splice(i, 1);
    log('Outpost core dismantled.', 'bad');
  }
}

function outpostStock(o) {
  const lvl = outpostLevel(o);
  if (lvl < 4) return 0;
  const mins = (Date.now() - (o.lastTick || o.born)) / 60000;
  const gained = Math.floor(mins / 1.5);
  if (gained > 0) {
    o.stock = Math.min(14, (o.stock || 0) + gained);
    o.lastTick = Date.now();
  }
  return o.stock || 0;
}

/* --------------------------------------------------------- death & remains */

function die(cause) {
  const p = G.player;
  G.dead = true;
  p.hp = 0;
  const loot = {};
  let any = false;
  for (const k in p.inv) if (p.inv[k] > 0) { loot[k] = p.inv[k]; any = true; }
  const depth = playerDepth();
  const rx = Math.floor(p.x + p.w / 2), ry = Math.floor(p.y + p.h - 0.5);
  G.save.remains.push({
    id: 'you' + Date.now(),
    x: rx, y: ry, depth, loot, mine: true,
    name: 'You, previously',
    epitaph: DEATH_NOTES[Math.floor(Math.random() * DEATH_NOTES.length)],
    gear: `killed by ${cause}`,
  });
  p.inv = {};
  G.save.stats.deaths++;
  G.save.stats.runs++;
  persist(true);

  document.getElementById('death-text').textContent =
    `${depth} m down, killed by ${cause}. ` + (any ? `You were carrying ${lootText(loot)}.` : 'You were carrying nothing.');
  document.getElementById('death').classList.remove('hidden');
  spawnParticles(G.particles, p.x + p.w / 2, p.y + p.h / 2, 40, '#ef6d7e', { life: 1.2, spread: 9 });
}

function lootText(loot) {
  const parts = Object.entries(loot).filter(([, v]) => v > 0)
    .map(([k, v]) => `${v} ${RESOURCES[k].name.toLowerCase()}`);
  return parts.length ? parts.join(', ') : 'nothing';
}

function collectRemains(i) {
  const r = G.save.remains[i];
  let got = 0;
  for (const k in r.loot) { addRes(k, r.loot[k]); got += r.loot[k]; }
  G.save.remains.splice(i, 1);
  G.save.stats.recovered++;
  spawnParticles(G.particles, r.x + 0.5, r.y + 0.5, 22, '#f0cc63', { life: 0.9, spread: 6, gravity: -3 });
  if (r.mine) {
    log(`Recovered your own remains — ${lootText(r.loot)} back in the satchel.`, 'good');
  } else {
    log(`${r.name}, ${r.depth} m down. ${r.epitaph}`, 'hot');
    log(`Beside them: ${r.gear}. You take ${lootText(r.loot)}.`);
  }
  if (!got) log('The satchel was already empty.');
  persist(true);
}

/* -------------------------------------------------------------- interaction */

function interact() {
  if (!G.started || G.dead) return;
  if (G.panelOpen) { closePanel(); return; }
  const p = G.player;
  const dStation = Math.hypot(STATION_X + 0.5 - (p.x + p.w / 2), (SURFACE_Y - 1) - (p.y + p.h / 2));
  if (dStation < 5) { openStation(); return; }
  const op = nearestOutpost(6.5);
  if (op) { openOutpost(op); return; }
  log('Nothing to use here.');
}

function useCanister() {
  if (!G.started || G.dead) return;
  if ((G.save.canisters || 0) <= 0) { log('No air canisters left.', 'bad'); return; }
  if (G.player.o2 > maxO2() - 10) { log('Lungs already full.'); return; }
  G.save.canisters--;
  G.player.o2 = Math.min(maxO2(), G.player.o2 + 70);
  log('Canister cracked open. Cold, metallic, wonderful.', 'good');
  persist();
}

function invValue() {
  let v = 0;
  for (const k in G.player.inv) v += (G.player.inv[k] || 0) * RESOURCES[k].value;
  return v;
}

/* -------------------------------------------------------------- UI panels */

function openPanel(title, html, kind) {
  G.panelOpen = kind || 'panel';
  document.getElementById('panel-title').textContent = title;
  document.getElementById('panel-body').innerHTML = html;
  document.getElementById('panel').classList.remove('hidden');
}

function closePanel() {
  G.panelOpen = null;
  document.getElementById('panel').classList.add('hidden');
}

function togglePause() {
  if (!G.started) return;
  if (G.panelOpen) { closePanel(); return; }
  const s = G.save.stats;
  openPanel('Paused', `
    <div class="stat-grid">
      <div><span>Runs</span> ${s.runs}</div>
      <div><span>Deaths</span> ${s.deaths}</div>
      <div><span>Deepest</span> ${s.deepest} m</div>
      <div><span>Tiles mined</span> ${s.mined}</div>
      <div><span>Remains recovered</span> ${s.recovered}</div>
      <div><span>Time below</span> ${fmtTime(s.playMs)}</div>
      <div><span>Outposts</span> ${G.save.outposts.length}</div>
      <div><span>Remains in the mine</span> ${G.save.remains.length}</div>
    </div>
    <p class="dim">Everything you dig, build and drop is saved to this browser. Come back tomorrow and your outposts will have grown.</p>
  `, 'pause');
}

function openHelp() {
  if (!G.started) return;
  openPanel('Field Manual', `
    <p><b>Move</b> A/D · <b>Jump</b> W or Space · <b>Ladders</b> W/S while inside one</p>
    <p><b>Left click</b> mines rock and strikes creatures. <b>Right click</b> places the selected build (keys 1–4).</p>
    <p><b>E</b> uses the surface station or an outpost. <b>Q</b> cracks an air canister.</p>
    <hr style="border-color:#222a38">
    <p><b>Fuel</b> feeds your lamp. As it runs low, your light shrinks. Lumen crystals in the walls refill it.</p>
    <p><b>Oxygen</b> only matters below 145 m. At zero it kills you fast.</p>
    <p><b>Die and you drop everything</b> — it stays exactly where you fell until you walk back down and take it.</p>
    <p><b>Outposts</b> refuel, re-anchor your respawn and level up on their own over real time and across runs. Plant them deep.</p>
    <p class="dim">Depths: Limestone 0 m · Crystal 60 m · Fungal 145 m · Magma 250 m · Static 380 m · Hollow 520 m</p>
  `, 'help');
}

function openStation() {
  const s = G.save;
  const val = invValue();
  const rows = Object.entries({
    lamp: ['Lamp Reflector', `Light radius ${lampRadius().toFixed(1)} m`],
    efficiency: ['Burn Regulator', `Fuel drain ×${fuelEff().toFixed(2)}`],
    pick: ['Pickaxe Head', `Mining ×${pickSpeed().toFixed(2)}, strike ${pickDamage()}`],
    tank: ['Lung Tank', `Oxygen ${maxO2()}`],
    armor: ['Plating', `Health ${maxHp()}`],
  }).map(([k, [name, desc]]) => {
    const lvl = upg(k);
    const cost = upgCost(k);
    const maxed = lvl >= UPG_MAX;
    return `<div class="shop-row">
      <div class="info"><b>${name}</b> <span class="pips">${'▮'.repeat(lvl)}${'▯'.repeat(UPG_MAX - lvl)}</span>
        <small>${desc}</small></div>
      <button data-upg="${k}" ${maxed || s.credits < cost ? 'disabled' : ''}>${maxed ? 'MAX' : '◈ ' + cost}</button>
    </div>`;
  }).join('');

  openPanel('Surface Station', `
    <p class="dim">Fuel and air topped up. Sell what you hauled, then go back down.</p>
    <div class="shop-row">
      <div class="info"><b>Deposit ore</b><small>${lootText(G.player.inv)}</small></div>
      <button data-act="sell" ${val <= 0 ? 'disabled' : ''}>◈ ${val}</button>
    </div>
    <div class="shop-row">
      <div class="info"><b>Air canister</b><small>Carrying ${s.canisters || 0} · press Q below 145 m</small></div>
      <button data-act="can" ${s.credits < 40 ? 'disabled' : ''}>◈ 40</button>
    </div>
    ${rows}
    <p class="dim" style="margin-top:14px">Credits: ◈ ${s.credits}</p>
  `, 'station');

  document.getElementById('panel-body').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'sell') {
      const v = invValue();
      if (v > 0) {
        s.credits += v;
        if (G.tripDeepest > 25) s.stats.runs++;
        log(`Deposited ${lootText(G.player.inv)} for ◈ ${v}.`, 'good');
        G.player.inv = {};
        G.tripDeepest = 0;
      }
    } else if (b.dataset.act === 'can') {
      if (s.credits >= 40) { s.credits -= 40; s.canisters = (s.canisters || 0) + 1; }
    } else if (b.dataset.upg) {
      const k = b.dataset.upg;
      const c = upgCost(k);
      if (s.credits >= c && upg(k) < UPG_MAX) {
        s.credits -= c;
        s.upgrades[k]++;
        G.player.hp = Math.min(maxHp(), G.player.hp + 30);
        log(`Upgraded ${k}.`, 'good');
      }
    }
    persist(true);
    openStation();
  };
}

function openOutpost(o) {
  const lvl = outpostLevel(o);
  const eta = outpostNextEta(o);
  const stock = outpostStock(o);
  const services = [
    'Refuels your lamp · anchors your respawn',
    'Replenishes oxygen',
    'Field medicine — health regenerates here',
    'Salvage drones stockpile ore while you are gone',
    'Beacon link — travel between outposts',
  ];
  const list = services.map((t, i) => `<div class="shop-row"><div class="info" style="opacity:${i < lvl ? 1 : 0.35}">
      <b>Level ${i + 1}</b><small>${t}</small></div>${i < lvl ? '<span class="pips">ACTIVE</span>' : ''}</div>`).join('');

  let travel = '';
  if (lvl >= 5) {
    const others = G.save.outposts.filter((x) => x !== o);
    travel = others.length
      ? `<p style="margin-top:14px"><b>Beacon link</b> <span class="dim">— 25 fuel</span></p>` + others.map((x, i) =>
        `<div class="shop-row"><div class="info"><b>Outpost ${outpostName(x)}</b><small>${x.depth} m · level ${outpostLevel(x)}</small></div>
         <button data-travel="${G.save.outposts.indexOf(x)}" ${G.player.fuel < 25 ? 'disabled' : ''}>Travel</button></div>`).join('')
      : '<p class="dim">Beacon link online, but there is nowhere else to link to yet.</p>';
  }

  openPanel(`Outpost ${outpostName(o)} · ${o.depth} m`, `
    <p class="dim">Level ${lvl}${eta ? ` · next level in ${fmtTime(eta)}` : ' · fully grown'}. Outposts mature on their own, whether or not you are down here.</p>
    ${list}
    ${stock > 0 ? `<div class="shop-row"><div class="info"><b>Salvage stockpile</b><small>${stock} units waiting</small></div>
      <button data-act="collect">Collect</button></div>` : ''}
    ${travel}
  `, 'outpost');

  document.getElementById('panel-body').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'collect') {
      const n = outpostStock(o);
      const ore = G.zone.ores.filter(([t]) => TILES[t].drop && TILES[t].drop[0] !== 'fuel')[0];
      const res = ore ? TILES[ore[0]].drop[0] : 'stone';
      addRes(res, n);
      o.stock = 0; o.lastTick = Date.now();
      log(`Collected ${n} ${RESOURCES[res].name.toLowerCase()} from the drones.`, 'good');
    } else if (b.dataset.travel !== undefined) {
      const dest = G.save.outposts[+b.dataset.travel];
      if (dest && G.player.fuel >= 25) {
        G.player.fuel -= 25;
        G.player.x = dest.x + 0.5 - G.player.w / 2;
        G.player.y = dest.y - G.player.h - 0.1;
        G.player.vx = G.player.vy = 0;
        G.cam.x = G.player.x; G.cam.y = G.player.y;
        log(`Beacon link — arrived at outpost ${outpostName(dest)}.`, 'good');
        closePanel();
        return;
      }
    }
    persist(true);
    openOutpost(o);
  };
}

/* --------------------------------------------------------------- messages */

function log(text, kind) {
  G.msgs.push({ text, kind, t: performance.now() });
  if (G.msgs.length > 6) G.msgs.shift();
  renderLog();
}

function renderLog() {
  const el = document.getElementById('log');
  el.innerHTML = '';
  for (const m of G.msgs) {
    const d = document.createElement('div');
    d.textContent = m.text;
    if (m.kind) d.className = m.kind;
    el.appendChild(d);
  }
}

/* ------------------------------------------------------------- mob spawning */

function spawnMobs(dt) {
  G.spawnCd -= dt;
  if (G.spawnCd > 0) return;
  G.spawnCd = 1.4;
  const depth = playerDepth();
  if (depth < 8) return;
  const cap = Math.round(3 + G.zone.density * 4);
  if (G.mobs.length >= cap) return;

  const p = G.player;
  for (let tries = 0; tries < 14; tries++) {
    const a = Math.random() * Math.PI * 2;
    const r = 15 + Math.random() * 11;
    const tx = Math.floor(p.x + Math.cos(a) * r);
    const ty = Math.floor(p.y + Math.sin(a) * r);
    if (tx < 2 || tx > WORLD_W - 3 || ty < SURFACE_Y + 4 || ty > G.world.bottomY - 3) continue;
    if (!G.world.isOpen(tx, ty) || !G.world.isOpen(tx, ty - 1)) continue;
    const type = G.zone.mobs[Math.floor(Math.random() * G.zone.mobs.length)];
    const d = MOBS[type];
    if (!d.fly && !G.world.isSolid(tx, ty + 1)) continue;
    G.mobs.push(makeMob(type, tx + 0.5 - d.w / 2, ty + 1 - d.h));
    return;
  }
}

function contacts(dt) {
  const p = G.player;
  for (const m of G.mobs) {
    const d = MOBS[m.type];
    if (p.x < m.x + m.w && p.x + p.w > m.x && p.y < m.y + m.h && p.y + p.h > m.y) {
      if (p.invuln <= 0) {
        hurt(d.dmg, d.name.toLowerCase());
        p.vx = Math.sign(p.x - m.x) * 7;
        p.vy = -5;
      }
      if (d.drainsFuel) p.fuel = Math.max(0, p.fuel - 14 * dt);
    }
  }
}

/* -------------------------------------------------------------- persistence */

function persist(force) {
  const now = performance.now();
  if (!force && now - G.lastPersist < 1500) return;
  G.lastPersist = now;
  writeSave(G.save);
}

function refreshTitleStats() {
  const s = G.save.stats;
  const el = document.getElementById('title-stats');
  if (!s.runs && !s.mined) {
    el.textContent = 'A fresh shaft. Nobody has been down this one but the dead.';
  } else {
    el.textContent = `${s.runs} runs · deepest ${s.deepest} m · ${G.save.outposts.length} outposts standing · ${G.save.remains.length} sets of remains below.`;
  }
}

/* ------------------------------------------------------------------- render */

function render() {
  const ctx = G.ctx;
  const p = G.player;
  const camX = G.cam.x + (G.shake > 0 ? (Math.random() - 0.5) * G.shake : 0);
  const camY = G.cam.y + (G.shake > 0 ? (Math.random() - 0.5) * G.shake : 0);
  const originX = G.W / 2 - camX * TILE;
  const originY = G.H / 2 - camY * TILE;
  const x0 = Math.floor(camX - G.W / TILE / 2) - 1;
  const y0 = Math.floor(camY - G.H / TILE / 2) - 1;
  const x1 = x0 + G.lw - 1;
  const y1 = y0 + G.lh - 1;

  // sky / cave backdrop
  const depth = Math.max(0, camY - SURFACE_Y);
  const dark = clamp(1 - depth / 40, 0, 1);
  const grad = ctx.createLinearGradient(0, 0, 0, G.H);
  grad.addColorStop(0, `rgb(${Math.round(6 + 26 * dark)},${Math.round(8 + 32 * dark)},${Math.round(14 + 52 * dark)})`);
  grad.addColorStop(1, 'rgb(4,5,8)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, G.W, G.H);

  computeLight(x0, y0, x1, y1);
  const zone = G.zone;

  // tiles
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const id = G.world.getTile(tx, ty);
      const l = lightAt(tx, ty, x0, y0);
      const sx = originX + tx * TILE;
      const sy = originY + ty * TILE;
      if (id === T.AIR) {
        if (ty <= G.world.surfaceH(tx)) continue; // open sky
        if (l > 0.02) {
          ctx.fillStyle = shade(TILES[zone.stone].color, 0.06 + l * 0.2);
          ctx.fillRect(sx, sy, TILE, TILE);
        }
        continue;
      }
      const tile = TILES[id];
      if (!tile.color) continue;
      const v = 0.86 + hash2(tx, ty, 7) * 0.28;
      const glowBoost = tile.glow ? 0.2 + l * 0.4 : 0;
      const lit = clamp(0.12 + l * 1.25 + glowBoost, 0, 1.5);
      ctx.fillStyle = shade(tile.color, v * lit);
      ctx.fillRect(sx, sy, TILE, TILE);
      if (tile.built || tile.glow) drawSpecial(ctx, id, sx, sy, lit);
      else if (l > 0.08 && !TILES[G.world.getTile(tx, ty - 1)].solid) {
        ctx.fillStyle = shade(tile.color, v * lit * 1.35, 0.55);
        ctx.fillRect(sx, sy, TILE, 2);
      }
    }
  }

  // remains & outposts
  for (const r of G.save.remains) {
    if (r.x < x0 - 2 || r.x > x1 + 2 || r.y < y0 - 2 || r.y > y1 + 2) continue;
    drawRemains(ctx, originX + r.x * TILE, originY + r.y * TILE, r, lightAt(r.x, r.y, x0, y0));
  }
  for (const o of G.save.outposts) {
    if (o.x < x0 - 2 || o.x > x1 + 2 || o.y < y0 - 2 || o.y > y1 + 2) continue;
    drawOutpost(ctx, originX + o.x * TILE, originY + o.y * TILE, o);
  }

  // creatures
  for (const m of G.mobs) drawMob(ctx, m, originX, originY);

  // particles
  for (const pt of G.particles) {
    const a = clamp(pt.life / pt.max, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = pt.color;
    const s = pt.size * TILE;
    ctx.fillRect(originX + pt.x * TILE - s / 2, originY + pt.y * TILE - s / 2, s, s);
  }
  ctx.globalAlpha = 1;

  drawPlayer(ctx, originX, originY);
  drawCursor(ctx, originX, originY);

  // biome tint + vignette
  if (zone.tint) { ctx.fillStyle = zone.tint; ctx.fillRect(0, 0, G.W, G.H); }
  if (!G.vignette) {
    const g = ctx.createRadialGradient(G.W / 2, G.H / 2, Math.min(G.W, G.H) * 0.25, G.W / 2, G.H / 2, Math.max(G.W, G.H) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.75)');
    G.vignette = g;
  }
  ctx.fillStyle = G.vignette;
  ctx.fillRect(0, 0, G.W, G.H);

  if (G.player.invuln > 0.45) {
    ctx.fillStyle = `rgba(190,40,60,${(G.player.invuln - 0.45) * 0.5})`;
    ctx.fillRect(0, 0, G.W, G.H);
  }
}

/* lighting: ambient per depth + splats from glowing tiles and the lamp */
function computeLight(x0, y0, x1, y1) {
  const L = G.light;
  const zone = G.zone;
  for (let ty = y0; ty <= y1; ty++) {
    const d = ty - SURFACE_Y;
    const amb = d <= 0 ? 1 : d < 10 ? lerp(1, zone.ambient, d / 10) : zone.ambient;
    const row = (ty - y0) * G.lw;
    for (let tx = x0; tx <= x1; tx++) L[row + (tx - x0)] = amb;
  }
  let sources = 0;
  for (let ty = y0; ty <= y1 && sources < 90; ty++) {
    for (let tx = x0; tx <= x1 && sources < 90; tx++) {
      const g = TILES[G.world.getTile(tx, ty)].glow;
      if (g > 0) { splat(tx + 0.5, ty + 0.5, g, 0.95, x0, y0, x1, y1); sources++; }
    }
  }
  for (const m of G.mobs) {
    const g = MOBS[m.type].glow;
    if (g) splat(m.x + m.w / 2, m.y + m.h / 2, g, 0.7, x0, y0, x1, y1);
  }
  const p = G.player;
  const fuelFrac = p.fuel / 100;
  const rad = lampRadius() * (0.34 + 0.66 * fuelFrac) * (1 + Math.sin(G.time * 9) * 0.015 * (1 - fuelFrac));
  splat(p.x + p.w / 2, p.y + p.h / 2, Math.max(1.6, rad), 1, x0, y0, x1, y1);
}

function splat(cx, cy, radius, intensity, x0, y0, x1, y1) {
  const L = G.light;
  const ax = Math.max(x0, Math.floor(cx - radius)), bx = Math.min(x1, Math.ceil(cx + radius));
  const ay = Math.max(y0, Math.floor(cy - radius)), by = Math.min(y1, Math.ceil(cy + radius));
  for (let ty = ay; ty <= by; ty++) {
    const row = (ty - y0) * G.lw;
    for (let tx = ax; tx <= bx; tx++) {
      const d = Math.hypot(tx + 0.5 - cx, ty + 0.5 - cy);
      if (d > radius) continue;
      const f = 1 - d / radius;
      const v = intensity * f * (0.45 + 0.55 * f);
      const i = row + (tx - x0);
      if (v > L[i]) L[i] = Math.min(1, L[i] + v * 0.85);
    }
  }
}

function lightAt(tx, ty, x0, y0) {
  const ix = tx - x0, iy = ty - y0;
  if (ix < 0 || iy < 0 || ix >= G.lw || iy >= G.lh) return 0;
  return G.light[iy * G.lw + ix];
}

function drawSpecial(ctx, id, sx, sy, lit) {
  ctx.save();
  if (id === T.LADDER) {
    ctx.strokeStyle = shade(TILES[id].color, 1.1 * lit);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx + 4, sy); ctx.lineTo(sx + 4, sy + TILE);
    ctx.moveTo(sx + TILE - 4, sy); ctx.lineTo(sx + TILE - 4, sy + TILE);
    ctx.moveTo(sx + 4, sy + TILE / 2); ctx.lineTo(sx + TILE - 4, sy + TILE / 2);
    ctx.stroke();
  } else if (id === T.TORCH) {
    ctx.fillStyle = '#6b4a2a';
    ctx.fillRect(sx + TILE / 2 - 1.5, sy + TILE / 2, 3, TILE / 2);
    const f = 3 + Math.sin(G.time * 12) * 0.8;
    ctx.fillStyle = '#ffc45a';
    ctx.beginPath(); ctx.arc(sx + TILE / 2, sy + TILE / 2, f, 0, 7); ctx.fill();
  } else if (id === T.PLATFORM) {
    ctx.fillStyle = shade(TILES[id].color, 1.25 * lit);
    ctx.fillRect(sx, sy, TILE, 4);
    ctx.fillStyle = shade(TILES[id].color, 0.7 * lit);
    ctx.fillRect(sx + 2, sy + 4, 3, TILE - 4);
    ctx.fillRect(sx + TILE - 5, sy + 4, 3, TILE - 4);
  } else if (id === T.STATION) {
    ctx.fillStyle = '#2a3a52'; ctx.fillRect(sx, sy - TILE, TILE, TILE * 2);
    ctx.fillStyle = '#78bef0';
    ctx.fillRect(sx + 4, sy - TILE + 4, TILE - 8, 6);
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(G.time * 3);
    ctx.fillRect(sx + 6, sy + 6, TILE - 12, 4);
  } else if (TILES[id].glow) {
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(G.time * 3 + sx);
    ctx.fillStyle = shade(TILES[id].color, 1.6);
    ctx.fillRect(sx + 3, sy + 3, TILE - 6, TILE - 6);
  }
  ctx.restore();
}

function drawRemains(ctx, sx, sy, r, l) {
  ctx.save();
  ctx.globalAlpha = clamp(0.25 + l * 1.4, 0.25, 1);
  ctx.fillStyle = r.mine ? '#f0cc63' : '#cfc9bb';
  ctx.beginPath();
  ctx.arc(sx + TILE / 2, sy + TILE * 0.58, TILE * 0.22, 0, 7);
  ctx.fill();
  ctx.fillRect(sx + TILE * 0.32, sy + TILE * 0.72, TILE * 0.36, TILE * 0.16);
  ctx.fillStyle = '#12141a';
  ctx.fillRect(sx + TILE * 0.4, sy + TILE * 0.52, 3, 3);
  ctx.fillRect(sx + TILE * 0.56, sy + TILE * 0.52, 3, 3);
  ctx.globalAlpha *= 0.4 + 0.3 * Math.sin(G.time * 2 + sx * 0.1);
  ctx.fillStyle = r.mine ? '#f0cc63' : '#8fd8f2';
  ctx.fillRect(sx + TILE / 2 - 1, sy - 6, 2, 5);
  ctx.restore();
}

function drawOutpost(ctx, sx, sy, o) {
  const lvl = outpostLevel(o);
  ctx.save();
  ctx.fillStyle = '#1c3a38';
  ctx.fillRect(sx - 2, sy - 2, TILE + 4, TILE + 4);
  ctx.fillStyle = '#60d6be';
  ctx.fillRect(sx + 4, sy + 4, TILE - 8, TILE - 8);
  const pulse = 0.5 + 0.5 * Math.sin(G.time * 2.2);
  ctx.globalAlpha = 0.25 + pulse * 0.35;
  ctx.strokeStyle = '#60d6be';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sx + TILE / 2, sy + TILE / 2, TILE * (0.9 + pulse * 0.5), 0, 7);
  ctx.stroke();
  ctx.globalAlpha = 1;
  for (let i = 0; i < lvl; i++) {
    ctx.fillStyle = '#9ff0dd';
    ctx.fillRect(sx + 2 + i * 4, sy - 8, 3, 4);
  }
  ctx.restore();
}

function drawMob(ctx, m, ox, oy) {
  const d = MOBS[m.type];
  const x = ox + m.x * TILE, y = oy + m.y * TILE;
  const w = m.w * TILE, h = m.h * TILE;
  ctx.save();
  if (m.type === 'wraith') ctx.globalAlpha = 0.55 + 0.2 * Math.sin(G.time * 4);
  ctx.fillStyle = m.hurt > 0 ? '#ffffff' : d.color;
  if (d.fly) {
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h / 2);
    ctx.lineTo(x + w / 2, y + h);
    ctx.lineTo(x, y + h / 2);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(x, y, w, h);
    ctx.fillRect(x + w * 0.15, y - h * 0.22, w * 0.7, h * 0.25);
  }
  ctx.fillStyle = d.eye;
  const ex = m.dir > 0 ? x + w * 0.62 : x + w * 0.24;
  ctx.fillRect(ex, y + h * 0.28, 3, 3);
  // health pip
  if (m.hp < m.maxHp) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, y - 7, w, 3);
    ctx.fillStyle = '#ef6d7e';
    ctx.fillRect(x, y - 7, w * (m.hp / m.maxHp), 3);
  }
  ctx.restore();
}

function drawPlayer(ctx, ox, oy) {
  const p = G.player;
  const x = ox + p.x * TILE, y = oy + p.y * TILE;
  const w = p.w * TILE, h = p.h * TILE;
  ctx.save();
  if (p.invuln > 0 && Math.floor(G.time * 20) % 2 === 0) ctx.globalAlpha = 0.5;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - 2, y + h * 0.05, w + 4, h * 0.98);
  ctx.fillStyle = '#4a5a76';                                  // body
  ctx.fillRect(x, y + h * 0.34, w, h * 0.66);
  ctx.fillStyle = '#8fa3c4';                                  // shoulders
  ctx.fillRect(x - 1, y + h * 0.32, w + 2, h * 0.1);
  ctx.fillStyle = '#e6b34a';                                  // helmet
  ctx.fillRect(x - 1, y + h * 0.06, w + 2, h * 0.28);
  ctx.fillStyle = '#fff3c4';                                  // lamp
  ctx.fillRect(p.facing > 0 ? x + w - 3 : x - 3, y + h * 0.13, 6, 5);
  ctx.fillStyle = '#20283a';                                  // belt
  ctx.fillRect(x + w * 0.15, y + h * 0.58, w * 0.7, h * 0.1);
  ctx.fillStyle = '#c9d4e8';                                  // boots
  ctx.fillRect(x, y + h * 0.92, w, h * 0.08);
  // pick swing
  if (G.swing > 0) {
    ctx.strokeStyle = '#c9cedb';
    ctx.lineWidth = 3;
    const a = (0.6 - G.swing * 2) * p.facing;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + h * 0.45);
    ctx.lineTo(x + w / 2 + Math.cos(a) * 18 * p.facing, y + h * 0.45 + Math.sin(a) * 14);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCursor(ctx, ox, oy) {
  const { tx, ty } = cursorTile();
  const ok = inReach(tx, ty);
  const sx = ox + tx * TILE, sy = oy + ty * TILE;
  ctx.save();
  ctx.strokeStyle = ok ? 'rgba(220,230,245,0.55)' : 'rgba(220,110,120,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);
  if (G.mineTile && G.mineTile.tx === tx && G.mineTile.ty === ty && G.mineProg > 0) {
    ctx.fillStyle = `rgba(0,0,0,${0.35 * G.mineProg})`;
    ctx.fillRect(sx, sy, TILE, TILE);
    ctx.strokeStyle = 'rgba(240,220,180,0.8)';
    ctx.beginPath();
    ctx.moveTo(sx + 3, sy + 3);
    ctx.lineTo(sx + 3 + (TILE - 6) * G.mineProg, sy + 3 + (TILE - 6) * G.mineProg);
    ctx.stroke();
  }
  ctx.restore();
}

/* ---------------------------------------------------------------- HUD sync */

let hudCache = {};
function updateHUD() {
  const p = G.player;
  if (!p) return;
  const hp = clamp(p.hp / maxHp(), 0, 1);
  const fu = clamp(p.fuel / 100, 0, 1);
  const o2 = clamp(p.o2 / maxO2(), 0, 1);
  document.getElementById('bar-hp').style.width = (hp * 100) + '%';
  document.getElementById('bar-fuel').style.width = (fu * 100) + '%';
  document.getElementById('bar-o2').style.width = (o2 * 100) + '%';
  setText('txt-hp', Math.ceil(Math.max(0, p.hp)));
  setText('txt-fuel', Math.ceil(p.fuel));
  setText('txt-o2', Math.ceil(p.o2));
  document.getElementById('row-o2').classList.toggle('off', !G.zone.oxygen);

  const depth = playerDepth();
  setText('depth', depth + ' m');
  setText('zone', depth < 3 ? 'SURFACE' : G.zone.short);
  setText('credits', '◈ ' + G.save.credits);
  const val = invValue();
  const carried = lootText(p.inv);
  setText('carry', carried === 'nothing' ? 'carrying nothing' : `${carried}  ·  worth ◈ ${val}`);

  document.querySelectorAll('#hotbar .slot').forEach((el, i) => {
    el.classList.toggle('poor', !hasCost(BUILDS[i].cost));
  });

  const promptEl = document.getElementById('prompt');
  let prompt = '';
  const dStation = Math.hypot(STATION_X + 0.5 - (p.x + p.w / 2), (SURFACE_Y - 1) - (p.y + p.h / 2));
  if (dStation < 5) prompt = '[E] Surface Station — sell ore, buy gear';
  else if (nearestOutpost(6.5)) prompt = '[E] Outpost';
  promptEl.textContent = prompt;
  promptEl.classList.toggle('hidden', !prompt);

  const alertEl = document.getElementById('alert');
  alertEl.textContent = G.alert;
  alertEl.classList.toggle('hidden', !G.alert);
}

function setText(id, v) {
  if (hudCache[id] === v) return;
  hudCache[id] = v;
  document.getElementById(id).textContent = v;
}

init();

// Handy for poking at the game from the browser console.
G.depthNow = playerDepth;
G.hurt = hurt;
G.log = log;
window.__DM = G;
