import { describe, expect, it } from 'vitest';
import { applyAction, createNewTank, defaultConfig, step } from '../src/sim';
import { DAY, WEEK, matureTank, run, totalAob, totalNob } from './helpers';

describe('cambios de agua', () => {
  const mature = matureTank();

  it('un cambio del 30% baja el nitrato un 30%', () => {
    expect(mature.water.nitrate).toBeGreaterThan(1);
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

  it('repone KH y enfría el agua si no se templa', () => {
    const low = { ...mature, water: { ...mature.water, kh: 1 } };
    const cold = applyAction(low, { type: 'waterChange', fraction: 0.5, conditioned: true }).state;
    expect(cold.water.kh).toBeCloseTo(3, 9); // mitad de 1 + mitad de 5 (canilla)
    expect(cold.water.temperatureC).toBeLessThan(mature.water.temperatureC - 2);

    const tempered = applyAction(low, {
      type: 'waterChange',
      fraction: 0.5,
      conditioned: true,
      temperatureC: mature.water.temperatureC,
    }).state;
    expect(tempered.water.temperatureC).toBeCloseTo(mature.water.temperatureC, 9);
  });

  it('sifonear saca detrito', () => {
    const dirty = { ...mature, organics: { foodG: 0, detritusG: 10 } };
    const plain = applyAction(dirty, { type: 'waterChange', fraction: 0.3, conditioned: true });
    const vacuumed = applyAction(dirty, {
      type: 'waterChange',
      fraction: 0.3,
      conditioned: true,
      vacuum: true,
    });
    expect(plain.state.organics.detritusG).toBe(10);
    expect(vacuumed.state.organics.detritusG).toBeLessThan(5);
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
    expect(totalAob(afterRaw)).toBeLessThan(totalAob(afterConditioned) * 0.9);
    expect(totalNob(afterRaw)).toBeLessThan(totalNob(afterConditioned) * 0.9);
    expect(totalAob(afterRaw)).toBeLessThan(totalAob(mature) * 0.9);

    // El cloro se va solo con el tiempo.
    expect(afterRaw.water.chlorine).toBeLessThan(raw.state.water.chlorine * 0.2);
  });

  it('el acondicionador neutraliza el cloro que ya entró', () => {
    const raw = change(false).state;
    const fixed = applyAction(raw, { type: 'addConditioner' }).state;
    expect(fixed.water.chlorine).toBe(0);
    const later = step(fixed, DAY).state;
    expect(totalAob(later)).toBeGreaterThan(totalAob(mature) * 0.95);
  });

  it('muchos cambios grandes sin acondicionar terminan en picos', () => {
    let state = mature;
    let peakAmmonia = 0;
    for (let i = 0; i < 4; i++) {
      state = applyAction(state, { type: 'waterChange', fraction: 0.8, conditioned: false }).state;
      const result = run(state, DAY);
      state = result.state;
      peakAmmonia = Math.max(peakAmmonia, result.peakAmmonia);
    }
    const result = run(state, WEEK);
    peakAmmonia = Math.max(peakAmmonia, result.peakAmmonia);
    expect(totalAob(state)).toBeLessThan(totalAob(mature) * 0.5);
    expect(peakAmmonia).toBeGreaterThan(0.25);
  });
});

describe('evaporación y relleno', () => {
  it('el nivel baja, lo disuelto se concentra y rellenar lo repone', () => {
    let state = createNewTank({ seed: 2 });
    state = applyAction(state, { type: 'setLid', hasLid: false }).state;
    state = { ...state, water: { ...state.water, nitrate: 10 } };
    const after = step(state, 2 * WEEK).state;

    expect(after.tank.waterLiters).toBeLessThan(state.tank.waterLiters - 2);
    expect(after.water.nitrate).toBeGreaterThan(10);
    // El nitrato total (mg) no cambia por evaporar (las algas consumen un poquito).
    const before = 10 * state.tank.waterLiters;
    expect(after.water.nitrate * after.tank.waterLiters).toBeGreaterThan(before * 0.97);
    expect(after.water.nitrate * after.tank.waterLiters).toBeLessThanOrEqual(before * 1.0001);

    const refilled = applyAction(after, { type: 'topOff', conditioned: true });
    expect(refilled.state.tank.waterLiters).toBeCloseTo(state.tank.fullLiters, 9);
    expect(refilled.state.water.nitrate).toBeLessThan(after.water.nitrate);
  });

  it('con tapa se evapora mucho menos', () => {
    const lid = step(createNewTank({ seed: 2, hasLid: true }), WEEK).state;
    const open = step(createNewTank({ seed: 2, hasLid: false }), WEEK).state;
    const lostLid = lid.tank.fullLiters - lid.tank.waterLiters;
    const lostOpen = open.tank.fullLiters - open.tank.waterLiters;
    expect(lostLid).toBeGreaterThan(0);
    expect(lostOpen).toBeGreaterThan(lostLid * 2);
  });

  it('avisa cuando falta agua', () => {
    let state = createNewTank({ seed: 2, hasLid: false });
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
