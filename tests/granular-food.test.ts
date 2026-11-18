import { describe, it, expect } from "vitest";
import {
  applyAction,
  createNewTank,
  defaultConfig,
  getSpecies,
  step,
} from "../src/sim";
import { cloneState } from "../src/sim/state";
import { buildContext } from "../src/sim/fish";
import { stepFood, fullMealG } from "../src/sim/feeding";
import {
  enableFoodGrains,
  applyGrainKinematics,
  grainTotals,
  publishFoodGrains,
  FOOD_GRAIN_LIMIT,
} from "../src/sim/food-grains";
import {
  createSave,
  parseSave,
  DEFAULT_SETTINGS,
} from "../src/save/save-format";
import { FoodParticles } from "../src/render/motion/food-particles";
import { WaterFlow } from "../src/render/motion/water-flow";
import { emptyHabitat } from "../src/render/motion/habitat";
import {
  sweepSolids,
  type HabitatSolid,
} from "../src/render/motion/solid-contact";
import { Sediment } from "../src/render/motion/sediment";
const tank = () => {
  const s = applyAction(createNewTank({ seed: 42 }), {
    type: "addAnimals",
    speciesId: "betta",
    count: 1,
  }).state;
  const a = s.animals[0]!;
  a.hunger = 0.5;
  a.stress = 0;
  a.fright = 0;
  a.intent = "eat";
  return applyAction(s, { type: "feed", grams: 0.01, kind: "pellets", x: 0.4 })
    .state;
};
const total = (s: ReturnType<typeof tank>) =>
  s.food.surfaceG + s.food.sinkingG + s.organics.foodG;
