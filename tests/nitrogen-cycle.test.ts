import { describe, expect, it } from 'vitest';
import { applyAction, createNewTank } from '../src/sim';
import { DAY, WEEK, matureTank, run, totalAob, totalNob } from './helpers';

describe('ciclado de una pecera nueva', () => {
  // Fuente constante de amoníaco: 15 mg N/día en 60 L (~0,25 mg/L por día).
  for (const seed of [1, 2, 3]) {
    it(`cicla entre 3 y 6 semanas (semilla ${seed})`, () => {
      const result = run(createNewTank({ seed, ammoniaMgNPerDay: 15 }), 8 * WEEK);

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
      expect(water.ammonia).toBeLessThan(0.1);
      expect(water.nitrite).toBeLessThan(0.1);
      expect(water.nitrate).toBeGreaterThan(5);
      expect(result.events.some((e) => e.type === 'cycle_lost')).toBe(false);
    });
  }

  it('sin fuente de amoníaco no se cicla', () => {
    const result = run(createNewTank({ seed: 1 }), 6 * WEEK);
    expect(result.state.cycle.established).toBe(false);
    expect(totalAob(result.state)).toBeLessThan(1);
  });
});

describe('material de filtro colonizado', () => {
  const lowLoad = 6; // mg N/día

  it('una pecera nueva con material colonizado no tiene picos con carga baja', () => {
    const start = createNewTank({ seed: 5, seededMedia: true, ammoniaMgNPerDay: lowLoad });
    const result = run(start, 4 * WEEK);
    expect(result.peakAmmonia).toBeLessThan(0.1);
    expect(result.peakNitrite).toBeLessThan(0.1);
    expect(result.state.cycle.established).toBe(true);
  });

  it('la misma pecera sin material colonizado sí tiene picos', () => {
    const start = createNewTank({ seed: 5, ammoniaMgNPerDay: lowLoad });
    const result = run(start, 4 * WEEK);
    expect(result.peakAmmonia).toBeGreaterThan(0.5);
    expect(result.peakNitrite).toBeGreaterThan(0.5);
  });

  it('agregar material colonizado como acción equivale a arrancar con él', () => {
    const empty = createNewTank({ seed: 5, ammoniaMgNPerDay: lowLoad });
    const { state, events } = applyAction(empty, { type: 'addSeededMedia' });
    expect(events.some((e) => e.type === 'seeded_media_added')).toBe(true);
    const result = run(state, 4 * WEEK);
    expect(result.peakAmmonia).toBeLessThan(0.1);
    expect(result.peakNitrite).toBeLessThan(0.1);
  });
});

describe('limpieza del filtro', () => {
  const mature = matureTank();

  it('la pecera madura de partida está estable', () => {
    expect(mature.cycle.established).toBe(true);
    expect(mature.water.ammonia).toBeLessThan(0.1);
    expect(mature.water.nitrite).toBeLessThan(0.1);
  });

  it('lavarlo con agua de canilla provoca un pico de amoníaco y de nitrito', () => {
    const washed = applyAction(mature, { type: 'cleanFilter', method: 'tapWater' });
    expect(totalAob(washed.state)).toBeLessThan(totalAob(mature) * 0.3);
    expect(totalNob(washed.state)).toBeLessThan(totalNob(mature) * 0.3);

    const result = run(washed.state, 2 * WEEK);
    expect(result.peakAmmonia).toBeGreaterThan(0.25);
    expect(result.peakNitrite).toBeGreaterThan(0.25);
    expect(result.peakAmmonia).toBeGreaterThan(mature.water.ammonia * 10);
    expect(result.peakNitrite).toBeGreaterThan(mature.water.nitrite * 10);
    expect(result.peakAmmoniaDay).toBeLessThan(result.peakNitriteDay);
    expect(result.events.some((e) => e.type === 'cycle_lost')).toBe(true);

    // Y después se recupera sola.
    expect(result.state.water.ammonia).toBeLessThan(0.1);
  });

  it('enjuagarlo en agua de la pecera no provoca picos y lo deja limpio', () => {
    const rinsed = applyAction(mature, { type: 'cleanFilter', method: 'tankWater' });
    expect(rinsed.state.filter.clog).toBeLessThan(mature.filter.clog);
    expect(totalAob(rinsed.state)).toBeGreaterThan(totalAob(mature) * 0.85);

    const result = run(rinsed.state, 2 * WEEK);
    expect(result.peakAmmonia).toBeLessThan(0.1);
    expect(result.peakNitrite).toBeLessThan(0.1);
    expect(result.events.some((e) => e.type === 'cycle_lost')).toBe(false);
  });
});

describe('alimentación', () => {
  const mature = matureTank();

  it('sobrealimentar sube el amoníaco', () => {
    const normal = run(applyAction(mature, { type: 'feed', grams: 0.3 }).state, WEEK);
    const overfed = run(applyAction(mature, { type: 'feed', grams: 8 }).state, WEEK);

    expect(normal.peakAmmonia).toBeLessThan(0.1);
    expect(overfed.peakAmmonia).toBeGreaterThan(1);
    expect(overfed.peakAmmonia).toBeGreaterThan(normal.peakAmmonia * 10);
    // Lo que no se come termina como nitrato y como detrito.
    expect(overfed.state.water.nitrate).toBeGreaterThan(normal.state.water.nitrate);
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
});
