import { describe, it, expect } from "vitest";
import {
  IllustratedBettaPose,
  projectIllustratedPoint,
  skinBettaPoint,
  type IllustratedInput,
} from "../src/render/motion/illustrated-betta-pose";
import { BettaComparisonSession } from "../src/render/dev/betta-comparison-session";
import config from "../src/data/illustrated-betta.json";
const input = (): IllustratedInput => ({
  body: {
    id: 1,
    x: 30,
    y: 12,
    vx: 0,
    vy: 0,
    heading: 0,
    wanderAngle: 0,
    plane: 1,
    targetPlane: 1,
    facing: 1,
    goalX: 40,
    goalY: 12,
    goalUntil: 4,
    phase: 0,
  },
  lengthCm: 6,
  alive: true,
  condition: 1,
  current: { x: 0, y: 0 },
  motion: { mode: "wander", stroke: "float", pitch: 0, force: { x: 0, y: 0 } },
});
const run = (
  pose: IllustratedBettaPose,
  data: IllustratedInput,
  seconds: number,
  fps = 60,
) => {
  for (let i = 0; i < Math.round(seconds * fps); i++)
    pose.update(1 / fps, data);
};
describe("pose del betta ilustrado", () => {
  it("solo lee física y comportamiento, sin modificarlos", () => {
    const data = input(),
      before = structuredClone(data),
      pose = new IllustratedBettaPose();
    run(pose, data, 3);
    expect(data).toEqual(before);
  });
  it("mantiene la misma respuesta de resortes y esfuerzo a 15, 30, 60 y 120 FPS", () => {
    const poses = [15, 30, 60, 120].map((fps) => {
      const data = input();
      data.body = { ...data.body, vx: 3 };
      data.motion = { ...data.motion!, stroke: "burst", force: { x: 8, y: 0 } };
      const pose = new IllustratedBettaPose(1, 2);
      run(pose, data, 4, fps);
      return pose;
    });
    for (const pose of poses) {
      expect(pose.effort).toBeCloseTo(poses[0]!.effort, 6);
      expect(pose.phase).toBeCloseTo(poses[0]!.phase, 6);
      expect(pose.rear).toBeCloseTo(poses[0]!.rear, 5);
      for (const name of ["tail", "dorsal", "anal"] as const)
        pose.fins[name].forEach((value, i) =>
          expect(value).toBeCloseTo(poses[0]!.fins[name][i]!, 5),
        );
    }
  });
  it("aumenta gradualmente el esfuerzo y reduce movimiento al descansar", () => {
    const data = input(),
      pose = new IllustratedBettaPose();
    run(pose, data, 1);
    const initial = pose.effort;
    data.body = { ...data.body, vx: 4 };
    data.motion = { ...data.motion!, stroke: "burst", mode: "startle" };
    pose.update(1 / 60, data);
    expect(pose.effort).toBeGreaterThan(initial);
    expect(pose.effort).toBeLessThan(0.25);
    run(pose, data, 2);
    const burst = pose.effort,
      frequency = pose.frequency;
    data.body = { ...data.body, vx: 0 };
    data.motion = { ...data.motion!, mode: "sleep", stroke: "float" };
    run(pose, data, 5);
    expect(pose.effort).toBeLessThan(burst * 0.1);
    expect(pose.frequency).toBeLessThan(frequency * 0.2);
    expect(Math.abs(pose.rear)).toBeLessThan(0.01);
    expect(Math.abs(pose.pectoral)).toBeLessThanOrEqual(0.04);
  });
  it("ancla las raíces y amortigua una perturbación sin explosiones de deformación", () => {
    const data = input(),
      pose = new IllustratedBettaPose();
    data.motion = { ...data.motion!, mode: "sleep" };
    pose.fins.tail[8] = 5;
    run(pose, data, 6);
    for (const fin of Object.values(pose.fins)) {
      expect(fin[0]).toBe(0);
      expect(Math.max(...fin.map(Math.abs))).toBeLessThan(0.2);
      for (const offset of fin) expect(Number.isFinite(offset)).toBe(true);
    }
    data.motion = { ...data.motion!, mode: "startle", stroke: "burst" };
    data.body = { ...data.body, vx: 20 };
    run(pose, data, 2);
    expect(Math.abs(pose.tail)).toBeLessThanOrEqual(config.pose.jointLimit);
    expect(Math.max(...pose.fins.tail.map(Math.abs))).toBeLessThanOrEqual(
      config.pose.finLimit,
    );
  });
  it("gira de forma continua y conserva las uniones del skinning compartido", () => {
    const data = input(),
      pose = new IllustratedBettaPose();
    data.body = { ...data.body, facing: -1, heading: Math.PI };
    let before = projectIllustratedPoint({ x: 54, y: 0, z: 4 }, pose).x;
    for (let i = 0; i < 180; i++) {
      pose.update(1 / 60, data);
      const after = projectIllustratedPoint({ x: 54, y: 0, z: 4 }, pose).x;
      expect(Math.abs(after - before)).toBeLessThan(8);
      before = after;
      for (const x of [-5, 8, 25]) {
        const a = skinBettaPoint(x - 1e-5, 5, pose),
          b = skinBettaPoint(x + 1e-5, 5, pose);
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.001);
      }
    }
    expect(Math.cos(pose.yaw)).toBeCloseTo(-1, 5);
    expect(before).toBeLessThan(0);
  });
  it("hace picoteo solo con una partícula cercana y no anima pectorales de un pez muerto", () => {
    const data = input(),
      pose = new IllustratedBettaPose();
    data.motion = { ...data.motion!, mode: "food", stroke: "burst" };
    data.food = { x: 48, y: 0, distance: 20 };
    run(pose, data, 0.1);
    expect(pose.nibble).toBe(0);
    data.food = { x: 31, y: 11, distance: 1 };
    run(pose, data, 0.1);
    expect(pose.nibble).toBeGreaterThan(0.5);
    data.food = undefined;
    pose.update(1 / 60, data);
    expect(pose.nibble).toBe(0);
    data.alive = false;
    run(pose, data, 1);
    expect(pose.pectoral).toBe(0);
    expect(pose.breath).toBe(0);
  });
});
describe("comparación sin una segunda física", () => {
  it("reproduce el mismo cuerpo y química para un estímulo dado", () => {
    const a = new BettaComparisonSession("turn"),
      b = new BettaComparisonSession("turn");
    for (let i = 0; i < 240; i++) {
      a.update(1 / 60);
      b.update(1 / 60);
    }
    expect(a.body).toEqual(b.body);
    expect(a.game.state).toEqual(b.game.state);
    expect(a.body.facing).toBe(-1);
  });
  it("usa frenado, sueño y sobresalto de BettaDynamics existentes", () => {
    const brake = new BettaComparisonSession("brake"),
      initial = brake.body.vx,
      rest = new BettaComparisonSession("rest"),
      startle = new BettaComparisonSession("startle");
    for (let i = 0; i < 60; i++) {
      brake.update(1 / 60);
      rest.update(1 / 60);
      startle.update(1 / 60);
    }
    expect(Math.hypot(brake.body.vx, brake.body.vy)).toBeLessThan(
      initial * 0.3,
    );
    expect(rest.motion.bettas.get(1)!.mode).toBe("sleep");
    expect(startle.motion.bettas.get(1)!.mode).toBe("startle");
  });
  it("presenta granos de la simulación y consumo real en la escena de alimento", () => {
    const feed = new BettaComparisonSession("feed"),
      hunger = feed.animal.hunger;
    for (let i = 0; i < 300; i++) feed.update(1 / 60);
    expect(feed.food.particles.length).toBeGreaterThan(0);
    expect(feed.game.state.food.grains).toBeDefined();
    expect(feed.motion.bettas.get(1)!.mode).toBe("food");
    expect(feed.animal.hunger).toBeLessThan(hunger);
  });
});
