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
  private time = 0;
  private burstAge = 0;
  constructor(readonly budget = settings.bubbles.max) {}
  update(
    dt: number,
    width: number,
    height: number,
    strength: number,
    water: WaterVelocity,
    outlet?: { x: number; y: number },
    onPop?: (bubble: Bubble) => void,
  ): void {
    const c = settings.bubbles,
      h = Math.min(0.1, Math.max(0, dt));
    this.time += h;
    const submerged = !outlet || (outlet.y > 0 && outlet.y < height);
    const emitting = submerged && strength > 0;
    this.burstAge = emitting ? (this.burstAge + h) % 5.4 : 0;
    if (!emitting) this.emission = 0;
    // The pump puts out brief groups, with quiet gaps between them.
    if (emitting && this.burstAge < 1.9) {
      this.emission += h * c.perSecond * strength * Math.sin(this.burstAge * Math.PI / 1.9);
    }
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
      const sway = Math.sin(this.time * (1.8 + p.id % 5 * 0.24) + p.id * 2.1) * p.radius * 2.5;
      p.vx += (flow.x + sway - p.vx) * (1 - Math.exp(-h * c.drag));
      p.x += p.vx * h;
      p.y += (p.vy + flow.y) * h;
      if (p.y <= 0 || p.x < 0 || p.x > width) {
        if (p.y <= 0 && p.x >= 0 && p.x <= width) onPop?.(p);
        this.particles.splice(i, 1);
        this.reusable.push(p);
      }
    }
  }
}
