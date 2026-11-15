import { describe, expect, it } from 'vitest';
import { applyAction, createNewTank, defaultConfig } from '../src/sim';
import { DAY, WEEK, matureTank, newTank, run, totalAob, totalNob } from './helpers';

describe('ciclado de una pecera nueva', () => {
  // Fuente constante de amoníaco: 15 mg N/día en 60 L (~0,3 ppm por día).
  for (const seed of [1, 2, 3]) {
    it(`cicla entre 3 y 6 semanas (semilla ${seed})`, () => {
      const result = run(newTank({ seed, ammoniaMgNPerDay: 15 }), 8 * WEEK);

      // Primero pico de amoníaco, después pico de nitrito.
      expect(result.peakAmmonia).toBeGreaterThan(1);
      expect(result.peakNitrite).toBeGreaterThan(1);
      expect(result.peakAmmoniaDay).toBeLessThan(result.peakNitriteDay);

      // El evento de "ciclada" llega entre las semanas 3 y 6.
      const established = result.events.find((e) => e.type === 'cycle_established');
      expect(established).toBeDefined();
      const day = established!.timeMinutes / DAY;
      expect(day).toBeGreaterThanOrEqual(21);
      expect(day).toBeLessThanOrEqual(42);
      expect(result.peakNitriteDay).toBeLessThan(day);

      // Después queda estable: amoníaco y nitrito en cero, y el nitrato se acumula.
      const { water, cycle } = result.state;
      expect(cycle.established).toBe(true);
      expect(water.ammonia).toBeLessThan(0.2);
      expect(water.nitrite).toBeLessThan(0.2);
      expect(water.nitrate).toBeGreaterThan(20);
      expect(result.events.some((e) => e.type === 'cycle_lost')).toBe(false);
    });
  }

  it('el cubo de 20 L del tutorial también cicla entre 3 y 6 semanas', () => {
    const result = run(createNewTank({ seed: 4, ammoniaMgNPerDay: 5 }), 8 * WEEK);
    const established = result.events.find((e) => e.type === 'cycle_established');
    expect(established).toBeDefined();
    const day = established!.timeMinutes / DAY;
    expect(day).toBeGreaterThanOrEqual(21);
    expect(day).toBeLessThanOrEqual(42);
    expect(result.peakAmmoniaDay).toBeLessThan(result.peakNitriteDay);
  });

  it('sin fuente de amoníaco no se cicla', () => {
    const result = run(newTank({ seed: 1 }), 6 * WEEK);
    expect(result.state.cycle.established).toBe(false);
    expect(totalAob(result.state)).toBeLessThan(1);
  });

  it('el nitrógeno se conserva: lo que entra como amoníaco termina como nitrato', () => {
    const start = newTank({ seed: 1, ammoniaMgNPerDay: 6 });
    // Sin luz no hay algas que se lleven nitrógeno.
    const dark = applyAction(start, { type: 'setLight', durationHours: 0 }).state;
    const end = run(dark, 8 * WEEK).state;
    const f = { ammonia: 14.007 / 17.031, nitrite: 14.007 / 46.005, nitrate: 14.007 / 62.004 };
    const nitrogenMg =
      (end.water.ammonia * f.ammonia + end.water.nitrite * f.nitrite + end.water.nitrate * f.nitrate) *
      end.tank.waterLiters;
    expect(nitrogenMg).toBeCloseTo(6 * 56, 0);
  });
});

describe('material de filtro colonizado', () => {
  const lowLoad = 6; // mg N/día

  it('una pecera nueva con material colonizado no tiene picos con carga baja', () => {
    const start = newTank({ seed: 5, seededMedia: true, ammoniaMgNPerDay: lowLoad });
    const result = run(start, 4 * WEEK);
    expect(result.peakAmmonia).toBeLessThan(0.1);
    expect(result.peakNitrite).toBeLessThan(0.1);
    expect(result.state.cycle.established).toBe(true);
    expect(result.events.some((e) => e.type === 'alert_raised')).toBe(false);
  });

  it('la misma pecera sin material colonizado sí tiene picos', () => {
    const start = newTank({ seed: 5, ammoniaMgNPerDay: lowLoad });
    const result = run(start, 4 * WEEK);
    expect(result.peakAmmonia).toBeGreaterThan(0.5);
    expect(result.peakNitrite).toBeGreaterThan(1);
  });

  it('agregar material colonizado como acción equivale a arrancar con él', () => {
    const empty = newTank({ seed: 5, ammoniaMgNPerDay: lowLoad });
    const { state, events } = applyAction(empty, { type: 'addSeededMedia' });
    expect(events.some((e) => e.type === 'seeded_media_added')).toBe(true);
    const result = run(state, 4 * WEEK);
    expect(result.peakAmmonia).toBeLessThan(0.1);
    expect(result.peakNitrite).toBeLessThan(0.1);
  });

  it('el filtro aloja la mayor parte de las bacterias', () => {
    const mature = matureTank();
    expect(mature.bacteria.filter.aob).toBeGreaterThan(mature.bacteria.surfaces.aob * 4);
    expect(mature.bacteria.surfaces.aob).toBeGreaterThan(0.5);
  });
});

