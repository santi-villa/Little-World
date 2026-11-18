import { Container, FillGradient, Graphics } from 'pixi.js';
import { causticStrips, SurfaceRipples, surfaceSlope } from '../motion/water-light';
import type { HabitatSolid } from '../motion/solid-contact';
import type { UnderwaterLight } from '../scene/aquarium-environment';
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
  readonly light = new Container();
  readonly reflections = new Container();
  readonly surface = new SurfaceRipples();
  readonly sandLight = new Graphics();
  readonly frontSandLight = new Graphics();
  readonly objectLight = [new Graphics(), new Graphics(), new Graphics()] as const;
  readonly objectMasks = [new Graphics(), new Graphics(), new Graphics()] as const;
  private readonly shafts = new Graphics();
  private readonly glow = new Graphics();
  private readonly ripples = new Graphics();
  private readonly glassEdges = new Graphics();
  private readonly glints = new Graphics();
  private readonly ray = vertical([
    { offset: 0, color: '#fff6d044' }, { offset: 0.54, color: '#eef6cc16' }, { offset: 1, color: '#e8f8cd00' },
  ]);
  private readonly pool = softPool('#fff0be');
  private geometryKey = '';
  private glowKey = '';
  private nextCaustic = 0;
  private readonly wave = new Float32Array(41);
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
    this.reflections.addChild(this.glassEdges, this.glints);
    for (const [i, light] of this.objectLight.entries()) light.mask = this.objectMasks[i]!;
  }

  updateVisibility(visible: boolean) {
    this.light.visible = this.reflections.visible = visible;
    this.sandLight.visible = this.frontSandLight.visible = visible;
    for (const light of this.objectLight) light.visible = visible;
  }

  setProjectors(
    sandMask: Graphics,
    frontSandMask: Graphics,
    water: { x: number; y: number; width: number; height: number },
    solids: readonly HabitatSolid[],
    bottom: number,
  ): void {
    this.sandLight.mask = sandMask;
    this.frontSandLight.mask = frontSandMask;
    for (const mask of this.objectMasks) mask.clear();
    for (const light of this.objectLight) light.renderable = false;
    this.nextCaustic = 0;
    for (const solid of solids) {
      const plane = solid.z < 0.3 ? 0 : solid.z > 0.7 ? 2 : 1;
      const mask = this.objectMasks[plane];
      this.objectLight[plane].renderable = true;
      const x = water.x + solid.x * water.width;
      const y = water.y + solid.y * water.height;
      const cellW = solid.width * water.width / solid.columns;
      const cellH = solid.height * water.height / solid.rows;
      for (let row = 0; row < solid.rows; row++) {
        const top = Math.max(water.y, y + row * cellH);
        const height = Math.min(bottom, y + (row + 1) * cellH) - top;
        if (height <= 0) continue;
        let start = 0;
        for (let col = 0; col <= solid.columns; col++) {
          if (col < solid.columns && solid.alpha[row * solid.columns + col]) continue;
          if (col > start) mask.rect(x + start * cellW, top, (col - start) * cellW, height);
          start = col + 1;
        }
      }
    }
    for (const mask of this.objectMasks) mask.fill(0xffffff);
  }

  update(area: OpticalArea, seconds: number, lighting: UnderwaterLight, circulation = 0) {
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
      this.glassEdges.clear();
      this.glassEdges.poly([
        left + width * 0.135, top, left + width * 0.185, top,
        left + width * 0.045, bottom, left + width * 0.004, bottom,
      ]).fill(this.highlight);
      this.glassEdges.poly([
        left + width * 0.215, top, left + width * 0.224, top,
        left + width * 0.093, bottom, left + width * 0.083, bottom,
      ]).fill({ color: 0xf4ffff, alpha: 0.048 });
      this.glassEdges.rect(left + 0.8, top, 1.2, height).fill(this.edge)
        .rect(right - 2, top, 1.2, height).fill(this.edge);
    }
    const pulse = (1 + Math.sin(seconds * 0.38)) * 0.5;
    const { sun, lamp, exposure, color } = lighting;
    const projected = waterHeight > 12 ? Math.min(1, sun * 0.94 + lamp * 0.64) : 0;
    this.glow.alpha = 0.045 + exposure * (0.17 + pulse * 0.035);
    this.glow.tint = color;
    this.reflections.alpha = 0.28 + exposure * 0.37 + pulse * 0.09;
    this.reflections.tint = color;
    this.shafts.clear();
    this.ripples.clear();
    this.glints.clear();
    this.shafts.alpha = sun * (0.33 + pulse * 0.07) + lamp * 0.12;
    this.shafts.tint = color;
    this.sandLight.alpha = this.frontSandLight.alpha = projected;
    this.sandLight.tint = this.frontSandLight.tint = color;
    for (const light of this.objectLight) {
      light.alpha = projected;
      light.tint = color;
    }
    if (waterHeight <= 0) return;
    if (projected > 0.01 && waterHeight > 12) {
      for (let i = 0; i < 4; i++) {
        const u = 0.14 + i * 0.164;
        const start = left + u * width + Math.sin(seconds * 0.26 + i) * 3;
        const endY = waterTop + waterHeight * (0.7 + scatter(i, 21) * 0.32);
        const bend = (0.095 + surfaceSlope(u, seconds) * 0.31 + circulation * 0.012) * width;
        this.shafts.poly([
          start, waterTop, start + width * 0.028, waterTop,
          start + bend + width * 0.075, endY, start + bend - width * 0.015, endY,
        ]).fill(this.ray);
      }
    }
    // The projected highlights drift slowly. Reuse their geometry between
    // updates while the surface and the exposure still move every frame.
    if (projected > 0.01 && seconds >= this.nextCaustic) {
      this.nextCaustic = seconds + 1 / 30;
      this.sandLight.clear();
      this.frontSandLight.clear();
      for (const light of this.objectLight) light.clear();
      const strips = causticStrips(seconds, 11);
      for (const [i, strip] of strips.entries()) {
        const x = left + strip.x * width;
        const drift = Math.sin(seconds * 0.69 + i * 1.83);
        const spread = width * (0.025 + scatter(i, 21) * 0.028);
        const floor = sandTop - 9 + scatter(i, 47) * 20 + drift * 2.2;
        this.drawCaustic(this.sandLight, x, floor, spread, 2.1 + drift * 0.7, strip.intensity * 0.32);
        this.drawCaustic(this.frontSandLight, x + spread * 0.42, floor + 14, spread * 1.1,
          1.7 - drift * 0.5, strip.intensity * 0.22);
        for (const [plane, light] of this.objectLight.entries()) {
          if (!light.renderable) continue;
          const y = sandTop - waterHeight * (0.15 + scatter(i, 53 + plane) * 0.27) + drift * 4 + plane * 5;
          this.drawCaustic(light, x + plane * 3, y, spread * 0.94,
            4 + drift * 1.8, strip.intensity * 0.25);
        }
      }
    }
    // The waterline and its reflected secondary edge are both moving curves.
    for (let i = 1; i < this.wave.length; i++) {
      this.wave[i] = this.surface.displacement(i / (this.wave.length - 1), seconds);
    }
    for (const offset of [0, 1.3, 3.4]) {
      this.ripples.moveTo(left, waterTop + offset);
      for (let i = 1; i < this.wave.length; i++) {
        const u = i / (this.wave.length - 1);
        this.ripples.lineTo(left + width * u, waterTop + this.wave[i]! * (offset ? 0.64 : 1) + offset);
      }
      const glimmer = 0.79 + 0.21 * Math.sin(seconds * 0.74 + offset);
      this.ripples.stroke({ color: offset > 2 ? 0x457d75 : color, width: offset ? 0.56 : 0.82,
        alpha: (0.12 + exposure * (offset ? 0.08 : 0.43)) * glimmer });
    }
    const flash = Math.max(0, Math.sin(seconds * 0.66 - 0.4)) ** 14;
    if (exposure > 0.25 && flash > 0.02) {
      this.glints.circle(right - 1.4, top + height * 0.2, 1.1).fill({ color: 0xfcfff1, alpha: flash * exposure * 0.6 });
    }
  }

  private drawCaustic(g: Graphics, x: number, y: number, span: number, rise: number, alpha: number): void {
    g.moveTo(x - span, y + rise * 0.6)
      .quadraticCurveTo(x - span * 0.18, y - rise * 1.8, x + span * 0.15, y)
      .quadraticCurveTo(x + span * 0.61, y + rise * 1.35, x + span, y - rise * 0.52)
      .stroke({ width: 0.68, color: 0xffffff, alpha, cap: 'round' });
  }
}
