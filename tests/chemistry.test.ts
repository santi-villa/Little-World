import { describe, expect, it } from 'vitest';
import {
  ammoniaToxicity,
  applyAction,
  createNewTank,
  defaultConfig,
  derive,
  freeAmmoniaFraction,
  oxygenSaturation,
  phFromKhCo2,
  step,
  type SimState,
} from '../src/sim';
import { DAY, WEEK, matureTank, newTank, run } from './helpers';

/** Recalcula pH y alertas después de tocar el agua a mano. */
const settle = (state: SimState): SimState =>
  applyAction(state, { type: 'setBioload' }).state;

describe('toxicidad del amoníaco (NH3 libre)', () => {
  it('coincide con las tablas de Emerson', () => {
    expect(freeAmmoniaFraction(7.0, 25)).toBeCloseTo(0.00566, 4);
    expect(freeAmmoniaFraction(8.0, 25)).toBeCloseTo(0.0538, 3);
    expect(freeAmmoniaFraction(7.0, 15)).toBeCloseTo(0.00273, 4);
  });

  it('sube con el pH y con la temperatura', () => {
    expect(freeAmmoniaFraction(8, 25)).toBeGreaterThan(freeAmmoniaFraction(7, 25) * 8);
    expect(freeAmmoniaFraction(7, 25)).toBeGreaterThan(freeAmmoniaFraction(6, 25) * 8);
    expect(freeAmmoniaFraction(7.5, 30)).toBeGreaterThan(freeAmmoniaFraction(7.5, 20) * 1.5);
  });

  it('el mismo amoníaco es inofensivo en agua ácida y peligroso en agua alcalina y caliente', () => {
    const base = newTank({ seed: 1 });
    const withWater = (kh: number, temperatureC: number): SimState =>
      settle({ ...base, water: { ...base.water, ammonia: 1, kh, temperatureC } });
    const acid = withWater(0.3, 25);
    const alkaline = withWater(10, 25);
    const alkalineCold = withWater(10, 18);

    expect(acid.water.ph).toBeLessThan(7);
    expect(alkaline.water.ph).toBeGreaterThan(8);
    expect(derive(alkaline).nh3).toBeGreaterThan(derive(acid).nh3 * 10);
    expect(derive(alkaline).nh3).toBeGreaterThan(derive(alkalineCold).nh3);
    expect(derive(acid).ammoniaToxicity).toBe(0);
    expect(derive(alkaline).ammoniaToxicity).toBeGreaterThan(0.05);
    expect(alkaline.alerts).toContain('ammonia_danger');
    expect(acid.alerts).not.toContain('ammonia_stress');
  });

  it('el índice de toxicidad va de 0 a 1', () => {
    expect(ammoniaToxicity(0, defaultConfig)).toBe(0);
    expect(ammoniaToxicity(defaultConfig.toxicity.nh3SafePpm, defaultConfig)).toBe(0);
    expect(ammoniaToxicity(defaultConfig.toxicity.nh3LethalPpm, defaultConfig)).toBe(1);
    expect(ammoniaToxicity(99, defaultConfig)).toBe(1);
  });
});

describe('umbrales de referencia', () => {
  const base = newTank({ seed: 1 });
  const alertsFor = (water: Partial<SimState['water']>): string[] =>
    settle({ ...base, water: { ...base.water, ...water } }).alerts;

  it('una pecera recién armada no tiene alertas', () => {
    expect(base.alerts).toEqual([]);
    expect(settle(base).alerts).toEqual([]);
  });

  it('nitrito: estrés por encima de 0,25 ppm y peligro por encima de 1 ppm', () => {
    expect(alertsFor({ nitrite: 0.2 })).toEqual([]);
    expect(alertsFor({ nitrite: 0.3 })).toEqual(['nitrite_stress']);
    expect(alertsFor({ nitrite: 1.2 })).toEqual(['nitrite_stress', 'nitrite_danger']);
  });

  it('nitrato: estrés por encima de 40 ppm y peligro por encima de 80 ppm', () => {
    expect(alertsFor({ nitrate: 30 })).toEqual([]);
    expect(alertsFor({ nitrate: 45 })).toEqual(['nitrate_stress']);
    expect(alertsFor({ nitrate: 90 })).toEqual(['nitrate_stress', 'nitrate_danger']);
  });

  it('NH3 libre: estrés por encima de 0,02 ppm y peligro por encima de 0,05 ppm', () => {
    const fraction = freeAmmoniaFraction(base.water.ph, base.water.temperatureC);
    expect(alertsFor({ ammonia: 0.01 / fraction })).toEqual([]);
    expect(alertsFor({ ammonia: 0.03 / fraction })).toEqual(['ammonia_stress']);
    expect(alertsFor({ ammonia: 0.06 / fraction })).toEqual(['ammonia_stress', 'ammonia_danger']);
  });

  it('oxígeno: estrés por debajo de 0,6 y peligro por debajo de 0,4', () => {
    const reference = oxygenSaturation(defaultConfig.oxygen.referenceTemperatureC);
    expect(alertsFor({ oxygen: reference * 0.7 })).toEqual([]);
    expect(alertsFor({ oxygen: reference * 0.5 })).toEqual(['oxygen_stress']);
    expect(alertsFor({ oxygen: reference * 0.3 })).toEqual(['oxygen_stress', 'oxygen_danger']);
  });

  it('cloro: cualquier cantidad', () => {
    expect(alertsFor({ chlorine: 0.1 })).toEqual(['chlorine_present']);
  });

  it('las alertas avisan al encenderse y al apagarse', () => {
    const high = settle({ ...base, water: { ...base.water, nitrate: 45 } });
    const lowered = applyAction(high, { type: 'waterChange', fraction: 0.5, conditioned: true });
    expect(lowered.events).toContainEqual(
      expect.objectContaining({ type: 'alert_cleared', alert: 'nitrate_stress' }),
    );
    expect(lowered.state.alerts).not.toContain('nitrate_stress');
  });
});

