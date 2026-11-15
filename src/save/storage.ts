/** Guardado en IndexedDB, con idb-keyval. */

import { createStore, del, get, set } from 'idb-keyval';
import { parseSave, type ParseResult, type SaveFile } from './save-format';

const MAIN_KEY = 'main';
const BACKUP_KEY = 'backup';

let store: ReturnType<typeof createStore> | undefined;

function saves(): ReturnType<typeof createStore> {
  store ??= createStore('little-world', 'saves');
  return store;
}

export async function writeSave(save: SaveFile): Promise<void> {
  await set(MAIN_KEY, save, saves());
}

export type LoadResult = ParseResult | { status: 'empty' };

/**
 * Lee la partida guardada y la migra si es de una versión anterior.
 * Si no se puede usar (corrupta o de una versión más nueva), deja una copia
 * en 'backup' para no perderla cuando se guarde una partida nueva encima.
 */
export async function readSave(): Promise<LoadResult> {
  const raw: unknown = await get(MAIN_KEY, saves());
  if (raw === undefined) return { status: 'empty' };
  const result = parseSave(raw);
  if (result.status !== 'ok') await set(BACKUP_KEY, raw, saves());
  return result;
}

/** Para los tests y para recuperar a mano una partida ilegible. */
export async function readBackup(): Promise<unknown> {
  return get(BACKUP_KEY, saves());
}

/** Escribe un valor crudo, sin validar (lo usan los tests de migración). */
export async function writeRaw(value: unknown): Promise<void> {
  await set(MAIN_KEY, value, saves());
}

export async function deleteSave(): Promise<void> {
  await del(MAIN_KEY, saves());
}
