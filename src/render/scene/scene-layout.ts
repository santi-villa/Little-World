/** Lugares fijos del dormitorio (escena de 640x360). */

export const FLOOR_Y = 304;
/** Altura a la que apoyan las patas en el piso. */
export const GROUND_Y = 344;

/** El vidrio de la ventana grande, detrás del escritorio. */
export const WINDOW = { x: 150, y: 26, width: 340, height: 192 };
export const BED = { x: 92, y: GROUND_Y };
export const SUNBEAM = { x: 478, y: GROUND_Y };
export const BOWL = { x: 566, y: GROUND_Y };
/** Margen del mueble a cada lado de la pecera (ahí se sienta el gato a mirar). */
export const FURNITURE_MARGIN = 56;

/** Borde de arriba de la tapa del escritorio (la pecera apoya 8 px más abajo, en el canto). */
export const DESK_TOP_Y = 268;
/** Dónde termina el escritorio contra el piso. */
export const DESK_FOOT_Y = 338;

/** Escritorio: ancho y borde izquierdo según la pecera que tiene encima. */
export function deskSpan(tankWidth: number): { x: number; width: number } {
  const width = Math.min(600, Math.max(380, tankWidth + FURNITURE_MARGIN * 2));
  return { x: Math.round((640 - width) / 2), width };
}

/**
 * Vista previa para probar la escena desde el panel de debug: si `hour` no es
 * null, la habitación y la ventana se dibujan como a esa hora. Es solo visual:
 * no cambia la hora de la simulación.
 */
export const scenePreview: { hour: number | null } = { hour: null };
