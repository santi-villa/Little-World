/**
 * Guppy. Macho: cuerpito fino y una cola en abanico enorme, con color y dibujo
 * distintos en cada individuo. Hembra: más grande y panzona, color oliva claro,
 * cola chica con apenas un toque de color.
 */

import { lerpColor, scatter } from '../../pixel-utils';
import { eye, type FishSprite, type SpritePainter, type SpritePose } from './painter';

/** Colas posibles: [base, punta, motas o borde]. */
const TAILS: readonly (readonly [number, number, number])[] = [
  [0xff7a2a, 0xffc23a, 0x20242c], // naranja
  [0x2f7de0, 0x7fd4ff, 0x1a2a6a], // azul
  [0xe8382f, 0xff8a5a, 0x7a1420], // rojo
  [0xf2d43a, 0xfff2a0, 0x20242c], // amarillo
  [0x8a4be0, 0xd09aff, 0x33206a], // violeta
  [0x26c0a0, 0xa0f0d0, 0x145a58], // verde
];

const BODY = 0xa8b09a;
const BACK = 0x6f7a62;
const BELLY = 0xe2e6d8;

function palette(seed: number, salt: number): readonly [number, number, number] {
  return TAILS[Math.floor(scatter(seed, salt) * TAILS.length) % TAILS.length] as readonly [number, number, number];
}

function male(p: SpritePainter, pose: SpritePose): void {
  const L = Math.max(6, Math.round(pose.len * 0.9));
  const t = pose.wag;
  const seed = pose.seed;
  const B = Math.max(4, Math.round(L * 0.52));
  const H = Math.max(2, Math.round(L * 0.2));
  const fin = 1 - 0.6 * pose.finDamage;
  const [c0, c1, c2] = palette(seed, 3);
  const spot = palette(seed, 7)[0];
  const pattern = scatter(seed, 4);

  const finColor = (w: number, i: number, r: number, edge: boolean): number => {
    if (pattern < 0.4) {
      // Motas.
      if (scatter(i * 7 + r * 13 + 40, seed) < 0.24) return c2;
      return lerpColor(c0, c1, w * 0.8);
    }
    if (pattern < 0.7) return lerpColor(c0, c1, w); // degradé
    return w > 0.78 || edge ? c2 : lerpColor(c0, c1, w * 0.6); // con borde oscuro
  };

  const f = (u: number): number => (u < 0.15 ? 0.6 : u > 0.6 ? 1 - (0.45 * (u - 0.6)) / 0.4 : 1);

  // Cola en abanico (delta).
  const T = Math.max(2, Math.round(L * 0.5 * fin));
  const maxHalf = L * 0.27;
  for (let i = 0; i <= T; i++) {
    const w = i / T;
    const half = (H * 0.3 + (maxHalf - H * 0.3) * Math.pow(w, 0.8)) * (1 + 0.07 * Math.sin(t * 1.2 - w * 6));
    const yc = Math.sin(t * 0.9 - w * 4) * L * 0.03 * w;
    const y0 = Math.round(yc - half);
    const y1 = Math.max(y0 + 1, Math.round(yc + half));
    const yr = Math.round(yc);
    for (let y = y0; y < y1; y++) {
      // Puntas redondeadas.
      if (i === T && T > 3 && (y === y0 || y === y1 - 1)) continue;
      if (pose.finDamage > 0 && w > 0.5 && scatter(i * 31 + (y - yr) * 7, seed) < pose.finDamage * 0.8) continue;
      p.px(B - 1 + i, y, finColor(w, i, y - yr, y === y0 || y === y1 - 1));
    }
  }

  // Dorsal: banderita que flamea hacia atrás.
  const dx0 = Math.round(B * 0.5);
  const dn = Math.max(2, Math.round(L * 0.24 * fin));
  const Hd = Math.max(1, Math.round(L * 0.16 * fin));
  const dTop = Math.round(-H / 2);
  for (let i = 0; i < dn; i++) {
    const w = i / (dn - 1);
    const lift = Math.round(Math.sin(t * 1.4 - w * 3) * w);
    const h = Math.max(1, Math.round(Hd * (0.5 + 0.5 * Math.sin(w * Math.PI))));
    const base = dTop - Math.round(w * Hd * 0.5) + lift;
    for (let y = base - h; y < base; y++) p.px(dx0 + i, y, finColor(w, i + 50, y - base, false));
  }

  // Cuerpo: oliva adelante, teñido del color de la cola atrás.
  const top0 = Math.round(-H / 2);
  const spotX = Math.round(B * 0.42);
  p.shape(
    0,
    B,
    (u) => [(-H / 2) * f(u), (H / 2) * f(u)],
    (u, x, y, y0, y1) => {
      let c = y === y0 && H >= 3 ? BACK : y === y1 - 1 && H >= 3 ? BELLY : BODY;
      if (u > 0.5) c = lerpColor(c, c0, Math.min(0.75, (u - 0.5) * 1.8));
      if (L >= 9 && (x === spotX || x === spotX + 1) && y === top0 + Math.floor(H / 2)) c = spot;
      return c;
    },
  );
  // Anal chiquita.
  if (L >= 10) p.px(Math.round(B * 0.6), top0 + H, c1);

  eye(p, 1, top0 + (H >= 4 ? 1 : 0), false, pose.alive);
}

