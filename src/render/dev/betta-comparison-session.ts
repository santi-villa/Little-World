import { Game } from "../../game";
import { applyAction, createNewTank, getSpecies } from "../../sim";
import { DEFAULT_SETTINGS } from "../../save/save-format";
import { FishMotion, type MotionAnimal } from "../motion/fish-motion";
import { FoodParticles } from "../motion/food-particles";
import { WaterFlow } from "../motion/water-flow";
import { emptyHabitat } from "../motion/habitat";
import type { IllustratedInput } from "../motion/illustrated-betta-pose";
export type BettaScenario =
  "swim" | "accelerate" | "brake" | "turn" | "rest" | "feed" | "startle";
export const BETTA_SCENARIOS: readonly BettaScenario[] = [
  "swim",
  "accelerate",
  "brake",
  "turn",
  "rest",
  "feed",
  "startle",
];
/** Disposable fixture: one real Game, one physical body, two read-only renderers. No IndexedDB. */
export class BettaComparisonSession {
  readonly game: Game;
  readonly motion = new FishMotion(108);
  readonly water = new WaterFlow();
  readonly food = new FoodParticles(48);
  readonly habitat = emptyHabitat();
  readonly width = 60;
  readonly height = 30;
  readonly lengthCm = 6;
  seconds = 0;
  constructor(readonly scenario: BettaScenario) {
    let state = createNewTank({
      seed: 4242,
      startMinuteOfDay: 12 * 60,
      seededMedia: true,
    });
    state = applyAction(state, {
      type: "addAnimals",
      speciesId: "betta",
      count: 1,
    }).state;
    const a = state.animals[0]!;
    a.ageDays = 240;
    a.hunger = 0.55;
    a.stress = 0;
    a.fright = 0;
    a.health = 100;
    a.feedingTrust = 0.9;
    this.game = new Game(state, { ...DEFAULT_SETTINGS, outdoorC: 24 });
    this.game.enableGrains();
    this.water.configure(
      this.width,
      this.height,
      140,
      state.tank.waterLiters,
      this.habitat,
    );
    this.motion.update(0, this.input());
    const b = this.body;
    b.x = 30;
    b.y =
      scenario === "feed"
        ? 1.5
        : scenario === "turn" || scenario === "accelerate"
          ? 4
          : 12;
    b.vx =
      scenario === "brake"
        ? 5
        : scenario === "turn"
          ? 2
          : scenario === "swim"
            ? 1.5
            : 0;
    b.vy = 0;
    b.heading = 0;
    b.facing = 1;
    b.plane = 1;
    b.targetPlane = 1;
    b.depthAt = Infinity;
    this.habitat.refuges = [{ x: b.x / this.width, y: b.y / this.height }];
    if (["accelerate", "turn", "feed"].includes(scenario))
      this.game.act({
        type: "feed",
        grams: 0.004,
        x:
          (b.x + (scenario === "turn" ? -4 : scenario === "feed" ? 1 : 4)) /
          this.width,
        kind: "pellets",
      });
    if (scenario === "startle") this.game.act({ type: "tapGlass" });
  }
  get animal() {
    return this.game.state.animals[0]!;
  }
  get body() {
    return this.motion.bodies.get(1)!;
  }
  private input() {
    const a = this.animal,
      animal: MotionAnimal = {
        id: a.id,
        species: getSpecies("betta"),
        intent: a.intent,
        targetId: a.targetId,
        fright: a.fright,
        sizeCm: this.lengthCm,
        alive: a.alive,
        boldness: a.personality.boldness,
        activity: a.personality.activity,
        feedingTrust: a.feedingTrust,
        condition: a.health / 100,
      };
    return {
      bounds: { width: this.width, height: this.height },
      animals: [animal],
      bettaPrototype: true,
      renderDepth: true,
      water: this.water,
      habitat: this.habitat,
      scare:
        this.scenario === "startle" && this.seconds < 0.2
          ? { x: 28, y: 12 }
          : null,
      catAtGlass: false,
      food: {
        surface: this.game.state.food.surfaceG > 0,
        sinking: this.game.state.food.sinkingG > 0,
        bottom: this.game.state.organics.foodG > 0,
        x: this.width * (this.game.state.food.x ?? 0.5),
        targets: this.food.particles
          .filter((p) => p.phase !== "falling")
          .map((p) => ({ x: p.x, y: p.y, layer: p.layer, z: p.z })),
      },
    };
  }
  update(dt: number): void {
    this.seconds += dt;
    // Test inputs prescribe only an intention/stimulus; BettaDynamics still supplies every force.
    this.animal.intent =
      this.scenario === "rest" || this.scenario === "brake"
        ? "rest"
        : ["accelerate", "turn", "feed"].includes(this.scenario)
          ? "eat"
          : this.scenario === "startle" && this.seconds < 3
            ? "flee"
            : "explore";
    this.game.advance(dt / 60, true);
    const s = this.game.state;
    this.food.update(
      dt,
      {
        surface: s.food.surfaceG,
        sinking: s.food.sinkingG,
        bottom: s.organics.foodG,
        x: (s.food.x ?? 0.5) * this.width,
        grains: s.food.grains,
      },
      this.width,
      this.height,
      this.water,
    );
    // Braking isolates passive drag at the current resting position, so overshooting a
    // fixed refuge does not start a new approach burst in the existing controller.
    if (this.scenario === "brake")
      this.habitat.refuges = [
        { x: this.body.x / this.width, y: this.body.y / this.height },
      ];
    this.motion.update(dt, this.input());
    const b = this.body,
      near = this.food.particles.filter(
        (p) =>
          p.phase !== "falling" &&
          p.layer !== 2 &&
          Math.hypot(
            p.x - b.x,
            p.y - b.y,
            ((p.z ?? b.plane / 2) - b.plane / 2) * s.tank.widthCm,
          ) <
            this.lengthCm * 0.55,
      );
    this.game.observeFeedingContacts({
      [b.id]: near.reduce((mask, p) => mask | (1 << p.layer), 0),
    });
    this.game.observeGrains(this.food.kinematics(this.width, this.height), {
      [b.id]: near.map((p) => p.id),
    });
  }
  get illustratedInput(): IllustratedInput {
    const b = this.body,
      g = this.food.nearest(b.x, b.y, [0, 1]);
    return {
      body: b,
      motion: this.motion.bettas.get(b.id),
      lengthCm: this.lengthCm,
      alive: this.animal.alive,
      condition: this.animal.health / 100,
      current: this.water.getWaterVelocity(b.x, b.y),
      food:
        this.animal.intent === "eat" && g
          ? {
              x: g.x,
              y: g.y,
              distance: Math.hypot(
                g.x - b.x,
                g.y - b.y,
                ((g.z ?? b.plane / 2) - b.plane / 2) *
                  this.game.state.tank.widthCm,
              ),
            }
          : undefined,
    };
  }
}
