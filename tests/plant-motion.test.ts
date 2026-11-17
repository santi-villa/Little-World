import { describe, it, expect } from 'vitest';
import { PlantMotion } from '../src/render/motion/plant-motion';
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
});
