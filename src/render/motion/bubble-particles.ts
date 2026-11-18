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
  private readonly reusable: Bubble[] = [];
  private id = 0;
  constructor(readonly budget = settings.bubbles.max) {}
  update(
    dt: number,
    width: number,
    height: number,
    strength: number,
    water: WaterVelocity,
    outlet?: { x: number; y: number },
  ): void {
    const c = settings.bubbles,
      h = Math.min(0.1, Math.max(0, dt));
    const submerged = !outlet || (outlet.y > 0 && outlet.y < height);
    this.emission += submerged ? h * c.perSecond * strength : 0;
    while (this.emission >= 1) {
      this.emission--;
      if (this.particles.length >= this.budget) continue;
      const id = ++this.id;
      const size = ((id * 37) % 101) / 101;
      const speed = ((id * 63) % 89) / 89;
      const bubble = this.reusable.pop() ?? { id, x: 0, y: 0, vx: 0, vy: 0, radius: 0 };
      bubble.id = id;
      bubble.x = (outlet?.x ?? width * 0.96) + (size - 0.5) * Math.min(0.4, width * 0.015);
      bubble.y = outlet?.y ?? height * 0.7;
      bubble.vx = 0;
      bubble.vy = -c.riseCmS * (0.58 + speed * 0.49 + size * 0.42);
      bubble.radius = c.radiusCm * (0.48 + size * 1.2);
      this.particles.push(bubble);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!,
        flow = water.getWaterVelocity(p.x, p.y);
      p.vx += (flow.x - p.vx) * h * c.drag;
      p.x += p.vx * h;
      p.y += (p.vy + flow.y) * h;
      if (p.y <= 0 || p.x < 0 || p.x > width) {
        this.particles.splice(i, 1);
        this.reusable.push(p);
      }
    }
  }
}
