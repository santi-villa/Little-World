import { describe, it, expect } from 'vitest';
import { projectFish } from '../src/render/motion/volume';
import { resolveHabitat } from '../src/render/motion/habitat';
import { FishMotion } from '../src/render/motion/fish-motion';
import { getSpecies } from '../src/sim';
import { birdPose } from '../src/render/scene/code-bird';
import { studyProject, studySurface } from '../src/render/scene/room-study';
const habitat = {
  obstacles: [{ x: 0.5, y: 0.8, rx: 0.12, ry: 0.2 }],
  refuges: [{ x: 0.17, y: 0.6 }],
  leaves: [{ x: 0.18, y: 0.3 }],
};
function input(intent: 'rest' | 'hide' | 'explore' | 'eat') {
  return {
    bounds: { width: 60, height: 30 },
    animals: [
      {
        id: 1,
        species: getSpecies('betta'),
        intent,
        targetId: null,
        fright: 0,
        sizeCm: 5,
        alive: true,
        boldness: 0.8,
        activity: 0.6,
      },
    ],
    food: { surface: true, sinking: false, bottom: false, x: 40 },
    scare: null,
    catAtGlass: false,
    habitat,
  };
}
describe('volumen y hábitat', () => {
  it('el giro frontal conserva espesor en vez de colapsar a una línea', () => {
    const a = projectFish({ x: 10, y: 0, z: 5 }, Math.PI / 2, 0),
      b = projectFish({ x: 10, y: 0, z: -5 }, Math.PI / 2, 0);
    expect(Math.abs(a.x - b.x)).toBeCloseTo(10);
    expect(a.z).toBeCloseTo(b.z);
  });
  it('la onda afecta más a la cola que a la cabeza', () => {
    const head = projectFish({ x: 30, y: 0, z: 0 }, 0, 0, 1, 1),
      tail = projectFish({ x: -60, y: 0, z: 0 }, 0, 0, 1, 1);
    expect(Math.abs(tail.z)).toBeGreaterThan(Math.abs(head.z) + 1);
    expect(Math.abs(tail.y)).toBeGreaterThan(1); // Visible even in a side view.
  });
  it('un pez activo recorre el acuario sin quedar congelado', () => {
    const motion = new FishMotion(42),
      data = input('explore');
    let slow = 0,
      longest = 0,
      minX = 60,
      maxX = 0,
      minY = 30,
      maxY = 0;
    for (let i = 0; i < 3600; i++) {
      motion.update(1 / 30, data);
      const b = motion.bodies.get(1)!;
      slow = Math.hypot(b.vx, b.vy) < 0.12 ? slow + 1 / 30 : 0;
      longest = Math.max(longest, slow);
      minX = Math.min(minX, b.x);
      maxX = Math.max(maxX, b.x);
      minY = Math.min(minY, b.y);
      maxY = Math.max(maxY, b.y);
    }
    expect(longest).toBeLessThan(6);
    expect(maxX - minX).toBeGreaterThan(24);
    expect(maxY - minY).toBeGreaterThan(8);
  });
  it('saca un cuerpo de una roca incluso contra el fondo', () => {
    const p = resolveHabitat(30, 27, habitat, 60, 30, 0.75),
      o = habitat.obstacles[0]!;
    expect(
      Math.hypot(
        (p.x - o.x * 60) / (o.rx * 60 + 0.75),
        (p.y - o.y * 30) / (o.ry * 30 + 0.75),
      ),
    ).toBeGreaterThanOrEqual(1);
    expect(p.y).toBeLessThanOrEqual(29.25);
  });
  it.each(['rest', 'hide', 'explore', 'eat'] as const)(
    'no queda dentro de obstáculos al %s',
    (intent) => {
      const motion = new FishMotion(4),
        data = input(intent);
      let moved = 0;
      for (let i = 0; i < 2700; i++) {
        motion.update(1 / 30, data);
        const b = motion.bodies.get(1)!,
          o = habitat.obstacles[0]!;
        expect(
          Math.hypot(
            (b.x - o.x * 60) / (o.rx * 60 + 0.75),
            (b.y - o.y * 30) / (o.ry * 30 + 0.75),
          ),
        ).toBeGreaterThanOrEqual(0.999);
        moved += Math.hypot(b.vx, b.vy) / 30;
      }
      expect(moved).toBeGreaterThan(1);
      const body = motion.bodies.get(1)!;
      if (intent === 'rest')
        expect(Math.hypot(body.x - 10.8, body.y - 9)).toBeLessThan(2);
      if (intent === 'hide')
        expect(Math.hypot(body.x - 10.2, body.y - 18)).toBeLessThan(2);
      if (intent === 'eat') expect(body.y).toBeLessThan(3);
    },
  );
});
describe('pájaro y estudio 2.5D', () => {
  it('aterriza continuamente, se posa y deja intervalos sin visitas', () => {
    expect(birdPose(10)).toBeNull();
    expect(birdPose(21)!.flight).toBe(true);
    expect(birdPose(25)!.flight).toBe(false);
    expect(birdPose(34)!.flight).toBe(true);
    expect(birdPose(40)).toBeNull();
    expect(Math.abs(birdPose(23.001)!.x - birdPose(22.999)!.x)).toBeLessThan(
      0.01,
    );
    expect(Math.abs(birdPose(23.001)!.y - birdPose(22.999)!.y)).toBeLessThan(
      0.01,
    );
  });
  it('la superficie de la mesa recupera las coordenadas de colocación', () => {
    const point = studyProject(-40, 78, 22),
      surface = studySurface(point.x, point.y, 78);
    expect(surface.x).toBeCloseTo(-40);
    expect(surface.z).toBeCloseTo(22);
  });
});
