/**
 * Modelo de agua: residuos orgánicos, ciclo del nitrógeno (AOB/NOB), algas,
 * intercambio de gases, cloro, evaporación, pH/KH y suciedad del filtro.
 *
 * Cada función avanza un sub-paso corto y muta el borrador que le pasa step().
 */

import {
  freeAmmoniaFraction,
  monod,
  nitrifierPhFactor,
  nitrifierTemperatureFactor,
  oxygenSaturation,
  phFromKhCo2,
} from './chemistry';
import type { SimConfig } from './config';
import { effectiveFlowLph, isLightOn } from './derive';
import type { Colony, SimState } from './types';

const MINUTES_PER_DAY = 1440;

/** Fracción que reacciona en dt con una cinética de primer orden (siempre estable). */
function firstOrderFraction(ratePerDay: number, dtDays: number): number {
  return 1 - Math.exp(-ratePerDay * dtDays);
}

/** La evaporación se lleva agua pura: lo disuelto se concentra. */
export function applyEvaporation(state: SimState, liters: number, config: SimConfig): number {
  if (liters <= 0) return 0;
  const tank = state.tank;
  const minLiters = config.evaporation.minWaterFraction * tank.fullLiters;
  const newLiters = Math.max(minLiters, tank.waterLiters - liters);
  const evaporated = tank.waterLiters - newLiters;
  if (evaporated <= 0) return 0;
  const concentrate = tank.waterLiters / newLiters;
  const w = state.water;
  w.ammonia *= concentrate;
  w.nitrite *= concentrate;
  w.nitrate *= concentrate;
  w.kh *= concentrate;
  tank.waterLiters = newLiters;
  return evaporated;
}

/** Suma amoníaco (mg de N en total) al agua; amonificar libera algo de alcalinidad. */
function addAmmoniaMass(state: SimState, mgN: number, config: SimConfig): void {
  if (mgN <= 0) return;
  const perLiter = mgN / state.tank.waterLiters;
  state.water.ammonia += perLiter;
  state.water.kh += perLiter * config.nitrogen.khReleasedPerMgNAmmonified;
}

/**
 * Carga biológica y descomposición de residuos orgánicos.
 * La comida sin comer se pudre rápido; una parte pasa a detrito, que se
 * descompone despacio. Mineralizar libera amoníaco y CO2 y consume oxígeno.
 * Devuelve los gramos de detrito nuevo (ensucian el filtro).
 */
export function stepOrganics(state: SimState, dtDays: number, config: SimConfig): number {
  const o = config.organics;
  const liters = state.tank.waterLiters;
  const water = state.water;
  const temperatureFactor = nitrifierTemperatureFactor(water.temperatureC, config);
  const oxygenFactor = monod(water.oxygen, o.oxygenHalfSaturationMgL);
  const decayFactor = temperatureFactor * oxygenFactor;

  // Carga externa (peces en fases futuras): amoníaco directo + heces.
  addAmmoniaMass(state, state.bioload.ammoniaMgNPerDay * dtDays, config);
  let newDetritusG = state.bioload.wasteGPerDay * dtDays;

  let ammoniaMgN = 0;
  let mineralizedG = 0;

  // Comida sin comer.
  const foodDecayed = state.organics.foodG * firstOrderFraction(o.foodDecayPerDay * decayFactor, dtDays);
  if (foodDecayed > 0) {
    state.organics.foodG -= foodDecayed;
    const toDetritus = foodDecayed * o.foodToDetritusFraction;
    newDetritusG += toDetritus;
    mineralizedG += foodDecayed - toDetritus;
    ammoniaMgN +=
      foodDecayed * o.foodNitrogenMgPerGram - toDetritus * o.detritusNitrogenMgPerGram;
  }

  // Detrito viejo.
  const detritusDecayed =
    state.organics.detritusG * firstOrderFraction(o.detritusDecayPerDay * decayFactor, dtDays);
  if (detritusDecayed > 0) {
    state.organics.detritusG -= detritusDecayed;
    mineralizedG += detritusDecayed;
    ammoniaMgN += detritusDecayed * o.detritusNitrogenMgPerGram;
  }

  state.organics.detritusG += newDetritusG;
  addAmmoniaMass(state, Math.max(0, ammoniaMgN), config);

  const mineralizedMg = mineralizedG * 1000;
  water.oxygen = Math.max(0, water.oxygen - (mineralizedMg * o.oxygenMgPerMgMineralized) / liters);
  water.co2 += (mineralizedMg * o.co2MgPerMgMineralized) / liters;

  return newDetritusG;
}

