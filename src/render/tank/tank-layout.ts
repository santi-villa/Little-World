/** Dónde y de qué tamaño se dibuja la pecera en la escena de 1280x720. */

/** Línea del escritorio sobre la que apoya la base de la pecera. */
export const TANK_BASE_Y = 470;
/** Centro de la parte libre del escritorio (a la derecha de la lámpara y la taza). */
const TANK_CENTER_X = 790;
const MAX_PX_PER_CM = 6.75;
const MAX_WIDTH = 372;
/** Con este alto el arte del vidrio queda a escala 1 (sin deformar). */
const MAX_HEIGHT = 202;

export interface TankRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Tamaño en pantalla del interior (números pares) según las medidas reales. */
export function tankSize(lengthCm: number, heightCm: number): { width: number; height: number } {
  const scale = Math.min(MAX_PX_PER_CM, MAX_WIDTH / lengthCm, MAX_HEIGHT / heightCm);
  return {
    width: Math.round((lengthCm * scale) / 2) * 2,
    height: Math.round((heightCm * scale) / 2) * 2,
  };
}

/**
 * Rectángulo del interior de la pecera (de vidrio a vidrio, sin tapa ni base).
 * @param baseMargin Alto de la base del marco, que queda entre el interior y el escritorio.
 */
export function tankRect(lengthCm: number, heightCm: number, baseMargin = 0): TankRect {
  const { width, height } = tankSize(lengthCm, heightCm);
  const bottom = TANK_BASE_Y - Math.round(baseMargin / 2) * 2;
  return { x: Math.round((TANK_CENTER_X - width / 2) / 2) * 2, y: bottom - height, width, height };
}
