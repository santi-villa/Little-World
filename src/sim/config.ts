import defaultConfigJson from '../data/sim-config.json';
import tanksJson from '../data/tanks.json';

/** Todas las constantes de la simulación viven en src/data/sim-config.json. */
export type SimConfig = typeof defaultConfigJson;

export const defaultConfig: SimConfig = defaultConfigJson;

/** Modelo de pecera del catálogo (src/data/tanks.json). */
export type TankModel = (typeof tanksJson.tanks)[number];

export const TANK_MODELS: readonly TankModel[] = tanksJson.tanks;
export const DEFAULT_TANK_ID: string = tanksJson.defaultTankId;

export function getTankModel(id: string): TankModel {
  const model = TANK_MODELS.find((tank) => tank.id === id);
  if (!model) throw new Error(`No existe la pecera "${id}" en tanks.json`);
  return model;
}
