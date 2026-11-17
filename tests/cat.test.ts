import { describe, expect, it } from 'vitest';
import { applyAction, createNewTank, step } from '../src/sim';

describe('gato decorativo', () => {
  it('duerme en su cama durante ausencias largas, sin pedir comida ni tocar el vidrio', () => {
    const original = createNewTank();
    const result = step(original, 7 * 1440);
    expect(result.state.cat.behavior).toBe('sleep');
    expect(result.state.cat.spot).toBe('bed');
    expect(result.state.cat.needs.hunger).toBe(0);
    expect(result.events.some(e => e.type === 'glass_tapped' || e.type === 'cat_annoyed')).toBe(false);
    expect(original.cat).toEqual(createNewTank().cat);
  });
  it('las caricias repetidas no lo despiertan ni lo molestan y no afectan a los peces', () => {
    let state = applyAction(createNewTank(), { type: 'addAnimals', speciesId: 'betta', count: 1 }).state;
    const animals = structuredClone(state.animals), rng = state.rngState;
    for (let i = 0; i < 30; i++) {
      const result = applyAction(state, { type: 'petCat' });
      expect(result.events.some(e => e.type === 'cat_petted')).toBe(true);
      expect(result.state.cat.behavior).toBe('sleep');
      expect(result.state.cat.spot).toBe('bed');
      state = result.state;
    }
    expect(state.animals).toEqual(animals);
    expect(state.rngState).toBe(rng);
  });
  it('normaliza el comportamiento de una partida anterior', () => {
    const old = createNewTank();
    old.cat.behavior = 'watch_fish'; old.cat.spot = 'tank_front'; old.cat.needs.hunger = 1;
    const result = step(old, 1);
    expect(result.state.cat.behavior).toBe('sleep');
    expect(result.state.cat.spot).toBe('bed');
    expect(result.state.cat.needs.hunger).toBe(0);
    expect(result.events.some(e => e.type.startsWith('cat_'))).toBe(false);
  });
});
