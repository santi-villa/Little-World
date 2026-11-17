import { Container, Graphics } from 'pixi.js';
export function birdPose(seconds: number) {
  const cycle = (((seconds - 20) % 100) + 100) % 100;
  if (seconds < 20 || cycle > 15) return null;
  const enter = cycle < 3,
    leave = cycle > 12,
    t = enter ? cycle / 3 : leave ? (cycle - 12) / 3 : 1;
  const ease = t * t * (3 - 2 * t);
  return {
    x: enter ? -130 * (1 - ease) : leave ? 150 * ease : 0,
    y: enter
      ? -80 * (1 - ease) ** 2
      : leave
        ? -110 * ease * ease
        : Math.sin(seconds * 2) *
          0.6 *
          Math.sin(((cycle - 3) / 9) * Math.PI) ** 2,
    flight: enter || leave,
    wing: enter
      ? Math.min(1, (3 - cycle) / 0.7)
      : leave
        ? Math.min(1, (cycle - 12) / 0.7)
        : 0,
    phase: seconds * 15,
  };
}
export class CodeBird {
  readonly container = new Container();
  private g = new Graphics();
  constructor() {
    this.container.addChild(this.g);
  }
  update(
    seconds: number,
    allowed: boolean,
    light: number,
    x: number,
    y: number,
  ): void {
    const p = birdPose(seconds);
    this.container.visible = allowed && !!p;
    if (!p) return;
    this.container.position.set(x + p.x, y + p.y);
    this.container.tint = light > 0.5 ? 0xffffff : 0x6b7b91;
    const g = this.g;
    g.clear();
    const flap = 2 + Math.sin(p.phase) * 17 * p.wing;
    g.poly([-5, 0, -23, -5, -17, 4, -4, 5]).fill(0x4e514b);
    g.ellipse(0, 0, 11, 6).fill(0x77765e);
    g.ellipse(5, -3, 7, 6).fill(0x958b6a);
    g.moveTo(-6, 0)
      .quadraticCurveTo(-10, -flap - 5, 1, -flap - 12)
      .quadraticCurveTo(6, -flap - 2, 5, 2)
      .closePath()
      .fill(0x555e58);
    g.poly([10, -5, 18, -3, 10, -1]).fill(0xc1a277);
    g.circle(8, -5, 1.1).fill(0x182a2b);
    if (!p.flight) {
      g.moveTo(-3, 5)
        .lineTo(-4, 10)
        .lineTo(-1, 10)
        .moveTo(3, 5)
        .lineTo(2, 10)
        .lineTo(5, 10)
        .stroke({ color: 0x63523c, width: 1 });
    }
  }
}
