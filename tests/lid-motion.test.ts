import { expect, it } from 'vitest';
import { LidMotion, lidPose } from '../src/render/motion/lid-motion';

it('la tapa se retrae hacia la bisagra y puede invertir el movimiento a mitad de camino', () => {
  const savedOpen = new LidMotion();
  const opened = lidPose(savedOpen.update(true, 0), 25);
  expect(opened.screenOffset).toBeLessThan(0);

  const lid = new LidMotion();
  const closed = lidPose(lid.update(false, 0), 25);
  expect(opened.reach).toBeLessThan(closed.reach);
  expect(closed.screenOffset).toBeCloseTo(8.5);
  for (let i = 0; i < 12; i++) lid.update(true, 1 / 60);
  const before = lidPose(lid.update(false, 0), 25).screenOffset;
  expect(before).toBeLessThan(closed.screenOffset);
  expect(lidPose(lid.update(false, 1 / 60), 25).screenOffset).toBeGreaterThan(before);
  for (let i = 0; i < 32; i++) lid.update(false, 1 / 60);
  expect(lidPose(lid.update(false, 0), 25)).toEqual(closed);
});
