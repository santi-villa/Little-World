/**
 * Catálogo de especies (src/data/species.json): la ficha de la sección 7 de
 * DESIGN.md más lo que necesitan el movimiento y los placeholders.
 */

import speciesJson from '../data/species.json';

export type SpeciesCategory = 'fish' | 'shrimp' | 'snail';
export type Zone = 'surface' | 'middle' | 'bottom';
export type Temperament = 'peaceful' | 'semi_aggressive' | 'aggressive';
export type ActivityRhythm = 'diurnal' | 'nocturnal';

export interface Species {
  id: string;
  name: string;
  scientific: string;
  category: SpeciesCategory;
  /** Rango de temperatura, °C. */
  temp: [number, number];
  ph: [number, number];
  adultSizeCm: number;
  /** Carga biológica de un adulto (≈ mg de N de amoníaco por día). */
  bioload: number;
  minGroup: number;
  idealGroup: number;
  minTankL: number;
  /** Altura mínima de la pecera (0 = da igual). */
  minTankHeightCm: number;
  zone: Zone;
  temperament: Temperament;
  finNipper: boolean;
  longFins: boolean;
  /** Especies que se come seguro (además de la regla general por tamaño). */
  predatorOf: string[];
  /** Máximo de machos por pecera (null = sin límite). */
  maxMales: number | null;
  diet: string[];
  breeding: string;
  lifespanYears: [number, number];
  activity: ActivityRhythm;
  traits: string[];
  difficulty: number;
  price: number;
  unlock: string;
  /** Polizón: no se compra, aparece solo. */
  hitchhiker: boolean;
  swim: { speedCmS: number; turnDegS: number };
  /** Colores del placeholder. */
  color: string;
  accent: string;
  notes: string;
}

export const SPECIES: readonly Species[] = speciesJson.species as unknown as Species[];

const byId = new Map<string, Species>(SPECIES.map((species) => [species.id, species]));

export function getSpecies(id: string): Species {
  const species = byId.get(id);
  if (!species) throw new Error(`No existe la especie "${id}" en species.json`);
  return species;
}

export function findSpecies(id: string): Species | undefined {
  return byId.get(id);
}

export function hasTrait(species: Species, trait: string): boolean {
  return species.traits.includes(trait);
}

/** Va en grupo: cardumen apretado (schooling) o grupo suelto (shoaling). */
export function groupStyle(species: Species): 'schooling' | 'shoaling' | 'none' {
  if (species.traits.includes('schooling')) return 'schooling';
  if (species.traits.includes('shoaling')) return 'shoaling';
  return 'none';
}
