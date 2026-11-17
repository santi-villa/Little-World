/**
 * Resumen de bienvenida: qué pasó durante la ausencia, armado a partir de los
 * eventos del catch-up y de comparar el estado de antes con el de después.
 */

import texts from '../data/texts.es.json';
import { MINUTES_PER_DAY, MINUTES_PER_HOUR, type CatchUpPlan } from './clock';
import type { SimConfig } from './config';
import { findSpecies } from './species';
import { fill } from './text';
import type { AlertId, AnimalState, DeathCause, SimEvent, SimState } from './types';

export type SummaryTone = 'good' | 'info' | 'warn' | 'bad';

export interface SummaryLine {
  tone: SummaryTone;
  text: string;
}

export interface WelcomeSummary {
  title: string;
  elapsedMinutes: number;
  simulatedMinutes: number;
  capped: boolean;
  lines: SummaryLine[];
}

const T = texts.welcome;
const D = texts.duration;

function unit(n: number, one: string, many: string): string {
  return n === 1 ? one : fill(many, { n });
}

/** "3 días y 4 horas", "5 horas", "40 minutos". */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const days = Math.floor(total / MINUTES_PER_DAY);
  const hours = Math.floor((total % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
  const mins = total % MINUTES_PER_HOUR;
  const d = unit(days, D.day, D.days);
  const h = unit(hours, D.hour, D.hours);
  const m = unit(mins, D.minute, D.minutes);
  if (days > 0) return hours > 0 ? fill(D.and, { a: d, b: h }) : d;
  if (hours > 0) return mins > 0 && hours < 3 ? fill(D.and, { a: h, b: m }) : h;
  return m;
}

function speciesName(id: string): string {
  return findSpecies(id)?.name ?? id;
}

function label(animal: { name: string | null; speciesId: string }): string {
  return animal.name ?? speciesName(animal.speciesId);
}

export function buildWelcomeSummary(
  before: SimState,
  after: SimState,
  events: readonly SimEvent[],
  elapsedMinutes: number,
  plan: CatchUpPlan,
  config: SimConfig,
): WelcomeSummary {
  const lines: SummaryLine[] = [];
  const add = (tone: SummaryTone, text: string): void => {
    lines.push({ tone, text });
  };
  const elapsed = Math.max(0, elapsedMinutes);
  add('info', fill(T.away, { duration: formatDuration(elapsed) }));
  if (plan.capped) add('warn', fill(T.capped, { days: config.clock.maxCatchUpDays }));
  const fixed = lines.length;

  // --- Animales ---
  let watched = 0;
  let catTaps = 0;
  let sleptOnLid = false;
  let asleepMinutes = 0;
  let sleepStart: number | null = before.cat.behavior === 'sleep' ? before.timeMinutes : null;
  const deaths = new Map<DeathCause, string[]>();
  const raised = new Set<AlertId>();
  const cleared = new Set<AlertId>();
  for (const event of events) {
    switch (event.type) {
      case 'animal_died':
        if (event.cause === 'eaten') {
          add(
            'bad',
            fill(T.eaten, {
              prey: label(event),
              predator: speciesName(event.bySpeciesId ?? ''),
            }),
          );
        } else {
          const list = deaths.get(event.cause) ?? [];
          list.push(label(event));
          deaths.set(event.cause, list);
        }
        break;
      case 'fin_nipped':
        add(
          'warn',
          fill(T.finNipped, {
            victim: speciesName(event.speciesId),
            nipper: speciesName(event.bySpeciesId),
          }),
        );
        break;
      case 'cycle_established':
        add('good', T.cycleEstablished);
        break;
      case 'cycle_lost':
        add('bad', T.cycleLost);
        break;
      case 'alert_raised':
        raised.add(event.alert);
        cleared.delete(event.alert);
        break;
      case 'alert_cleared':
        cleared.add(event.alert);
        break;
      case 'glass_tapped':
        if (event.by === 'cat') catTaps++;
        break;
      case 'cat_behavior':
        if (event.behavior === 'watch_fish') watched++;
        if (event.behavior === 'sleep') {
          if (event.spot === 'tank_lid') sleptOnLid = true;
          sleepStart ??= event.timeMinutes;
        } else if (sleepStart !== null) {
          asleepMinutes += event.timeMinutes - sleepStart;
          sleepStart = null;
        }
        break;
      default:
        break;
    }
  }
  if (sleepStart !== null) asleepMinutes += after.timeMinutes - sleepStart;

  // Las muertes, una por una si son pocas y juntas si son muchas.
  const deathTexts: Record<Exclude<DeathCause, 'eaten'>, string> = {
    old_age: T.diedOldAge,
    starvation: T.diedStarvation,
    water: T.diedWater,
    stress: T.diedStress,
  };
  for (const [cause, names] of deaths) {
    if (cause === 'eaten') continue;
    const tone: SummaryTone = cause === 'old_age' ? 'info' : 'bad';
    if (names.length <= 2) {
      for (const name of names) add(tone, fill(deathTexts[cause], { name }));
    } else {
      add(tone, fill(T.diedMany, { count: names.length, cause: texts.deathCauses[cause] }));
    }
  }

  const alive = after.animals.filter((animal) => animal.alive);
  const corpses = after.animals.length - alive.length;
  if (corpses > 0) add('bad', corpses === 1 ? T.corpseOne : fill(T.corpses, { count: corpses }));
  if (alive.length > 0) {
    const f = config.fish;
    const hungriest = alive.reduce((max: number, animal: AnimalState) => Math.max(max, animal.hunger), 0);
    if (hungriest > f.hungryAt) {
      const very = hungriest > f.veryHungryAt;
      add(very ? 'warn' : 'info', very ? T.veryHungry : T.hungry);
    }
    const sick = alive.filter((animal) => animal.mood === 'sick').length;
    const stressed = alive.filter((animal) => animal.mood === 'stressed').length;
    if (sick > 0) add('bad', sick === 1 ? T.sickOne : fill(T.sick, { count: sick }));
    if (stressed > 0) {
      add('warn', stressed === 1 ? T.stressedOne : fill(T.stressed, { count: stressed }));
    }
    if (sick === 0 && stressed === 0 && corpses === 0) add('good', T.allHappy);
  }

  // --- Agua ---
  for (const alert of after.alerts) {
    if (raised.has(alert)) add('warn', fill(T.alertNew, { alert: texts.alerts[alert] }));
  }
  for (const alert of cleared) {
    if (!after.alerts.includes(alert)) {
      add('good', fill(T.alertCleared, { alert: texts.alerts[alert] }));
    }
  }
  const temperatureChange = after.water.temperatureC - before.water.temperatureC;
  if (Math.abs(temperatureChange) >= 1) {
    add(
      'info',
      fill(T.temperature, {
        before: before.water.temperatureC.toFixed(1),
        after: after.water.temperatureC.toFixed(1),
      }),
    );
  }
  const evaporated = before.tank.waterLiters - after.tank.waterLiters;
  if (evaporated >= 0.03 * after.tank.fullLiters) {
    add('info', fill(T.evaporated, { liters: evaporated.toFixed(1) }));
  }
  if (after.algae.glass - before.algae.glass >= 0.1) add('info', T.algae);

  // --- El gato ---
  if (watched > 0) {
    add('info', watched === 1 ? T.catWatchedOnce : fill(T.catWatched, { count: watched }));
  }
  if (catTaps > 0) {
    add('info', catTaps === 1 ? T.catTappedOnce : fill(T.catTapped, { count: catTaps }));
  }
  if (sleptOnLid) add('info', T.catLid);
  else if (plan.simulatedMinutes >= 120 && asleepMinutes > 0.75 * plan.simulatedMinutes) {
    add('info', T.catSlept);
  }


  if (lines.length === fixed) add('good', T.quiet);
  return {
    title: T.title,
    elapsedMinutes: elapsed,
    simulatedMinutes: plan.simulatedMinutes,
    capped: plan.capped,
    lines,
  };
}
