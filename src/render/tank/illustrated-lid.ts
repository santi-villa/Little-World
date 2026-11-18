import { Container, FillGradient, Graphics } from 'pixi.js';
import { LidMotion, lidPose } from '../motion/lid-motion';

/** Painted bronze and walnut hardware in the same coordinate system as the glass. */
export class IllustratedLid {
  readonly container = new Container();
  private readonly pivot = new Graphics();
  private readonly shadow = new Graphics();
  private readonly panel = new Graphics();
  private readonly motion = new LidMotion();
  private readonly surface = new FillGradient({
    start: { x: 0, y: 0 }, end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: '#38332d' }, { offset: 0.47, color: '#605547' },
      { offset: 1, color: '#4c4033' },
    ],
  });
  private readonly edge = new FillGradient({
    start: { x: 0, y: 0 }, end: { x: 1, y: 0 },
    colorStops: [
      { offset: 0, color: '#43382d' }, { offset: 0.42, color: '#85705a' },
      { offset: 0.62, color: '#705b45' }, { offset: 1, color: '#3e332a' },
    ],
  });
  private key = '';
  private last = -1;

  constructor() {
    this.container.addChild(this.pivot, this.shadow, this.panel);
  }

  update(open: boolean, dt: number, width: number, rim: number) {
    const progress = this.motion.update(open, dt);
    const key = `${width}:${rim}`;
    if (this.key === key && this.last === progress) return;

    const rear = rim * 0.34;
    const inset = 14;
    const front = rim + 1;
    if (this.key !== key) {
      this.key = key;
      // The rear hinge is part of a fixed collar connected to both glass sides.
      this.pivot.clear()
        .poly([inset, rear, width - inset, rear, width - 4, front, 4, front])
        .fill({ color: 0x7f9788, alpha: 0.14 })
        .poly([inset, rear, inset + 3, rear, 9, front + 1, 4, front + 1]).fill(0x534c40)
        .poly([width - inset - 3, rear, width - inset, rear, width - 4, front + 1, width - 9, front + 1]).fill(0x534c40)
        .roundRect(inset, rear - 1, width - inset * 2, 2.9, 1).fill(0x423a31);
      for (const x of [width * 0.18, width * 0.82]) {
        this.pivot.roundRect(x - 6, rear - 1.5, 12, 4.5, 1).fill(0x80725f)
          .stroke({ color: 0xc0ae91, width: 0.5, alpha: 0.65 });
      }
    }

    const pose = lidPose(progress, rim * 1.58);
    const tip = rear + pose.screenOffset;
    const tipInset = inset - pose.reach * (inset - 3);
    const bevel = 1.25 + pose.reach * 2.5;
    this.shadow.clear();
    const cast = front - 3 - pose.rise * 9;
    for (let i = 0; i < 3; i++) {
      this.shadow.roundRect(7 + i * 1.6, cast + i * 1.9, width - 14 - i * 3.2, 2.5, 1)
        .fill({ color: 0x251d16, alpha: (0.18 - i * 0.045) * (1 - pose.rise * 0.52) });
    }
    this.panel.clear()
      .poly([inset, rear, width - inset, rear, width - tipInset, tip, tipInset, tip])
      .fill(this.surface)
      .stroke({ color: 0x312820, width: 0.75, alpha: 0.93 });
    this.panel.poly([tipInset, tip, width - tipInset, tip, width - tipInset - 0.8, tip + bevel, tipInset + 0.8, tip + bevel])
      .fill(this.edge);
    this.panel.moveTo(tipInset + 1, tip + 0.65).lineTo(width - tipInset - 1, tip + 0.65)
      .stroke({ color: 0xc6b396, width: 0.65, alpha: 0.47 });
    this.last = progress;
  }
}
