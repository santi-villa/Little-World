import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createNewTank,
  defaultConfig,
  heatLossWPerK,
  heaterMaxTemperatureC,
  roomTargetC,
  step,
  type SimState,
} from '../src/sim';
import { DAY, HOUR, WEEK, newTank, outdoorForRoom } from './helpers';

/** Avanza de a una hora y devuelve medias, mínima y máxima. */
function track(start: SimState, minutes: number) {
  let state = start;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let roomSum = 0;
  let outdoorSum = 0;
  let roomMin = Infinity;
  let roomMax = -Infinity;
  let outdoorMin = Infinity;
  let outdoorMax = -Infinity;
  const hours = minutes / HOUR;
  for (let h = 0; h < hours; h++) {
    state = step(state, HOUR).state;
    min = Math.min(min, state.water.temperatureC);
    max = Math.max(max, state.water.temperatureC);
    sum += state.water.temperatureC;
    roomSum += state.room.temperatureC;
    outdoorSum += state.room.outdoorC;
    roomMin = Math.min(roomMin, state.room.temperatureC);
    roomMax = Math.max(roomMax, state.room.temperatureC);
    outdoorMin = Math.min(outdoorMin, state.room.outdoorC);
    outdoorMax = Math.max(outdoorMax, state.room.outdoorC);
  }
  return {
    state,
    min,
    max,
    mean: sum / hours,
    roomMean: roomSum / hours,
    outdoorMean: outdoorSum / hours,
    roomSwing: roomMax - roomMin,
    outdoorSwing: outdoorMax - outdoorMin,
  };
}

describe('habitación', () => {
  const { comfortC } = defaultConfig.room;

  it('tiende a T_confort + k * (T_ext - T_confort), con k = 0,3 y la ventana cerrada', () => {
    expect(roomTargetC(comfortC, false, defaultConfig)).toBe(comfortC);
    expect(roomTargetC(comfortC - 20, false, defaultConfig)).toBeCloseTo(comfortC - 6, 9);
    expect(roomTargetC(comfortC + 10, false, defaultConfig)).toBeCloseTo(comfortC + 3, 9);

    const cold = track(newTank({ seed: 3, outdoorBaseC: 5 }), 4 * WEEK);
    expect(cold.outdoorMean).toBeGreaterThan(2);
    expect(cold.outdoorMean).toBeLessThan(8);
    expect(cold.roomMean).toBeCloseTo(roomTargetC(cold.outdoorMean, false, defaultConfig), 0);
  });

  it('con la ventana abierta sigue mucho más al exterior (k = 0,7)', () => {
    expect(roomTargetC(comfortC - 20, true, defaultConfig)).toBeCloseTo(comfortC - 14, 9);

    const start = newTank({ seed: 3, outdoorBaseC: 5 });
    const closed = track(start, WEEK);
    const open = track(applyAction(start, { type: 'setWindow', open: true }).state, WEEK);
    expect(open.roomMean).toBeLessThan(closed.roomMean - 4);
    expect(open.roomMean).toBeGreaterThan(open.outdoorMean);
  });

  it('la casa amortigua: la habitación varía menos que el exterior', () => {
    const result = track(newTank({ seed: 3 }), WEEK);
    expect(result.outdoorSwing).toBeGreaterThan(defaultConfig.outdoor.dailyAmplitudeC);
    expect(result.roomSwing).toBeLessThan(result.outdoorSwing * 0.5);
  });

  it('tiene inercia: no salta de golpe cuando cambia el exterior', () => {
    const start = newTank({ seed: 3, outdoorBaseC: 20 });
    const frozen = applyAction(start, { type: 'setOutdoorBase', baseC: -10 }).state;
    const soon = step(frozen, 10).state;
    const later = step(frozen, DAY).state;
    expect(soon.room.temperatureC).toBeGreaterThan(start.room.temperatureC - 1);
    expect(later.room.temperatureC).toBeLessThan(start.room.temperatureC - 6);
  });
});

