import { evolveGlass } from './glass';
/**
 * Algas, como cobertura de 0 a 1 en el vidrio y en la decoración.
 *
 * Crecen con las horas de luz, el nitrógeno (amoníaco y nitrato) y el
 * fosfato; de día producen oxígeno y suben el pH porque consumen CO2. Las
 * que mueren vuelven como detrito. (Las plantas que compiten, los
 * comealgas y el sol directo llegan en fases futuras.)
 */

import { NITROGEN_FRACTION, firstOrderFraction, monod } from './chemistry';
import type { SimConfig } from './config';
import { isLightOn } from './derive';
import type { SimState } from './types';
import { addAmmoniaNitrogen } from './water';

/** Gramos de algas que entran en el vidrio y en la decoración con cobertura total. */
export function algaeCapacityGrams(
  state: SimState,
  config: SimConfig,
): { glass: number; decor: number } {
  const total = config.algae.capacityGramsPerLiter * state.tank.fullLiters;
  return {
    glass: total * config.algae.glassCapacityShare,
    decor: total * (1 - config.algae.glassCapacityShare),
  };
}

/** Avanza las algas un paso. Devuelve los gramos de detrito nuevo. */
export function stepAlgae(state: SimState, dtDays: number, config: SimConfig): number {
  const a = config.algae;
  const previousGlass=state.algae.glass;
  const water = state.water;
  const liters = state.tank.waterLiters;
  const capacity = algaeCapacityGrams(state, config);
  const lit = isLightOn(state);
  let lostGrams = 0;

  for (const place of ['glass', 'decor'] as const) {
    const coverage = state.algae[place];
    const biomass = coverage * capacity[place];
    let grown = 0;

    if (lit) {
      const ammoniaN = water.ammonia * NITROGEN_FRACTION.ammonia;
      const nitrateN = water.nitrate * NITROGEN_FRACTION.nitrate;
      const nitrogen = ammoniaN + nitrateN;
      const light = place === 'glass' ? 1 : a.decorLightFactor;
      const rate =
        a.maxGrowthPerDay *
        light *
        monod(nitrogen, a.nitrogenHalfSaturationMgL) *
        monod(water.phosphate, a.phosphateHalfSaturationPpm) *
        monod(water.co2, a.co2HalfSaturationMgL) *
        Math.max(0, 1 - coverage);

      // No puede crecer más de lo que permiten los nutrientes y el CO2 que hay.
      grown = Math.max(
        0,
        Math.min(
          biomass * rate * dtDays,
          (nitrogen * liters * 0.5) / a.nitrogenMgPerGram,
          (water.phosphate * liters * 0.5) / a.phosphateMgPerGram,
          (water.co2 * liters * 0.5) / (a.co2MgPerMgGrown * 1000),
        ),
      );

      if (grown > 0) {
        // Prefieren el amoníaco al nitrato.
        const neededN = (grown * a.nitrogenMgPerGram) / liters;
        const weightedAmmonia = ammoniaN * a.ammoniaPreference;
        const fromAmmonia = Math.min(
          ammoniaN,
          (neededN * weightedAmmonia) / (weightedAmmonia + nitrateN),
        );
        const fromNitrate = Math.min(nitrateN, neededN - fromAmmonia);
        water.ammonia = (ammoniaN - fromAmmonia) / NITROGEN_FRACTION.ammonia;
        water.nitrate = (nitrateN - fromNitrate) / NITROGEN_FRACTION.nitrate;
        water.phosphate = Math.max(0, water.phosphate - (grown * a.phosphateMgPerGram) / liters);
        const grownMg = grown * 1000;
        water.oxygen += (grownMg * a.oxygenMgPerMgGrown) / liters;
        water.co2 = Math.max(0, water.co2 - (grownMg * a.co2MgPerMgGrown) / liters);
      }
    }

    const lost = biomass * firstOrderFraction(a.lossPerDay, dtDays);
    lostGrams += lost;
    state.algae[place] = Math.min(
      1,
      Math.max(a.seedCoverage, (biomass + grown - lost) / capacity[place]),
    );
  }

  evolveGlass(state.algae,previousGlass);

  // Las algas muertas pasan a detrito; lo que sobra de nutrientes vuelve al agua.
  const o = config.organics;
  state.organics.detritusG += lostGrams;
  addAmmoniaNitrogen(
    state,
    Math.max(0, lostGrams * (a.nitrogenMgPerGram - o.detritusNitrogenMgPerGram)),
    config,
  );
  water.phosphate +=
    Math.max(0, lostGrams * (a.phosphateMgPerGram - o.detritusPhosphateMgPerGram)) / liters;
  return lostGrams;
}