function female(p: SpritePainter, pose: SpritePose): void {
  const L = pose.len;
  const t = pose.wag;
  const seed = pose.seed;
  const B = Math.max(4, Math.round(L * 0.68));
  const H = Math.max(3, Math.round(L * 0.27));
  const hue = palette(seed, 3)[0];
  const finC = lerpColor(0xc8ccb8, hue, 0.3 + 0.3 * scatter(seed, 5));
  const body = lerpColor(0xb5b396, 0xc9b98a, scatter(seed, 6));

  // Cola redondeada.
  const T = Math.max(2, L - B);
  for (let i = 0; i <= T; i++) {
    const w = i / T;
    const half = H * 0.3 + H * 0.35 * Math.sin(w * Math.PI * 0.62);
    const yc = Math.sin(t - w * 3) * 0.6 * w;
    const y0 = Math.round(yc - half);
    const y1 = Math.max(y0 + 1, Math.round(yc + half));
    for (let y = y0; y < y1; y++) p.px(B - 1 + i, y, i > T * 0.6 ? lerpColor(finC, hue, 0.25) : finC);
  }

  // Dorsal.
  const dx0 = Math.round(B * 0.55);
  const dTop = Math.round((-H / 2) * 0.9);
  p.px(dx0, dTop - 1, finC);
  p.px(dx0 + 1, dTop - 1, finC);
  if (L >= 14) {
    p.px(dx0 + 1, dTop - 2, finC);
    p.px(dx0 + 2, dTop - 1, finC);
  }

  // Cuerpo con panza.
  const gravidX = Math.round(B * 0.66);
  p.shape(
    0,
    B,
    (u) => {
      const f = u < 0.15 ? 0.55 : u > 0.65 ? 1 - (0.55 * (u - 0.65)) / 0.35 : 1;
      const bulge = H * 0.24 * Math.sin(Math.PI * Math.min(1, Math.max(0, (u - 0.2) / 0.55)));
      return [(-H / 2) * f, (H / 2) * f + bulge];
    },
    (_u, x, y, y0, y1) => {
      if (y === y0) return BACK;
      // Mancha de gravidez, cerca de la anal.
      if ((x === gravidX || x === gravidX - 1) && y >= y1 - 2 && y1 - y0 >= 3) return 0x4a3f38;
      if (y >= y1 - Math.max(1, Math.round((y1 - y0) * 0.35))) return BELLY;
      return body;
    },
  );
  // Anal.
  if (L >= 9) p.px(gravidX + 1, Math.round(H / 2), finC);

  eye(p, 1, Math.round(-H / 2) + 1, false, pose.alive);
}

export const guppy: FishSprite = {
  tempo: 1.3,
  wave: 0.07,
  minLen: 7,
  draw(p, pose) {
    if (pose.sex === 'male') male(p, pose);
    else female(p, pose);
  },
};
