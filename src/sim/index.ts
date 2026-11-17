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
export {
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  dayIndex,
  hourOfDay,
  planCatchUp,
  planSteps,
  type CatchUpPlan,
  type StepPlan,
} from './clock';
export { catchUp, type CatchUpResult } from './catchup';
export {
  buildWelcomeSummary,
  formatDuration,
  type SummaryLine,
  type SummaryTone,
  type WelcomeSummary,
} from './summary';
export {
  NO_ENVIRONMENT,
  constantOutdoor,
  outdoorAt,
  type OutdoorSeries,
  type SimEnvironment,
} from './environment';
export {
  SPECIES,
  findSpecies,
  getSpecies,
  groupStyle,
  hasTrait,
  type ActivityRhythm,
  type Species,
  type SpeciesCategory,
  type Temperament,
  type Zone,
} from './species';
export {
  buildContext,
  canEatSpecies,
  createAnimal,
  isAdult,
  metabolism,
  moodOf,
  sizeFactor,
  type TankContext,
} from './fish';
export { foodInReach, fullMealG, layerAccess } from './feeding';
export { decideIntents, isActivePeriod, isDaytime } from './behavior';
export { createCat } from './cat';
export {
  checkAddition,
  checkCompatibility,
  defaultMales,
  stockFromAnimals,
  type CompatCode,
  type CompatSeverity,
  type CompatTank,
  type CompatWarning,
  type StockEntry,
} from './compat';
export { fill } from './text';
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
