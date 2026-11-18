import type { TankDecor, TankDecorItem } from './tank-view';
import type { TankRect } from './tank-layout';

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

const plant = (asset: string, x: number, height: number, flip = false): TankDecorItem =>
  ({ asset, plant: 'anubias', x, height, sink: 0.095, flip, layer: 'back' });
const object = (asset: string, x: number, width: number, depth: 'back' | 'front' = 'back'): TankDecorItem =>
  ({ asset, x, width, layer: depth, sink: 0.08 });

export const illustratedDecor: Record<string, TankDecor> = {
  default: {
    substrate: 'fine-ripples',
    items: [
      plant('narrow-leaf', 0.18, 0.53),
      plant('broad-leaf', 0.81, 0.41, true),
      object('low-branch', 0.34, 0.35),
      object('mossy-river-stone', 0.72, 0.18, 'front'),
    ],
  },
  garden: {
    substrate: 'warm-sand',
    items: [
      plant('narrow-leaf', 0.16, 0.65, true),
      plant('green-stem', 0.33, 0.49),
      plant('arching-leaf', 0.8, 0.57, true),
      object('upright-root', 0.47, 0.28),
      object('rounded-stone', 0.72, 0.13, 'front'),
    ],
  },
  stones: {
    substrate: 'pale-sand',
    items: [
      plant('arching-leaf', 0.19, 0.46),
      plant('broad-leaf', 0.84, 0.5, true),
      object('layered-stone', 0.35, 0.29),
      object('rounded-stone', 0.67, 0.19, 'front'),
      object('mossy-river-stone', 0.54, 0.09, 'front'),
    ],
  },
};
