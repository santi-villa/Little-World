import {
  applyAction,
  createNewTank,
  defaultConfig,
  step,
  type NewTankOptions,
  type SimEvent,
  type SimState,
} from '../src/sim';

export const HOUR = 60;
export const DAY = 1440;
export const WEEK = 7 * DAY;

/** Pecera de los tests: la rectangular mediana (60 L de agua). */
export function newTank(options: NewTankOptions = {}): SimState {
  return createNewTank({ tankId: 'rect_65', ...options });
}

/** Temperatura exterior media que deja la habitación (ventana cerrada) en `roomC`. */
export function outdoorForRoom(roomC: number): number {
  const { comfortC, outdoorCouplingWindowClosed } = defaultConfig.room;
  return comfortC + (roomC - comfortC) / outdoorCouplingWindowClosed;
}

export interface RunSummary {
  state: SimState;
  events: SimEvent[];
  peakAmmonia: number;
  peakAmmoniaDay: number;
  peakNitrite: number;
  peakNitriteDay: number;
}

/** Avanza la simulación de a una hora y registra los picos de amoníaco y nitrito (ppm). */
export function run(start: SimState, minutes: number): RunSummary {
  let state = start;
  const events: SimEvent[] = [];
  let peakAmmonia = state.water.ammonia;
  let peakNitrite = state.water.nitrite;
  let peakAmmoniaDay = 0;
  let peakNitriteDay = 0;
  const hours = Math.round(minutes / HOUR);
  for (let h = 1; h <= hours; h++) {
    const result = step(state, HOUR);
    state = result.state;
    events.push(...result.events);
    if (state.water.ammonia > peakAmmonia) {
      peakAmmonia = state.water.ammonia;
      peakAmmoniaDay = h / 24;
    }
    if (state.water.nitrite > peakNitrite) {
      peakNitrite = state.water.nitrite;
      peakNitriteDay = h / 24;
    }
  }
  return { state, events, peakAmmonia, peakAmmoniaDay, peakNitrite, peakNitriteDay };
}

const matureCache = new Map<string, SimState>();

/**
 * Pecera madura: arrancó con material colonizado, lleva dos meses con una
 * carga moderada y cambios de agua semanales bien hechos.
 */
export function matureTank(seed: number | string = 7, ammoniaMgNPerDay = 20): SimState {
  const key = `${seed}:${ammoniaMgNPerDay}`;
  const cached = matureCache.get(key);
  if (cached) return cached;
  let state = newTank({ seed, seededMedia: true, ammoniaMgNPerDay });
  for (let week = 0; week < 8; week++) {
    state = step(state, WEEK).state;
    state = applyAction(state, {
      type: 'waterChange',
      fraction: 0.3,
      conditioned: true,
      temperatureC: state.water.temperatureC,
    }).state;
    state = applyAction(state, { type: 'topOff', conditioned: true }).state;
  }
  state = step(state, DAY).state;
  matureCache.set(key, state);
  return state;
}

export function totalAob(state: SimState): number {
  return state.bacteria.filter.aob + state.bacteria.surfaces.aob;
}

export function totalNob(state: SimState): number {
  return state.bacteria.filter.nob + state.bacteria.surfaces.nob;
}
