// Depth Miner — simulation, player, progression and UI wiring.
import { clamp, lerp, hash2, fmtTime, mulberry32 } from './util.js';
import {
  T, TILES, RESOURCES, ZONES, SURFACE_Y, WORLD_W, STATION_X, zoneAtY, MAX_DEPTH,
} from './tiles.js';
import { World } from './world.js';
import { loadSave, newSave, writeSave, wipeSave, seedAncients, refreshContracts } from './save.js';
import {
  MOBS, makeMob, updateMob, moveBody, groundedCheck, spawnParticles, updateParticles,
} from './entities.js';
import { TILE, renderScene, resizeRender } from './render.js';
import { RELICS, relicById, BESTIARY, contractProgressText, cacheLoot, CACHE_NOTES } from './content.js';

const REACH = 5.6;
const BUILDS = [
  { tile: T.PLATFORM, name: 'Platform', cost: { stone: 1 } },
  { tile: T.LADDER, name: 'Ladder', cost: { stone: 1 } },
  { tile: T.TORCH, name: 'Torch', cost: { stone: 2 }, fuel: 6 },
  { tile: T.OUTPOST, name: 'Outpost', cost: { stone: 30, iron: 12 } },
  { throw: 'bomb', name: 'Blast Charge', item: 'bomb' },
  { throw: 'flare', name: 'Flare', item: 'flare' },
];
const UPG_BASE = { lamp: 70, efficiency: 90, pick: 110, tank: 95, armor: 130 };
const UPG_MAX = 6;
const PRICES = { canister: 40, bomb: 55, flare: 25 };

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
  mobs: [], particles: [], projectiles: [],
  cam: { x: STATION_X, y: SURFACE_Y },
  keys: {}, mouse: { x: 0, y: 0, left: false, right: false },
  cursor: { tx: 0, ty: 0 }, cursorOk: false,
  time: 0, gravitySign: 1, gravityMul: 1, zone: ZONES[0], lastZone: null,
  started: false, dead: false, panelOpen: null,
  build: 0, msgs: [], shake: 0, alert: '', tripDeepest: 0,
  lastPersist: 0, mineTile: null, mineProg: 0, swing: 0, hitCd: 0, spawnCd: 2, moteCd: 0,
  perks: {}, lampRadius: 6,
  dbg: {}, frameAvg: 0.016, fxCheck: 0, fxLevel: 0, dprCap: 2,
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
  computePerks();
  writeSave(G.save);

  spawnPlayer(true);
  bindInput();
  bindUI();
  refreshTitleStats();
  requestAnimationFrame(loop);
}

function resize() {
  G.dpr = Math.min(G.dprCap, window.devicePixelRatio || 1);
  G.W = window.innerWidth;
  G.H = window.innerHeight;
  G.canvas.width = Math.floor(G.W * G.dpr);
  G.canvas.height = Math.floor(G.H * G.dpr);
  G.ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
  resizeRender(G);
  const gauge = document.getElementById('gauge');
  if (gauge) {
    gauge.width = 26 * G.dpr;
    gauge.height = Math.floor(Math.min(430, G.H * 0.5) * G.dpr);
    gauge.style.height = (gauge.height / G.dpr) + 'px';
  }
}

function computePerks() {
  const p = {};
  for (const id of G.save.relics) p[id] = true;
  G.perks = p;
}

const upg = (k) => G.save.upgrades[k];
const lampRadius = () => (5.8 + 1.8 * (upg('lamp') - 1)) + (G.perks.lantern ? 3 : 0);
const fuelEff = () => (1 - 0.13 * (upg('efficiency') - 1)) * (G.perks.lantern ? 0.85 : 1);
const pickSpeed = () => 1 + 0.5 * (upg('pick') - 1);
const pickDamage = () => 12 + 9 * (upg('pick') - 1);
const maxO2 = () => 100 + 45 * (upg('tank') - 1);
const maxHp = () => 100 + 30 * (upg('armor') - 1);
const upgCost = (k) => Math.round(UPG_BASE[k] * Math.pow(1.9, upg(k) - 1));

function respawnPoint() {
  return G.save.lastSpawn || { x: STATION_X + 2, y: SURFACE_Y - 1 };
}

function spawnPlayer(fresh) {
  const s = respawnPoint();
  G.player = {
    x: s.x + 0.5 - 0.36, y: s.y + 1 - 1.72,
    w: 0.72, h: 1.72, vx: 0, vy: 0,
    onGround: false, ghost: false, facing: 1, anim: 0,
    hp: maxHp(), fuel: 100, o2: maxO2(),
    inv: {}, invuln: 0, climbing: false, coyote: 0,
  };
  G.mobs.length = 0;
  G.projectiles.length = 0;
  G.tripDeepest = 0;
  G.cam.x = G.player.x; G.cam.y = G.player.y;
  if (fresh) log('Station log: the shaft mouth is a few paces east. Mine down.', 'good');
}

/* ------------------------------------------------------------------ input */

function bindInput() {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) { G.keys[e.code] = true; return; }
    G.keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.code === 'Escape') togglePause();
    if (e.code === 'KeyH') openHelp();
    if (e.code === 'KeyJ') openJournal();
    if (e.code === 'KeyE') interact();
    if (e.code === 'KeyQ') useCanister();
    if (/^Digit[1-6]$/.test(e.code)) setBuild(+e.code.slice(5) - 1);
  });
  window.addEventListener('keyup', (e) => { G.keys[e.code] = false; });
  window.addEventListener('blur', () => { G.keys = {}; G.mouse.left = G.mouse.right = false; });

  G.canvas.addEventListener('mousemove', (e) => {
    const r = G.canvas.getBoundingClientRect();
    G.mouse.x = e.clientX - r.left;
    G.mouse.y = e.clientY - r.top;
  });
  G.canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) G.mouse.left = true;
    if (e.button === 2) { G.mouse.right = true; useSlot(); }
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
    if (!confirm('Collapse the mine? Every shaft, platform, outpost, relic and set of remains is lost forever.')) return;
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
  const live = G.started && !G.dead && !G.panelOpen;
  if (live) {
    update(dt);
    G.save.stats.playMs += dt * 1000;
  }
  prepFrame();
  renderScene(G);
  updateHUD();
  drawGauge();
  adaptQuality(dt);
}

