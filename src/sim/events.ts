/**
 * Eventos de la simulación.
 *
 * Por ahora genera las alertas del agua (según los umbrales de referencia
 * del documento de diseño). Más adelante, de estos eventos van a salir las
 * entradas del diario del acuarista.
 */

import type { SimConfig } from './config';
import { freeAmmoniaPpm, oxygenRelative, waterLevel } from './derive';
import { ALERT_IDS, type AlertId, type SimEvent, type SimState } from './types';

interface AlertCheck {
  value: number;
  threshold: number;
  /** 'above': se activa cuando value >= threshold. 'below': cuando value <= threshold. */
  direction: 'above' | 'below';
}

function alertChecks(state: SimState, config: SimConfig): Record<AlertId, AlertCheck> {
  const t = config.thresholds;
  const w = state.water;
  const nh3 = freeAmmoniaPpm(state);
  const oxygen = oxygenRelative(state, config);
  const above = (value: number, threshold: number): AlertCheck => ({
    value,
    threshold,
    direction: 'above',
  });
  const below = (value: number, threshold: number): AlertCheck => ({
    value,
    threshold,
    direction: 'below',
  });
  return {
    ammonia_stress: above(nh3, t.nh3StressPpm),
    ammonia_danger: above(nh3, t.nh3DangerPpm),
    nitrite_stress: above(w.nitrite, t.nitriteStressPpm),
    nitrite_danger: above(w.nitrite, t.nitriteDangerPpm),
    nitrate_stress: above(w.nitrate, t.nitrateStressPpm),
    nitrate_danger: above(w.nitrate, t.nitrateDangerPpm),
    oxygen_stress: below(oxygen, t.oxygenStress),
    oxygen_danger: below(oxygen, t.oxygenDanger),
    chlorine_present: above(w.chlorine, t.chlorinePpm),
    ph_crash: below(w.ph, t.phCrash),
    kh_low: below(w.kh, t.khLow),
    water_low: below(waterLevel(state), t.waterLowFraction),
    filter_clogged: above(state.filter.clog, t.filterClogged),
    algae_bloom: above(state.algae.glass, t.algaeBloom),
  };
}

/**
 * Recalcula las alertas activas y devuelve los eventos de cambio.
 * Una alerta activa recién se apaga cuando el valor se aleja un margen del
 * umbral, para que no parpadee.
 */
export function updateAlerts(state: SimState, config: SimConfig): SimEvent[] {
  const checks = alertChecks(state, config);
  const margin = config.thresholds.hysteresis;
  const previous = state.alerts;
  const events: SimEvent[] = [];
  const active: AlertId[] = [];

  for (const id of ALERT_IDS) {
    const { value, threshold, direction } = checks[id];
    const was = previous.includes(id);
    const span = Math.abs(threshold) * margin;
    const on =
      direction === 'above'
        ? value >= (was ? threshold - span : threshold)
        : value <= (was ? threshold + span : threshold);
    if (on) active.push(id);
    if (on !== was) {
      events.push({
        type: on ? 'alert_raised' : 'alert_cleared',
        timeMinutes: state.timeMinutes,
        alert: id,
        value,
      });
    }
  }

  if (events.length > 0) state.alerts = active;
  return events;
}
