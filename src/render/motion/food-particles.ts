import settings from '../../data/ecosystem.json';
import type { WaterVelocity } from './water-flow';
export type FoodPhase =
  'falling' | 'floating' | 'sinking' | 'bottom' | 'consumed' | 'removed';
export interface FoodParticle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  grams: number;
  mass: number;
  buoyancy: number;
  drag: number;
  phase: FoodPhase;
  age: number;
  angle: number;
  layer: 0 | 1 | 2;
}
export interface FoodSnapshot {
  surface: number;
  sinking: number;
  bottom: number;
  x: number;
  consumedLayers?: number;
}
const noise = (id: number, salt: number) => {
  const n = Math.sin(id * 12.9898 + salt * 78.233) * 43758.5453;
  return n - Math.floor(n);
};
/** Bounded representatives of the chemical pools. Chemistry alone creates/removes grams. */
export class FoodParticles {
  readonly particles: FoodParticle[] = [];
  readonly retired: FoodParticle[] = [];
  private nextId = 1;
  private previousHeight:number|undefined;
  private snapshot: FoodSnapshot | undefined;
  constructor(readonly budget = settings.food.maxParticles) {}
  update(
    dt: number,
    snapshot: FoodSnapshot,
    width: number,
    height: number,
    water: WaterVelocity,
  ): void {
    this.retired.length = 0;
    if(this.previousHeight!==undefined&&height!==this.previousHeight){const delta=height-this.previousHeight;for(const p of this.particles){if(p.phase==='bottom')p.y=height;else if(p.phase==='sinking')p.y=Math.max(0,p.y+delta);}}
    this.previousHeight=height;
    const c = settings.food,
      totals = [snapshot.surface, snapshot.sinking, snapshot.bottom];
    const total = totals.reduce((a, b) => a + b, 0),
      density =
        total > 0
          ? Math.min(c.particlesPerGram, this.budget / total)
          : c.particlesPerGram;
    const counts = totals.map((n) =>
      n > c.minGrams ? Math.max(1, Math.floor(n * density)) : 0,
    );
    while (counts.reduce((a, b) => a + b, 0) > this.budget) {
      const i = counts.indexOf(Math.max(...counts));
      counts[i]!--;
    }
    // Reuse excess representatives across chemical layer transitions, keeping their trajectories.
    const spare: FoodParticle[] = [];
    for (let layer = 0; layer < 3; layer++) {
      const list = this.particles.filter((p) => p.layer === layer);
      for (const p of list.slice(counts[layer])) {
        this.particles.splice(this.particles.indexOf(p), 1);
        spare.push(p);
      }
    }
    for (let layer = 0; layer < 3; layer++) {
      const list = this.particles.filter((p) => p.layer === layer);
      while (list.length < counts[layer]!) {
        const reused = spare.findIndex((p) => p.layer < layer),
          p =
            reused >= 0
              ? spare.splice(reused, 1)[0]!
              : this.create(
                  layer as 0 | 1 | 2,
                  snapshot.x,
                  width,
                  height,
                  !this.snapshot,
                );
        p.layer = layer as 0 | 1 | 2;
        p.buoyancy=layer===0?1:0;
        if (layer === 1) p.phase = 'sinking';
        if (layer === 2) {
          p.phase = 'bottom';
          p.y = height;
          p.vx = 0;
          p.vy = 0;
        }
        this.particles.push(p);
        list.push(p);
      }
      for (const p of list) p.grams = totals[layer]! / Math.max(1, list.length);
    }
    for (const p of spare) {
      p.phase =
        (snapshot.consumedLayers ?? 0) & (1 << p.layer)
          ? 'consumed'
          : 'removed';
      this.retired.push(p);
    }
    this.snapshot = { ...snapshot };
    let remaining = Math.max(0, Math.min(0.2, dt));
    while (remaining > 0) {
      const h = Math.min(1 / 60, remaining);
      remaining -= h;
      for (const p of this.particles) {
        p.age += h;
        if (p.phase === 'bottom') continue;
        const flow = water.getWaterVelocity(p.x, Math.max(0, p.y));
        p.vx += (flow.x - p.vx) * p.drag * h;
        p.x = Math.max(0, Math.min(width, p.x + p.vx * h));
        if (p.phase === 'falling') {
          p.vy += (c.fallCmS - p.vy) * p.drag * h;
          p.y += p.vy * h;
          if (p.y >= 0) {
            p.y = 0;
            p.phase = 'floating';
            p.vy = 0;
          }
        } else if (p.phase === 'floating') {
          p.y = 0;
          p.vy = 0;
        } else if (p.phase === 'sinking') {
          const terminal = c.sinkCmS * (0.65 + p.mass)*(1-p.buoyancy) + flow.y;
          p.vy += (terminal - p.vy) * p.drag * h;
          p.y += p.vy * h;
          if (p.y >= height) {
            p.y = height;
            p.vx = 0;
            p.vy = 0;
            p.phase =
              'bottom'; /* Physical resting state; the chemical pool is unchanged. */
          }
        }
        p.angle += p.vx * h * 0.2;
      }
    }
    if (water.constrain)
      for (const p of this.particles) {
        const safe = water.constrain(p.x, Math.max(0, p.y), p.size);
        p.x = safe.x;
        if (p.phase !== 'falling' && p.phase !== 'floating') p.y = safe.y;
      }
  }
  private create(
    layer: 0 | 1 | 2,
    x: number,
    width: number,
    height: number,
    restored: boolean,
  ): FoodParticle {
    const id = this.nextId++,
      r = noise(id, 1),
      mass = 0.5 + noise(id, 2);
    return {
      id,
      x: Math.max(0, Math.min(width, x + (r - 0.5) * width * 0.06)),
      y:
        layer === 2
          ? height
          : layer === 1
            ? restored
              ? height * noise(id, 3)
              : 0
            : -1,
      vx: 0,
      vy: 0,
      size: settings.food.radiusCm * (0.7 + r * 0.6),
      grams: 0,
      mass,
      buoyancy: layer === 0 ? 1 : 0,
      drag: settings.food.drag,
      phase: layer === 2 ? 'bottom' : layer === 1 ? 'sinking' : 'falling',
      age: 0,
      angle: r * Math.PI,
      layer,
    };
  }
  nearest(
    x: number,
    y: number,
    layers: readonly number[],
  ): FoodParticle | null {
    let best: FoodParticle | null = null,
      distance = Infinity;
    for (const p of this.particles) {
      if (!layers.includes(p.layer) || p.phase === 'falling') continue;
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < distance) {
        distance = d;
        best = p;
      }
    }
    return best;
  }
  get totals(): number[] {
    return [0, 1, 2].map((layer) =>
      this.particles
        .filter((p) => p.layer === layer)
        .reduce((sum, p) => sum + p.grams, 0),
    );
  }
}
