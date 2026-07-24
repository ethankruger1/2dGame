// Rendering: textured tiles, parallax backdrops, a smooth coloured lightmap,
// bloom, and every procedurally drawn sprite in the game.
import { clamp, lerp, hash2, shade, mulberry32 } from './util.js';
import { T, TILES, ZONES, SURFACE_Y, zoneIndex } from './tiles.js';
import { MOBS } from './entities.js';

export const TILE = 24;

const TEX_VARIANTS = 4;
const textures = new Map();   // `${tileId}:${v}` -> canvas
const bgTextures = new Map(); // zoneIndex -> canvas
const parallax = new Map();   // `${zoneIndex}:${layer}` -> canvas

/* ------------------------------------------------------------ textures */

function surf(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function speckle(ctx, col, rnd, n, size, spread) {
  for (let i = 0; i < n; i++) {
    const m = 1 + (rnd() - 0.5) * spread;
    ctx.fillStyle = shade(col, m);
    const s = size * (0.5 + rnd());
    ctx.fillRect(rnd() * TILE, rnd() * TILE, s, s);
  }
}

function buildTexture(id, v) {
  const def = TILES[id];
  const c = surf(TILE, TILE);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(id * 977 + v * 31 + 7);
  const col = def.color;
  ctx.fillStyle = shade(col, 1);
  ctx.fillRect(0, 0, TILE, TILE);

  if (def.tex === 'soil') {
    speckle(ctx, col, rnd, 26, 4, 0.34);
  } else if (def.tex === 'ore') {
    // dark host rock with bright crystals of the ore colour
    ctx.fillStyle = shade(col, 0.42);
    ctx.fillRect(0, 0, TILE, TILE);
    speckle(ctx, col, rnd, 10, 3, 0.16);
    for (let i = 0; i < 3; i++) {
      const x = rnd() * (TILE - 11) + 3, y = rnd() * (TILE - 11) + 3;
      const s = 6 + rnd() * 4;
      ctx.fillStyle = shade(col, 1.05 + rnd() * 0.3);
      ctx.beginPath();
      ctx.moveTo(x + s / 2, y);
      ctx.lineTo(x + s, y + s / 2);
      ctx.lineTo(x + s / 2, y + s);
      ctx.lineTo(x, y + s / 2);
      ctx.closePath();
      ctx.fill();
    }
  } else if (def.tex === 'plank') {
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = shade(col, 0.8 + i * 0.13);
      ctx.fillRect(0, i * (TILE / 3), TILE, TILE / 3 - 1);
    }
    speckle(ctx, col, rnd, 8, 2, 0.3);
  } else if (def.tex === 'hard') {
    speckle(ctx, col, rnd, 30, 3, 0.18);
  } else {
    // generic rock: mottling plus a couple of hairline cracks
    speckle(ctx, col, rnd, 22, 5, 0.26);
    ctx.strokeStyle = shade(col, 0.72);
    ctx.lineWidth = 1;
    ctx.beginPath();
    let x = rnd() * TILE, y = 0;
    ctx.moveTo(x, y);
    while (y < TILE) { x += (rnd() - 0.5) * 7; y += 5; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  return c;
}

function tex(id, v) {
  const k = id + ':' + v;
  let c = textures.get(k);
  if (!c) { c = buildTexture(id, v); textures.set(k, c); }
  return c;
}

function bgTexture(zi) {
  let c = bgTextures.get(zi);
  if (c) return c;
  const zone = ZONES[zi];
  const col = TILES[zone.stone].color;
  c = surf(TILE * 4, TILE * 4);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(zi * 7717 + 3);
  ctx.fillStyle = shade(col, 0.3);
  ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = shade(col, 0.22 + rnd() * 0.16);
    const s = 3 + rnd() * 9;
    ctx.fillRect(rnd() * c.width, rnd() * c.height, s, s);
  }
  // faint chisel marks, as if the wall was cut by hand
  ctx.strokeStyle = shade(col, 0.38, 0.5);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * c.width, y = rnd() * c.height;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 4 + rnd() * 6, y + (rnd() - 0.5) * 4);
    ctx.stroke();
  }
  bgTextures.set(zi, c);
  return c;
}

function parallaxLayer(zi, layer) {
  const k = zi + ':' + layer;
  let c = parallax.get(k);
  if (c) return c;
  const zone = ZONES[zi];
  const base = layer === 0 ? zone.parallax.color : zone.parallax.color2;
  const col = { r: base[0], g: base[1], b: base[2] };
  const W = 520, H = 420;
  c = surf(W, H);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(zi * 131 + layer * 17 + 5);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = shade(col, 1);

  const shape = zone.parallax.shape;
  const n = shape === 'void' ? 7 : 12;
  for (let i = 0; i < n; i++) {
    const x = rnd() * W;
    const w = 26 + rnd() * 70;
    if (shape === 'columns') {
      const top = rnd() * 60;
      const h = 150 + rnd() * 240;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x + w, top);
      ctx.lineTo(x + w * 0.62, top + h);
      ctx.lineTo(x + w * 0.38, top + h);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();                        // stalagmite below
      ctx.moveTo(x, H);
      ctx.lineTo(x + w, H);
      ctx.lineTo(x + w * 0.6, H - 60 - rnd() * 160);
      ctx.closePath();
      ctx.fill();
    } else if (shape === 'shards') {
      const y = rnd() * H;
      const h = 60 + rnd() * 190;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w * 0.5, y - 20 - rnd() * 40);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w * 0.7, y + h);
      ctx.lineTo(x + w * 0.3, y + h);
      ctx.closePath();
      ctx.fill();
    } else if (shape === 'fungus') {
      const y = 80 + rnd() * (H - 120);
      const stalk = 40 + rnd() * 120;
      ctx.fillRect(x + w * 0.4, y, w * 0.2, stalk);
      ctx.beginPath();
      ctx.ellipse(x + w * 0.5, y, w * 0.75, w * 0.4, 0, Math.PI, 0);
      ctx.fill();
    } else {
      const y = rnd() * H;
      ctx.beginPath();
      ctx.ellipse(x, y, w, w * (0.4 + rnd() * 0.8), rnd() * 3, 0, 7);
      ctx.fill();
    }
  }
  parallax.set(k, c);
  return c;
}

