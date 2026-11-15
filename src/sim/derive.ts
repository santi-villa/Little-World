/** Valores derivados del estado: lo que se muestra y lo que usan varias partes del modelo. */

import {
  ammoniaToxicity,
  clamp,
  freeAmmoniaFraction,
  oxygenSaturation,
} from './chemistry';
import { defaultConfig, type SimConfig } from './config';
import type { SimState } from './types';

/** Factores para pasar de "mg/L como N" a las ppm de los tests de acuarismo. */
export const PPM_PER_MG_N = {
  ammonia: 17.031 / 14.007, // como NH3
  nitrite: 46.005 / 14.007, // como NO2-
  nitrate: 62.004 / 14.007, // como NO3-
} as const;

export function tankCapacityLiters(state: SimState): number {
  const { lengthCm, widthCm, heightCm } = state.tank;
  return (lengthCm * widthCm * heightCm) / 1000;
}

export function surfaceAreaM2(state: SimState): number {
  return (state.tank.lengthCm * state.tank.widthCm) / 10000;
}

export function hourOfDay(timeMinutes: number): number {
  return ((timeMinutes / 60) % 24 + 24) % 24;
}

export function isLightOn(state: SimState, timeMinutes = state.timeMinutes): boolean {
  const hour = hourOfDay(timeMinutes);
  const { startHour, durationHours } = state.light;
  if (durationHours <= 0) return false;
  if (durationHours >= 24) return true;
  const elapsed = (hour - startHour + 24) % 24;
  return elapsed < durationHours;
}

/** Caudal real del filtro en L/h: baja con la suciedad y si falta agua. */
export function effectiveFlowLph(state: SimState, config: SimConfig = defaultConfig): number {
  if (!state.filter.running) return 0;
  const f = config.filter;
  const clogLoss = f.clogMaxFlowLoss * state.filter.clog * state.filter.clog;
  const level = state.tank.waterLiters / state.tank.fullLiters;
  const levelFactor = clamp(
    (level - f.minLevelFraction) / (f.fullFlowLevelFraction - f.minLevelFraction),
    0,
    1,
  );
  return state.filter.flowLph * (1 - clogLoss) * levelFactor;
}

export interface DerivedValues {
  day: number;
  hour: number;
  lightOn: boolean;
  capacityLiters: number;
  levelFraction: number;
  /** NH3 libre, mg/L como N. */
  nh3: number;
  nh3Fraction: number;
  /** 0..1 */
  ammoniaToxicity: number;
  ammoniaPpm: number;
  nitritePpm: number;
  nitratePpm: number;
  oxygenSaturationMgL: number;
  oxygenPercent: number;
  effectiveFlowLph: number;
  turnoverPerHour: number;
  heaterWattsPerLiter: number;
  aobTotal: number;
  nobTotal: number;
  algaeFraction: number;
}

export function derive(state: SimState, config: SimConfig = defaultConfig): DerivedValues {
  const w = state.water;
  const nh3Fraction = freeAmmoniaFraction(w.ph, w.temperatureC);
  const nh3 = w.ammonia * nh3Fraction;
  const saturation = oxygenSaturation(w.temperatureC);
  const flow = effectiveFlowLph(state, config);
  return {
    day: Math.floor(state.timeMinutes / 1440),
    hour: hourOfDay(state.timeMinutes),
    lightOn: isLightOn(state),
    capacityLiters: tankCapacityLiters(state),
    levelFraction: state.tank.waterLiters / state.tank.fullLiters,
    nh3,
    nh3Fraction,
    ammoniaToxicity: ammoniaToxicity(nh3, config),
    ammoniaPpm: w.ammonia * PPM_PER_MG_N.ammonia,
    nitritePpm: w.nitrite * PPM_PER_MG_N.nitrite,
    nitratePpm: w.nitrate * PPM_PER_MG_N.nitrate,
    oxygenSaturationMgL: saturation,
    oxygenPercent: (w.oxygen / saturation) * 100,
    effectiveFlowLph: flow,
    turnoverPerHour: flow / state.tank.waterLiters,
    heaterWattsPerLiter: state.heater.watts / state.tank.waterLiters,
    aobTotal: state.bacteria.filter.aob + state.bacteria.surfaces.aob,
    nobTotal: state.bacteria.filter.nob + state.bacteria.surfaces.nob,
    algaeFraction:
      state.algae.biomassG / (config.algae.capacityGramsPerLiter * state.tank.waterLiters),
  };
}
