import { describe, expect, it } from 'vitest';
import {
  applyAction,
  catchUp,
  defaultConfig,
  getSpecies,
  step,
  type AnimalState,
  type SimState,
} from '../src/sim';
import { DAY, HOUR, matureTank } from './helpers';

/** Pecera madura de 60 L con animales recién agregados. */
function stocked(stock: [string, number, number?][], seed: number | string = 5): SimState {
  let state = emptyMature(seed);
  for (const [speciesId, count, males] of stock) {
    state = applyAction(state, { type: 'addAnimals', speciesId, count, males }).state;
  }
  return state;
}

/** Pecera madura (con bacterias para una carga moderada) y todavía sin animales. */
function emptyMature(seed: number | string = 5): SimState {
  return applyAction(matureTank(seed), { type: 'setBioload', ammoniaMgNPerDay: 0 }).state;
}

const alive = (state: SimState): AnimalState[] => state.animals.filter((a) => a.alive);
const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;
const ofSpecies = (state: SimState, id: string): AnimalState[] =>
  alive(state).filter((a) => a.speciesId === id);

/** Varios días dándoles de comer dos veces por día. */
function keep(state: SimState, days: number, gramsPerMeal = 0.05): SimState {
  for (let i = 0; i < days * 2; i++) {
    state = applyAction(state, { type: 'feed', grams: gramsPerMeal }).state;
    state = step(state, DAY / 2).state;
  }
  return state;
}

