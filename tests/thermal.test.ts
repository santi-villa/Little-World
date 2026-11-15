import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createNewTank,
  defaultConfig,
  heatLossWPerK,
  heaterMaxTemperatureC,
  step,
  type SimState,
} from '../src/sim';
import { DAY, HOUR, WEEK } from './helpers';

/** Avanza y devuelve la temperatura media, mínima y máxima del agua. */
function track(start: SimState, minutes: number) {
  let state = start;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let roomSum = 0;
  const hours = minutes / HOUR;
  for (let h = 0; h < hours; h++) {
    state = step(state, HOUR).state;
    min = Math.min(min, state.water.temperatureC);
    max = Math.max(max, state.water.temperatureC);
    sum += state.water.temperatureC;
    roomSum += state.room.temperatureC;
  }
  return { state, min, max, mean: sum / hours, roomMean: roomSum / hours };
}

describe('habitación', () => {
  it('oscila alrededor de su temperatura media con un ciclo diario', () => {
    const result = track(createNewTank({ seed: 3, roomBaseC: 21, heaterWatts: 0 }), 4 * WEEK);
    expect(result.roomMean).toBeGreaterThan(19);
    expect(result.roomMean).toBeLessThan(23);

    let state = createNewTank({ seed: 3, roomBaseC: 21 });
    let min = Infinity;
    let max = -Infinity;
    for (let h = 0; h < 24; h++) {
      state = step(state, HOUR).state;
      min = Math.min(min, state.room.temperatureC);
      max = Math.max(max, state.room.temperatureC);
    }
    expect(max - min).toBeGreaterThan(defaultConfig.room.dailyAmplitudeC);
  });
});

describe('agua', () => {
  it('sin calefactor termina a la temperatura de la habitación', () => {
    let state = createNewTank({ seed: 3, roomBaseC: 18 });
    state = applyAction(state, { type: 'setHeater', enabled: false }).state;
    const result = track(step(state, 3 * DAY).state, WEEK);
    // Un poco por debajo: la evaporación enfría.
    expect(result.mean).toBeLessThan(result.roomMean + 0.2);
    expect(result.mean).toBeGreaterThan(result.roomMean - 1.5);
    expect(result.state.heater.on).toBe(false);
  });

  it('el agua amortigua los cambios de la habitación (inercia térmica)', () => {
    let state = createNewTank({ seed: 3, roomBaseC: 25 });
    state = applyAction(state, { type: 'setHeater', enabled: false }).state;
    state = applyAction(state, { type: 'setRoomBase', baseC: 15 }).state;
    const oneHour = step(state, HOUR).state;
    const twoDays = step(state, 2 * DAY).state;
    expect(oneHour.water.temperatureC).toBeGreaterThan(23.5);
    expect(twoDays.water.temperatureC).toBeLessThan(17.5);
  });

  it('una pecera grande se enfría más despacio que una chica', () => {
    const cold = (lengthCm: number, widthCm: number, heightCm: number) => {
      let state = createNewTank({ seed: 3, lengthCm, widthCm, heightCm, roomBaseC: 12 });
      state = applyAction(state, { type: 'setHeater', enabled: false }).state;
      return step(state, 6 * HOUR).state.water.temperatureC;
    };
    expect(cold(120, 40, 50)).toBeGreaterThan(cold(30, 20, 20) + 2);
  });
});

describe('calefactor', () => {
  it('con potencia de sobra mantiene la temperatura elegida', () => {
    const start = createNewTank({ seed: 3, roomBaseC: 20, heaterWatts: 50, heaterSetpointC: 25 });
    const result = track(start, WEEK);
    expect(result.min).toBeGreaterThan(24.4);
    expect(result.max).toBeLessThan(25.6);
  });

  it('un calefactor chico para los litros no llega en una habitación fría', () => {
    // 10 W para 60 L (0,17 W/L) con la habitación a 14 °C.
    const weak = createNewTank({ seed: 3, roomBaseC: 14, heaterWatts: 10, heaterSetpointC: 25 });
    const result = track(step(weak, 3 * DAY).state, WEEK);
    expect(result.max).toBeLessThan(19);
    expect(result.state.heater.on).toBe(true); // prendido sin parar y no alcanza
    expect(result.state.alerts).toContain('temperature_low');
    expect(heaterMaxTemperatureC(result.state, defaultConfig)).toBeLessThan(25);

    // Con 100 W (1,7 W/L) sí llega.
    const strong = createNewTank({ seed: 3, roomBaseC: 14, heaterWatts: 100, heaterSetpointC: 25 });
    const ok = track(step(strong, 3 * DAY).state, WEEK);
    expect(ok.min).toBeGreaterThan(24.4);
  });

  it('lo que sostiene depende de la relación potencia/litros', () => {
    // Los mismos 50 W rinden menos en una pecera de 240 L que en una de 60 L.
    const gain = (lengthCm: number, widthCm: number, heightCm: number) => {
      const state = createNewTank({ seed: 3, lengthCm, widthCm, heightCm, heaterWatts: 50 });
      return 50 / heatLossWPerK(state, defaultConfig);
    };
    const small = gain(60, 30, 36);
    const large = gain(120, 40, 50);
    expect(small).toBeGreaterThan(8);
    expect(small).toBeLessThan(12);
    expect(large).toBeLessThan(small / 2);
  });

  it('el termostato corta cuando el agua está por encima de la temperatura elegida', () => {
    const hot = createNewTank({ seed: 3, roomBaseC: 30, heaterSetpointC: 25 });
    const result = track(hot, 3 * DAY);
    expect(result.state.heater.on).toBe(false);
    expect(result.state.water.temperatureC).toBeGreaterThan(27);
  });

  it('apagarlo lo deja apagado', () => {
    const state = applyAction(createNewTank({ seed: 3, roomBaseC: 15 }), {
      type: 'setHeater',
      enabled: false,
    }).state;
    const after = step(state, DAY).state;
    expect(after.heater.on).toBe(false);
    expect(after.water.temperatureC).toBeLessThan(20);
  });
});
