/**
 * RNG determinista con semilla (mulberry32).
 * El estado es un entero de 32 bits que vive dentro de SimState, así que
 * guardar/cargar una partida conserva exactamente la secuencia.
 */

const UINT32 = 4294967296;

/** Devuelve [valor en [0,1), nuevo estado]. Función pura. */
export function rngNext(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / UINT32;
  return [value, next];
}

/** Convierte cualquier semilla (número o texto) en un estado de 32 bits. */
export function seedToState(seed: number | string): number {
  const text = String(seed);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Envoltorio cómodo: lleva el estado y lo expone para volver a guardarlo. */
export class Rng {
  state: number;

  constructor(state: number) {
    this.state = state >>> 0;
  }

  static fromSeed(seed: number | string): Rng {
    return new Rng(seedToState(seed));
  }

  /** Flotante uniforme en [0, 1). */
  next(): number {
    const [value, state] = rngNext(this.state);
    this.state = state;
    return value;
  }

  /** Flotante uniforme en [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Entero uniforme en [min, max] (ambos incluidos). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Normal estándar (Box-Muller, consume dos valores). */
  gaussian(): number {
    const u = 1 - this.next();
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }
}