describe('pH y KH', () => {
  it('más KH da más pH; más CO2 lo baja', () => {
    expect(phFromKhCo2(8, 3, defaultConfig)).toBeGreaterThan(phFromKhCo2(4, 3, defaultConfig));
    expect(phFromKhCo2(4, 3, defaultConfig)).toBeCloseTo(7.6, 1);
    expect(phFromKhCo2(4, 30, defaultConfig)).toBeCloseTo(6.6, 1);
    expect(phFromKhCo2(0, 3, defaultConfig)).toBeLessThan(6);
  });

  it('el pH baja lentamente a medida que se acumula nitrato (se consume KH)', () => {
    const start = matureTank(11);
    const after = step(start, 4 * WEEK).state;
    expect(after.water.nitrate).toBeGreaterThan(start.water.nitrate);
    expect(after.water.kh).toBeLessThan(start.water.kh - 0.5);
    expect(after.water.ph).toBeLessThan(start.water.ph);
    expect(after.water.ph).toBeGreaterThan(start.water.ph - 1);
  });

  it('con KH bajo el pH cae de golpe y la nitrificación se frena', () => {
    const start = matureTank(11, 30);
    let state = start;
    const events = [];
    for (let week = 0; week < 16; week++) {
      const result = step(state, WEEK);
      state = result.state;
      events.push(...result.events);
    }
    expect(state.water.kh).toBeLessThan(0.5);
    expect(state.water.ph).toBeLessThan(6.2);
    expect(start.water.ph - state.water.ph).toBeGreaterThan(1);
    expect(state.water.ammonia).toBeGreaterThan(0.5);
    expect(events).toContainEqual(expect.objectContaining({ type: 'alert_raised', alert: 'kh_low' }));
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'alert_raised', alert: 'ph_crash' }),
    );

    // Un cambio de agua repone KH y la saca del pozo.
    const fixed = applyAction(state, { type: 'waterChange', fraction: 0.5, conditioned: true });
    expect(fixed.state.water.kh).toBeGreaterThan(1.5);
    expect(fixed.state.water.ph).toBeGreaterThan(7);
  });
});

describe('oxígeno', () => {
  it('el agua caliente tiene menos oxígeno', () => {
    expect(oxygenSaturation(20)).toBeCloseTo(9.1, 1);
    expect(oxygenSaturation(25)).toBeCloseTo(8.3, 1);
    const at = (temperatureC: number) =>
      derive(step(newTank({ seed: 1, heaterSetpointC: temperatureC, heaterWatts: 200 }), 2 * DAY).state)
        .oxygenRelative;
    expect(at(30)).toBeLessThan(at(25));
    expect(at(25)).toBeLessThan(at(20));
    expect(at(30)).toBeGreaterThan(0.8); // saturada sigue siendo "ideal"
  });

  it('con el filtro andando se mantiene cerca de la saturación', () => {
    const d = derive(matureTank());
    expect(d.oxygenSaturationFraction).toBeGreaterThan(0.95);
    expect(d.oxygenRelative).toBeGreaterThan(0.8);
  });

  it('la materia orgánica pudriéndose lo consume, y peor sin movimiento en la superficie', () => {
    const dirty = applyAction(matureTank(), { type: 'feed', grams: 20 }).state;
    const stopped = applyAction(dirty, { type: 'setFilterRunning', running: false }).state;

    let minRunning = Infinity;
    let minStopped = Infinity;
    let a = dirty;
    let b = stopped;
    for (let h = 0; h < 72; h++) {
      a = step(a, 60).state;
      b = step(b, 60).state;
      minRunning = Math.min(minRunning, derive(a).oxygenRelative);
      minStopped = Math.min(minStopped, derive(b).oxygenRelative);
    }
    expect(minRunning).toBeLessThan(derive(dirty).oxygenRelative - 0.03);
    expect(minStopped).toBeLessThan(minRunning - 0.15);
    expect(minStopped).toBeLessThan(defaultConfig.thresholds.oxygenStress);
    expect(b.alerts).toContain('oxygen_stress');
  });

  it('con el filtro apagado las bacterias del filtro se mueren', () => {
    const start = matureTank();
    const stopped = applyAction(start, { type: 'setFilterRunning', running: false }).state;
    const after = run(stopped, 3 * DAY);
    expect(after.state.bacteria.filter.aob).toBeLessThan(start.bacteria.filter.aob * 0.1);
    expect(after.peakAmmonia).toBeGreaterThan(0.25);
  });
});

