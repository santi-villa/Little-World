/** Valores derivados del estado: lo que se muestra y lo que comparten varias partes del modelo. */

import { ammoniaToxicity, clamp, freeAmmoniaFraction, oxygenSaturation } from './chemistry';
import { dayIndex, hourOfDay } from './clock';
import { defaultConfig, type SimConfig } from './config';
import type { SimState } from './types';

export function surfaceAreaM2(state: SimState): number {
  return (state.tank.lengthCm * state.tank.widthCm) / 10000;
}

/** Nivel del agua, 0 a 1. */
export function waterLevel(state: SimState): number {
  return state.tank.waterLiters / state.tank.fullLiters;
}

export function isLightOn(state: SimState): boolean {
  const { startHour, durationHours } = state.light;
  if (durationHours <= 0) return false;
  if (durationHours >= 24) return true;
  const elapsed = (hourOfDay(state.timeMinutes) - startHour + 24) % 24;
  return elapsed < durationHours;
}

/** Caudal real del filtro en L/h: baja con la suciedad y si falta agua. */
export function effectiveFlowLph(state: SimState, config: SimConfig = defaultConfig): number {
  if (!state.filter.running || state.filter.flowLph <= 0) return 0;
  const f = config.filter;
  const clogLoss = f.clogMaxFlowLoss * state.filter.clog * state.filter.clog;
  const levelFactor = clamp(
    (waterLevel(state) - f.minLevelFraction) / (f.fullFlowLevelFraction - f.minLevelFraction),
    0,
    1,
  );
  return state.filter.flowLph * (1 - clogLoss) * levelFactor;
}

/** NH3 libre (la parte tóxica del amoníaco), ppm. */
export function freeAmmoniaPpm(state: SimState): number {
  return state.water.ammonia * freeAmmoniaFraction(state.water.ph, state.water.temperatureC);
}

/**
 * Oxígeno de 0 a 1, relativo a la saturación del agua a la temperatura de
 * referencia (20 °C). Así el agua caliente, aunque esté saturada, queda por
 * debajo de 1: tiene menos oxígeno.
 */
export function oxygenRelative(state: SimState, config: SimConfig = defaultConfig): number {
  return state.water.oxygen / oxygenSaturation(config.oxygen.referenceTemperatureC);
}

export interface DerivedValues {
  day: number;
  hour: number;
  lightOn: boolean;
  waterLevel: number;
  /** NH3 libre, ppm. */
  nh3: number;
  nh3Fraction: number;
  /** 0..1 */
  ammoniaToxicity: number;
  /** Oxígeno 0–1 (ver oxygenRelative). */
  oxygenRelative: number;
  /** Oxígeno respecto de la saturación a la temperatura actual, 0–1. */
  oxygenSaturationFraction: number;
  effectiveFlowLph: number;
  turnoverPerHour: number;
  heaterWattsPerLiter: number;
  aobTotal: number;
  nobTotal: number;
}

export function derive(state: SimState, config: SimConfig = defaultConfig): DerivedValues {
  const w = state.water;
  const nh3Fraction = freeAmmoniaFraction(w.ph, w.temperatureC);
  const nh3 = w.ammonia * nh3Fraction;
  const flow = effectiveFlowLph(state, config);
  return {
    day: dayIndex(state.timeMinutes),
    hour: hourOfDay(state.timeMinutes),
    lightOn: isLightOn(state),
    waterLevel: waterLevel(state),
    nh3,
    nh3Fraction,
    ammoniaToxicity: ammoniaToxicity(nh3, config),
    oxygenRelative: oxygenRelative(state, config),
    oxygenSaturationFraction: w.oxygen / oxygenSaturation(w.temperatureC),
    effectiveFlowLph: flow,
    turnoverPerHour: flow / state.tank.waterLiters,
    heaterWattsPerLiter: state.heater.watts / state.tank.waterLiters,
    aobTotal: state.bacteria.filter.aob + state.bacteria.surfaces.aob,
    nobTotal: state.bacteria.filter.nob + state.bacteria.surfaces.nob,
  };
}