describe('individuos', () => {
  it('cada uno nace con su personalidad, sexo y esperanza de vida', () => {
    const state = stocked([['neon_tetra', 10]]);
    expect(state.animals).toHaveLength(10);
    const boldness = state.animals.map((a) => a.personality.boldness);
    expect(new Set(boldness).size).toBe(10);
    for (const a of state.animals) {
      for (const value of Object.values(a.personality)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      const [min, max] = getSpecies('neon_tetra').lifespanYears;
      expect(a.lifespanDays).toBeGreaterThanOrEqual(min * 365);
      expect(a.lifespanDays).toBeLessThanOrEqual(max * 365);
    }
    expect(state.animals.filter((a) => a.sex === 'male')).toHaveLength(5);
    expect(new Set(state.animals.map((a) => a.id)).size).toBe(10);
  });

  it('la misma semilla da los mismos individuos', () => {
    expect(stocked([['guppy', 6]], 'x').animals).toEqual(stocked([['guppy', 6]], 'x').animals);
    expect(stocked([['guppy', 6]], 'x').animals).not.toEqual(stocked([['guppy', 6]], 'y').animals);
  });

  it('la edad avanza en días reales', () => {
    const start = stocked([['platy', 3]]);
    const later = step(start, 10 * DAY).state;
    expect(later.animals[0]!.ageDays - start.animals[0]!.ageDays).toBeCloseTo(10, 6);
  });
});

describe('estrés', () => {
  it('un grupo más chico que el mínimo vive estresado', () => {
    const few = keep(stocked([['neon_tetra', 2]]), 3);
    const enough = keep(stocked([['neon_tetra', 8]]), 3);
    const stressFew = mean(alive(few).map((a) => a.stress));
    const stressEnough = mean(alive(enough).map((a) => a.stress));
    expect(stressFew).toBeGreaterThan(stressEnough + 15);
    // Con el grupo completo y buena agua están tranquilos.
    expect(stressEnough).toBeLessThan(25);
    expect(alive(enough).every((a) => a.mood === 'happy' || a.mood === 'normal')).toBe(true);
  });

  it('cuanto más chico el grupo, más estrés', () => {
    const stress = [1, 3, 6].map((count) =>
      mean(alive(keep(stocked([['harlequin_rasbora', count]]), 2)).map((a) => a.stress)),
    );
    expect(stress[0]!).toBeGreaterThan(stress[1]!);
    expect(stress[1]!).toBeGreaterThan(stress[2]!);
  });

  it('dos bettas machos se estresan; uno solo, no', () => {
    const two = keep(stocked([['betta', 2, 2]]), 2, 0.02);
    const one = keep(stocked([['betta', 1, 1]]), 2, 0.02);
    expect(mean(alive(two).map((a) => a.stress))).toBeGreaterThan(40);
    expect(alive(one)[0]!.stress).toBeLessThan(20);
    expect(alive(two).some((a) => a.mood === 'stressed')).toBe(true);
  });

  it('agua fuera de rango de temperatura estresa a la especie que no la tolera', () => {
    let state = stocked([
      ['ram', 2],
      ['zebra_danio', 6],
    ]);
    state = applyAction(state, { type: 'setHeater', setpointC: 21 }).state;
    state = keep(state, 3);
    // 21 °C: perfecto para el danio (18–26), frío para el ramirezi (26–30).
    expect(mean(ofSpecies(state, 'ram').map((a) => a.stress))).toBeGreaterThan(
      mean(ofSpecies(state, 'zebra_danio').map((a) => a.stress)) + 30,
    );
  });

  it('golpear el vidrio los asusta y les sube el estrés', () => {
    const calm = keep(stocked([['neon_tetra', 8]]), 2);
    const result = applyAction(calm, { type: 'tapGlass' });
    expect(result.events.some((e) => e.type === 'glass_tapped' && e.by === 'player')).toBe(true);
    for (let i = 0; i < calm.animals.length; i++) {
      const before = calm.animals[i]!;
      const after = result.state.animals[i]!;
      expect(after.stress).toBeGreaterThan(before.stress);
      expect(after.fright).toBeGreaterThan(0.5);
      expect(after.intent).toBe('flee');
    }
    // El susto se pasa en unos minutos.
    const later = step(result.state, 20).state;
    expect(later.animals.every((a) => a.fright < 0.01 && a.intent !== 'flee')).toBe(true);
  });

  it('un cambio de agua fría y grande los estresa; uno bien hecho, no', () => {
    const calm = keep(stocked([['platy', 4]]), 2);
    const good = applyAction(calm, {
      type: 'waterChange',
      fraction: 0.3,
      conditioned: true,
      temperatureC: calm.water.temperatureC,
    }).state;
    const bad = applyAction(calm, {
      type: 'waterChange',
      fraction: 0.7,
      conditioned: true,
      temperatureC: 12,
    }).state;
    expect(good.animals[0]!.stress).toBeCloseTo(calm.animals[0]!.stress, 6);
    expect(bad.animals[0]!.stress).toBeGreaterThan(calm.animals[0]!.stress + 30);
  });
});

describe('hambre y ausencia', () => {
  it('3 días de ausencia sin comer: tienen hambre pero no muere nadie', () => {
    const fed = keep(
      stocked([
        ['neon_tetra', 8],
        ['corydoras_paleatus', 6],
        ['betta', 1],
      ]),
      2,
    );
    const result = catchUp(fed, 3 * DAY);
    expect(result.events.filter((e) => e.type === 'animal_died')).toEqual([]);
    expect(alive(result.state)).toHaveLength(15);
    for (const a of alive(result.state)) {
      expect(a.hunger).toBeGreaterThan(defaultConfig.fish.hungryAt);
      expect(a.hunger).toBeLessThan(defaultConfig.fish.starvingAt);
      // "Un pez sano aguanta de 3 a 5 días sin comer sin problemas".
      expect(a.health).toBeGreaterThan(95);
      expect(a.mood).not.toBe('sick');
    }
    expect(result.summary.lines.some((l) => /hambr/.test(l.text))).toBe(true);
  });

  it('5 días tampoco matan a nadie; semanas sin comer, sí', () => {
    const fed = keep(stocked([['platy', 4]]), 2);
    expect(alive(catchUp(fed, 5 * DAY).state)).toHaveLength(4);
    const month = catchUp(fed, 30 * DAY);
    const deaths = month.events.filter((e) => e.type === 'animal_died');
    expect(deaths.length).toBeGreaterThan(0);
    expect(deaths.every((e) => e.type === 'animal_died' && e.cause === 'starvation')).toBe(true);
    // Nadie muere de golpe: el primero cae después de más de una semana.
    expect(deaths[0]!.timeMinutes - fed.timeMinutes).toBeGreaterThan(8 * DAY);
  });

  it('el hambre sube más rápido con el agua cálida', () => {
    const start = stocked([['zebra_danio', 6]]);
    const cool = step(applyAction(start, { type: 'setHeater', setpointC: 19 }).state, 2 * DAY).state;
    const warm = step(applyAction(start, { type: 'setHeater', setpointC: 26 }).state, 2 * DAY).state;
    expect(warm.animals[0]!.hunger).toBeGreaterThan(cool.animals[0]!.hunger * 1.15);
  });

  it('un pez muerto que no se retira pudre el agua', () => {
    const start = stocked([['fancy_goldfish', 2]]);
    const dead: SimState = {
      ...start,
      animals: start.animals.map((a) => ({ ...a, alive: false, health: 0, corpseG: 10 })),
    };
    const left = step(dead, 3 * DAY).state;
    const removed = step(applyAction(dead, { type: 'removeDead' }).state, 3 * DAY).state;
    expect(removed.animals).toHaveLength(0);
    expect(left.water.ammonia + left.water.nitrite + left.water.nitrate).toBeGreaterThan(
      removed.water.ammonia + removed.water.nitrite + removed.water.nitrate + 1,
    );
  });

  it('mueren de viejos al final de su vida', () => {
    const start = stocked([['cherry_shrimp', 10]]);
    const old: SimState = {
      ...start,
      animals: start.animals.map((a) => ({ ...a, ageDays: a.lifespanDays - 0.5 })),
    };
    const result = step(old, DAY);
    const deaths = result.events.filter((e) => e.type === 'animal_died');
    expect(deaths).toHaveLength(10);
    expect(deaths.every((e) => e.type === 'animal_died' && e.cause === 'old_age')).toBe(true);
  });
});

describe('alimentación', () => {
  it('la comida flota, se hunde y lo que sobra termina como residuo en el fondo', () => {
    let state = applyAction(emptyMature(), { type: 'feed', grams: 1 }).state;
    expect(state.food.surfaceG).toBe(1);
    expect(state.organics.foodG).toBeCloseTo(emptyMature().organics.foodG, 9);
    state = step(state, 2).state;
    expect(state.food.surfaceG).toBeLessThan(0.6);
    expect(state.food.sinkingG).toBeGreaterThan(0.1);
    state = step(state, HOUR).state;
    // Sin peces, todo cae y queda pudriéndose.
    expect(state.food.surfaceG + state.food.sinkingG).toBe(0);
    expect(state.organics.foodG).toBeGreaterThan(0.95);
  });

  it('comen y se les pasa el hambre; no sobra casi nada si la ración es justa', () => {
    const hungry = step(stocked([['zebra_danio', 6]]), 2 * DAY).state;
    const hungerBefore = mean(alive(hungry).map((a) => a.hunger));
    const foodBefore = hungry.organics.foodG;
    const fed = step(applyAction(hungry, { type: 'feed', grams: 0.06 }).state, 30).state;
    expect(mean(alive(fed).map((a) => a.hunger))).toBeLessThan(hungerBefore - 0.1);
    expect(fed.organics.foodG - foodBefore).toBeLessThan(0.005);
    // Sobrealimentar: lo que no comen va a parar al fondo.
    const overfed = step(applyAction(hungry, { type: 'feed', grams: 2 }).state, 30).state;
    expect(overfed.organics.foodG - foodBefore).toBeGreaterThan(1.5);
  });

  it('cada uno come en su zona: los de superficie no bajan al fondo y viceversa', () => {
    const start = step(
      stocked([
        ['hatchetfish', 6],
        ['corydoras_paleatus', 6],
      ]),
      2 * DAY,
    ).state;
    // Comida que ya está en el fondo: solo la aprovechan los corydoras.
    const bottom: SimState = { ...start, organics: { ...start.organics, foodG: 0.5 } };
    const after = step(bottom, 30).state;
    const change = (id: string): number =>
      mean(ofSpecies(after, id).map((a) => a.hunger)) -
      mean(ofSpecies(bottom, id).map((a) => a.hunger));
    expect(change('corydoras_paleatus')).toBeLessThan(-0.1);
    expect(change('hatchetfish')).toBeGreaterThanOrEqual(0);
    // Una pizca flotando: se la comen los de arriba antes de que llegue abajo.
    const pinch = step(applyAction(start, { type: 'feed', grams: 0.03 }).state, 10).state;
    const pinchChange = (id: string): number =>
      mean(ofSpecies(pinch, id).map((a) => a.hunger)) -
      mean(ofSpecies(start, id).map((a) => a.hunger));
    expect(pinchChange('hatchetfish')).toBeLessThan(pinchChange('corydoras_paleatus') - 0.05);
  });

  it('con poca comida, los rápidos comen más que los lentos', () => {
    const start = step(
      stocked([
        ['zebra_danio', 6],
        ['angelfish', 0],
        ['cherry_barb', 6],
      ]),
      2 * DAY,
    ).state;
    const after = step(applyAction(start, { type: 'feed', grams: 0.01 }).state, 5).state;
    const gain = (id: string): number =>
      mean(ofSpecies(start, id).map((a) => a.hunger)) -
      mean(ofSpecies(after, id).map((a) => a.hunger));
    expect(gain('zebra_danio')).toBeGreaterThan(gain('cherry_barb'));
  });

  it('aprenden que el jugador trae comida', () => {
    let state = stocked([['guppy', 4]]);
    expect(state.animals.every((a) => a.feedingTrust === 0)).toBe(true);
    state = keep(state, 5, 0.02);
    expect(state.animals.every((a) => a.feedingTrust > 0.3)).toBe(true);
  });
});

describe('interacciones', () => {
  it('el barbo tigre le deshilacha las aletas al betta', () => {
    const state = keep(
      stocked([
        ['tiger_barb', 6],
        ['betta', 1],
      ]),
      5,
    );
    const betta = ofSpecies(state, 'betta')[0]!;
    expect(betta.finDamage).toBeGreaterThan(0.5);
    expect(betta.stress).toBeGreaterThan(30);
    expect(ofSpecies(state, 'tiger_barb').every((a) => a.finDamage === 0)).toBe(true);
  });

  it('el escalar adulto se va comiendo a los neones; el joven, no', () => {
    const young = keep(
      stocked([
        ['angelfish', 2],
        ['neon_tetra', 10],
      ]),
      20,
    );
    expect(ofSpecies(young, 'neon_tetra')).toHaveLength(10);

    let state = emptyMature();
    state = applyAction(state, { type: 'addAnimals', speciesId: 'angelfish', count: 2, ageDays: 400 }).state;
    state = applyAction(state, { type: 'addAnimals', speciesId: 'neon_tetra', count: 10 }).state;
    const events = [];
    for (let i = 0; i < 40; i++) {
      state = applyAction(state, { type: 'feed', grams: 0.1 }).state;
      const result = step(state, DAY / 2);
      state = result.state;
      events.push(...result.events);
    }
    const eaten = events.filter((e) => e.type === 'animal_died' && e.cause === 'eaten');
    expect(eaten.length).toBeGreaterThan(0);
    expect(ofSpecies(state, 'neon_tetra').length).toBe(10 - eaten.length);
    // Desaparecen: no queda un cuerpo que retirar.
    expect(state.animals.every((a) => a.alive)).toBe(true);
    expect(eaten.every((e) => e.type === 'animal_died' && e.bySpeciesId === 'angelfish')).toBe(true);
  });

  it('los peces cargan el agua: más peces, más nitrato', () => {
    const empty = step(emptyMature(), 7 * DAY).state;
    const full = keep(stocked([['platy', 8]]), 7, 0.08);
    expect(full.water.nitrate).toBeGreaterThan(empty.water.nitrate + 1);
  });
});
