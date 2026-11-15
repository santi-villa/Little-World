/**
 * Animales de la pecera: necesidades (hambre, estrés, salud, edad, ánimo),
 * personalidad y lo que le hacen al agua.
 *
 * Las funciones "step*" mutan el borrador que les pasa step().
 */

import { clamp } from './chemistry';
import { MINUTES_PER_DAY, MINUTES_PER_HOUR } from './clock';
import type { SimConfig } from './config';
import { freeAmmoniaPpm, oxygenRelative } from './derive';
import type { Rng } from './rng';
import { getSpecies, hasTrait, type Species } from './species';
import type { AnimalState, DeathCause, Mood, Sex, SimEvent, SimState } from './types';
import { addAmmoniaNitrogen } from './water';

/** ¿Un adulto de `predator` se come a `prey`? */
export function canEatSpecies(predator: Species, prey: Species, config: SimConfig): boolean {
  if (predator.id === prey.id) return false;
  if (predator.predatorOf.includes(prey.id)) return true;
  return (
    hasTrait(predator, 'opportunistic_predator') &&
    prey.adultSizeCm <= predator.adultSizeCm * config.fish.predationSizeRatio
  );
}

/** Tamaño relativo al adulto (los animales llegan jóvenes y crecen). */
export function sizeFactor(animal: AnimalState, config: SimConfig): number {
  const f = config.fish;
  return (
    f.juvenileSizeFraction +
    (1 - f.juvenileSizeFraction) * clamp(animal.ageDays / f.adultAgeDays, 0, 1)
  );
}

export function isAdult(animal: AnimalState, config: SimConfig): boolean {
  return animal.ageDays >= config.fish.adultAgeDays;
}

export function moodOf(animal: AnimalState, config: SimConfig): Mood {
  const h = config.health;
  if (animal.health < h.sickBelow) return 'sick';
  if (animal.stress > h.stressedAbove) return 'stressed';
  if (
    animal.stress < h.happyStressBelow &&
    animal.health > h.happyHealthAbove &&
    animal.hunger < config.fish.veryHungryAt
  ) {
    return 'happy';
  }
  return 'normal';
}

export function createAnimal(
  state: SimState,
  speciesId: string,
  sex: Sex,
  rng: Rng,
  config: SimConfig,
  ageDays: number = config.fish.newAnimalAgeDays,
): AnimalState {
  const species = getSpecies(speciesId);
  const shy = hasTrait(species, 'shy') ? 0.7 : 1;
  const curious = hasTrait(species, 'curious') ? 0.3 : 0;
  const animal: AnimalState = {
    id: state.nextAnimalId++,
    speciesId,
    name: null,
    sex,
    ageDays,
    lifespanDays: rng.range(species.lifespanYears[0], species.lifespanYears[1]) * 365,
    addedAtMinutes: state.timeMinutes,
    hunger: 0.1,
    stress: 30,
    health: 100,
    personality: {
      boldness: rng.next() * shy,
      activity: rng.next(),
      curiosity: Math.min(1, rng.next() * (1 - curious) + curious),
    },
    intent: 'hide',
    intentUntil: state.timeMinutes,
    targetId: null,
    fright: 0,
    catHabituation: 0,
    feedingTrust: 0,
    finDamage: 0,
    mood: 'normal',
    alive: true,
    corpseG: 0,
  };
  // Nunca llega más viejo que su propia esperanza de vida.
  animal.ageDays = Math.min(animal.ageDays, animal.lifespanDays * 0.5);
  return animal;
}

/**
 * Lo que depende solo de quiénes viven en la pecera (no del agua ni de la
 * hora). Se calcula una vez por step() y se rehace cuando alguien muere.
 */
export interface TankContext {
  stale: boolean;
  /** Especie de cada animal, por índice. */
  species: Species[];
  /** Estrés social fijo de cada animal: grupo chico, pecera chica, rivales, depredadores. */
  social: number[];
  aliveCount: number;
  /** Índices de los mordedores de aletas y de los que tienen aletas largas. */
  nippers: number[];
  nipTargets: number[];
  /** 1 normal; más si los mordedores están en grupo chico. */
  nipIntensity: number;
  /** Depredador (adulto) -> presas, por índice. */
  preyOf: Map<number, number[]>;
  /** Machos rivales por especie (solo si hay más machos de los que la especie tolera). */
  rivals: Map<string, number[]>;
  females: Map<string, number[]>;
  countBySpecies: Map<string, number>;
}

