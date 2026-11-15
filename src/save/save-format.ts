/**
 * Formato de guardado, con versión.
 *
 * Cada vez que cambie la forma de SimState (o de cualquier cosa guardada)
 * hay que subir SAVE_FORMAT_VERSION y agregar una migración que convierta
 * la versión anterior en la nueva. Así las partidas viejas siguen cargando.
 */

import type { SimState } from '../sim';

export const SAVE_FORMAT_VERSION = 1;

export interface GameSettings {
  /** Minutos simulados por segundo real (0 = pausa). */
  speed: number;
}

export interface SaveFile {
  formatVersion: number;
  /** Momento real del guardado (ms desde 1970). Base del catch-up offline. */
  lastTimestamp: number;
  /** Estado de la simulación (incluye el estado del RNG). */
  sim: SimState;
  settings: GameSettings;
}

/** Una migración recibe el guardado en la versión N y lo devuelve en la N+1. */
export type Migration = (save: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[N] convierte de la versión N a la N+1. */
export const MIGRATIONS: Record<number, Migration> = {
  // Ejemplo para el día que haga falta:
  // 1: (save) => ({ ...save, sim: { ...(save.sim as object), peces: [] } }),
};

export type ParseResult =
  | { status: 'ok'; save: SaveFile; migratedFrom: number | null }
  | { status: 'invalid'; reason: string }
  | { status: 'too_new'; formatVersion: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Valida un guardado crudo y lo lleva a la versión actual. */
export function parseSave(
  raw: unknown,
  migrations: Record<number, Migration> = MIGRATIONS,
  targetVersion: number = SAVE_FORMAT_VERSION,
): ParseResult {
  if (!isRecord(raw)) return { status: 'invalid', reason: 'no es un objeto' };
  const version = raw.formatVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { status: 'invalid', reason: 'falta formatVersion' };
  }
  if (version > targetVersion) return { status: 'too_new', formatVersion: version };

  let current = raw;
  for (let v = version; v < targetVersion; v++) {
    const migrate = migrations[v];
    if (!migrate) return { status: 'invalid', reason: `falta la migración ${v} -> ${v + 1}` };
    current = { ...migrate(current), formatVersion: v + 1 };
  }

  if (!isRecord(current.sim) || typeof current.sim.timeMinutes !== 'number') {
    return { status: 'invalid', reason: 'falta el estado de la simulación' };
  }
  const settings = isRecord(current.settings) ? current.settings : {};
  const save: SaveFile = {
    formatVersion: targetVersion,
    lastTimestamp: typeof current.lastTimestamp === 'number' ? current.lastTimestamp : 0,
    sim: current.sim as unknown as SimState,
    settings: { speed: typeof settings.speed === 'number' ? settings.speed : 1 / 60 },
  };
  return { status: 'ok', save, migratedFrom: version === targetVersion ? null : version };
}

export function createSave(sim: SimState, settings: GameSettings, lastTimestamp: number): SaveFile {
  return { formatVersion: SAVE_FORMAT_VERSION, lastTimestamp, sim, settings };
}
