/**
 * Simulación pura de Little World.
 * Nada en esta carpeta importa Pixi ni toca el DOM o APIs del navegador: se
 * puede correr en tests, simular días enteros sin dibujar y portar a otro motor.
 */

export { step } from './step';
export { applyAction } from './actions';
export { createNewTank, cloneState, type NewTankOptions } from './state';
export {
  DEFAULT_TANK_ID,
  TANK_MODELS,
  defaultConfig,
  getTankModel,
  type SimConfig,
  type TankModel,
} from './config';
export { MINUTES_PER_DAY, MINUTES_PER_HOUR, dayIndex, hourOfDay, planSteps } from './clock';
export {
  derive,
  effectiveFlowLph,
  freeAmmoniaPpm,
  isLightOn,
  oxygenRelative,
  waterLevel,
  type DerivedValues,
} from './derive';
export { Rng, rngNext, seedToState } from './rng';
export {
  NITROGEN_FRACTION,
  ammoniaToxicity,
  freeAmmoniaFraction,
  oxygenSaturation,
  phFromKhCo2,
} from './chemistry';
export {
  evaporationLitersPerDay,
  heatLossWPerK,
  heaterMaxTemperatureC,
  roomTargetC,
} from './thermal';
export * from './types';
