/**
 * Lo que la simulación recibe de afuera en cada step(): el clima real y si
 * el jugador está mirando. Es opcional: sin entorno, el exterior es el
 * sintético de thermal.ts (media + ciclo diario + desvío aleatorio).
 */

import { MINUTES_PER_HOUR } from './clock';
import type { Weather } from './types';

/**
 * Temperatura exterior horaria. `hourlyC[0]` corresponde al minuto
 * `startTimeMinutes` del reloj de la simulación y cada valor siguiente a una
 * hora después. Entre horas se interpola; fuera de la serie vale el extremo.
 */
export interface OutdoorSeries {
  startTimeMinutes: number;
  hourlyC: readonly number[];
}

export interface SimEnvironment {
  outdoor?: OutdoorSeries;
  weather?: Weather;
  /** El juego está abierto y a la vista (los peces aprenden a pedir comida). */
  playerPresent?: boolean;
}

export const NO_ENVIRONMENT: SimEnvironment = {};

/** Serie de un solo valor: el exterior no cambia. */
export function constantOutdoor(temperatureC: number, startTimeMinutes = 0): OutdoorSeries {
  return { startTimeMinutes, hourlyC: [temperatureC] };
}

export function outdoorAt(series: OutdoorSeries, timeMinutes: number): number {
  const values = series.hourlyC;
  const last = values.length - 1;
  if (last < 0) return Number.NaN;
  const position = (timeMinutes - series.startTimeMinutes) / MINUTES_PER_HOUR;
  if (position <= 0) return values[0] as number;
  if (position >= last) return values[last] as number;
  const index = Math.floor(position);
  const a = values[index] as number;
  const b = values[index + 1] as number;
  return a + (b - a) * (position - index);
}
