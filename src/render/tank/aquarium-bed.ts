import { FillGradient, Graphics } from 'pixi.js';
import { scatter } from '../pixel-utils';
import { softPool, type OpticalArea } from './illustrated-optics';

export type DecorPlane = 'back' | 'middle' | 'front';

export const planeDepth = { back: 0.16, middle: 0.53, front: 0.86 } as const;
const offset = { back: -13, middle: -2, front: 8 } as const;

// A small ridge under the roots on the left and a lower shelf beneath the stone.
// The same profile locates planted objects, sand masks and the scattered grains.
export function bedSurface(area: OpticalArea, u: number, plane: DecorPlane): number {
  const relief = -4.9 * Math.exp(-((u - 0.21) ** 2) / 0.017)
    - 3.5 * Math.exp(-((u - 0.81) ** 2) / 0.016)
    + 0.8 * Math.sin(u * 29 + planeDepth[plane] * 2);
  return area.sandTop + offset[plane] + relief;
}

function contour(g: Graphics, area: OpticalArea, plane: DecorPlane, above = false) {
  const edge = above ? area.top : area.top + area.height;
  g.clear().moveTo(area.left, bedSurface(area, 0, plane));
  for (let i = 1; i <= 56; i++) {
    const u = i / 56;
    g.lineTo(area.left + u * area.width, bedSurface(area, u, plane));
  }
  return g.lineTo(area.left + area.width, edge).lineTo(area.left, edge).closePath();
}

export class AquariumBed {
  readonly backMask = new Graphics();
  readonly frontMask = new Graphics();
  readonly terrain = new Graphics();
  readonly above = { back: new Graphics(), middle: new Graphics(), front: new Graphics() };
  readonly details = new Graphics();
  readonly rootSeams = { back: new Graphics(), middle: new Graphics(), front: new Graphics() };
  private readonly rootShade = softPool('#584732');
  private readonly shelves = new Graphics();
  private readonly grains = new Graphics();
  private readonly stones = new Graphics();
  private readonly relief = new FillGradient({
    start: { x: 0, y: 0 }, end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: '#55443051' }, { offset: 0.22, color: '#8474561a' },
      { offset: 0.63, color: '#e8d7ab08' }, { offset: 1, color: '#7c674640' },
    ],
  });
  private readonly frontLight = new FillGradient({
    start: { x: 0, y: 0 }, end: { x: 0, y: 1 },
    colorStops: [{ offset: 0, color: '#fae5b22a' }, { offset: 0.55, color: '#fae5b200' }, { offset: 1, color: '#5647342b' }],
  });

  constructor() {
    this.terrain.addChild(this.shelves, this.grains);
    this.details.addChild(this.stones);
  }

  build(area: OpticalArea) {
    for (const plane of ['back', 'middle', 'front'] as const) {
      const mask = this.above[plane];
      contour(mask, area, plane, true).fill(0xffffff);
      mask.visible = false;
      this.rootSeams[plane].clear();
    }
    contour(this.backMask, area, 'back').fill(0xffffff);
    contour(this.frontMask, area, 'front').fill(0xffffff);
    contour(this.shelves, area, 'back').fill(this.relief);
    this.grains.clear();
    this.stones.clear();
    const bottom = area.top + area.height;
    for (let palette = 0; palette < 3; palette++) {
      for (let i = 0; i < 112; i++) {
        const u = scatter(i, 711 + palette * 11);
        const horizon = bedSurface(area, u, 'back');
        const v = scatter(i, 725 + palette * 11);
        const size = (0.18 + v * 0.63) * (0.55 + 0.45 * scatter(i, 734));
        this.grains.ellipse(area.left + area.width * u, horizon + v * (bottom - horizon - 0.3), size, size * 0.45);
      }
      this.grains.fill({ color: [0x876842, 0xf7e7bd, 0xae9a71][palette]!, alpha: 0.38 });
    }
    contour(this.details, area, 'front').fill(this.frontLight);
    // A few clustered pebbles mixed with tiny scattered grains. Stable seeds
    // keep the composition fixed when the camera or light changes.
    for (let i = 0; i < 27; i++) {
      const v = scatter(i, 742);
      const center = [0.27, 0.58, 0.78][i % 3]!;
      const u = i < 20 ? center + (scatter(i, 751) - 0.5) * 0.18 : 0.08 + scatter(i, 756) * 0.84;
      const x = area.left + u * area.width;
      const y = bedSurface(area, u, 'front') + 1.2 + v * 7;
      const rx = 0.65 + scatter(i, 753) ** 2 * (2 + v * 2.1);
      const ry = rx * (0.34 + 0.14 * v);
      this.stones.ellipse(x + rx * 0.17, y + ry * 0.47, rx * 1.16, ry * 0.78).fill({ color: 0x4f4736, alpha: 0.28 });
      this.stones.ellipse(x, y, rx, ry).fill([0x8d8371, 0xa69d7e, 0xc0ad8e, 0x797d69][i % 4]!);
      this.stones.ellipse(x - rx * 0.18, y - ry * 0.31, rx * 0.63, ry * 0.36).fill({ color: 0xe8d9ae, alpha: 0.56 });
    }
  }

  /** Small occlusion and grains spill onto the buried edge of each stem. */
  seatRoots(area: OpticalArea, plane: DecorPlane, u: number, width: number, seed: number) {
    const g = this.rootSeams[plane];
    const spread = Math.max(3, width * 0.19);
    const y = bedSurface(area, u, plane);
    const x = area.left + u * area.width;
    g.ellipse(x + spread * 0.16, y + 0.8, spread, Math.min(2.2, spread * 0.22))
      .fill({ fill: this.rootShade, alpha: 0.53 });
    for (let i = 0; i < 13; i++) {
      const dx = (scatter(i, 819 + seed) - 0.5) * spread * 1.95;
      const edge = bedSurface(area, u + dx / area.width, plane);
      const lift = scatter(i, 845 + seed);
      const size = 0.24 + scatter(i, 877 + seed) * 0.39;
      g.ellipse(x + dx, edge + 0.16 + lift * 2.1, size, size * 0.54)
        .fill({ color: i % 3 === 0 ? 0x907a55 : 0xe3cd9e, alpha: 0.28 + (1 - lift) * 0.17 });
    }
  }

  tint(color: number) {
    this.terrain.tint = color;
    this.details.tint = color;
    for (const contact of Object.values(this.rootSeams)) contact.tint = color;
  }
}
