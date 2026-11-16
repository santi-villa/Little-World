/**
 * Lo que se ve por la ventana: cielo según la hora (de noche, la imagen
 * cielo-noche.png va entre el degradé y lo de adelante), estrellas, nubes,
 * arboleda lejana con lucecitas, lluvia, gotas que corren por el vidrio y
 * relámpagos. Se dibuja detrás de la pared (el marco va encima).
 */

import type { Graphics } from 'pixi.js';
import type { Weather } from '../../sim';
import { lerpColor, scatter } from '../pixel-utils';

/** Cuánto tapa el cielo cada clima (0 despejado .. 1 cerrado). */
const OVERCAST: Record<Weather, number> = { clear: 0, cloudy: 0.6, rain: 0.85, storm: 1 };

/**
 * Relámpago: 0 sin luz .. 1 a pleno. Cada tantos segundos cae uno, con doble
 * destello. `bolt` identifica el rayo (para que cada uno caiga en otro lado).
 */
function lightning(t: number): { flash: number; bolt: number } {
  const period = 9;
  const bolt = Math.floor(t / period);
  const at = (t % period) - 1 - scatter(bolt, 95) * 6;
  let flash = 0;
  if (at >= 0 && at < 0.09) flash = 1;
  else if (at >= 0.16 && at < 0.34) flash = 0.7 * (1 - (at - 0.16) / 0.18);
  return { flash, bolt };
}