export function buildContext(state: SimState, config: SimConfig): TankContext {
  const animals = state.animals;
  const s = config.stress;
  const species = animals.map((animal) => getSpecies(animal.speciesId));
  const countBySpecies = new Map<string, number>();
  const males = new Map<string, number[]>();
  const females = new Map<string, number[]>();
  const nippers: number[] = [];
  const nipTargets: number[] = [];
  let aliveCount = 0;

  for (let i = 0; i < animals.length; i++) {
    const animal = animals[i] as AnimalState;
    if (!animal.alive) continue;
    const sp = species[i] as Species;
    aliveCount++;
    countBySpecies.set(sp.id, (countBySpecies.get(sp.id) ?? 0) + 1);
    const bySex = animal.sex === 'male' ? males : females;
    const list = bySex.get(sp.id);
    if (list) list.push(i);
    else bySex.set(sp.id, [i]);
    if (sp.finNipper) nippers.push(i);
    if (sp.longFins) nipTargets.push(i);
  }

  const rivals = new Map<string, number[]>();
  for (const [id, list] of males) {
    const max = getSpecies(id).maxMales;
    if (max !== null && list.length > max) rivals.set(id, list);
  }

  let nipIntensity = 0;
  if (nippers.length > 0) {
    const sp = species[nippers[0] as number] as Species;
    nipIntensity =
      Math.min(1, nippers.length / 3) * ((countBySpecies.get(sp.id) ?? 0) < sp.minGroup ? 2 : 1);
  }

  const preyOf = new Map<number, number[]>();
  const hunted = new Set<number>();
  for (let i = 0; i < animals.length; i++) {
    const predator = animals[i] as AnimalState;
    const sp = species[i] as Species;
    if (!predator.alive || !isAdult(predator, config)) continue;
    if (sp.predatorOf.length === 0 && !hasTrait(sp, 'opportunistic_predator')) continue;
    const prey: number[] = [];
    for (let j = 0; j < animals.length; j++) {
      if (!(animals[j] as AnimalState).alive) continue;
      if (canEatSpecies(sp, species[j] as Species, config)) {
        prey.push(j);
        hunted.add(j);
      }
    }
    if (prey.length > 0) preyOf.set(i, prey);
  }

  const liters = state.tank.fullLiters;
  const social = animals.map((animal, i) => {
    if (!animal.alive) return 0;
    const sp = species[i] as Species;
    let stress = 0;
    const count = countBySpecies.get(sp.id) ?? 0;
    if (count < sp.minGroup) stress += s.smallGroup * (1 - count / sp.minGroup);
    if (liters < sp.minTankL) stress += s.smallTank * (1 - liters / sp.minTankL);
    if (animal.sex === 'male' && rivals.has(sp.id)) stress += s.rivalMale;
    if (sp.longFins && nippers.some((n) => n !== i)) {
      stress += s.finNipperPresent * Math.min(1.5, nipIntensity);
    }
    if (hunted.has(i)) stress += s.predatorPresent;
    return stress;
  });

  return {
    stale: false,
    species,
    social,
    aliveCount,
    nippers,
    nipTargets,
    nipIntensity,
    preyOf,
    rivals,
    females,
    countBySpecies,
  };
}

/** 0 hasta la mitad del umbral de estrés, `atStress` en el umbral, `atDanger` en el de peligro. */
function ramp(value: number, stress: number, danger: number, atStress: number, atDanger: number): number {
  if (value <= stress * 0.5) return 0;
  if (value < stress) return (atStress * (value - stress * 0.5)) / (stress * 0.5);
  return atStress + (atDanger - atStress) * Math.min(2, (value - stress) / (danger - stress));
}

function severity(value: number, stress: number, danger: number): number {
  return clamp((value - stress) / (danger - stress), 0, 2);
}

/** Factor metabólico: el hambre y los desechos van más rápido con el agua cálida. */
export function metabolism(temperatureC: number, config: SimConfig): number {
  const f = config.fish;
  return Math.pow(f.metabolismQ10, (temperatureC - f.metabolismReferenceC) / 10);
}

