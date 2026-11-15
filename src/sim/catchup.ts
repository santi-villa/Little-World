/**
 * Catch-up offline: lo que pasó en la pecera mientras el juego estuvo cerrado.
 *
 *   catchUp(state, elapsedMinutes, config?, env?) -> estado nuevo + eventos + resumen
 *
 * Es step() con el tope de 30 días y sin jugador presente. Como el RNG va
 * dentro del estado, la misma ausencia da siempre el mismo resultado: no se
 * puede "rerollear" cerrando y abriendo.
 */

import { planCatchUp, type CatchUpPlan } from './clock';
import { defaultConfig, type SimConfig } from './config';
import { NO_ENVIRONMENT, type SimEnvironment } from './environment';
import { step } from './step';
import { buildWelcomeSummary, type WelcomeSummary } from './summary';
import type { SimEvent, SimState } from './types';

export interface CatchUpResult {
  state: SimState;
  events: SimEvent[];
  /** Tiempo real que pasó. */
  elapsedMinutes: number;
  plan: CatchUpPlan;
  summary: WelcomeSummary;
}

export function catchUp(
  state: SimState,
  elapsedMinutes: number,
  config: SimConfig = defaultConfig,
  env: SimEnvironment = NO_ENVIRONMENT,
): CatchUpResult {
  const plan = planCatchUp(elapsedMinutes, config);
  const result = step(state, plan.simulatedMinutes, config, { ...env, playerPresent: false });
  return {
    state: result.state,
    events: result.events,
    elapsedMinutes: Math.max(0, elapsedMinutes),
    plan,
    summary: buildWelcomeSummary(state, result.state, result.events, elapsedMinutes, plan, config),
  };
}
