import { describe, expect, it } from 'vitest';
import {
  applyAction,
  catchUp,
  constantOutdoor,
  createNewTank,
  defaultConfig,
  formatDuration,
  outdoorAt,
  planCatchUp,
  roomTargetC,
  step,
  type SimEnvironment,
  type SimState,
} from '../src/sim';
import { DAY, HOUR, matureTank } from './helpers';

function community(seed: number | string = 'catch-up'): SimState {
  let state = applyAction(matureTank(seed), { type: 'setBioload', ammoniaMgNPerDay: 0 }).state;
  for (const [speciesId, count] of [
    ['neon_tetra', 10],
    ['corydoras_paleatus', 6],
    ['platy', 4],
    ['tiger_barb', 3],
    ['guppy', 4],
  ] as const) {
    state = applyAction(state, { type: 'addAnimals', speciesId, count }).state;
  }
  state = applyAction(state, { type: 'feed', grams: 0.2 }).state;
  return step(state, DAY).state;
}

describe('plan del catch-up', () => {
  it('pasos de 1 minuto hasta 7 días', () => {
    expect(planCatchUp(90, defaultConfig)).toMatchObject({ count: 90, minutes: 1, capped: false });
    expect(planCatchUp(7 * DAY, defaultConfig)).toMatchObject({
      count: 7 * DAY,
      minutes: 1,
      simulatedMinutes: 7 * DAY,
    });
  });

  it('pasos de 10 minutos de 7 a 30 días', () => {
    const plan = planCatchUp(20 * DAY, defaultConfig);
    expect(plan.minutes).toBe(10);
    expect(plan.count).toBe(2 * DAY);
    expect(plan.capped).toBe(false);
    expect(planCatchUp(30 * DAY, defaultConfig).capped).toBe(false);
  });

  it('tope de 30 días', () => {
    const plan = planCatchUp(100 * DAY, defaultConfig);
    expect(plan.simulatedMinutes).toBe(30 * DAY);
    expect(plan.capped).toBe(true);
    expect(plan.count * plan.minutes).toBeCloseTo(30 * DAY, 6);
  });

  it('aguanta relojes raros: tiempo negativo o inválido no simula nada', () => {
    for (const elapsed of [0, -500, Number.NaN]) {
      expect(planCatchUp(elapsed, defaultConfig)).toMatchObject({ count: 0, simulatedMinutes: 0 });
    }
    const state = community();
    const result = catchUp(state, -500);
    expect(result.state).toEqual(state);
    expect(result.events).toEqual([]);
  });
});

describe('catch-up offline', () => {
  it('es determinista: la misma ausencia da siempre el mismo resultado', () => {
    const state = community();
    const a = catchUp(state, 5 * DAY + 137);
    const b = catchUp(JSON.parse(JSON.stringify(state)) as SimState, 5 * DAY + 137);
    expect(a.state).toEqual(b.state);
    expect(a.events).toEqual(b.events);
    expect(a.summary).toEqual(b.summary);
    // Y pasaron cosas de verdad (decisiones con RNG de por medio).
    expect(a.state.rngState).not.toBe(state.rngState);
    expect(a.state.animals.some((animal, i) => animal.hunger > state.animals[i]!.hunger)).toBe(true);
  });

  it('también con pasos de 10 minutos y con otra semilla cambia', () => {
    const state = community();
    expect(catchUp(state, 12 * DAY).state).toEqual(catchUp(state, 12 * DAY).state);
    const other = catchUp(community('otra'), 5 * DAY).state;
    expect(other.animals.map((a) => a.intent + a.stress)).not.toEqual(
      catchUp(state, 5 * DAY).state.animals.map((a) => a.intent + a.stress),
    );
  });

  it('no toca el estado de entrada y avanza el reloj lo que pasó', () => {
    const state = community();
    const snapshot = JSON.stringify(state);
    const result = catchUp(state, 2 * DAY);
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(result.state.timeMinutes).toBe(state.timeMinutes + 2 * DAY);
    expect(result.elapsedMinutes).toBe(2 * DAY);
  });

  it('más de 30 días: simula 30 y lo avisa', () => {
    const state = community();
    const result = catchUp(state, 45 * DAY);
    expect(result.state.timeMinutes).toBe(state.timeMinutes + 30 * DAY);
    expect(result.summary.capped).toBe(true);
    expect(result.summary.lines.some((l) => /más de 30 días/.test(l.text))).toBe(true);
  });

  it('es rápido: 7 días con una pecera poblada, muy por debajo de 1 segundo', () => {
    const state = community();
    catchUp(state, DAY); // calentar el JIT
    const times: number[] = [];
    for (let i = 0; i < 3; i++) {
      const start = Date.now();
      const result = catchUp(state, 7 * DAY);
      times.push(Date.now() - start);
      expect(result.plan.count).toBe(7 * DAY);
    }
    // En una PC tarda ~0,1 s; el margen deja lugar para un celular varias veces más lento.
    expect(Math.min(...times)).toBeLessThan(400);
  });
});

