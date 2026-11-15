/**
 * Química del agua: residuos orgánicos, intercambio de gases, cloro,
 * evaporación, pH/KH y suciedad del filtro. El ciclo del nitrógeno está en
 * bacteria.ts y las algas en algae.ts.
 *
 * Cada función avanza un paso corto y muta el borrador que le pasa step().
 */

import {
  NITROGEN_FRACTION,
  firstOrderFraction,
  monod,
  oxygenSaturation,
  phFromKhCo2,
  temperatureFactor,
} from './chemistry';
import type { SimConfig } from './config';
import { effectiveFlowLph } from './derive';
import type { SimState } from './types';

/** La evaporación se lleva agua pura: los minerales y lo disuelto se concentran. */
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
  w.phosphate *= concentrate;
  w.kh *= concentrate;
  w.gh *= concentrate;
  w.tannins = Math.min(1, w.tannins * concentrate);
  tank.waterLiters = newLiters;
  return evaporated;
}

/** Suma amoníaco (mg de N en total) al agua; amonificar libera algo de alcalinidad. */
export function addAmmoniaNitrogen(state: SimState, mgN: number, config: SimConfig): void {
  if (mgN <= 0) return;
  const mgNPerLiter = mgN / state.tank.waterLiters;
  state.water.ammonia += mgNPerLiter / NITROGEN_FRACTION.ammonia;
  state.water.kh += mgNPerLiter * config.nitrogen.khReleasedPerMgNAmmonified;
}

/**
 * Carga biológica y descomposición de los residuos orgánicos.
 * La comida sin comer se pudre rápido (más rápido con más temperatura); una
 * parte pasa a detrito, que se descompone despacio. Descomponer libera
 * amoníaco, fosfato y CO2, y consume oxígeno.
 * Devuelve los gramos de detrito nuevo (ensucian el filtro).
 */
export function stepOrganics(state: SimState, dtDays: number, config: SimConfig): number {
  const o = config.organics;
  const liters = state.tank.waterLiters;
  const water = state.water;
  const decayFactor =
    temperatureFactor(water.temperatureC, config) *
    monod(water.oxygen, o.oxygenHalfSaturationMgL);

  // Carga externa (peces en fases futuras): amoníaco directo + heces.
  const excretedMgN = state.bioload.ammoniaMgNPerDay * dtDays;
  addAmmoniaNitrogen(state, excretedMgN, config);
  let phosphateMg = excretedMgN * o.bioloadPhosphateMgPerMgN;
  let newDetritusG = state.bioload.wasteGPerDay * dtDays;

  let ammoniaMgN = 0;
  let mineralizedG = 0;

  // Comida sin comer.
  const foodDecayed =
    state.organics.foodG * firstOrderFraction(o.foodDecayPerDay * decayFactor, dtDays);
  if (foodDecayed > 0) {
    state.organics.foodG -= foodDecayed;
    const toDetritus = foodDecayed * o.foodToDetritusFraction;
    newDetritusG += toDetritus;
    mineralizedG += foodDecayed - toDetritus;
    ammoniaMgN +=
      foodDecayed * o.foodNitrogenMgPerGram - toDetritus * o.detritusNitrogenMgPerGram;
    phosphateMg +=
      foodDecayed * o.foodPhosphateMgPerGram - toDetritus * o.detritusPhosphateMgPerGram;
  }

  // Detrito viejo.
  const detritusDecayed =
    state.organics.detritusG * firstOrderFraction(o.detritusDecayPerDay * decayFactor, dtDays);
  if (detritusDecayed > 0) {
    state.organics.detritusG -= detritusDecayed;
    mineralizedG += detritusDecayed;
    ammoniaMgN += detritusDecayed * o.detritusNitrogenMgPerGram;
    phosphateMg += detritusDecayed * o.detritusPhosphateMgPerGram;
  }

  state.organics.detritusG += newDetritusG;
  addAmmoniaNitrogen(state, Math.max(0, ammoniaMgN), config);
  water.phosphate += Math.max(0, phosphateMg) / liters;

  const mineralizedMg = mineralizedG * 1000;
  water.oxygen = Math.max(0, water.oxygen - (mineralizedMg * o.oxygenMgPerMgMineralized) / liters);
  water.co2 += (mineralizedMg * o.co2MgPerMgMineralized) / liters;

  return newDetritusG;
}

/**
 * Intercambio de gases con el aire (O2 y CO2) y desaparición del cloro.
 * El oxígeno tiende a la saturación, que es menor con el agua caliente; el
 * movimiento de la superficie (caudal del filtro) acelera el intercambio.
 */
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
  if (effectiveFlowLph(state, config) <= 0) return;
  const f = config.filter;
  state.filter.clog = Math.min(
    1,
    state.filter.clog + f.clogBasePerDay * dtDays + f.clogPerGramDetritus * newDetritusG,
  );
}

/** El pH sale del KH (tampón) y del CO2 disuelto. */
export function updatePh(state: SimState, config: SimConfig): void {
  state.water.ph = phFromKhCo2(state.water.kh, state.water.co2, config);
}
