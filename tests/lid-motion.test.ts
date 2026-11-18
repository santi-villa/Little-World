import { expect, it } from 'vitest';
import { LidMotion, lidProjection } from '../src/render/motion/lid-motion';

it('la tapa conserva el ángulo inicial guardado y puede invertir el movimiento a mitad de camino', () => {
  const savedOpen = new LidMotion();
  expect(lidProjection(savedOpen.update(true, 0), 25)).toBeLessThan(0);

  const lid = new LidMotion();
  expect(lidProjection(lid.update(false, 0), 25)).toBeCloseTo(25);
  for (let i = 0; i < 12; i++) lid.update(true, 1 / 60);
  const before = lidProjection(lid.update(false, 0), 25);
  expect(before).toBeGreaterThan(0);
  expect(before).toBeLessThan(25);
  expect(lidProjection(lid.update(false, 1 / 60), 25)).toBeGreaterThan(before);
  for (let i = 0; i < 32; i++) lid.update(false, 1 / 60);
  expect(lidProjection(lid.update(false, 0), 25)).toBeCloseTo(25);
});
