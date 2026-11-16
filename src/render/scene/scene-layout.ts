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
 * dibujo (la grilla nativa de los videos). Va a 2, entero: cada píxel del gato
 * mide 2x2 de la escena (el fondo tiene ~4, o sea dos píxeles del gato por
 * cada uno del fondo) y hecho un bollito ocupa unos cuatro quintos de su almohadón.
 */
export const CAT_SCALE = 2;

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
/** Donde empiezan los paños: apenas debajo de la barra. */
export const CURTAIN_TOP = 41;

/**
 * Plantas colgantes y cortinas: dónde se agarran (el pivote, arriba al centro)
 * y a qué escala. Las imágenes vienen a la grilla del dibujo o a su tamaño
 * final, así que la escala es siempre entera (nunca se achican al dibujar: eso
 * saltea filas y hace rayas).
 */
export const HANGING = [
  // Colgando del techo a los lados de la ventana.
  { asset: 'colgante-macrame', x: 360, y: 0, scale: 2, phase: 0 },
  { asset: 'colgante-potus', x: 1044, y: 0, scale: 2, phase: 1.7 },
  // Sobre la biblioteca, cayendo por el costado.
  { asset: 'potus-1', x: 290, y: 104, scale: 2, phase: 3.1 },
  // Sobre el estante de la derecha.
  { asset: 'potus-2', x: 1196, y: 70, scale: 2, phase: 4.4 },
  // Enredadera colgando de la barra de la cortina.
  { asset: 'enredadera', x: 830, y: 32, scale: 2, phase: 2.3 },
] as const;

/**
 * Los dos paños de la cortina, colgados justo debajo de la barra (que se ve
 * entera) y a los costados: el borde de cada paño llega al borde del vidrio,
 * sin taparlo. `edge` es el borde de adentro del paño.
 */
export const CURTAINS = [
  { asset: 'cortina-izquierda', edge: 413, side: 'left', scale: 1, phase: 0.6 },
  { asset: 'cortina-derecha', edge: 909, side: 'right', scale: 1, phase: 2.9 },
] as const;

/** El pájaro se posa en el alféizar de afuera, en el vidrio de abajo a la izquierda. */
export const BIRD_PERCH = { x: 492, y: 383 };

/**
 * Vista previa para probar la escena desde el panel de debug: si `hour` no es
 * null, la habitación y la ventana se dibujan como a esa hora. Es solo visual:
 * no cambia la hora de la simulación.
 */
export const scenePreview: { hour: number | null } = { hour: null };
