/** Betta macho de velo: cuerpo rojo y aletas largas que ondulan, del rojo al violeta azulado. */

import { lerpColor, scatter } from '../../pixel-utils';
import { eye, type FishSprite } from './painter';

const RED = 0xc0392b;
const DARK = 0x7d1f24;
const HEAD = 0x4e1c2c;
const BELLY = 0xdc5a44;
const PURPLE = 0x5b2a86;
const BLUE = 0x3a56c8;
const EDGE = 0xb48cf0;
const SHEEN = 0x4a7de8;

export const betta: FishSprite = {
  tempo: 0.55,
  wave: 0.05,
  minLen: 10,
  draw(p, pose) {
    const L = pose.len;
    const t = pose.wag;
    const seed = pose.seed;
    const B = Math.max(6, Math.round(L * 0.6));
    const H = Math.max(3, Math.round(L * 0.27));
    const fin = 1 - 0.6 * pose.finDamage;
    const rest = pose.resting || !pose.alive;

    const f = (x: number): number => {
      const u = Math.min(1, x / (B - 1));
      return u < 0.25 ? 0.55 + 0.45 * Math.sin((u / 0.25) * Math.PI * 0.5) : 1 - 0.5 * Math.pow((u - 0.25) / 0.75, 1.4);
    };
    const top = (x: number): number => Math.round((-H / 2) * f(x));
    const bot = (x: number): number => Math.max(top(x) + 1, Math.round((H / 2) * f(x)));

    const rays = Math.max(3, Math.round(L * 0.3));
    /** w: 0 en la base .. 1 en la punta; v: posición a lo ancho (para los radios). */
    const finColor = (w: number, v: number, edge: boolean): number => {
      let c = lerpColor(RED, PURPLE, w * 1.25);
      if (w > 0.55) c = lerpColor(c, BLUE, (w - 0.55) * 1.1);
      if (Math.floor(v * rays) % 2 === 1) c = lerpColor(c, 0x1a0a30, 0.22);
      if (edge) c = lerpColor(c, EDGE, 0.55);
      return c;
    };
    const torn = (x: number, y: number, w: number): boolean =>
      pose.finDamage > 0 && w > 0.5 && scatter(x * 31 + y * 7, seed) < pose.finDamage * 0.8;

    // Cola de velo: abanico grande que cae y ondula.
    const T = Math.max(2, Math.round(L * 0.8 * fin));
    const ped = H * 0.25;
    const maxHalf = L * 0.4;
    const sag = (rest ? 1 : 0.55) * L * 0.3;
    for (let i = 0; i <= T; i++) {
      const w = i / T;
      const x = B - 1 + i;
      let half = ped + (maxHalf - ped) * Math.pow(Math.sin(w * Math.PI * 0.5), 0.8);
      if (w > 0.75) half *= 1 - 0.55 * ((w - 0.75) / 0.25) ** 2;
      half *= 1 + 0.08 * Math.sin(t * 1.3 - w * 7);
      const yc = sag * Math.pow(w, 1.6) + Math.sin(t * 0.9 - w * 4.5) * L * 0.04 * w;
      const y0 = Math.round(yc - half);
      const y1 = Math.max(y0 + 1, Math.round(yc + half * 1.15));
      for (let y = y0; y < y1; y++) {
        if (torn(x, y, w)) continue;
        p.px(x, y, finColor(w, (y - y0) / (y1 - y0), y === y0 || y === y1 - 1 || i === T));
      }
    }

    // Anal: larga, más profunda hacia atrás.
    const ax0 = Math.round(B * 0.45);
    const ax1 = B + Math.round(L * 0.2);
    const Ha = L * 0.42 * fin;
    for (let x = ax0; x <= ax1; x++) {
      const w = (x - ax0) / (ax1 - ax0);
      let dep = Ha * (0.3 + 0.7 * Math.pow(w, 0.8));
      if (w > 0.85) dep *= 1 - 0.6 * ((w - 0.85) / 0.15);
      dep += Math.sin(t - w * 5) * L * 0.03 * w;
      const base = bot(x);
      const end = base + Math.max(1, Math.round(dep));
      for (let y = base; y < end; y++) {
        const d = (y - base) / Ha;
        if (torn(x, y, d)) continue;
        p.px(x + Math.round((y - base) * 0.3), y, finColor(d, w * 0.99, y === end - 1));
      }
    }

    // Dorsal: vela inclinada hacia atrás.
    const dx0 = Math.round(B * 0.42);
    const dx1 = B + Math.round(L * 0.14);
    const Hd = L * 0.36 * fin * (rest ? 0.8 : 1);
    for (let x = dx0; x <= dx1; x++) {
      const w = (x - dx0) / (dx1 - dx0);
      let hgt = Hd * (w < 0.65 ? Math.pow(w / 0.65, 0.7) : 1 - 0.8 * ((w - 0.65) / 0.35) ** 2);
      hgt += Math.sin(t * 1.1 - w * 5) * L * 0.03 * w;
      const base = top(x);
      const y0 = base - Math.max(0, Math.round(hgt));
      for (let y = y0; y < base; y++) {
        const d = (base - y) / Hd;
        if (torn(x, y, d)) continue;
        p.px(x + Math.round((base - y) * 0.35), y, finColor(d, w * 0.99, y === y0));
      }
    }

    // Cuerpo.
    const gill = Math.round(B * 0.24);
    p.shape(
      0,
      B,
      (_u, x) => [top(x), bot(x)],
      (u, x, y, y0, y1) => {
        let c = RED;
        if (y === y0) c = DARK;
        else if (y === y1 - 1 && y1 - y0 >= 4) c = BELLY;
        if (u < 0.22) c = lerpColor(c, HEAD, 0.6);
        else if (H >= 5 && x === gill && y > y0 && y < y1 - 1) c = DARK;
        else if (u > 0.35 && scatter(x * 13 + y * 29 + 200, seed) < 0.22) c = lerpColor(c, SHEEN, 0.6);
        return c;
      },
    );

    // Ventrales: dos hilos largos que se hamacan.
    const vx = Math.round(B * 0.3);
    const Lv = Math.round(L * 0.36 * fin);
    const vy = bot(vx);
    for (let j = 0; j < Lv; j++) {
      const k = j / Math.max(1, Lv - 1);
      const x = vx + Math.round(j * 0.35 + Math.sin(t * 0.8 - j * 0.4) * k * 1.5);
      const c = lerpColor(RED, 0xe8d8f0, k * k);
      p.px(x, vy + j, c);
      if (L >= 20 && j < Lv * 0.4) p.px(x + 1, vy + j, c);
    }

    // Pectoral: abaniquito casi transparente que no para de moverse.
    if (L >= 12) {
      const px0 = Math.round(B * 0.3);
      const flap = pose.alive && Math.floor(t * 1.6) % 2 === 0 ? 1 : 0;
      p.px(px0, 1, 0xe89a8a);
      p.px(px0 + 1, 1 + flap, 0xe89a8a);
      if (L >= 18) p.px(px0 + 2, 1 + flap * 2, 0xf0b4a4);
    }

    eye(p, Math.max(1, Math.round(B * 0.12)), -Math.max(1, Math.round(H * 0.22)), L >= 24, pose.alive);
  },
};