describe('limpieza del filtro', () => {
  const mature = matureTank();

  it('la pecera madura de partida está estable', () => {
    expect(mature.cycle.established).toBe(true);
    expect(mature.water.ammonia).toBeLessThan(0.1);
    expect(mature.water.nitrite).toBeLessThan(0.15);
    expect(mature.alerts).toEqual([]);
  });

  for (const seed of [7, 8, 9]) {
    it(`lavarlo con agua de la canilla provoca un pico de amoníaco y de nitrito (semilla ${seed})`, () => {
      const tank = matureTank(seed);
      const washed = applyAction(tank, { type: 'cleanFilter', method: 'tapWater' });

      // Mata entre el 70 y el 90% de las bacterias del filtro.
      const event = washed.events.find((e) => e.type === 'filter_cleaned');
      expect(event).toBeDefined();
      const lost = event!.type === 'filter_cleaned' ? event!.bacteriaLostFraction : 0;
      expect(lost).toBeGreaterThanOrEqual(defaultConfig.filter.badCleanBacteriaLossMin);
      expect(lost).toBeLessThanOrEqual(defaultConfig.filter.badCleanBacteriaLossMax);
      expect(washed.state.bacteria.filter.aob).toBeCloseTo(tank.bacteria.filter.aob * (1 - lost), 6);
      expect(washed.state.bacteria.surfaces.aob).toBe(tank.bacteria.surfaces.aob);

      const result = run(washed.state, 2 * WEEK);
      expect(result.peakAmmonia).toBeGreaterThan(0.25);
      expect(result.peakNitrite).toBeGreaterThan(1);
      expect(result.peakAmmonia).toBeGreaterThan(tank.water.ammonia * 5);
      expect(result.peakNitrite).toBeGreaterThan(tank.water.nitrite * 10);
      expect(result.peakAmmoniaDay).toBeLessThan(result.peakNitriteDay);
      expect(result.events.some((e) => e.type === 'cycle_lost')).toBe(true);
      expect(result.events).toContainEqual(
        expect.objectContaining({ type: 'alert_raised', alert: 'nitrite_danger' }),
      );

      // Es un mini re-ciclado: después se recupera sola.
      expect(result.state.water.ammonia).toBeLessThan(0.1);
      expect(result.state.water.nitrite).toBeLessThan(0.25);
    });
  }

  it('enjuagarlo en agua de la pecera no provoca picos y lo deja limpio', () => {
    const rinsed = applyAction(mature, { type: 'cleanFilter', method: 'tankWater' });
    expect(rinsed.state.filter.clog).toBeLessThan(mature.filter.clog);
    expect(totalAob(rinsed.state)).toBeGreaterThan(totalAob(mature) * 0.85);

    const result = run(rinsed.state, 2 * WEEK);
    expect(result.peakAmmonia).toBeLessThan(0.1);
    expect(result.peakNitrite).toBeLessThan(0.25);
    expect(result.events.some((e) => e.type === 'cycle_lost')).toBe(false);
    expect(
      result.events.some((e) => e.type === 'alert_raised' && /ammonia|nitrite/.test(e.alert)),
    ).toBe(false);
  });

  it('cambiar todo el material de golpe es todavía peor', () => {
    const washed = run(applyAction(mature, { type: 'cleanFilter', method: 'tapWater' }).state, 2 * WEEK);
    const replaced = applyAction(mature, { type: 'replaceFilterMedia' });
    expect(replaced.state.bacteria.filter.aob).toBeLessThan(1);
    expect(totalNob(replaced.state)).toBeLessThan(totalNob(mature) * 0.2);
    const result = run(replaced.state, 2 * WEEK);
    expect(result.peakAmmonia).toBeGreaterThan(washed.peakAmmonia);
    expect(result.peakNitrite).toBeGreaterThan(washed.peakNitrite);
  });

  it('el filtro se ensucia con el tiempo y pierde caudal', () => {
    expect(mature.filter.clog).toBeGreaterThan(0.2);
    const clogged = { ...mature, filter: { ...mature.filter, clog: 0.9 } };
    const flow = (s: typeof mature) => run(s, 60).state;
    expect(flow(clogged).alerts).toContain('filter_clogged');
  });
});

describe('alimentación', () => {
  const mature = matureTank();

  it('sobrealimentar sube el amoníaco', () => {
    const normal = run(applyAction(mature, { type: 'feed', grams: 0.3 }).state, WEEK);
    const overfed = run(applyAction(mature, { type: 'feed', grams: 8 }).state, WEEK);

    expect(normal.peakAmmonia).toBeLessThan(0.15);
    expect(overfed.peakAmmonia).toBeGreaterThan(1);
    expect(overfed.peakAmmonia).toBeGreaterThan(normal.peakAmmonia * 10);
    // Lo que no se come termina como nitrato, fosfato y detrito.
    expect(overfed.state.water.nitrate).toBeGreaterThan(normal.state.water.nitrate);
    expect(overfed.state.water.phosphate).toBeGreaterThan(normal.state.water.phosphate);
    expect(overfed.state.organics.detritusG).toBeGreaterThan(normal.state.organics.detritusG);
  });

  it('cuanta más comida sobra, más alto el pico', () => {
    const peaks = [0.5, 2, 4, 8].map(
      (grams) => run(applyAction(mature, { type: 'feed', grams }).state, WEEK).peakAmmonia,
    );
    for (let i = 1; i < peaks.length; i++) {
      expect(peaks[i]!).toBeGreaterThan(peaks[i - 1]!);
    }
  });

  it('la comida se pudre más rápido con el agua más caliente', () => {
    const fed = (temperatureC: number) => {
      const state = applyAction(mature, { type: 'setHeater', setpointC: temperatureC }).state;
      const warm = { ...state, water: { ...state.water, temperatureC } };
      return run(applyAction(warm, { type: 'feed', grams: 2 }).state, DAY).state.organics.foodG;
    };
    expect(fed(28)).toBeLessThan(fed(20));
  });
});
