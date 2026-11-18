import type { Container } from 'pixi.js';
import type { IllustratedInput } from '../motion/illustrated-betta-pose';

export interface IllustratedFishRenderer {
  readonly container: Container;
  update(input: IllustratedInput, x: number, y: number, length: number, dt: number, lit: boolean, damage?: number): void;
  destroy(): void;
}

export type IllustratedFishFactory = (id: number, facing: number, species: string) => IllustratedFishRenderer | undefined;