// Canvas compositing is cheap on a GPU and expensive without one. If frames
// are consistently slow, shed the most expensive effects rather than crawl.
function adaptQuality(dt) {
  G.frameAvg = G.frameAvg * 0.94 + dt * 0.06;
  G.fxCheck += dt;
  if (G.fxCheck < 2.5 || !G.started) return;
  G.fxCheck = 0;
  if (G.frameAvg > 0.023 && G.fxLevel === 0) {
    G.fxLevel = 1;
    G.dbg.noBloom = true;
    log('Effects reduced to keep the frame rate up.', 'dim');
  } else if (G.frameAvg > 0.03 && G.fxLevel === 1) {
    G.fxLevel = 2;
    G.dprCap = 1;
    resize();
  }
}

function prepFrame() {
  G.lampRadius = lampRadius();
  const tx = Math.floor(G.cam.x + (G.mouse.x - G.W / 2) / TILE);
  const ty = Math.floor(G.cam.y + (G.mouse.y - G.H / 2) / TILE);
  G.cursor.tx = tx; G.cursor.ty = ty;
  G.cursorOk = inReach(tx, ty);
}

function update(dt) {
  G.time += dt;
  const p = G.player;
  const depth = playerDepth();
  G.zone = zoneAtY(p.y + p.h);

  if (G.zone !== G.lastZone) {
    if (G.lastZone) log(`${G.zone.name} — ${G.zone.quirk}`, 'good');
    if (!G.save.seenZones[G.zone.short]) {
      G.save.seenZones[G.zone.short] = true;
      if (G.lastZone) log(`Journal updated: ${G.zone.name}. [J]`, 'hot');
      persist(true);
    }
    G.lastZone = G.zone;
  }

  // --- physics quirks per biome
  G.gravityMul = G.zone.gravity;
  G.gravitySign = 1;
  G.alert = '';
  if (G.zone.flicker && !G.perks.coil) {
    G.gravityMul *= 0.55 + 0.75 * (0.5 + 0.5 * Math.sin(G.time * 1.7));
  }
  if (G.zone.invert && !G.perks.anchor) {
    const cyc = G.time % 17;
    if (cyc > 13.5) { G.gravitySign = -1; G.alert = 'GRAVITY INVERSION'; }
    else if (cyc > 12.5) G.alert = 'THE DARK IS DISAGREEING…';
  }
  if (G.perks.anchor) G.gravityMul *= 0.85;

  movePlayer(dt);
  resources(dt, depth);
  mineAndFight(dt);
  contacts(dt);
  spawnMobs(dt);
  updateProjectiles(dt);
  ambientMotes(dt);

  for (let i = G.mobs.length - 1; i >= 0; i--) {
    const m = G.mobs[i];
    updateMob(m, G, dt);
    const dd = Math.hypot(m.x - p.x, m.y - p.y);
    if (m.dead || dd > 54 || m.y > G.world.bottomY) G.mobs.splice(i, 1);
  }
  updateParticles(G.particles, dt);

  const lead = clamp(p.vx * 0.22, -3, 3);
  G.cam.x = lerp(G.cam.x, p.x + p.w / 2 + lead, Math.min(1, dt * 6));
  G.cam.y = lerp(G.cam.y, p.y + p.h / 2, Math.min(1, dt * 6));
  G.cam.x = clamp(G.cam.x, G.W / TILE / 2, WORLD_W - G.W / TILE / 2);
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 2.2);

  if (depth > G.tripDeepest) G.tripDeepest = depth;
  if (depth > G.save.stats.deepest) G.save.stats.deepest = Math.floor(depth);
  for (const c of G.save.contracts) {
    if (c.kind === 'depth' && depth > c.have) c.have = Math.floor(depth);
  }

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
  const speed = 7.4;
  if (left) { p.vx -= accel * dt; p.facing = -1; }
  if (right) { p.vx += accel * dt; p.facing = 1; }
  if (!left && !right) p.vx *= Math.pow(p.onGround ? 0.0009 : 0.22, dt);
  p.vx = clamp(p.vx, -speed, speed);
  p.anim += Math.abs(p.vx) * dt * 2.6;

  const cx = Math.floor(p.x + p.w / 2), cy = Math.floor(p.y + p.h / 2);
  p.climbing = G.world.getTile(cx, cy) === T.LADDER || G.world.getTile(cx, Math.floor(p.y + 0.2)) === T.LADDER;

  if (p.climbing) {
    p.vy = down ? 5.5 : up ? -5.5 : 0;
  } else {
    const g = 30 * G.gravityMul * G.gravitySign;
    p.vy += g * dt;
    const term = z.drag ? 11 - z.drag * 4 : 26;
    p.vy = clamp(p.vy, -26, G.perks.anchor ? term * 0.8 : term);
    if (z.drag) p.vx *= Math.pow(1 - z.drag * 0.25, dt);
  }

  p.coyote = p.onGround ? 0.12 : Math.max(0, p.coyote - dt);
  if (up && (p.coyote > 0 || p.climbing) && !p.jumpLatch) {
    p.vy = -12.4 * z.jump * G.gravitySign;
    p.coyote = 0;
    p.jumpLatch = true;
    spawnParticles(G.particles, p.x + p.w / 2, p.y + p.h, 5, '#6b6b78',
      { life: 0.32, spread: 3, size: 0.1, shrink: true });
  }
  if (!up) p.jumpLatch = false;

  const wasAir = !p.onGround;
  const r = moveBody(G.world, p, p.vx * dt, p.vy * dt);
  p.onGround = G.gravitySign > 0 ? r.ground : r.ceil;
  if (!p.onGround && G.gravitySign > 0 && groundedCheck(G.world, p)) p.onGround = true;

  if (z.bounce && r.ground && r.impactY > 13) {
    p.vy = -r.impactY * 0.48;
    p.onGround = false;
    spawnParticles(G.particles, p.x + p.w / 2, p.y + p.h, 10, '#8fd8f2',
      { life: 0.45, spread: 6, shrink: true });
  } else if (r.ground && r.impactY > 22) {
    const dmg = (r.impactY - 22) * 3.6 * (G.perks.ballast ? 0.5 : 1);
    if (dmg > 1) { hurt(dmg, 'the fall'); G.shake = 0.5; }
  }
  if (wasAir && p.onGround) {
    spawnParticles(G.particles, p.x + p.w / 2, p.y + p.h, 5, '#7d7a72',
      { life: 0.3, spread: 4, size: 0.1, shrink: true });
  }
  // walking dust
  if (p.onGround && Math.abs(p.vx) > 3 && Math.random() < dt * 12) {
    spawnParticles(G.particles, p.x + p.w / 2, p.y + p.h, 1, '#6f6a62',
      { life: 0.35, spread: 1.4, size: 0.09, shrink: true, gravity: 4 });
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
      p.o2 = Math.max(0, p.o2 - (z.o2Drain || 1) * (G.perks.filter ? 0.7 : 1) * dt);
      if (p.o2 <= 0) hurt(9 * dt, 'suffocation', true);
      if (p.o2 < maxO2() * 0.22) G.alert = G.alert || 'OXYGEN LOW';
    } else {
      p.o2 = Math.min(maxO2(), p.o2 + 6 * dt);
    }
    if (p.fuel < 18) G.alert = G.alert || 'LAMP DYING';
  }

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
    hurt(hazard * (G.perks.cinder ? 0.4 : 1) * dt, 'the burn', true);
    if (z.spores) p.o2 = Math.max(0, p.o2 - 8 * dt);
  }
  if (z.heat && !atSurface && nearLava(p)) hurt(5 * (G.perks.cinder ? 0.4 : 1) * dt, 'the heat', true);

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
  if (!ignoreInvuln) {
    p.invuln = 0.65;
    G.shake = Math.max(G.shake, 0.35);
    spawnParticles(G.particles, p.x + p.w / 2, p.y + p.h / 2, 6, '#ef6d7e',
      { life: 0.4, spread: 6, shrink: true });
  }
  if (p.hp <= 0 && !G.dead) die(cause);
}

