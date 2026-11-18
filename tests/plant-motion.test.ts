import { describe, it, expect } from 'vitest';
import { PlantMotion, plantWakeDistance } from '../src/render/motion/plant-motion';
describe('plantas sumergidas', () => {
  it('fija la raíz y flexiona cada tramo sin saltar al acercarse un pez', () => {
    const p = new PlantMotion();
    p.update(1 / 60, 0, 0, [{ height: 0.7, distance: 0, speed: 2 }]);
    expect(p.offsets[0]).toBe(0);
    expect(Math.max(...p.offsets)).toBeLessThan(0.01);
    expect(p.offsets[6]).toBeGreaterThan(p.offsets[1]!);
  });
  it('amortigua una perturbación y permanece estable con cuadros lentos', () => {
    const p = new PlantMotion();
    p.offsets[6] = 0.3;
    for (let i = 0; i < 600; i++) p.update(0.1, i * 0.1, 0);
    expect(p.offsets.every(Number.isFinite)).toBe(true);
    expect(Math.max(...p.offsets.map(Math.abs))).toBeLessThan(0.15);
    expect(p.offsets[0]).toBe(0);
  });
  it('el filtro produce más desplazamiento que el agua casi quieta', () => {
    const a = new PlantMotion(),
      b = new PlantMotion();
    let x = 0,
      y = 0;
    for (let i = 0; i < 900; i++) {
      a.update(1 / 60, i / 60, 0);
      b.update(1 / 60, i / 60, 1);
      x += Math.abs(a.offsets[8]!);
      y += Math.abs(b.offsets[8]!);
    }
    expect(y).toBeGreaterThan(x * 3);
  });
  it('limita la estela a la copa cercana y amortigua el movimiento al pasar el pez', () => {
    expect(plantWakeDistance(0.05, 0.32, 0.6)).toBe(1);
    expect(plantWakeDistance(0.05, 0.02, -0.1)).toBe(1);
    const near = plantWakeDistance(0.05, 0.02, 0.6);
    const far = plantWakeDistance(0.6, 0.21, 0.6);
    expect(near).toBeLessThan(far);
    const crown = new PlantMotion(), reference = new PlantMotion();
    crown.receiveImpulse(0.6, 0.09 * (1 - near));
    const water = { base: 0.1, tip: -0.23 };
    const advance = (from: number, to: number) => {
      for (let i = from; i < to; i++) {
        crown.update(1 / 60, i / 60, 1, [], water);
        reference.update(1 / 60, i / 60, 1, [], water);
      }
    };
    advance(0, 15);
    const difference = Math.abs(crown.offsets[5]! - reference.offsets[5]!);
    expect(difference).toBeGreaterThan(0.005);
    expect(Math.abs(crown.offsets[1]! - reference.offsets[1]!)).toBeLessThan(difference);
    expect(crown.offsets[0]).toBe(0);
    advance(15, 270);
    expect(Math.abs(crown.offsets[5]! - reference.offsets[5]!)).toBeLessThan(difference * 0.1);
  });
});
