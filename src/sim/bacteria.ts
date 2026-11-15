/**
 * Ciclo del nitrógeno: amoníaco --AOB--> nitrito --NOB--> nitrato.
 *
 * Las colonias se miden por su capacidad máxima de oxidación (mg de N por
 * día) y viven en dos lugares: el material filtrante (la mayor parte) y las
 * superficies (sustrato, vidrios, decoración).
 *  - Crecen cuando les sobra sustrato, hasta la capacidad del lugar.
 *  - Mueren despacio si pasan hambre (pecera vacía mucho tiempo).
 *  - Las NOB crecen más lento y el NH3 libre las frena: por eso el pico de
 *    nitrito llega después del de amoníaco.
 *  - Nitrificar consume oxígeno y KH; el cloro las mata.
 */

import {
  NITROGEN_FRACTION,
  firstOrderFraction,
  freeAmmoniaFraction,
  monod,
  nitrifierPhFactor,
  temperatureFactor,
} from './chemistry';
import type { SimConfig } from './config';
import { effectiveFlowLph } from './derive';
import type { Colony, SimState } from './types';

/** Qué tan bien llega el agua (comida y oxígeno) a las bacterias del filtro, 0..1. */
function filterDelivery(state: SimState, config: SimConfig): number {
  const turnover = effectiveFlowLph(state, config) / state.tank.waterLiters;
  return turnover / (turnover + config.nitrogen.filterTurnoverHalfPerHour);
}

/** Colonia mínima que siempre queda (llega con el aire, el agua, las plantas). */
export function seedCapacity(state: SimState, config: SimConfig): { filter: number; surfaces: number } {
  const n = config.nitrogen;
  const total = n.seedCapacityMgNPerDayPerLiter * state.tank.fullLiters;
  const hasFilter = state.filter.mediaCapacity > 0;
  return {
    filter: hasFilter ? total * n.filterShare : 0,
    surfaces: hasFilter ? total * (1 - n.filterShare) : total,
  };
}

export function surfaceCapacity(state: SimState, config: SimConfig): number {
  return config.nitrogen.surfaceCapacityMgNPerDayPerLiter * state.tank.fullLiters;
}

/** Crecimiento o muerte de una colonia según cuánta comida tiene. */
function growColony(
  capacity: number,
  saturation: number,
  environment: number,
  maxNetGrowthPerDay: number,
  carryingCapacity: number,
  extraDeathPerDay: number,
  floor: number,
  dtDays: number,
  config: SimConfig,
): number {
  if (carryingCapacity <= 0) return 0;
  const maintenance = config.nitrogen.maintenanceSaturation;
  let rate: number;
  if (saturation > maintenance) {
    // Sobra comida: la colonia crece hasta donde le da el espacio.
    const room = Math.max(0, 1 - capacity / carryingCapacity);
    rate =
      ((maxNetGrowthPerDay * environment * (saturation - maintenance)) / (1 - maintenance)) * room;
  } else {
    // Pasa hambre: muere despacio (las nitrificantes aguantan semanas).
    rate = (-config.nitrogen.starvationDecayPerDay * (maintenance - saturation)) / maintenance;
  }
  rate -= extraDeathPerDay;
  const next = capacity * Math.exp(rate * dtDays);
  return Math.min(carryingCapacity, Math.max(floor, next));
}

