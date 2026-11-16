/**
 * Escalado pixel perfect.
 *
 * La escena siempre se dibuja a 1280x720. El canvas se agranda un número
 * ENTERO de veces medido en píxeles físicos de la pantalla (no en píxeles
 * CSS), así cada píxel del juego ocupa exactamente NxN píxeles del celular
 * aunque el devicePixelRatio sea 2, 3 o 2,625.
 */

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export interface ViewportLayout {
  /** Píxeles físicos por píxel del juego. */
  scale: number;
  /** false solo si la pantalla es más chica que 1280x720 físicos. */
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

  const integer = fit >= 1;
  // Si no entra ni a 1x, se achica para que al menos se vea entera.
  const scale = integer ? Math.floor(fit) : Math.max(fit, 0.01);

  const width = Math.round(gameWidth * scale);
  const height = Math.round(gameHeight * scale);
  // Centrado, alineado a píxeles físicos enteros.
  const left = Math.max(0, Math.floor((deviceWidth - width) / 2));
  const top = Math.max(0, Math.floor((deviceHeight - height) / 2));

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
export function attachViewport(canvas: HTMLCanvasElement, container: HTMLElement): () => void {
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