const rock: HabitatSolid = {
  key: "rock",
  x: 0.2,
  y: 0.4,
  width: 0.6,
  height: 0.4,
  z: 0.5,
  depth: 0.2,
  columns: 5,
  rows: 3,
  alpha: [1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1],
};
describe("comida persistente y física", () => {
  it("solo muerde el ID alcanzado y conserva masa y hambre, incluso entre dos peces", () => {
    const state = applyAction(tank(), {
      type: "addAnimals",
      speciesId: "betta",
      count: 1,
    }).state;
    for (const a of state.animals) {
      a.hunger = 0.5;
      a.stress = 0;
      a.fright = 0;
      a.intent = "eat";
    }
    for (const g of state.food.grains!) g.sinkAt = 100;
    const target = state.food.grains![0]!,
      before = total(state),
      others = state.food.grains!.slice(1).map((g) => g.grams),
      mask = Object.fromEntries(state.animals.map((a) => [a.id, 1])),
      contacts = Object.fromEntries(
        state.animals.map((a) => [a.id, [target.id]]),
      );
    stepFood(
      state,
      0.1,
      buildContext(state, defaultConfig),
      defaultConfig,
      mask,
      {},
    );
    expect(total(state)).toBeCloseTo(before, 12);
    stepFood(
      state,
      0.1,
      buildContext(state, defaultConfig),
      defaultConfig,
      mask,
      contacts,
    );
    expect(target.grams).toBeLessThan(0.01 / 18);
    expect(
      state.food.grains!.filter((g) => g.id !== target.id).map((g) => g.grams),
    ).toEqual(others);
    const eaten = state.animals.reduce(
      (sum, a) =>
        sum +
        (0.5 - a.hunger) * fullMealG(getSpecies(a.speciesId), a, defaultConfig),
      0,
    );
    expect(total(state) + eaten).toBeCloseTo(before, 12);
  });
  it("migra v3, persiste posición/velocidad/soporte y no comparte partículas al clonar", () => {
    const old = createNewTank();
    old.food.surfaceG = 0.002;
    const migrated = parseSave({
      ...createSave(old, DEFAULT_SETTINGS, 1),
      formatVersion: 3,
    });
    expect(migrated.status).toBe("ok");
    if (migrated.status !== "ok") return;
    const s = migrated.save.sim;
    enableFoodGrains(s);
    const g = s.food.grains![0]!;
    g.layer = 1;
    publishFoodGrains(s);
    applyGrainKinematics(s, [
      {
        id: g.id,
        x: 0.31,
        y: 0.42,
        z: 0.7,
        vx: 0.12,
        vy: 0.02,
        angle: 1.2,
        settled: true,
        restingOn: "rock",
      },
    ]);
    const parsed = parseSave(
      JSON.parse(JSON.stringify(createSave(s, DEFAULT_SETTINGS, 2))),
    );
    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") return;
    expect(parsed.save.sim.food.grains).toEqual(s.food.grains);
    const copy = cloneState(s);
    copy.food.grains![0]!.x = 0.9;
    expect(g.x).toBe(0.31);
    const food = new FoodParticles();
    food.update(
      0,
      {
        surface: s.food.surfaceG,
        sinking: s.food.sinkingG,
        bottom: s.organics.foodG,
        x: 0,
        grains: s.food.grains,
      },
      60,
      30,
      new WaterFlow(),
    );
    expect(food.particles[0]!.x).toBeCloseTo(0.31 * 60);
    expect(food.particles[0]!.restingOn).toBe("rock");
  });
  it("rechaza registros corruptos y conserva gramos al saturar el presupuesto", () => {
    let s = tank();
    s = applyAction(s, { type: "feed", grams: 2, kind: "flakes" }).state;
    const before = total(s);
    s = applyAction(s, { type: "feed", grams: 0.1, kind: "sinking" }).state;
    expect(s.food.grains!.length).toBeLessThanOrEqual(FOOD_GRAIN_LIMIT);
    expect(total(s)).toBeCloseTo(before + 0.1, 10);
    const raw = createSave(s, DEFAULT_SETTINGS, 1);
    const bad = structuredClone(raw);
    bad.sim.food.grains![1]!.id = bad.sim.food.grains![0]!.id;
    expect(parseSave(bad).status).toBe("invalid");
    const nan = structuredClone(raw);
    nan.sim.food.grains![0]!.vx = NaN;
    expect(parseSave(nan).status).toBe("invalid");
    const mass = structuredClone(raw);
    mass.sim.food.surfaceG += 1;
    expect(parseSave(mass).status).toBe("invalid");
  });
  it("distingue flotación de escamas y pastillas, y mantiene el balance al aspirar/descomponer", () => {
    const s = createNewTank();
    let flakes = applyAction(s, {
        type: "feed",
        grams: 0.01,
        kind: "flakes",
      }).state,
      pellets = applyAction(s, {
        type: "feed",
        grams: 0.01,
        kind: "sinking",
      }).state;
    stepFood(flakes, 0.01, buildContext(flakes, defaultConfig), defaultConfig);
    stepFood(
      pellets,
      0.01,
      buildContext(pellets, defaultConfig),
      defaultConfig,
    );
    expect(flakes.food.surfaceG).toBeGreaterThan(pellets.food.surfaceG);
    expect(pellets.food.sinkingG).toBeCloseTo(0.01, 10);
    for (const g of pellets.food.grains!) {
      g.layer = 2;
      g.y = 1;
    }
    publishFoodGrains(pellets);
    pellets = applyAction(pellets, {
      type: "waterChange",
      fraction: 0.25,
      vacuum: true,
      conditioned: true,
      temperatureC: 24,
    }).state;
    const before = total(pellets);
    expect(before).toBeLessThan(0.01);
    pellets = step(pellets, 60).state;
    expect(total(pellets)).toBeLessThan(before);
    expect(grainTotals(pellets)).toEqual([
      pellets.food.surfaceG,
      pellets.food.sinkingG,
      pellets.organics.foodG,
    ]);
  });
  it("el tiempo ausente puede consumir y hundir sin depender de posiciones del render", () => {
    const s = tank(),
      initial = structuredClone(s),
      next = step(s, 10).state;
    expect(s).toEqual(initial);
    expect(next.animals[0]!.hunger).toBeLessThan(0.5);
    expect(total(next)).toBeLessThan(total(s));
    expect(parseSave(createSave(next, DEFAULT_SETTINGS, 2)).status).toBe("ok");
  });
  it("el barrido toca roca, pasa por el agujero y respeta profundidad", () => {
    expect(
      sweepSolids([rock], { x: 0.3, y: 0 }, { x: 0.3, y: 1 }, 0.5, 0.001)?.key,
    ).toBe("rock");
    expect(
      sweepSolids([rock], { x: 0.5, y: 0 }, { x: 0.5, y: 1 }, 0.5, 0),
    ).toBeNull();
    expect(
      sweepSolids([rock], { x: 0.3, y: 0 }, { x: 0.3, y: 1 }, 0.9, 0),
    ).toBeNull();
  });
  it("se asienta sobre un objeto, conserva soporte al recargar y cae al retirarlo", () => {
    const s = tank(),
      g = s.food.grains![0]!;
    s.food.grains = [g];
    g.layer = 1;
    g.x = 0.3;
    g.y = 0.39;
    g.z = 0.5;
    g.vy = 0.3;
    publishFoodGrains(s);
    const field = new WaterFlow(),
      h = emptyHabitat();
    h.solids = [rock];
    field.configure(10, 10, 0, 10, h);
    const food = new FoodParticles(),
      snapshot = () => ({
        surface: s.food.surfaceG,
        sinking: s.food.sinkingG,
        bottom: s.organics.foodG,
        x: 3,
        grains: s.food.grains,
      });
    for (let i = 0; i < 150; i++) food.update(0.1, snapshot(), 10, 10, field);
    expect(food.particles[0]!.restingOn).toBe("rock");
    expect(food.particles[0]!.y).toBeLessThan(4);
    applyGrainKinematics(s, food.kinematics(10, 10));
    expect(g.layer).toBe(2);
    const restored = new FoodParticles();
    restored.update(0, snapshot(), 10, 10, field);
    expect(restored.particles[0]!.y).toBeCloseTo(food.particles[0]!.y);
    field.configure(10, 10, 0, 10, emptyHabitat());
    restored.update(0.1, snapshot(), 10, 10, field);
    expect(restored.particles[0]!.phase).toBe("sinking");
    expect(restored.particles[0]!.restingOn).toBeUndefined();
  });
  it("el sedimento asentado no reaparece arriba y un forrajeo cercano lo levanta", () => {
    const field = new WaterFlow(),
      dust = new Sediment(4);
    dust.update(0, 4, 10, 1, field, []);
    const p = dust.particles[0]!;
    p.y = 1;
    p.settled = true;
    dust.update(0.1, 4, 10, 1, field, []);
    expect(p.y).toBe(1);
    dust.update(0.1, 4, 10, 1, field, [{ x: p.x, y: 1, speed: 1 }]);
    expect(p.settled).toBe(false);
    expect(p.y).toBeLessThan(1);
    expect(dust.particles).toHaveLength(4);
  });
});

