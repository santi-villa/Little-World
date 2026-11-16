/**
 * Decoración de la pecera dibujada por código: arena con piedritas, madera,
 * vallisneria, anubias y musgo. Todo se ubica en proporción al tamaño de la
 * pecera (TankGeo), así sirve para cualquier modelo.
 */

import type { Graphics } from 'pixi.js';
import { scatter } from '../pixel-utils';

/** Medidas en píxeles del interior de la pecera. */
export interface TankGeo {
  left: number;
  right: number;
  top: number;
  bottom: number;
  innerWidth: number;
  innerHeight: number;
  waterTop: number;
  waterHeight: number;
  sandTop: number;
  sandH: number;
  /** Alto de la columna de agua sobre la arena con la pecera llena. */
  colH: number;
  /** Escala de los detalles: 1 en el cubo chico, hasta 1,5 en las grandes. */
  s: number;
}

/** Junta rectángulos por color para rellenar una sola vez cada uno. */
export class Batch {
  private readonly rects = new Map<number, number[]>();

  add(color: number, x: number, y: number, w: number, h: number): void {
    if (w <= 0 || h <= 0) return;
    const list = this.rects.get(color);
    if (list) list.push(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    else this.rects.set(color, [Math.round(x), Math.round(y), Math.round(w), Math.round(h)]);
  }

  /** `shade` se aplica una vez por color (noche, tinte). */
  flush(g: Graphics, shade?: (color: number) => number, alpha = 1): void {
    for (const [color, list] of this.rects) {
      for (let i = 0; i < list.length; i += 4) {
        g.rect(list[i] as number, list[i + 1] as number, list[i + 2] as number, list[i + 3] as number);
      }
      const c = shade ? shade(color) : color;
      g.fill(alpha >= 1 ? c : { color: c, alpha });
    }
    this.rects.clear();
  }
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const pick = (list: readonly number[], i: number): number => list[i % list.length] as number;

// ---------------------------------------------------------------- Arena

const SAND_HI = 0xf0dcae;
const SAND = 0xd9c08c;
const SAND_LOW = 0xb89a66;
const SAND_DARK = 0x8f7650;
const GRAVEL = [0x8c8f8a, 0x6e5a48, 0xece4cc, 0x5f6c70] as const;

/** Altura de la superficie de la arena en cada x (suaves lomitas hacia abajo). */
export function sandY(geo: TankGeo, x: number): number {
  const rel = x - geo.left;
  return geo.sandTop + clamp(Math.round(1 + Math.sin(rel * 0.045 + 1) + Math.sin(rel * 0.13) * 0.5), 0, 2);
}

export function drawSand(b: Batch, geo: TankGeo): void {
  const { left, right, bottom, innerWidth, sandTop, sandH } = geo;
  // Superficie con lomitas, por tramos de igual altura.
  let x0 = left;
  for (let x = left + 1; x <= right; x++) {
    if (x < right && sandY(geo, x) === sandY(geo, x0)) continue;
    const y = sandY(geo, x0);
    b.add(SAND_HI, x0, y, x - x0, 1);
    b.add(SAND, x0, y + 1, x - x0, bottom - y - 1);
    x0 = x;
  }
  // Capa de abajo más oscura, con el borde salpicado.
  const lowTop = bottom - Math.round(sandH * 0.38);
  b.add(SAND_LOW, left, lowTop, innerWidth, bottom - lowTop);
  for (let i = 0; i < innerWidth / 3; i++) {
    b.add(SAND_LOW, left + Math.floor(scatter(i, 61) * (innerWidth - 2)), lowTop - 1 - Math.floor(scatter(i, 62) * 2), 2, 1);
  }
  // Granitos.
  const grains = Math.round((innerWidth * sandH) / 12);
  for (let i = 0; i < grains; i++) {
    const gx = left + Math.floor(scatter(i, 63) * (innerWidth - 1));
    const gy = sandTop + 3 + Math.floor(scatter(i, 64) * (sandH - 4));
    b.add(scatter(i, 65) < 0.45 ? SAND_HI : SAND_DARK, gx, gy, 1, 1);
  }
  // Piedritas sueltas.
  for (let i = 0; i < innerWidth / 7; i++) {
    const gx = left + 1 + Math.floor(scatter(i, 66) * (innerWidth - 4));
    const gy = sandTop + 3 + Math.floor(scatter(i, 67) * (sandH - 5));
    b.add(pick(GRAVEL, Math.floor(scatter(i, 68) * 4)), gx, gy, 2, scatter(i, 69) < 0.3 ? 2 : 1);
  }
}

// ---------------------------------------------------------------- Piedras

const STONES = [
  [0x9aa39c, 0x76827c, 0x4c5a5a],
  [0xa39a8c, 0x7c7468, 0x514a44],
  [0x8a9aa0, 0x64747c, 0x40505a],
] as const;

/** Piedras redondeadas apoyadas en la arena. Las de adelante son más grandes y van más abajo. */
export function drawStones(b: Batch, geo: TankGeo, front: boolean): void {
  const { left, innerWidth, sandTop, s } = geo;
  const count = Math.max(4, Math.round(innerWidth / 24));
  for (let i = front ? 1 : 0; i < count; i += 2) {
    // Agrupadas cerca de la madera y del musgo, con alguna suelta.
    const around = i % 3 === 0 ? 0.44 : i % 3 === 1 ? 0.72 : scatter(i, 71);
    const cx = left + 6 + (around + (scatter(i, 72) - 0.5) * 0.3) * (innerWidth - 12);
    const w = Math.round((5 + scatter(i, 73) * 6 + (front ? 2 : 0)) * s);
    const h = Math.max(3, Math.round(w * 0.55));
    const x = clamp(Math.round(cx - w / 2), left + 1, geo.right - w - 1);
    const base = sandTop + (front ? Math.min(geo.sandH - 2, 5 + Math.floor(scatter(i, 74) * 3)) : 3);
    const [hi, mid, lo] = STONES[i % STONES.length] as readonly [number, number, number];
    for (let r = 0; r < h; r++) {
      const inset = r === 0 ? Math.round(w * 0.28) : r === 1 && h > 3 ? 1 : r === h - 1 ? 1 : 0;
      b.add(r === 0 ? hi : r >= h - 1 - Math.floor(h / 4) ? lo : mid, x + inset, base - h + r, w - inset * 2, 1);
    }
    // Brillito arriba a la izquierda.
    b.add(hi, x + Math.round(w * 0.28), base - h + 1, Math.max(1, Math.round(w * 0.25)), 1);
  }
}

// ---------------------------------------------------------------- Madera

const WOOD_HI = 0x9a7650;
const WOOD = 0x6a4c34;
const WOOD_LO = 0x3c2a1e;
const WOOD_GRAIN = 0x4e3626;
const WOOD_MOSS = 0x4f9a48;

interface LimbPoint {
  x: number;
  y: number;
  th: number;
}

/** Rama principal: sale de la arena y sube en diagonal hacia la derecha. k de 0 a 1. */
export function woodPoint(geo: TankGeo, k: number): LimbPoint {
  const n = geo.innerWidth * 0.3;
  const wh = Math.min(geo.colH * 0.45, geo.innerWidth * 0.34);
  const T = clamp(geo.sandH * 0.8, 6, 13);
  return {
    x: geo.left + geo.innerWidth * 0.36 + n * k,
    y: geo.sandTop + 2 - wh * Math.pow(k, 0.85) + Math.sin(k * 5.5) * wh * 0.04,
    th: T * (1 - 0.6 * k) + 1.5,
  };
}

function limb(b: Batch, at: (k: number) => LimbPoint, mossy: boolean): void {
  const x0 = Math.round(at(0).x);
  const x1 = Math.round(at(1).x);
  const n = Math.max(1, x1 - x0);
  for (let x = x0; x <= x1; x++) {
    const k = (x - x0) / n;
    const p = at(k);
    const slope = (at(Math.min(1, k + 1 / n)).y - at(Math.max(0, k - 1 / n)).y) / 2;
    const vt = Math.max(2, Math.round(p.th * Math.min(2.2, Math.sqrt(1 + slope * slope))));
    const y0 = Math.round(p.y - vt / 2);
    const hi = Math.max(1, Math.round(vt * 0.2));
    const lo = Math.max(1, Math.round(vt * 0.35));
    const mid = vt - hi - lo;
    b.add(mossy && k > 0.08 && k < 0.7 && scatter(x >> 2, 33) < 0.35 ? WOOD_MOSS : WOOD_HI, x, y0, 1, hi);
    b.add(WOOD, x, y0 + hi, 1, mid);
    b.add(WOOD_LO, x, y0 + hi + mid, 1, lo);
    // Vetas a lo largo.
    if (mid >= 2 && (x >> 2) % 2 === 0) b.add(WOOD_GRAIN, x, y0 + hi + Math.floor(mid * 0.45), 1, 1);
    if (mid >= 4 && (x >> 3) % 2 === 1) b.add(WOOD_HI, x, y0 + hi + Math.floor(mid * 0.8), 1, 1);
  }
}

export function drawWood(b: Batch, geo: TankGeo): void {
  const T = clamp(geo.sandH * 0.8, 6, 13);
  const lerp = (a: number, c: number, k: number): number => a + (c - a) * k;
  // Rama baja que se abre hacia la derecha y vuelve a la arena.
  const fork = woodPoint(geo, 0.38);
  const forkEndX = fork.x + geo.innerWidth * 0.2;
  limb(
    b,
    (k) => ({
      x: lerp(fork.x, forkEndX, k),
      y: lerp(fork.y, geo.sandTop + 3, k) - Math.sin(k * Math.PI) * geo.colH * 0.05,
      th: T * 0.55 * (1 - 0.4 * k) + 1,
    }),
    false,
  );
  // Raíz corta hacia la izquierda.
  const root = woodPoint(geo, 0.1);
  const rootX = root.x - geo.innerWidth * 0.07;
  limb(
    b,
    (k) => ({ x: lerp(rootX, root.x, k), y: lerp(geo.sandTop + 3, root.y, k), th: T * 0.4 + T * 0.2 * k }),
    false,
  );
  limb(b, (k) => woodPoint(geo, k), true);
  // Ramita que sale para arriba.
  const twig = woodPoint(geo, 0.72);
  const len = Math.round(7 * geo.s);
  for (let j = 0; j < len; j++) {
    b.add(j % 3 === 0 ? WOOD_HI : WOOD, Math.round(twig.x + j / 2.5), Math.round(twig.y - twig.th / 2) - j, j > len - 3 ? 1 : 2, 1);
  }
}

// ---------------------------------------------------------------- Vallisneria

const VALLIS_BACK = [0x2a7a4a, 0x2f8a52, 0x24694a] as const;
const VALLIS_FRONT = [0x4fb85a, 0x6fd068, 0x3fa050] as const;

/** Cintas largas al fondo a la izquierda, que se hamacan con la corriente. */
export function drawVallisneria(b: Batch, geo: TankGeo, t: number): void {
  const { left, right, innerWidth, colH } = geo;
  const n = clamp(Math.round(innerWidth / 20), 7, 16);
  const cx = left + innerWidth * 0.2;
  const spread = innerWidth * 0.1;
  for (let i = 0; i < n; i++) {
    const back = i < n / 2;
    const bx = cx + (scatter(i, 41) - 0.5) * 2 * spread;
    const hgt = Math.min(colH - 3, colH * (0.5 + 0.46 * scatter(i, 42)) * (back ? 1 : 0.85));
    const lean = (scatter(i, 43) - 0.4) * 0.16;
    const phase = scatter(i, 44) * 6.28;
    const color = pick(back ? VALLIS_BACK : VALLIS_FRONT, i);
    const base = sandY(geo, Math.round(bx)) + 2;
    const amp = 2 + hgt * 0.045;
    for (let yy = 0; yy < hgt; yy += 3) {
      const k = yy / hgt;
      const x = bx + lean * yy + Math.sin(t * 0.7 + phase - k * 2.4) * amp * k * k;
      b.add(color, clamp(Math.round(x), left, right - 2), base - yy - 3, k > 0.82 ? 1 : 2, 3);
    }
  }
}

// ---------------------------------------------------------------- Anubias

const ANUBIAS = [0x2f8a4a, 0x3a9c52, 0x287a44] as const;
const ANUBIAS_RIB = 0x7fd878;
const ANUBIAS_STEM = 0x2a6a3c;

/** Hojas anchas atadas a la madera. */
export function drawAnubias(b: Batch, geo: TankGeo, t: number): void {
  const a = woodPoint(geo, 0.42);
  const ax = Math.round(a.x);
  const ay = Math.round(a.y - a.th / 2);
  const s = geo.s;
  const leaves = s > 1.2 ? 7 : 6;
  // De atrás hacia adelante: primero las de los costados, al final las del medio.
  for (let j = 0; j < leaves; j++) {
    const i = j % 2 === 0 ? j / 2 : leaves - 1 - (j - 1) / 2;
    const ang = -Math.PI * (0.1 + (0.8 * i) / (leaves - 1)) + Math.sin(t * 0.6 + i * 1.7) * 0.06;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const stem = (3 + scatter(i, 46) * 4) * s;
    const len = (8 + scatter(i, 47) * 5) * s;
    const wm = len * 0.3;
    for (let q = 0; q < stem; q++) b.add(ANUBIAS_STEM, ax + dx * q, ay + dy * q, 1, 1);
    const sx = ax + dx * stem;
    const sy = ay + dy * stem;
    const color = pick(ANUBIAS, i);
    const vertical = Math.abs(dy) > Math.abs(dx);
    for (let q = 0; q <= len; q++) {
      const hw = Math.round(wm * Math.sin(Math.PI * Math.pow(q / len, 0.7)));
      const cx = Math.round(sx + dx * q);
      const cy = Math.round(sy + dy * q);
      if (vertical) b.add(color, cx - hw, cy, hw * 2 + 1, 1);
      else b.add(color, cx, cy - hw, 1, hw * 2 + 1);
    }
    // Nervadura.
    for (let q = 1; q < len - 1; q++) b.add(ANUBIAS_RIB, Math.round(sx + dx * q), Math.round(sy + dy * q), 1, 1);
  }
  // Rizoma.
  b.add(ANUBIAS_STEM, ax - 2, ay - 1, 5, 2);
}

// ---------------------------------------------------------------- Musgo

const MOSS = 0x3f9a48;
const MOSS_HI = 0x8fe070;
const MOSS_LIGHT = 0x62c45c;
const MOSS_DARK = 0x1f6a3a;

interface Mound {
  x: number;
  w: number;
  h: number;
}

function mounds(geo: TankGeo): Mound[] {
  const { left, innerWidth, colH } = geo;
  const h = clamp(colH * 0.17, 6, 24);
  return [
    { x: Math.round(left + innerWidth * 0.62), w: Math.round(innerWidth * 0.24), h },
    { x: Math.round(left + innerWidth * 0.3), w: Math.round(innerWidth * 0.11), h: h * 0.6 },
  ];
}

function mossHeight(m: Mound, i: number): number {
  const k = (i + 0.5) / m.w;
  const dome = Math.sqrt(Math.max(0, 1 - (2 * k - 1) ** 2));
  return Math.max(1, Math.round(m.h * dome * (0.78 + 0.16 * Math.sin(k * 11) + 0.18 * scatter(i >> 1, 51))));
}

/** Matas de musgo adelante: el cuerpo (no se mueve). */
export function drawMoss(b: Batch, geo: TankGeo): void {
  const base = geo.sandTop + 4;
  for (const m of mounds(geo)) {
    for (let i = 0; i < m.w; i++) {
      const h = mossHeight(m, i);
      const x = m.x + i;
      b.add(MOSS, x, base - h, 1, h);
      b.add(MOSS_LIGHT, x, base - h, 1, Math.min(h, 1 + Math.floor(scatter(i, 52) * 2)));
      if (h > 3) {
        b.add(MOSS_DARK, x, base - 1 - Math.floor(scatter(i, 53) * (h - 2)), 1, 1 + Math.floor(scatter(i, 54) * 2));
        if (scatter(i, 55) < 0.4) b.add(MOSS_HI, x, base - h + 1 + Math.floor(scatter(i, 56) * (h - 2)), 1, 1);
      }
      if (h > 2) b.add(MOSS_DARK, x, base - 1, 1, 1);
    }
  }
}

/** Las puntitas del musgo, que se mecen. */
export function drawMossTips(b: Batch, geo: TankGeo, t: number): void {
  const base = geo.sandTop + 4;
  for (const m of mounds(geo)) {
    for (let i = 1; i < m.w - 1; i += 2) {
      if (scatter(i, 57) < 0.35) continue;
      const h = mossHeight(m, i);
      const sway = Math.round(Math.sin(t * 1.1 + i * 0.45 + m.x));
      const tall = scatter(i, 58) < 0.4 ? 2 : 1;
      b.add(MOSS_HI, m.x + i + sway, base - h - tall, 1, 1);
      if (tall === 2) b.add(MOSS_LIGHT, m.x + i, base - h - 1, 1, 1);
    }
  }
}
