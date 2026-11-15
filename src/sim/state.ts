/** Creación y copia del estado. */

import { oxygenSaturation, phFromKhCo2 } from './chemistry';
import { defaultConfig, type SimConfig } from './config';
import { seedToState } from './rng';
import type { SimState } from './types';

export interface NewTankOptions {
  seed?: number | string;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  hasLid?: boolean;
  heaterWatts?: number;
  heaterSetpointC?: number;
  filterFlowLph?: number;
  roomBaseC?: number;
  /** Arrancar con material de filtro colonizado de otra pecera. */
  seededMedia?: boolean;
  /** Fuente constante de amoníaco, mg N/día (carga biológica). */
  ammoniaMgNPerDay?: number;
}

/**
 * Pecera nueva: recién llenada con agua de canilla acondicionada, ya a la
 * temperatura del calefactor, con apenas un rastro de bacterias.
 */
export function createNewTank(
  options: NewTankOptions = {},
  config: SimConfig = defaultConfig,
): SimState {
  const d = config.newTank;
  const tap = config.tapWater;
  const n = config.nitrogen;

  const lengthCm = options.lengthCm ?? d.lengthCm;
  const widthCm = options.widthCm ?? d.widthCm;
  const heightCm = options.heightCm ?? d.heightCm;
  const fullLiters = ((lengthCm * widthCm * heightCm) / 1000) * d.fillFraction;
  const setpointC = options.heaterSetpointC ?? d.heaterSetpointC;
  const roomBaseC = options.roomBaseC ?? d.roomBaseC;
  const co2 = config.gasExchange.co2EquilibriumMgL;

  const seed = n.seedCapacityMgNPerDay;
  const colonized = options.seededMedia ? n.seededMediaCapacityMgNPerDay : 0;

  return {
    timeMinutes: d.startHour * 60,
    rngState: seedToState(options.seed ?? 1),
    tank: {
      lengthCm,
      widthCm,
      heightCm,
      waterLiters: fullLiters,
      fullLiters,
      hasLid: options.hasLid ?? d.hasLid,
    },
    water: {
      temperatureC: setpointC,
      ammonia: tap.ammonia,
      nitrite: tap.nitrite,
      nitrate: tap.nitrate,
      kh: tap.kh,
      co2,
      ph: phFromKhCo2(tap.kh, co2, config),
      oxygen: oxygenSaturation(setpointC),
      chlorine: 0,
    },
    organics: { foodG: 0, detritusG: 0 },
    bacteria: {
      filter: {
        aob: seed * n.filterSeedShare + colonized,
        nob: seed * n.filterSeedShare + colonized,
      },
      surfaces: {
        aob: seed * (1 - n.filterSeedShare),
        nob: seed * (1 - n.filterSeedShare),
      },
    },
    filter: {
      running: true,
      flowLph: options.filterFlowLph ?? d.filterFlowLph,
      mediaCapacity: d.filterMediaCapacityMgNPerDay,
      clog: 0,
    },
    heater: {
      enabled: true,
      watts: options.heaterWatts ?? d.heaterWatts,
      setpointC,
      on: false,
    },
    light: { startHour: d.lightStartHour, durationHours: d.lightDurationHours },
    room: { baseC: roomBaseC, weatherOffsetC: 0, temperatureC: roomBaseC },
    algae: { biomassG: config.algae.seedGrams },
    bioload: { ammoniaMgNPerDay: options.ammoniaMgNPerDay ?? 0, wasteGPerDay: 0 },
    cycle: { established: false, stableMinutes: 0 },
    alerts: [],
  };
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
    alerts: [...state.alerts],
  };
}
