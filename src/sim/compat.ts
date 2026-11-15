/**
 * Compatibilidad entre especies y con la pecera. Es lo que la tienda muestra
 * antes de comprar: advertencias legibles, en español, que explican el porqué.
 */

import texts from '../data/texts.es.json';
import { defaultConfig, type SimConfig } from './config';
import { canEatSpecies } from './fish';
import { getSpecies, hasTrait, type Species } from './species';
import { fill } from './text';
import type { AnimalState } from './types';

export interface StockEntry {
  speciesId: string;
  count: number;
  /** Cuántos son machos (por defecto: la mitad, o todos si se vende como macho). */
  males?: number;
}

export interface CompatTank {
  liters: number;
  heightCm: number;
}

export type CompatSeverity = 'caution' | 'danger';
export type CompatCode =
  | 'temperature'
  | 'ph'
  | 'predation'
  | 'fin_nipping'
  | 'aggression'
  | 'territorial'
  | 'min_group'
  | 'min_tank'
  | 'tank_height';

export interface CompatWarning {
  code: CompatCode;
  severity: CompatSeverity;
  /** Especies involucradas (la primera es la "culpable"). */
  speciesIds: string[];
  /** Texto para mostrar. */
  message: string;
}

const T = texts.compat;

/** Machos que se asumen cuando no se dice cuántos hay. */
export function defaultMales(species: Species, count: number): number {
  return hasTrait(species, 'sold_as_male') ? count : Math.floor(count / 2);
}

function mergeStock(stock: readonly StockEntry[]): { species: Species; count: number; males: number }[] {
  const merged = new Map<string, { species: Species; count: number; males: number }>();
  for (const entry of stock) {
    if (!(entry.count > 0)) continue;
    const species = getSpecies(entry.speciesId);
    const males = Math.min(entry.count, entry.males ?? defaultMales(species, entry.count));
    const existing = merged.get(species.id);
    if (existing) {
      existing.count += entry.count;
      existing.males += males;
    } else {
      merged.set(species.id, { species, count: entry.count, males });
    }
  }
  return [...merged.values()];
}

const range = (r: readonly [number, number]): string => `${r[0]}–${r[1]}`;

function overlap(
  a: readonly [number, number],
  b: readonly [number, number],
): { lo: number; hi: number; width: number } {
  const lo = Math.max(a[0], b[0]);
  const hi = Math.min(a[1], b[1]);
  return { lo, hi, width: hi - lo };
}

/** Todas las advertencias de una población dentro de una pecera. */
export function checkCompatibility(
  tank: CompatTank,
  stock: readonly StockEntry[],
  config: SimConfig = defaultConfig,
): CompatWarning[] {
  const entries = mergeStock(stock);
  const warnings: CompatWarning[] = [];
  const add = (
    code: CompatCode,
    severity: CompatSeverity,
    species: Species[],
    template: string,
    values: Record<string, string | number> = {},
  ): void => {
    warnings.push({
      code,
      severity,
      speciesIds: species.map((sp) => sp.id),
      message: fill(template, { a: species[0]?.name ?? '', b: species[1]?.name ?? '', ...values }),
    });
  };

  // Cada especie con la pecera.
  for (const { species: sp, count, males } of entries) {
    const liters = Math.round(tank.liters);
    if (tank.liters < sp.minTankL) {
      add(
        'min_tank',
        tank.liters < sp.minTankL * 0.6 ? 'danger' : 'caution',
        [sp],
        hasTrait(sp, 'messy') ? T.minTankMessy : T.minTank,
        { min: sp.minTankL, liters },
      );
    }
    if (sp.minTankHeightCm > 0 && tank.heightCm < sp.minTankHeightCm) {
      add('tank_height', 'caution', [sp], T.tankHeight, {
        min: sp.minTankHeightCm,
        height: tank.heightCm,
      });
    }
    if (count < sp.minGroup) {
      add('min_group', 'caution', [sp], sp.finNipper ? T.minGroupNipper : T.minGroup, {
        min: sp.minGroup,
        count,
      });
    }
    if (sp.maxMales !== null && males > sp.maxMales) {
      add('territorial', 'danger', [sp], sp.maxMales === 1 ? T.territorialOne : T.territorial, {
        max: sp.maxMales,
        males,
      });
    }
  }

  // Cada par de especies.
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = (entries[i] as (typeof entries)[number]).species;
      const b = (entries[j] as (typeof entries)[number]).species;

      const temp = overlap(a.temp, b.temp);
      if (temp.width < 0) {
        add('temperature', 'danger', [a, b], T.temperatureNone, {
          aRange: range(a.temp),
          bRange: range(b.temp),
        });
      } else if (temp.width < config.compat.tempOverlapTightC) {
        add('temperature', 'caution', [a, b], T.temperatureTight, { lo: temp.lo, hi: temp.hi });
      }

      const ph = overlap(a.ph, b.ph);
      if (ph.width < 0) {
        add('ph', 'danger', [a, b], T.phNone, { aRange: range(a.ph), bRange: range(b.ph) });
      } else if (ph.width < config.compat.phOverlapTight) {
        add('ph', 'caution', [a, b], T.phTight, { lo: ph.lo, hi: ph.hi });
      }

      for (const [x, y] of [
        [a, b],
        [b, a],
      ] as const) {
        if (canEatSpecies(x, y, config)) {
          add('predation', 'danger', [x, y], T.predation, {
            aSize: x.adultSizeCm,
            bSize: y.adultSizeCm,
          });
        }
        if (x.finNipper && y.longFins) add('fin_nipping', 'danger', [x, y], T.finNipping);
        else if (hasTrait(x, 'attacks_long_fins') && y.longFins && y.category === 'fish') {
          add('aggression', 'caution', [x, y], T.attacksLongFins);
        }
      }
    }
  }

  // Lo más grave primero.
  return warnings.sort(
    (x, y) => Number(y.severity === 'danger') - Number(x.severity === 'danger'),
  );
}

/**
 * Advertencias que aparecen (o siguen) si se suma `candidate` a lo que ya
 * hay: solo las que tienen que ver con la especie que se quiere comprar.
 */
export function checkAddition(
  tank: CompatTank,
  stock: readonly StockEntry[],
  candidate: StockEntry,
  config: SimConfig = defaultConfig,
): CompatWarning[] {
  return checkCompatibility(tank, [...stock, candidate], config).filter((warning) =>
    warning.speciesIds.includes(candidate.speciesId),
  );
}

/** Población actual de la pecera, en el formato de la tienda. */
export function stockFromAnimals(animals: readonly AnimalState[]): StockEntry[] {
  const stock = new Map<string, StockEntry>();
  for (const animal of animals) {
    if (!animal.alive) continue;
    const entry = stock.get(animal.speciesId) ?? { speciesId: animal.speciesId, count: 0, males: 0 };
    entry.count++;
    if (animal.sex === 'male') entry.males = (entry.males ?? 0) + 1;
    stock.set(animal.speciesId, entry);
  }
  return [...stock.values()];
}
