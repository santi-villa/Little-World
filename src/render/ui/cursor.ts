/**
 * Cursor de mano y herramientas.
 *
 * Con mouse: el cursor del sistema se reemplaza por el arte (reglas armadas en
 * paper-ui.ts) según `document.body.dataset.cursor`.
 * Con el dedo: no hay cursor; la herramienta activa aparece pegada al dedo
 * mientras se arrastra, y un toque largo muestra el nombre de lo que se toca
 * (el equivalente al hover).
 */

import { asset } from '../assets';
import { artUrl, CURSORS, showNote, type CursorState } from './paper-ui';

/** Píxeles de CSS por píxel del dibujo del cursor que sigue al dedo. */
const FOLLOW_SCALE = 2;
const LONG_PRESS_MS = 550;

export function setCursor(state: CursorState): void {
  if (document.body.dataset.cursor !== state) document.body.dataset.cursor = state;
}

let follower: HTMLImageElement | null = null;

/** La herramienta pegada al dedo (solo táctil). */
export function follow(state: CursorState | null, clientX: number, clientY: number): void {
  if (!state) {
    follower?.classList.remove('visible');
    return;
  }
  follower ??= Object.assign(document.createElement('img'), { className: 'touch-tool', alt: '' });
  if (!follower.isConnected) document.body.append(follower);
  const name = CURSORS[state];
  const url = artUrl(name, true);
  if (follower.dataset.state !== state) {
    follower.dataset.state = state;
    follower.src = url;
  }
  const hot = (asset(name) as { hotspot?: { x: number; y: number } } | undefined)?.hotspot ?? { x: 16, y: 16 };
  follower.style.transform = `translate(${Math.round(clientX - hot.x * FOLLOW_SCALE)}px, ${Math.round(clientY - hot.y * FOLLOW_SCALE)}px)`;
  follower.classList.add('visible');
}

/**
 * Toque largo: si el dedo se queda quieto, muestra el nombre de lo que hay
 * ahí. Devuelve una función para cancelarlo (al mover o soltar).
 */
export function longPress(describe: () => string | null, onFire: () => void): () => void {
  const timer = window.setTimeout(() => {
    const text = describe();
    if (text) {
      showNote(text, 2200);
      onFire();
    }
  }, LONG_PRESS_MS);
  return () => window.clearTimeout(timer);
}

/** Toque largo sobre cualquier botón con `data-tip` (también en táctil). */
export function enableTips(): void {
  let cancel: (() => void) | null = null;
  document.addEventListener('pointerdown', (event) => {
    const target = (event.target as Element | null)?.closest?.('[data-tip]') as HTMLElement | null;
    if (!target || event.pointerType === 'mouse') return;
    cancel = longPress(() => target.dataset.tip ?? null, () => undefined);
  });
  const stop = (): void => {
    cancel?.();
    cancel = null;
  };
  document.addEventListener('pointerup', stop);
  document.addEventListener('pointercancel', stop);
  document.addEventListener('pointermove', (event) => {
    if (Math.abs(event.movementX) + Math.abs(event.movementY) > 6) stop();
  });
}
