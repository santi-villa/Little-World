import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createNewTank,
  defaultConfig,
  petTolerance,
  step,
  type CatBehavior,
  type SimEnvironment,
  type SimEvent,
  type SimState,
} from '../src/sim';
import { DAY, HOUR, matureTank } from './helpers';

function withFish(seed: number | string = 'gato'): SimState {
  let state = applyAction(matureTank(seed), { type: 'setBioload', ammoniaMgNPerDay: 0 }).state;
  state = applyAction(state, { type: 'addAnimals', speciesId: 'zebra_danio', count: 8 }).state;
  return state;
}

/** Corre de a 10 minutos, llenando el plato cada mañana, y junta qué hizo el gato. */
function observe(
  start: SimState,
  days: number,
  env: SimEnvironment = {},
): { state: SimState; events: SimEvent[]; minutes: Map<string, number> } {
  let state = start;
  const events: SimEvent[] = [];
  const minutes = new Map<string, number>();
  for (let i = 0; i < days * 144; i++) {
    if (i % 144 === 0) state = applyAction(state, { type: 'fillCatBowl' }).state;
    if (i % 72 === 0) state = applyAction(state, { type: 'feed', grams: 0.05 }).state;
    const result = step(state, 10, defaultConfig, env);
    state = result.state;
    events.push(...result.events);
    for (const key of [state.cat.behavior, `spot:${state.cat.spot}`]) {
      minutes.set(key, (minutes.get(key) ?? 0) + 10);
    }
  }
  return { state, events, minutes };
}