/* ------------------------------------------------------------ mine & fight */

function inReach(tx, ty) {
  const p = G.player;
  if (!p) return false;
  return Math.hypot(tx + 0.5 - (p.x + p.w / 2), ty + 0.5 - (p.y + p.h / 2)) <= REACH;
}

function mineAndFight(dt) {
  if (G.swing > 0) G.swing -= dt;
  if (G.hitCd > 0) G.hitCd -= dt;
  if (!G.mouse.left) return;
  const { tx, ty } = G.cursor;
  if (!inReach(tx, ty)) return;

  const mx = G.cam.x + (G.mouse.x - G.W / 2) / TILE;
  const my = G.cam.y + (G.mouse.y - G.H / 2) / TILE;
  if (G.hitCd <= 0) {
    for (const m of G.mobs) {
      if (mx > m.x - 0.5 && mx < m.x + m.w + 0.5 && my > m.y - 0.5 && my < m.y + m.h + 0.5) {
        damageMob(m, pickDamage(), mx, my);
        G.hitCd = 0.34; G.swing = 0.18;
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
  if (Math.random() < dt * 16) {
    spawnParticles(G.particles, tx + 0.5, ty + 0.5, 1, '#ffd9a0',
      { life: 0.3, spread: 4, size: 0.08, shrink: true });
  }
  if (G.mineProg >= 1) breakTile(tx, ty, id, tile);
}

function damageMob(m, amount, mx, my) {
  m.hp -= amount;
  m.hurt = 0.18;
  m.vx += Math.sign(m.x - G.player.x) * 5;
  m.vy -= 2.5;
  spawnParticles(G.particles, mx, my, 8, MOBS[m.type].color, { life: 0.4, spread: 7, shrink: true });
  if (m.hp <= 0) killMob(m, m.x + m.w / 2, m.y + m.h / 2);
}

function tileColorHex(def) {
  return `rgb(${def.color.r},${def.color.g},${def.color.b})`;
}

function breakTile(tx, ty, id, tile) {
  G.world.setTile(tx, ty, T.AIR);
  G.mineTile = null; G.mineProg = 0;
  G.save.stats.mined++;
  spawnParticles(G.particles, tx + 0.5, ty + 0.5, 12, tileColorHex(tile),
    { life: 0.5, spread: 6, shrink: true });
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
  G.save.stats.kills++;
  for (const c of G.save.contracts) if (c.kind === 'kill' && c.have < c.need) c.have++;
  if (!G.save.seenMobs[m.type]) {
    G.save.seenMobs[m.type] = true;
    log(`Journal updated: ${d.name}. [J]`, 'hot');
  }
  spawnParticles(G.particles, x, y, m.elite ? 34 : 18, d.color, { life: 0.8, spread: 9, shrink: true });
  if (d.burst) {
    spawnParticles(G.particles, x, y, 26, '#9e6ce2', { life: 1.4, spread: 4, gravity: -2, shrink: true });
    G.player.o2 = Math.max(0, G.player.o2 - 8);
  }
  const mult = (G.perks.satchel ? 2 : 1) * (m.elite ? 4 : 1);
  if (m.elite || Math.random() < 0.45) {
    const ores = G.zone.ores.filter(([t]) => TILES[t].drop && TILES[t].drop[0] !== 'fuel');
    if (ores.length) {
      const pick = ores[Math.floor(Math.random() * ores.length)];
      addRes(TILES[pick[0]].drop[0], mult);
    }
  }
  if (m.elite) log(`${d.name} (elite) put down. Something is watching from further in.`, 'hot');
}

function addRes(res, n) {
  G.player.inv[res] = (G.player.inv[res] || 0) + n;
}

function hasCost(cost) {
  if (!cost) return true;
  for (const k in cost) if ((G.player.inv[k] || 0) < cost[k]) return false;
  return true;
}

function payCost(cost) {
  for (const k in cost) G.player.inv[k] -= cost[k];
}

/* --------------------------------------------------- building and throwing */

function useSlot() {
  if (!G.started || G.dead || G.panelOpen) return;
  const b = BUILDS[G.build];
  if (b.throw) throwItem(b);
  else tryBuild(b);
}

function tryBuild(b) {
  const { tx, ty } = G.cursor;
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
  spawnParticles(G.particles, tx + 0.5, ty + 0.5, 8, tileColorHex(TILES[b.tile]),
    { life: 0.4, spread: 4, shrink: true });

  if (b.tile === T.OUTPOST) {
    const depth = ty - SURFACE_Y;
    G.save.outposts.push({
      x: tx, y: ty, depth, born: Date.now(), runs: G.save.stats.runs,
      stock: 0, lastTick: Date.now(), touched: false,
    });
    G.save.lastSpawn = { x: tx, y: ty };
    for (const c of G.save.contracts) if (c.kind === 'outpost' && depth >= c.need) c.have = 1;
    log(`Outpost planted at ${depth} m. It will grow while you are away.`, 'good');
  }
  persist();
}

function throwItem(b) {
  const have = G.save.items[b.item] || 0;
  if (have <= 0) { log(`No ${b.name.toLowerCase()}s left — restock at the station.`, 'bad'); return; }
  const p = G.player;
  const sx = p.x + p.w / 2, sy = p.y + p.h * 0.4;
  const mx = G.cam.x + (G.mouse.x - G.W / 2) / TILE;
  const my = G.cam.y + (G.mouse.y - G.H / 2) / TILE;
  const a = Math.atan2(my - sy, mx - sx);
  const power = b.throw === 'bomb' ? 15 : 17;
  G.save.items[b.item]--;
  G.projectiles.push({
    kind: b.throw, x: sx, y: sy, w: 0.4, h: 0.4,
    vx: Math.cos(a) * power, vy: Math.sin(a) * power - 2,
    fuse: b.throw === 'bomb' ? 1.6 : 60, maxFuse: b.throw === 'bomb' ? 1.6 : 60,
    glow: b.throw === 'bomb' ? 2 : 7, lc: b.throw === 'bomb' ? [1, 0.5, 0.3] : [1, 0.85, 0.55],
    ghost: false, rest: false,
  });
  persist();
}

function updateProjectiles(dt) {
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const pr = G.projectiles[i];
    pr.fuse -= dt;
    if (!pr.rest) {
      pr.vy += 26 * G.zone.gravity * G.gravitySign * dt;
      const body = { x: pr.x - pr.w / 2, y: pr.y - pr.h / 2, w: pr.w, h: pr.h, vx: pr.vx, vy: pr.vy, ghost: false };
      const r = moveBody(G.world, body, pr.vx * dt, pr.vy * dt);
      pr.x = body.x + pr.w / 2; pr.y = body.y + pr.h / 2;
      pr.vx = body.vx; pr.vy = body.vy;
      if (r.hitX) pr.vx = -pr.vx * 0.4;
      if (r.ground) {
        pr.vy = 0;
        pr.vx *= 0.55;
        if (pr.kind === 'flare' && Math.abs(pr.vx) < 0.4) pr.rest = true;
      }
      if (r.ceil) pr.vy = Math.abs(pr.vy) * 0.3;
    }
    if (pr.kind === 'flare') {
      if (Math.random() < dt * 20) {
        spawnParticles(G.particles, pr.x, pr.y, 1, '#ffcf7a',
          { life: 0.7, spread: 0.8, gravity: -3, size: 0.09, shrink: true });
      }
      if (pr.fuse <= 0) G.projectiles.splice(i, 1);
    } else if (pr.fuse <= 0) {
      explode(pr.x, pr.y);
      G.projectiles.splice(i, 1);
    }
  }
}

function explode(x, y) {
  const R = 2.9;
  G.shake = 1.1;
  spawnParticles(G.particles, x, y, 60, '#ffb347', { life: 0.9, spread: 18, shrink: true, gravity: 4 });
  spawnParticles(G.particles, x, y, 30, '#6b6b78', { life: 1.4, spread: 8, shrink: true, gravity: -1 });
  const cx = Math.floor(x), cy = Math.floor(y);
  for (let ty = cy - 3; ty <= cy + 3; ty++) {
    for (let tx = cx - 3; tx <= cx + 3; tx++) {
      if (Math.hypot(tx + 0.5 - x, ty + 0.5 - y) > R) continue;
      const id = G.world.getTile(tx, ty);
      const def = TILES[id];
      if (id === T.AIR || !isFinite(def.hard) || def.hard > 2.4) continue;
      G.world.setTile(tx, ty, T.AIR);
      G.save.stats.mined++;
      if (def.drop && def.drop[0] !== 'fuel' && Math.random() < 0.7) addRes(def.drop[0], def.drop[1]);
      if (def.drop && def.drop[0] === 'fuel') G.player.fuel = Math.min(100, G.player.fuel + 32);
    }
  }
  for (const m of G.mobs) {
    const d = Math.hypot(m.x + m.w / 2 - x, m.y + m.h / 2 - y);
    if (d < 5) damageMob(m, 90 * (1 - d / 5), m.x + m.w / 2, m.y + m.h / 2);
  }
  const p = G.player;
  const pd = Math.hypot(p.x + p.w / 2 - x, p.y + p.h / 2 - y);
  if (pd < 3.4) {
    hurt(34 * (1 - pd / 3.4), 'your own blast charge');
    p.vx += Math.sign(p.x + p.w / 2 - x) * 9;
    p.vy -= 6;
  }
  persist(true);
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
  if (outpostLevel(o) >= 5) return null;
  const mins = (Date.now() - o.born) / 60000;
  return (4 - (mins % 4)) * 60000;
}

function outpostName(o) {
  return `#${Math.abs(Math.floor(hash2(o.x, o.y, 99) * 900)) + 100}`;
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
  if (outpostLevel(o) < 4) return 0;
  const mins = (Date.now() - (o.lastTick || o.born)) / 60000;
  const gained = Math.floor(mins / 1.5);
  if (gained > 0) {
    o.stock = Math.min(14, (o.stock || 0) + gained);
    o.lastTick = Date.now();
  }
  return o.stock || 0;
}

/* ----------------------------------------------------- caches and relics */

function nearbyTile(id, range) {
  const p = G.player;
  const cx = Math.floor(p.x + p.w / 2), cy = Math.floor(p.y + p.h / 2);
  const r = Math.ceil(range);
  for (let ty = cy - r; ty <= cy + r; ty++) {
    for (let tx = cx - r; tx <= cx + r; tx++) {
      if (G.world.getTile(tx, ty) === id
          && Math.hypot(tx + 0.5 - (p.x + p.w / 2), ty + 0.5 - (p.y + p.h / 2)) <= range) {
        return { tx, ty };
      }
    }
  }
  return null;
}

function openCache(pos) {
  const depth = pos.ty - SURFACE_Y;
  const rnd = mulberry32((pos.tx * 73856093) ^ (pos.ty * 19349663) ^ G.save.seed);
  const loot = cacheLoot(depth, rnd);
  const mult = G.perks.satchel ? 2 : 1;
  for (const k in loot) addRes(k, loot[k] * mult);
  const fuel = 20 + Math.floor(rnd() * 30);
  G.player.fuel = Math.min(100, G.player.fuel + fuel);
  if (rnd() < 0.4) G.save.items.flare = (G.save.items.flare || 0) + 1;
  if (rnd() < 0.25) G.save.items.bomb = (G.save.items.bomb || 0) + 1;
  G.world.setTile(pos.tx, pos.ty, T.AIR);
  G.save.stats.caches++;
  const note = CACHE_NOTES[Math.floor(rnd() * CACHE_NOTES.length)];
  if (!G.save.notes.includes(note)) G.save.notes.push(note);
  spawnParticles(G.particles, pos.tx + 0.5, pos.ty + 0.5, 26, '#f0cc63',
    { life: 1, spread: 7, gravity: -3, shrink: true });
  log(`Supply cache: ${lootText(loot)}. ${note}`, 'good');
  persist(true);
}

function takeRelic(pos) {
  const depth = pos.ty - SURFACE_Y;
  const pool = RELICS.filter((r) => !G.save.relics.includes(r.id) && depth >= r.depth - 40);
  if (!pool.length) {
    G.world.setTile(pos.tx, pos.ty, T.AIR);
    addRes('voidglass', 3);
    log('The pedestal is empty — only voidglass shards left behind.', 'hot');
    persist(true);
    return;
  }
  const rnd = mulberry32((pos.tx * 40503) ^ (pos.ty * 22801) ^ G.save.seed);
  const relic = pool[Math.floor(rnd() * pool.length)];
  G.save.relics.push(relic.id);
  computePerks();
  G.world.setTile(pos.tx, pos.ty, T.AIR);
  spawnParticles(G.particles, pos.tx + 0.5, pos.ty + 0.5, 40, '#c39cff',
    { life: 1.4, spread: 8, gravity: -4, shrink: true });
  log(`Relic recovered — ${relic.name}. ${relic.desc}`, 'good');
  log(relic.flavor, 'hot');
  persist(true);
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
  const rx = clamp(Math.floor(p.x + p.w / 2), 1, WORLD_W - 2);
  const ry = Math.floor(p.y + p.h - 0.5);
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
  spawnParticles(G.particles, p.x + p.w / 2, p.y + p.h / 2, 44, '#ef6d7e', { life: 1.2, spread: 10, shrink: true });
}

function lootText(loot) {
  const parts = Object.entries(loot).filter(([, v]) => v > 0)
    .map(([k, v]) => `${v} ${RESOURCES[k].name.toLowerCase()}`);
  return parts.length ? parts.join(', ') : 'nothing';
}

function collectRemains(i) {
  const r = G.save.remains[i];
  for (const k in r.loot) addRes(k, r.loot[k]);
  G.save.remains.splice(i, 1);
  G.save.stats.recovered++;
  spawnParticles(G.particles, r.x + 0.5, r.y + 0.5, 24, '#f0cc63',
    { life: 0.9, spread: 6, gravity: -3, shrink: true });
  if (r.mine) {
    log(`Recovered your own remains — ${lootText(r.loot)} back in the satchel.`, 'good');
  } else {
    log(`${r.name}, ${r.depth} m down. ${r.epitaph}`, 'hot');
    log(`Beside them: ${r.gear}. You take ${lootText(r.loot)}.`);
    const note = `${r.name} (${r.depth} m) — ${r.epitaph}`;
    if (!G.save.notes.includes(note)) G.save.notes.push(note);
    for (const c of G.save.contracts) if (c.kind === 'salvage' && c.have < c.need) c.have++;
  }
  persist(true);
}

/* -------------------------------------------------------------- interaction */

function interact() {
  if (!G.started || G.dead) return;
  if (G.panelOpen) { closePanel(); return; }
  const p = G.player;
  const chest = nearbyTile(T.CHEST, 2.6);
  if (chest) { openCache(chest); return; }
  const ped = nearbyTile(T.RELIC_PEDESTAL, 2.6);
  if (ped) { takeRelic(ped); return; }
  const dStation = Math.hypot(STATION_X + 0.5 - (p.x + p.w / 2), (SURFACE_Y - 1) - (p.y + p.h / 2));
  if (dStation < 6) { openStation(); return; }
  const op = nearestOutpost(6.5);
  if (op) { openOutpost(op); return; }
  log('Nothing to use here.');
}

function useCanister() {
  if (!G.started || G.dead) return;
  if ((G.save.items.canister || 0) <= 0) { log('No air canisters left.', 'bad'); return; }
  if (G.player.o2 > maxO2() - 10) { log('Lungs already full.'); return; }
  G.save.items.canister--;
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
  document.getElementById('panel-body').onclick = null;
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
      <div><span>Creatures felled</span> ${s.kills}</div>
      <div><span>Caches opened</span> ${s.caches}</div>
      <div><span>Remains recovered</span> ${s.recovered}</div>
      <div><span>Time below</span> ${fmtTime(s.playMs)}</div>
      <div><span>Outposts standing</span> ${G.save.outposts.length}</div>
      <div><span>Relics</span> ${G.save.relics.length} / ${RELICS.length}</div>
    </div>
    <p class="dim">Everything you dig, build and drop is saved to this browser. Come back tomorrow
    and your outposts will have grown on their own.</p>
  `, 'pause');
}

function openHelp() {
  if (!G.started) return;
  openPanel('Field Manual', `
    <div class="cols">
      <div>
        <h3>Moving</h3>
        <p><kbd>A</kbd><kbd>D</kbd> walk · <kbd>W</kbd>/<kbd>Space</kbd> jump · <kbd>W</kbd>/<kbd>S</kbd> on a ladder</p>
        <h3>Working</h3>
        <p><b>Left click</b> mines rock and strikes creatures.<br>
        <b>Right click</b> uses the selected slot: build, or throw a charge or flare.<br>
        <kbd>1</kbd>–<kbd>6</kbd> pick a slot · <kbd>E</kbd> use station, outpost, cache or pedestal · <kbd>Q</kbd> air canister</p>
        <h3>Panels</h3>
        <p><kbd>J</kbd> journal · <kbd>H</kbd> this manual · <kbd>Esc</kbd> pause</p>
      </div>
      <div>
        <h3>Staying alive</h3>
        <p><b>Fuel</b> feeds your lamp; as it drops, your light shrinks. Lumen crystals refill it.</p>
        <p><b>Oxygen</b> matters below 145 m and drains faster the deeper you go.</p>
        <p><b>Dying drops everything</b> where you fell. Walk back down and take it off your own corpse.</p>
        <h3>Worth doing</h3>
        <p>Contracts at the station pay well. Supply caches sit in abandoned camps.
        Pedestals below 360 m hold relics that permanently change how you dive.</p>
      </div>
    </div>
    <p class="dim">Depths: Limestone 0 · Crystal 60 · Fungal 145 · Magma 250 · Static 380 · Hollow 520</p>
  `, 'help');
}

function openJournal() {
  if (!G.started) return;
  const relics = RELICS.map((r) => {
    const has = G.save.relics.includes(r.id);
    return `<div class="entry ${has ? '' : 'locked'}">
      <b>${has ? r.name : '???'}</b>
      <small>${has ? r.desc : `Somewhere below ${r.depth} m.`}</small>
      ${has ? `<em>${r.flavor}</em>` : ''}
    </div>`;
  }).join('');

  const beasts = Object.entries(BESTIARY).map(([k, b]) => {
    const seen = G.save.seenMobs[k];
    return `<div class="entry ${seen ? '' : 'locked'}">
      <b>${seen ? b.name : '???'}</b>
      <small>${seen ? b.where : 'Not yet encountered.'}</small>
      ${seen ? `<em>${b.text}</em>` : ''}
    </div>`;
  }).join('');

  const zones = ZONES.map((z) => {
    const seen = G.save.seenZones[z.short] || z.from === 0;
    return `<div class="entry ${seen ? '' : 'locked'}">
      <b>${seen ? z.name : '???'}</b><small>${z.from} m${seen ? ` · ${z.quirk}` : ''}</small>
      ${seen ? `<em>${z.lore}</em>` : ''}
    </div>`;
  }).join('');

  const notes = G.save.notes.length
    ? G.save.notes.slice(-12).reverse().map((n) => `<div class="note">${n}</div>`).join('')
    : '<p class="dim">Nothing written down yet.</p>';

  openPanel('Journal', `
    <div class="tabs">
      <button class="tab active" data-tab="relics">Relics ${G.save.relics.length}/${RELICS.length}</button>
      <button class="tab" data-tab="beasts">Bestiary</button>
      <button class="tab" data-tab="zones">Strata</button>
      <button class="tab" data-tab="notes">Notes</button>
    </div>
    <div class="tabpane" id="tab-relics">${relics}</div>
    <div class="tabpane hidden" id="tab-beasts">${beasts}</div>
    <div class="tabpane hidden" id="tab-zones">${zones}</div>
    <div class="tabpane hidden" id="tab-notes">${notes}</div>
  `, 'journal');

  document.getElementById('panel-body').onclick = (e) => {
    const b = e.target.closest('.tab');
    if (!b) return;
    document.querySelectorAll('#panel-body .tab').forEach((t) => t.classList.toggle('active', t === b));
    document.querySelectorAll('#panel-body .tabpane').forEach((pane) => {
      pane.classList.toggle('hidden', pane.id !== 'tab-' + b.dataset.tab);
    });
  };
}

function openStation(tab = 'trade') {
  const s = G.save;
  const val = invValue();

  const trade = `
    <div class="shop-row">
      <div class="info"><b>Deposit ore</b><small>${lootText(G.player.inv)}</small></div>
      <button data-act="sell" ${val <= 0 ? 'disabled' : ''}>◈ ${val}</button>
    </div>
    <div class="shop-row">
      <div class="info"><b>Air canister</b><small>Carrying ${s.items.canister || 0} · <kbd>Q</kbd> to use</small></div>
      <button data-buy="canister" ${s.credits < PRICES.canister ? 'disabled' : ''}>◈ ${PRICES.canister}</button>
    </div>
    <div class="shop-row">
      <div class="info"><b>Blast charge</b><small>Carrying ${s.items.bomb || 0} · slot 5 · clears rock in a 3 m ball</small></div>
      <button data-buy="bomb" ${s.credits < PRICES.bomb ? 'disabled' : ''}>◈ ${PRICES.bomb}</button>
    </div>
    <div class="shop-row">
      <div class="info"><b>Flare</b><small>Carrying ${s.items.flare || 0} · slot 6 · burns for a minute where it lands</small></div>
      <button data-buy="flare" ${s.credits < PRICES.flare ? 'disabled' : ''}>◈ ${PRICES.flare}</button>
    </div>`;

  const gear = Object.entries({
    lamp: ['Lamp Reflector', `Light radius ${lampRadius().toFixed(1)} m`],
    efficiency: ['Burn Regulator', `Fuel drain ×${fuelEff().toFixed(2)}`],
    pick: ['Pickaxe Head', `Mining ×${pickSpeed().toFixed(2)} · strike ${pickDamage()}`],
    tank: ['Lung Tank', `Oxygen ${maxO2()}`],
    armor: ['Plating', `Health ${maxHp()}`],
  }).map(([k, [name, desc]]) => {
    const lvl = upg(k), cost = upgCost(k), maxed = lvl >= UPG_MAX;
    return `<div class="shop-row">
      <div class="info"><b>${name}</b> <span class="pips">${'▮'.repeat(lvl)}${'▯'.repeat(UPG_MAX - lvl)}</span>
        <small>${desc}</small></div>
      <button data-upg="${k}" ${maxed || s.credits < cost ? 'disabled' : ''}>${maxed ? 'MAX' : '◈ ' + cost}</button>
    </div>`;
  }).join('');

  const contracts = s.contracts.map((c, i) => {
    const done = c.have >= c.need;
    return `<div class="shop-row">
      <div class="info"><b>${c.title}</b><small>${c.note} · ${contractProgressText(c)}</small></div>
      <button data-claim="${i}" ${done ? '' : 'disabled'}>${done ? 'Claim ◈ ' + c.reward : '◈ ' + c.reward}</button>
    </div>`;
  }).join('');

  openPanel('Surface Station', `
    <div class="tabs">
      <button class="tab ${tab === 'trade' ? 'active' : ''}" data-stab="trade">Trade</button>
      <button class="tab ${tab === 'gear' ? 'active' : ''}" data-stab="gear">Gear</button>
      <button class="tab ${tab === 'work' ? 'active' : ''}" data-stab="work">Contracts</button>
    </div>
    <div class="tabpane ${tab === 'trade' ? '' : 'hidden'}" id="stab-trade">${trade}</div>
    <div class="tabpane ${tab === 'gear' ? '' : 'hidden'}" id="stab-gear">${gear}</div>
    <div class="tabpane ${tab === 'work' ? '' : 'hidden'}" id="stab-work">${contracts}</div>
    <p class="dim" style="margin-top:14px">Credits: ◈ ${s.credits} · lamp and lungs topped up while you stand here.</p>
  `, 'station');

  document.getElementById('panel-body').onclick = (e) => {
    const t = e.target.closest('.tab');
    if (t) { openStation(t.dataset.stab); return; }
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'sell') sellOre();
    else if (b.dataset.buy) {
      const k = b.dataset.buy;
      if (s.credits >= PRICES[k]) { s.credits -= PRICES[k]; s.items[k] = (s.items[k] || 0) + 1; }
    } else if (b.dataset.upg) {
      const k = b.dataset.upg, c = upgCost(k);
      if (s.credits >= c && upg(k) < UPG_MAX) {
        s.credits -= c;
        s.upgrades[k]++;
        G.player.hp = Math.min(maxHp(), G.player.hp + 30);
        log(`${k} upgraded to level ${upg(k)}.`, 'good');
      }
    } else if (b.dataset.claim !== undefined) {
      claimContract(+b.dataset.claim);
    }
    persist(true);
    openStation(tab);
  };
}

function sellOre() {
  const v = invValue();
  if (v <= 0) return;
  for (const c of G.save.contracts) {
    if (c.kind !== 'haul') continue;
    const have = G.player.inv[c.res] || 0;
    if (have > 0) c.have = Math.min(c.need, c.have + have);
  }
  G.save.credits += v;
  if (G.tripDeepest > 25) G.save.stats.runs++;
  log(`Deposited ${lootText(G.player.inv)} for ◈ ${v}.`, 'good');
  G.player.inv = {};
  G.tripDeepest = 0;
}

function claimContract(i) {
  const c = G.save.contracts[i];
  if (!c || c.have < c.need) return;
  G.save.credits += c.reward;
  log(`Contract complete: ${c.title}. ◈ ${c.reward}.`, 'good');
  G.save.contracts.splice(i, 1);
  refreshContracts(G.save);
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
      ? '<p style="margin-top:14px"><b>Beacon link</b> <span class="dim">— 25 fuel</span></p>' + others.map((x) =>
        `<div class="shop-row"><div class="info"><b>Outpost ${outpostName(x)}</b><small>${x.depth} m · level ${outpostLevel(x)}</small></div>
         <button data-travel="${G.save.outposts.indexOf(x)}" ${G.player.fuel < 25 ? 'disabled' : ''}>Travel</button></div>`).join('')
      : '<p class="dim">Beacon link online, but there is nowhere else to link to yet.</p>';
  }

  openPanel(`Outpost ${outpostName(o)} · ${o.depth} m`, `
    <p class="dim">Level ${lvl}${eta ? ` · next level in ${fmtTime(eta)}` : ' · fully grown'}.
    Outposts mature on their own, whether or not you are down here.</p>
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
  if (G.msgs.length > 5) G.msgs.shift();
  const el = document.getElementById('log');
  el.innerHTML = '';
  for (const m of G.msgs) {
    const d = document.createElement('div');
    d.textContent = m.text;
    if (m.kind) d.className = m.kind;
    el.appendChild(d);
  }
}

/* ------------------------------------------------- spawning and atmosphere */

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
    const elite = Math.random() < 0.05 + depth / 12000;
    G.mobs.push(makeMob(type, tx + 0.5 - d.w / 2, ty + 1 - d.h, elite));
    return;
  }
}