export function stepNitrogen(state: SimState, dtDays: number, config: SimConfig): void {
  const n = config.nitrogen;
  const water = state.water;
  const liters = state.tank.waterLiters;
  const bacteria = state.bacteria;

  // La cuenta se hace en mg/L de nitrógeno y al final se vuelve a ppm.
  let ammoniaN = water.ammonia * NITROGEN_FRACTION.ammonia;
  let nitriteN = water.nitrite * NITROGEN_FRACTION.nitrite;
  let nitrateN = water.nitrate * NITROGEN_FRACTION.nitrate;
  const aobHalf = n.aob.halfSaturationPpm * NITROGEN_FRACTION.ammonia;
  const nobHalf = n.nob.halfSaturationPpm * NITROGEN_FRACTION.nitrite;

  const temperature = temperatureFactor(water.temperatureC, config);
  const ph = nitrifierPhFactor(water.ph, config);
  const delivery = filterDelivery(state, config);

  // --- AOB: amoníaco -> nitrito ---
  const aobEnvironment = temperature * ph * monod(water.oxygen, n.aob.oxygenHalfSaturationMgL);
  const aobSaturation = monod(ammoniaN, aobHalf);
  const aobActive = (bacteria.filter.aob * delivery + bacteria.surfaces.aob) * aobEnvironment;
  if (ammoniaN > 0 && aobActive > 0) {
    // Primer orden local: nunca oxida más de lo que hay.
    const rate = aobActive / (liters * (aobHalf + ammoniaN));
    // Tampoco más de lo que permiten el oxígeno y la alcalinidad que quedan:
    // sin KH el pH se desploma y la nitrificación se frena.
    const oxidized = Math.min(
      ammoniaN * firstOrderFraction(rate, dtDays),
      water.oxygen / n.oxygenPerMgNAob,
      water.kh / n.khConsumedPerMgNNitrified,
    );
    ammoniaN -= oxidized;
    nitriteN += oxidized;
    water.oxygen -= oxidized * n.oxygenPerMgNAob;
    water.kh = Math.max(0, water.kh - oxidized * n.khConsumedPerMgNNitrified);
  }

  // --- NOB: nitrito -> nitrato ---
  const nh3 =
    (ammoniaN / NITROGEN_FRACTION.ammonia) * freeAmmoniaFraction(water.ph, water.temperatureC);
  const inhibition = n.nob.freeAmmoniaInhibitionPpm / (n.nob.freeAmmoniaInhibitionPpm + nh3);
  const nobEnvironment =
    temperature * ph * inhibition * monod(water.oxygen, n.nob.oxygenHalfSaturationMgL);
  const nobSaturation = monod(nitriteN, nobHalf);
  const nobActive = (bacteria.filter.nob * delivery + bacteria.surfaces.nob) * nobEnvironment;
  if (nitriteN > 0 && nobActive > 0) {
    const rate = nobActive / (liters * (nobHalf + nitriteN));
    const converted = Math.min(
      nitriteN * firstOrderFraction(rate, dtDays),
      water.oxygen / n.oxygenPerMgNNob,
    );
    nitriteN -= converted;
    nitrateN += converted;
    water.oxygen -= converted * n.oxygenPerMgNNob;
  }

  water.ammonia = ammoniaN / NITROGEN_FRACTION.ammonia;
  water.nitrite = nitriteN / NITROGEN_FRACTION.nitrite;
  water.nitrate = nitrateN / NITROGEN_FRACTION.nitrate;

  // --- Poblaciones ---
  const chlorineDeath = config.chlorine.bacteriaKillPerHourPerMgL * water.chlorine * 24;
  const filterWorking = effectiveFlowLph(state, config) > 0;
  const filterDeath = chlorineDeath + (filterWorking ? 0 : n.filterStoppedDeathPerDay);
  const surfaceMax = surfaceCapacity(state, config);
  const floor = seedCapacity(state, config);

  const grow = (
    colony: Colony,
    environmentScale: number,
    carryingCapacity: number,
    death: number,
    minimum: number,
  ): void => {
    colony.aob = growColony(
      colony.aob,
      aobSaturation,
      aobEnvironment * environmentScale,
      n.aob.maxNetGrowthPerDay,
      carryingCapacity,
      death,
      minimum,
      dtDays,
      config,
    );
    colony.nob = growColony(
      colony.nob,
      nobSaturation,
      nobEnvironment * environmentScale,
      n.nob.maxNetGrowthPerDay,
      carryingCapacity,
      death,
      minimum,
      dtDays,
      config,
    );
  };

  grow(bacteria.filter, delivery, state.filter.mediaCapacity, filterDeath, floor.filter);
  grow(bacteria.surfaces, 1, surfaceMax, chlorineDeath, floor.surfaces);

  // Las bacterias que se desprenden del filtro colonizan de a poco el sustrato
  // y los vidrios, hasta que las superficies tienen su parte de la colonia.
  const moved = firstOrderFraction(n.surfaceColonizationPerDay, dtDays);
  const surfaceShare = 1 - n.filterShare;
  for (const kind of ['aob', 'nob'] as const) {
    const total = bacteria.filter[kind] + bacteria.surfaces[kind];
    const target = Math.min(surfaceMax, total * surfaceShare);
    const delta = (target - bacteria.surfaces[kind]) * moved;
    if (delta > 0) {
      bacteria.surfaces[kind] += delta;
      bacteria.filter[kind] -= delta;
    }
  }
}

/** Lleva la cuenta de si la pecera está ciclada. Devuelve el cambio, si hubo. */
export function stepCycle(
  state: SimState,
  dtMinutes: number,
  config: SimConfig,
): 'established' | 'lost' | null {
  const c = config.cycle;
  const water = state.water;
  const cycle = state.cycle;
  const minCapacity = c.minCapacityMgNPerDayPerLiter * state.tank.fullLiters;
  const aob = state.bacteria.filter.aob + state.bacteria.surfaces.aob;
  const nob = state.bacteria.filter.nob + state.bacteria.surfaces.nob;
  const clean = water.ammonia <= c.maxAmmoniaPpm && water.nitrite <= c.maxNitritePpm;

  if (!cycle.established) {
    if (clean && aob >= minCapacity && nob >= minCapacity) {
      cycle.stableMinutes += dtMinutes;
      if (cycle.stableMinutes >= c.stableHours * 60) {
        cycle.established = true;
        return 'established';
      }
    } else {
      cycle.stableMinutes = 0;
    }
    return null;
  }

  if (water.ammonia > c.lostAboveAmmoniaPpm || water.nitrite > c.lostAboveNitritePpm) {
    cycle.established = false;
    cycle.stableMinutes = 0;
    return 'lost';
  }
  return null;
}
