/**
 * El gato: un ser vivo con necesidades (sueño, hambre, curiosidad, cariño y
 * energía) que elige qué hacer según ellas, la hora y el clima.
 *
 * Igual que con los peces, acá solo se decide el comportamiento y el lugar;
 * cómo se ve y cómo camina es cosa de render/.
 */

import { hourOfDay, MINUTES_PER_HOUR } from './clock';
import type { SimConfig } from './config';
import { isLightOn } from './derive';
import type { SimEnvironment } from './environment';
import { scareAnimals } from './fish';
import type { Rng } from './rng';
import type { CatBehavior, CatSpot, CatState, SimEvent, SimState } from './types';

export function createCat(timeMinutes = 0): CatState {
  return {
    needs: { sleep: 0.3, hunger: 0.3, curiosity: 0.5, affection: 0.4, energy: 0.7 },
    behavior: 'wander',
    spot: 'floor',
    behaviorSince: timeMinutes,
    behaviorUntil: timeMinutes,
    petting: 0,
    annoyedUntil: 0,
    bowl: 1,
    watchingMinutes: 0,
  };
}

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

function setBehavior(
  state: SimState,
  behavior: CatBehavior,
  spot: CatSpot,
  minutes: number,
  events: SimEvent[],
): void {
  const cat = state.cat;
  const changed = cat.behavior !== behavior || cat.spot !== spot;
  if (changed) {
    cat.behavior = behavior;
    cat.spot = spot;
    cat.behaviorSince = state.timeMinutes;
    events.push({ type: 'cat_behavior', timeMinutes: state.timeMinutes, behavior, spot });
  }
  cat.behaviorUntil = state.timeMinutes + minutes;
}

/** Cuántas caricias seguidas aguanta ahora: más si tiene ganas de mimos. */
export function petTolerance(cat: CatState, config: SimConfig): number {
  const c = config.cat;
  const busy = cat.behavior === 'eat' ? 0.3 : cat.behavior === 'sleep' ? 0.7 : 1;
  return (c.petToleranceBase + c.petToleranceAffection * cat.needs.affection) * busy;
}

function decide(
  state: SimState,
  rng: Rng,
  config: SimConfig,
  env: SimEnvironment,
  events: SimEvent[],
): void {
  const cat = state.cat;
  const c = config.cat;
  const n = cat.needs;
  const now = state.timeMinutes;
  if (now < cat.annoyedUntil) {
    setBehavior(state, 'sulk', 'away', cat.annoyedUntil - now, events);
    return;
  }

  const hour = hourOfDay(now);
  const weather = env.weather ?? 'clear';
  const daytime = hour >= 7 && hour < 20;
  const wet = weather === 'rain' || weather === 'storm';
  const lightOn = isLightOn(state);
  const fishAlive = state.animals.some((animal) => animal.alive);

  // Después de mirar un rato, a veces toca el vidrio con la pata.
  if (cat.behavior === 'watch_fish' && fishAlive && rng.chance(c.tapChancePerWatch)) {
    setBehavior(state, 'tap_glass', 'tank_front', 1, events);
    events.push({ type: 'glass_tapped', timeMinutes: now, by: 'cat' });
    scareAnimals(state, config.stress.catTap, true, config);
    return;
  }

  const noise = (): number => rng.next() * 0.2;
  let best: CatBehavior = 'wander';
  let bestScore = 0.2 + 0.2 * n.energy + noise();
  const consider = (behavior: CatBehavior, score: number): void => {
    if (score > bestScore) {
      best = behavior;
      bestScore = score;
    }
  };

  // Duerme mucho: a la siesta y de madrugada sobre todo.
  consider(
    'sleep',
    0.15 +
      0.9 * n.sleep +
      (hour >= 10 && hour < 17 ? 0.2 : 0) +
      (hour < 6 ? 0.25 : 0) +
      (wet ? 0.1 : 0) -
      0.3 * n.hunger +
      noise(),
  );
  if (n.hunger > 0.4 && cat.bowl > 0) consider('eat', 0.6 + n.hunger + noise());
  if (n.hunger > 0.6 && cat.bowl <= 0 && env.playerPresent) {
    consider('beg_food', 0.2 + 0.6 * n.hunger + noise());
  }
  consider(
    'watch_fish',
    0.9 * n.curiosity * (fishAlive ? 1 : 0.2) * (lightOn ? 1 : 0.5) + 0.1 * n.energy + noise(),
  );
  // La ventana: lluvia, o pájaros los días despejados.
  consider(
    'look_window',
    0.6 * n.curiosity + (wet ? 0.3 : daytime && weather === 'clear' ? 0.2 : 0) + noise(),
  );
  const zoomies = (hour >= 18 && hour < 23) || (hour >= 5 && hour < 8);
  consider('play', 0.6 * n.energy * (zoomies ? 1.3 : 0.8) - 0.3 * n.sleep + noise());
  consider('groom', 0.3 + noise());

  const behavior = best as CatBehavior;
  let spot: CatSpot = 'floor';
  let minutes = rng.range(c.decisionMinutesMin, c.decisionMinutesMax);
  switch (behavior) {
    case 'sleep': {
      // Busca el rayo de sol si está despejado; si no, la tapa tibia de la pecera o la cama.
      const lidWarm =
        state.tank.hasLid &&
        lightOn &&
        (hour - state.light.startHour + 24) % 24 >= c.lidWarmHours;
      if (weather === 'clear' && hour >= 9 && hour < 17) spot = 'sunbeam';
      else if (lidWarm && rng.chance(0.35)) spot = 'tank_lid';
      else spot = 'bed';
      minutes = c.sleepDecisionMinutes * (0.6 + 0.8 * rng.next());
      break;
    }
    case 'eat':
      spot = 'bowl';
      minutes = c.eatMinutes;
      cat.bowl = Math.max(0, cat.bowl - c.bowlMealSize);
      n.hunger = Math.max(0, n.hunger - 0.8);
      break;
    case 'beg_food':
      spot = 'bowl';
      break;
    case 'watch_fish':
      spot = 'tank_front';
      break;
    case 'look_window':
      spot = 'windowsill';
      break;
    default:
      break;
  }
  setBehavior(state, behavior, spot, minutes, events);
}