describe("respuesta localizada al espejo", () => {
  it("despliega cerca del espejo, se calma al retirarlo y respeta descanso/salud/susto", async () => {
    const { FishMotion } = await import("../src/render/motion/fish-motion");
    const motion = new FishMotion(42),
      animal = {
        id: 1,
        species: getSpecies("betta"),
        intent: "explore" as const,
        targetId: null,
        fright: 0,
        sizeCm: 3,
        alive: true,
        boldness: 0.5,
        activity: 0.5,
        condition: 1,
      };
    const input = {
      bounds: { width: 60, height: 30 },
      animals: [animal],
      bettaPrototype: true,
      renderDepth: true,
      food: { surface: false, sinking: false, bottom: false, x: 30 },
      scare: null,
      catAtGlass: false,
    };
    motion.update(0.016, input);
    const b = motion.bodies.get(1)!;
    b.x = 30;
    b.y = 12;
    b.plane = 1;
    b.targetPlane = 1;
    b.depthAt = 100;
    const mirror = { x: 31, y: 12, z: 0.5 };
    motion.update(0.016, { ...input, mirror });
    expect(motion.bettas.get(1)!.mode).toBe("flare");
    motion.update(0.016, input);
    expect(motion.bettas.get(1)!.mode).not.toBe("flare");
    motion.update(0.016, {
      ...input,
      mirror,
      animals: [{ ...animal, intent: "rest" }],
    });
    expect(motion.bettas.get(1)!.mode).toBe("sleep");
    motion.update(0.016, {
      ...input,
      mirror,
      animals: [{ ...animal, condition: 0.4 }],
    });
    expect(motion.bettas.get(1)!.mode).not.toBe("flare");
    motion.update(0.016, {
      ...input,
      mirror,
      animals: [{ ...animal, fright: 0.8, intent: "flee" }],
    });
    expect(motion.bettas.get(1)!.mode).toBe("startle");
  });
});