function contacts(dt) {
  const p = G.player;
  for (const m of G.mobs) {
    const d = MOBS[m.type];
    if (p.x < m.x + m.w && p.x + p.w > m.x && p.y < m.y + m.h && p.y + p.h > m.y) {
      if (p.invuln <= 0) {
        hurt(d.dmg * (m.elite ? 1.6 : 1), d.name.toLowerCase());
        p.vx = Math.sign(p.x - m.x) * 7;
        p.vy = -5;
      }
      if (d.drainsFuel) p.fuel = Math.max(0, p.fuel - 14 * dt);
    }
  }
}

function ambientMotes(dt) {
  const m = G.zone.motes;
  if (!m) return;
  G.moteCd -= dt * m.rate;
  if (G.moteCd > 0) return;
  G.moteCd = 0.12;
  const vw = G.W / TILE, vh = G.H / TILE;
  const x = G.cam.x + (Math.random() - 0.5) * vw;
  const y = G.cam.y + (Math.random() - 0.5) * vh;
  if (G.world.isSolid(Math.floor(x), Math.floor(y))) return;
  spawnParticles(G.particles, x, y, 1, m.color, {
    life: 3.5, spread: m.drift, size: 0.07, alpha: 0.5,
    gravity: m.rise ? -0.5 : 0.2, drag: 0.4,
  });
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
    el.textContent = `${s.runs} runs · deepest ${s.deepest} m · ${G.save.outposts.length} outposts standing · `
      + `${G.save.relics.length}/${RELICS.length} relics · ${G.save.remains.length} sets of remains below.`;
  }
}

