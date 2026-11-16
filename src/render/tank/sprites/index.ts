/**
 * Registro de sprites por id de especie (los ids de `species.json`).
 * Las especies que no están acá se dibujan con el placeholder de FishLayer.
 *
 * Para sumar una: crear `mi-especie.ts` con su `FishSprite` y agregar una línea.
 */

import { betta } from './betta';
import { cherryShrimp } from './cherry-shrimp';
import { corydoras } from './corydoras';
import { guppy } from './guppy';
import { neonTetra } from './neon';
import type { FishSprite } from './painter';

export { SpritePainter, type FishSprite, type SpritePose } from './painter';

export const FISH_SPRITES: Partial<Record<string, FishSprite>> = {
  betta,
  neon_tetra: neonTetra,
  guppy,
  corydoras_paleatus: corydoras,
  cherry_shrimp: cherryShrimp,
};
