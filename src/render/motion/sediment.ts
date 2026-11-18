import type { WaterVelocity } from "./water-flow";
interface Mote {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  settled: boolean;
  depth: number;
  size: number;
  opacity: number;
  age: number;
  life: number;
  seed: number;
}
const noise = (i: number, s: number) => {
  const v = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
  return v - Math.floor(v);
};
/** Session-local suspended sediment. Settled grains stay down until a nearby forager lifts them. */
export class Sediment {
  readonly particles: Mote[] = [];
  private readonly spare: Mote[] = [];
  private previousWidth = 0;
  private previousHeight = 0;
  private sequence = 0;
  constructor(readonly budget = 64) {}
  update(
    dt: number,
    count: number,
    width: number,
    height: number,
    water: WaterVelocity,
    foragers: readonly { x: number; y: number; speed: number }[],
  ): void {
    if (this.previousWidth && this.previousHeight &&
      (this.previousWidth !== width || this.previousHeight !== height))
      for (const p of this.particles) {
        p.x *= width / this.previousWidth;
        p.y *= height / this.previousHeight;
      }
    this.previousWidth = width;
    this.previousHeight = height;
    const target = Math.min(this.budget, Math.max(0, Math.round(count)));
    while (this.particles.length > target) this.spare.push(this.particles.pop()!);
    while (this.particles.length < target) {
      const p = this.spare.pop() ?? {
        id: 0, x: 0, y: 0, vx: 0, vy: 0, settled: false,
        depth: 0, size: 0, opacity: 0, age: 0, life: 0, seed: 0,
      };
      this.resuspend(p, width, height, true);
      this.particles.push(p);
    }
    let remaining = Math.min(0.2, Math.max(0, dt));
    while (remaining > 0) {
      const h = Math.min(1 / 60, remaining);
      remaining -= h;
      for (const p of this.particles) {
        p.age += h;
        if (p.age >= p.life) this.resuspend(p, width, height, false);
        for (const f of foragers) {
          if (p.y < height * 0.85) continue;
          const d = Math.hypot(p.x - f.x, p.y - f.y);
          if (d < 1.2) {
            p.settled = false;
            p.vy -= Math.min(0.4, f.speed) * h * (1 - d / 1.2);
          }
        }
        if (p.settled) continue;
        const flow = water.getWaterVelocity(p.x, p.y);
        const drift = Math.sin(p.seed + p.age * (0.35 + p.depth * 0.5)) * 0.055;
        p.vx += (flow.x * (0.66 + p.depth * 0.34) + drift - p.vx) * h * 3;
        p.vy += (flow.y + 0.012 + p.size * 0.019 + drift * 0.4 - p.vy) * h * 2;
        p.x = Math.max(0, Math.min(width, p.x + p.vx * h));
        p.y = Math.max(0, p.y + p.vy * h);
        if (p.y >= height) {
          p.y = height;
          p.vx = 0;
          p.vy = 0;
          p.settled = true;
        }
        if (water.constrain) {
          const q = water.constrain(p.x, p.y, 0.01);
          p.x = q.x;
          p.y = q.y;
        }
      }
    }
  }

  private resuspend(p: Mote, width: number, height: number, stagger: boolean): void {
    const id = ++this.sequence;
    p.id = id;
    p.x = width * (0.025 + noise(id, 1) * 0.95);
    p.y = height * (0.035 + noise(id, 2) * 0.93);
    p.depth = noise(id, 3);
    p.size = 0.24 + 0.55 * noise(id, 4) ** 2;
    p.opacity = 0.14 + noise(id, 5) * 0.26;
    p.life = 13 + noise(id, 6) * 29;
    p.seed = noise(id, 7) * 2 * Math.PI;
    p.age = stagger ? p.life * noise(id, 8) : 0;
    p.vx = p.vy = 0;
    p.settled = false;
  }
}
