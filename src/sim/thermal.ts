/**
 * Temperatura de la habitación y de la pecera.
 *
 * - La habitación sigue a la temperatura exterior con inercia (la casa
 *   amortigua): tiende a T_confort + k * (T_ext - T_confort), con k más alto
 *   si la ventana está abierta.
 * - El agua tiende a la temperatura de la habitación. Intercambia calor por
 *   los vidrios y la superficie, pierde calor al evaporarse y lo gana del
 *   calefactor. Como las pérdidas dependen de la superficie y la inercia del
 *   volumen, la relación potencia/litros decide cuántos grados sostiene el
 *   calefactor por encima de la habitación.
 *
 * Las funciones "step*" mutan el borrador que les pasa step().
 */

import { saturationVaporPressure } from './chemistry';
import { MINUTES_PER_HOUR, hourOfDay } from './clock';
import type { SimConfig } from './config';
import { surfaceAreaM2 } from './derive';
import { outdoorAt, type OutdoorSeries } from './environment';
import type { Rng } from './rng';
import type { SimState } from './types';

/** Temperatura a la que tiende la habitación para una temperatura exterior dada. */
export function roomTargetC(outdoorC: number, windowOpen: boolean, config: SimConfig): number {
  const r = config.room;
  const k = windowOpen ? r.outdoorCouplingWindowOpen : r.outdoorCouplingWindowClosed;
  return r.comfortC + k * (outdoorC - r.comfortC);
}

/** Exterior sintético (hasta el clima real de la Fase 3): media + ciclo diario + clima. */
export function syntheticOutdoorC(state: SimState, config: SimConfig): number {
  const o = config.outdoor;
  const hour = hourOfDay(state.timeMinutes);
  const daily = o.dailyAmplitudeC * Math.cos((2 * Math.PI * (hour - o.peakHour)) / 24);
  return state.room.outdoorBaseC + daily + state.room.weatherOffsetC;
}

/**
 * Avanza el exterior y la habitación.
 *
 * Si llega una serie horaria de temperatura exterior (el clima real, o el
 * valor fijo que usa el juego mientras tanto) se usa esa. Si no, el exterior
 * es sintético: el clima es un proceso AR(1) que se actualiza una vez por
 * hora (en el cruce de hora), así el resultado no depende de cómo se parta
 * el tiempo en pasos.
 */
export function stepRoom(
  state: SimState,
  previousTimeMinutes: number,
  dtMinutes: number,
  rng: Rng,
  config: SimConfig,
  outdoor?: OutdoorSeries,
): void {
  const o = config.outdoor;
  const room = state.room;
  if (outdoor && outdoor.hourlyC.length > 0) {
    // Se toma el valor del medio del paso.
    room.outdoorC = outdoorAt(outdoor, state.timeMinutes - dtMinutes / 2);
  } else {
    const hoursCrossed =
      Math.floor(state.timeMinutes / MINUTES_PER_HOUR) -
      Math.floor(previousTimeMinutes / MINUTES_PER_HOUR);
    if (hoursCrossed > 0 && o.weatherSigmaC > 0) {
      const keep = Math.exp(-1 / o.weatherTauHours);
      const kick = o.weatherSigmaC * Math.sqrt(1 - keep * keep);
      for (let i = 0; i < hoursCrossed; i++) {
        room.weatherOffsetC = room.weatherOffsetC * keep + kick * rng.gaussian();
      }
    }
    room.outdoorC = syntheticOutdoorC(state, config);
  }

  const r = config.room;
  const target = roomTargetC(room.outdoorC, room.windowOpen, config);
  const inertiaHours = room.windowOpen ? r.inertiaHoursWindowOpen : r.inertiaHoursWindowClosed;
  const decay = Math.exp(-dtMinutes / (inertiaHours * MINUTES_PER_HOUR));
  room.temperatureC = target + (room.temperatureC - target) * decay;
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

/** Evaporación en litros/día: más con agua caliente, aire seco y sin tapa. */
export function evaporationLitersPerDay(state: SimState, config: SimConfig): number {
  const e = config.evaporation;
  const minLiters = e.minWaterFraction * state.tank.fullLiters;
  if (state.tank.waterLiters <= minLiters) return 0;
  const deficitKPa =
    saturationVaporPressure(state.water.temperatureC) -
    config.room.relativeHumidity * saturationVaporPressure(state.room.temperatureC);
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
 * `evaporatedLiters` es lo que se evaporó en este paso (para el calor latente).
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
