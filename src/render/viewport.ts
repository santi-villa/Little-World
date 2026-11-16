/**
 * Escalado adaptable de la escena 1280x720, sin recortar ni deformar.
 * Se permite una escala fraccionaria para aprovechar toda la pantalla.
 * El filtrado nearest conserva los bordes pixelados del arte.
 */

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export interface ViewportLayout {
  /** Píxeles físicos por píxel del juego. */
  scale: number;
  /** Indica si el factor de escala resulta exactamente entero. */
  integer: boolean;
  cssWidth: number;
  cssHeight: number;
  cssLeft: number;
  cssTop: number;
}

export function computeLayout(
  viewportCssWidth: number,
  viewportCssHeight: number,
  devicePixelRatio: number,
  gameWidth = GAME_WIDTH,
  gameHeight = GAME_HEIGHT,
): ViewportLayout {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const deviceWidth = Math.round(viewportCssWidth * dpr);
  const deviceHeight = Math.round(viewportCssHeight * dpr);
  const fit = Math.min(deviceWidth / gameWidth, deviceHeight / gameHeight);

  // El escalado entero dejaba márgenes enormes en pantallas de alta densidad.
  // Usamos el máximo ajuste continuo manteniendo el aspecto 16:9.
  const scale = Math.max(fit, 0.01);
  const integer = Number.isInteger(scale);
  const width = gameWidth * scale;
  const height = gameHeight * scale;
  const left = Math.max(0, (deviceWidth - width) / 2);
  const top = Math.max(0, (deviceHeight - height) / 2);

  return {
    scale,
    integer,
    cssWidth: width / dpr,
    cssHeight: height / dpr,
    cssLeft: left / dpr,
    cssTop: top / dpr,
  };
}

/** Aplica el layout al canvas y lo mantiene al día cuando cambia la pantalla. */
export function attachViewport(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  onLayout?: (layout: ViewportLayout) => void,
): () => void {
  canvas.style.position = 'absolute';
  canvas.style.imageRendering = 'pixelated';

  const apply = (): void => {
    const layout = computeLayout(
      container.clientWidth,
      container.clientHeight,
      window.devicePixelRatio,
    );
    canvas.style.width = `${layout.cssWidth}px`;
    canvas.style.height = `${layout.cssHeight}px`;
    canvas.style.left = `${layout.cssLeft}px`;
    canvas.style.top = `${layout.cssTop}px`;
    canvas.dataset.scale = String(layout.scale);
    onLayout?.(layout);
  };

  apply();
  const observer = new ResizeObserver(apply);
  observer.observe(container);
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  return () => {
    observer.disconnect();
    window.removeEventListener('resize', apply);
    window.removeEventListener('orientationchange', apply);
  };
}
