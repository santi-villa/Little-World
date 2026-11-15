/**
 * Tiempo de la simulación.
 *
 * El tiempo se mide en minutos. El juego corre en tiempo real 1:1 (un día del
 * juego es un día real); quien llama a step() decide cuántos minutos pasaron.
 * Acá están el reloj y la regla de cómo se parte un intervalo en pasos fijos;
 * el catch-up offline que la usa está en catchup.ts.
 */

import type { SimConfig } from './config';

export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 1440;

/** Hora del día, 0 a 24 (con decimales). */
export function hourOfDay(timeMinutes: number): number {
  return (((timeMinutes / MINUTES_PER_HOUR) % 24) + 24) % 24;
}

/** Días completos transcurridos desde el minuto 0. */
export function dayIndex(timeMinutes: number): number {
  return Math.floor(timeMinutes / MINUTES_PER_DAY);
}

export interface StepPlan {
  count: number;
  /** Minutos de cada paso. */
  minutes: number;
}

/**
 * Parte un intervalo en pasos fijos: de 1 minuto hasta 7 días y de 10 minutos
 * para intervalos más largos (ausencias largas).
 */
export function planSteps(deltaMinutes: number, config: SimConfig): StepPlan {
  const c = config.clock;
  const fine = deltaMinutes <= c.fineStepMaxDays * MINUTES_PER_DAY;
  const target = fine ? c.baseStepMinutes : c.coarseStepMinutes;
  const count = Math.max(1, Math.ceil(deltaMinutes / target - 1e-9));
  return { count, minutes: deltaMinutes / count };
}

export interface CatchUpPlan extends StepPlan {
  /** Minutos que realmente se simulan (con el tope aplicado). */
  simulatedMinutes: number;
  /** La ausencia superó el tope: el resto del tiempo no se simula. */
  capped: boolean;
}

/**
 * Plan del catch-up offline: pasos de 1 minuto para ausencias de hasta
 * 7 días, de 10 minutos hasta 30 días, y tope en 30 días.
 */
export function planCatchUp(elapsedMinutes: number, config: SimConfig): CatchUpPlan {
  const max = config.clock.maxCatchUpDays * MINUTES_PER_DAY;
  const elapsed = Number.isFinite(elapsedMinutes) ? Math.max(0, elapsedMinutes) : 0;
  const simulatedMinutes = Math.min(elapsed, max);
  if (simulatedMinutes <= 0) return { count: 0, minutes: 0, simulatedMinutes: 0, capped: false };
  return { ...planSteps(simulatedMinutes, config), simulatedMinutes, capped: elapsed > max };
}
