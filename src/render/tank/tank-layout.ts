/** Dónde y de qué tamaño se dibuja la pecera en la escena de 640x360. */

/** Línea del mueble sobre la que apoya la pecera. */
export const TANK_BASE_Y = 276;
const TANK_CENTER_X = 320;
const MAX_PX_PER_CM = 5;
const MAX_WIDTH = 420;
const MAX_HEIGHT = 200;

export interface TankRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Rectángulo en pantalla (posiciones enteras) según las medidas reales. */
export function tankRect(lengthCm: number, heightCm: number): TankRect {
  const scale = Math.min(MAX_PX_PER_CM, MAX_WIDTH / lengthCm, MAX_HEIGHT / heightCm);
  const width = Math.round((lengthCm * scale) / 2) * 2;
  const height = Math.round(heightCm * scale);
  return { x: TANK_CENTER_X - width / 2, y: TANK_BASE_Y - height, width, height };
}
