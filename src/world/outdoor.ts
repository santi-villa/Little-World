/**
 * De dónde sale la temperatura exterior.
 *
 * El juego la pide a través de esta interfaz: el valor actual mientras está
 * abierto y el histórico horario para el catch-up offline. Por ahora hay una
 * sola implementación, con un valor fijo configurable; el clima real
 * (Open-Meteo, con `past_days` para el histórico) va a ser otra
 * implementación de la misma interfaz.
 */

export interface OutdoorTemperatureSource {
  /** Temperatura exterior ahora, °C. */
  currentC(nowMs: number): number;
  /**
   * Temperatura hora por hora desde `startMs`: `hours + 1` valores (el
   * primero es el de `startMs`). Es asíncrono porque el clima real se baja
   * de internet.
   */
  hourlyC(startMs: number, hours: number): Promise<number[]>;
}

/** Exterior fijo: siempre la misma temperatura. */
export class FixedOutdoorTemperature implements OutdoorTemperatureSource {
  constructor(public temperatureC: number) {}

  currentC(): number {
    return this.temperatureC;
  }

  hourlyC(_startMs: number, hours: number): Promise<number[]> {
    const count = Math.max(1, Math.ceil(hours) + 1);
    return Promise.resolve(new Array<number>(count).fill(this.temperatureC));
  }
}
