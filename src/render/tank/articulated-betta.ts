import { Container, Sprite, Texture, Rectangle, Graphics } from 'pixi.js';
import { tex } from '../assets';
import {
  bettaParameters as c,
  type BettaDynamics,
} from '../motion/betta-dynamics';
import type { FishBody } from '../motion/fish-motion';
import { angleDiff } from '../motion/steering';
/** Rigid texture pieces: no mesh, shader, or per-pixel deformation. */
export class ArticulatedBetta {
  readonly container = new Container();
  private head = new Container();
  private rear = new Container();
  private tail = new Container();
  private pectorals = new Graphics();
  private turn = 1;
  private rearAngle = 0;
  private tailAngle = 0;
  private finVelocity = 0;
  private previousSpeed = 0;
  private owned: Texture[] = [];
  constructor(seed: number, facing: number) {
    this.container.label = 'fish-' + seed;
    this.turn = facing;
    const texture = tex('betta-articulated'),
      W = texture.width,
      H = texture.height,
      cuts = c.spriteCuts.map((v) => Math.round(v * W));
    const piece = (from: number, to: number) => {
      const t = new Texture({
        source: texture.source,
        frame: new Rectangle(from, 0, to - from, H),
      });
      this.owned.push(t);
      const s = new Sprite(t);
      s.pivot.set(to - from, H * c.spriteHeight);
      return s;
    };
    this.head.addChild(piece(cuts[2]!, cuts[3]!));
    this.rear.addChild(piece(cuts[1]!, cuts[2]!));
    this.tail.addChild(piece(cuts[0]!, cuts[1]!));
    this.rear.x = -(cuts[3]! - cuts[2]!) + c.overlapPixels;
    this.tail.x = -(cuts[2]! - cuts[1]!) + c.overlapPixels;
    this.head.x = W * c.spriteHeight;
    this.container.addChild(this.head);
    this.head.addChild(this.rear, this.pectorals);
    this.rear.addChild(this.tail);
  }
  update(
    b: FishBody,
    m: BettaDynamics | undefined,
    x: number,
    y: number,
    len: number,
    dt: number,
    lit: boolean,
    alive: boolean,
  ): void {
    const texture = tex('betta-articulated'),
      k = Math.max(1, Math.round(len / texture.width)),
      target = b.facing;
    this.turn += (target - this.turn) * (1 - Math.exp(-dt * c.turnEase));
    const flip = this.turn < 0 ? -1 : 1;
    this.container.position.set(
      Math.round(x),
      Math.round(
        y + ((m?.bob ?? 0) * len) / Math.max(c.epsilon, m?.sizeCm ?? 1),
      ),
    );
    this.container.scale.set(
      k * flip * Math.max(c.turnMinWidth, Math.abs(this.turn)),
      alive ? k : -k,
    );
    this.container.tint = lit ? 0xffffff : 0x8994a3;
    if (alive) {
      const speed = Math.hypot(b.vx, b.vy),
        pitch = m?.pitch ?? 0,
        phase = m?.phase ?? 0;
      this.head.rotation =
        (m?.mode === 'food' ? (-c.foodPitchDeg * Math.PI) / 180 : pitch) * flip;
      this.tail.scale.y = m?.mode === 'flare' ? c.flareScale : 1;
      const curve =
        (angleDiff(b.heading, Math.atan2(b.vy, b.vx)) * c.turnCurveDeg) / 180;
      const amplitude =
        ((c.tailAmplitudeDeg * Math.PI) / 180) *
        (m?.stroke === 'burst' ? 1 : 0);
      const rearTarget =
        Math.sin(phase - c.jointLagSeconds) * amplitude + curve;
      this.rearAngle +=
        (rearTarget - this.rearAngle) *
        (1 - Math.exp(-dt / Math.max(c.epsilon, c.jointLagSeconds)));
      const targetTail =
        Math.sin(phase - 2 * c.jointLagSeconds) * amplitude * 2 +
        this.rearAngle -
        (speed - this.previousSpeed) * c.finAccelerationLag;
      let remaining = Math.min(dt, c.maxDelta);
      while (remaining > 0) {
        const h = Math.min(remaining, c.stepSeconds);
        remaining -= h;
        this.finVelocity +=
          (c.finSpring * (targetTail - this.tailAngle) -
            c.finDamping * this.finVelocity) *
          h;
        this.tailAngle += this.finVelocity * h;
      }
      this.rear.rotation = this.rearAngle;
      this.tail.rotation = this.tailAngle;
      this.previousSpeed = speed;
    }
    this.pectorals.clear();
    if (alive) {
      const t = Math.sin(
          (m?.phase ?? 0) +
            (performance.now() / 1000) * c.pectoralHz * Math.PI * 2,
        ),
        height = texture.height * c.heightFraction * c.floatAmplitude;
      this.pectorals
        .moveTo(-texture.width * c.bodyFraction, 0)
        .lineTo(
          -texture.width * c.bodyFraction + height,
          Math.round((t * c.pectoralAmplitudeDeg) / Math.PI),
        )
        .stroke({ color: 0xd8b2aa, width: 1 });
    }
  }
  destroy(): void {
    this.container.destroy({ children: true });
    for (const t of this.owned) t.destroy(false);
  }
}
