import profiles from "../data/food-types.json";
import type { SimState } from "./types";
export type FoodKind = keyof typeof profiles;
export interface FoodGrain {
  id: number;
  kind: FoodKind;
  grams: number;
  layer: 0 | 1 | 2;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  ageMinutes: number;
  sinkAt: number;
  bottomAt: number;
  restingOn?: string;
  z: number;
}
export interface GrainKinematics {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  settled: boolean;
  restingOn?: string;
  z: number;
}
export const FOOD_GRAIN_LIMIT = 512;
const noise = (id: number, salt: number) => {
  const n = Math.sin(id * 12.9898 + salt * 78.233) * 43758.5453;
  return n - Math.floor(n);
};
/** Optional ledger; older saves without it keep the aggregate feeding contract. */
export function enableFoodGrains(state: SimState): void {
  if (state.food.grains) return;
  const totals = [
    state.food.surfaceG,
    state.food.sinkingG,
    state.organics.foodG,
  ];
  state.food.grains = [];
  state.food.nextGrainId = 1;
  totals.forEach((grams, layer) =>
    depositFoodGrains(
      state,
      grams,
      state.food.kind ?? "pellets",
      layer as 0 | 1 | 2,
    ),
  );
}
export function depositFoodGrains(
  state: SimState,
  grams: number,
  kind: FoodKind,
  layer: 0 | 1 | 2 = 0,
): void {
  if (!state.food.grains || grams <= 0) return;
  const available = FOOD_GRAIN_LIMIT - state.food.grains.length,
    count = Math.min(
      Math.max(1, Math.ceil(grams * 1800)),
      Math.max(0, available),
    );
  if (count === 0) {
    const groups = new Map<string, FoodGrain>();
    for (const g of state.food.grains) {
      const key = g.kind + ":" + g.layer,
        other = groups.get(key);
      if (other) {
        other.grams += g.grams;
        state.food.grains.splice(state.food.grains.indexOf(g), 1);
        depositFoodGrains(state, grams, kind, layer);
        return;
      }
      groups.set(key, g);
    }
    return;
  }

  for (let i = 0; i < count; i++) {
    const id = state.food.nextGrainId ?? 1;
    state.food.nextGrainId = id + 1;
    const p = profiles[kind],
      sinkAt =
        p.floatMinutes === 0
          ? 0
          : -Math.log(Math.max(0.001, 1 - noise(id, 7))) * p.floatMinutes;
    state.food.grains.push({
      id,
      kind,
      grams: grams / count,
      layer,
      x: Math.max(
        0,
        Math.min(1, (state.food.x ?? 0.5) + (noise(id, 1) - 0.5) * 0.06),
      ),
      y: layer === 2 ? 1 : layer === 1 ? noise(id, 3) : -0.03,
      vx: 0,
      vy: 0,
      angle: noise(id, 4) * Math.PI,
      ageMinutes: 0,
      sinkAt,
      bottomAt: sinkAt + p.sinkMinutes * (0.7 + noise(id, 5) * 0.6),
      z: noise(id, 6),
    });
  }
}
export function grainTotals(state: SimState): number[] {
  return [0, 1, 2].map((layer) =>
    (state.food.grains ?? []).reduce(
      (sum, g) => sum + (g.layer === layer ? g.grams : 0),
      0,
    ),
  );
}
export function publishFoodGrains(state: SimState): void {
  if (!state.food.grains) return;
  state.food.grains = state.food.grains.filter((g) => g.grams > 1e-12);
  const [surface, sinking, bottom] = grainTotals(state);
  state.food.surfaceG = surface!;
  state.food.sinkingG = sinking!;
  state.organics.foodG = bottom!;
}
/** Reconcile external sources (corpse decay), vacuuming and decomposition against the ledger. */
export function reconcileFoodGrains(state: SimState): void {
  if (!state.food.grains) return;
  const expected = [
      state.food.surfaceG,
      state.food.sinkingG,
      state.organics.foodG,
    ],
    actual = grainTotals(state);
  for (let layer = 0; layer < 3; layer++) {
    const delta = expected[layer]! - actual[layer]!;
    if (delta > 1e-10)
      depositFoodGrains(
        state,
        delta,
        state.food.kind ?? "pellets",
        layer as 0 | 1 | 2,
      );
    else if (delta < 0 && actual[layer]! > 0) {
      const ratio = Math.max(0, expected[layer]! / actual[layer]!);
      for (const g of state.food.grains)
        if (g.layer === layer) g.grams *= ratio;
    }
  }
  publishFoodGrains(state);
}
export function applyGrainKinematics(
  state: SimState,
  samples: readonly GrainKinematics[],
): void {
  if (!state.food.grains) return;
  reconcileFoodGrains(state);
  const byId = new Map(samples.map((s) => [s.id, s]));
  for (const g of state.food.grains) {
    const p = byId.get(g.id);
    if (!p || ![p.x, p.y, p.vx, p.vy, p.angle, p.z].every(Number.isFinite))
      continue;
    g.x = Math.max(0, Math.min(1, p.x));
    g.y = Math.max(-0.1, Math.min(1, p.y));
    g.vx = p.vx;
    g.vy = p.vy;
    g.angle = p.angle;
    g.z = Math.max(0, Math.min(1, p.z));
    g.restingOn = p.restingOn;
    if (p.settled && g.layer === 1) g.layer = 2;
  }
  publishFoodGrains(state);
}
