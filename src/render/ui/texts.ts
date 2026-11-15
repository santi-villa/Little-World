/** Textos en castellano para alertas y eventos de la simulación. */

import type { AlertId, SimEvent } from '../sim';

export const ALERT_LABELS: Record<AlertId, string> = {
  ammonia_warning: 'Amoníaco tóxico (NH3)',
  ammonia_danger: 'Amoníaco peligroso (NH3)',
  nitrite_warning: 'Nitrito alto',
  nitrite_danger: 'Nitrito peligroso',
  nitrate_high: 'Nitrato alto',
  ph_low: 'pH muy bajo',
  ph_high: 'pH muy alto',
  kh_low: 'KH bajo',
  oxygen_low: 'Poco oxígeno',
  oxygen_critical: 'Oxígeno crítico',
  chlorine_present: 'Cloro en el agua',
  temperature_low: 'Agua fría',
  temperature_high: 'Agua caliente',
  water_low: 'Falta agua',
  filter_clogged: 'Filtro tapado',
  algae_bloom: 'Muchas algas',
};

export function formatClock(timeMinutes: number): string {
  const total = Math.floor(timeMinutes);
  const day = Math.floor(total / 1440) + 1;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `Día ${day} ${hh}:${mm}`;
}

function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function describeEvent(event: SimEvent): string {
  switch (event.type) {
    case 'alert_raised':
      return `⚠ ${ALERT_LABELS[event.alert]}`;
    case 'alert_cleared':
      return `✓ Se normalizó: ${ALERT_LABELS[event.alert]}`;
    case 'cycle_established':
      return '★ La pecera está ciclada';
    case 'cycle_lost':
      return '✗ Se perdió el ciclado';
    case 'fed':
      return `Comida: ${event.grams} g`;
    case 'water_changed':
      return `Cambio de agua ${percent(event.fraction)} (${event.liters.toFixed(1)} L) ${
        event.conditioned ? 'con' : 'SIN'
      } acondicionador`;
    case 'topped_off':
      return `Relleno: ${event.liters.toFixed(1)} L ${event.conditioned ? 'con' : 'SIN'} acondicionador`;
    case 'filter_cleaned':
      return event.method === 'tankWater'
        ? `Filtro enjuagado en agua de la pecera (−${percent(event.bacteriaLostFraction)} bacterias)`
        : `Filtro lavado con agua de canilla (−${percent(event.bacteriaLostFraction)} bacterias)`;
    case 'conditioner_added':
      return 'Acondicionador agregado';
    case 'algae_scrubbed':
      return `Algas limpiadas (${event.gramsRemoved.toFixed(2)} g)`;
    case 'seeded_media_added':
      return 'Material de filtro colonizado agregado';
    case 'ammonia_dosed':
      return `Dosis de amoníaco: +${event.mgPerLiter.toFixed(2)} mg/L N`;
  }
}
