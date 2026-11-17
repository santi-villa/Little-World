import { Container, Graphics } from 'pixi.js';
import { PlantMotion } from '../motion/plant-motion';
/** Anchored stems and flexible tips. Fish proximity bends leaves, not the roots. */
export class LivingPlant {
  readonly container = new Container();
  private g = new Graphics();
  private stems: PlantMotion[] = [];
  constructor(
    readonly kind: 'anubias' | 'vallisneria',
    readonly width: number,
    readonly height: number,
    readonly seed: number,
  ) {
    this.container.addChild(this.g);
    this.stems = Array.from(
      { length: 9 },
      (_, i) => new PlantMotion(9, seed + i * 1.7),
    );
  }
  update(
    seconds: number,
    dt: number,
    flow: number,
    fish: { x: number; y: number; vx: number }[],
  ): void {
    const visitors = fish.map((f) => ({
      height: (this.container.y - f.y) / this.height,
      distance: Math.abs(f.x - this.container.x) / Math.max(20, this.width),
      speed: f.vx / 4,
    }));
    for (const stem of this.stems) stem.update(dt, seconds, flow, visitors);
    const g = this.g;
    g.clear();
    const w = this.width,
      h = this.height;
    if (this.kind === 'vallisneria') {
      for (let i = 0; i < 9; i++) {
        const x = (i - 4) * w * 0.07,
          len = h * (0.65 + 0.35 * ((Math.sin(i * 2 + this.seed) + 1) / 2));
        const stem = this.stems[i]!,
          points = stem.offsets.map((offset, j) => {
            const u = j / (stem.segments - 1);
            return {
              x: x + (i - 4) * w * 0.09 * u * u + offset * h,
              y: -len * u,
            };
          });
        const ribbon: number[] = [];
        for (let j = 0; j < points.length; j++) {
          const p = points[j]!,
            thickness = (1 - j / points.length) * w * 0.018 + 0.3;
          ribbon.push(p.x - thickness, p.y);
        }
        for (let j = points.length - 1; j >= 0; j--) {
          const p = points[j]!,
            thickness = (1 - j / points.length) * w * 0.018 + 0.3;
          ribbon.push(p.x + thickness, p.y);
        }
        g.poly(ribbon).fill(i % 2 ? 0x447a54 : 0x659865);
        g.moveTo(points[0]!.x, 0);
        for (const p of points.slice(1)) g.lineTo(p.x, p.y);
        g.stroke({ color: 0x93b67a, width: 0.6, alpha: 0.5 });
      }
    } else {
      g.moveTo(-w * 0.3, 0)
        .quadraticCurveTo(0, -h * 0.08, w * 0.3, 0)
        .stroke({ color: 0x556b3e, width: 3 });
      for (let i = 0; i < 7; i++) {
        const x = (i - 3) * w * 0.09,
          y = -h * (0.3 + 0.5 * ((Math.sin(i * 1.9) + 1) / 2));
        const stem = this.stems[i]!,
          sway = stem.offsets[8]! * h * 0.55;
        const tip = x + (i % 2 ? 1 : -1) * w * 0.22 + sway;
        g.moveTo(x * 0.4, 0)
          .quadraticCurveTo(x + stem.offsets[4]! * h * 0.5, -h * 0.3, tip, y)
          .stroke({ color: 0x507047, width: 1.1 });
        g.moveTo(tip, y)
          .bezierCurveTo(
            tip - w * 0.25,
            y - h * 0.18,
            tip - w * 0.12,
            y - h * 0.43,
            tip + sway * 0.2,
            y - h * 0.42,
          )
          .bezierCurveTo(
            tip + w * 0.18,
            y - h * 0.4,
            tip + w * 0.27,
            y - h * 0.13,
            tip,
            y,
          )
          .closePath()
          .fill(i % 2 ? 0x416f51 : 0x57815a);
        g.moveTo(tip, y)
          .lineTo(tip + sway * 0.2, y - h * 0.38)
          .stroke({ color: 0x8faa70, width: 0.7, alpha: 0.65 });
      }
    }
  }
}
