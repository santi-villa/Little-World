/**
 * Fuente de píxeles de 3x5 dibujada con rectángulos. Así el texto de la
 * escena queda nítido a cualquier escala (el texto de Pixi viene suavizado).
 */

import type { Graphics } from 'pixi.js';

const GLYPHS: Record<string, string> = {
  A: '.#. #.# ### #.# #.#',
  B: '##. #.# ##. #.# ##.',
  C: '.## #.. #.. #.. .##',
  D: '##. #.# #.# #.# ##.',
  E: '### #.. ##. #.. ###',
  F: '### #.. ##. #.. #..',
  G: '.## #.. #.# #.# .##',
  H: '#.# #.# ### #.# #.#',
  I: '### .#. .#. .#. ###',
  J: '..# ..# ..# #.# .#.',
  K: '#.# #.# ##. #.# #.#',
  L: '#.. #.. #.. #.. ###',
  M: '#.# ### #.# #.# #.#',
  N: '##. #.# #.# #.# #.#',
  O: '.#. #.# #.# #.# .#.',
  P: '##. #.# ##. #.. #..',
  Q: '.#. #.# #.# .#. ..#',
  R: '##. #.# ##. #.# #.#',
  S: '.## #.. .#. ..# ##.',
  T: '### .#. .#. .#. .#.',
  U: '#.# #.# #.# #.# ###',
  V: '#.# #.# #.# #.# .#.',
  W: '#.# #.# #.# ### #.#',
  X: '#.# #.# .#. #.# #.#',
  Y: '#.# #.# .#. .#. .#.',
  Z: '### ..# .#. #.. ###',
  '0': '### #.# #.# #.# ###',
  '1': '.#. ##. .#. .#. ###',
  '2': '##. ..# .#. #.. ###',
  '3': '##. ..# .#. ..# ##.',
  '4': '#.# #.# ### ..# ..#',
  '5': '### #.. ##. ..# ##.',
  '6': '.## #.. ### #.# ###',
  '7': '### ..# .#. .#. .#.',
  '8': '### #.# ### #.# ###',
  '9': '### #.# ### ..# ##.',
  '.': '... ... ... ... .#.',
  ',': '... ... ... .#. #..',
  ':': '... .#. ... .#. ...',
  '-': '... ... ### ... ...',
  '%': '#.# ..# .#. #.. #.#',
  '/': '..# ..# .#. #.. #..',
  '°': '.#. #.# .#. ... ...',
  '!': '.#. .#. .#. ... .#.',
  ' ': '... ... ... ... ...',
};

export const GLYPH_WIDTH = 3;
export const GLYPH_HEIGHT = 5;

export function textWidth(text: string, scale = 1): number {
  return text.length === 0 ? 0 : (text.length * (GLYPH_WIDTH + 1) - 1) * scale;
}

/** Dibuja `text` en `graphics` con la esquina superior izquierda en (x, y). */
export function drawPixelText(
  graphics: Graphics,
  text: string,
  x: number,
  y: number,
  color: number,
  scale = 1,
): void {
  let cursor = x;
  for (const char of text.toUpperCase()) {
    const rows = (GLYPHS[char] ?? GLYPHS[' ']!).split(' ');
    for (let row = 0; row < GLYPH_HEIGHT; row++) {
      const line = rows[row]!;
      for (let col = 0; col < GLYPH_WIDTH; col++) {
        if (line[col] === '#') {
          graphics.rect(cursor + col * scale, y + row * scale, scale, scale);
        }
      }
    }
    cursor += (GLYPH_WIDTH + 1) * scale;
  }
  graphics.fill(color);
}
