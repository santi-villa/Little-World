import { scrubGlass } from './glass';
/**
 * Acciones del jugador sobre la pecera. Igual que step(), son puras:
 *   applyAction(state, action) -> { state, events }
 */

import { seedCapacity } from './bacteria';
import { decideIntents } from './behavior';
import { fillCatBowl, petCat } from './cat';
import { NITROGEN_FRACTION, clamp } from './chemistry';
import { defaultConfig, type SimConfig } from './config';
import { NO_ENVIRONMENT } from './environment';
import { updateAlerts } from './events';
import { buildContext, createAnimal, scareAnimals } from './fish';
import { defaultMales } from './compat';
import { getSpecies } from './species';
import { Rng } from './rng';
import { cloneState } from './state';
import type { SimAction, SimEvent, SimState, StepResult } from './types';
import { updatePh } from './water';

/**
 * Mezcla `liters` de agua de la canilla con el agua que queda en la pecera.
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
  w.phosphate = w.phosphate * keep + tap.phosphate * add;
  w.kh = w.kh * keep + tap.kh * add;
  w.gh = w.gh * keep + tap.gh * add;
  w.co2 = w.co2 * keep + tap.co2 * add;
  w.oxygen = w.oxygen * keep + tap.oxygen * add;
  w.chlorine = w.chlorine * keep + (conditioned ? 0 : tap.chlorine) * add;
  w.tannins = w.tannins * keep;
  state.tank.waterLiters = after;
}

/** Mata una fracción de las bacterias del filtro (siempre queda un rastro). */
function killFilterBacteria(state: SimState, fraction: number, config: SimConfig): void {
  const floor = seedCapacity(state, config).filter;
  const filter = state.bacteria.filter;
  filter.aob = Math.max(floor, filter.aob * (1 - fraction));
  filter.nob = Math.max(floor, filter.nob * (1 - fraction));
}

