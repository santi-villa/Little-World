import { describe, expect, it } from 'vitest';
import { applyAction, defaultConfig, derive, step } from '../src/sim';
import { DAY, WEEK, matureTank, newTank, run, totalAob, totalNob } from './helpers';

describe('cambios de agua', () => {
  const mature = matureTank();

  it('un cambio del 30% baja el nitrato un 30%', () => {
    expect(mature.water.nitrate).toBeGreaterThan(5);
    const { state, events } = applyAction(mature, {
      type: 'waterChange',
      fraction: 0.3,
      conditioned: true,
    });
    expect(state.water.nitrate).toBeCloseTo(mature.water.nitrate * 0.7, 9);
    expect(state.tank.waterLiters).toBeCloseTo(mature.tank.waterLiters, 9);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'water_changed', fraction: 0.3, conditioned: true }),
    );
  });

  it('diluye en ese % amoníaco, nitrito, residuos y taninos', () => {
    const dirty = {
      ...mature,
      water: { ...mature.water, ammonia: 2, nitrite: 1, tannins: 0.8 },
      organics: { foodG: 1, detritusG: 10 },
    };
    const { state } = applyAction(dirty, { type: 'waterChange', fraction: 0.25, conditioned: true });
    expect(state.water.ammonia).toBeCloseTo(1.5, 9);
    expect(state.water.nitrite).toBeCloseTo(0.75, 9);
    expect(state.water.tannins).toBeCloseTo(0.6, 9);
    expect(state.organics.detritusG).toBeCloseTo(7.5, 9);
    expect(state.organics.foodG).toBeCloseTo(0.75, 9);
  });

  it('sifonear el fondo saca más suciedad', () => {
    const dirty = { ...mature, organics: { foodG: 0, detritusG: 10 } };
    const change = (vacuum: boolean) =>
      applyAction(dirty, { type: 'waterChange', fraction: 0.3, conditioned: true, vacuum }).state;
    expect(change(true).organics.detritusG).toBeLessThan(change(false).organics.detritusG * 0.7);
  });

  it('repone KH y enfría el agua si no se iguala la temperatura', () => {
    const low = { ...mature, water: { ...mature.water, kh: 1 } };
    const cold = applyAction(low, { type: 'waterChange', fraction: 0.5, conditioned: true }).state;
    expect(cold.water.kh).toBeCloseTo((1 + defaultConfig.tapWater.kh) / 2, 9);
    expect(cold.water.temperatureC).toBeLessThan(mature.water.temperatureC - 2);

    const tempered = applyAction(low, {
      type: 'waterChange',
      fraction: 0.5,
      conditioned: true,
      temperatureC: mature.water.temperatureC,
    }).state;
    expect(tempered.water.temperatureC).toBeCloseTo(mature.water.temperatureC, 9);
  });

  it('el agua de la canilla tiene pH ~7,4 y dureza moderada', () => {
    const tap = defaultConfig.tapWater;
    const full = applyAction(mature, { type: 'waterChange', fraction: 1, conditioned: true }).state;
    expect(full.water.ph).toBeCloseTo(7.4, 1);
    expect(full.water.kh).toBe(tap.kh);
    expect(full.water.gh).toBe(tap.gh);
  });
});

