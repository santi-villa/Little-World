/**
 * Puente entre la escena y la UI de papel (HTML): la escena dibuja el mundo y
 * la interfaz vive en paper-ui.ts, hud-paper.ts y tool-tray.ts. Acá quedan los
 * avisos (que ahora son papelitos) y el espacio que ocupa la bandeja abajo.
 */

import { showNote } from './paper-ui';
import { texts } from './texts';

export type CareId = keyof typeof texts.scene.care;
export type UiMode = 'room' | 'tank' | 'cat' | 'window';

/**
 * Lo que tapan los controles de la pantalla, en píxeles del juego (1280x720).
 * main.ts lo actualiza con el alto real de la bandeja de herramientas.
 */
export const uiInsets = { top: 54, bottom: 110 };

/** Alto de la bandeja de herramientas, en píxeles del juego. */
export function careBarHeight(): number {
  return uiInsets.bottom;
}

export type UiHit = { kind: 'back' } | { kind: 'care'; id: CareId } | { kind: 'panel' };

export class SceneUi {
  /** Ya no hay paneles dibujados en el canvas: todo es papel en HTML. */
  readonly panelOpen = false;

  closePanel(): void {}

  /** Un aviso: un papelito que aparece y se va solo. */
  say(text: string): void {
    showNote(text);
  }

  /** Los botones son HTML: en el canvas no hay ninguno. */
  hit(_screenX: number, _screenY: number): UiHit | null {
    return null;
  }

  update(..._args: unknown[]): void {}
}
