/**
 * Registro de sprites por id de especie (los ids de `species.json`).
 * Las especies que no están acá se dibujan con el placeholder de FishLayer.
 *
 * Para sumar una: crear `mi-especie.ts` con su `FishSprite` y agregar una línea.
 */

import { betta } from './betta';
import { neonTetra } from './neon';
import type { FishSprite } from './painter';

export { SpritePainter, type FishSprite, type SpritePose } from './painter';

export const FISH_SPRITES: Partial<Record<string, FishSprite>> = {
  betta,
  neon_tetra: neonTetra,
};
