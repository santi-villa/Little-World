import { describe, expect, it } from 'vitest';
import {
  FishMotion,
  PLANE_FAR,
  PLANE_NEAR,
  PLANE_SPEED,
  limitsFor,
  zoneBand,
  type FishBody,
  type MotionAnimal,
  type MotionInput,
} from '../src/render/motion/fish-motion';
import {
  angleDiff,
  arrive,
  cohesion,
  flee,
  integrate,
  length,
  seek,
  separation,
  type Body,
} from '../src/render/motion/steering';
import { getSpecies, type Intent } from '../src/sim';

const DT = 1 / 30;
const BOUNDS = { width: 60, height: 30 };

function body(x: number, y: number, vx = 0, vy = 0): Body {
  return { x, y, vx, vy, heading: Math.atan2(vy, vx), wanderAngle: 0 };
}

function animals(speciesId: string, count: number, intent: Intent, firstId = 1): MotionAnimal[] {
  const species = getSpecies(speciesId);
  return Array.from({ length: count }, (_, i) => ({
    id: firstId + i,
    species,
    intent,
    targetId: null,
    fright: 0,
    sizeCm: species.adultSizeCm,
    alive: true,
    boldness: 0.5,
    activity: 0.5,
  }));
}

function input(list: MotionAnimal[], extra: Partial<MotionInput> = {}): MotionInput {
  return {
    bounds: BOUNDS,
    animals: list,
    food: { surface: false, sinking: false, bottom: false, x: 30 },
    scare: null,
    catAtGlass: false,
    ...extra,
  };
}

function run(motion: FishMotion, data: MotionInput, seconds: number, each?: () => void): void {
  for (let t = 0; t < seconds; t += DT) {
    motion.update(DT, data);
    each?.();
  }
}

const bodiesOf = (motion: FishMotion, list: MotionAnimal[]): FishBody[] =>
  list.map((a) => motion.bodies.get(a.id)!);

function spread(bodies: FishBody[]): number {
  const cx = bodies.reduce((s, b) => s + b.x, 0) / bodies.length;
  const cy = bodies.reduce((s, b) => s + b.y, 0) / bodies.length;
  return bodies.reduce((s, b) => s + length(b.x - cx, b.y - cy), 0) / bodies.length;
}

describe('steering behaviors', () => {
  it('seek apunta al objetivo a la velocidad pedida', () => {
    const v = seek(body(0, 0), 3, 4, 10);
    expect(v.x).toBeCloseTo(6);
    expect(v.y).toBeCloseTo(8);
  });

  it('arrive frena al acercarse y se detiene en el objetivo', () => {
    const b = body(0, 0);
    expect(length(arrive(b, 100, 0, 10, 5).x, 0)).toBeCloseTo(10);
    expect(arrive(b, 2.5, 0, 10, 5).x).toBeCloseTo(5);
    expect(arrive(b, 0, 0, 10, 5)).toEqual({ x: 0, y: 0 });
  });

  it('flee se aleja, más fuerte de cerca y nada si está lejos', () => {
    const b = body(10, 10);
    const close = flee(b, 9, 10, 10, 20);
    const far = flee(b, -5, 10, 10, 20);
    expect(close.x).toBeGreaterThan(far.x);
    expect(far.x).toBeGreaterThan(0);
    expect(flee(b, -50, 10, 10, 20)).toEqual({ x: 0, y: 0 });
  });

  it('separation empuja lejos de los vecinos cercanos e ignora a los lejanos', () => {
    const me = body(10, 10);
    const push = separation(me, [me, body(11, 10), body(40, 10)], 4);
    expect(push.x).toBeLessThan(0);
    expect(push.y).toBeCloseTo(0);
    expect(separation(me, [body(40, 10)], 4)).toEqual({ x: 0, y: 0 });
  });

  it('cohesion apunta al centro del grupo', () => {
    const me = body(0, 0);
    expect(cohesion(me, [me, body(10, 0), body(20, 10)])).toEqual({ x: 15, y: 5 });
  });

  it('integrate respeta la velocidad máxima', () => {
    const b = body(0, 0, 1, 0);
    const limits = { maxSpeed: 8, maxAccel: 1000, maxTurn: 100 };
    for (let i = 0; i < 100; i++) integrate(b, 500, 0, limits, DT);
    expect(length(b.vx, b.vy)).toBeCloseTo(8, 6);
  });

  it('integrate respeta la aceleración máxima', () => {
    const b = body(0, 0, 0, 0);
    integrate(b, 100, 0, { maxSpeed: 50, maxAccel: 6, maxTurn: 100 }, 0.5);
    expect(length(b.vx, b.vy)).toBeCloseTo(3, 6);
  });

  it('integrate respeta el giro máximo: dar media vuelta lleva su tiempo', () => {
    const b = body(0, 0, 5, 0);
    const limits = { maxSpeed: 5, maxAccel: 1000, maxTurn: Math.PI / 2 }; // 90° por segundo
    let steps = 0;
    let previous = b.heading;
    while (Math.abs(angleDiff(Math.PI, b.heading)) > 0.01 && steps < 1000) {
      integrate(b, -5, 0.0001, limits, DT);
      expect(Math.abs(angleDiff(b.heading, previous))).toBeLessThanOrEqual(limits.maxTurn * DT + 1e-9);
      previous = b.heading;
      steps++;
    }
    // 180° a 90°/s: unos 2 segundos.
    expect(steps * DT).toBeGreaterThan(1.9);
    expect(steps * DT).toBeLessThan(2.3);
  });

  it('integrate no deja salir de la pecera', () => {
    const b = body(1, 1, -5, -5);
    for (let i = 0; i < 60; i++) {
      integrate(b, -50, -50, { maxSpeed: 20, maxAccel: 100, maxTurn: 20 }, DT, BOUNDS);
    }
    expect(b.x).toBe(0);
    expect(b.y).toBe(0);
  });
});

