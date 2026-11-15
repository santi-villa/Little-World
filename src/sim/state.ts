/** Creación y copia del estado. */

import { seedCapacity } from './bacteria';
import { createCat } from './cat';
import { oxygenSaturation, phFromKhCo2 } from './chemistry';
import { DEFAULT_TANK_ID, defaultConfig, getTankModel, type SimConfig } from './config';
import { seedToState } from './rng';
import { roomTargetC, syntheticOutdoorC } from './thermal';
import type { AnimalState, SimState } from './types';

export interface NewTankOptions {
  seed?: number | string;
  /** Modelo del catálogo (data/tanks.json). Por defecto, el cubo del tutorial. */
  tankId?: string;
  hasLid?: boolean;
  heaterWatts?: number;
  heaterSetpointC?: number;
  /** Temperatura exterior media (el exterior es sintético hasta la Fase 3). */
  outdoorBaseC?: number;
  /** Minuto del día en que arranca el reloj (para que coincida con la hora real). */
  startMinuteOfDay?: number;
  /** Arrancar con material de filtro colonizado de otra pecera. */
  seededMedia?: boolean;
  /** Fuente constante de amoníaco, mg N/día (carga biológica). */
  ammoniaMgNPerDay?: number;
}

/**
 * Pecera nueva: recién llenada con agua de la canilla acondicionada, ya a la
 * temperatura del calefactor, con apenas un rastro de bacterias.
 */
export function createNewTank(
  options: NewTankOptions = {},
  config: SimConfig = defaultConfig,
): SimState {
  const d = config.newTank;
  const tap = config.tapWater;
  const model = getTankModel(options.tankId ?? DEFAULT_TANK_ID);

  const fullLiters =
    ((model.lengthCm * model.widthCm * model.heightCm) / 1000) * model.fillFraction;
  const heaterWatts = options.heaterWatts ?? model.heaterWatts;
  const setpointC = options.heaterSetpointC ?? d.heaterSetpointC;
  const hasFilter = model.filterFlowLph > 0;
  const co2 = config.gasExchange.co2EquilibriumMgL;

  const state: SimState = {
    timeMinutes: options.startMinuteOfDay ?? d.startHour * 60,
    rngState: seedToState(options.seed ?? 1),
    tank: {
      modelId: model.id,
      lengthCm: model.lengthCm,
      widthCm: model.widthCm,
      heightCm: model.heightCm,
      waterLiters: fullLiters,
      fullLiters,
      hasLid: options.hasLid ?? model.hasLid,
    },
    water: {
      temperatureC: setpointC,
      ammonia: tap.ammonia,
      nitrite: tap.nitrite,
      nitrate: tap.nitrate,
      phosphate: tap.phosphate,
      ph: phFromKhCo2(tap.kh, co2, config),
      kh: tap.kh,
      gh: tap.gh,
      co2,
      oxygen: oxygenSaturation(setpointC),
      chlorine: 0,
      tannins: 0,
    },
    organics: { foodG: 0, detritusG: 0 },
    bacteria: { filter: { aob: 0, nob: 0 }, surfaces: { aob: 0, nob: 0 } },
    filter: {
      running: hasFilter,
      flowLph: model.filterFlowLph,
      mediaCapacity: model.filterMediaCapacityMgNPerDay,
      clog: 0,
    },
    heater: { enabled: heaterWatts > 0, watts: heaterWatts, setpointC, on: false },
    light: { startHour: d.lightStartHour, durationHours: d.lightDurationHours },
    room: {
      outdoorBaseC: options.outdoorBaseC ?? config.outdoor.defaultBaseC,
      weatherOffsetC: 0,
      outdoorC: 0,
      windowOpen: false,
      temperatureC: 0,
    },
    algae: { glass: config.algae.seedCoverage, decor: config.algae.seedCoverage },
    bioload: { ammoniaMgNPerDay: options.ammoniaMgNPerDay ?? 0, wasteGPerDay: 0 },
    cycle: { established: false, stableMinutes: 0 },
    animals: [],
    nextAnimalId: 1,
    food: { surfaceG: 0, sinkingG: 0 },
    cat: createCat(options.startMinuteOfDay ?? d.startHour * 60),
    alerts: [],
  };

  // La habitación arranca en equilibrio con el exterior.
  state.room.outdoorC = syntheticOutdoorC(state, config);
  state.room.temperatureC = roomTargetC(state.room.outdoorC, false, config);
  if (!state.heater.enabled) state.water.temperatureC = state.room.temperatureC;

  const seed = seedCapacity(state, config);
  const colonized =
    options.seededMedia && hasFilter
      ? config.nitrogen.seededMediaCapacityMgNPerDayPerLiter * fullLiters
      : 0;
  state.bacteria.filter = { aob: seed.filter + colonized, nob: seed.filter + colonized };
  state.bacteria.surfaces = { aob: seed.surfaces, nob: seed.surfaces };
  return state;
}

function cloneAnimal(animal: AnimalState): AnimalState {
  return { ...animal, personality: { ...animal.personality } };
}

/** Copia profunda del estado (más rápida y tipada que pasar por JSON). */
export function cloneState(state: SimState): SimState {
  return {
    timeMinutes: state.timeMinutes,
    rngState: state.rngState,
    tank: { ...state.tank },
    water: { ...state.water },
    organics: { ...state.organics },
    bacteria: {
      filter: { ...state.bacteria.filter },
      surfaces: { ...state.bacteria.surfaces },
    },
    filter: { ...state.filter },
    heater: { ...state.heater },
    light: { ...state.light },
    room: { ...state.room },
    algae: { ...state.algae },
    bioload: { ...state.bioload },
    cycle: { ...state.cycle },
    animals: state.animals.map(cloneAnimal),
    nextAnimalId: state.nextAnimalId,
    food: { ...state.food },
    cat: { ...state.cat, needs: { ...state.cat.needs } },
    alerts: [...state.alerts],
  };
}