describe('el gato', () => {
  it('sus necesidades se mantienen entre 0 y 1 y elige distintos comportamientos', () => {
    const { state, minutes } = observe(withFish(), 5, { playerPresent: true });
    for (const value of Object.values(state.cat.needs)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    const seen = [...minutes.keys()].filter((k) => !k.startsWith('spot:')) as CatBehavior[];
    for (const behavior of ['sleep', 'watch_fish', 'eat', 'look_window'] as const) {
      expect(seen, behavior).toContain(behavior);
    }
    // Duerme mucho, como un gato de verdad: entre 9 y 18 horas por día.
    const sleepHours = (minutes.get('sleep') ?? 0) / 60 / 5;
    expect(sleepHours).toBeGreaterThan(9);
    expect(sleepHours).toBeLessThan(18);
  });

  it('el clima cambia dónde duerme: al sol si está despejado, nunca si llueve', () => {
    const clear = observe(withFish(), 4, { weather: 'clear' }).minutes;
    const rain = observe(withFish(), 4, { weather: 'rain' }).minutes;
    expect(clear.get('spot:sunbeam') ?? 0).toBeGreaterThan(4 * HOUR);
    expect(rain.get('spot:sunbeam') ?? 0).toBe(0);
    expect(rain.get('spot:bed') ?? 0).toBeGreaterThan(clear.get('spot:bed') ?? 0);
    // Con lluvia mira más por la ventana.
    expect(rain.get('look_window') ?? 0).toBeGreaterThan(clear.get('look_window') ?? 0);
  });

  it('come cuando tiene el plato lleno y pide comida si está vacío y hay alguien', () => {
    let state = withFish();
    state = { ...state, cat: { ...state.cat, bowl: 0, needs: { ...state.cat.needs, hunger: 0.9, sleep: 0 } } };
    const begging = step(state, 30, defaultConfig, { playerPresent: true }).state;
    expect(begging.cat.behavior).toBe('beg_food');
    const filled = applyAction(begging, { type: 'fillCatBowl' }).state;
    const eating = step(filled, 1, defaultConfig, { playerPresent: true }).state;
    expect(eating.cat.behavior).toBe('eat');
    expect(eating.cat.spot).toBe('bowl');
    expect(eating.cat.needs.hunger).toBeLessThan(0.3);
    expect(eating.cat.bowl).toBeLessThan(1);
  });

  it('mira los peces y a veces toca el vidrio: los peces se asustan', () => {
    const { events } = observe(withFish(), 6);
    const watches = events.filter((e) => e.type === 'cat_behavior' && e.behavior === 'watch_fish');
    const taps = events.filter((e) => e.type === 'glass_tapped' && e.by === 'cat');
    expect(watches.length).toBeGreaterThan(5);
    expect(taps.length).toBeGreaterThan(0);
    expect(taps.length).toBeLessThan(watches.length);

    // El toque en sí: peces nuevos, susto general.
    let state = withFish();
    state = { ...state, cat: { ...state.cat, behavior: 'watch_fish', spot: 'tank_front', behaviorUntil: 0 } };
    let tapped: SimState | null = null;
    for (let seed = 0; seed < 40 && !tapped; seed++) {
      const result = step({ ...state, rngState: seed }, 1);
      if (result.events.some((e) => e.type === 'glass_tapped')) tapped = result.state;
    }
    expect(tapped).not.toBeNull();
    expect(tapped!.cat.behavior).toBe('tap_glass');
    expect(tapped!.animals.every((a) => a.intent === 'flee' && a.fright > 0.3)).toBe(true);
  });

  it('con los días los peces se acostumbran al gato', () => {
    const fresh = withFish();
    const used = observe(fresh, 20).state;
    expect(fresh.animals.every((a) => a.catHabituation === 0)).toBe(true);
    expect(used.animals.every((a) => a.catHabituation > 0.7)).toBe(true);

    const scare = (state: SimState): number => {
      const calm: SimState = {
        ...state,
        animals: state.animals.map((a) => ({ ...a, stress: 10, fright: 0 })),
        cat: { ...state.cat, behavior: 'watch_fish', spot: 'tank_front', behaviorUntil: 0 },
      };
      for (let seed = 0; seed < 60; seed++) {
        const result = step({ ...calm, rngState: seed }, 1);
        if (result.events.some((e) => e.type === 'glass_tapped')) {
          return result.state.animals.reduce((sum, a) => sum + a.fright, 0) / calm.animals.length;
        }
      }
      throw new Error('el gato nunca tocó el vidrio');
    };
    expect(scare(used)).toBeLessThan(scare(fresh) * 0.4);
  });

  it('el gato mirando mucho rato estresa a los peces nuevos, no a los acostumbrados', () => {
    const watch = (state: SimState): SimState => ({
      ...state,
      cat: { ...state.cat, behavior: 'watch_fish', spot: 'tank_front', behaviorUntil: 1e9 },
    });
    const asleep = (state: SimState): SimState => ({
      ...state,
      cat: { ...state.cat, behavior: 'sleep', spot: 'bed', behaviorUntil: 1e9 },
    });
    const calm = withFish();
    const alone = step(asleep(calm), 6 * HOUR).state;
    const watched = step(watch(calm), 6 * HOUR).state;
    const stress = (s: SimState): number => s.animals.reduce((sum, a) => sum + a.stress, 0) / s.animals.length;
    expect(stress(watched)).toBeGreaterThan(stress(alone) + 4);
    const habituated: SimState = {
      ...calm,
      animals: calm.animals.map((a) => ({ ...a, catHabituation: 0.85 })),
    };
    expect(stress(step(watch(habituated), 6 * HOUR).state) - stress(step(asleep(habituated), 6 * HOUR).state)).toBeLessThan(2);
  });

  it('acariciarlo: ronronea; demasiadas caricias seguidas y se va molesto', () => {
    let state = createNewTank({ seed: 'mimos' });
    const first = applyAction(state, { type: 'petCat' });
    expect(first.state.cat.behavior).toBe('purr');
    expect(first.events.some((e) => e.type === 'cat_petted')).toBe(true);
    expect(first.state.cat.needs.affection).toBeLessThan(state.cat.needs.affection);

    state = first.state;
    const tolerance = petTolerance(state.cat, defaultConfig);
    let strokes = 1;
    let annoyed = false;
    while (strokes < 60 && !annoyed) {
      const result = applyAction(state, { type: 'petCat' });
      state = result.state;
      strokes++;
      annoyed = result.events.some((e) => e.type === 'cat_annoyed');
    }
    expect(annoyed).toBe(true);
    expect(strokes).toBeGreaterThan(4);
    expect(strokes).toBeLessThanOrEqual(Math.ceil(tolerance) + 2);
    expect(state.cat.behavior).toBe('sulk');
    expect(state.cat.spot).toBe('away');

    // Mientras está molesto no se deja acariciar y sigue lejos.
    const ignored = applyAction(state, { type: 'petCat' });
    expect(ignored.events).toEqual([]);
    expect(step(state, 10).state.cat.behavior).toBe('sulk');
    // Después se le pasa.
    const later = step(state, defaultConfig.cat.annoyedMinutes + 5).state;
    expect(later.cat.behavior).not.toBe('sulk');
    expect(later.cat.spot).not.toBe('away');
  });

  it('caricias espaciadas no lo molestan, y con ganas de mimos aguanta más', () => {
    let state = createNewTank({ seed: 'mimos' });
    for (let i = 0; i < 40; i++) {
      const result = applyAction(state, { type: 'petCat' });
      expect(result.events.some((e) => e.type === 'cat_annoyed')).toBe(false);
      state = step(result.state, 2).state;
    }
    const needy = { ...state.cat, needs: { ...state.cat.needs, affection: 1 } };
    const aloof = { ...state.cat, needs: { ...state.cat.needs, affection: 0 } };
    expect(petTolerance(needy, defaultConfig)).toBeGreaterThan(petTolerance(aloof, defaultConfig) * 2);
  });

  it('es determinista', () => {
    const state = withFish();
    expect(step(state, 2 * DAY).state.cat).toEqual(step(state, 2 * DAY).state.cat);
  });
});