/* ---------------------------------------------------------------- HUD sync */

const hudCache = {};
function setText(id, v) {
  if (hudCache[id] === v) return;
  hudCache[id] = v;
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}

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
  const carried = lootText(p.inv);
  setText('carry', carried === 'nothing' ? 'satchel empty' : `${carried} · ◈ ${invValue()}`);

  document.querySelectorAll('#hotbar .slot').forEach((el, i) => {
    const b = BUILDS[i];
    if (b.throw) {
      const n = G.save.items[b.item] || 0;
      el.classList.toggle('poor', n <= 0);
      const cnt = el.querySelector('em');
      if (cnt) cnt.textContent = `×${n}`;
    } else {
      el.classList.toggle('poor', !hasCost(b.cost));
    }
  });

  const promptEl = document.getElementById('prompt');
  let prompt = '';
  if (nearbyTile(T.CHEST, 2.6)) prompt = '[E] Open supply cache';
  else if (nearbyTile(T.RELIC_PEDESTAL, 2.6)) prompt = '[E] Take what is on the pedestal';
  else {
    const dStation = Math.hypot(STATION_X + 0.5 - (p.x + p.w / 2), (SURFACE_Y - 1) - (p.y + p.h / 2));
    if (dStation < 6) prompt = '[E] Surface Station — sell, restock, take contracts';
    else if (nearestOutpost(6.5)) prompt = '[E] Outpost';
  }
  promptEl.textContent = prompt;
  promptEl.classList.toggle('hidden', !prompt);

  const alertEl = document.getElementById('alert');
  alertEl.textContent = G.alert;
  alertEl.classList.toggle('hidden', !G.alert);
}

