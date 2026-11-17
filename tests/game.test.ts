import { describe, expect, it } from 'vitest';
import { Game } from '../src/game';
import { suggestedFoodG } from '../src/care';
import { createPlayer } from '../src/player';
import { createSave, parseSave } from '../src/save/save-format';
import { applyAction, createNewTank, defaultConfig } from '../src/sim';

describe('reloj e inicio', () => {
  it('conserva los segundos de cuadros lentos', () => {
    const game = Game.newTank(42);
    const before = game.state.timeMinutes;
    for (let i = 0; i < 40; i++) game.update(1);
    // A lo sumo queda pendiente un paso de diez segundos, nunca se descarta tiempo.
    expect((game.state.timeMinutes - before) * 60).toBeGreaterThanOrEqual(30 - 1e-7);
    game.update(10);
    expect((game.state.timeMinutes - before) * 60).toBeCloseTo(50, 6);
  });
  it('ignora deltas inválidos y respeta la pausa', () => {
    const game = Game.newTank(1), before = game.state.timeMinutes;
    for (const delta of [-1, NaN, Infinity]) game.update(delta);
    game.setSpeed(0); game.update(60);
    expect(game.state.timeMinutes).toBe(before);
  });
  it('inicio y reinicio incluyen un solo betta y filtro colonizado', () => {
    const game = Game.newTank(42);
    for (let i = 0; i < 2; i++) {
      expect(game.state.animals).toHaveLength(1);
      expect(game.state.bacteria.filter.aob).toBeGreaterThan(1);
      expect(game.state.bacteria.filter.nob).toBeGreaterThan(1);
      expect(game.player.tutorial).toBe(0);
      game.reset(23);
    }
  });
});

describe('cuidados y diario', () => {
  it('la porción sigue al hambre, la población y la comida disponible', () => {
    let state = applyAction(createNewTank(), { type: 'addAnimals', speciesId: 'betta', count: 1 }).state;
    state.animals[0]!.hunger = .5;
    const meal = suggestedFoodG(state);
    expect(meal).toBeGreaterThan(0);
    state.animals[0]!.alive = false;
    expect(suggestedFoodG(state)).toBe(0);
    state.animals[0]!.alive = true;
    state.food.surfaceG = meal;
    expect(suggestedFoodG(state)).toBe(0);
    state.food.surfaceG = 0; state.animals[0]!.hunger = 0;
    expect(suggestedFoodG(state)).toBe(0);
  });
  it('conserva progreso, nombre y diario al guardar y cargar', () => {
    const game = Game.newTank(1);
    game.player.tutorial = 3;
    game.act({ type: 'nameAnimal', id: game.state.animals[0]!.id, name: 'Luna' });
    game.act({ type: 'feed', grams: .01 });
    const result = parseSave(JSON.parse(JSON.stringify(createSave(game.state, game.settings, 100, game.player))));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    const loaded = new Game(result.save.sim, result.save.settings, result.save.player);
    expect(loaded.player).toEqual(game.player);
    expect(loaded.state.animals[0]!.name).toBe('Luna');
    expect(loaded.player.journal.some(e => e.text.includes('residuos'))).toBe(true);
    for (let i = 0; i < 110; i++) loaded.note('Observación');
    expect(loaded.player.journal).toHaveLength(100);
  });
  it('explica las alertas sin afirmar una causa única', () => {
    const game = Game.newTank(1);
    game.act({ type: 'doseAmmonia', ppm: 10 });
    expect(game.player.journal.some(e => e.text.includes('amoníaco'))).toBe(true);
    expect(defaultConfig.thresholds.filterClogged).toBeGreaterThan(0);
  });
});

describe('guardados dañados', () => {
  it('rechaza estructuras incompletas, especies desconocidas y números no finitos', () => {
    const save = createSave(Game.newTank(1).state, { speed: 1 / 60, outdoorC: 18, weather: 'clear' }, 1, createPlayer());
    expect(parseSave({ ...save, sim: { timeMinutes: 0 } }).status).toBe('invalid');
    for (const alter of [
      (s: typeof save) => { s.sim.water.oxygen = NaN; },
      (s: typeof save) => { s.sim.animals[0]!.speciesId = 'missing'; },
      (s: typeof save) => { s.sim.tank.waterLiters = 0; },
      (s: typeof save) => { s.sim.animals.push({ ...s.sim.animals[0]! }); },
    ]) {
      const copy = structuredClone(save); alter(copy);
      expect(parseSave(copy).status).toBe('invalid');
    }
  });
  it('migra v2 sin volver a imponer el tutorial a una partida existente', () => {
    const game = Game.newTank(1);
    const result = parseSave({ formatVersion: 2, lastTimestamp: 1, sim: game.state, settings: game.settings });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.save.player.tutorial).toBe(4);
  });
});
