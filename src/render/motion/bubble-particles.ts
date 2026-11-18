import settings from '../../data/ecosystem.json';
import type { WaterVelocity } from './water-flow';
export interface Bubble {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}
export class BubbleParticles {
  readonly particles: Bubble[] = [];
  private emission = 0;
  private id = 0;
  constructor(readonly budget = settings.bubbles.max) {}
  update(
    dt: number,
    width: number,
    height: number,
    strength: number,
    water: WaterVelocity,
  ): void {
    const c = settings.bubbles,
      h = Math.min(0.1, Math.max(0, dt));
    this.emission += h * c.perSecond * strength;
    while (this.emission >= 1) {
      this.emission--;
      if (this.particles.length >= this.budget) continue;
      const id = ++this.id,
        r = ((id * 37) % 101) / 101;
      this.particles.push({
        id,
        x: width * 0.96 + (r - 0.5) * width * 0.015,
        y: height * 0.7,
        vx: 0,
        vy: -c.riseCmS * (0.7 + r),
        radius: c.radiusCm * (0.5 + r),
      });
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!,
        flow = water.getWaterVelocity(p.x, p.y);
      p.vx += (flow.x - p.vx) * h * c.drag;
      p.x += p.vx * h;
      p.y += (p.vy + flow.y) * h;
      if (p.y <= 0 || p.x < 0 || p.x > width) this.particles.splice(i, 1);
    }
  }
}