/** Dibuja la ventana y devuelve la intensidad del relámpago (para iluminar la habitación). */
export function drawSky(
  g: Graphics,
  window: { x: number; y: number; width: number; height: number },
  day: number,
  weather: Weather,
  t: number,
  /** 'base': solo el degradé del cielo; 'front': estrellas, nubes, árboles, lluvia y rayos. */
  part: 'base' | 'front' = 'front',
): number {
  const { x, y, width: W, height: H } = window;
  const ov = OVERCAST[weather];
  const night = 1 - day;
  const right = x + W;
  const bottom = y + H;
  /** Rectángulo recortado al vidrio. */
  const rect = (rx: number, ry: number, rw: number, rh: number): boolean => {
    const x0 = Math.max(x, Math.round(rx));
    const y0 = Math.max(y, Math.round(ry));
    const x1 = Math.min(right, Math.round(rx + rw));
    const y1 = Math.min(bottom, Math.round(ry + rh));
    if (x1 <= x0 || y1 <= y0) return false;
    g.rect(x0, y0, x1 - x0, y1 - y0);
    return true;
  };

  // Cielo en franjas: de noche azul profundo, de día celeste; gris si está tapado
  // y con el horizonte anaranjado al amanecer y al atardecer.
  const greyTop = lerpColor(0x0a0d18, weather === 'storm' ? 0x4a5262 : 0x6f7a8c, day);
  const greyLow = lerpColor(0x1a1f2c, weather === 'storm' ? 0x6a7280 : 0xa3adb8, day);
  const twilight = Math.sin(day * Math.PI);
  let top = lerpColor(lerpColor(0x070b1c, 0x4a98de, day), greyTop, ov);
  let low = lerpColor(lerpColor(0x18223f, 0xb4def2, day), greyLow, ov);
  top = lerpColor(top, 0x6a5a9a, twilight * 0.4 * (1 - ov));
  low = lerpColor(low, 0xf2a25c, twilight * 0.7 * (1 - ov));
  const bands = 9;
  const skyAt = (k: number): number => lerpColor(top, low, k);
  for (let i = 0; part === 'base' && i < bands; i++) {
    const y0 = y + Math.round((i * H) / bands);
    const y1 = y + Math.round(((i + 1) * H) / bands);
    g.rect(x, y0, W, y1 - y0).fill(skyAt(i / (bands - 1)));
  }

  if (part === 'base') return 0;

  // Estrellas que titilan suave, sobre el cielo de noche (la imagen ya trae la luna).
  if (day < 0.5 && ov < 0.9) {
    const groups = 3;
    for (let k = 0; k < groups; k++) {
      let drawn = 0;
      for (let i = k; i < 36; i += groups) {
        const sx = x + 3 + Math.floor(scatter(i, 31) * (W - 6));
        const sy = y + 3 + Math.floor(scatter(i, 32) * H * 0.6);
        g.rect(sx, sy, 1, 1);
        drawn++;
      }
      const twinkle = 0.5 + 0.5 * Math.sin(t * (0.7 + k * 0.23) + k * 2.1);
      if (drawn > 0) g.fill({ color: 0xf4f1d0, alpha: (1 - day / 0.5) * (1 - ov) * (0.25 + 0.6 * twinkle) });
    }
  }

  // Nubes que pasan.
  const clouds = weather === 'clear' ? 3 : weather === 'cloudy' ? 7 : 10;
  const cloudLight = lerpColor(lerpColor(0x2a3350, 0xf4f8fc, day), lerpColor(0x232838, weather === 'storm' ? 0x5a6170 : 0xc4cad4, day), ov);
  const cloudDark = lerpColor(cloudLight, 0x10141f, 0.22);
  const cloudAlpha = weather === 'clear' ? 0.55 + 0.3 * day : 0.9;
  for (let pass = 0; pass < 2; pass++) {
    let any = false;
    for (let i = 0; i < clouds; i++) {
      const w = 40 + scatter(i, 37) * 56;
      const speed = (2 + scatter(i, 38) * 3) * (weather === 'storm' ? 3 : 1);
      const cx = x - 60 + ((scatter(i, 33) * (W + 120) + t * speed) % (W + 120));
      const cy = y + 12 + scatter(i, 39) * H * (ov > 0.5 ? 0.5 : 0.38);
      if (pass === 0) {
        any = rect(cx + 2, cy + 4, w - 4, 4) || any; // panza en sombra
      } else {
        any = rect(cx, cy, w, 5) || any;
        any = rect(cx + w * 0.12, cy - 4, w * 0.6, 4) || any;
        any = rect(cx + w * 0.3, cy - 7, w * 0.3, 3) || any;
        any = rect(cx + w * 0.55, cy - 6, w * 0.2, 2) || any;
      }
    }
    if (any) g.fill({ color: pass === 0 ? cloudDark : cloudLight, alpha: cloudAlpha });
  }

  // Arboleda: dos planos de siluetas; con tormenta se sacuden.
  const sway = weather === 'storm' ? Math.sin(t * 2.2) * 2 : weather === 'rain' ? Math.sin(t * 1.1) : 0;
  const farTree = lerpColor(lerpColor(0x0d1524, 0x5f8a6a, day), lerpColor(0x0c111c, 0x5a6a6c, day), ov);
  const nearTree = lerpColor(lerpColor(0x070b14, 0x34593f, day), lerpColor(0x070a12, 0x364540, day), ov);
  for (let i = 0; i < W; i += 2) {
    const k = i + sway * 0.6;
    const h = 44 + 12 * Math.sin(k * 0.045 + 1) + 9 * Math.sin(k * 0.12) + 8 * scatter(Math.floor(k / 4), 91);
    g.rect(x + i, bottom - Math.round(h), 2, Math.round(h));
  }
  g.fill(farTree);
  for (let i = 0; i < W; i += 2) {
    const k = i + sway;
    const h = 22 + 10 * Math.sin(k * 0.07 + 4) + 7 * Math.sin(k * 0.19 + 2) + 7 * scatter(Math.floor(k / 3), 92);
    g.rect(x + i, bottom - Math.round(h), 2, Math.round(h));
  }
  g.fill(nearTree);

  // Luces lejanas de noche.
  if (day < 0.5) {
    for (let i = 0; i < 7; i++) {
      const lx = x + Math.round(W * (0.55 + 0.42 * scatter(i, 93)));
      const ly = bottom - 26 - Math.round(scatter(i, 94) * 22);
      g.rect(lx - 1, ly - 1, 4, 4);
    }
    g.fill({ color: 0xffc46a, alpha: 0.18 * night });
    for (let i = 0; i < 7; i++) {
      const lx = x + Math.round(W * (0.55 + 0.42 * scatter(i, 93)));
      const ly = bottom - 26 - Math.round(scatter(i, 94) * 22);
      g.rect(lx, ly, 2, 2);
    }
    g.fill({ color: 0xffd98a, alpha: 0.85 * night });
  }

  let flash = 0;
  if (weather === 'rain' || weather === 'storm') {
    const storm = weather === 'storm';
    // Relámpago: destello en el cielo y el rayo.
    if (storm) {
      const l = lightning(t);
      flash = l.flash;
      if (flash > 0) {
        g.rect(x, y, W, H).fill({ color: 0xdfe8ff, alpha: 0.5 * flash });
        let bx = x + 30 + scatter(l.bolt, 97) * (W - 60);
        for (let by = y; by < bottom - 40; by += 6) {
          const nx = bx + (scatter(l.bolt * 31 + by, 98) - 0.5) * 14;
          rect(Math.min(bx, nx), by, Math.abs(nx - bx) + 2, 2);
          rect(nx, by + 2, 2, 4);
          bx = nx;
        }
        g.fill({ color: 0xffffff, alpha: Math.min(1, flash + 0.2) });
      }
    }

    // Lluvia cayendo (inclinada con tormenta).
    const drops = storm ? 130 : 70;
    const slant = storm ? 0.35 : 0.08;
    for (let i = 0; i < drops; i++) {
      const fall = (scatter(i, 35) * H + t * (150 + 70 * scatter(i, 36))) % H;
      const dx = x + ((scatter(i, 34) * W - fall * slant + W) % W);
      const len = 5 + Math.floor(scatter(i, 40) * 4);
      rect(dx, y + fall, 1, len / 2);
      rect(dx - (storm ? 1 : 0), y + fall + len / 2, 1, len / 2);
    }
    g.fill({ color: 0xbcd4f0, alpha: storm ? 0.5 : 0.4 });

    // Gotitas quietas y gotas que se juntan y corren por el vidrio.
    for (let i = 0; i < 46; i++) {
      rect(x + 2 + scatter(i, 41) * (W - 4), y + 2 + scatter(i, 42) * (H - 4), 1, 1);
    }
    g.fill({ color: 0xd8ecff, alpha: 0.28 });
    const runners = storm ? 22 : 14;
    for (let pass = 0; pass < 2; pass++) {
      let any = false;
      for (let i = 0; i < runners; i++) {
        const period = 4 + scatter(i, 43) * 6;
        const phase = ((t + scatter(i, 44) * period) / period) % 1;
        const startY = scatter(i, 45) * H * 0.5;
        const run = phase < 0.4 ? 0 : ((phase - 0.4) / 0.6) ** 2;
        const dy = startY + run * (H - startY);
        const dx = x + 3 + scatter(i, 46) * (W - 6) + Math.round(Math.sin(dy * 0.13 + i) * 1.5);
        if (pass === 0) {
          // Estela.
          if (run > 0) any = rect(dx, y + dy - Math.min(12, dy - startY), 1, Math.min(12, dy - startY)) || any;
        } else {
          any = rect(dx, y + dy, 1, 2) || any;
          if (phase > 0.25) any = rect(dx - 1, y + dy + 1, 3, 1) || any;
        }
      }
      if (any) g.fill({ color: 0xe4f2ff, alpha: pass === 0 ? 0.22 : 0.7 });
    }
  }

  // Reflejo tenue del vidrio.
  for (let j = 0; j < 60; j += 2) rect(x + 46 - j / 2, y + 10 + j, 7, 2);
  g.fill({ color: 0xffffff, alpha: 0.04 });
  return flash;
}
