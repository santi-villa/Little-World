import { describe, expect, it } from 'vitest';
import { Game, SPEEDS } from '../src/game';
import {
  aquariumEnvironment, easeEnvironment, swimmingActivity, underwaterLight,
} from '../src/render/scene/aquarium-environment';

describe('reloj e iluminación compartidos', () => {
  it('interpola con la velocidad del juego incluso entre pasos de simulación', () => {
    const game = Game.newTank(49);
    game.state.timeMinutes = 390;
    game.setSpeed(SPEEDS.minute);
    const start = aquariumEnvironment(game.visualTimeMinutes, 'clear', false);
    game.update(0.1);
    expect(game.state.timeMinutes).toBe(390);
    const next = aquariumEnvironment(game.visualTimeMinutes, 'clear', false);
    expect(next.daylight).toBeGreaterThan(start.daylight);
    game.update(0.1);
    expect(game.visualTimeMinutes).toBeCloseTo(390.2);
  });

  it('recorre las cinco fases, respeta el clima y cruza medianoche sin un salto de luz', () => {
    const at = (hour: number) => aquariumEnvironment(hour * 60, 'clear', false);
    expect([6.5, 9, 15, 19.5, 21].map(hour => at(hour).phase))
      .toEqual(['dawn', 'morning', 'afternoon', 'dusk', 'night']);
    expect(at(6.1).daylight).toBeLessThan(at(7).daylight);
    expect(at(19).daylight).toBeGreaterThan(at(20).daylight);
    expect(at(23.99).daylight).toBe(at(24).daylight);
    expect(aquariumEnvironment(720, 'storm', false).natural).toBeLessThan(at(12).natural);
    expect(at(11).dayProgress).toBeCloseTo(11 / 24);
  });

  it('usa las horas solares de Buenos Aires con la hora del juego o del panel de desarrollo', () => {
    const outside = {
      sunrise: Date.UTC(2026, 10, 18, 8, 45),
      sunset: Date.UTC(2026, 10, 18, 22, 50),
      cloudCover: 12,
    };
    const dawn = aquariumEnvironment(345, 'clear', false, outside);
    expect(dawn.phase).toBe('dawn');
    expect(dawn.sunProgress).toBe(0);
    expect(aquariumEnvironment(345, 'clear', false, outside, 12).phase).toBe('morning');
  });

  it('mantiene la luz de la lámpara y el ritmo acuático graduales e independientes del FPS', () => {
    const day = aquariumEnvironment(720, 'clear', false);
    const night = aquariumEnvironment(1440, 'clear', true);
    const halfway = easeEnvironment(day, night, 0.5);
    expect(halfway.natural).toBeGreaterThan(0);
    expect(halfway.lamp).toBeGreaterThan(0);
    expect(halfway.lamp).toBeLessThan(1);
    expect(halfway.sunProgress).toBe(day.sunProgress);
    let smallSteps = day;
    for (let i = 0; i < 30; i++) smallSteps = easeEnvironment(smallSteps, night, 1 / 60);
    expect(smallSteps.lamp).toBeCloseTo(halfway.lamp);
    expect(smallSteps.natural).toBeCloseTo(halfway.natural);
    expect(underwaterLight(night).exposure).toBeGreaterThan(underwaterLight({ ...night, lamp: 0 }).exposure);
    expect(swimmingActivity(night, 'school')).toBeGreaterThan(0);
    expect(swimmingActivity(night, 'school')).toBeLessThan(swimmingActivity(night, 'bottom'));
    expect(swimmingActivity(night, 'betta')).toBeLessThan(swimmingActivity(day, 'betta'));
  });
});