/* ------------------------------------------------------------- depth gauge */

function drawGauge() {
  const cv = document.getElementById('gauge');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const w = cv.width / G.dpr, h = cv.height / G.dpr;
  ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const top = 12, bot = h - 12;
  const yOf = (d) => top + (bot - top) * clamp(d / MAX_DEPTH, 0, 1);

  ZONES.forEach((z, i) => {
    const y1 = yOf(z.from), y2 = yOf(i + 1 < ZONES.length ? ZONES[i + 1].from : MAX_DEPTH);
    const c = z.ambientColor;
    ctx.fillStyle = `rgba(${(c[0] * 190) | 0},${(c[1] * 190) | 0},${(c[2] * 190) | 0},0.35)`;
    ctx.fillRect(9, y1, 8, Math.max(1, y2 - y1));
  });
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.strokeRect(9.5, top - 0.5, 8, bot - top + 1);

  // deepest ever
  const dy = yOf(G.save.stats.deepest);
  ctx.strokeStyle = 'rgba(240,204,99,0.75)';
  ctx.beginPath(); ctx.moveTo(4, dy); ctx.lineTo(22, dy); ctx.stroke();

  for (const o of G.save.outposts) {
    const y = yOf(o.depth);
    ctx.fillStyle = '#5fd6be';
    ctx.fillRect(6, y - 1.5, 3, 3);
  }
  for (const r of G.save.remains) {
    const y = yOf(r.depth);
    ctx.fillStyle = r.mine ? 'rgba(240,204,99,0.9)' : 'rgba(216,210,194,0.5)';
    ctx.fillRect(18, y - 1, 3, 2);
  }
  const py = yOf(playerDepth());
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(2, py); ctx.lineTo(8, py - 4); ctx.lineTo(8, py + 4);
  ctx.closePath(); ctx.fill();
}

init();

// Handy for poking at the game from the browser console.
G.depthNow = playerDepth;
G.hurt = hurt;
G.log = log;
G.explode = explode;
window.__DM = G;
