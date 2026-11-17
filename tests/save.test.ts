import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SAVE_FORMAT_VERSION,
  createSave,
  parseSave,
  type Migration,
} from '../src/save/save-format';
import { deleteSave, readBackup, readSave, writeRaw, writeSave } from '../src/save/storage';
import { applyAction, createNewTank, step } from '../src/sim';
import { DAY } from './helpers';

const sampleState = () => {
  let state = createNewTank({ seed: 'guardado', ammoniaMgNPerDay: 10 });
  state = applyAction(state, { type: 'addAnimals', speciesId: 'endler', count: 6 }).state;
  state = applyAction(state, { type: 'feed', grams: 1 }).state;
  return step(state, 3 * DAY).state;
};

describe('formato de guardado', () => {
  it.each(['code', 'flat', 'image'] as const)('conserva el aspecto %s sin reiniciar la partida', bettaStyle => {
    const save = createSave(createNewTank({seed: 42}), DEFAULT_SETTINGS, 1234, {tutorial: 4, journal: [], bettaStyle});
    expect(parseSave(JSON.parse(JSON.stringify(save)))).toEqual({status: 'ok', save, migratedFrom: null});
  });

  it('lleva versión de formato, lastTimestamp y la semilla del RNG', () => {
    const save = createSave(sampleState(), { ...DEFAULT_SETTINGS, speed: 60 }, 1234);
    expect(save.formatVersion).toBe(SAVE_FORMAT_VERSION);
    expect(save.lastTimestamp).toBe(1234);
    expect(save.sim.rngState).toBeTypeOf('number');
  });

  it('un guardado actual se lee tal cual', () => {
    const save = createSave(sampleState(), { ...DEFAULT_SETTINGS, speed: 60 }, 1234);
    const result = parseSave(JSON.parse(JSON.stringify(save)));
    expect(result).toEqual({ status: 'ok', save, migratedFrom: null });
  });

  it('migra en cadena los guardados de versiones anteriores', () => {
    const sim = sampleState();
    const migrations: Record<number, Migration> = {
      1: (save) => ({ ...save, settings: { speed: 5 } }),
      2: (save) => ({ ...save, lastTimestamp: 99 }),
    };
    const result = parseSave({ formatVersion: 1, lastTimestamp: 1, sim }, migrations, 3);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.migratedFrom).toBe(1);
    expect(result.save.formatVersion).toBe(3);
    expect(result.save.settings.speed).toBe(5);
    expect(result.save.lastTimestamp).toBe(99);
    expect(result.save.sim).toEqual(sim);
  });

  it('migra una partida v1 (sin animales ni gato) a la versión actual', () => {
    const { animals, nextAnimalId, food, cat, ...old } = createNewTank({ seed: 'vieja' });
    void animals, nextAnimalId, food, cat;
    const result = parseSave({ formatVersion: 1, lastTimestamp: 7, sim: old, settings: { speed: 1 } });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.migratedFrom).toBe(1);
    expect(result.save.sim.animals).toEqual([]);
    expect(result.save.sim.food).toEqual({ surfaceG: 0, sinkingG: 0 });
    expect(result.save.sim.cat.behavior).toBeTypeOf('string');
    expect(result.save.settings.outdoorC).toBe(DEFAULT_SETTINGS.outdoorC);
    // Y la simulación corre sin problemas desde la partida migrada.
    expect(step(result.save.sim, DAY).state.timeMinutes).toBe(old.timeMinutes + DAY);
  });

  it('rechaza un guardado de una versión más nueva sin romperlo', () => {
    const result = parseSave({ formatVersion: SAVE_FORMAT_VERSION + 1, sim: sampleState() });
    expect(result).toEqual({ status: 'too_new', formatVersion: SAVE_FORMAT_VERSION + 1 });
  });

  it('rechaza basura', () => {
    expect(parseSave(null).status).toBe('invalid');
    expect(parseSave('hola').status).toBe('invalid');
    expect(parseSave({ sim: sampleState() }).status).toBe('invalid');
    expect(parseSave({ formatVersion: 1 }).status).toBe('invalid');
    expect(parseSave({ formatVersion: 1, sim: sampleState() }, {}, 2).status).toBe('invalid');
  });
});

describe('guardado en IndexedDB', () => {
  beforeEach(async () => {
    await deleteSave();
  });

  it('sin partida guardada devuelve "empty"', async () => {
    expect(await readSave()).toEqual({ status: 'empty' });
  });

  it('guarda y vuelve a cargar exactamente el mismo estado', async () => {
    const sim = sampleState();
    await writeSave(createSave(sim, { ...DEFAULT_SETTINGS, speed: 1440 }, 5000));
    const result = await readSave();
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.save.sim).toEqual(sim);
    expect(result.save.settings.speed).toBe(1440);
    expect(result.save.formatVersion).toBe(SAVE_FORMAT_VERSION);

    // La simulación sigue igual desde lo cargado que desde el original.
    expect(step(result.save.sim, DAY)).toEqual(step(sim, DAY));
  });

  it('el último guardado pisa al anterior', async () => {
    const first = sampleState();
    const second = step(first, DAY).state;
    await writeSave(createSave(first, { ...DEFAULT_SETTINGS, speed: 1 }, 1));
    await writeSave(createSave(second, { ...DEFAULT_SETTINGS, speed: 1 }, 2));
    const result = await readSave();
    expect(result.status === 'ok' && result.save.sim.timeMinutes).toBe(second.timeMinutes);
  });

  it('una partida ilegible queda respaldada en vez de perderse', async () => {
    const future = { formatVersion: SAVE_FORMAT_VERSION + 5, sim: { algo: 'del futuro' } };
    await writeRaw(future);
    const result = await readSave();
    expect(result.status).toBe('too_new');
    expect(await readBackup()).toEqual(future);
  });
});
