/** Neón: torpedo chiquito con la franja azul eléctrica y la media franja roja. De noche se apaga. */

import { lerpColor } from '../../pixel-utils';
import { eye, type FishSprite } from './painter';

const BACK = 0x55644a;
const BLUE = 0x2fd0ff;
const BLUE_HI = 0xc8f8ff;
const RED = 0xe2352e;
const SILVER = 0xdfe8e2;
const FIN = 0xa9c4c0;
/** Colores de la franja dormida. */
const BLUE_OFF = 0x56676c;
const RED_OFF = 0x6e4a48;

export const neonTetra: FishSprite = {
  tempo: 1.5,
  wave: 0.07,
  minLen: 6,
  draw(p, pose) {
    const L = pose.len;
    const H = Math.max(2, Math.round(L * 0.27));
    const B = Math.max(4, Math.round(L * 0.76));
    const top0 = Math.round(-H / 2);

    // De noche la franja casi no brilla (dormidos, menos todavía).
    const dim = pose.night ? (pose.resting ? 0.92 : 0.75) : 0;
    const blue = lerpColor(BLUE, BLUE_OFF, dim);
    const red = lerpColor(RED, RED_OFF, dim * 0.9);
    // Un destello que recorre la franja.
    const glint = dim > 0 || !pose.alive ? -9 : Math.floor(pose.seconds * 6 + pose.seed * 1.7) % (B + 8);
    const stripeEnd = 0.72;

    p.shape(
      0,
      B,
      (u) => {
        const f = u < 0.12 ? 0.6 : u > 0.7 ? 1 - (0.5 * (u - 0.7)) / 0.3 : 1;
        return [(-H / 2) * f, (H / 2) * f];
      },
      (u, x, y) => {
        const r = y - top0;
        const stripe = u < stripeEnd ? (x === glint || x === glint - 1 ? BLUE_HI : blue) : red;
        if (H === 2) return r <= 0 ? stripe : u < 0.45 ? SILVER : red;
        if (r <= 0) return BACK;
        if (r === 1) return stripe;
        if (H >= 4 && r === H - 1) return u < 0.6 ? SILVER : red;
        return u < 0.45 ? SILVER : red;
      },
    );

    // Cola en horquilla, casi transparente.
    const T = Math.max(2, L - B);
    const c = H % 2 === 1 ? 0 : -0.5;
    for (let i = 0; i < T; i++) {
      const o = ((i + 1) / T) * H * 0.62;
      const yu = Math.floor(c - o);
      const yd = Math.ceil(c + o);
      if (i === 0) {
        p.col(B, yu, yd + 1, FIN);
        continue;
      }
      p.px(B + i, yu, FIN);
      p.px(B + i, yd, FIN);
      if (H >= 4) {
        p.px(B + i, yu + 1, FIN);
        p.px(B + i, yd - 1, FIN);
      }
    }

    // Dorsal y anal.
    const dx = Math.round(B * 0.45);
    p.px(dx, top0 - 1, FIN);
    if (L >= 10) p.px(dx + 1, top0 - 1, FIN);
    if (L >= 14) p.px(dx + 1, top0 - 2, FIN);
    const ax = Math.round(B * 0.62);
    if (L >= 8) p.px(ax, top0 + H, FIN);
    if (L >= 12) p.px(ax + 1, top0 + H, FIN);

    eye(p, 1, top0 + (H >= 3 ? 1 : 0), false, pose.alive);
  },
};
