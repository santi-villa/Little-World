import defaultConfigJson from '../data/sim-config.json';

/** Todas las constantes de la simulación viven en src/data/sim-config.json. */
export type SimConfig = typeof defaultConfigJson;

export const defaultConfig: SimConfig = defaultConfigJson;
