import { Container, Graphics } from 'pixi.js';
/** Anchored stems and flexible tips. Fish proximity bends leaves, not the roots. */
export class LivingPlant {
  readonly container = new Container();
  private g = new Graphics();
  private bend = 0;
  constructor(
    readonly kind: 'anubias' | 'vallisneria',
    readonly width: number,
    readonly height: number,
    readonly seed: number,
  ) {
    this.container.addChild(this.g);
  }
  update(
    seconds: number,
    dt: number,
    flow: number,
    fish: { x: number; y: number; vx: number }[],
  ): void {
    let push = 0;
    for (const f of fish) {
      const dx = f.x - this.container.x,
        dy = f.y - (this.container.y - this.height * 0.6);
      const d = Math.hypot(dx, dy);
      if (d < this.width)
        push += Math.sign(f.vx || dx) * (1 - d / this.width) * 0.12;
    }
    this.bend += (push - this.bend) * (1 - Math.exp(-Math.min(0.1, dt) * 3));
    const g = this.g;
    g.clear();
    const w = this.width,
      h = this.height;
    if (this.kind === 'vallisneria') {
      for (let i = 0; i < 9; i++) {
        const x = (i - 4) * w * 0.07,
          len = h * (0.65 + 0.35 * ((Math.sin(i * 2 + this.seed) + 1) / 2));
        const sway =
          (Math.sin(seconds * (0.37 + i * 0.017) + i * 1.7 + this.seed) *
            0.04 *
            (0.25 + flow) +
            this.bend) *
          h;
        const lean = (i - 4) * w * 0.07 + sway;
        g.moveTo(x, 0)
          .bezierCurveTo(
            x - 2,
            -len * 0.35,
            x + lean,
            -len * 0.75,
            x + lean * 0.8,
            -len,
          )
          .bezierCurveTo(x + lean - 4, -len * 0.6, x + 4, -len * 0.3, x + 3, 0)
          .closePath()
          .fill(i % 2 ? 0x447a54 : 0x659865);
        g.moveTo(x + 1, -2)
          .quadraticCurveTo(x + lean * 0.6, -len * 0.5, x + lean * 0.8, -len)
          .stroke({ color: 0x93b67a, width: 0.6, alpha: 0.6 });
      }
    } else {
      g.moveTo(-w * 0.3, 0)
        .quadraticCurveTo(0, -h * 0.08, w * 0.3, 0)
        .stroke({ color: 0x556b3e, width: 3 });
      for (let i = 0; i < 7; i++) {
        const x = (i - 3) * w * 0.09,
          y = -h * (0.3 + 0.5 * ((Math.sin(i * 1.9) + 1) / 2));
        const sway =
          (Math.sin(seconds * 0.44 + i * 1.8 + this.seed) *
            0.025 *
            (0.3 + flow) +
            this.bend) *
          h;
        const tip = x + (i % 2 ? 1 : -1) * w * 0.22 + sway;
        g.moveTo(x * 0.4, 0)
          .quadraticCurveTo(x, -h * 0.3, tip, y)
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