/* ------------------------------------------------------------- lightmap */

let lightCanvas = null, lightCtx = null, lightData = null;
let lw = 0, lh = 0, lbuf = null, ids = null;

export function resizeRender(G) {
  lw = Math.ceil(G.W / TILE) + 4;
  lh = Math.ceil(G.H / TILE) + 4;
  lbuf = new Float32Array(lw * lh * 3);
  ids = new Int16Array(lw * lh);
  lightCanvas = surf(lw, lh);
  lightCtx = lightCanvas.getContext('2d');
  lightData = lightCtx.createImageData(lw, lh);
  G.lw = lw; G.lh = lh;
  G.vignette = null;
}

function splat(cx, cy, radius, power, lc, x0, y0) {
  if (radius <= 0) return;
  const ax = Math.max(0, Math.floor(cx - radius) - x0), bx = Math.min(lw - 1, Math.ceil(cx + radius) - x0);
  const ay = Math.max(0, Math.floor(cy - radius) - y0), by = Math.min(lh - 1, Math.ceil(cy + radius) - y0);
  const inv = 1 / radius;
  for (let iy = ay; iy <= by; iy++) {
    const dy = (y0 + iy + 0.5) - cy;
    for (let ix = ax; ix <= bx; ix++) {
      const dx = (x0 + ix + 0.5) - cx;
      const d = Math.sqrt(dx * dx + dy * dy) * inv;
      if (d >= 1) continue;
      const f = (1 - d) * (0.5 + 0.5 * (1 - d)) * power;
      const i = (iy * lw + ix) * 3;
      lbuf[i] += f * lc[0];
      lbuf[i + 1] += f * lc[1];
      lbuf[i + 2] += f * lc[2];
    }
  }
}

// One getTile per visible tile per frame; every pass reads this instead.
function readTiles(G, x0, y0) {
  for (let iy = 0; iy < lh; iy++) {
    const row = iy * lw;
    for (let ix = 0; ix < lw; ix++) ids[row + ix] = G.world.getTile(x0 + ix, y0 + iy);
  }
}

function idAt(G, tx, ty, x0, y0) {
  const ix = tx - x0, iy = ty - y0;
  if (ix < 0 || iy < 0 || ix >= lw || iy >= lh) return G.world.getTile(tx, ty);
  return ids[iy * lw + ix];
}

function buildLight(G, x0, y0) {
  const zone = G.zone;
  const ac = zone.ambientColor;
  for (let iy = 0; iy < lh; iy++) {
    const d = (y0 + iy) - SURFACE_Y;
    const amb = d <= 0 ? 1 : d < 12 ? lerp(1, zone.ambient, d / 12) : zone.ambient;
    for (let ix = 0; ix < lw; ix++) {
      const i = (iy * lw + ix) * 3;
      lbuf[i] = amb * (d <= 0 ? 1 : ac[0]);
      lbuf[i + 1] = amb * (d <= 0 ? 1 : ac[1]);
      lbuf[i + 2] = amb * (d <= 0 ? 1 : ac[2]);
    }
  }

  const sources = [];
  let count = 0;
  for (let iy = 0; iy < lh && count < 110; iy++) {
    for (let ix = 0; ix < lw && count < 110; ix++) {
      const tx = x0 + ix, ty = y0 + iy;
      const def = TILES[ids[iy * lw + ix]];
      if (!def.glow) continue;
      let r = def.glow;
      if (def.id === T.LAVA || def.id === T.EMBER_VENT) {
        r *= 0.9 + 0.12 * Math.sin(G.time * 3 + tx * 0.7 + ty);
      } else if (def.id === T.TORCH) {
        r *= 0.92 + 0.1 * Math.sin(G.time * 9 + tx);
      }
      splat(tx + 0.5, ty + 0.5, r, 0.95, def.lc, x0, y0);
      if (r > 2.2 && sources.length < 26) sources.push({ x: tx + 0.5, y: ty + 0.5, r, lc: def.lc });
      count++;
    }
  }

  for (const m of G.mobs) {
    const g = MOBS[m.type].glow;
    if (!g) continue;
    const r = g * (m.elite ? 1.6 : 1);
    splat(m.x + m.w / 2, m.y + m.h / 2, r, 0.8, MOBS[m.type].lc || [1, 0.8, 0.6], x0, y0);
    sources.push({ x: m.x + m.w / 2, y: m.y + m.h / 2, r, lc: MOBS[m.type].lc || [1, 0.8, 0.6] });
  }

  for (const p of G.projectiles) {
    if (!p.glow) continue;
    splat(p.x, p.y, p.glow, 0.95, p.lc, x0, y0);
    sources.push({ x: p.x, y: p.y, r: p.glow, lc: p.lc });
  }

  // the player's lamp: a soft pool plus a cone thrown the way they face
  const pl = G.player;
  if (pl) {
    const cx = pl.x + pl.w / 2, cy = pl.y + pl.h * 0.28;
    const frac = pl.fuel / 100;
    const flick = 1 + Math.sin(G.time * 11) * 0.02 * (1 - frac);
    const rad = G.lampRadius * (0.34 + 0.66 * frac) * flick;
    splat(cx, cy, Math.max(2, rad * 0.62), 1.0, [1, 0.93, 0.78], x0, y0);
    splat(cx + pl.facing * rad * 0.45, cy, Math.max(2, rad), 0.85, [1, 0.9, 0.72], x0, y0);
    sources.push({ x: cx, y: cy, r: rad * 0.8, lc: [1, 0.92, 0.76] });
  }

  const px = lightData.data;
  for (let i = 0, j = 0; i < lw * lh; i++, j += 3) {
    px[i * 4] = Math.min(255, lbuf[j] * 255);
    px[i * 4 + 1] = Math.min(255, lbuf[j + 1] * 255);
    px[i * 4 + 2] = Math.min(255, lbuf[j + 2] * 255);
    px[i * 4 + 3] = 255;
  }
  lightCtx.putImageData(lightData, 0, 0);
  return sources;
}

