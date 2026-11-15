import { describe, expect, it } from 'vitest';
import {
  applyAction,
  checkAddition,
  checkCompatibility,
  createNewTank,
  stockFromAnimals,
  type CompatTank,
} from '../src/sim';

const BIG: CompatTank = { liters: 180, heightCm: 45 };
const MEDIUM: CompatTank = { liters: 60, heightCm: 36 };
const CUBE: CompatTank = { liters: 23, heightCm: 30 };
const codes = (warnings: { code: string }[]): string[] => warnings.map((w) => w.code);

describe('compatibilidad', () => {
  it('escalar + neón: el escalar adulto se come a los neones', () => {
    const warnings = checkCompatibility(BIG, [
      { speciesId: 'angelfish', count: 2 },
      { speciesId: 'neon_tetra', count: 10 },
    ]);
    const predation = warnings.find((w) => w.code === 'predation');
    expect(predation).toBeDefined();
    expect(predation!.severity).toBe('danger');
    expect(predation!.speciesIds).toEqual(['angelfish', 'neon_tetra']);
    expect(predation!.message).toContain('Escalar');
    expect(predation!.message).toContain('Neón');
    expect(predation!.message).toMatch(/se come/);
    // Además comparten poco rango de temperatura (24–26 °C).
    expect(codes(warnings)).not.toContain('min_group');
  });

  it('la depredación por tamaño no necesita estar listada a mano', () => {
    // El goldfish no lista al tanictis, pero le entra en la boca.
    const warnings = checkCompatibility(BIG, [
      { speciesId: 'fancy_goldfish', count: 2 },
      { speciesId: 'white_cloud', count: 6 },
    ]);
    expect(codes(warnings)).toContain('predation');
    // Un pez grande pero herbívoro no es depredador.
    const calm = checkCompatibility(BIG, [
      { speciesId: 'ancistrus', count: 1 },
      { speciesId: 'ember_tetra', count: 8 },
    ]);
    expect(codes(calm)).not.toContain('predation');
  });

  it('barbo tigre + betta: muerde aletas largas', () => {
    const warnings = checkCompatibility(BIG, [
      { speciesId: 'tiger_barb', count: 6 },
      { speciesId: 'betta', count: 1 },
    ]);
    const nip = warnings.find((w) => w.code === 'fin_nipping');
    expect(nip).toBeDefined();
    expect(nip!.severity).toBe('danger');
    expect(nip!.speciesIds).toEqual(['tiger_barb', 'betta']);
    expect(nip!.message).toMatch(/Barbo tigre muerde aletas/);
    expect(nip!.message).toContain('Betta');
  });

  it('dos bettas machos: territoriales', () => {
    const warnings = checkCompatibility(CUBE, [{ speciesId: 'betta', count: 2, males: 2 }]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.code).toBe('territorial');
    expect(warnings[0]!.severity).toBe('danger');
    expect(warnings[0]!.message).toMatch(/machos son territoriales/);
    // Los bettas se venden como machos: sin aclarar, también avisa.
    expect(codes(checkCompatibility(CUBE, [{ speciesId: 'betta', count: 2 }]))).toContain('territorial');
    // Un solo betta en el cubo: todo bien.
    expect(checkCompatibility(CUBE, [{ speciesId: 'betta', count: 1 }])).toEqual([]);
  });

  it('temperatura: sin rango en común es peligro, con poco margen es aviso', () => {
    const none = checkCompatibility(BIG, [
      { speciesId: 'ram', count: 2 },
      { speciesId: 'white_cloud', count: 6 },
    ]).find((w) => w.code === 'temperature');
    expect(none?.severity).toBe('danger');
    expect(none?.message).toContain('26–30');
    const tight = checkCompatibility(BIG, [
      { speciesId: 'ram', count: 2 },
      { speciesId: 'cherry_barb', count: 6 },
    ]).find((w) => w.code === 'temperature');
    expect(tight?.severity).toBe('caution');
    expect(tight?.message).toMatch(/26 y 27 °C/);
  });

  it('pH: aguas incompatibles', () => {
    const warnings = checkCompatibility(BIG, [
      { speciesId: 'molly', count: 3 },
      { speciesId: 'cardinal_tetra', count: 8 },
    ]);
    expect(warnings.find((w) => w.code === 'ph')?.severity).toBe('danger');
  });

  it('grupo mínimo y pecera mínima', () => {
    const warnings = checkCompatibility(CUBE, [{ speciesId: 'neon_tetra', count: 2 }]);
    expect(codes(warnings).sort()).toEqual(['min_group', 'min_tank']);
    expect(warnings.find((w) => w.code === 'min_group')!.message).toMatch(/al menos 6/);
    expect(warnings.find((w) => w.code === 'min_tank')!.message).toMatch(/40 L/);
    // El barbo tigre en grupo chico muerde más: el texto lo dice.
    const barbs = checkCompatibility(BIG, [{ speciesId: 'tiger_barb', count: 3 }]);
    expect(barbs[0]!.message).toMatch(/muerde más/);
  });

  it('la gran lección: un goldfish no va en la pecera redonda', () => {
    const warnings = checkCompatibility({ liters: 8, heightCm: 20 }, [
      { speciesId: 'fancy_goldfish', count: 1 },
    ]);
    const tank = warnings.find((w) => w.code === 'min_tank');
    expect(tank?.severity).toBe('danger');
    expect(tank?.message).toMatch(/ensucia muchísimo/);
  });

  it('el escalar necesita una pecera alta', () => {
    const warnings = checkCompatibility({ liters: 200, heightCm: 36 }, [
      { speciesId: 'angelfish', count: 2 },
    ]);
    expect(codes(warnings)).toEqual(['tank_height']);
  });

  it('una comunidad clásica bien armada no tiene advertencias', () => {
    expect(
      checkCompatibility(MEDIUM, [
        { speciesId: 'harlequin_rasbora', count: 8 },
        { speciesId: 'honey_gourami', count: 1 },
        { speciesId: 'amano_shrimp', count: 3 },
      ]),
    ).toEqual([]);
  });

  it('checkAddition: la tienda avisa solo por lo que se quiere comprar', () => {
    let state = createNewTank({ seed: 1, tankId: 'rect_180' });
    state = applyAction(state, { type: 'addAnimals', speciesId: 'neon_tetra', count: 10 }).state;
    state = applyAction(state, { type: 'addAnimals', speciesId: 'tiger_barb', count: 2 }).state;
    const stock = stockFromAnimals(state.animals);
    const tank = { liters: state.tank.fullLiters, heightCm: state.tank.heightCm };
    const warnings = checkAddition(tank, stock, { speciesId: 'angelfish', count: 2 });
    expect(codes(warnings)).toContain('predation');
    expect(codes(warnings)).toContain('fin_nipping');
    // El grupo chico de barbos es un problema que ya estaba: no se le achaca al escalar.
    expect(codes(warnings)).not.toContain('min_group');
    for (const warning of warnings) expect(warning.speciesIds).toContain('angelfish');
  });
});
