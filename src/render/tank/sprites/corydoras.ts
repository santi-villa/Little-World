/** Corydoras paleatus: lomo alto, panza chata, manchas oscuras, bigotes y dorsal triangular. */

import { lerpColor, scatter } from '../../pixel-utils';
import { eye, type FishSprite } from './painter';

const BASE = 0xb8a57e;
const BACK = 0x6e654e;
const HEAD = 0x8f866a;
const BELLY = 0xe9dcc6;
const BLOTCH = 0x4b4636;
const SHEEN = 0x7fae8c;
const FIN = 0xcdc2a2;
const FIN_BAR = 0x857b60;
const BARBEL = 0xdccdaa;

export const corydoras: FishSprite = {
  tempo: 1.2,
  wave: 0.05,
  minLen: 8,
  draw(p, pose) {
    const L = pose.len;
    const t = pose.wag;
    const seed = pose.seed;
    const B = Math.max(5, Math.round(L * 0.74));
    const H = Math.max(3, Math.round(L * 0.36));
    const moving = pose.alive && pose.swim > 0.08;

    const topAt = (u: number): number =>
      -H * 0.62 * (u < 0.3 ? 0.35 + 0.65 * Math.sin((u / 0.3) * Math.PI * 0.5) : 1 - 0.62 * Math.pow((u - 0.3) / 0.7, 1.2));
    const botAt = (u: number): number =>
      H * 0.38 * (u < 0.1 ? 0.5 + (0.5 * u) / 0.1 : u > 0.7 ? 1 - (0.75 * (u - 0.7)) / 0.3 : 1);

    // Cola en horquilla con barritas.
    const T = Math.max(2, L - B);
    const th = Math.max(1, Math.round(H * 0.2));
    for (let i = 0; i < T; i++) {
      const c = i % 3 === 1 ? FIN_BAR : FIN;
      const o = Math.round(((i + 1) / T) * H * 0.5);
      if (i === 0) {
        p.col(B, -o - th, o + th, c);
        continue;
      }
      p.col(B + i, -o - th, -o, c);
      p.col(B + i, o, o + th, c);
    }

    // Dorsal triangular, con la mancha oscura adelante. En reposo la baja un poco.
    const dx0 = Math.round(B * 0.3);
    const dn = Math.max(2, Math.round(B * 0.24));
    const Hd = Math.max(2, Math.round(H * (pose.resting ? 0.42 : 0.62)));
    for (let i = 0; i < dn; i++) {
      const w = i / dn;
      const h = Math.max(1, Math.round(Hd * (1 - w * 0.85)));
      const base = Math.round(topAt((dx0 + i) / (B - 1)));
      for (let y = base - h; y < base; y++) {
        p.px(dx0 + i + (base - y > Hd * 0.6 ? 1 : 0), y, i < 2 && base - y > h * 0.45 ? BLOTCH : FIN);
      }
    }
    // Adiposa.
    if (L >= 11) p.px(Math.round(B * 0.84), Math.round(topAt(0.84)) - 1, BLOTCH);

    // Cuerpo.
    const block = L >= 16 ? 2 : 1;
    p.shape(
      0,
      B,
      (u) => [topAt(u), botAt(u)],
      (u, x, y, y0, y1) => {
        if (y === y1 - 1 && y1 - y0 >= 3) return BELLY;
        let c = y === y0 ? BACK : u < 0.18 ? HEAD : BASE;
        if (u > 0.17 && u < 0.3 && y > y0 && y < y1 - 1 && y <= 0) c = lerpColor(c, SHEEN, 0.55);
        else if (
          u >= 0.3 &&
          y < H * 0.12 &&
          scatter(Math.floor(x / block) * 17 + Math.floor((y + 40) / block) * 5, (seed % 89) + 11) < 0.34
        ) {
          c = BLOTCH;
        }
        return c;
      },
    );

    // Pectoral y ventral: remos claritos.
    const flap = moving && Math.floor(t * 1.2) % 2 === 0 ? 1 : 0;
    const pxx = Math.round(B * 0.3);
    const py = Math.round(botAt(0.3)) - 1;
    p.px(pxx, py, FIN);
    p.px(pxx + 1, py + flap, FIN);
    if (L >= 12) p.px(pxx + 2, py + flap + (flap ? 1 : 0), FIN);
    if (L >= 10) {
      const vxx = Math.round(B * 0.58);
      p.px(vxx, Math.round(botAt(0.58)), FIN);
      if (L >= 16) p.px(vxx + 1, Math.round(botAt(0.58)), FIN);
    }

    // Bigotes: tantean la arena mientras se mueve.
    const by = Math.round(botAt(0));
    const feel = moving && Math.floor(t * 1.5) % 2 === 0;
    p.px(0, by, BARBEL);
    p.px(feel ? 0 : -1, by + 1, BARBEL);
    if (L >= 14) p.px(1, by + 1, BARBEL);

    eye(p, Math.max(1, Math.round(B * 0.14)), Math.round(-H * 0.24), L >= 22, pose.alive);
  },
};
