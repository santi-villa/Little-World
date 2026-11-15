/**
 * Acciones del jugador sobre la pecera. Igual que step(), son puras:
 *   applyAction(state, action) -> { state, events }
 */

import { updateAlerts } from './alerts';
import { clamp } from './chemistry';
import { defaultConfig, type SimConfig } from './config';
import { cloneState } from './state';
import type { SimAction, SimEvent, SimState, StepResult } from './types';
import { updatePh } from './water';

/**
 * Mezcla `liters` de agua de canilla con el agua que queda en la pecera.
 * Sin acondicionador, el agua nueva trae cloro.
 */
function addTapWater(
  state: SimState,
  liters: number,
  conditioned: boolean,
  config: SimConfig,
  temperatureC: number = config.tapWater.temperatureC,
): void {
  if (liters <= 0) return;
  const tap = config.tapWater;
  const w = state.water;
  const before = state.tank.waterLiters;
  const after = before + liters;
  const keep = before / after;
  const add = liters / after;
  w.temperatureC = w.temperatureC * keep + temperatureC * add;
  w.ammonia = w.ammonia * keep + tap.ammonia * add;
  w.nitrite = w.nitrite * keep + tap.nitrite * add;
  w.nitrate = w.nitrate * keep + tap.nitrate * add;
  w.kh = w.kh * keep + tap.kh * add;
  w.co2 = w.co2 * keep + tap.co2 * add;
  w.oxygen = w.oxygen * keep + tap.oxygen * add;
  w.chlorine = w.chlorine * keep + (conditioned ? 0 : tap.chlorine) * add;
  state.tank.waterLiters = after;
}

export function applyAction(
  state: SimState,
  action: SimAction,
  config: SimConfig = defaultConfig,
): StepResult {
  const next = cloneState(state);
  const events: SimEvent[] = [];
  const timeMinutes = next.timeMinutes;

  switch (action.type) {
    case 'feed': {
      const grams = Math.max(0, action.grams);
      next.organics.foodG += grams;
      events.push({ type: 'fed', timeMinutes, grams });
      break;
    }

    case 'waterChange': {
      // Se saca una fracción del agua (con todo lo disuelto) y se repone el mismo volumen.
      const fraction = clamp(action.fraction, 0, 1);
      const liters = next.tank.waterLiters * fraction;
      next.tank.waterLiters -= liters;
      addTapWater(next, liters, action.conditioned, config, action.temperatureC);
      if (action.vacuum) {
        const removed = Math.min(1, fraction * config.organics.vacuumEfficiency);
        next.organics.detritusG *= 1 - removed;
        next.organics.foodG *= 1 - removed;
      }
      events.push({
        type: 'water_changed',
        timeMinutes,
        fraction,
        liters,
        conditioned: action.conditioned,
      });
      break;
    }

    case 'topOff': {
      const liters = Math.max(0, next.tank.fullLiters - next.tank.waterLiters);
      addTapWater(next, liters, action.conditioned, config, action.temperatureC);
      events.push({ type: 'topped_off', timeMinutes, liters, conditioned: action.conditioned });
      break;
    }

    case 'cleanFilter': {
      // Bien: enjuagar en agua de la pecera (se pierde poca colonia).
      // Mal: lavar bajo la canilla (el cloro arrasa con las bacterias del filtro).
      const f = config.filter;
      const loss =
        action.method === 'tapWater' && config.tapWater.chlorine > 0
          ? f.badCleanBacteriaLoss
          : f.goodCleanBacteriaLoss;
      const floor = config.nitrogen.seedCapacityMgNPerDay * config.nitrogen.filterSeedShare;
      next.bacteria.filter.aob = Math.max(floor, next.bacteria.filter.aob * (1 - loss));
      next.bacteria.filter.nob = Math.max(floor, next.bacteria.filter.nob * (1 - loss));
      next.filter.clog = Math.min(next.filter.clog, f.cleanResidualClog);
      next.organics.detritusG *= 1 - f.cleanDetritusRemoval;
      events.push({
        type: 'filter_cleaned',
        timeMinutes,
        method: action.method,
        bacteriaLostFraction: loss,
      });
      break;
    }

    case 'addConditioner': {
      next.water.chlorine = 0;
      events.push({ type: 'conditioner_added', timeMinutes });
      break;
    }

    case 'scrubAlgae': {
      const removed = next.algae.biomassG * config.algae.scrubRemovalFraction;
      next.algae.biomassG = Math.max(config.algae.seedGrams, next.algae.biomassG - removed);
      events.push({ type: 'algae_scrubbed', timeMinutes, gramsRemoved: removed });
      break;
    }

    case 'addSeededMedia': {
      const amount = config.nitrogen.seededMediaCapacityMgNPerDay;
      const max = next.filter.mediaCapacity;
      next.bacteria.filter.aob = Math.min(max, next.bacteria.filter.aob + amount);
      next.bacteria.filter.nob = Math.min(max, next.bacteria.filter.nob + amount);
      events.push({ type: 'seeded_media_added', timeMinutes });
      break;
    }

    case 'doseAmmonia': {
      const mgPerLiter = Math.max(0, action.mgPerLiter);
      next.water.ammonia += mgPerLiter;
      events.push({ type: 'ammonia_dosed', timeMinutes, mgPerLiter });
      break;
    }

    case 'setHeater': {
      if (action.enabled !== undefined) next.heater.enabled = action.enabled;
      if (action.watts !== undefined) next.heater.watts = Math.max(0, action.watts);
      if (action.setpointC !== undefined) next.heater.setpointC = action.setpointC;
      if (!next.heater.enabled) next.heater.on = false;
      break;
    }

    case 'setFilterRunning':
      next.filter.running = action.running;
      break;

    case 'setLid':
      next.tank.hasLid = action.hasLid;
      break;

    case 'setLight': {
      if (action.startHour !== undefined) next.light.startHour = clamp(action.startHour, 0, 24);
      if (action.durationHours !== undefined) {
        next.light.durationHours = clamp(action.durationHours, 0, 24);
      }
      break;
    }

    case 'setRoomBase':
      next.room.baseC = action.baseC;
      break;

    case 'setBioload': {
      if (action.ammoniaMgNPerDay !== undefined) {
        next.bioload.ammoniaMgNPerDay = Math.max(0, action.ammoniaMgNPerDay);
      }
      if (action.wasteGPerDay !== undefined) {
        next.bioload.wasteGPerDay = Math.max(0, action.wasteGPerDay);
      }
      break;
    }
  }

  updatePh(next, config);
  events.push(...updateAlerts(next, config));
  return { state: next, events };
}
