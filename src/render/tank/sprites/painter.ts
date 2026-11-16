/**
 * Sistema de sprites de peces dibujados por código.
 *
 * Cada especie es un `FishSprite`: una función que "pinta" píxeles en un
 * lienzo chico con coordenadas propias del animal:
 *   x = 0 en el hocico y crece hacia la cola;  y = 0 en el eje del cuerpo
 *   (negativo hacia arriba).
 * El pintor se ocupa de todo lo demás: mirar a izquierda o derecha, el giro
 * suave (el sprite se acorta como si girara hacia la cámara), la ondulación
 * del cuerpo al nadar, la panza arriba de los muertos y el tinte final
 * (noche, plano lejano, enfermedad).
 *
 * Para sumar una especie: crear su archivo con el dibujo y registrarla en
 * `index.ts`. No hay que tocar nada más.
 */

import type { Graphics } from 'pixi.js';

export interface SpritePose {
  /** Largo del animal en píxeles (sin contar aletas de velo). */
  len: number;
  seconds: number;
  /** Fase acumulada del coletazo: avanza más rápido cuanto más rápido nada. */
  wag: number;
  /** 0 quieto .. 1 a toda velocidad. */
  swim: number;
  /** Semilla del individuo (para variaciones de color). */
  seed: number;
  sex: 'male' | 'female';
  /** 0 sano .. 1 aletas destrozadas. */
  finDamage: number;
  resting: boolean;
  alive: boolean;
  /** Luz apagada. */
  night: boolean;
}

export interface FishSprite {
  /** Ritmo del coletazo (1 = normal; los chicos aletean más rápido). */
  tempo?: number;
  /** Amplitud de la ondulación del cuerpo, como fracción del largo. */
  wave?: number;
  /** Largo mínimo en píxeles para que se lea. */
  minLen?: number;
  draw(p: SpritePainter, pose: SpritePose): void;
}

const W = 224;
const H = 144;
const OX = W >> 1;
const OY = H >> 1;

export class SpritePainter {
  /** Corrimiento vertical del sprite entero (los que caminan apoyan en y = 0). */
  originY = 0;
  private readonly buf = new Int32Array(W * H).fill(-1);
  private readonly runs = new Map<number, number[]>();
  private minX = W;
  private maxX = -1;
  private minY = H;
  private maxY = -1;
  private half = 0;
  private len = 1;
  private turn = 1;
  private waveAmp = 0;
  private wag = 0;
  private flip = false;

  /**
   * @param turn    -1 mira a la izquierda .. 1 a la derecha (los valores intermedios acortan el sprite).
   * @param waveAmp Amplitud de la ondulación en la cola, en píxeles.
   * @param flip    Panza arriba.
   */
  begin(len: number, turn: number, waveAmp: number, wag: number, flip: boolean): void {
    this.len = Math.max(1, len);
    this.half = len / 2;
    this.turn = turn;
    this.waveAmp = waveAmp;
    this.wag = wag;
    this.flip = flip;
    this.originY = 0;
  }

  /** Un píxel. Lo último que se pinta tapa lo anterior. */
  px(x: number, y: number, color: number): void {
    if (color < 0) return;
    const sx = OX + Math.round((this.half - x) * this.turn);
    let wy = y;
    if (this.waveAmp > 0) {
      const u = Math.min(1.5, Math.max(0, x / this.len));
      wy += Math.round(Math.sin(this.wag - u * 3.2) * this.waveAmp * u * u);
    }
    const sy = OY + this.originY + (this.flip ? -wy : wy);
    if (sx < 0 || sx >= W || sy < 0 || sy >= H) return;
    this.buf[sy * W + sx] = color;
    if (sx < this.minX) this.minX = sx;
    if (sx > this.maxX) this.maxX = sx;
    if (sy < this.minY) this.minY = sy;
    if (sy > this.maxY) this.maxY = sy;
  }

  /** Columna de `y0` (incluido) a `y1` (sin incluir). */
  col(x: number, y0: number, y1: number, color: number): void {
    for (let y = y0; y < y1; y++) this.px(x, y, color);
  }

  /**
   * Forma por columnas: `edge` da el borde de arriba y el de abajo de cada
   * columna y `color` el color de cada píxel (-1 = transparente).
   * `u` va de 0 (primera columna) a 1 (última).
   */
  shape(
    x0: number,
    x1: number,
    edge: (u: number, x: number) => readonly [number, number],
    color: (u: number, x: number, y: number, y0: number, y1: number) => number,
  ): void {
    const n = Math.max(1, x1 - x0 - 1);
    for (let x = x0; x < x1; x++) {
      const u = (x - x0) / n;
      const e = edge(u, x);
      const y0 = Math.round(e[0]);
      const y1 = Math.max(y0 + 1, Math.round(e[1]));
      for (let y = y0; y < y1; y++) this.px(x, y, color(u, x, y, y0, y1));
    }
  }

  /** Vuelca lo pintado en `g`, centrado en (cx, cy), y deja el lienzo limpio. */
  flush(g: Graphics, cx: number, cy: number, tint: (color: number) => number): void {
    const { buf, runs } = this;
    runs.clear();
    for (let y = this.minY; y <= this.maxY; y++) {
      let x = this.minX;
      while (x <= this.maxX) {
        const i = y * W + x;
        const c = buf[i] as number;
        if (c < 0) {
          x++;
          continue;
        }
        let w = 1;
        buf[i] = -1;
        while (x + w <= this.maxX && buf[i + w] === c) {
          buf[i + w] = -1;
          w++;
        }
        const list = runs.get(c);
        if (list) list.push(x, y, w);
        else runs.set(c, [x, y, w]);
        x += w;
      }
    }
    for (const [color, list] of runs) {
      for (let i = 0; i < list.length; i += 3) {
        g.rect(cx + (list[i] as number) - OX, cy + (list[i + 1] as number) - OY, list[i + 2] as number, 1);
      }
      g.fill(tint(color));
    }
    this.minX = W;
    this.maxX = -1;
    this.minY = H;
    this.maxY = -1;
  }
}

export const EYE = 0x10141c;
export const EYE_SHINE = 0xf4f8ff;

/** Ojo: un píxel, o 2×2 con brillo cuando el pez es grande. */
export function eye(p: SpritePainter, x: number, y: number, big: boolean, alive: boolean): void {
  const dark = alive ? EYE : 0xdfe3e8;
  p.px(x, y, dark);
  if (!big) return;
  p.px(x + 1, y, dark);
  p.px(x, y + 1, dark);
  p.px(x + 1, y + 1, dark);
  if (alive) p.px(x, y, EYE_SHINE);
}
