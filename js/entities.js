// Creatures, particles and the shared tile-collision body solver.
import { TILES } from './tiles.js';
import { clamp } from './util.js';

const EPS = 1e-6;

export const MOBS = {
  crawler: {
    name: 'Rock Crawler', hp: 24, dmg: 9, w: 1.0, h: 0.75, speed: 3.4, fly: false,
    color: '#8d6b4f', eye: '#ffd27a',
  },
  wisp: {
    name: 'Shard Wisp', hp: 16, dmg: 12, w: 0.85, h: 0.85, speed: 2.3, fly: true,
    color: '#8fd8f2', eye: '#ffffff', glow: 3, lc: [0.55, 0.85, 1],
  },
  sporeling: {
    name: 'Sporeling', hp: 20, dmg: 8, w: 0.9, h: 0.9, speed: 2.6, fly: false, hop: true,
    color: '#a7d98a', eye: '#3d5e2c', burst: true,
  },
  slug: {
    name: 'Ember Slug', hp: 52, dmg: 17, w: 1.3, h: 0.85, speed: 1.5, fly: false,
    color: '#e2703a', eye: '#fff0b0', glow: 3.5, lc: [1, 0.5, 0.25],
  },
  wraith: {
    name: 'Static Wraith', hp: 32, dmg: 7, w: 1.0, h: 1.5, speed: 2.0, fly: true, ghost: true,
    color: '#b39cf0', eye: '#ffffff', glow: 2.6, lc: [0.7, 0.55, 1], drainsFuel: true,
  },
};

export function makeMob(type, x, y, elite = false) {
  const d = MOBS[type];
  const scale = elite ? 1.4 : 1;
  return {
    type, x, y, w: d.w * scale, h: d.h * scale, vx: 0, vy: 0,
    hp: d.hp * (elite ? 3.4 : 1), maxHp: d.hp * (elite ? 3.4 : 1),
    onGround: false, ghost: !!d.ghost, elite,
    dir: Math.random() < 0.5 ? -1 : 1, t: Math.random() * 6, hurt: 0, dead: false,
  };
}

function solidAt(world, x, y) {
  return TILES[world.getTile(x, y)].solid;
}

// Moves an AABB (tile units, x/y = top-left) and resolves against solid tiles.
export function moveBody(world, b, dx, dy) {
  const res = { hitX: false, ground: false, ceil: false, impactY: 0 };
  b.x += dx;
  if (!b.ghost && dx !== 0) {
    const y0 = Math.floor(b.y), y1 = Math.floor(b.y + b.h - EPS);
    if (dx > 0) {
      const tx = Math.floor(b.x + b.w - EPS);
      for (let ty = y0; ty <= y1; ty++) {
        if (solidAt(world, tx, ty)) { b.x = tx - b.w - EPS; b.vx = 0; res.hitX = true; break; }
      }
    } else {
      const tx = Math.floor(b.x);
      for (let ty = y0; ty <= y1; ty++) {
        if (solidAt(world, tx, ty)) { b.x = tx + 1 + EPS; b.vx = 0; res.hitX = true; break; }
      }
    }
  }
  b.y += dy;
  if (!b.ghost && dy !== 0) {
    const x0 = Math.floor(b.x), x1 = Math.floor(b.x + b.w - EPS);
    if (dy > 0) {
      const ty = Math.floor(b.y + b.h - EPS);
      for (let tx = x0; tx <= x1; tx++) {
        if (solidAt(world, tx, ty)) {
          res.impactY = b.vy; b.y = ty - b.h - EPS; b.vy = 0; res.ground = true; break;
        }
      }
    } else {
      const ty = Math.floor(b.y);
      for (let tx = x0; tx <= x1; tx++) {
        if (solidAt(world, tx, ty)) {
          res.impactY = b.vy; b.y = ty + 1 + EPS; b.vy = 0; res.ceil = true; break;
        }
      }
    }
  }
  return res;
}

export function groundedCheck(world, b) {
  const x0 = Math.floor(b.x), x1 = Math.floor(b.x + b.w - EPS);
  const ty = Math.floor(b.y + b.h + 0.05);
  for (let tx = x0; tx <= x1; tx++) if (solidAt(world, tx, ty)) return true;
  return false;
}

export function updateMob(m, G, dt) {
  const d = MOBS[m.type];
  const p = G.player;
  const zone = G.zone;
  m.t += dt;
  if (m.hurt > 0) m.hurt -= dt;

  const dx = (p.x + p.w / 2) - (m.x + m.w / 2);
  const dy = (p.y + p.h / 2) - (m.y + m.h / 2);
  const dist = Math.hypot(dx, dy);
  const aware = dist < 17;
  const speed = d.speed * (m.elite ? 1.15 : 1);

  if (d.fly) {
    const wobble = Math.sin(m.t * 2.2) * 0.6;
    if (aware) {
      m.vx += (Math.sign(dx) * speed - m.vx) * Math.min(1, dt * 1.6);
      m.vy += ((Math.sign(dy) * speed * 0.7 + wobble) - m.vy) * Math.min(1, dt * 1.6);
    } else {
      m.vx += (m.dir * speed * 0.4 - m.vx) * Math.min(1, dt * 1.2);
      m.vy = wobble;
    }
    const r = moveBody(G.world, m, m.vx * dt, m.vy * dt);
    if (r.hitX) m.dir = -m.dir;
  } else {
    const g = 24 * zone.gravity * G.gravitySign;
    m.vy = clamp(m.vy + g * dt, -30, 30);
    if (aware) m.dir = Math.sign(dx) || m.dir;
    const target = m.dir * speed * (aware ? 1 : 0.45);
    m.vx += (target - m.vx) * Math.min(1, dt * 6);
    if (d.hop && m.onGround && m.t % 1.2 < dt) m.vy = -9 * zone.jump;
    const r = moveBody(G.world, m, m.vx * dt, m.vy * dt);
    m.onGround = r.ground;
    if (r.hitX) {
      // Step up a single block, otherwise turn around.
      if (m.onGround && !solidAt(G.world, Math.floor(m.x + m.w / 2 + m.dir), Math.floor(m.y + m.h - 1.2))) {
        m.vy = -8 * zone.jump;
      } else m.dir = -m.dir;
    }
    if (!r.ground && !groundedCheck(G.world, m)) m.onGround = false;
  }
  return d;
}

export function spawnParticles(list, x, y, n, color, opts = {}) {
  const spread = opts.spread ?? 5;
  const life = opts.life ?? 0.6;
  const grav = opts.gravity ?? 18;
  const size = opts.size ?? 0.14;
  for (let i = 0; i < n; i++) {
    list.push({
      x, y,
      vx: (Math.random() - 0.5) * spread + (opts.vx || 0),
      vy: (Math.random() - 0.5) * spread - (opts.up || 0),
      life: life * (0.6 + Math.random() * 0.8),
      max: life,
      color, size: size * (0.6 + Math.random()),
      gravity: grav,
      alpha: opts.alpha ?? 1,
      shrink: opts.shrink ?? false,
      drag: opts.drag ?? 0,
    });
  }
  if (list.length > 1200) list.splice(0, list.length - 1200);
}

export function updateParticles(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life -= dt;
    if (p.life <= 0) { list.splice(i, 1); continue; }
    p.vy += p.gravity * dt;
    if (p.drag) {
      const f = Math.pow(1 - p.drag, dt);
      p.vx *= f; p.vy *= f;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}
