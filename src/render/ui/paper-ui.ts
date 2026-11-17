/**
 * Sistema de UI "dentro del mundo": papel crema, tinta marrón, madera y un
 * acento turquesa, con el arte de marcos-ui.png (`npm run assets`).
 *
 * - `initUiArt()` pone las imágenes en variables CSS (las usa src/ui.css) y arma
 *   las reglas de los cursores.
 * - `showNote(texto)`: un papelito que aparece y se va solo; nunca bloquea.
 * - `confirmPaper(...)`: confirmación para acciones importantes, con dos
 *   botones de madera.
 * - `woodButton(...)`: botón de madera (normal y presionado).
 *
 * Todo con el píxel del arte a escala entera (2 px de CSS por píxel del dibujo).
 */

import { asset } from '../assets';
import { playClick, playPaper } from './ui-sound';

/** URL de un asset del manifest (ya versionada). */
export function artUrl(name: string, twice = false): string {
  const entry = asset(name) as (ReturnType<typeof asset> & { file2x?: string }) | undefined;
  if (!entry) return '';
  return `${import.meta.env.BASE_URL}${twice && entry.file2x ? entry.file2x : entry.file}`;
}

/** Estados del cursor (ver docs/ART-DIRECTION.md). */
export const CURSORS = {
  open: 'mano-abierta',
  point: 'mano-senalar',
  grab: 'mano-agarrar',
  pet: 'mano-acariciar',
  pinch: 'herramienta-pizca',
  sponge: 'herramienta-esponja',
  lens: 'herramienta-lupa',
  bucket: 'herramienta-balde',
  tap: 'herramienta-golpecito',
  wait: 'herramienta-reloj',
} as const;
export type CursorState = keyof typeof CURSORS;

/** Pone el arte de la UI en variables CSS y arma las reglas de los cursores. */
export function initUiArt(): void {
  const root = document.documentElement.style;
  const vars: Record<string, string> = {
    '--art-papel': 'ui-papel-cuerpo',
    '--art-papel-cinta': 'ui-papel-cinta',
    '--art-nota': 'ui-nota-cuerpo',
    '--art-nota-cinta': 'ui-nota-cinta',
    '--art-boton': 'ui-boton',
    '--art-boton-presionado': 'ui-boton-presionado',
    '--art-pestana-amarilla': 'ui-pestana-amarilla',
    '--art-pestana-rosa': 'ui-pestana-rosa',
    '--art-pestana-turquesa': 'ui-pestana-turquesa',
    '--art-bandeja': 'ui-bandeja',
  };
  for (const [key, name] of Object.entries(vars)) root.setProperty(key, `url("${artUrl(name)}")`);

  // Cursores: 1x de respaldo y image-set para pantallas densas (si el navegador
  // no entiende image-set, descarta esa línea y queda la primera).
  const rules: string[] = [];
  const cursorValue = (name: string): string[] => {
    const entry = asset(name) as (ReturnType<typeof asset> & { hotspot?: { x: number; y: number } }) | undefined;
    const h = entry?.hotspot ?? { x: 0, y: 0 };
    const one = artUrl(name);
    const two = artUrl(name, true);
    return [`cursor: url("${one}") ${h.x} ${h.y}, auto;`, `cursor: image-set(url("${one}") 1x, url("${two}") 2x) ${h.x} ${h.y}, auto;`];
  };
  rules.push(`body, body * { ${cursorValue(CURSORS.open).join(' ')} }`);
  rules.push(`button, a, select, input, [role="button"], .hud-note, .hud-drop { ${cursorValue(CURSORS.point).join(' ')} }`);
  for (const [state, name] of Object.entries(CURSORS)) {
    rules.push(`body[data-cursor="${state}"] #stage canvas { ${cursorValue(name).join(' ')} }`);
  }
  rules.push(`body.busy, body.busy * { ${cursorValue(CURSORS.wait).join(' ')} }`);
  const style = document.createElement('style');
  style.dataset.ui = 'cursors';
  style.textContent = rules.join('\n');
  document.head.append(style);
}

let notes: HTMLElement | null = null;

/** Un papelito que aparece, se queda unos segundos y se va solo. No bloquea nada. */
export function showNote(text: string, ms = 3400): void {
  if (!text) return;
  notes ??= Object.assign(document.createElement('div'), { className: 'paper-notes' });
  if (!notes.isConnected) {
    notes.setAttribute('role', 'status');
    notes.setAttribute('aria-live', 'polite');
    document.body.append(notes);
  }
  // Si ya está el mismo aviso, no se repite.
  for (const old of notes.children) if (old.textContent === text) old.remove();
  const note = document.createElement('div');
  note.className = 'paper-note';
  note.textContent = text;
  notes.append(note);
  while (notes.children.length > 3) notes.firstElementChild?.remove();
  playPaper();
  window.setTimeout(() => {
    note.classList.add('leaving');
    window.setTimeout(() => note.remove(), 320);
  }, ms);
}

/** Botón de madera (normal y presionado, con un click suave). */
export function woodButton(label: string, onClick: () => void, className = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `wood-btn ${className}`.trim();
  b.textContent = label;
  b.addEventListener('pointerdown', () => playClick());
  b.addEventListener('click', onClick);
  return b;
}

/**
 * Confirmación para acciones importantes: un papel con la pregunta y dos
 * botones de madera claros. Devuelve true si se aceptó.
 */
export function confirmPaper(text: string, yes: string, no: string): Promise<boolean> {
  return new Promise((resolve) => {
    const card = document.createElement('div');
    card.className = 'paper-confirm paper-panel';
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-label', text);
    const p = document.createElement('p');
    p.textContent = text;
    const done = (value: boolean): void => {
      card.classList.add('leaving');
      window.setTimeout(() => card.remove(), 250);
      resolve(value);
    };
    const row = document.createElement('div');
    row.className = 'paper-confirm-buttons';
    const cancel = woodButton(no, () => done(false));
    const accept = woodButton(yes, () => done(true), 'accent');
    row.append(cancel, accept);
    card.append(p, row);
    document.body.append(card);
    playPaper();
    accept.focus();
  });
}
