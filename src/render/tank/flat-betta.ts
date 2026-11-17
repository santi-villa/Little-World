import { Container, Graphics } from 'pixi.js';
import { newBettaPose, advanceBettaPose } from '../motion/betta-pose';
import type { FishBody } from '../motion/fish-motion';
import { lerpColor } from '../pixel-utils';

/** A procedural betta: layered anatomy, independent fins, no bitmap or generated art. */
export class FlatBetta {
  readonly container = new Container();
  private readonly g = new Graphics();
  private readonly pose;
  constructor(seed: number, facing: number) {
    this.pose = newBettaPose(facing, seed);
    this.container.addChild(this.g);
  }
  update(
    body: FishBody,
    x: number,
    y: number,
    length: number,
    dt: number,
    maxSpeed: number,
    intent: string,
    alive: boolean,
    lit: boolean,
    damage: number,
  ): void {
    const p = this.pose,
      g = this.g;
    advanceBettaPose(
      p,
      dt,
      body.vx,
      body.vy,
      body.facing,
      maxSpeed,
      intent,
      alive,
    );
    const yaw =
      (p.turn < 0 ? -1 : 1) *
      Math.max(0.32, Math.abs(Math.sin((p.turn * Math.PI) / 2)));
    this.container.position.set(x, y);
    this.container.rotation = p.pitch * (p.turn < 0 ? -1 : 1);
    this.container.scale.set(
      (length / 102) * yaw,
      (length / 102) * (alive ? 1 : -1),
    );
    this.container.tint = alive ? (lit ? 0xffffff : 0x688198) : 0x9d9d9d;
    g.clear();
    const t = p.phase,
      effort = p.effort,
      fin = 1 - 0.5 * damage;
    const sway = (a: number) => Math.sin(t - a) * (1.2 + 3 * effort) * fin;
    const points: number[] = [-24, -3];
    const rim: { x: number; y: number }[] = [];
    for (let i = 0; i <= 26; i++) {
      const a = 2.0 + (i / 26) * 2.28;
      const r = 1 + 0.04 * Math.sin(t * 1.2 + i * 0.8);
      const px = -24 + Math.cos(a) * 40 * fin * r;
      const py = Math.sin(a) * 29 * fin * r + 5 + sway(i * 0.16);
      rim.push({ x: px, y: py });
      points.push(px, py);
    }
    points.push(-24, 4);
    g.poly(points).fill(0x22517c);
    // Fin rays share their attachment point but ripple progressively toward the edge.
    for (let i = 0; i < rim.length; i++) {
      const v = rim[i]!;
      if (i % 3 === 0) {
        g.poly([-25, 0, v.x, v.y, v.x + 3, v.y + 1]).fill({
          color: 0x4a9ca4,
          alpha: 0.55,
        });
      }
      if (i > 1 && i < rim.length - 2) {
        const k = 0.65 + 0.06 * Math.sin(i * 3);
        g.moveTo(-25 + (v.x + 25) * k, v.y * k)
          .lineTo(v.x, v.y)
          .stroke({ color: i % 4 === 0 ? 0xf08068 : 0xb04466, width: 1.1 });
      }
    }
    g.moveTo(-24, -4)
      .lineTo(-24, -13)
      .quadraticCurveTo(-16, -28 + sway(0.7), 4, -21 + sway(1.4))
      .quadraticCurveTo(11, -18, 13, -8)
      .lineTo(8, -4)
      .closePath()
      .fill(0x316d8b);
    for (let i = 0; i < 7; i++) {
      const px = -20 + i * 4;
      g.moveTo(px, -6)
        .lineTo(px - 2, -17 + sway(i * 0.4))
        .stroke({ color: 0x79b0ba, width: 0.8, alpha: 0.7 });
    }
    g.moveTo(-23, 4)
      .quadraticCurveTo(-27, 25 + sway(0.2), -15, 29 + sway(0.6))
      .quadraticCurveTo(6, 29 + sway(1.2), 18, 7)
      .closePath()
      .fill(0x334a7e);
    for (let i = 0; i < 8; i++) {
      const px = -22 + i * 5;
      g.moveTo(px, 5)
        .lineTo(px - 2, 19 + sway(i * 0.35))
        .stroke({ color: i % 2 ? 0xc75c78 : 0x448a9e, width: 1.1, alpha: 0.8 });
    }
    // Convex body with six tonal bands: dark back, iridescent flank, shaded belly.
    const upper = (u: number) => -(2 + Math.sin(Math.PI * u) ** 0.6 * 10);
    const lower = (u: number) => 2 + Math.sin(Math.PI * u) ** 0.7 * 9;
    for (let band = 0; band < 6; band++) {
      const poly: number[] = [];
      for (let i = 0; i <= 24; i++) {
        const u = i / 24;
        poly.push(-27 + u * 61, upper(u) + ((lower(u) - upper(u)) * band) / 6);
      }
      for (let i = 24; i >= 0; i--) {
        const u = i / 24;
        poly.push(
          -27 + u * 61,
          upper(u) + ((lower(u) - upper(u)) * (band + 1)) / 6,
        );
      }
      g.poly(poly).fill(
        [0x173b53, 0x235d79, 0x3c8e9e, 0x438898, 0x36697f, 0x243e60][band]!,
      );
    }
    for (let row = 0; row < 3; row++)
      for (let i = 0; i < 7; i++) {
        const px = -15 + i * 5 + (row % 2) * 2,
          py = -5 + row * 4;
        g.poly([px, py, px + 2, py - 1, px + 4, py, px + 2, py + 1]).fill({
          color: row === 0 ? 0x9ec2b5 : 0x1e455c,
          alpha: 0.42,
        });
      }
    // Gill flexes with breathing. The head stays stable while the fins move.
    const breath = Math.sin(t * 0.75) * 0.6;
    g.moveTo(17, -7)
      .quadraticCurveTo(13 + breath, 0, 17, 7)
      .stroke({ color: 0x18354a, width: 1.2 });
    g.moveTo(18, -5)
      .quadraticCurveTo(16 + breath, 0, 18, 5)
      .stroke({ color: 0x72a7a6, width: 0.8 });
    const flap = 1.5 + Math.sin(t * 2.4) * 2;
    g.poly([12, 1, 3, 7 + flap, 11, 12 + flap, 16, 3]).fill({
      color: 0xa5c7bb,
      alpha: 0.55,
    });
    for (let i = 0; i < 2; i++)
      g.moveTo(16 + i * 3, 6)
        .quadraticCurveTo(11 + i * 3, 18, 15 + i * 3 + sway(i), 23)
        .stroke({ color: i ? 0xdeb7af : 0xa04968, width: 1.2 });
    g.ellipse(25, -2, 3.2, 3.4).fill(0x152e39);
    g.ellipse(25.3, -2.1, 2.2, 2.4).fill(0xc5b58c);
    g.ellipse(26, -2, 1.5, 2).fill(alive ? 0x0a1820 : 0x92999b);
    if (alive) g.rect(25, -4, 1, 1).fill(0xf4efcf);
    const mouth = intent === 'eat' ? Math.max(0, Math.sin(t * 3)) * 1.8 : 0;
    g.moveTo(31, 1)
      .lineTo(34, 1 + mouth)
      .stroke({ color: lerpColor(0x172c39, 0x617c7c, 0.2), width: 1.2 });
  }
  destroy(): void {
    this.container.destroy({ children: true });
  }
}