/** Todos vuelven a decidir qué hacer ya mismo (acaba de pasar algo). */
function redecide(state: SimState, config: SimConfig): void {
  const rng = new Rng(state.rngState);
  // Se asume al jugador presente: una acción la hace alguien que está mirando.
  decideIntents(state, buildContext(state, config), rng, config, { ...NO_ENVIRONMENT, playerPresent: true }, true);
  state.rngState = rng.state;
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
      // La comida cae a la superficie; feeding.ts la hunde y reparte.
      const grams = Math.max(0, action.grams);
      next.food.surfaceG += grams;
      if(action.x!==undefined && Number.isFinite(action.x))next.food.x=clamp(action.x,0,1);
      events.push({ type: 'fed', timeMinutes, grams });
      if (grams > 0 && next.animals.length > 0) {
        // Aprenden que el jugador trae comida, y van enseguida a buscarla.
        for (const animal of next.animals) {
          if (!animal.alive) continue;
          animal.feedingTrust = Math.min(
            1,
            animal.feedingTrust +
              config.fish.feedingTrustPerFeeding * (0.5 + 0.5 * animal.personality.boldness),
          );
        }
        redecide(next, config);
      }
      break;
    }

    case 'waterChange': {
      // Se saca una fracción del agua con todo lo disuelto (y parte de los
      // residuos) y se repone el mismo volumen con agua de la canilla.
      const fraction = clamp(action.fraction, 0, 1);
      const liters = next.tank.waterLiters * fraction;
      const temperatureBefore = next.water.temperatureC;
      next.tank.waterLiters -= liters;
      addTapWater(next, liters, action.conditioned, config, action.temperatureC);
      // Cambios bruscos: otra temperatura, o demasiada agua de golpe, estresan.
      const s = config.stress;
      const shift = Math.abs(next.water.temperatureC - temperatureBefore);
      const shock =
        Math.max(0, shift - s.waterChangeTempToleranceC) * s.waterChangeTempPerC +
        (fraction > s.bigWaterChangeFraction ? s.bigWaterChange : 0);
      if (shock > 0) {
        for (const animal of next.animals) {
          if (animal.alive) animal.stress = Math.min(100, animal.stress + shock);
        }
      }
      // Sifonear el fondo saca bastante más suciedad que solo sacar agua.
      const removed = action.vacuum
        ? Math.min(1, fraction * config.organics.vacuumEfficiency)
        : fraction;
      next.organics.detritusG *= 1 - removed;
      next.organics.foodG *= 1 - removed;
      next.food.sinkingG *= 1 - fraction;
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
      if (next.filter.mediaCapacity <= 0) break;
      const f = config.filter;
      let loss = f.goodCleanBacteriaLoss;
      if (action.method === 'tapWater' && config.tapWater.chlorine > 0) {
        // Mal: bajo la canilla, el cloro mata entre el 70 y el 90% de la colonia.
        const rng = new Rng(next.rngState);
        loss = rng.range(f.badCleanBacteriaLossMin, f.badCleanBacteriaLossMax);
        next.rngState = rng.state;
      }
      killFilterBacteria(next, loss, config);
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

    case 'replaceFilterMedia': {
      // Cambiar todo el material de golpe: se va la colonia entera del filtro.
      if (next.filter.mediaCapacity <= 0) break;
      killFilterBacteria(next, 1, config);
      next.filter.clog = 0;
      next.organics.detritusG *= 1 - config.filter.cleanDetritusRemoval;
      events.push({ type: 'filter_media_replaced', timeMinutes });
      break;
    }

    case 'addConditioner': {
      next.water.chlorine = 0;
      events.push({ type: 'conditioner_added', timeMinutes });
      break;
    }

    case 'scrubGlass': {
      if(![action.x,action.y,action.radius,action.strength].every(Number.isFinite))break;
      const removed=scrubGlass(next.algae,clamp(action.x,0,1),clamp(action.y,0,1),clamp(action.radius,0.01,0.3),clamp(action.strength,0,1));
      if(removed>0)events.push({type:'glass_cleaned',timeMinutes,coverageRemoved:removed});
      break;
    }
    case 'cleanGlass': {
      const removed = next.algae.glass * config.algae.scrubRemovalFraction;
      const before=next.algae.glass;
      next.algae.glass = Math.max(config.algae.seedCoverage, next.algae.glass - removed);
      if(next.algae.glassCells)next.algae.glassCells=next.algae.glassCells.map(v=>before>0?v*next.algae.glass/before:next.algae.glass);
      events.push({ type: 'glass_cleaned', timeMinutes, coverageRemoved: removed });
      break;
    }

    case 'addSeededMedia': {
      if (next.filter.mediaCapacity <= 0) break;
      const amount =
        config.nitrogen.seededMediaCapacityMgNPerDayPerLiter * next.tank.fullLiters;
      const max = next.filter.mediaCapacity;
      next.bacteria.filter.aob = Math.min(max, next.bacteria.filter.aob + amount);
      next.bacteria.filter.nob = Math.min(max, next.bacteria.filter.nob + amount);
      events.push({ type: 'seeded_media_added', timeMinutes });
      break;
    }

    case 'doseAmmonia': {
      const ppm = Math.max(0, action.ppm);
      next.water.ammonia += ppm;
      next.water.kh +=
        ppm * NITROGEN_FRACTION.ammonia * config.nitrogen.khReleasedPerMgNAmmonified;
      events.push({ type: 'ammonia_dosed', timeMinutes, ppm });
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
      next.filter.running = action.running && next.filter.flowLph > 0;
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

    case 'setWindow':
      next.room.windowOpen = action.open;
      break;

    case 'setOutdoorBase':
      next.room.outdoorBaseC = action.baseC;
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

    case 'addAnimals': {
      const species = getSpecies(action.speciesId);
      const count = Math.max(0, Math.floor(action.count));
      const males = clamp(action.males ?? defaultMales(species, count), 0, count);
      const rng = new Rng(next.rngState);
      for (let i = 0; i < count; i++) {
        const animal = createAnimal(
          next,
          species.id,
          i < males ? 'male' : 'female',
          rng,
          config,
          action.ageDays,
        );
        next.animals.push(animal);
        events.push({ type: 'animal_added', timeMinutes, id: animal.id, speciesId: species.id });
      }
      next.rngState = rng.state;
      break;
    }

    case 'removeAnimal': {
      const animal = next.animals.find((a) => a.id === action.id);
      if (!animal) break;
      next.animals = next.animals.filter((a) => a !== animal);
      events.push({ type: 'animal_removed', timeMinutes, id: animal.id, speciesId: animal.speciesId });
      break;
    }

    case 'removeDead': {
      for (const animal of next.animals) {
        if (animal.alive) continue;
        events.push({ type: 'animal_removed', timeMinutes, id: animal.id, speciesId: animal.speciesId });
      }
      next.animals = next.animals.filter((animal) => animal.alive);
      break;
    }

    case 'nameAnimal': {
      const animal = next.animals.find((a) => a.id === action.id);
      if (animal) animal.name = action.name.trim().slice(0, 24) || null;
      break;
    }

    case 'tapGlass':
      // Golpear el vidrio asusta a todos y les sube el estrés: no hay que hacerlo.
      scareAnimals(next, config.stress.tapGlass, false, config);
      events.push({ type: 'glass_tapped', timeMinutes, by: 'player' });
      break;

    case 'petCat':
      petCat(next, config, events);
      break;

    case 'fillCatBowl':
      fillCatBowl(next, events);
      break;
  }

  updatePh(next, config);
  events.push(...updateAlerts(next, config));
  return { state: next, events };
}