/** Qué tan bien llega el agua (comida y oxígeno) a las bacterias del filtro, 0..1. */
function filterDelivery(state: SimState, config: SimConfig): number {
  const turnover = effectiveFlowLph(state, config) / state.tank.waterLiters;
  return turnover / (turnover + config.nitrogen.filterTurnoverHalfPerHour);
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
  const maintenance = config.nitrogen.maintenanceSaturation;
  let rate: number;
  if (saturation > maintenance) {
    // Sobra comida: la colonia crece hasta donde le da el espacio.
    const room = Math.max(0, 1 - capacity / carryingCapacity);
    rate = ((maxNetGrowthPerDay * environment * (saturation - maintenance)) / (1 - maintenance)) * room;
  } else {
    // Pasa hambre: muere despacio (las nitrificantes aguantan semanas).
    rate = (-config.nitrogen.starvationDecayPerDay * (maintenance - saturation)) / maintenance;
  }
  rate -= extraDeathPerDay;
  const next = capacity * Math.exp(rate * dtDays);
  return Math.min(carryingCapacity, Math.max(floor, next));
}

/**
 * Ciclo del nitrógeno: NH3/NH4+ --AOB--> NO2- --NOB--> NO3-.
 * Las colonias se miden por su capacidad máxima de oxidación (mg N/día),
 * crecen cuando hay sustrato de sobra y se achican cuando falta.
 * Nitrificar consume oxígeno y KH; el NH3 libre frena a las NOB.
 */
