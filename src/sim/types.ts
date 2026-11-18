import type {FoodKind,FoodGrain} from './food-grains';
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
  glassCells?: number[];
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

export type Sex = 'male' | 'female';

/** Lo que el animal quiere hacer ahora. El render decide cómo se ve. */
export const INTENTS = [
  'explore',
  'school',
  'eat',
  'rest',
  'hide',
  'chase',
  'flee',
  'court',
  'beg',
  'gasp',
] as const;
export type Intent = (typeof INTENTS)[number];

export type Mood = 'happy' | 'normal' | 'stressed' | 'sick';

/** Personalidad fija de cada individuo, valores de 0 a 1. */
export interface Personality {
  boldness: number;
  activity: number;
  curiosity: number;
}

export type DeathCause = 'old_age' | 'starvation' | 'water' | 'stress' | 'eaten';

/** Un animal de la pecera (pez, gamba o caracol). */
export interface AnimalState {
  id: number;
  speciesId: string;
  name: string | null;
  sex: Sex;
  /** Edad real en días. */
  ageDays: number;
  /** Edad a la que muere de viejo (se sortea al nacer, dentro del rango de la especie). */
  lifespanDays: number;
  /** Minuto en que entró a esta pecera. */
  addedAtMinutes: number;
  /** 0 (recién comido) a 1 (famélico, tras ~una semana sin comer). */
  hunger: number;
  /** 0 a 100. */
  stress: number;
  /** 0 a 100. */
  health: number;
  personality: Personality;
  intent: Intent;
  /** Hasta qué minuto mantiene la decisión actual. */
  intentUntil: number;
  /** A quién persigue, corteja o de quién huye. */
  targetId: number | null;
  /** Susto reciente, 0 a 1 (se pasa en pocos minutos). */
  fright: number;
  /** Acostumbramiento al gato, 0 a 1. */
  catHabituation: number;
  /** Cuánto aprendió que el jugador trae comida, 0 a 1. */
  feedingTrust: number;
  /** Aletas mordidas, 0 a 1. */
  finDamage: number;
  mood: Mood;
  alive: boolean;
  /** Si murió y nadie lo retiró: gramos que todavía se están pudriendo. */
  corpseG: number;
}

/** Comida en el agua. Lo que llega al fondo pasa a organics.foodG. */
export interface FoodState {
  kind?:FoodKind;
  grains?:FoodGrain[];
  nextGrainId?:number;
  x?: number;
  /** Flotando en la superficie, gramos. */
  surfaceG: number;
  /** Hundiéndose a media agua, gramos. */
  sinkingG: number;
}

export const CAT_BEHAVIORS = [
  'sleep',
  'watch_fish',
  'tap_glass',
  'look_window',
  'beg_food',
  'eat',
  'groom',
  'wander',
  'play',
  'purr',
  'sulk',
] as const;
export type CatBehavior = (typeof CAT_BEHAVIORS)[number];

/** Dónde está el gato (el render lo traduce a un lugar de la escena). */
export type CatSpot = 'bed' | 'sunbeam' | 'tank_lid' | 'tank_front' | 'windowsill' | 'bowl' | 'floor' | 'away';

export interface CatNeeds {
  /** Sueño acumulado, 0 a 1. */
  sleep: number;
  /** 0 a 1. */
  hunger: number;
  /** Ganas de curiosear, 0 a 1. */
  curiosity: number;
  /** Ganas de mimos, 0 a 1. */
  affection: number;
  /** Energía disponible, 0 a 1. */
  energy: number;
}

export interface CatState {
  needs: CatNeeds;
  behavior: CatBehavior;
  spot: CatSpot;
  behaviorSince: number;
  behaviorUntil: number;
  /** Caricias recientes (se van solas con los minutos). */
  petting: number;
  /** Hasta qué minuto sigue molesto. */
  annoyedUntil: number;
  /** Comida en el plato, 0 a 1. */
  bowl: number;
  /** Minutos seguidos mirando la pecera. */
  watchingMinutes: number;
}

export type Weather = 'clear' | 'cloudy' | 'rain' | 'storm';

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
  animals: AnimalState[];
  nextAnimalId: number;
  food: FoodState;
  cat: CatState;
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
  | { type: 'ammonia_dosed'; timeMinutes: number; ppm: number }
  | { type: 'animal_added'; timeMinutes: number; id: number; speciesId: string }
  | {
      type: 'animal_died';
      timeMinutes: number;
      id: number;
      speciesId: string;
      name: string | null;
      cause: DeathCause;
      /** Solo si se lo comieron. */
      bySpeciesId?: string;
    }
  | { type: 'animal_removed'; timeMinutes: number; id: number; speciesId: string }
  | {
      type: 'animal_mood';
      timeMinutes: number;
      id: number;
      speciesId: string;
      mood: Mood;
      previous: Mood;
    }
  | { type: 'fin_nipped'; timeMinutes: number; id: number; speciesId: string; bySpeciesId: string }
  | { type: 'glass_tapped'; timeMinutes: number; by: 'player' | 'cat' }
  | { type: 'cat_behavior'; timeMinutes: number; behavior: CatBehavior; spot: CatSpot }
  | { type: 'cat_petted'; timeMinutes: number }
  | { type: 'cat_annoyed'; timeMinutes: number }
  | { type: 'cat_bowl_filled'; timeMinutes: number };

export interface StepResult {
  state: SimState;
  events: SimEvent[];
}

export type SimAction =
  | { type: 'feed'; grams: number; x?: number;kind?:FoodKind }
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
  | { type: 'scrubGlass'; x: number; y: number; radius: number; strength: number }
  | { type: 'addSeededMedia' }
  | { type: 'doseAmmonia'; ppm: number }
  | { type: 'setHeater'; enabled?: boolean; watts?: number; setpointC?: number }
  | { type: 'setFilterRunning'; running: boolean }
  | { type: 'setLid'; hasLid: boolean }
  | { type: 'setLight'; startHour?: number; durationHours?: number }
  | { type: 'setWindow'; open: boolean }
  | { type: 'setOutdoorBase'; baseC: number }
  | { type: 'setBioload'; ammoniaMgNPerDay?: number; wasteGPerDay?: number }
  | {
      type: 'addAnimals';
      speciesId: string;
      count: number;
      /** Cuántos son machos. Por defecto, la mitad (o todos si la especie se vende como macho). */
      males?: number;
      ageDays?: number;
    }
  | { type: 'removeAnimal'; id: number }
  | { type: 'removeDead' }
  | { type: 'nameAnimal'; id: number; name: string }
  | { type: 'tapGlass' }
  | { type: 'petCat' }
  | { type: 'fillCatBowl' };