describe('temperatura exterior horaria', () => {
  it('la serie se interpola entre horas y se sostiene en los extremos', () => {
    const series = { startTimeMinutes: 600, hourlyC: [10, 20, 14] };
    expect(outdoorAt(series, 0)).toBe(10);
    expect(outdoorAt(series, 600)).toBe(10);
    expect(outdoorAt(series, 630)).toBe(15);
    expect(outdoorAt(series, 660)).toBe(20);
    expect(outdoorAt(series, 690)).toBe(17);
    expect(outdoorAt(series, 5000)).toBe(14);
  });

  it('con un valor fijo, la habitación tiende a lo que le corresponde', () => {
    const state = createNewTank({ seed: 3 });
    const env: SimEnvironment = { outdoor: constantOutdoor(5) };
    const result = catchUp(state, 3 * DAY, defaultConfig, env).state;
    expect(result.room.outdoorC).toBe(5);
    expect(result.room.temperatureC).toBeCloseTo(roomTargetC(5, false, defaultConfig), 3);
    // Sin serie, el exterior sigue siendo el sintético (con su ciclo diario).
    expect(catchUp(state, 3 * DAY).state.room.outdoorC).not.toBe(5);
  });

  it('el frío que hizo durante la ausencia enfría la pecera sin calefactor', () => {
    const state = applyAction(createNewTank({ seed: 3 }), { type: 'setHeater', enabled: false }).state;
    const hours = 72;
    const mild: SimEnvironment = {
      outdoor: { startTimeMinutes: state.timeMinutes, hourlyC: new Array<number>(hours + 1).fill(22) },
    };
    // Una ola de frío en el medio de la ausencia.
    const coldSnap: SimEnvironment = {
      outdoor: {
        startTimeMinutes: state.timeMinutes,
        hourlyC: Array.from({ length: hours + 1 }, (_, h) => (h > 24 ? 0 : 22)),
      },
    };
    const warm = catchUp(state, hours * HOUR, defaultConfig, mild).state;
    const cold = catchUp(state, hours * HOUR, defaultConfig, coldSnap).state;
    expect(cold.water.temperatureC).toBeLessThan(warm.water.temperatureC - 4);
  });

  it('la serie no gasta el RNG del clima sintético y sigue siendo determinista', () => {
    const state = community();
    const env: SimEnvironment = { outdoor: constantOutdoor(18) };
    expect(catchUp(state, 2 * DAY, defaultConfig, env).state).toEqual(
      catchUp(state, 2 * DAY, defaultConfig, env).state,
    );
  });
});

describe('resumen de bienvenida', () => {
  it('dice cuánto tiempo pasó', () => {
    expect(formatDuration(40)).toBe('40 minutos');
    expect(formatDuration(60)).toBe('1 hora');
    expect(formatDuration(90)).toBe('1 hora y 30 minutos');
    expect(formatDuration(5 * HOUR + 20)).toBe('5 horas');
    expect(formatDuration(DAY)).toBe('1 día');
    expect(formatDuration(3 * DAY + 4 * HOUR)).toBe('3 días y 4 horas');
    const summary = catchUp(community(), 3 * DAY + 4 * HOUR).summary;
    expect(summary.lines[0]!.text).toBe('Estuviste afuera 3 días y 4 horas.');
  });

  it('sale de los eventos de la ausencia: hambre, gato, alertas', () => {
    const result = catchUp(community(), 4 * DAY);
    const text = result.summary.lines.map((l) => l.text).join('\n');
    expect(text).toMatch(/tienen hambre|muy hambrientos/);
    // El gato es decorativo: no introduce tareas ni eventos durante la ausencia.
    expect(result.state.cat.behavior).toBe('sleep');
    expect(result.events.some(e => e.type === 'cat_behavior')).toBe(false);
    expect(text).not.toMatch(/gato tiene hambre/);
    // Cada alerta que se levantó y sigue activa aparece.
    for (const alert of result.state.alerts) {
      if (result.events.some((e) => e.type === 'alert_raised' && e.alert === alert)) {
        expect(text).toMatch(/Atención/);
      }
    }
  });

  it('las muertes aparecen, agrupadas si son muchas', () => {
    const result = catchUp(community(), 30 * DAY);
    const deaths = result.events.filter((e) => e.type === 'animal_died').length;
    expect(deaths).toBeGreaterThan(3);
    const text = result.summary.lines.map((l) => l.text).join('\n');
    expect(text).toMatch(/Murieron \d+ animales \(hambre\)/);
    expect(text).toMatch(/muertos sin retirar/);
    expect(result.summary.lines.length).toBeLessThan(20);
  });

  it('una pecera vacía y una ausencia corta: todo tranquilo', () => {
    const state = applyAction(createNewTank({ seed: 9, seededMedia: true }), {
      type: 'fillCatBowl',
    }).state;
    const summary = catchUp(state, 45).summary;
    expect(summary.lines.map((l) => l.text)).toEqual([
      'Estuviste afuera 45 minutos.',
      'Todo siguió tranquilo.',
    ]);
  });
});
