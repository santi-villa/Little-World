/**
 * Formato de guardado, con versión.
 *
 * Cada vez que cambie la forma de SimState (o de cualquier cosa guardada)
 * hay que subir SAVE_FORMAT_VERSION y agregar una migración que convierta
 * la versión anterior en la nueva. Así las partidas viejas siguen cargando.
 */

import { ALERT_IDS, INTENTS, CAT_BEHAVIORS, applyAction, createNewTank, createCat, defaultConfig, findSpecies, type SimState, type Weather } from '../sim';
import { createPlayer, type PlayerState } from '../player';

export const SAVE_FORMAT_VERSION = 3;

export interface GameSettings {
  /** Minutos simulados por segundo real (0 = pausa). */
  speed: number;
  /** Temperatura exterior fija, hasta que se conecte el clima real. */
  outdoorC: number;
  /** Clima fijo, hasta que se conecte el clima real. */
  weather: Weather;
}

export const DEFAULT_SETTINGS: GameSettings = {
  speed: 1 / 60,
  outdoorC: defaultConfig.outdoor.fixedC,
  weather: 'clear',
};

const WEATHERS: readonly Weather[] = ['clear', 'cloudy', 'rain', 'storm'];

export interface SaveFile {
  formatVersion: number;
  /** Momento real del guardado (ms desde 1970). Base del catch-up offline. */
  lastTimestamp: number;
  /** Estado de la simulación (incluye el estado del RNG). */
  sim: SimState;
  settings: GameSettings;
  player: PlayerState;
}

/** Una migración recibe el guardado en la versión N y lo devuelve en la N+1. */
export type Migration = (save: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[N] convierte de la versión N a la N+1. */
export const MIGRATIONS: Record<number, Migration> = {
  2: (save) => ({ ...save, player: createPlayer() }),
  // v1 -> v2: llegan los animales, la comida en el agua y el gato.
  1: (save) => {
    const sim = isRecord(save.sim) ? save.sim : {};
    const time = typeof sim.timeMinutes === 'number' ? sim.timeMinutes : 0;
    return {
      ...save,
      sim: {
        ...sim,
        animals: [],
        nextAnimalId: 1,
        food: { surfaceG: 0, sinkingG: 0 },
        cat: createCat(time),
      },
    };
  },
};

export type ParseResult =
  | { status: 'ok'; save: SaveFile; migratedFrom: number | null }
  | { status: 'invalid'; reason: string }
  | { status: 'too_new'; formatVersion: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Check every required nested field before the simulation can consume it. */
function matches(value: unknown, sample: unknown): boolean {
  if (typeof sample === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (sample === null) return value === null;
  if (isRecord(sample)) return isRecord(value) && Object.entries(sample).every(([k, v]) => matches(value[k], v));
  return typeof value === typeof sample;
}
const template = createNewTank();
const animalTemplate = applyAction(template, { type: 'addAnimals', speciesId: 'betta', count: 1 }).state.animals[0]!;
function validSim(value: unknown): value is SimState {
  if (!isRecord(value) || !Array.isArray(value.animals) || !Array.isArray(value.alerts)) return false;
  const { animals: _a, alerts: _b, ...required } = template;
  if (!matches(value, required)) return false;
  const sim = value as unknown as SimState;
  if (sim.timeMinutes < 0 || !Number.isInteger(sim.rngState) || sim.rngState < 0 || sim.rngState > 0xffffffff ||
    !Number.isInteger(sim.nextAnimalId) || sim.nextAnimalId < 1 ||
    sim.tank.fullLiters <= 0 || sim.tank.waterLiters <= 0 || sim.tank.waterLiters > sim.tank.fullLiters ||
    [sim.tank.lengthCm, sim.tank.widthCm, sim.tank.heightCm].some(n => n <= 0) ||
    !CAT_BEHAVIORS.includes(sim.cat.behavior) ||
    !['bed','sunbeam','tank_lid','tank_front','windowsill','bowl','floor','away'].includes(sim.cat.spot) ||
    !sim.alerts.every(id => ALERT_IDS.includes(id))) return false;
  const ids = new Set<number>();
  for (const animal of value.animals) {
    if (!isRecord(animal)) return false;
    const { name: _name, targetId: _target, ...fields } = animalTemplate;
    if (!matches(animal, fields) || !(animal.name === null || typeof animal.name === 'string') ||
      !(animal.targetId === null || (Number.isInteger(animal.targetId) && (animal.targetId as number) > 0)) ||
      !findSpecies(animal.speciesId as string) || !INTENTS.includes(animal.intent as never) ||
      !['male', 'female'].includes(animal.sex as string) ||
      !['happy','normal','stressed','sick'].includes(animal.mood as string) ||
      !Number.isInteger(animal.id) || (animal.id as number) < 1 || ids.has(animal.id as number) ||
      (animal.id as number) >= sim.nextAnimalId) return false;
    ids.add(animal.id as number);
  }
  return true;
}
function validPlayer(value: unknown): value is PlayerState {
  return isRecord(value) && (value.decorId === undefined || ['default','garden','stones'].includes(value.decorId as string)) && Number.isInteger(value.tutorial) && (value.tutorial as number) >= 0 &&
    (value.tutorial as number) <= 4 && Array.isArray(value.journal) && value.journal.length <= 100 &&
    value.journal.every(entry => isRecord(entry) && typeof entry.text === 'string' && entry.text.length <= 2000 &&
      typeof entry.timeMinutes === 'number' && Number.isFinite(entry.timeMinutes));
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

  if (!validSim(current.sim)) {
    return { status: 'invalid', reason: 'falta el estado de la simulación' };
  }
  if (current.player !== undefined && !validPlayer(current.player)) return { status: 'invalid', reason: 'progreso o diario inválido' };
  if (current.lastTimestamp !== undefined && (typeof current.lastTimestamp !== 'number' || !Number.isFinite(current.lastTimestamp) || current.lastTimestamp < 0)) return { status: 'invalid', reason: 'timestamp inválido' };
  const settings = isRecord(current.settings) ? current.settings : {};
  const save: SaveFile = {
    formatVersion: targetVersion,
    lastTimestamp: typeof current.lastTimestamp === 'number' ? current.lastTimestamp : 0,
    sim: current.sim as unknown as SimState,
    player: current.player as PlayerState ?? createPlayer(),
    settings: {
      speed: typeof settings.speed === 'number' && Number.isFinite(settings.speed) && settings.speed >= 0 ? settings.speed : DEFAULT_SETTINGS.speed,
      outdoorC:
        typeof settings.outdoorC === 'number' && Number.isFinite(settings.outdoorC) ? settings.outdoorC : DEFAULT_SETTINGS.outdoorC,
      weather: WEATHERS.includes(settings.weather as Weather)
        ? (settings.weather as Weather)
        : DEFAULT_SETTINGS.weather,
    },
  };
  return { status: 'ok', save, migratedFrom: version === targetVersion ? null : version };
}

export function createSave(sim: SimState, settings: GameSettings, lastTimestamp: number, player: PlayerState = createPlayer()): SaveFile {
  return { formatVersion: SAVE_FORMAT_VERSION, lastTimestamp, sim, settings, player };
}
