import { IllustratedBetta } from '../dev/illustrated-betta';
import { loadIllustratedBettaArt } from '../dev/illustrated-betta-art';

export async function loadBettaRenderer() {
  const art = await loadIllustratedBettaArt();
  return (id: number, facing: number) => new IllustratedBetta(id, facing, art);
}
