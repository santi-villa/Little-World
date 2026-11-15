/**
 * Estado completo de la simulación. Es JSON puro (sin clases ni funciones)
 * para poder guardarlo tal cual en IndexedDB.
 *
 * Unidades:
 *  - tiempo: minutos simulados
 *  - concentraciones: mg/L (los compuestos de nitrógeno se guardan "como N";
 *    ver derive.ts para pasarlos a las ppm que marcaría un test de acuarismo)
 *  - KH: grados alemanes (dKH)
 *  - bacterias: capacidad máxima de oxidación de la colonia, en mg N/día
 */

export interface TankState {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  /** Litros de agua que hay ahora (baja con la evaporación). */
  waterLiters: number;
  /** Litros con los que se considera "llena" (nivel al que se rellena). */
  fullLiters: number;
  hasLid: boolean;
}

export interface WaterState {
  temperatureC: number;
  /** Amoníaco total (NH3 + NH4+), mg/L como N. */
  ammonia: number;
  /** Nitrito, mg/L como N. */
  nitrite: number;
  /** Nitrato, mg/L como N. */
  nitrate: number;
  /** Dureza de carbonatos, dKH. */
  kh: number;
  /** CO2 disuelto, mg/L. Junto con el KH determina el pH. */
  co2: number;
  ph: number;
  /** Oxígeno disuelto, mg/L. */
  oxygen: number;
  /** Cloro libre, mg/L. */
  chlorine: number;
}

export interface OrganicsState {
  /** Comida sin comer pudriéndose, gramos. */
  foodG: number;
  /** Detrito / mulm acumulado, gramos. */
  detritusG: number;
}

export interface Colony {
  /** Bacterias oxidantes de amoníaco (NH3 -> NO2), mg N/día. */
  aob: number;
  /** Bacterias oxidantes de nitrito (NO2 -> NO3), mg N/día. */
  nob: number;
}

export interface BacteriaState {
  /** Colonia en el material filtrante (la mayoría). */
  filter: Colony;
  /** Colonia en sustrato, vidrios y decoración. */
  surfaces: Colony;
}

export interface FilterState {
  running: boolean;
  /** Caudal nominal en L/h con el filtro limpio. */
  flowLph: number;
  /** Capacidad máxima de colonia que soporta el material, mg N/día. */
  mediaCapacity: number;
  /** Suciedad acumulada, 0 (limpio) a 1 (tapado). */
  clog: number;
}

export interface HeaterState {
  enabled: boolean;
  watts: number;
  setpointC: number;
  /** Estado del termostato (encendido ahora mismo). */
  on: boolean;
}

export interface LightState {
  startHour: number;
  durationHours: number;
}

export interface RoomState {
  /** Temperatura media de la habitación (estación / climatización). */
  baseC: number;
  /** Desvío aleatorio lento por el clima. */
  weatherOffsetC: number;
  temperatureC: number;
}

export interface AlgaeState {
  /** Biomasa seca, gramos. */
  biomassG: number;
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
  'ammonia_warning',
  'ammonia_danger',
  'nitrite_warning',
  'nitrite_danger',
  'nitrate_high',
  'ph_low',
  'ph_high',
  'kh_low',
  'oxygen_low',
  'oxygen_critical',
  'chlorine_present',
  'temperature_low',
  'temperature_high',
  'water_low',
  'filter_clogged',
  'algae_bloom',
] as const;

export type AlertId = (typeof ALERT_IDS)[number];

export interface SimState {
  timeMinutes: number;
  /** Estado del RNG (entero de 32 bits). */
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
  | { type: 'conditioner_added'; timeMinutes: number }
  | { type: 'algae_scrubbed'; timeMinutes: number; gramsRemoved: number }
  | { type: 'seeded_media_added'; timeMinutes: number }
  | { type: 'ammonia_dosed'; timeMinutes: number; mgPerLiter: number };

export interface StepResult {
  state: SimState;
  events: SimEvent[];
}

/** 'tankWater' = bien (agua de la pecera), 'tapWater' = mal (agua de canilla). */
export type FilterCleanMethod = 'tankWater' | 'tapWater';

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
  | { type: 'addConditioner' }
  | { type: 'scrubAlgae' }
  | { type: 'addSeededMedia' }
  | { type: 'doseAmmonia'; mgPerLiter: number }
  | { type: 'setHeater'; enabled?: boolean; watts?: number; setpointC?: number }
  | { type: 'setFilterRunning'; running: boolean }
  | { type: 'setLid'; hasLid: boolean }
  | { type: 'setLight'; startHour?: number; durationHours?: number }
  | { type: 'setRoomBase'; baseC: number }
  | { type: 'setBioload'; ammoniaMgNPerDay?: number; wasteGPerDay?: number };
