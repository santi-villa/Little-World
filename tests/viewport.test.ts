import { describe, expect, it } from 'vitest';
import { GAME_HEIGHT, GAME_WIDTH, computeLayout } from '../src/render/viewport';

/** Tamaño en píxeles físicos que termina ocupando el canvas. */
const device = (cssW: number, cssH: number, dpr: number) => {
  const layout = computeLayout(cssW, cssH, dpr);
  return {
    layout,
    width: layout.cssWidth * dpr,
    height: layout.cssHeight * dpr,
    left: layout.cssLeft * dpr,
    top: layout.cssTop * dpr,
  };
};

describe('escalado adaptable', () => {
  const screens: [string, number, number, number][] = [
    ['iPhone 14 (844x390 @3x)', 844, 390, 3],
    ['iPhone SE (667x375 @2x)', 667, 375, 2],
    ['Android 1080p (800x360 @3x)', 800, 360, 3],
    ['Pixel 7 (915x412 @2.625x)', 915, 412, 2.625],
    ['Android con barra del navegador (780x320 @3x)', 780, 320, 3],
    ['Tablet (1280x800 @2x)', 1280, 800, 2],
    ['Monitor 1080p', 1920, 1080, 1],
    ['Monitor 1440p', 2560, 1440, 1],
  ];

  for (const [name, cssW, cssH, dpr] of screens) {
    it(`${name}: ocupa el espacio disponible, centrado y sin recortarse`, () => {
      const { layout, width, height, left, top } = device(cssW, cssH, dpr);
      const physicalW = Math.round(cssW * dpr);
      const physicalH = Math.round(cssH * dpr);
      const expectedScale = Math.min(physicalW / GAME_WIDTH, physicalH / GAME_HEIGHT);

      expect(layout.scale).toBeCloseTo(expectedScale, 6);
      expect(layout.integer).toBe(Number.isInteger(layout.scale));
      expect(width).toBeCloseTo(GAME_WIDTH * layout.scale, 6);
      expect(height).toBeCloseTo(GAME_HEIGHT * layout.scale, 6);
      expect(width).toBeLessThanOrEqual(physicalW + 0.001);
      expect(height).toBeLessThanOrEqual(physicalH + 0.001);
      expect(left).toBeCloseTo((physicalW - width) / 2, 6);
      expect(top).toBeCloseTo((physicalH - height) / 2, 6);
      // Una dimensión tiene que llenar la pantalla para evitar márgenes innecesarios.
      expect(Math.min(physicalW - width, physicalH - height)).toBeCloseTo(0, 6);
    });
  }

  it('casos conocidos con escalado fraccionario', () => {
    expect(computeLayout(844, 390, 3).scale).toBeCloseTo(1.625, 6);
    expect(computeLayout(1920, 1080, 1).scale).toBeCloseTo(1.5, 6);
    expect(computeLayout(2560, 1440, 1).scale).toBe(2);
    expect(computeLayout(640, 360, 1).scale).toBeCloseTo(0.5, 6);
  });

  it('si la pantalla es más chica, reduce la escena sin recortarla', () => {
    const layout = computeLayout(480, 270, 1);
    expect(layout.integer).toBe(false);
    expect(layout.scale).toBeCloseTo(0.375, 6);
    expect(layout.cssWidth).toBeCloseTo(480, 6);
    expect(layout.cssHeight).toBeCloseTo(270, 6);
  });
});

describe('la pecera en pantalla', () => {
  it('entra en la escena y queda en posiciones enteras para todos los modelos', async () => {
    const { tankRect, TANK_BASE_Y } = await import('../src/render/tank/tank-layout');
    const { TANK_MODELS } = await import('../src/sim');
    for (const model of TANK_MODELS) {
      const rect = tankRect(model.lengthCm, model.heightCm);
      for (const value of Object.values(rect)) expect(Number.isInteger(value), model.id).toBe(true);
      expect(rect.x, model.id).toBeGreaterThan(60);
      expect(rect.x + rect.width, model.id).toBeLessThan(GAME_WIDTH - 60);
      expect(rect.y, model.id).toBeGreaterThan(50);
      expect(rect.y + rect.height).toBe(TANK_BASE_Y);
    }
  });
});
