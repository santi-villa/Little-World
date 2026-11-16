/** Utilidad para dibujar muchos rectángulos con pocos rellenos. */

import type { Graphics } from 'pixi.js';

/**
 * Junta rectángulos para rellenarlos de a tandas.
 * - Por defecto agrupa por color (un solo relleno por color): rápido, para lo
 *   que se redibuja en cada cuadro, pero no respeta el orden entre colores.
 * - Con `ordered`, respeta el orden exacto en que se agregaron (lo último tapa
 *   lo anterior): para las capas fijas con muchas cosas superpuestas.
 */
export class Batch {
  private readonly rects = new Map<number, number[]>();
  private readonly seq: number[] = [];

  constructor(private readonly ordered = false) {}

  add(color: number, x: number, y: number, w: number, h: number): void {
    if (w <= 0 || h <= 0) return;
    if (this.ordered) {
      this.seq.push(color, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
      return;
    }
    const list = this.rects.get(color);
    if (list) list.push(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    else this.rects.set(color, [Math.round(x), Math.round(y), Math.round(w), Math.round(h)]);
  }

  /** `shade` se aplica al color al rellenar (noche, tinte). */
  flush(g: Graphics, shade?: (color: number) => number, alpha = 1): void {
    const fill = (color: number): void => {
      const c = shade ? shade(color) : color;
      g.fill(alpha >= 1 ? c : { color: c, alpha });
    };
    const seq = this.seq;
    for (let i = 0; i < seq.length; i += 5) {
      g.rect(seq[i + 1] as number, seq[i + 2] as number, seq[i + 3] as number, seq[i + 4] as number);
      if (i + 5 >= seq.length || seq[i + 5] !== seq[i]) fill(seq[i] as number);
    }
    seq.length = 0;
    for (const [color, list] of this.rects) {
      for (let i = 0; i < list.length; i += 4) {
        g.rect(list[i] as number, list[i + 1] as number, list[i + 2] as number, list[i + 3] as number);
      }
      fill(color);
    }
    this.rects.clear();
  }
}
