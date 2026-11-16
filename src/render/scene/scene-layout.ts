/** Lugares fijos del dormitorio (escena de 1280x720, sobre el fondo dormitorio.png). */

/**
 * Lo dibujado por código (gato, peces, cielo, vapor, HUD) usa píxeles gordos de
 * 2x2 para acompañar el grano del arte.
 */
export const PX = 2;
/**
 * Escala de los sprites del gato. Sus cuadros miden 2 píxeles del PNG por
 * píxel del dibujo: a 1.35 cada píxel del gato mide 2.7 de la escena, lo mismo
 * que el píxel del fondo, y hecho un bollito ocupa unos dos tercios de su cama.
 */
export const CAT_SCALE = 1.35;

/** Altura a la que apoyan las patas en el piso (sobre la alfombra). */
export const GROUND_Y = 688;
/** Rango del piso por donde pasea el gato. */
export const FLOOR_X = { min: 330, max: 900 };

/** El hueco de la cama redonda del gato (donde apoya), sobre la alfombra. */
export const BED = { x: 852, y: 662 };
export const SUNBEAM = { x: 580, y: 694 };
export const BOWL = { x: 250, y: 694 };
/** El alféizar, entre la taza y el frasco. */
export const WINDOWSILL = { x: 520, y: 410 };

/** La pantalla del velador y la boca de la taza. */
export const LAMP = { x: 417, y: 346 };
export const MUG = { x: 471, y: 412 };
/** Tapa del escritorio: de dónde a dónde va y la línea donde apoya la pecera. */
export const DESK = { left: 340, right: 975, top: 432, front: 470 };

/**
 * Vista previa para probar la escena desde el panel de debug: si `hour` no es
 * null, la habitación y la ventana se dibujan como a esa hora. Es solo visual:
 * no cambia la hora de la simulación.
 */
export const scenePreview: { hour: number | null } = { hour: null };
