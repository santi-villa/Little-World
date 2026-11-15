/** Utilidades de dibujo compartidas por las capas de la escena. */

export function lerpColor(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return (r << 16) | (g << 8) | bl;
}

/** Pseudoazar fijo por índice (0..1), para repartir motas sin que titilen. */
export function scatter(index: number, salt: number): number {
  let h = Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** 0 de noche, 1 de día, con amanecer y atardecer suaves. */
export function daylight(hour: number): number {
  if (hour < 6 || hour >= 21) return 0;
  if (hour < 8) return (hour - 6) / 2;
  if (hour >= 19) return (21 - hour) / 2;
  return 1;
}
