import { describe, expect, it } from 'vitest';
import { SPECIES, TANK_MODELS, getSpecies } from '../src/sim';

describe('catálogo de especies', () => {
  it('trae todo el catálogo inicial: peces, invertebrados y polizones', () => {
    expect(SPECIES.length).toBe(30);
    expect(SPECIES.filter((s) => s.category === 'fish').length).toBe(24);
    expect(SPECIES.filter((s) => s.category !== 'fish' && !s.hitchhiker).length).toBe(4);
    expect(SPECIES.filter((s) => s.hitchhiker).map((s) => s.id).sort()).toEqual([
      'ramshorn_snail',
      'trumpet_snail',
    ]);
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(SPECIES.length);
  });

  it('cada ficha cumple el esquema', () => {
    const tankIds = TANK_MODELS.map((tank) => tank.id);
    for (const s of SPECIES) {
      const where = s.id;
      expect(s.name.length, where).toBeGreaterThan(0);
      expect(s.scientific.length, where).toBeGreaterThan(0);
      expect(s.temp[0], where).toBeLessThan(s.temp[1]);
      expect(s.ph[0], where).toBeLessThan(s.ph[1]);
      expect(s.adultSizeCm, where).toBeGreaterThan(0);
      expect(s.bioload, where).toBeGreaterThan(0);
      expect(s.minGroup, where).toBeGreaterThanOrEqual(1);
      expect(s.idealGroup, where).toBeGreaterThanOrEqual(s.minGroup);
      expect(s.minTankL, where).toBeGreaterThan(0);
      expect(['surface', 'middle', 'bottom'], where).toContain(s.zone);
      expect(['peaceful', 'semi_aggressive', 'aggressive'], where).toContain(s.temperament);
      expect(['diurnal', 'nocturnal'], where).toContain(s.activity);
      expect(s.lifespanYears[0], where).toBeLessThanOrEqual(s.lifespanYears[1]);
      expect(s.diet.length, where).toBeGreaterThan(0);
      expect(s.swim.speedCmS, where).toBeGreaterThan(0);
      expect(s.swim.turnDegS, where).toBeGreaterThan(0);
      expect(s.color, where).toMatch(/^#[0-9a-f]{6}$/);
      expect(s.difficulty, where).toBeGreaterThanOrEqual(1);
      if (s.hitchhiker) expect(s.price, where).toBe(0);
      else expect(tankIds, where).toContain(s.unlock);
      for (const prey of s.predatorOf) expect(() => getSpecies(prey), where).not.toThrow();
    }
  });

  it('respeta los valores de la tabla del diseño', () => {
    const neon = getSpecies('neon_tetra');
    expect(neon.temp).toEqual([20, 26]);
    expect(neon.ph).toEqual([6, 7]);
    expect(neon.minGroup).toBe(6);
    expect(neon.traits).toContain('schooling');
    const angel = getSpecies('angelfish');
    expect(angel.minTankL).toBe(180);
    expect(angel.predatorOf).toContain('neon_tetra');
    expect(getSpecies('tiger_barb').finNipper).toBe(true);
    expect(getSpecies('betta').longFins).toBe(true);
    expect(getSpecies('ancistrus').activity).toBe('nocturnal');
    expect(getSpecies('kuhli_loach').activity).toBe('nocturnal');
  });
});
