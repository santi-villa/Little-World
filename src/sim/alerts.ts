/** Alertas: condiciones del agua que se encienden y apagan con histéresis. */

import type { SimConfig } from './config';
import { derive } from './derive';
import { ALERT_IDS, type AlertId, type SimEvent, type SimState } from './types';

interface AlertCheck {
  value: number;
  threshold: number;
  /** 'above': se activa cuando value >= threshold. 'below': cuando value <= threshold. */
  direction: 'above' | 'below';
}

function alertChecks(state: SimState, config: SimConfig): Record<AlertId, AlertCheck> {
  const a = config.alerts;
  const w = state.water;
  const d = derive(state, config);
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
    ammonia_warning: above(d.nh3, a.nh3WarningMgL),
    ammonia_danger: above(d.nh3, a.nh3DangerMgL),
    nitrite_warning: above(w.nitrite, a.nitriteWarningMgL),
    nitrite_danger: above(w.nitrite, a.nitriteDangerMgL),
    nitrate_high: above(w.nitrate, a.nitrateHighMgL),
    ph_low: below(w.ph, a.phLow),
    ph_high: above(w.ph, a.phHigh),
    kh_low: below(w.kh, a.khLow),
    oxygen_low: below(w.oxygen, a.oxygenLowMgL),
    oxygen_critical: below(w.oxygen, a.oxygenCriticalMgL),
    chlorine_present: above(w.chlorine, a.chlorineMgL),
    temperature_low: below(w.temperatureC, a.temperatureLowC),
    temperature_high: above(w.temperatureC, a.temperatureHighC),
    water_low: below(d.levelFraction, a.waterLowFraction),
    filter_clogged: above(state.filter.clog, a.filterClogged),
    algae_bloom: above(d.algaeFraction, a.algaeBloomFraction),
  };
}

/**
 * Recalcula las alertas activas y devuelve los eventos de cambio.
 * Una alerta activa recién se apaga cuando el valor se aleja un margen del
 * umbral, para que no parpadee.
 */
export function updateAlerts(state: SimState, config: SimConfig): SimEvent[] {
  const checks = alertChecks(state, config);
  const margin = config.alerts.hysteresis;
  const wasActive = new Set(state.alerts);
  const events: SimEvent[] = [];
  const active: AlertId[] = [];

  for (const id of ALERT_IDS) {
    const { value, threshold, direction } = checks[id];
    const span = Math.abs(threshold) * margin;
    let on: boolean;
    if (direction === 'above') {
      on = wasActive.has(id) ? value >= threshold - span : value >= threshold;
    } else {
      on = wasActive.has(id) ? value <= threshold + span : value <= threshold;
    }
    if (on) active.push(id);
    if (on && !wasActive.has(id)) {
      events.push({ type: 'alert_raised', timeMinutes: state.timeMinutes, alert: id, value });
    } else if (!on && wasActive.has(id)) {
      events.push({ type: 'alert_cleared', timeMinutes: state.timeMinutes, alert: id, value });
    }
  }

  state.alerts = active;
  return events;
}
