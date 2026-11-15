/**
 * Punto de entrada de la simulación.
 *
 *   step(state, deltaMinutes) -> { state, events }
 *
 * Es una función pura: no toca el estado que recibe, y con el mismo estado
 * (que incluye la semilla del RNG) y el mismo delta devuelve siempre lo mismo.
 */

import { updateAlerts } from './alerts';
import { defaultConfig, type SimConfig } from './config';
import { Rng } from './rng';
import { cloneState } from './state';
import { evaporationLitersPerDay, stepRoom, stepWaterTemperature } from './thermal';
import type { SimEvent, SimState, StepResult } from './types';
import {
  MINUTES_PER_DAY,
  applyEvaporation,
  stepAlgae,
  stepCycle,
  stepFilterClog,
  stepGases,
  stepNitrogen,
  stepOrganics,
  updatePh,
} from './water';

function substep(state: SimState, dtMinutes: number, rng: Rng, config: SimConfig): SimEvent[] {
  const dtDays = dtMinutes / MINUTES_PER_DAY;
  const previousTime = state.timeMinutes;
  state.timeMinutes += dtMinutes;

  // Habitación y temperatura del agua.
  stepRoom(state, previousTime, rng, config);
  const evaporated = applyEvaporation(
    state,
    evaporationLitersPerDay(state, config) * dtDays,
    config,
  );
  stepWaterTemperature(state, dtMinutes, evaporated, config);

  // Química y biología.
  let newDetritusG = stepOrganics(state, dtDays, config);
  stepNitrogen(state, dtDays, config);
  newDetritusG += stepAlgae(state, dtDays, config);
  stepGases(state, dtMinutes, config);
  updatePh(state, config);
  stepFilterClog(state, dtDays, newDetritusG, config);

  // Estado del ciclado y alertas.
  const events: SimEvent[] = [];
  const cycleChange = stepCycle(state, dtMinutes, config);
  if (cycleChange === 'established') {
    events.push({ type: 'cycle_established', timeMinutes: state.timeMinutes });
  } else if (cycleChange === 'lost') {
    events.push({ type: 'cycle_lost', timeMinutes: state.timeMinutes });
  }
  events.push(...updateAlerts(state, config));
  return events;
}

export function step(
  state: SimState,
  deltaMinutes: number,
  config: SimConfig = defaultConfig,
): StepResult {
  const next = cloneState(state);
  const events: SimEvent[] = [];
  if (!(deltaMinutes > 0)) return { state: next, events };

  const rng = new Rng(next.rngState);
  const count = Math.ceil(deltaMinutes / config.integration.maxSubstepMinutes - 1e-9);
  const dt = deltaMinutes / count;
  const endTime = state.timeMinutes + deltaMinutes;
  for (let i = 0; i < count; i++) {
    events.push(...substep(next, dt, rng, config));
  }
  next.timeMinutes = endTime; // evita arrastrar error de redondeo
  next.rngState = rng.state;
  return { state: next, events };
}