describe('movimiento de los peces', () => {
  it('nadie supera la velocidad ni el giro máximos de su especie, ni sale del agua', () => {
    const list = [
      ...animals('zebra_danio', 6, 'school'),
      ...animals('betta', 1, 'explore', 20),
      ...animals('angelfish', 2, 'explore', 30),
      ...animals('corydoras_paleatus', 4, 'explore', 40),
      ...animals('nerite_snail', 1, 'explore', 50),
    ];
    const motion = new FishMotion(7);
    const data = input(list);
    motion.update(DT, data);
    const headings = new Map(list.map((a) => [a.id, motion.bodies.get(a.id)!.heading]));
    run(motion, data, 40, () => {
      for (const a of list) {
        const b = motion.bodies.get(a.id)!;
        const limits = limitsFor(a.species);
        expect(length(b.vx, b.vy)).toBeLessThanOrEqual(limits.maxSpeed + 1e-6);
        const turned = Math.abs(angleDiff(b.heading, headings.get(a.id)!));
        expect(turned).toBeLessThanOrEqual(limits.maxTurn * DT + 1e-6);
        headings.set(a.id, b.heading);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x).toBeLessThanOrEqual(BOUNDS.width);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeLessThanOrEqual(BOUNDS.height);
      }
    });
  });

  it('un pez rápido recorre más que uno lento', () => {
    const fast = animals('zebra_danio', 1, 'explore', 1);
    const slow = animals('angelfish', 1, 'explore', 2);
    const travelled = (list: MotionAnimal[]): number => {
      const motion = new FishMotion(3);
      let distance = 0;
      run(motion, input(list), 60, () => {
        const b = motion.bodies.get(list[0]!.id)!;
        distance += length(b.vx, b.vy) * DT;
      });
      return distance;
    };
    expect(travelled(fast)).toBeGreaterThan(travelled(slow) * 1.5);
  });

  it('cada especie se queda en su zona: superficie arriba, fondo abajo', () => {
    const list = [
      ...animals('hatchetfish', 6, 'explore', 1),
      ...animals('cherry_barb', 6, 'explore', 10),
      ...animals('kuhli_loach', 5, 'explore', 20),
    ];
    const motion = new FishMotion(11);
    const data = input(list);
    run(motion, data, 30);
    const sums = new Map<string, number>();
    let samples = 0;
    run(motion, data, 90, () => {
      samples++;
      for (const a of list) {
        sums.set(a.species.id, (sums.get(a.species.id) ?? 0) + motion.bodies.get(a.id)!.y);
      }
    });
    const meanDepth = (id: string, count: number): number =>
      (sums.get(id) ?? 0) / samples / count / BOUNDS.height;
    const surface = meanDepth('hatchetfish', 6);
    const middle = meanDepth('cherry_barb', 6);
    const bottom = meanDepth('kuhli_loach', 5);
    expect(surface).toBeLessThan(0.35);
    expect(middle).toBeGreaterThan(surface + 0.1);
    expect(bottom).toBeGreaterThan(middle + 0.15);
    expect(bottom).toBeGreaterThan(0.75);
    expect(zoneBand(getSpecies('hatchetfish'))[1]).toBeLessThan(zoneBand(getSpecies('kuhli_loach'))[0]);
  });

  it('boids: el cardumen (schooling) va más apretado que el grupo suelto (shoaling) y que los que pasean', () => {
    const measure = (speciesId: string, intent: Intent): number => {
      const list = animals(speciesId, 10, intent);
      const motion = new FishMotion(5);
      const data = input(list);
      run(motion, data, 30);
      let total = 0;
      let samples = 0;
      run(motion, data, 60, () => {
        total += spread(bodiesOf(motion, list));
        samples++;
      });
      return total / samples;
    };
    const schooling = measure('neon_tetra', 'school');
    const shoaling = measure('cherry_barb', 'school');
    const loose = measure('neon_tetra', 'explore');
    expect(schooling).toBeLessThan(shoaling);
    expect(schooling).toBeLessThan(loose * 0.6);
    expect(schooling).toBeLessThan(8);
  });

  it('boids: el cardumen nada alineado', () => {
    const list = animals('neon_tetra', 10, 'school');
    const motion = new FishMotion(5);
    const data = input(list);
    run(motion, data, 20);
    let aligned = 0;
    let samples = 0;
    run(motion, data, 60, () => {
      const bodies = bodiesOf(motion, list).filter((b) => length(b.vx, b.vy) > 0.5);
      if (bodies.length < 6) return;
      // Largo del vector medio de rumbos: 1 = todos para el mismo lado.
      const x = bodies.reduce((s, b) => s + Math.cos(b.heading), 0) / bodies.length;
      const y = bodies.reduce((s, b) => s + Math.sin(b.heading), 0) / bodies.length;
      aligned += length(x, y);
      samples++;
    });
    expect(aligned / samples).toBeGreaterThan(0.6);
  });

  it('no se enciman: mantienen su espacio personal', () => {
    const list = animals('neon_tetra', 12, 'school');
    const motion = new FishMotion(2);
    const data = input(list);
    run(motion, data, 20);
    let tooClose = 0;
    let pairs = 0;
    run(motion, data, 30, () => {
      const bodies = bodiesOf(motion, list);
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          if (Math.abs(bodies[i]!.plane - bodies[j]!.plane) > 0.3) continue;
          pairs++;
          if (length(bodies[i]!.x - bodies[j]!.x, bodies[i]!.y - bodies[j]!.y) < 1) tooClose++;
        }
      }
    });
    expect(tooClose / pairs).toBeLessThan(0.02);
  });

  it('usan los 3 planos de profundidad y cambian de plano suavemente', () => {
    const list = animals('platy', 8, 'explore');
    const motion = new FishMotion(9);
    const data = input(list);
    motion.update(DT, data);
    const previous = new Map(list.map((a) => [a.id, motion.bodies.get(a.id)!.plane]));
    const visited = new Set<number>();
    run(motion, data, 180, () => {
      for (const a of list) {
        const b = motion.bodies.get(a.id)!;
        expect(b.plane).toBeGreaterThanOrEqual(PLANE_FAR);
        expect(b.plane).toBeLessThanOrEqual(PLANE_NEAR);
        expect(Math.abs(b.plane - previous.get(a.id)!)).toBeLessThanOrEqual(PLANE_SPEED * DT + 1e-9);
        previous.set(a.id, b.plane);
        if (Number.isInteger(b.plane)) visited.add(b.plane);
      }
    });
    expect([...visited].sort()).toEqual([0, 1, 2]);
  });

  it('comer: suben a buscar la comida que flota; los de fondo esperan la que cae', () => {
    const top = animals('guppy', 4, 'eat', 1);
    const bottom = animals('corydoras_paleatus', 4, 'eat', 10);
    const motion = new FishMotion(4);
    const floating = input([...top, ...bottom], {
      food: { surface: true, sinking: false, bottom: false, x: 40 },
    });
    run(motion, floating, 15);
    for (const b of bodiesOf(motion, top)) {
      expect(b.y).toBeLessThan(BOUNDS.height * 0.15);
      expect(Math.abs(b.x - 40)).toBeLessThan(BOUNDS.width * 0.3);
    }
    for (const b of bodiesOf(motion, bottom)) expect(b.y).toBeGreaterThan(BOUNDS.height * 0.3);
    const landed = input([...top, ...bottom], {
      food: { surface: false, sinking: false, bottom: true, x: 40 },
    });
    run(motion, landed, 15);
    for (const b of bodiesOf(motion, bottom)) expect(b.y).toBeGreaterThan(BOUNDS.height * 0.8);
  });

  it('susto: se alejan del golpe, van al plano de atrás y el cardumen se aprieta', () => {
    const calm = animals('neon_tetra', 10, 'school');
    const motion = new FishMotion(6);
    run(motion, input(calm), 30);
    const before = bodiesOf(motion, calm).map((b) => ({ x: b.x, y: b.y }));
    const scare = { x: 5, y: 15 };
    const scared = calm.map((a) => ({ ...a, intent: 'flee' as Intent, fright: 1 }));
    run(motion, input(scared, { scare }), 4);
    const after = bodiesOf(motion, scared);
    const distance = (points: { x: number; y: number }[]): number =>
      points.reduce((s, p) => s + length(p.x - scare.x, p.y - scare.y), 0) / points.length;
    expect(distance(after)).toBeGreaterThan(distance(before) + 5);
    for (const b of after) expect(b.plane).toBeLessThan(0.5);
  });

  it('perseguir y huir: el perseguidor se acerca, el perseguido escapa', () => {
    const chaser: MotionAnimal = { ...animals('tiger_barb', 1, 'chase', 1)[0]!, targetId: 2 };
    const victim: MotionAnimal = { ...animals('angelfish', 1, 'flee', 2)[0]!, targetId: 1 };
    const motion = new FishMotion(8);
    const data = input([chaser, victim]);
    motion.update(DT, data);
    const a = motion.bodies.get(1)!;
    const b = motion.bodies.get(2)!;
    Object.assign(a, { x: 10, y: 15, vx: 0, vy: 0 });
    Object.assign(b, { x: 30, y: 15, vx: 0, vy: 0 });
    run(motion, data, 1.5);
    // El barbo es más rápido: acorta distancia mientras el escalar se aleja.
    expect(a.x).toBeGreaterThan(14);
    expect(b.x).toBeGreaterThan(31);
    expect(b.x - a.x).toBeLessThan(20);
  });

  it('pedir comida: van al frente y arriba', () => {
    const list = animals('platy', 4, 'beg');
    const motion = new FishMotion(1);
    run(motion, input(list), 20);
    for (const b of bodiesOf(motion, list)) {
      expect(b.plane).toBeGreaterThan(1.9);
      expect(b.y).toBeLessThan(BOUNDS.height * 0.35);
    }
  });

  it('descansar y esconderse: casi quietos abajo; el betta descansa arriba', () => {
    const neons = animals('neon_tetra', 6, 'rest', 1);
    const betta = animals('betta', 1, 'rest', 10);
    const shy = animals('honey_gourami', 1, 'hide', 20);
    const motion = new FishMotion(12);
    const data = input([...neons, ...betta, ...shy]);
    run(motion, data, 40);
    for (const b of bodiesOf(motion, neons)) {
      expect(b.y).toBeGreaterThan(BOUNDS.height * 0.7);
      expect(length(b.vx, b.vy)).toBeLessThan(1);
    }
    expect(motion.bodies.get(10)!.y).toBeLessThan(BOUNDS.height * 0.25);
    const hidden = motion.bodies.get(20)!;
    expect(hidden.y).toBeGreaterThan(BOUNDS.height * 0.75);
    expect(Math.min(hidden.x, BOUNDS.width - hidden.x)).toBeLessThan(BOUNDS.width * 0.15);
    expect(hidden.plane).toBeLessThan(0.1);
  });

  it('gambas y caracoles caminan por el fondo, y el caracol es lentísimo', () => {
    const shrimp = animals('cherry_shrimp', 5, 'explore', 1);
    const snail = animals('mystery_snail', 1, 'eat', 10);
    const motion = new FishMotion(13);
    const data = input([...shrimp, ...snail]);
    run(motion, data, 30);
    for (const b of bodiesOf(motion, shrimp)) expect(b.y).toBeGreaterThan(BOUNDS.height * 0.9);
    const s = motion.bodies.get(10)!;
    expect(length(s.vx, s.vy)).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it('los muertos flotan y los que se van desaparecen', () => {
    const list = animals('platy', 2, 'explore');
    const motion = new FishMotion(1);
    run(motion, input(list), 5);
    const dead = [{ ...list[0]!, alive: false }];
    run(motion, input(dead), 60);
    expect(motion.bodies.size).toBe(1);
    expect(motion.bodies.get(1)!.y).toBeLessThan(1);
  });

  it('con dt = 0 (primer cuadro) igual hay un cuerpo por cada animal', () => {
    const list = animals('platy', 3, 'explore');
    const motion = new FishMotion(1);
    motion.update(0, input(list));
    expect(motion.bodies.size).toBe(3);
    for (const b of bodiesOf(motion, list)) {
      expect(b.x).toBeGreaterThan(0);
      expect(b.x).toBeLessThan(BOUNDS.width);
    }
  });

  it('con la misma semilla el movimiento se repite', () => {
    const simulate = (seed: number): number[] => {
      const list = animals('neon_tetra', 6, 'school');
      const motion = new FishMotion(seed);
      run(motion, input(list), 10);
      return bodiesOf(motion, list).flatMap((b) => [b.x, b.y, b.plane]);
    };
    expect(simulate(42)).toEqual(simulate(42));
    expect(simulate(42)).not.toEqual(simulate(43));
  });
});
