/**
 * Textos del juego. Están todos en src/data/texts.es.json para poder
 * traducirlos después; acá solo se arman con sus valores.
 */

import texts from '../../data/texts.es.json';
import type { SimEvent } from '../../sim';

export { texts };

/** Reemplaza {clave} por su valor. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

export function clockParts(timeMinutes: number): { day: number; time: string } {
  const total = Math.floor(timeMinutes);
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return { day: Math.floor(total / 1440) + 1, time: `${hh}:${mm}` };
}

export function formatClock(timeMinutes: number): string {
  return fill(texts.clock, clockParts(timeMinutes));
}

function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function describeEvent(event: SimEvent): string {
  const e = texts.events;
  const conditioner = (conditioned: boolean): string =>
    conditioned ? e.withConditioner : e.withoutConditioner;
  switch (event.type) {
    case 'alert_raised':
      return fill(e.alertRaised, { alert: texts.alerts[event.alert] });
    case 'alert_cleared':
      return fill(e.alertCleared, { alert: texts.alerts[event.alert] });
    case 'cycle_established':
      return e.cycleEstablished;
    case 'cycle_lost':
      return e.cycleLost;
    case 'fed':
      return fill(e.fed, { grams: event.grams });
    case 'water_changed':
      return fill(e.waterChanged, {
        percent: percent(event.fraction),
        liters: event.liters.toFixed(1),
        conditioner: conditioner(event.conditioned),
      });
    case 'topped_off':
      return fill(e.toppedOff, {
        liters: event.liters.toFixed(1),
        conditioner: conditioner(event.conditioned),
      });
    case 'filter_cleaned':
      return fill(event.method === 'tankWater' ? e.filterRinsed : e.filterWashedTap, {
        percent: percent(event.bacteriaLostFraction),
      });
    case 'filter_media_replaced':
      return e.filterMediaReplaced;
    case 'conditioner_added':
      return e.conditionerAdded;
    case 'glass_cleaned':
      return e.glassCleaned;
    case 'seeded_media_added':
      return e.seededMediaAdded;
    case 'ammonia_dosed':
      return fill(e.ammoniaDosed, { ppm: event.ppm.toFixed(2) });
  }
}