describe('algas', () => {
  const grow = (lightHours: number, nitrate: number, phosphate = 1) => {
    let state = newTank({ seed: 4 });
    state = applyAction(state, { type: 'setLight', durationHours: lightHours }).state;
    state = {
      ...state,
      water: { ...state.water, nitrate, phosphate },
      algae: { glass: 0.05, decor: 0.05 },
    };
    return step(state, 4 * WEEK).state;
  };

  it('crecen con más horas de luz', () => {
    expect(grow(8, 40).algae.glass).toBeGreaterThan(0.05);
    expect(grow(12, 40).algae.glass).toBeGreaterThan(grow(8, 40).algae.glass * 1.5);
    expect(grow(0, 40).algae.glass).toBeLessThan(0.05);
  });

  it('crecen con nitrato y fosfato altos', () => {
    expect(grow(10, 40, 1).algae.glass).toBeGreaterThan(grow(10, 0.2, 1).algae.glass);
    expect(grow(10, 40, 1).algae.glass).toBeGreaterThan(grow(10, 40, 0.005).algae.glass);
  });

  it('el vidrio (más luz) se cubre antes que la decoración', () => {
    const end = grow(12, 40);
    expect(end.algae.glass).toBeGreaterThan(end.algae.decor);
    expect(end.algae.glass).toBeLessThanOrEqual(1);
  });

  it('consumen nitrato y fosfato', () => {
    const end = grow(12, 40);
    expect(end.water.nitrate).toBeLessThan(40);
    expect(end.water.phosphate).toBeLessThan(1);
  });

  it('limpiar el vidrio las saca del vidrio pero no de la decoración', () => {
    const dirty = { ...newTank({ seed: 4 }), algae: { glass: 0.8, decor: 0.6 } };
    const bloomed = settle(dirty);
    expect(bloomed.alerts).toContain('algae_bloom');
    const cleaned = applyAction(bloomed, { type: 'cleanGlass' });
    expect(cleaned.state.algae.glass).toBeLessThan(0.1);
    expect(cleaned.state.algae.decor).toBe(0.6);
    expect(cleaned.events).toContainEqual(expect.objectContaining({ type: 'glass_cleaned' }));
    expect(cleaned.state.alerts).not.toContain('algae_bloom');
  });

  it('de día suben el oxígeno y el pH', () => {
    let state = newTank({ seed: 4 });
    state = {
      ...state,
      water: { ...state.water, nitrate: 40, phosphate: 1 },
      algae: { glass: 0.6, decor: 0.6 },
    };
    // La pecera nueva arranca a las 8:00; la luz va de 10:00 a 18:00.
    const dark = step(state, 60).state; // 9:00, todavía a oscuras
    const lit = step(state, 6 * 60).state; // 14:00, con luz
    expect(derive(dark).lightOn).toBe(false);
    expect(derive(lit).lightOn).toBe(true);
    expect(lit.water.oxygen).toBeGreaterThan(dark.water.oxygen);
    expect(lit.water.ph).toBeGreaterThan(dark.water.ph);
  });
});

describe('peceras del catálogo', () => {
  it('la pecera por defecto es el cubo de 20 L del tutorial', () => {
    const cube = createNewTank({ seed: 1 });
    expect(cube.tank.modelId).toBe('cube_20');
    expect(cube.tank.fullLiters).toBeGreaterThan(20);
    expect(cube.tank.fullLiters).toBeLessThan(25);
    expect(cube.heater.watts).toBe(25);
    expect(cube.water.chlorine).toBe(0);
  });

  it('la redonda no tiene filtro ni calefactor y está a temperatura ambiente', () => {
    const bowl = createNewTank({ seed: 1, tankId: 'bowl_8' });
    expect(bowl.filter.running).toBe(false);
    expect(bowl.heater.enabled).toBe(false);
    expect(bowl.water.temperatureC).toBeCloseTo(bowl.room.temperatureC, 9);
    expect(bowl.bacteria.filter.aob).toBe(0);

    // Sin filtro, las bacterias solo pueden vivir en las superficies.
    const later = step({ ...bowl, bioload: { ammoniaMgNPerDay: 1, wasteGPerDay: 0 } }, 3 * WEEK).state;
    expect(later.bacteria.filter.aob).toBe(0);
    expect(later.bacteria.surfaces.aob).toBeGreaterThan(bowl.bacteria.surfaces.aob * 10);
    for (const value of Object.values(later.water)) expect(Number.isFinite(value)).toBe(true);
  });

  it('una pecera inexistente es un error', () => {
    expect(() => createNewTank({ tankId: 'no_existe' })).toThrow();
  });
});
