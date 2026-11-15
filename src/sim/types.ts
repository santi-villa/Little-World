/**
 * Estado completo de la simulación. Es JSON puro (sin clases ni funciones)
 * para poder guardarlo tal cual y portarlo a otro motor.
 *
 * Unidades:
 *  - tiempo: minutos
 *  - concentraciones: ppm (mg/L), como las leería un test de acuarismo:
 *    amoníaco total como NH3, nitrito como NO2-, nitrato como NO3-,
 *    fosfato como PO4
 *  - KH y GH: grados alemanes
 *  - bacterias: capacidad máxima de oxidación de la colonia, en mg de N por día
 */

export interface TankState {
  /** Modelo del catálogo (data/tanks.json). */
  modelId: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  /** Litros de agua que hay ahora (baja con la evaporación). */
  waterLiters: number;
  /** Litros con la pecera llena (nivel 1). */
  fullLiters: number;
  hasLid: boolean;
}

export interface WaterState {
  temperatureC: number;
  /** Amoníaco total (NH3 + NH4+), ppm. */
  ammonia: number;
  /** Nitrito (NO2-), ppm. */
  nitrite: number;
  /** Nitrato (NO3-), ppm. */
  nitrate: number;
  /** Fosfato (PO4), ppm. Simplificado: solo importa para las algas. */
  phosphate: number;
  ph: number;
  /** Dureza de carbonatos, dKH. Amortigua el pH. */
  kh: number;
  /** Dureza general, dGH. */
  gh: number;
  /** CO2 disuelto, mg/L. Junto con el KH determina el pH. */
  co2: number;
  /** Oxígeno disuelto, mg/L (ver derive().oxygenRelative para el valor 0–1). */
  oxygen: number;
  /** Cloro libre, ppm. */
  chlorine: number;
  /** Taninos, 0–1 (color ámbar del agua). */
  tannins: number;
}

/** Residuos orgánicos: comida sin comer + restos. */
export interface OrganicsState {
  /** Comida sin comer pudriéndose, gramos. */
  foodG: number;
  /** Detrito / mulm acumulado, gramos. */
  detritusG: number;
}

export interface Colony {
  /** Bacterias que pasan amoníaco a nitrito, mg N/día. */
  aob: number;
  /** Bacterias que pasan nitrito a nitrato, mg N/día. */
  nob: number;
}

export interface BacteriaState {
  /** Colonia en el material filtrante (la mayor parte). */
  filter: Colony;
  /** Colonia en sustrato, vidrios y decoración. */
  surfaces: Colony;
}

export interface FilterState {
  /** false si la pecera no tiene filtro (caudal nominal 0). */
  running: boolean;
  /** Caudal nominal en L/h con el filtro limpio. */
  flowLph: number;
  /** Colonia máxima que soporta el material filtrante, mg N/día. */
  mediaCapacity: number;
  /** Suciedad acumulada, 0 (limpio) a 1 (tapado). */
  clog: number;
}

export interface HeaterState {
  enabled: boolean;
  watts: number;
  setpointC: number;
  /** Estado del termostato (calentando ahora mismo). */
  on: boolean;
}

export interface LightState {
  startHour: number;
  durationHours: number;
}

export interface RoomState {
  /**
   * Temperatura exterior media. Hasta que llegue el clima real (Fase 3) el
   * exterior es sintético: esta media + ciclo diario + clima aleatorio.
   */
  outdoorBaseC: number;
  /** Desvío aleatorio lento del clima exterior. */
  weatherOffsetC: number;
  outdoorC: number;
  windowOpen: boolean;
  temperatureC: number;
}

/** Algas, como cobertura de 0 a 1. */
export interface AlgaeState {
  glass: number;
  decor: number;
}

/** Carga biológica externa (peces, en fases futuras). */
export interface BioloadState {
  ammoniaMgNPerDay: number;
  wasteGPerDay: number;
}

export interface CycleState {
  established: boolean;
  /** Minutos seguidos con amoníaco y nitrito en cero. */
  stableMinutes: number;
}

export const ALERT_IDS = [
  'ammonia_stress',
  'ammonia_danger',
  'nitrite_stress',
  'nitrite_danger',
  'nitrate_stress',
  'nitrate_danger',
  'oxygen_stress',
  'oxygen_danger',
  'chlorine_present',
  'ph_crash',
  'kh_low',
  'water_low',
  'filter_clogged',
  'algae_bloom',
] as const;

export type AlertId = (typeof ALERT_IDS)[number];

export interface SimState {
  timeMinutes: number;
  /** Estado del RNG (entero de 32 bits). Es la "semilla" que se guarda. */
  rngState: number;
  tank: TankState;
  water: WaterState;
  organics: OrganicsState;
  bacteria: BacteriaState;
  filter: FilterState;
  heater: HeaterState;
  light: LightState;
  room: RoomState;
  algae: AlgaeState;
  bioload: BioloadState;
  cycle: CycleState;
  /** Alertas activas en este momento. */
  alerts: AlertId[];
}

/** 'tankWater' = bien (agua de la pecera), 'tapWater' = mal (agua de la canilla). */
export type FilterCleanMethod = 'tankWater' | 'tapWater';

export type SimEvent =
  | { type: 'alert_raised'; timeMinutes: number; alert: AlertId; value: number }
  | { type: 'alert_cleared'; timeMinutes: number; alert: AlertId; value: number }
  | { type: 'cycle_established'; timeMinutes: number }
  | { type: 'cycle_lost'; timeMinutes: number }
  | { type: 'fed'; timeMinutes: number; grams: number }
  | {
      type: 'water_changed';
      timeMinutes: number;
      fraction: number;
      liters: number;
      conditioned: boolean;
    }
  | { type: 'topped_off'; timeMinutes: number; liters: number; conditioned: boolean }
  | {
      type: 'filter_cleaned';
      timeMinutes: number;
      method: FilterCleanMethod;
      bacteriaLostFraction: number;
    }
  | { type: 'filter_media_replaced'; timeMinutes: number }
  | { type: 'conditioner_added'; timeMinutes: number }
  | { type: 'glass_cleaned'; timeMinutes: number; coverageRemoved: number }
  | { type: 'seeded_media_added'; timeMinutes: number }
  | { type: 'ammonia_dosed'; timeMinutes: number; ppm: number };

export interface StepResult {
  state: SimState;
  events: SimEvent[];
}

export type SimAction =
  | { type: 'feed'; grams: number }
  | {
      type: 'waterChange';
      fraction: number;
      conditioned: boolean;
      /** Sifonear el fondo mientras se saca el agua. */
      vacuum?: boolean;
      /** Temperatura del agua nueva. Por defecto, la de la canilla. */
      temperatureC?: number;
    }
  | { type: 'topOff'; conditioned: boolean; temperatureC?: number }
  | { type: 'cleanFilter'; method: FilterCleanMethod }
  | { type: 'replaceFilterMedia' }
  | { type: 'addConditioner' }
  | { type: 'cleanGlass' }
  | { type: 'addSeededMedia' }
  | { type: 'doseAmmonia'; ppm: number }
  | { type: 'setHeater'; enabled?: boolean; watts?: number; setpointC?: number }
  | { type: 'setFilterRunning'; running: boolean }
  | { type: 'setLid'; hasLid: boolean }
  | { type: 'setLight'; startHour?: number; durationHours?: number }
  | { type: 'setWindow'; open: boolean }
  | { type: 'setOutdoorBase'; baseC: number }
  | { type: 'setBioload'; ammoniaMgNPerDay?: number; wasteGPerDay?: number };
