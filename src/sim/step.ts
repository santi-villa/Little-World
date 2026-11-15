/**
 * Punto de entrada de la simulación.
 *
 *   step(state, deltaMinutes) -> { state, events }
 *
 * Es una función pura: no toca el estado que recibe, y con el mismo estado
 * (que incluye la semilla del RNG) y el mismo delta devuelve siempre lo mismo.
 */

import { stepAlgae } from './algae';
import { stepCycle, stepNitrogen } from './bacteria';
import { MINUTES_PER_DAY, planSteps } from './clock';
import { defaultConfig, type SimConfig } from './config';
import { updateAlerts } from './events';
import { Rng } from './rng';
import { cloneState } from './state';
import { evaporationLitersPerDay, stepRoom, stepWaterTemperature } from './thermal';
import type { SimEvent, SimState, StepResult } from './types';
import { applyEvaporation, stepFilterClog, stepGases, stepOrganics, updatePh } from './water';

function singleStep(
  state: SimState,
  dtMinutes: number,
  rng: Rng,
  config: SimConfig,
  events: SimEvent[],
): void {
  const dtDays = dtMinutes / MINUTES_PER_DAY;
  const previousTime = state.timeMinutes;
  state.timeMinutes += dtMinutes;

  // Exterior, habitación y temperatura del agua.
  stepRoom(state, previousTime, dtMinutes, rng, config);
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
  const cycleChange = stepCycle(state, dtMinutes, config);
  if (cycleChange === 'established') {
    events.push({ type: 'cycle_established', timeMinutes: state.timeMinutes });
  } else if (cycleChange === 'lost') {
    events.push({ type: 'cycle_lost', timeMinutes: state.timeMinutes });
  }
  for (const event of updateAlerts(state, config)) events.push(event);
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
  const plan = planSteps(deltaMinutes, config);
  for (let i = 0; i < plan.count; i++) {
    singleStep(next, plan.minutes, rng, config, events);
  }
  next.timeMinutes = state.timeMinutes + deltaMinutes; // evita arrastrar error de redondeo
  next.rngState = rng.state;
  return { state: next, events };
}