export function stepCat(
  state: SimState,
  dtMinutes: number,
  rng: Rng,
  config: SimConfig,
  env: SimEnvironment,
  events: SimEvent[],
): void {
  const cat = state.cat;
  const c = config.cat;
  const n = cat.needs;
  const hours = dtMinutes / MINUTES_PER_HOUR;
  const behavior = cat.behavior;

  if (behavior === 'sleep') {
    n.sleep = clamp01(n.sleep - c.sleepRecoverPerHour * hours);
    n.energy = clamp01(n.energy + c.energyRecoverPerHourAsleep * hours);
  } else {
    n.sleep = clamp01(n.sleep + c.sleepNeedPerHourAwake * hours);
    n.energy = clamp01(n.energy - c.energyDrainPerHourAwake * (behavior === 'play' ? 4 : 1) * hours);
  }
  n.hunger = clamp01(n.hunger + c.hungerPerHour * hours);
  const curious = behavior === 'watch_fish' || behavior === 'look_window' || behavior === 'play';
  n.curiosity = clamp01(n.curiosity + (curious ? -0.6 : c.curiosityPerHour) * hours);
  if (behavior !== 'purr') n.affection = clamp01(n.affection + c.affectionPerHour * hours);
  if (cat.petting > 0) cat.petting = Math.max(0, cat.petting - c.petDecayPerMinute * dtMinutes);
  cat.watchingMinutes =
    behavior === 'watch_fish' || behavior === 'tap_glass' ? cat.watchingMinutes + dtMinutes : 0;

  if (state.timeMinutes >= cat.behaviorUntil) decide(state, rng, config, env, events);
}

/** Una caricia. Ronronea; si son demasiadas seguidas, se molesta y se va. */
export function petCat(state: SimState, config: SimConfig, events: SimEvent[]): void {
  const cat = state.cat;
  const c = config.cat;
  const now = state.timeMinutes;
  if (now < cat.annoyedUntil) return; // se fue: no hay a quién acariciar
  const tolerance = petTolerance(cat, config);
  cat.petting += 1;
  cat.needs.affection = clamp01(cat.needs.affection - c.petAffection);
  if (cat.petting > tolerance) {
    cat.petting = 0;
    cat.annoyedUntil = now + c.annoyedMinutes;
    events.push({ type: 'cat_annoyed', timeMinutes: now });
    setBehavior(state, 'sulk', 'away', c.annoyedMinutes, events);
    return;
  }
  if (cat.behavior !== 'purr') events.push({ type: 'cat_petted', timeMinutes: now });
  setBehavior(state, 'purr', cat.spot === 'away' ? 'floor' : cat.spot, c.purrMinutes, events);
}

export function fillCatBowl(state: SimState, events: SimEvent[]): void {
  const cat = state.cat;
  cat.bowl = 1;
  events.push({ type: 'cat_bowl_filled', timeMinutes: state.timeMinutes });
  // Si tenía hambre, viene enseguida.
  if (cat.needs.hunger > 0.4 && state.timeMinutes >= cat.annoyedUntil) {
    cat.behaviorUntil = state.timeMinutes;
  }
}
