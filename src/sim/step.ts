/**
 * Punto de entrada de la simulación.
 *
 *   step(state, deltaMinutes, config?, env?) -> { state, events }
 *
 * Es una función pura: no toca el estado que recibe, y con el mismo estado
 * (que incluye la semilla del RNG), el mismo delta y el mismo entorno
 * devuelve siempre lo mismo.
 */

import { stepAlgae } from './algae';
import { stepCycle, stepNitrogen } from './bacteria';
import { decideIntents } from './behavior';
import { stepCat } from './cat';
import { MINUTES_PER_DAY, MINUTES_PER_HOUR, planSteps } from './clock';
import { defaultConfig, type SimConfig } from './config';
import { NO_ENVIRONMENT, type SimEnvironment } from './environment';
import { updateAlerts } from './events';
import { stepFood } from './feeding';
import { buildContext, stepAnimals, stepInteractions, type TankContext } from './fish';
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
  env: SimEnvironment,
  ctx: TankContext,
  events: SimEvent[],
): TankContext {
  const dtDays = dtMinutes / MINUTES_PER_DAY;
  const previousTime = state.timeMinutes;
  state.timeMinutes += dtMinutes;

  // Exterior, habitación y temperatura del agua.
  stepRoom(state, previousTime, dtMinutes, rng, config, env.outdoor);
  const evaporated = applyEvaporation(
    state,
    evaporationLitersPerDay(state, config) * dtDays,
    config,
  );
  stepWaterTemperature(state, dtMinutes, evaporated, config);

  // Seres vivos: el gato, y los animales de la pecera (comen, excretan, deciden).
  stepCat(state, dtMinutes, rng, config, env, events);
  if (state.animals.length > 0) {
    stepFood(state, dtMinutes, ctx, config,env.feedingContacts);
    stepAnimals(state, dtMinutes, ctx, config, events);
    if (ctx.stale) ctx = buildContext(state, config);
    const hoursCrossed =
      Math.floor(state.timeMinutes / MINUTES_PER_HOUR) -
      Math.floor(previousTime / MINUTES_PER_HOUR);
    if (hoursCrossed > 0) {
      stepInteractions(state, hoursCrossed, ctx, rng, config, events);
      if (ctx.stale) ctx = buildContext(state, config);
    }
    decideIntents(state, ctx, rng, config, env);
  } else {
    stepFood(state, dtMinutes, ctx, config,env.feedingContacts);
  }

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
  return ctx;
}

export function step(
  state: SimState,
  deltaMinutes: number,
  config: SimConfig = defaultConfig,
  env: SimEnvironment = NO_ENVIRONMENT,
): StepResult {
  const next = cloneState(state);
  const events: SimEvent[] = [];
  if (!(deltaMinutes > 0)) return { state: next, events };

  const rng = new Rng(next.rngState);
  const plan = planSteps(deltaMinutes, config);
  let ctx = buildContext(next, config);
  for (let i = 0; i < plan.count; i++) {
    ctx = singleStep(next, plan.minutes, rng, config, env, ctx, events);
  }
  next.timeMinutes = state.timeMinutes + deltaMinutes; // evita arrastrar error de redondeo
  next.rngState = rng.state;
  return { state: next, events };
}
