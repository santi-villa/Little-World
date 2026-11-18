import type { TankDecor, TankDecorItem } from './tank-view';
import type { TankRect } from './tank-layout';
import type { DecorPlane } from './aquarium-bed';

/** Local tank units keep visual sizes independent of PNG resolution. */
export const FRONT_GLASS = {
  width: 440, height: 255,
  inner: { x: 10, y: 23.5, width: 420, height: 207 },
  lidCut: 25,
} as const;

export const TABLE = { center: 641, support: 441, standardWidth: 459, minWidth: 238, maxWidth: 550 };

export function illustratedFrame(length: number, source: { width: number; height: number; inner: TankRect }) {
  const width = Math.round(Math.max(TABLE.minWidth, Math.min(TABLE.maxWidth, TABLE.standardWidth * length / 60)));
  const scale = width / source.width;
  const height = source.height * scale;
  const x = TABLE.center - width / 2, y = TABLE.support - height;
  const { inner } = source;
  return {
    outer: { x, y, width, height },
    inner: { x: x + inner.x * scale, y: y + inner.y * scale, width: inner.width * scale, height: inner.height * scale },
    scale,
  };
}

const plant = (asset: string, x: number, height: number, layer: DecorPlane, flip = false): TankDecorItem =>
  ({ asset, plant: asset === 'narrow-leaf' || asset === 'green-stem' ? 'vallisneria' : 'anubias',
    x, height, sink: 0.06, flip, layer });
const object = (asset: string, x: number, width: number, layer: DecorPlane = 'middle'): TankDecorItem =>
  ({ asset, x, width, layer, sink: 0.08 });

export const illustratedDecor: Record<string, TankDecor> = {
  default: {
    substrate: 'fine-ripples',
    items: [
      plant('green-stem', 0.24, 0.70, 'back', true),
      plant('narrow-leaf', 0.13, 0.56, 'middle'),
      plant('broad-leaf', 0.82, 0.45, 'middle', true),
      object('low-branch', 0.36, 0.36),
      object('mossy-river-stone', 0.74, 0.17),
      object('rounded-stone', 0.69, 0.055, 'front'),
      object('layered-stone', 0.26, 0.044, 'front'),
    ],
  },
  garden: {
    substrate: 'warm-sand',
    items: [
      plant('narrow-leaf', 0.15, 0.72, 'back', true),
      plant('green-stem', 0.35, 0.56, 'back'),
      plant('arching-leaf', 0.84, 0.62, 'middle', true),
      plant('broad-leaf', 0.19, 0.42, 'middle'),
      object('upright-root', 0.39, 0.26),
      object('rounded-stone', 0.7, 0.13),
      object('mossy-river-stone', 0.66, 0.05, 'front'),
    ],
  },
  stones: {
    substrate: 'pale-sand',
    items: [
      plant('arching-leaf', 0.18, 0.58, 'back'),
      plant('narrow-leaf', 0.86, 0.69, 'back', true),
      plant('broad-leaf', 0.8, 0.39, 'middle'),
      object('layered-stone', 0.32, 0.26),
      object('rounded-stone', 0.68, 0.17),
      object('mossy-river-stone', 0.56, 0.10, 'front'),
    ],
  },
};
