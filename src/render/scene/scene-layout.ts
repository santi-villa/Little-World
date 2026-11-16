/**
 * Lugares fijos del dormitorio, en píxeles de la escena de 1280x720, medidos
 * sobre el fondo `dormitorio.png` (sale de dormitorio-sin-plantas.jpg).
 */

/**
 * Lo dibujado por código en la habitación (cielo, vapor, letras) usa píxeles de
 * 2x2: nunca más gordos que el píxel del fondo (~4).
 */
export const PX = 2;

/**
 * Escala del gato: sus animaciones vienen con 1 píxel de PNG por píxel del
 * dibujo. A 3, cada píxel del gato mide 3 de la escena (el fondo tiene ~4) y
 * hecho un bollito ocupa unos dos tercios de su almohadón.
 */
export const CAT_SCALE = 3;

/** Altura a la que apoyan las patas en el piso (sobre la alfombra). */
export const GROUND_Y = 702;
/** Rango del piso por donde pasea el gato. */
export const FLOOR_X = { min: 300, max: 740 };

/** El hueco del almohadón redondo del gato (donde apoya), sobre la alfombra. */
export const BED = { x: 872, y: 686 };
export const SUNBEAM = { x: 560, y: 704 };
/** El plato del gato, en el piso al lado de la biblioteca. */
export const BOWL = { x: 300, y: 704 };
/** Sobre el escritorio, entre la taza y el frasco (contra la ventana). */
export const WINDOWSILL = { x: 524, y: 432 };

/** La pantalla del velador y la boca de la taza. */
export const LAMP = { x: 415, y: 349 };
export const MUG = { x: 471, y: 414 };
/** Tapa del escritorio: de dónde a dónde va y la línea del frente. */
export const DESK = { left: 330, right: 984, top: 433, front: 469 };

/** La barra de la cortina (de punta a punta) y su altura. */
export const CURTAIN_ROD = { left: 347, right: 977, y: 34 };

/**
 * Plantas colgantes y cortinas: dónde se agarran (el pivote, arriba al centro)
 * y a qué escala. La escala deja el píxel del dibujo más chico que el del fondo.
 */
export const HANGING = [
  // Colgando del techo a los lados de la ventana.
  { asset: 'colgante-macrame', x: 368, y: 0, scale: 0.6, phase: 0 },
  { asset: 'colgante-potus', x: 1012, y: 0, scale: 0.62, phase: 1.7 },
  // Sobre la biblioteca, cayendo por el costado.
  { asset: 'potus-1', x: 302, y: 105, scale: 0.62, phase: 3.1 },
  // Sobre el estante de la derecha.
  { asset: 'potus-2', x: 1196, y: 72, scale: 0.62, phase: 4.4 },
  // Enredadera colgando de la barra de la cortina.
  { asset: 'enredadera', x: 830, y: 30, scale: 0.8, phase: 2.3 },
] as const;

/** Los dos paños de la cortina, colgados de la barra (arriba de la lámpara). */
export const CURTAINS = [
  { asset: 'cortina-izquierda', side: 'left', scale: 0.78, phase: 0.6 },
  { asset: 'cortina-derecha', side: 'right', scale: 0.78, phase: 2.9 },
] as const;

/** El pájaro se posa en el alféizar de afuera, en el vidrio de abajo a la izquierda. */
export const BIRD_PERCH = { x: 492, y: 383 };

/**
 * Vista previa para probar la escena desde el panel de debug: si `hour` no es
 * null, la habitación y la ventana se dibujan como a esa hora. Es solo visual:
 * no cambia la hora de la simulación.
 */
export const scenePreview: { hour: number | null } = { hour: null };
