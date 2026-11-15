import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
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
  state = applyAction(state, { type: 'feed', grams: 1 }).state;
  return step(state, 3 * DAY).state;
};

describe('formato de guardado', () => {
  it('lleva versión de formato, lastTimestamp y la semilla del RNG', () => {
    const save = createSave(sampleState(), { speed: 60 }, 1234);
    expect(save.formatVersion).toBe(SAVE_FORMAT_VERSION);
    expect(save.lastTimestamp).toBe(1234);
    expect(save.sim.rngState).toBeTypeOf('number');
  });

  it('un guardado actual se lee tal cual', () => {
    const save = createSave(sampleState(), { speed: 60 }, 1234);
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
    await writeSave(createSave(sim, { speed: 1440 }, 5000));
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
    await writeSave(createSave(first, { speed: 1 }, 1));
    await writeSave(createSave(second, { speed: 1 }, 2));
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
