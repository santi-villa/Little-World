import type { WaterVelocity } from "./water-flow";
interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  settled: boolean;
}
const noise = (i: number, s: number) => {
  const v = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
  return v - Math.floor(v);
};
/** Session-local suspended sediment. Settled grains stay down until a nearby forager lifts them. */
export class Sediment {
  readonly particles: Mote[] = [];
  private previousWidth = 0;
  private previousHeight = 0;
  constructor(readonly budget = 64) {}
  update(
    dt: number,
    count: number,
    width: number,
    height: number,
    water: WaterVelocity,
    foragers: readonly { x: number; y: number; speed: number }[],
  ): void {
    if (this.previousWidth && this.previousHeight)
      for (const p of this.particles) {
        p.x *= width / this.previousWidth;
        p.y *= height / this.previousHeight;
      }
    this.previousWidth = width;
    this.previousHeight = height;
    const target = Math.min(this.budget, Math.max(0, Math.round(count)));
    this.particles.length = Math.min(target, this.particles.length);
    while (this.particles.length < target) {
      const i = this.particles.length;
      this.particles.push({
        x: width * noise(i, 1),
        y: height * noise(i, 2),
        vx: 0,
        vy: 0,
        settled: false,
      });
    }
    let remaining = Math.min(0.2, Math.max(0, dt));
    while (remaining > 0) {
      const h = Math.min(1 / 60, remaining);
      remaining -= h;
      for (const p of this.particles) {
        for (const f of foragers) {
          const d = Math.hypot(p.x - f.x, p.y - f.y);
          if (d < 1.2 && p.y > height * 0.85) {
            p.settled = false;
            p.vy -= Math.min(0.4, f.speed) * h * (1 - d / 1.2);
          }
        }
        if (p.settled) continue;
        const flow = water.getWaterVelocity(p.x, p.y);
        p.vx += (flow.x - p.vx) * h * 3;
        p.vy += (flow.y + 0.018 - p.vy) * h * 2;
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
}
