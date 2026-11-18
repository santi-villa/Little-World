import { Assets, type Texture } from 'pixi.js';
import { IllustratedBetta } from '../dev/illustrated-betta';
import { loadIllustratedBettaArt } from '../dev/illustrated-betta-art';
import coryUrl from '../dev/art/corydoras-illustrated.png?url';
import neonUrl from '../dev/art/neon-tetra-illustrated.png?url';
import { companionProfile } from '../motion/illustrated-companions';
import { IllustratedCompanion } from '../tank/illustrated-companion';
import type { IllustratedFishFactory } from '../tank/illustrated-fish-renderer';

export async function loadIllustratedFishRenderer(): Promise<IllustratedFishFactory> {
  const [betta, cory, neon] = await Promise.all([
    loadIllustratedBettaArt(),
    Assets.load<Texture>(coryUrl),
    Assets.load<Texture>(neonUrl),
  ]);
  cory.source.scaleMode = neon.source.scaleMode = 'linear';
  return (id, facing, species) => {
    if (species === 'betta') return new IllustratedBetta(id, facing, betta);
    const profile = companionProfile(species);
    if (profile) return new IllustratedCompanion(id, facing, species, species === 'corydoras_paleatus' ? cory : neon, profile);
  };
}