function kill(
  state: SimState,
  animal: AnimalState,
  species: Species,
  cause: DeathCause,
  config: SimConfig,
  events: SimEvent[],
  bySpeciesId?: string,
): void {
  animal.alive = false;
  animal.health = 0;
  animal.intent = 'rest';
  animal.targetId = null;
  animal.corpseG =
    cause === 'eaten' ? 0 : species.bioload * sizeFactor(animal, config) * config.fish.corpseGPerBioload;
  events.push({
    type: 'animal_died',
    timeMinutes: state.timeMinutes,
    id: animal.id,
    speciesId: animal.speciesId,
    name: animal.name,
    cause,
    ...(bySpeciesId ? { bySpeciesId } : {}),
  });
}

/** Avanza las necesidades de todos los animales y lo que excretan. */
export function stepAnimals(
  state: SimState,
  dtMinutes: number,
  ctx: TankContext,
  config: SimConfig,
  events: SimEvent[],
): void {
  const animals = state.animals;
  if (animals.length === 0) return;
  const f = config.fish;
  const s = config.stress;
  const h = config.health;
  const t = config.thresholds;
  const water = state.water;
  const dtDays = dtMinutes / MINUTES_PER_DAY;
  const dtHours = dtMinutes / MINUTES_PER_HOUR;

  const nh3 = freeAmmoniaPpm(state);
  const oxygen = oxygenRelative(state, config);
  // El oxígeno es "al revés": cuanto menos, peor.
  const oxygenLack = 1 - oxygen;
  const oxygenStress = ramp(oxygenLack, 1 - t.oxygenStress, 1 - t.oxygenDanger, s.oxygenStress, s.oxygenDanger);
  const otherWaterStress =
    ramp(nh3, t.nh3StressPpm, t.nh3DangerPpm, s.nh3Stress, s.nh3Danger) +
    ramp(water.nitrite, t.nitriteStressPpm, t.nitriteDangerPpm, s.nitriteStress, s.nitriteDanger) +
    ramp(water.nitrate, t.nitrateStressPpm, t.nitrateDangerPpm, s.nitrateStress, s.nitrateDanger) +
    water.chlorine * s.chlorinePerPpm;
  const oxygenLoss = h.oxygenLossPerDay * severity(oxygenLack, 1 - t.oxygenStress, 1 - t.oxygenDanger);
  const otherWaterLoss =
    h.nh3LossPerDay * severity(nh3, t.nh3StressPpm, t.nh3DangerPpm) +
    h.nitriteLossPerDay * severity(water.nitrite, t.nitriteStressPpm, t.nitriteDangerPpm) +
    h.chlorineLossPerDayPerPpm * water.chlorine;

  const metabolic = metabolism(water.temperatureC, config);
  const hungerGain = f.hungerPerDay * metabolic * dtDays;
  const riseKeep = Math.exp(-dtHours / s.riseHours);
  const fallKeep = Math.exp(-dtHours / s.fallHours);
  const frightKeep = Math.pow(0.5, dtMinutes / f.frightHalfLifeMinutes);
  const corpseRot = 1 - Math.exp(-f.corpseDecayPerDay * dtDays);
  const cat = state.cat;
  const catWatching = cat.behavior === 'watch_fish' || cat.behavior === 'tap_glass';
  const catStress = cat.watchingMinutes > config.cat.watchStressAfterMinutes ? s.catWatching : 0;
  const habituation =
    (dtDays / config.cat.habituationDays) * (catWatching ? config.cat.habituationWatchBonus : 1);
  const grazeFood = Math.min(
    1,
    f.biofilmAvailability +
      (state.algae.glass + state.algae.decor) / (2 * f.grazingHalfCoverage),
  );

  let excreting = 0;
  let grazedBioload = 0;

  for (let i = 0; i < animals.length; i++) {
    const a = animals[i] as AnimalState;
    if (!a.alive) {
      if (a.corpseG > 0) {
        const rotted = a.corpseG < 1e-4 ? a.corpseG : a.corpseG * corpseRot;
        a.corpseG -= rotted;
        state.organics.foodG += rotted;
      }
      continue;
    }
    const sp = ctx.species[i] as Species;

    // Hambre. Los que raspan algas y biofilm comen solos, de a poco.
    a.hunger = Math.min(1, a.hunger + hungerGain);
    if (a.hunger > 0.05 && (sp.category !== 'fish' || sp.traits.includes('algae_eater'))) {
      a.hunger = Math.max(0.05, a.hunger - f.grazingHungerPerDay * grazeFood * metabolic * dtDays);
      grazedBioload += sp.bioload;
    }

    // Estrés: tiende de a poco a la suma de lo que lo molesta.
    const temperature = water.temperatureC;
    const tempOut = Math.max(0, sp.temp[0] - temperature, temperature - sp.temp[1]);
    // Al pH se adaptan bastante: un desvío chico no molesta.
    const phOut = Math.max(
      0,
      sp.ph[0] - water.ph - s.phToleranceUnits,
      water.ph - sp.ph[1] - s.phToleranceUnits,
    );
    const breathesAir = sp.traits.includes('labyrinth');
    let target =
      otherWaterStress +
      (breathesAir ? oxygenStress * 0.3 : oxygenStress) +
      tempOut * s.tempPerC +
      phOut * s.phPerUnit +
      (ctx.social[i] as number) +
      a.finDamage * s.finDamage +
      catStress * (1 - a.catHabituation);
    const hungerOver = a.hunger - f.veryHungryAt;
    if (hungerOver > 0) target += (s.hunger * hungerOver) / (1 - f.veryHungryAt);
    if (target > 100) target = 100;
    a.stress = target + (a.stress - target) * (target > a.stress ? riseKeep : fallKeep);

    // Salud.
    const stressLoss =
      a.stress > h.stressAbove
        ? (h.stressLossPerDay * (a.stress - h.stressAbove)) / (100 - h.stressAbove)
        : 0;
    const starvationLoss =
      a.hunger > f.starvingAt
        ? (h.starvationLossPerDay * (a.hunger - f.starvingAt)) / (1 - f.starvingAt)
        : 0;
    const waterLoss =
      otherWaterLoss +
      (breathesAir ? oxygenLoss * 0.3 : oxygenLoss) +
      (tempOut > h.temperatureGraceC
        ? (tempOut - h.temperatureGraceC) * h.temperatureLossPerDayPerC
        : 0);
    const loss = Math.min(h.maxLossPerDay, stressLoss + starvationLoss + waterLoss);
    if (loss > 0.01) a.health -= loss * dtDays;
    else if (a.health < 100) {
      a.health = Math.min(100, a.health + h.recoverPerDay * (1 - a.stress / 100) * dtDays);
    }

    a.ageDays += dtDays;
    if (a.fright > 0) a.fright = a.fright < 0.01 ? 0 : a.fright * frightKeep;
    if (a.catHabituation < config.cat.habituationMax) {
      a.catHabituation = Math.min(config.cat.habituationMax, a.catHabituation + habituation);
    }

    if (a.health <= 0) {
      const cause: DeathCause =
        starvationLoss >= waterLoss && starvationLoss >= stressLoss
          ? 'starvation'
          : waterLoss >= stressLoss
            ? 'water'
            : 'stress';
      kill(state, a, sp, cause, config, events);
      ctx.stale = true;
      continue;
    }
    if (a.ageDays >= a.lifespanDays) {
      kill(state, a, sp, 'old_age', config, events);
      ctx.stale = true;
      continue;
    }

    const mood = moodOf(a, config);
    if (mood !== a.mood) {
      // Solo se avisa lo que importa: cuando alguien empieza o deja de estar mal.
      const bad = (m: Mood): boolean => m === 'stressed' || m === 'sick';
      if (bad(mood) !== bad(a.mood) || (bad(mood) && bad(a.mood))) {
        events.push({
          type: 'animal_mood',
          timeMinutes: state.timeMinutes,
          id: a.id,
          speciesId: a.speciesId,
          mood,
          previous: a.mood,
        });
      }
      a.mood = mood;
    }

    // Un pez en ayunas excreta menos.
    excreting +=
      sp.bioload *
      sizeFactor(a, config) *
      (f.fastingExcretionFraction + (1 - f.fastingExcretionFraction) * (1 - a.hunger));
  }

  if (excreting > 0) {
    const load = excreting * metabolic * dtDays;
    const mgN = load * f.ammoniaMgNPerDayPerBioload;
    addAmmoniaNitrogen(state, mgN, config);
    water.phosphate +=
      (mgN * config.organics.bioloadPhosphateMgPerMgN) / state.tank.waterLiters;
    state.organics.detritusG += load * f.wasteGPerDayPerBioload;
    water.oxygen = Math.max(
      0,
      water.oxygen - (load * f.oxygenMgPerDayPerBioload) / state.tank.waterLiters,
    );
  }
  if (grazedBioload > 0) {
    const eaten = grazedBioload * f.grazingCoveragePerBioloadDay * dtDays;
    const floor = config.algae.seedCoverage;
    state.algae.glass = Math.max(floor, state.algae.glass - eaten * state.algae.glass);
    state.algae.decor = Math.max(floor, state.algae.decor - eaten * state.algae.decor);
  }
}

