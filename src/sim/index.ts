/**
 * Simulación pura de Little World.
 * Nada en esta carpeta importa Pixi ni toca el DOM: se puede correr en tests,
 * en un worker o en un servidor.
 */

export { step } from './step';
export { applyAction } from './actions';
export { createNewTank, cloneState, type NewTankOptions } from './state';
export { defaultConfig, type SimConfig } from './config';
export { derive, PPM_PER_MG_N, isLightOn, effectiveFlowLph, type DerivedValues } from './derive';
export { Rng, rngNext, seedToState } from './rng';
export {
  ammoniaToxicity,
  freeAmmoniaFraction,
  oxygenSaturation,
  phFromKhCo2,
} from './chemistry';
export { heaterMaxTemperatureC, heatLossWPerK, evaporationLitersPerDay } from './thermal';
export * from './types';
