/**
 * Dónde y de qué tamaño se dibuja la pecera en la escena de 1280x720.
 *
 * El vidrio es una imagen y nunca se estira: se escala parejo, manteniendo su
 * proporción. Su ancho sale del largo real de la pecera, con la rectangular
 * mediana (60 cm) ocupando justo la parte libre del escritorio.
 */

/** Línea del escritorio sobre la que apoya la base de la pecera. */
export const TANK_BASE_Y = 466;
/** Parte libre del escritorio: a la derecha del frasco hasta el borde. */
const DESK_FREE = { left: 588, right: 976 };
/** Largo de la pecera que llena la parte libre del escritorio. */
const REFERENCE_LENGTH_CM = 60;
/** Ni más chica que esto, para que se pueda mirar. */
const MIN_WIDTH = 220;
/** Ni más ancha que el escritorio entero. */
const MAX_WIDTH = 620;
const DESK_RIGHT = 978;

export interface TankRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TankFrame {
  /** La imagen del vidrio entera (tapa y base incluidas). */
  outer: TankRect;
  /** El hueco del vidrio, donde va el agua. */
  inner: TankRect;
  /** Escala de la imagen del vidrio (la misma a lo ancho y a lo alto). */
  scale: number;
}

/**
 * @param glass Medidas de la imagen del vidrio y de su hueco.
 */
export function tankFrame(
  lengthCm: number,
  glass: { width: number; height: number; inner: TankRect },
): TankFrame {
  const free = DESK_FREE.right - DESK_FREE.left;
  const wanted = (free * lengthCm) / REFERENCE_LENGTH_CM;
  const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, wanted));
  const scale = width / glass.width;
  const w = Math.round(glass.width * scale);
  const h = Math.round(glass.height * scale);
  // Centrada en la parte libre; si es más ancha, crece hacia la izquierda.
  let x = Math.round((DESK_FREE.left + DESK_FREE.right) / 2 - w / 2);
  x = Math.min(x, DESK_RIGHT - w);
  const outer = { x, y: TANK_BASE_Y - h, width: w, height: h };
  const inner = {
    x: x + Math.round(glass.inner.x * scale),
    y: outer.y + Math.round(glass.inner.y * scale),
    width: Math.round(glass.inner.width * scale),
    height: Math.round(glass.inner.height * scale),
  };
  return { outer, inner, scale };
}