describe('cloro', () => {
  const mature = matureTank();
  const change = (conditioned: boolean) =>
    applyAction(mature, { type: 'waterChange', fraction: 0.5, conditioned });

  it('con acondicionador no entra cloro', () => {
    const { state, events } = change(true);
    expect(state.water.chlorine).toBe(0);
    expect(events.some((e) => e.type === 'alert_raised' && e.alert === 'chlorine_present')).toBe(
      false,
    );
  });

  it('sin acondicionador entra cloro y mueren bacterias', () => {
    const conditioned = change(true);
    const raw = change(false);

    // Entra el cloro de la canilla, diluido a la mitad.
    expect(raw.state.water.chlorine).toBeCloseTo(defaultConfig.tapWater.chlorine * 0.5, 9);
    expect(raw.events).toContainEqual(
      expect.objectContaining({ type: 'alert_raised', alert: 'chlorine_present' }),
    );

    const afterConditioned = step(conditioned.state, DAY).state;
    const afterRaw = step(raw.state, DAY).state;

    // Un día después murió una parte clara de las dos colonias.
    expect(totalAob(afterRaw)).toBeLessThan(totalAob(afterConditioned) * 0.8);
    expect(totalNob(afterRaw)).toBeLessThan(totalNob(afterConditioned) * 0.8);
    expect(totalAob(afterRaw)).toBeLessThan(totalAob(mature) * 0.8);
    expect(totalAob(afterConditioned)).toBeGreaterThan(totalAob(mature) * 0.95);

    // El cloro se va solo con el tiempo.
    expect(afterRaw.water.chlorine).toBeLessThan(raw.state.water.chlorine * 0.2);
  });

  it('cuanto más grande el cambio sin acondicionar, más bacterias mueren', () => {
    const after = (fraction: number) =>
      totalAob(
        step(applyAction(mature, { type: 'waterChange', fraction, conditioned: false }).state, 6 * 60)
          .state,
      );
    expect(after(0.9)).toBeLessThan(after(0.5));
    expect(after(0.5)).toBeLessThan(after(0.2));
  });

  it('el acondicionador neutraliza el cloro que ya entró', () => {
    const raw = change(false).state;
    const fixed = applyAction(raw, { type: 'addConditioner' }).state;
    expect(fixed.water.chlorine).toBe(0);
    const later = step(fixed, DAY).state;
    expect(totalAob(later)).toBeGreaterThan(totalAob(mature) * 0.95);
  });

  it('cambios grandes sin acondicionar terminan en picos', () => {
    let state = mature;
    let peakAmmonia = 0;
    let peakNitrite = 0;
    for (let i = 0; i < 3; i++) {
      state = applyAction(state, { type: 'waterChange', fraction: 0.8, conditioned: false }).state;
      const result = run(state, 2 * DAY);
      state = result.state;
      peakAmmonia = Math.max(peakAmmonia, result.peakAmmonia);
      peakNitrite = Math.max(peakNitrite, result.peakNitrite);
    }
    expect(peakAmmonia).toBeGreaterThan(0.25);
    expect(peakNitrite).toBeGreaterThan(0.25);
  });
});

describe('evaporación y relleno', () => {
  it('el nivel baja, los minerales se concentran y rellenar lo repone', () => {
    let state = newTank({ seed: 2, hasLid: false });
    state = applyAction(state, { type: 'setLight', durationHours: 0 }).state; // sin algas
    state = { ...state, water: { ...state.water, nitrate: 40 } };
    const after = step(state, 2 * WEEK).state;

    expect(after.tank.waterLiters).toBeLessThan(state.tank.waterLiters - 2);
    expect(derive(after).waterLevel).toBeLessThan(0.97);
    expect(after.water.nitrate).toBeGreaterThan(40);
    expect(after.water.gh).toBeGreaterThan(state.water.gh);
    // Evaporar no saca nada: la cantidad total de nitrato y de GH no cambia.
    expect(after.water.nitrate * after.tank.waterLiters).toBeCloseTo(40 * state.tank.waterLiters, 1);
    expect(after.water.gh * after.tank.waterLiters).toBeCloseTo(
      state.water.gh * state.tank.waterLiters,
      6,
    );

    const refilled = applyAction(after, { type: 'topOff', conditioned: true });
    expect(refilled.state.tank.waterLiters).toBeCloseTo(state.tank.fullLiters, 9);
    expect(refilled.state.water.nitrate).toBeLessThan(after.water.nitrate);
    expect(refilled.state.water.chlorine).toBe(0);
  });

  it('con tapa se evapora mucho menos, y con calor más', () => {
    const lost = (hasLid: boolean, setpointC: number) => {
      const end = step(newTank({ seed: 2, hasLid, heaterSetpointC: setpointC, heaterWatts: 200 }), WEEK)
        .state;
      return end.tank.fullLiters - end.tank.waterLiters;
    };
    expect(lost(true, 25)).toBeGreaterThan(0);
    expect(lost(false, 25)).toBeGreaterThan(lost(true, 25) * 2);
    expect(lost(false, 29)).toBeGreaterThan(lost(false, 23) * 1.2);
  });

  it('avisa cuando falta agua', () => {
    let state = newTank({ seed: 2, hasLid: false });
    const events = [];
    for (let week = 0; week < 8; week++) {
      const result = step(state, WEEK);
      state = result.state;
      events.push(...result.events);
    }
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'alert_raised', alert: 'water_low' }),
    );
    expect(state.alerts).toContain('water_low');
  });
});