export function stepNitrogen(state: SimState, dtDays: number, config: SimConfig): void {
  const n = config.nitrogen;
  const water = state.water;
  const liters = state.tank.waterLiters;
  const bacteria = state.bacteria;

  const temperatureFactor = nitrifierTemperatureFactor(water.temperatureC, config);
  const phFactor = nitrifierPhFactor(water.ph, config);
  const delivery = filterDelivery(state, config);

  // --- AOB: amoníaco -> nitrito ---
  const aobEnvironment =
    temperatureFactor * phFactor * monod(water.oxygen, n.aob.oxygenHalfSaturationMgL);
  const aobSaturation = monod(water.ammonia, n.aob.halfSaturationMgL);
  const aobActive =
    (bacteria.filter.aob * delivery + bacteria.surfaces.aob) * aobEnvironment;
  let oxidized = 0;
  if (water.ammonia > 0 && aobActive > 0) {
    // Primer orden local: nunca oxida más de lo que hay.
    const rate = aobActive / (liters * (n.aob.halfSaturationMgL + water.ammonia));
    oxidized = water.ammonia * firstOrderFraction(rate, dtDays);
    // Tampoco más de lo que permiten el oxígeno y la alcalinidad que quedan:
    // sin KH el pH se desploma y la nitrificación se frena.
    const oxygenLimit = water.oxygen / n.oxygenPerMgNAob;
    const alkalinityLimit = water.kh / n.khConsumedPerMgNNitrified;
    oxidized = Math.min(oxidized, oxygenLimit, alkalinityLimit);
    water.ammonia -= oxidized;
    water.nitrite += oxidized;
    water.oxygen -= oxidized * n.oxygenPerMgNAob;
    water.kh = Math.max(0, water.kh - oxidized * n.khConsumedPerMgNNitrified);
  }

  // --- NOB: nitrito -> nitrato ---
  const nh3 = water.ammonia * freeAmmoniaFraction(water.ph, water.temperatureC);
  const inhibition = n.nob.freeAmmoniaInhibitionMgL / (n.nob.freeAmmoniaInhibitionMgL + nh3);
  const nobEnvironment =
    temperatureFactor * phFactor * inhibition * monod(water.oxygen, n.nob.oxygenHalfSaturationMgL);
  const nobSaturation = monod(water.nitrite, n.nob.halfSaturationMgL);
  const nobActive =
    (bacteria.filter.nob * delivery + bacteria.surfaces.nob) * nobEnvironment;
  if (water.nitrite > 0 && nobActive > 0) {
    const rate = nobActive / (liters * (n.nob.halfSaturationMgL + water.nitrite));
    let converted = water.nitrite * firstOrderFraction(rate, dtDays);
    const oxygenLimit = water.oxygen / n.oxygenPerMgNNob;
    converted = Math.min(converted, oxygenLimit);
    water.nitrite -= converted;
    water.nitrate += converted;
    water.oxygen -= converted * n.oxygenPerMgNNob;
  }

  // --- Poblaciones ---
  const chlorineDeath = config.chlorine.bacteriaKillPerHourPerMgL * water.chlorine * 24;
  const filterDeath = chlorineDeath + (state.filter.running ? 0 : n.filterStoppedDeathPerDay);
  const surfaceCapacity = n.surfaceCapacityMgNPerDayPerLiter * state.tank.fullLiters;
  const filterFloor = n.seedCapacityMgNPerDay * n.filterSeedShare;
  const surfaceFloor = n.seedCapacityMgNPerDay * (1 - n.filterSeedShare);

  const grow = (
    colony: Colony,
    environmentScale: number,
    carryingCapacity: number,
    death: number,
    floor: number,
  ): void => {
    colony.aob = growColony(
      colony.aob,
      aobSaturation,
      aobEnvironment * environmentScale,
      n.aob.maxNetGrowthPerDay,
      carryingCapacity,
      death,
      floor,
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
      floor,
      dtDays,
      config,
    );
  };

  grow(bacteria.filter, delivery, state.filter.mediaCapacity, filterDeath, filterFloor);
  grow(bacteria.surfaces, 1, surfaceCapacity, chlorineDeath, surfaceFloor);

  // Las bacterias que se desprenden del filtro colonizan de a poco el sustrato
  // y los vidrios, hasta que las superficies tienen su parte de la colonia.
  const moved = firstOrderFraction(n.surfaceColonizationPerDay, dtDays);
  const surfaceShare = 1 - n.filterSeedShare;
  for (const kind of ['aob', 'nob'] as const) {
    const total = bacteria.filter[kind] + bacteria.surfaces[kind];
    const target = Math.min(surfaceCapacity, total * surfaceShare);
    const delta = (target - bacteria.surfaces[kind]) * moved;
    if (delta > 0) {
      bacteria.surfaces[kind] += delta;
      bacteria.filter[kind] -= delta;
    }
  }
}

/**
 * Algas: crecen con luz, nitrógeno y CO2; de día producen oxígeno y suben el
 * pH (consumen CO2). Las que mueren vuelven como detrito.
 * Devuelve los gramos de detrito nuevo.
 */
