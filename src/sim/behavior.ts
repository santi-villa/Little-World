/**
 * Decisiones de comportamiento: qué quiere hacer cada animal.
 *
 * La simulación solo decide la intención (comer, descansar, esconderse,
 * explorar, ir en cardumen, perseguir, huir, cortejar, pedir comida, boquear).
 * El movimiento fino y cómo se ve cada cosa viven en render/.
 *
 * Cada animal puntúa sus opciones según sus necesidades, su personalidad, la
 * hora y lo que pasa alrededor, y se queda con la mejor durante unos minutos.
 */

import { hourOfDay } from './clock';
import type { SimConfig } from './config';
import { isLightOn, oxygenRelative, freeAmmoniaPpm } from './derive';
import type { SimEnvironment } from './environment';
import { foodInReach } from './feeding';
import type { TankContext } from './fish';
import type { Rng } from './rng';
import { groupStyle, type Species } from './species';
import type { AnimalState, Intent, SimState } from './types';

export function isDaytime(state: SimState, config: SimConfig): boolean {
  const hour = hourOfDay(state.timeMinutes);
  return hour >= config.behavior.dayStartHour && hour < config.behavior.dayEndHour;
}

/**
 * ¿Es su hora de estar activo? Los diurnos descansan a oscuras; los
 * nocturnos salen cuando se apaga la luz de la pecera.
 */
export function isActivePeriod(species: Species, lightOn: boolean, daytime: boolean): boolean {
  return species.activity === 'nocturnal' ? !lightOn : lightOn || daytime;
}

function pick(list: readonly number[] | undefined, exclude: number, rng: Rng): number {
  if (!list) return -1;
  const others = list.length - (list.includes(exclude) ? 1 : 0);
  if (others <= 0) return -1;
  let n = rng.int(0, others - 1);
  for (const index of list) {
    if (index === exclude) continue;
    if (n-- === 0) return index;
  }
  return -1;
}

/**
 * Renueva la intención de los animales a los que se les venció la anterior
 * (o de todos, con `force`: cuando acaba de caer comida, por ejemplo).
 */
