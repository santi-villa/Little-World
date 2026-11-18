import { FillGradient, Graphics } from 'pixi.js';
import { causticStrips, surfaceSlope } from '../motion/water-light';
import { scatter } from '../pixel-utils';

export interface OpticalArea {
  left: number;
  top: number;
  width: number;
  height: number;
  waterTop: number;
  waterHeight: number;
  sandTop: number;
}

const vertical = (stops: { offset: number; color: number | string }[]) =>
  new FillGradient({ start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, colorStops: stops });

export function softPool(color: string) {
  return new FillGradient({
    type: 'radial',
    colorStops: [{ offset: 0, color: color + 'ff' }, { offset: 1, color: color + '00' }],
  });
}

export function fillWater(g: Graphics, area: OpticalArea, colors: [number, number, number], lit: boolean) {
  const { left, top, width, height, waterTop, waterHeight } = area;
  const air = vertical([
    { offset: 0, color: lit ? 0xaebdb0 : 0x202f39 },
    { offset: 1, color: colors[2] },
  ]);
  g.rect(left, top, width, height).fill(air);
  if (waterHeight <= 0) return [air];
  const water = vertical([
    { offset: 0, color: colors[0] },
    { offset: 0.38, color: colors[1] },
    { offset: 1, color: colors[2] },
  ]);
  g.rect(left, waterTop, width, waterHeight).fill(water);
  // Narrow seals at the rear corners and a gentle floor gradient give the
  // frontal pane a sense of depth without showing a side of the exterior.
  const seals = new FillGradient({
    start: { x: 0, y: 0 }, end: { x: 1, y: 0 },
    colorStops: [
      { offset: 0, color: '#17363364' }, { offset: 0.18, color: '#17363300' },
      { offset: 0.79, color: '#17363300' }, { offset: 1, color: '#17363364' },
    ],
  });
  g.rect(left, waterTop, width, waterHeight).fill(seals);
  return [air, water, seals];
}

export class IllustratedOptics {
  readonly light = new Graphics();
  readonly reflections = new Graphics();
  private readonly shafts = new Graphics();
  private readonly glow = new Graphics();
  private readonly ripples = new Graphics();
  private readonly glints = new Graphics();
  private readonly ray = vertical([
    { offset: 0, color: '#fff6d044' }, { offset: 0.54, color: '#eef6cc16' }, { offset: 1, color: '#e8f8cd00' },
  ]);
  private readonly pool = softPool('#fff0be');
  private geometryKey = '';
  private glowKey = '';
  private readonly highlight = new FillGradient({
    start: { x: 0.02, y: 0.53 }, end: { x: 0.95, y: 0.40 },
    colorStops: [
      { offset: 0, color: '#f4ffff00' }, { offset: 0.48, color: '#f4ffff31' }, { offset: 1, color: '#f4ffff00' },
    ],
  });
  private readonly edge = vertical([
    { offset: 0, color: '#d2e6c750' }, { offset: 1, color: '#d2e6c71c' },
  ]);

  constructor() {
    this.light.addChild(this.glow, this.shafts, this.ripples);
    this.reflections.addChild(this.glints);
  }

  updateVisibility(visible: boolean) {
    this.light.visible = this.reflections.visible = visible;
  }

  update(area: OpticalArea, seconds: number, lit: boolean) {
    const { left, top, width, height, waterTop, waterHeight, sandTop } = area;
    const right = left + width, bottom = top + height;
    const key = [left, top, width, height].join();
    const glowKey = `${key}:${waterTop}`;
    if (glowKey !== this.glowKey) {
      this.glowKey = glowKey;
      this.glow.clear().ellipse(left + width * 0.41, waterTop + 4, width * 0.49, Math.max(1, waterHeight * 0.63)).fill(this.pool);
    }
    if (key !== this.geometryKey) {
      this.geometryKey = key;
      this.reflections.clear();
      this.reflections.poly([
        left + width * 0.135, top, left + width * 0.185, top,
        left + width * 0.045, bottom, left + width * 0.004, bottom,
      ]).fill(this.highlight);
      this.reflections.poly([
        left + width * 0.215, top, left + width * 0.224, top,
        left + width * 0.093, bottom, left + width * 0.083, bottom,
      ]).fill({ color: 0xf4ffff, alpha: 0.048 });
      this.reflections.rect(left + 0.8, top, 1.2, height).fill(this.edge)
        .rect(right - 2, top, 1.2, height).fill(this.edge);
    }
    const pulse = (1 + Math.sin(seconds * 0.38)) * 0.5;
    this.glow.alpha = lit ? 0.22 + pulse * 0.035 : 0.045;
    this.reflections.alpha = (lit ? 0.65 : 0.32) + pulse * 0.09;
    this.shafts.clear();
    this.ripples.clear();
    this.glints.clear();
    if (waterHeight <= 0) return;
    this.shafts.alpha = lit ? 0.26 + pulse * 0.06 : 0;
    if (lit && waterHeight > 12) {
      for (let i = 0; i < 4; i++) {
        const u = 0.14 + i * 0.164;
        const start = left + u * width + Math.sin(seconds * 0.26 + i) * 3;
        const endY = waterTop + waterHeight * (0.7 + scatter(i, 21) * 0.32);
        const bend = (0.095 + surfaceSlope(u, seconds) * 0.31) * width;
        this.shafts.poly([
          start, waterTop, start + width * 0.028, waterTop,
          start + bend + width * 0.075, endY, start + bend - width * 0.015, endY,
        ]).fill(this.ray);
      }
      // Analytic refraction from the moving surface, projected onto the sand.
      for (const strip of causticStrips(seconds, 14)) {
        this.ripples.ellipse(left + strip.x * width, sandTop + 2.3, width * 0.044, 1.5)
          .fill({ color: 0xfaf2bf, alpha: strip.intensity * 0.14 });
      }
    }
    // The waterline and its reflected secondary edge are both moving curves.
    for (const offset of [0, 1.75]) {
      this.ripples.moveTo(left, waterTop + offset);
      for (let i = 1; i <= 40; i++) {
        const u = i / 40;
        const wave = 0.64 * Math.sin(24 * u - seconds * 1.42) + 0.35 * Math.sin(45 * u + seconds * 1.1);
        this.ripples.lineTo(left + width * u, waterTop + wave + offset);
      }
      this.ripples.stroke({ color: 0xe1f5d9, width: offset ? 0.55 : 0.85, alpha: lit ? (offset ? 0.11 : 0.56) : 0.15 });
    }
    const flash = Math.max(0, Math.sin(seconds * 0.66 - 0.4)) ** 14;
    if (lit && flash > 0.02) {
      this.glints.circle(right - 1.4, top + height * 0.2, 1.1).fill({ color: 0xfcfff1, alpha: flash * 0.6 });
    }
  }
}

/** One texture with two contours. The foreground lip hides the ends of roots. */
export function traceBed(g: Graphics, area: OpticalArea, ridge: number, amount: number) {
  const { left, top, width, height } = area;
  const bottom = top + height;
  g.clear().moveTo(left, ridge - amount * 0.55);
  g.bezierCurveTo(left + width * 0.18, ridge - amount * 1.43, left + width * 0.42, ridge + amount * 0.76, left + width * 0.59, ridge + amount * 0.19)
    .bezierCurveTo(left + width * 0.76, ridge - amount * 0.65, left + width * 0.85, ridge - amount * 0.92, left + width, ridge - amount * 0.19)
    .lineTo(left + width, bottom).lineTo(left, bottom).closePath();
}