function lightAt(tx, ty, x0, y0) {
  const ix = tx - x0, iy = ty - y0;
  if (ix < 0 || iy < 0 || ix >= lw || iy >= lh) return 0;
  const i = (iy * lw + ix) * 3;
  return (lbuf[i] + lbuf[i + 1] + lbuf[i + 2]) / 3;
}

/* --------------------------------------------------------------- sprites */

function drawTileSpecial(ctx, G, id, sx, sy, tx, ty) {
  const t = G.time;
  switch (id) {
    case T.LAVA: {
      const wob = Math.sin(t * 2 + tx * 0.9) * 2;
      ctx.fillStyle = '#8c2a0e';
      ctx.fillRect(sx, sy, TILE, TILE);
      ctx.fillStyle = '#e2601e';
      ctx.fillRect(sx, sy + 3 + wob, TILE, TILE - 3 - wob);
      ctx.fillStyle = '#ffb347';
      ctx.fillRect(sx, sy + 5 + wob, TILE, 3);
      break;
    }
    case T.EMBER_VENT: {
      ctx.fillStyle = '#3a1a12';
      ctx.fillRect(sx + 4, sy + TILE - 8, TILE - 8, 8);
      ctx.fillStyle = `rgba(255,150,60,${0.5 + 0.4 * Math.sin(t * 5 + tx)})`;
      ctx.fillRect(sx + 7, sy + TILE - 14, TILE - 14, 8);
      break;
    }
    case T.LADDER: {
      ctx.strokeStyle = '#b08c5e';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(sx + 5, sy); ctx.lineTo(sx + 5, sy + TILE);
      ctx.moveTo(sx + TILE - 5, sy); ctx.lineTo(sx + TILE - 5, sy + TILE);
      ctx.moveTo(sx + 5, sy + TILE * 0.3); ctx.lineTo(sx + TILE - 5, sy + TILE * 0.3);
      ctx.moveTo(sx + 5, sy + TILE * 0.78); ctx.lineTo(sx + TILE - 5, sy + TILE * 0.78);
      ctx.stroke();
      break;
    }
    case T.TORCH: {
      ctx.fillStyle = '#6b4a2a';
      ctx.fillRect(sx + TILE / 2 - 1.5, sy + TILE * 0.45, 3, TILE * 0.55);
      const f = 4 + Math.sin(t * 13 + tx) * 1.2;
      const g = ctx.createRadialGradient(sx + TILE / 2, sy + TILE * 0.4, 0, sx + TILE / 2, sy + TILE * 0.4, f * 2);
      g.addColorStop(0, '#fff2b0');
      g.addColorStop(0.5, '#ffb43c');
      g.addColorStop(1, 'rgba(255,120,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx + TILE / 2, sy + TILE * 0.4, f * 2, 0, 7); ctx.fill();
      break;
    }
    case T.CRYSTAL_CLUSTER: {
      const col = ['#8fd8f2', '#b9ecff', '#6fc0e8'];
      for (let i = 0; i < 3; i++) {
        const bx = sx + 5 + i * 5, by = sy + TILE;
        const h = 8 + ((tx * 7 + i * 13) % 9);
        ctx.fillStyle = col[i];
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + 4, by);
        ctx.lineTo(bx + 2, by - h);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case T.MUSHROOM:
    case T.GLOWCAP: {
      const capCol = id === T.GLOWCAP ? '#7ee8a8' : '#c67696';
      ctx.fillStyle = '#d8d2c0';
      ctx.fillRect(sx + TILE / 2 - 2, sy + TILE - 9, 4, 9);
      ctx.fillStyle = capCol;
      ctx.beginPath();
      ctx.ellipse(sx + TILE / 2, sy + TILE - 9, 7, 5, 0, Math.PI, 0);
      ctx.fill();
      break;
    }
    case T.SPORE_VENT: {
      ctx.fillStyle = `rgba(150,110,190,${0.45 + 0.25 * Math.sin(t * 2 + tx)})`;
      ctx.beginPath(); ctx.arc(sx + TILE / 2, sy + TILE / 2, 7, 0, 7); ctx.fill();
      break;
    }
    case T.FUEL_CRYSTAL: {
      ctx.fillStyle = '#f2e284';
      ctx.beginPath();
      ctx.moveTo(sx + TILE / 2, sy + 2);
      ctx.lineTo(sx + TILE - 3, sy + TILE / 2);
      ctx.lineTo(sx + TILE / 2, sy + TILE - 2);
      ctx.lineTo(sx + 3, sy + TILE / 2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,220,0.75)';
      ctx.fillRect(sx + TILE / 2 - 1, sy + 5, 2, TILE - 10);
      break;
    }
    case T.CHEST: {
      ctx.fillStyle = '#6a4a2a';
      ctx.fillRect(sx + 2, sy + 7, TILE - 4, TILE - 8);
      ctx.fillStyle = '#96703f';
      ctx.fillRect(sx + 2, sy + 4, TILE - 4, 6);
      ctx.fillStyle = '#e0c060';
      ctx.fillRect(sx + TILE / 2 - 2, sy + 9, 4, 5);
      ctx.strokeStyle = '#4a3220';
      ctx.strokeRect(sx + 2.5, sy + 4.5, TILE - 5, TILE - 5);
      break;
    }
    case T.RELIC_PEDESTAL: {
      ctx.fillStyle = '#5a5670';
      ctx.fillRect(sx + 3, sy + TILE - 7, TILE - 6, 7);
      ctx.fillRect(sx + 6, sy + 8, TILE - 12, TILE - 12);
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
      ctx.fillStyle = `rgba(190,150,255,${0.5 + pulse * 0.5})`;
      ctx.beginPath();
      ctx.arc(sx + TILE / 2, sy + 6, 4 + pulse * 1.5, 0, 7);
      ctx.fill();
      break;
    }
    case T.STATION: {
      ctx.fillStyle = '#26344a';
      ctx.fillRect(sx - TILE, sy - TILE * 2, TILE * 3, TILE * 3);
      ctx.fillStyle = '#31445f';
      ctx.fillRect(sx - TILE * 1.2, sy - TILE * 2.4, TILE * 3.4, TILE * 0.5);
      ctx.fillStyle = '#7cc2f0';
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = 0.45 + 0.5 * Math.abs(Math.sin(t * 1.4 + i));
        ctx.fillRect(sx - TILE * 0.7 + i * TILE, sy - TILE * 1.5, TILE * 0.5, TILE * 0.5);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#dfe7f2';
      ctx.fillRect(sx - TILE * 0.6, sy - TILE * 0.5, TILE * 2.2, 3);
      break;
    }
    case T.OUTPOST: {
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
      ctx.fillStyle = '#173733';
      ctx.fillRect(sx - 3, sy - 3, TILE + 6, TILE + 6);
      ctx.fillStyle = '#5fd6be';
      ctx.fillRect(sx + 4, sy + 4, TILE - 8, TILE - 8);
      ctx.strokeStyle = `rgba(120,240,215,${0.3 + pulse * 0.5})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx + TILE / 2, sy + TILE / 2, TILE * (0.85 + pulse * 0.45), 0, 7);
      ctx.stroke();
      break;
    }
    default: break;
  }
}

function drawRemains(ctx, G, r, ox, oy, l) {
  const sx = ox + r.x * TILE, sy = oy + r.y * TILE;
  ctx.save();
  ctx.globalAlpha = clamp(0.3 + l * 1.6, 0.3, 1);
  const bone = r.mine ? '#f0d47a' : '#d8d2c2';
  ctx.fillStyle = bone;
  ctx.beginPath();
  ctx.arc(sx + TILE / 2, sy + TILE * 0.55, TILE * 0.2, 0, 7);
  ctx.fill();
  ctx.fillRect(sx + TILE * 0.3, sy + TILE * 0.7, TILE * 0.4, TILE * 0.14);
  ctx.fillRect(sx + TILE * 0.16, sy + TILE * 0.76, TILE * 0.68, 3);
  ctx.fillStyle = '#0d1016';
  ctx.fillRect(sx + TILE * 0.4, sy + TILE * 0.5, 3, 3);
  ctx.fillRect(sx + TILE * 0.56, sy + TILE * 0.5, 3, 3);
  // a lamp still burning beside them
  const puff = 0.4 + 0.35 * Math.sin(G.time * 2 + r.x);
  ctx.globalAlpha *= puff;
  ctx.fillStyle = r.mine ? '#f0cc63' : '#8fd8f2';
  ctx.beginPath();
  ctx.arc(sx + TILE * 0.82, sy + TILE * 0.72, 3, 0, 7);
  ctx.fill();
  ctx.restore();
}

function drawMob(ctx, G, m, ox, oy) {
  const d = MOBS[m.type];
  const x = ox + m.x * TILE, y = oy + m.y * TILE;
  const w = m.w * TILE, h = m.h * TILE;
  const t = m.t;
  ctx.save();
  if (m.elite) {
    ctx.shadowColor = d.color;
    ctx.shadowBlur = 14;
  }
  const body = m.hurt > 0 ? '#ffffff' : d.color;

  if (m.type === 'crawler') {
    ctx.strokeStyle = shade({ r: 60, g: 44, b: 32 }, 1);
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const px = x + w * (0.2 + i * 0.3);
      const swing = Math.sin(t * 9 + i) * 4;
      ctx.beginPath();
      ctx.moveTo(px, y + h * 0.6);
      ctx.lineTo(px + swing, y + h + 5);
      ctx.stroke();
    }
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h * 0.55, w * 0.5, h * 0.55, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = shade({ r: 40, g: 30, b: 22 }, 1);
    ctx.fillRect(x + w * 0.2, y + h * 0.1, w * 0.6, 3);
    ctx.fillStyle = d.eye;
    const ex = m.dir > 0 ? x + w * 0.66 : x + w * 0.22;
    ctx.fillRect(ex, y + h * 0.32, 4, 3);
  } else if (m.type === 'wisp') {
    const spin = t * 2.2;
    for (let i = 0; i < 4; i++) {
      const a = spin + (i * Math.PI) / 2;
      const rr = w * (0.32 + 0.12 * Math.sin(t * 3 + i));
      ctx.fillStyle = i % 2 ? body : shade({ r: 200, g: 240, b: 255 }, 1);
      ctx.save();
      ctx.translate(x + w / 2 + Math.cos(a) * rr, y + h / 2 + Math.sin(a) * rr);
      ctx.rotate(a);
      ctx.fillRect(-3, -5, 6, 10);
      ctx.restore();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, 3.5, 0, 7);
    ctx.fill();
  } else if (m.type === 'sporeling') {
    const squash = m.onGround ? 1 + Math.sin(t * 8) * 0.08 : 0.9;
    ctx.fillStyle = '#e8e0c8';
    ctx.fillRect(x + w * 0.35, y + h * 0.45, w * 0.3, h * 0.55);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h * 0.45, w * 0.55 * squash, h * 0.42, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#3d5e2c';
    ctx.fillRect(x + w * 0.4, y + h * 0.62, 3, 3);
    ctx.fillRect(x + w * 0.58, y + h * 0.62, 3, 3);
  } else if (m.type === 'slug') {
    ctx.fillStyle = '#4a2118';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h * 0.6, w * 0.52, h * 0.5, 0, 0, 7);
    ctx.fill();
    for (let i = 0; i < 4; i++) {
      const gl = 0.4 + 0.4 * Math.sin(t * 4 + i * 1.7);
      ctx.fillStyle = `rgba(255,${100 + gl * 90},40,${0.55 + gl * 0.4})`;
      ctx.fillRect(x + w * (0.16 + i * 0.2), y + h * (0.3 + 0.1 * Math.sin(t * 3 + i)), w * 0.12, h * 0.3);
    }
    ctx.fillStyle = d.eye;
    const ex = m.dir > 0 ? x + w * 0.75 : x + w * 0.18;
    ctx.fillRect(ex, y + h * 0.2, 4, 4);
  } else { // wraith
    ctx.globalAlpha = 0.55 + 0.22 * Math.sin(t * 4);
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#cdb8ff');
    g.addColorStop(1, 'rgba(90,70,150,0)');
    ctx.fillStyle = m.hurt > 0 ? '#ffffff' : g;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h * 0.45);
    ctx.lineTo(x + w * 0.62, y + h);
    ctx.lineTo(x + w * 0.38, y + h);
    ctx.lineTo(x, y + h * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + w * 0.3, y + h * 0.28, 3, 5);
    ctx.fillRect(x + w * 0.58, y + h * 0.28, 3, 5);
  }
  ctx.shadowBlur = 0;

  if (m.hp < m.maxHp) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 1, y - 9, w + 2, 4);
    ctx.fillStyle = m.elite ? '#f0cc63' : '#ef6d7e';
    ctx.fillRect(x, y - 8, w * (m.hp / m.maxHp), 2);
  }
  ctx.restore();
}

function drawPick(ctx, angle, len) {
  ctx.save();
  ctx.rotate(angle);
  ctx.strokeStyle = '#0c0f15';
  ctx.lineWidth = 5.5;
  ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(len, 0); ctx.stroke();
  ctx.strokeStyle = '#8f6b42';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(len, 0); ctx.stroke();
  ctx.strokeStyle = '#0c0f15';
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(len - 3, -7); ctx.quadraticCurveTo(len + 5, 0, len - 3, 7); ctx.stroke();
  ctx.strokeStyle = '#c6ccd9';
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(len - 3, -7); ctx.quadraticCurveTo(len + 5, 0, len - 3, 7); ctx.stroke();
  ctx.restore();
}

function drawPlayer(ctx, G, ox, oy) {
  const p = G.player;
  const x = ox + p.x * TILE, y = oy + p.y * TILE;
  const w = p.w * TILE, h = p.h * TILE;
  const cx = x + w / 2;
  const f = p.facing;
  const moving = Math.abs(p.vx) > 0.6 && p.onGround;
  const phase = p.anim || 0;
  const bob = moving ? Math.abs(Math.sin(phase)) * 1.4 : Math.sin(G.time * 1.8) * 0.5;
  const swinging = G.swing > 0;
  const swingT = swinging ? clamp(1 - G.swing / 0.18, 0, 1) : 0;
  const ink = '#0b0e14';

  ctx.save();
  if (p.invuln > 0 && Math.floor(G.time * 20) % 2 === 0) ctx.globalAlpha = 0.5;

  // ground shadow
  if (p.onGround) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, y + h + 1, w * 0.5, 3, 0, 0, 7);
    ctx.fill();
  }

  const topY = y + bob;
  const headH = h * 0.26;
  const torsoY = topY + headH * 0.9;
  const torsoH = h * 0.4;
  const legY = torsoY + torsoH;

  // pickaxe rests across the back when idle
  if (!swinging) {
    ctx.save();
    ctx.translate(cx - f * 3, torsoY + torsoH * 0.35);
    ctx.scale(f, 1);
    drawPick(ctx, -2.35, 15);
    ctx.restore();
  }

  // legs
  const stride = moving ? Math.sin(phase) * 5.5 : 0;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const bx = cx + side * 3.5;
    const foot = bx + (side > 0 ? stride : -stride);
    ctx.strokeStyle = ink; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(bx, legY); ctx.lineTo(foot, y + h - 2); ctx.stroke();
    ctx.strokeStyle = '#2f3a4e'; ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.moveTo(bx, legY); ctx.lineTo(foot, y + h - 2); ctx.stroke();
    ctx.fillStyle = ink;
    ctx.fillRect(foot - 4.5, y + h - 3.5, 9, 4);
    ctx.fillStyle = '#98a4b8';
    ctx.fillRect(foot - 3.5, y + h - 3, 7, 2.5);
  }

  // pack
  ctx.fillStyle = ink;
  ctx.fillRect(f > 0 ? x - 4 : x + w - 2, torsoY + 2, 6, torsoH * 0.72);
  ctx.fillStyle = '#5a4a38';
  ctx.fillRect(f > 0 ? x - 3 : x + w - 1.5, torsoY + 3, 4, torsoH * 0.62);

  // torso: outline, jacket, high-vis band, belt
  ctx.fillStyle = ink;
  ctx.fillRect(x - 1.5, torsoY - 1.5, w + 3, torsoH + 3);
  ctx.fillStyle = '#41526d';
  ctx.fillRect(x, torsoY, w, torsoH);
  ctx.fillStyle = '#57708f';
  ctx.fillRect(x, torsoY, w, 3);
  ctx.fillStyle = '#cf9a3e';
  ctx.fillRect(x, torsoY + torsoH * 0.42, w, 3);
  ctx.fillStyle = '#1d2531';
  ctx.fillRect(x, torsoY + torsoH * 0.74, w, 4);

  // head + helmet
  const hx = cx - 6, hy = topY + 1;
  ctx.fillStyle = ink;
  ctx.fillRect(hx - 1.5, hy - 1.5, 15, headH * 0.86);
  ctx.fillStyle = '#d3ab84';
  ctx.fillRect(hx, hy + headH * 0.3, 12, headH * 0.52);
  ctx.fillStyle = '#20293a';                              // goggles
  ctx.fillRect(hx + (f > 0 ? 6 : 2), hy + headH * 0.42, 5, 2.5);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';                     // chin shadow
  ctx.fillRect(hx, hy + headH * 0.68, 12, headH * 0.14);
  ctx.fillStyle = ink;
  ctx.fillRect(hx - 2, hy, 16, headH * 0.36);
  ctx.fillStyle = '#e9ad3c';                              // helmet
  ctx.fillRect(hx - 1, hy + 1, 14, headH * 0.28);
  ctx.fillStyle = '#f5c96a';
  ctx.fillRect(hx - 1, hy + 1, 14, 2);
  ctx.fillStyle = f > 0 ? '#f5c96a' : '#c98d2a';          // brim
  ctx.fillRect(f > 0 ? hx + 10 : hx - 4, hy + headH * 0.24, 5, 2.5);
  // lamp
  const lx = f > 0 ? hx + 12 : hx - 3;
  ctx.fillStyle = ink;
  ctx.fillRect(lx - 1, hy + headH * 0.08, 5, 5);
  ctx.fillStyle = '#fff4c8';
  ctx.fillRect(lx, hy + headH * 0.1, 3.5, 3.5);

  // swinging pickaxe in front, with a motion arc
  if (swinging) {
    ctx.save();
    ctx.translate(cx + f * 2, torsoY + torsoH * 0.3);
    ctx.scale(f, 1);
    const a = -1.9 + swingT * 2.5;
    ctx.strokeStyle = `rgba(220,230,245,${0.35 * (1 - swingT)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 18, a - 0.9, a);
    ctx.stroke();
    drawPick(ctx, a, 17);
    ctx.restore();
  }
  ctx.restore();
}

function drawProjectile(ctx, G, pr, ox, oy) {
  const x = ox + pr.x * TILE, y = oy + pr.y * TILE;
  ctx.save();
  if (pr.kind === 'bomb') {
    const fuse = clamp(pr.fuse / pr.maxFuse, 0, 1);
    ctx.fillStyle = '#22262e';
    ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill();
    ctx.fillStyle = `rgb(255,${Math.round(80 + 160 * fuse)},60)`;
    ctx.beginPath(); ctx.arc(x + 4, y - 7, 2.5 + (1 - fuse) * 2, 0, 7); ctx.fill();
    ctx.strokeStyle = '#8a6a45';
    ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 4, y - 8); ctx.stroke();
  } else {
    const g = ctx.createRadialGradient(x, y, 0, x, y, 10);
    g.addColorStop(0, '#fff6cf');
    g.addColorStop(1, 'rgba(255,180,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, 10, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd98a';
    ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ main */

export function renderScene(G) {
  const ctx = G.ctx;
  const shakeX = G.shake > 0 ? (Math.random() - 0.5) * G.shake * 10 : 0;
  const shakeY = G.shake > 0 ? (Math.random() - 0.5) * G.shake * 10 : 0;
  const camX = G.cam.x, camY = G.cam.y;
  const ox = Math.round(G.W / 2 - camX * TILE + shakeX);
  const oy = Math.round(G.H / 2 - camY * TILE + shakeY);
  const x0 = Math.floor(camX - G.W / TILE / 2) - 2;
  const y0 = Math.floor(camY - G.H / TILE / 2) - 2;
  const x1 = x0 + lw - 1, y1 = y0 + lh - 1;
  const zone = G.zone;
  const zi = zoneIndex(zone);

  // --- sky / deep backdrop
  const depth = camY - SURFACE_Y;
  const above = clamp(1 - depth / 30, 0, 1);
  const g = ctx.createLinearGradient(0, 0, 0, G.H);
  g.addColorStop(0, `rgb(${Math.round(8 + 26 * above)},${Math.round(10 + 34 * above)},${Math.round(18 + 58 * above)})`);
  g.addColorStop(1, `rgb(${Math.round(4 + 10 * above)},${Math.round(5 + 12 * above)},${Math.round(8 + 20 * above)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, G.W, G.H);

  if (above > 0.02) drawSky(ctx, G, ox, oy, above);
  if (!(G.dbg && G.dbg.noParallax)) drawParallax(ctx, G, zi, camX, camY, ox, oy);

  readTiles(G, x0, y0);
  const sources = buildLight(G, x0, y0);

  // --- carved wall behind everything underground (one strip per column)
  const pat = ctx.createPattern(bgTexture(zi), 'repeat');
  const pox = ox % (TILE * 4), poy = oy % (TILE * 4);
  ctx.save();
  ctx.translate(pox, poy);
  ctx.fillStyle = pat;
  for (let tx = x0; tx <= x1; tx++) {
    const top = Math.max(y0, G.world.surfaceH(tx) + 1);
    if (top > y1) continue;
    ctx.fillRect(ox + tx * TILE - pox, oy + top * TILE - poy, TILE, (y1 - top + 1) * TILE);
  }
  ctx.restore();

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const id = ids[(ty - y0) * lw + (tx - x0)];
      if (id === T.AIR) continue;
      const def = TILES[id];
      const sx = ox + tx * TILE, sy = oy + ty * TILE;
      if (def.tex) {
        const v = (hash2(tx, ty, 11) * TEX_VARIANTS) | 0;
        ctx.drawImage(tex(id, v), sx, sy);
        if (def.solid) {
          if (!TILES[idAt(G, tx, ty - 1, x0, y0)].solid) {
            ctx.fillStyle = 'rgba(255,255,255,0.14)';
            ctx.fillRect(sx, sy, TILE, 3);
          }
          if (!TILES[idAt(G, tx, ty + 1, x0, y0)].solid) {
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(sx, sy + TILE - 3, TILE, 3);
          }
          if (!TILES[idAt(G, tx - 1, ty, x0, y0)].solid) {
            ctx.fillStyle = 'rgba(0,0,0,0.16)';
            ctx.fillRect(sx, sy, 2, TILE);
          }
        }
      }
      drawTileSpecial(ctx, G, id, sx, sy, tx, ty);
      // Prospector's Eye: ore shows through the rock
      if (G.perks.eye && def.drop && def.drop[0] !== 'dirt' && def.drop[0] !== 'stone') {
        const dx = tx + 0.5 - (G.player.x + 0.36), dy = ty + 0.5 - (G.player.y + 0.86);
        const dist = Math.hypot(dx, dy);
        if (dist < 14) {
          ctx.globalAlpha = 0.35 * (1 - dist / 14);
          ctx.fillStyle = shade(def.color, 1.6);
          ctx.fillRect(sx + 2, sy + 2, TILE - 4, TILE - 4);
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  // mining damage on the target tile
  if (G.mineTile && G.mineProg > 0) {
    const sx = ox + G.mineTile.tx * TILE, sy = oy + G.mineTile.ty * TILE;
    ctx.fillStyle = `rgba(0,0,0,${0.3 * G.mineProg})`;
    ctx.fillRect(sx, sy, TILE, TILE);
    ctx.strokeStyle = `rgba(255,240,200,${0.35 + 0.5 * G.mineProg})`;
    ctx.lineWidth = 1;
    const steps = 1 + Math.floor(G.mineProg * 4);
    for (let i = 0; i < steps; i++) {
      const a = (i * 2.4) % 6.28;
      ctx.beginPath();
      ctx.moveTo(sx + TILE / 2, sy + TILE / 2);
      ctx.lineTo(sx + TILE / 2 + Math.cos(a) * TILE * 0.45, sy + TILE / 2 + Math.sin(a) * TILE * 0.45);
      ctx.stroke();
    }
  }

  for (const r of G.save.remains) {
    if (r.x < x0 - 2 || r.x > x1 + 2 || r.y < y0 - 2 || r.y > y1 + 2) continue;
    drawRemains(ctx, G, r, ox, oy, lightAt(r.x, r.y, x0, y0));
  }
  for (const m of G.mobs) drawMob(ctx, G, m, ox, oy);
  for (const pr of G.projectiles) drawProjectile(ctx, G, pr, ox, oy);
  drawPlayer(ctx, G, ox, oy);

  for (const pt of G.particles) {
    const a = clamp(pt.life / pt.max, 0, 1);
    ctx.globalAlpha = a * (pt.alpha || 1);
    ctx.fillStyle = pt.color;
    const s = pt.size * TILE * (pt.shrink ? a : 1);
    ctx.fillRect(ox + pt.x * TILE - s / 2, oy + pt.y * TILE - s / 2, s, s);
  }
  ctx.globalAlpha = 1;

  // --- lighting
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  if (!(G.dbg && G.dbg.noLight)) ctx.globalCompositeOperation = 'multiply';
  if (!(G.dbg && G.dbg.noLight)) ctx.drawImage(lightCanvas, ox + (x0 - 0.5) * TILE, oy + (y0 - 0.5) * TILE, lw * TILE, lh * TILE);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.42;
  for (const s of (G.dbg && G.dbg.noBloom ? [] : sources)) {
    const sx = ox + s.x * TILE, sy = oy + s.y * TILE;
    if (sx < -200 || sx > G.W + 200 || sy < -200 || sy > G.H + 200) continue;
    const rad = s.r * TILE * 0.85;
    const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
    grd.addColorStop(0, `rgba(${(s.lc[0] * 255) | 0},${(s.lc[1] * 255) | 0},${(s.lc[2] * 255) | 0},0.5)`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(sx - rad, sy - rad, rad * 2, rad * 2);
  }
  ctx.restore();

  // --- atmosphere
  if (zone.tint) { ctx.fillStyle = zone.tint; ctx.fillRect(0, 0, G.W, G.H); }
  if (zone.flicker) {
    ctx.fillStyle = `rgba(190,180,255,${0.02 + 0.03 * Math.abs(Math.sin(G.time * 17))})`;
    ctx.fillRect(0, 0, G.W, G.H);
  }
  if (!G.vignette) {
    const vg = ctx.createRadialGradient(G.W / 2, G.H / 2, Math.min(G.W, G.H) * 0.22,
      G.W / 2, G.H / 2, Math.max(G.W, G.H) * 0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.8)');
    G.vignette = vg;
  }
  ctx.fillStyle = G.vignette;
  ctx.fillRect(0, 0, G.W, G.H);

  if (G.player.invuln > 0.45) {
    ctx.fillStyle = `rgba(200,40,60,${(G.player.invuln - 0.45) * 0.55})`;
    ctx.fillRect(0, 0, G.W, G.H);
  }
  if (G.player.o2 < 25 && zone.oxygen) {
    const pulse = 0.12 + 0.1 * Math.sin(G.time * 4);
    ctx.fillStyle = `rgba(30,60,110,${pulse * (1 - G.player.o2 / 25)})`;
    ctx.fillRect(0, 0, G.W, G.H);
  }

  drawCursor(ctx, G, ox, oy);
}

function drawSky(ctx, G, ox, oy, above) {
  const hy = oy + SURFACE_Y * TILE;
  ctx.save();
  ctx.globalAlpha = above;
  // stars
  for (let i = 0; i < 60; i++) {
    const sx = ((i * 137.5) % G.W + ox * 0.06) % G.W;
    const sy = (i * 61) % Math.max(1, Math.min(G.H, hy));
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(G.time * 0.7 + i));
    ctx.fillStyle = `rgba(220,232,255,${0.35 * tw})`;
    ctx.fillRect(sx < 0 ? sx + G.W : sx, sy, 2, 2);
  }
  // moon
  const mx = ox * 0.04 + G.W * 0.78, my = Math.min(hy - 90, G.H * 0.2);
  const mg = ctx.createRadialGradient(mx, my, 0, mx, my, 90);
  mg.addColorStop(0, 'rgba(200,220,255,0.35)');
  mg.addColorStop(1, 'rgba(120,150,220,0)');
  ctx.fillStyle = mg;
  ctx.beginPath(); ctx.arc(mx, my, 90, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(228,238,255,0.9)';
  ctx.beginPath(); ctx.arc(mx, my, 20, 0, 7); ctx.fill();
  ctx.restore();
}

function drawParallax(ctx, G, zi, camX, camY, ox, oy) {
  const under = clamp((camY - SURFACE_Y) / 20, 0, 1);
  if (under <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = 0.85 * under;
  for (let layer = 0; layer < 2; layer++) {
    const img = parallaxLayer(zi, layer);
    const f = layer === 0 ? 0.28 : 0.52;
    const px = -((camX * TILE * f) % img.width);
    const py = -((camY * TILE * f * 0.6) % img.height);
    for (let x = px - img.width; x < G.W + img.width; x += img.width) {
      for (let y = py - img.height; y < G.H + img.height; y += img.height) {
        ctx.drawImage(img, Math.round(x), Math.round(y));
      }
    }
  }
  ctx.restore();
}

function drawCursor(ctx, G, ox, oy) {
  const { tx, ty } = G.cursor;
  const sx = ox + tx * TILE, sy = oy + ty * TILE;
  ctx.save();
  ctx.strokeStyle = G.cursorOk ? 'rgba(225,235,250,0.6)' : 'rgba(225,110,120,0.35)';
  ctx.lineWidth = 1.5;
  const c = 6;
  ctx.beginPath();
  ctx.moveTo(sx, sy + c); ctx.lineTo(sx, sy); ctx.lineTo(sx + c, sy);
  ctx.moveTo(sx + TILE - c, sy); ctx.lineTo(sx + TILE, sy); ctx.lineTo(sx + TILE, sy + c);
  ctx.moveTo(sx + TILE, sy + TILE - c); ctx.lineTo(sx + TILE, sy + TILE); ctx.lineTo(sx + TILE - c, sy + TILE);
  ctx.moveTo(sx + c, sy + TILE); ctx.lineTo(sx, sy + TILE); ctx.lineTo(sx, sy + TILE - c);
  ctx.stroke();
  ctx.restore();
}
