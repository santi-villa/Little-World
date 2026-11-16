/**
 * Gamba red cherry: caparazón, abdomen arqueado en segmentos, antenas largas
 * que tantean y patitas que caminan. Cada una tiene su rojo: desde las pálidas
 * casi transparentes hasta las rojo sangre.
 *
 * Camina: y = 0 es el piso.
 */

import { lerpColor, scatter } from '../../pixel-utils';
import { EYE, type FishSprite } from './painter';

const GRADES = [0xe8846a, 0xd8322a, 0xd8322a, 0xb81a1e, 0x8f1420] as const;

export const cherryShrimp: FishSprite = {
  tempo: 1,
  wave: 0,
  minLen: 7,
  draw(p, pose) {
    const L = pose.len;
    const t = pose.wag;
    const seed = pose.seed;
    const h = Math.max(2, Math.round(L * 0.3));
    const legs = Math.max(1, Math.round(L * 0.14));
    const C = Math.max(3, Math.round(L * 0.42)); // fin del caparazón
    const A = Math.max(C + 2, Math.round(L * 0.86)); // fin del abdomen
    const yb = -legs; // borde de abajo del cuerpo
    if (!pose.alive) p.originY = -(legs + h);

    const grade = Math.floor(scatter(seed, 5) * GRADES.length) % GRADES.length;
    const base = lerpColor(GRADES[grade] as number, 0xf07a30, scatter(seed, 6) * 0.22);
    const hi = lerpColor(base, 0xffb8a8, 0.4);
    const lo = lerpColor(base, 0x4a0a12, 0.38);
    const clear = lerpColor(base, 0xf2cdb8, 0.55);
    const pale = grade === 0;

    const shade = (y: number, y0: number, y1: number): number =>
      y === y0 ? hi : y === y1 - 1 && y1 - y0 >= 3 ? lo : base;

    // Antenas: una larga hacia arriba y otra más corta hacia abajo.
    const top = yb - h;
    const an = Math.max(3, Math.round(L * 0.55));
    const feel = pose.alive ? t : 0;
    for (let j = 1; j <= an; j++) {
      const k = j / an;
      p.px(-j, top - Math.round(j * 0.45 + Math.sin(feel * 1.3 + j * 0.5) * k * 1.2), hi);
      if (j <= an * 0.6) p.px(-j, top + 1 + Math.round(j * 0.3 + Math.sin(feel * 1.7 + j * 0.6 + 2) * k), clear);
    }

    // Patas caminadoras.
    const n = L >= 9 ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const x = 1 + Math.round(((k + 0.5) * (C - 1)) / n);
      const fwd = (Math.floor(t * 0.9) + k) % 2 === 0 ? -1 : 1;
      for (let j = 0; j < legs; j++) p.px(x + (j === legs - 1 && pose.alive ? fwd : 0), yb + j, lo);
    }

    // Caparazón, con el rostro en punta.
    p.shape(
      0,
      C,
      (u) => [top + (u < 0.2 ? Math.min(1, h - 1) : 0), yb - (u < 0.2 && h >= 3 ? 1 : 0)],
      (_u, _x, y, y0, y1) => shade(y, y0, y1),
    );
    p.px(-1, top + Math.min(1, h - 1), hi); // rostro
    // Montura clarita de las hembras.
    if (pose.sex === 'female' && L >= 9) {
      p.px(C - 2, top, 0xf0d070);
      if (L >= 12) p.px(C - 3, top, 0xf0d070);
    }

    // Abdomen: se arquea y baja hacia la cola, con sus segmentos.
    const ah = Math.max(1, h - 1);
    const arcAt = (w: number): number => -Math.round(Math.sin(w * Math.PI) * h * 0.3) + Math.round(w * w * h * 0.55);
    for (let x = C; x < A; x++) {
      const w = (x - C) / (A - C);
      const arc = arcAt(w);
      const hh = Math.max(1, Math.round(ah * (1 - 0.35 * w)));
      const y0 = top + (h - ah) + arc;
      const seg = (x - C) % 3 === 2;
      for (let y = y0; y < y0 + hh; y++) {
        let c = shade(y, y0, y0 + hh);
        if (seg) c = lo;
        else if (pale && Math.floor((x - C) / 3) % 2 === 1) c = clear;
        p.px(x, y, c);
      }
      // Pleópodos: las patitas nadadoras de abajo, siempre abanicando.
      if (!seg && (x + Math.floor(t * 2)) % 2 === 0 && y0 + hh < 0) p.px(x, y0 + hh, clear);
    }

    // Abanico de la cola.
    const tailTop = top + (h - ah) + arcAt(1);
    for (let x = A; x < L; x++) {
      const i = x - A;
      p.px(x, tailTop + i, hi);
      p.px(x, Math.min(-1, tailTop + i + 1), base);
    }

    // Ojo saltón, adelante.
    p.px(1, top + (h >= 3 ? 1 : 0), pose.alive ? EYE : 0xdfe3e8);
  },
};
