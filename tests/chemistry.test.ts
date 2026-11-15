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
import { DAY, WEEK, matureTank, run } from './helpers';

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

  it('el mismo amoníaco total es inofensivo en agua ácida y peligroso en alcalina', () => {
    const base = createNewTank({ seed: 1 });
    const withWater = (kh: number, temperatureC: number): SimState => {
      const water = { ...base.water, ammonia: 1, kh, temperatureC };
      water.ph = phFromKhCo2(kh, water.co2, defaultConfig);
      return applyAction({ ...base, water }, { type: 'setRoomBase', baseC: 21 }).state;
    };
    const acid = withWater(0.3, 25);
    const alkaline = withWater(10, 25);
    const alkalineCold = withWater(10, 18);

    expect(acid.water.ph).toBeLessThan(7);
    expect(alkaline.water.ph).toBeGreaterThan(8);
    expect(derive(alkaline).nh3).toBeGreaterThan(derive(acid).nh3 * 10);
    expect(derive(alkaline).nh3).toBeGreaterThan(derive(alkalineCold).nh3);
    expect(derive(acid).ammoniaToxicity).toBe(0);
    expect(derive(alkaline).ammoniaToxicity).toBeGreaterThan(0.1);
    expect(alkaline.alerts).toContain('ammonia_danger');
    expect(acid.alerts).not.toContain('ammonia_warning');
  });

  it('el índice de toxicidad va de 0 a 1', () => {
    expect(ammoniaToxicity(0, defaultConfig)).toBe(0);
    expect(ammoniaToxicity(defaultConfig.toxicity.nh3SafeMgL, defaultConfig)).toBe(0);
    expect(ammoniaToxicity(defaultConfig.toxicity.nh3LethalMgL, defaultConfig)).toBe(1);
    expect(ammoniaToxicity(99, defaultConfig)).toBe(1);
  });
});

describe('pH y KH', () => {
  it('más KH da más pH; más CO2 lo baja', () => {
    expect(phFromKhCo2(8, 3, defaultConfig)).toBeGreaterThan(phFromKhCo2(4, 3, defaultConfig));
    expect(phFromKhCo2(4, 3, defaultConfig)).toBeCloseTo(7.6, 1);
    expect(phFromKhCo2(4, 30, defaultConfig)).toBeCloseTo(6.6, 1);
    expect(phFromKhCo2(0, 3, defaultConfig)).toBeLessThan(6);
  });

  it('la nitrificación consume KH y baja el pH', () => {
    const start = matureTank(11);
    const after = step(start, 4 * WEEK).state;
    expect(after.water.kh).toBeLessThan(start.water.kh - 0.5);
    expect(after.water.ph).toBeLessThan(start.water.ph);
    expect(after.water.nitrate).toBeGreaterThan(start.water.nitrate);
  });

  it('sin cambios de agua el KH se agota, el pH se desploma y la nitrificación se frena', () => {
    let state = matureTank(11, 30);
    const events = [];
    for (let week = 0; week < 16; week++) {
      const result = step(state, WEEK);
      state = result.state;
      events.push(...result.events);
    }
    expect(state.water.kh).toBeLessThan(0.5);
    expect(state.water.ph).toBeLessThan(6.5);
    expect(state.water.ammonia).toBeGreaterThan(0.5);
    expect(events).toContainEqual(expect.objectContaining({ type: 'alert_raised', alert: 'kh_low' }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'alert_raised', alert: 'ph_low' }));

    // Un cambio de agua repone KH y la saca del pozo.
    const fixed = applyAction(state, { type: 'waterChange', fraction: 0.5, conditioned: true });
    expect(fixed.state.water.kh).toBeGreaterThan(2);
    expect(fixed.state.water.ph).toBeGreaterThan(7);
  });
});

describe('oxígeno', () => {
  it('el agua fría admite más oxígeno que la caliente', () => {
    expect(oxygenSaturation(20)).toBeCloseTo(9.1, 1);
    expect(oxygenSaturation(25)).toBeCloseTo(8.3, 1);
    expect(oxygenSaturation(30)).toBeLessThan(oxygenSaturation(25));
  });

  it('con el filtro andando se mantiene cerca de la saturación', () => {
    const state = matureTank();
    expect(derive(state).oxygenPercent).toBeGreaterThan(95);
  });

  it('la materia orgánica pudriéndose consume oxígeno, y peor con el filtro apagado', () => {
    const dirty = applyAction(matureTank(), { type: 'feed', grams: 20 }).state;
    const stopped = applyAction(dirty, { type: 'setFilterRunning', running: false }).state;

    let minRunning = Infinity;
    let minStopped = Infinity;
    let a = dirty;
    let b = stopped;
    for (let h = 0; h < 72; h++) {
      a = step(a, 60).state;
      b = step(b, 60).state;
      minRunning = Math.min(minRunning, a.water.oxygen);
      minStopped = Math.min(minStopped, b.water.oxygen);
    }
    expect(minRunning).toBeLessThan(oxygenSaturation(a.water.temperatureC) - 0.3);
    expect(minStopped).toBeLessThan(minRunning - 1.5);
    expect(minStopped).toBeLessThan(defaultConfig.alerts.oxygenLowMgL);
    expect(b.alerts).toContain('oxygen_low');
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
  const grow = (lightHours: number, nitrate: number): number => {
    let state = createNewTank({ seed: 4 });
    state = applyAction(state, { type: 'setLight', durationHours: lightHours }).state;
    state = { ...state, water: { ...state.water, nitrate }, algae: { biomassG: 0.05 } };
    return step(state, 4 * WEEK).state.algae.biomassG;
  };

  it('crecen con luz y nutrientes', () => {
    expect(grow(10, 10)).toBeGreaterThan(0.05 * 3);
    expect(grow(14, 10)).toBeGreaterThan(grow(8, 10));
    expect(grow(10, 10)).toBeGreaterThan(grow(10, 0.05));
  });

  it('sin luz no crecen', () => {
    expect(grow(0, 10)).toBeLessThan(0.05);
  });

  it('consumen nitrato y limpiarlas las saca', () => {
    let state = createNewTank({ seed: 4 });
    state = applyAction(state, { type: 'setLight', durationHours: 12 }).state;
    state = { ...state, water: { ...state.water, nitrate: 10 }, algae: { biomassG: 0.5 } };
    const after = step(state, 2 * WEEK).state;
    expect(after.water.nitrate).toBeLessThan(10);

    const scrubbed = applyAction(after, { type: 'scrubAlgae' });
    expect(scrubbed.state.algae.biomassG).toBeLessThan(after.algae.biomassG * 0.2);
    expect(scrubbed.events).toContainEqual(expect.objectContaining({ type: 'algae_scrubbed' }));
  });

  it('de día suben el oxígeno y el pH', () => {
    let state = createNewTank({ seed: 4 });
    state = { ...state, water: { ...state.water, nitrate: 10 }, algae: { biomassG: 1 } };
    // La pecera nueva arranca a las 8:00; la luz va de 10:00 a 18:00.
    const night = step(state, 60).state; // 9:00, todavía a oscuras
    const noon = step(state, 6 * 60).state; // 14:00, con luz
    expect(derive(night).lightOn).toBe(false);
    expect(derive(noon).lightOn).toBe(true);
    expect(noon.water.oxygen).toBeGreaterThan(night.water.oxygen);
    expect(noon.water.ph).toBeGreaterThan(night.water.ph);
  });
});
