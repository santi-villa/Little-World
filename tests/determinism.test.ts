import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Rng, applyAction, createNewTank, rngNext, seedToState, step } from '../src/sim';
import { DAY, HOUR, WEEK } from './helpers';

describe('RNG con semilla', () => {
  it('la misma semilla da la misma secuencia', () => {
    const a = Rng.fromSeed('little-world');
    const b = Rng.fromSeed('little-world');
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
    expect(a.state).toBe(b.state);
  });

  it('semillas distintas dan secuencias distintas', () => {
    const a = Rng.fromSeed(1);
    const b = Rng.fromSeed(2);
    const same = Array.from({ length: 100 }, () => a.next() === b.next()).filter(Boolean);
    expect(same.length).toBeLessThan(5);
  });

  it('los valores están en [0, 1) y bien repartidos', () => {
    const rng = Rng.fromSeed(123);
    let sum = 0;
    const buckets = new Array<number>(10).fill(0);
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
      buckets[Math.floor(v * 10)]!++;
    }
    expect(sum / n).toBeCloseTo(0.5, 1);
    for (const count of buckets) expect(count).toBeGreaterThan(n / 10 / 1.2);
  });

  it('se puede retomar desde el estado guardado', () => {
    const rng = Rng.fromSeed(9);
    for (let i = 0; i < 10; i++) rng.next();
    const resumed = new Rng(rng.state);
    expect(resumed.next()).toBe(rng.next());
  });

  it('rngNext es pura', () => {
    const state = seedToState(5);
    expect(rngNext(state)).toEqual(rngNext(state));
  });

  it('int y gaussian se comportan', () => {
    const rng = Rng.fromSeed(77);
    let sum = 0;
    let squares = 0;
    for (let i = 0; i < 20000; i++) {
      const roll = rng.int(1, 6);
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(6);
      const g = rng.gaussian();
      sum += g;
      squares += g * g;
    }
    expect(sum / 20000).toBeCloseTo(0, 1);
    expect(squares / 20000).toBeCloseTo(1, 1);
  });
});

describe('determinismo de step()', () => {
  const start = () => {
    let state = createNewTank({ seed: 'abc', ammoniaMgNPerDay: 15 });
    state = applyAction(state, { type: 'feed', grams: 1 }).state;
    return state;
  };

  it('el mismo estado, semilla y delta dan el mismo resultado', () => {
    for (const delta of [1, 37, HOUR, DAY, WEEK]) {
      const a = step(start(), delta);
      const b = step(start(), delta);
      expect(a.state).toEqual(b.state);
      expect(a.events).toEqual(b.events);
    }
  });

  it('no modifica el estado que recibe', () => {
    const state = start();
    const snapshot = JSON.stringify(state);
    step(state, WEEK);
    applyAction(state, { type: 'waterChange', fraction: 0.5, conditioned: false });
    applyAction(state, { type: 'cleanFilter', method: 'tapWater' });
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('guardar y cargar (JSON) en el medio no cambia el resultado', () => {
    const direct = step(step(start(), 3 * DAY).state, 4 * DAY);
    const saved = JSON.parse(JSON.stringify(step(start(), 3 * DAY).state));
    const resumed = step(saved, 4 * DAY);
    expect(resumed.state).toEqual(direct.state);
    expect(resumed.events).toEqual(direct.events);
  });

  it('otra semilla cambia el clima de la habitación, no la química de base', () => {
    const a = step(createNewTank({ seed: 1 }), WEEK).state;
    const b = step(createNewTank({ seed: 2 }), WEEK).state;
    expect(a.room.temperatureC).not.toBe(b.room.temperatureC);
    expect(a.rngState).not.toBe(b.rngState);
  });

  it('avanzar de a horas o de a días da prácticamente lo mismo', () => {
    let hourly = start();
    for (let h = 0; h < 24 * 7; h++) hourly = step(hourly, HOUR).state;
    let daily = start();
    for (let d = 0; d < 7; d++) daily = step(daily, DAY).state;
    expect(hourly.timeMinutes).toBe(daily.timeMinutes);
    expect(hourly.rngState).toBe(daily.rngState);
    expect(hourly.water.ammonia).toBeCloseTo(daily.water.ammonia, 6);
    expect(hourly.water.temperatureC).toBeCloseTo(daily.water.temperatureC, 6);
  });

  it('delta cero o negativo no hace nada', () => {
    const state = start();
    expect(step(state, 0).state).toEqual(state);
    expect(step(state, -5).state).toEqual(state);
  });
});

describe('pureza de src/sim', () => {
  it('no importa Pixi ni toca el DOM', () => {
    const dir = join(__dirname, '..', 'src', 'sim');
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const source = readFileSync(join(dir, file), 'utf8');
      const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]!);
      for (const target of imports) {
        // Solo se permite importar de la propia carpeta o de src/data.
        expect(target, `${file} importa ${target}`).toMatch(/^\.\/|^\.\.\/data\//);
      }
      expect(source, file).not.toMatch(/\b(document|window|navigator|localStorage|indexedDB)\b/);
      expect(source, file).not.toMatch(/Math\.random|Date\.now|new Date/);
    }
  });
});