describe('agua', () => {
  it('sin calefactor tiende a la temperatura de la habitación', () => {
    let state = newTank({ seed: 3, outdoorBaseC: outdoorForRoom(18) });
    state = applyAction(state, { type: 'setHeater', enabled: false }).state;
    const result = track(step(state, 3 * DAY).state, WEEK);
    // Un poco por debajo: la evaporación enfría.
    expect(result.mean).toBeLessThan(result.roomMean + 0.2);
    expect(result.mean).toBeGreaterThan(result.roomMean - 1.5);
    expect(result.state.heater.on).toBe(false);
  });

  it('tiene inercia térmica', () => {
    let state = newTank({ seed: 3, outdoorBaseC: outdoorForRoom(14) });
    state = applyAction(state, { type: 'setHeater', enabled: false }).state;
    const oneHour = step(state, HOUR).state;
    const threeDays = step(state, 3 * DAY).state;
    expect(oneHour.water.temperatureC).toBeGreaterThan(23.5);
    expect(threeDays.water.temperatureC).toBeLessThan(17);
  });

  it('una pecera grande se enfría más despacio que una chica', () => {
    const cold = (tankId: string) => {
      let state = createNewTank({ seed: 3, tankId, outdoorBaseC: outdoorForRoom(14) });
      state = applyAction(state, { type: 'setHeater', enabled: false }).state;
      return step(state, 6 * HOUR).state.water.temperatureC;
    };
    expect(cold('rect_180')).toBeGreaterThan(cold('cube_20') + 1.5);
  });
});

describe('calefactor', () => {
  it('con potencia de sobra mantiene la temperatura elegida', () => {
    const start = newTank({ seed: 3, heaterWatts: 50, heaterSetpointC: 25 });
    const result = track(start, WEEK);
    expect(result.min).toBeGreaterThan(24.4);
    expect(result.max).toBeLessThan(25.6);
  });

  it('el calefactor de cada pecera del catálogo alcanza en una casa normal', () => {
    for (const tankId of ['cube_20', 'cube_40', 'rect_65', 'rect_180']) {
      const result = track(step(createNewTank({ seed: 3, tankId }), DAY).state, 3 * DAY);
      expect(result.min, tankId).toBeGreaterThan(24.4);
      expect(result.max, tankId).toBeLessThan(25.6);
    }
  });

  it('con pocos watts para los litros no llega en una habitación fría', () => {
    // 10 W para 60 L (0,17 W/L) con la habitación a unos 14 °C.
    const outdoorBaseC = outdoorForRoom(14);
    const weak = newTank({ seed: 3, outdoorBaseC, heaterWatts: 10, heaterSetpointC: 25 });
    const result = track(step(weak, 3 * DAY).state, WEEK);
    expect(result.max).toBeLessThan(19);
    expect(result.state.heater.on).toBe(true); // prendido sin parar y no alcanza
    expect(heaterMaxTemperatureC(result.state, defaultConfig)).toBeLessThan(25);

    // Con 100 W (1,7 W/L) sí llega.
    const strong = newTank({ seed: 3, outdoorBaseC, heaterWatts: 100, heaterSetpointC: 25 });
    const ok = track(step(strong, 3 * DAY).state, WEEK);
    expect(ok.min).toBeGreaterThan(24.4);
  });

  it('lo que sostiene depende de la relación potencia/litros', () => {
    // Los mismos 50 W rinden mucho menos en la pecera de 180 L que en la de 65 L.
    const gain = (tankId: string) =>
      50 / heatLossWPerK(createNewTank({ seed: 3, tankId }), defaultConfig);
    expect(gain('rect_65')).toBeGreaterThan(8);
    expect(gain('rect_65')).toBeLessThan(12);
    expect(gain('rect_180')).toBeLessThan(gain('rect_65') / 2);
    expect(gain('cube_20')).toBeGreaterThan(gain('rect_65'));
  });

  it('el termostato corta cuando el agua está por encima de la temperatura elegida', () => {
    const hot = newTank({ seed: 3, outdoorBaseC: outdoorForRoom(30), heaterSetpointC: 25 });
    const result = track(hot, 3 * DAY);
    expect(result.state.heater.on).toBe(false);
    expect(result.state.water.temperatureC).toBeGreaterThan(27);
  });

  it('apagarlo lo deja apagado', () => {
    const state = applyAction(newTank({ seed: 3, outdoorBaseC: outdoorForRoom(15) }), {
      type: 'setHeater',
      enabled: false,
    }).state;
    const after = step(state, DAY).state;
    expect(after.heater.on).toBe(false);
    expect(after.water.temperatureC).toBeLessThan(21);
  });
});