/**
 * Mordidas de aletas y depredación. Se resuelven una vez por hora de reloj
 * (en el cruce de hora), así no dependen de cómo se parta el tiempo en pasos.
 */
export function stepInteractions(
  state: SimState,
  hoursCrossed: number,
  ctx: TankContext,
  rng: Rng,
  config: SimConfig,
  events: SimEvent[],
): void {
  if (hoursCrossed <= 0 || ctx.aliveCount === 0) return;
  const f = config.fish;
  const animals = state.animals;

  if (ctx.nipTargets.length > 0) {
    const nipperIndex = ctx.nippers[0];
    for (const index of ctx.nipTargets) {
      const victim = animals[index] as AnimalState;
      if (!victim.alive) continue;
      const attacked = nipperIndex !== undefined && ctx.nippers.some((n) => n !== index);
      if (attacked) {
        const before = victim.finDamage;
        victim.finDamage = Math.min(1, before + f.nipDamagePerHour * ctx.nipIntensity * hoursCrossed);
        if (before < 0.15 && victim.finDamage >= 0.15) {
          events.push({
            type: 'fin_nipped',
            timeMinutes: state.timeMinutes,
            id: victim.id,
            speciesId: victim.speciesId,
            bySpeciesId: (ctx.species[nipperIndex as number] as Species).id,
          });
        }
      } else if (victim.finDamage > 0) {
        victim.finDamage = Math.max(0, victim.finDamage - (f.finHealPerDay / 24) * hoursCrossed);
      }
    }
  }

  if (ctx.preyOf.size > 0) {
    const eaten: number[] = [];
    for (const [predatorIndex, prey] of ctx.preyOf) {
      const predator = animals[predatorIndex] as AnimalState;
      if (!predator.alive) continue;
      // Un depredador con hambre caza más.
      const perHour = f.predationChancePerHour * (0.5 + predator.hunger);
      const chance = 1 - Math.pow(1 - Math.min(0.9, perHour), hoursCrossed);
      if (!rng.chance(chance)) continue;
      const alive = prey.filter((j) => (animals[j] as AnimalState).alive);
      if (alive.length === 0) continue;
      const index = alive[rng.int(0, alive.length - 1)] as number;
      const victim = animals[index] as AnimalState;
      kill(
        state,
        victim,
        ctx.species[index] as Species,
        'eaten',
        config,
        events,
        (ctx.species[predatorIndex] as Species).id,
      );
      predator.hunger = Math.max(0, predator.hunger - 0.3);
      eaten.push(victim.id);
    }
    if (eaten.length > 0) {
      // Desaparece sin dejar rastro (fuera de cámara, sin gore).
      state.animals = animals.filter((animal) => !eaten.includes(animal.id));
      ctx.stale = true;
    }
  }
}

/**
 * Susto general (golpe al vidrio, pata del gato): todos huyen un momento y
 * sube el estrés. Al gato se acostumbran con los días.
 */
export function scareAnimals(
  state: SimState,
  stress: number,
  fromCat: boolean,
  config: SimConfig,
): void {
  for (const a of state.animals) {
    if (!a.alive) continue;
    const k = fromCat ? 1 - a.catHabituation : 1;
    if (k <= 0) continue;
    a.fright = Math.min(1, Math.max(a.fright, k * (1.2 - 0.5 * a.personality.boldness)));
    a.stress = Math.min(100, a.stress + stress * k);
    a.intent = 'flee';
    a.targetId = null;
    a.intentUntil = state.timeMinutes + config.fish.frightHalfLifeMinutes * (2 - a.personality.boldness);
  }
}