export function decideIntents(
  state: SimState,
  ctx: TankContext,
  rng: Rng,
  config: SimConfig,
  env: SimEnvironment,
  force = false,
): void {
  const animals = state.animals;
  if (ctx.aliveCount === 0) return;
  const now = state.timeMinutes;
  const b = config.behavior;
  const f = config.fish;
  let shared: {
    lightOn: boolean;
    daytime: boolean;
    catAtGlass: boolean;
    badAir: boolean;
    badWater: boolean;
  } | null = null;

  for (let i = 0; i < animals.length; i++) {
    const a = animals[i] as AnimalState;
    if (!a.alive || (!force && now < a.intentUntil)) continue;
    // Un susto en curso no se interrumpe porque cayó comida.
    if (force && a.intent === 'flee' && now < a.intentUntil) continue;
    if (!shared) {
      const t = config.thresholds;
      shared = {
        lightOn: isLightOn(state),
        daytime: isDaytime(state, config),
        catAtGlass: state.cat.behavior === 'watch_fish' || state.cat.behavior === 'tap_glass',
        badAir: oxygenRelative(state, config) < t.oxygenStress,
        badWater:
          freeAmmoniaPpm(state) > t.nh3DangerPpm || state.water.nitrite > t.nitriteDangerPpm,
      };
    }
    const sp = ctx.species[i] as Species;
    const p = a.personality;
    const active = isActivePeriod(sp, shared.lightOn, shared.daytime);
    const noise = (): number => rng.next() * b.noise;
    const group = groupStyle(sp);
    const mates = (ctx.countBySpecies.get(sp.id) ?? 0) - 1;

    let best: Intent = 'explore';
    let bestScore = 0.25 + 0.3 * p.curiosity + 0.2 * p.activity + noise();
    let target = -1;
    const consider = (intent: Intent, score: number, targetIndex = -1): void => {
      if (score > bestScore) {
        best = intent;
        bestScore = score;
        target = targetIndex;
      }
    };
    if (!active) bestScore *= 0.3;

    // Descansar: fuera de su horario, casi siempre.
    consider('rest', (active ? 0.05 + 0.15 * (1 - p.activity) : 0.9) + noise());

    // Esconderse: estrés, timidez, gato en el vidrio, recién llegado, nocturno con luz.
    let hide = (a.stress / 100) * (1.1 - p.boldness);
    if (shared.catAtGlass) hide += 0.5 * (1 - p.boldness) * (1 - a.catHabituation);
    if (now - a.addedAtMinutes < f.newcomerDays * 1440) hide += 0.35 * (1 - p.boldness);
    if (sp.activity === 'nocturnal' && shared.lightOn) hide += 0.6;
    consider('hide', hide + noise());

    // Cardumen.
    if (group !== 'none' && mates >= 1 && active) {
      consider('school', (group === 'schooling' ? 0.6 : 0.42) + 0.3 * a.fright + noise());
    }

    // Comer, o pedir comida al frente si aprendió que el jugador la trae.
    if (a.hunger > 0.03 && a.stress < 85) {
      if (foodInReach(state, sp, config)) {
        consider('eat', (0.6 + a.hunger) * (active ? 1 : 0.3) + noise());
      } else if (env.playerPresent && active && a.hunger > f.hungryAt) {
        consider('beg', a.feedingTrust * (0.35 + a.hunger) * (0.5 + 0.5 * p.boldness) + noise());
      }
    }

    // Boquear en la superficie: falta oxígeno o el agua está tóxica. Es una señal.
    if ((shared.badAir && !sp.traits.includes('labyrinth')) || shared.badWater) {
      if (sp.category === 'fish') consider('gasp', 0.95 + noise());
    }

    if (active && sp.category === 'fish') {
      // Persecución territorial entre machos rivales.
      if (a.sex === 'male' && ctx.rivals.has(sp.id)) {
        consider('chase', 0.7 + 0.2 * p.boldness + noise(), pick(ctx.rivals.get(sp.id), i, rng));
      }
      // Mordedores de aletas: peor en grupo chico.
      if (sp.finNipper && ctx.nipTargets.length > 0) {
        const victim = pick(ctx.nipTargets, i, rng);
        if (victim >= 0) consider('chase', 0.3 + 0.2 * ctx.nipIntensity + noise(), victim);
      }
      // Depredación: con hambre, más.
      const prey = ctx.preyOf.get(i);
      if (prey) consider('chase', 0.2 + 0.8 * a.hunger + noise(), pick(prey, i, rng));
      // Cortejo.
      if (a.sex === 'male' && (sp.traits.includes('courts') || sp.traits.includes('flares'))) {
        const female = pick(ctx.females.get(sp.id), i, rng);
        if (female >= 0) consider('court', 0.35 + 0.25 * p.activity + noise(), female);
      }
    }

    // Susto reciente: huir gana a casi todo.
    if (a.fright > 0.3) consider('flee', 1.2 * a.fright + 0.2 * (1 - p.boldness) + noise());

    const intent = best as Intent;
    const duration =
      intent === 'rest'
        ? b.restDecisionMinutes * (0.7 + 0.6 * rng.next())
        : intent === 'eat'
          ? b.eatDecisionMinutes
          : rng.range(b.decisionMinutesMin, b.decisionMinutesMax);
    a.intent = intent;
    a.intentUntil = now + duration;
    const targetAnimal = target >= 0 ? (animals[target] as AnimalState) : undefined;
    a.targetId = targetAnimal ? targetAnimal.id : null;

    // El perseguido se escapa (salvo que ya esté huyendo de otra cosa).
    if (intent === 'chase' && targetAnimal) {
      if (targetAnimal.intent !== 'flee' || now >= targetAnimal.intentUntil) {
        targetAnimal.intent = 'flee';
        targetAnimal.targetId = a.id;
        targetAnimal.intentUntil = now + duration;
      }
    } else if (intent === 'chase') {
      a.intent = 'explore';
    }
  }
}
