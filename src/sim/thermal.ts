/**
 * Modelo térmico: habitación y agua.
 *
 * El agua intercambia calor con la habitación a través de los vidrios y la
 * superficie, pierde calor al evaporarse y lo gana del calefactor. Como las
 * pérdidas dependen de la superficie y la inercia del volumen, la relación
 * potencia/litros del calefactor decide cuántos grados puede sostener por
 * encima de la habitación.
 *
 * Las funciones "step*" mutan el borrador que les pasa step().
 */

import { saturationVaporPressure } from './chemistry';
import type { SimConfig } from './config';
import { hourOfDay, surfaceAreaM2 } from './derive';
import type { Rng } from './rng';
import type { SimState } from './types';

/** Temperatura de la habitación: media + ciclo diario + clima aleatorio lento. */
export function roomTemperature(state: SimState, config: SimConfig): number {
  const r = config.room;
  const hour = hourOfDay(state.timeMinutes);
  const daily = r.dailyAmplitudeC * Math.cos((2 * Math.PI * (hour - r.peakHour)) / 24);
  return state.room.baseC + daily + state.room.weatherOffsetC;
}

/**
 * Avanza la habitación. El clima es un proceso AR(1) que se actualiza una vez
 * por hora simulada (en el cruce de hora), así el resultado no depende de cómo
 * se parta el tiempo en sub-pasos.
 */
export function stepRoom(
  state: SimState,
  previousTimeMinutes: number,
  rng: Rng,
  config: SimConfig,
): void {
  const r = config.room;
  const hoursCrossed =
    Math.floor(state.timeMinutes / 60) - Math.floor(previousTimeMinutes / 60);
  if (hoursCrossed > 0 && r.weatherSigmaC > 0) {
    const keep = Math.exp(-1 / r.weatherTauHours);
    const kick = r.weatherSigmaC * Math.sqrt(1 - keep * keep);
    for (let i = 0; i < hoursCrossed; i++) {
      state.room.weatherOffsetC = state.room.weatherOffsetC * keep + kick * rng.gaussian();
    }
  }
  state.room.temperatureC = roomTemperature(state, config);
}

/** Conductancia térmica total pecera -> habitación, W/K. */
export function heatLossWPerK(state: SimState, config: SimConfig): number {
  const { lengthCm, widthCm, heightCm, hasLid } = state.tank;
  const l = lengthCm / 100;
  const w = widthCm / 100;
  const h = heightCm / 100;
  const glassArea = 2 * l * h + 2 * w * h + l * w; // cuatro lados + fondo
  const topArea = l * w;
  const t = config.thermal;
  return glassArea * t.glassUWPerM2K + topArea * (hasLid ? t.lidUWPerM2K : t.openTopUWPerM2K);
}

/** Evaporación en litros/día: crece con el agua caliente y el aire seco. */
export function evaporationLitersPerDay(state: SimState, config: SimConfig): number {
  const e = config.evaporation;
  const minLiters = e.minWaterFraction * state.tank.fullLiters;
  if (state.tank.waterLiters <= minLiters) return 0;
  const deficitKPa =
    saturationVaporPressure(state.water.temperatureC) -
    e.roomRelativeHumidity * saturationVaporPressure(state.room.temperatureC);
  if (deficitKPa <= 0) return 0;
  const lid = state.tank.hasLid ? e.lidFactor : 1;
  return e.litersPerDayPerM2PerKPa * surfaceAreaM2(state) * deficitKPa * lid;
}

/** Temperatura que sostendría el calefactor encendido sin parar (sin evaporación). */
export function heaterMaxTemperatureC(state: SimState, config: SimConfig): number {
  return state.room.temperatureC + state.heater.watts / heatLossWPerK(state, config);
}

/**
 * Avanza la temperatura del agua y el termostato del calefactor.
 * `evaporatedLiters` es lo que se evaporó en este sub-paso (para el calor latente).
 */
export function stepWaterTemperature(
  state: SimState,
  dtMinutes: number,
  evaporatedLiters: number,
  config: SimConfig,
): void {
  const t = config.thermal;
  const heater = state.heater;
  const water = state.water;

  if (!heater.enabled || heater.watts <= 0) {
    heater.on = false;
  } else if (water.temperatureC < heater.setpointC - t.heaterHysteresisC) {
    heater.on = true;
  } else if (water.temperatureC > heater.setpointC + t.heaterHysteresisC) {
    heater.on = false;
  }

  const seconds = dtMinutes * 60;
  const heatCapacity = state.tank.waterLiters * t.waterHeatCapacityJPerLiterK; // J/K
  const ua = heatLossWPerK(state, config);

  // Intercambio con la habitación: solución exacta de la relajación (estable con cualquier dt).
  const heaterWatts = heater.on ? heater.watts : 0;
  const equilibriumC = state.room.temperatureC + heaterWatts / ua;
  const decay = Math.exp((-ua * seconds) / heatCapacity);
  let next = equilibriumC + (water.temperatureC - equilibriumC) * decay;

  // Calor latente que se lleva el agua evaporada.
  next -= (evaporatedLiters * t.evaporationLatentHeatJPerLiter) / heatCapacity;

  water.temperatureC = next;
}
