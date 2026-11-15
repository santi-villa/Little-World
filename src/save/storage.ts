/** Guardado en IndexedDB (sin dependencias). */

import { parseSave, type ParseResult, type SaveFile } from './save-format';

const DB_NAME = 'little-world';
/** Versión del esquema de IndexedDB (no confundir con la del formato de guardado). */
const DB_SCHEMA_VERSION = 1;
const STORE = 'saves';
const MAIN_KEY = 'main';
const BACKUP_KEY = 'backup';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_SCHEMA_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB bloqueada por otra pestaña'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error ?? new Error('Falló la transacción'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Transacción abortada'));
    });
  } finally {
    db.close();
  }
}

export async function writeSave(save: SaveFile): Promise<void> {
  await withStore('readwrite', (store) => store.put(save, MAIN_KEY));
}

export type LoadResult = ParseResult | { status: 'empty' };

/**
 * Lee la partida guardada y la migra si es de una versión anterior.
 * Si no se puede usar (corrupta o de una versión más nueva), deja una copia
 * en 'backup' para no perderla cuando se guarde una partida nueva encima.
 */
export async function readSave(): Promise<LoadResult> {
  const raw = await withStore<unknown>('readonly', (store) => store.get(MAIN_KEY));
  if (raw === undefined) return { status: 'empty' };
  const result = parseSave(raw);
  if (result.status !== 'ok') {
    await withStore('readwrite', (store) => store.put(raw, BACKUP_KEY));
  }
  return result;
}

export async function readBackup(): Promise<unknown> {
  return withStore<unknown>('readonly', (store) => store.get(BACKUP_KEY));
}

export async function deleteSave(): Promise<void> {
  await withStore('readwrite', (store) => store.delete(MAIN_KEY));
}