export function stepAlgae(state: SimState, dtDays: number, config: SimConfig): number {
  const a = config.algae;
  const water = state.water;
  const liters = state.tank.waterLiters;
  const algae = state.algae;
  const capacity = a.capacityGramsPerLiter * liters;

  let grown = 0;
  if (isLightOn(state)) {
    const nitrogen = water.ammonia + water.nitrate;
    const rate =
      a.maxGrowthPerDay *
      monod(nitrogen, a.nitrogenHalfSaturationMgL) *
      monod(water.co2, a.co2HalfSaturationMgL) *
      Math.max(0, 1 - algae.biomassG / capacity);
    grown = algae.biomassG * rate * dtDays;

    // No puede crecer más de lo que permiten el nitrógeno y el CO2 disponibles.
    const maxByNitrogen = (nitrogen * liters * 0.5) / a.nitrogenMgPerGram;
    const maxByCo2 = (water.co2 * liters * 0.5) / (a.co2MgPerMgGrown * 1000);
    grown = Math.max(0, Math.min(grown, maxByNitrogen, maxByCo2));

    if (grown > 0) {
      const neededPerLiter = (grown * a.nitrogenMgPerGram) / liters;
      const weightedAmmonia = water.ammonia * a.ammoniaPreference;
      let fromAmmonia = (neededPerLiter * weightedAmmonia) / (weightedAmmonia + water.nitrate);
      fromAmmonia = Math.min(fromAmmonia, water.ammonia);
      const fromNitrate = Math.min(neededPerLiter - fromAmmonia, water.nitrate);
      water.ammonia -= fromAmmonia;
      water.nitrate -= fromNitrate;
      const grownMg = grown * 1000;
      water.oxygen += (grownMg * a.oxygenMgPerMgGrown) / liters;
      water.co2 = Math.max(0, water.co2 - (grownMg * a.co2MgPerMgGrown) / liters);
    }
  }

  const lost = algae.biomassG * firstOrderFraction(a.lossPerDay, dtDays);
  algae.biomassG = Math.max(a.seedGrams, algae.biomassG + grown - lost);

  // Las algas muertas pasan a detrito; el nitrógeno que sobra vuelve como amoníaco.
  const o = config.organics;
  state.organics.detritusG += lost;
  addAmmoniaMass(
    state,
    Math.max(0, lost * (a.nitrogenMgPerGram - o.detritusNitrogenMgPerGram)),
    config,
  );
  return lost;
}

/** Intercambio de gases con el aire (O2 y CO2) y desaparición del cloro. */
export function stepGases(state: SimState, dtMinutes: number, config: SimConfig): void {
  const g = config.gasExchange;
  const water = state.water;
  const dtHours = dtMinutes / 60;
  const turnover = effectiveFlowLph(state, config) / state.tank.waterLiters;
  const kla =
    g.surfaceKlaPerHour + (g.flowKlaPerHour * turnover) / (turnover + g.turnoverHalfPerHour);

  const saturation = oxygenSaturation(water.temperatureC);
  water.oxygen = Math.max(
    0,
    saturation + (water.oxygen - saturation) * Math.exp(-kla * dtHours),
  );
  water.co2 = Math.max(
    0,
    g.co2EquilibriumMgL +
      (water.co2 - g.co2EquilibriumMgL) * Math.exp(-kla * g.co2KlaRatio * dtHours),
  );

  const chlorineRate = Math.LN2 / config.chlorine.halfLifeHours;
  water.chlorine *= Math.exp(-chlorineRate * dtHours);
  if (water.chlorine < 1e-6) water.chlorine = 0;
}

/** El filtro se ensucia con el tiempo y con el detrito que atrapa. */
export function stepFilterClog(
  state: SimState,
  dtDays: number,
  newDetritusG: number,
  config: SimConfig,
): void {
  if (!state.filter.running) return;
  const f = config.filter;
  state.filter.clog = Math.min(
    1,
    state.filter.clog + f.clogBasePerDay * dtDays + f.clogPerGramDetritus * newDetritusG,
  );
}

export function updatePh(state: SimState, config: SimConfig): void {
  state.water.ph = phFromKhCo2(state.water.kh, state.water.co2, config);
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
  const clean = water.ammonia <= c.maxAmmoniaMgL && water.nitrite <= c.maxNitriteMgL;

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

  if (water.ammonia > c.lostAboveMgL || water.nitrite > c.lostAboveMgL) {
    cycle.established = false;
    cycle.stableMinutes = 0;
    return 'lost';
  }
  return null;
}

export { MINUTES_PER_DAY };
