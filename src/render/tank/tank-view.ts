/**
 * La pecera, dibujada con rectángulos (todavía no hay arte). Refleja el
 * estado de la simulación: tamaño del modelo, nivel del agua, luz, taninos,
 * calefactor, filtro, algas y residuos.
 *
 * Orden de capas, de atrás hacia adelante: interior -> agua -> vidrio.
 */

import { Container, Graphics } from 'pixi.js';
import type { DerivedValues, SimState } from '../../sim';
import { lerpColor, scatter } from '../pixel-utils';
import { tankRect, type TankRect } from './tank-layout';

const SAND_HEIGHT = 12;

export class TankView {
  readonly container = new Container();
  private readonly interior = new Graphics();
  private readonly glass = new Graphics();
  private rect: TankRect = tankRect(30, 30);
  private glassKey = '';

  constructor() {
    this.container.addChild(this.interior, this.glass);
  }

  /** Rectángulo actual (lo usan el fondo y el HUD para ubicarse). */
  get bounds(): TankRect {
    return this.rect;
  }

  update(state: SimState, derived: DerivedValues, seconds: number): void {
    this.rect = tankRect(state.tank.lengthCm, state.tank.heightCm);
    this.drawGlass(state);
    this.drawInterior(state, derived, seconds);
  }

  /** El marco solo cambia si cambia la pecera o la tapa. */
  private drawGlass(state: SimState): void {
    const { x, y, width, height } = this.rect;
    const key = `${x},${y},${width},${height},${state.tank.hasLid}`;
    if (key === this.glassKey) return;
    this.glassKey = key;
    const g = this.glass;
    g.clear();
    g.rect(x, y, 2, height).rect(x + width - 2, y, 2, height).fill(0xa9cfe0);
    g.rect(x, y + height - 2, width, 2).fill(0x7fa7ba);
    // Reflejo en el vidrio.
    g.rect(x + 8, y + 16, 2, Math.round(height * 0.22))
      .rect(x + 12, y + 22, 1, Math.round(height * 0.12))
      .fill({ color: 0xffffff, alpha: 0.25 });
    if (state.tank.hasLid) g.rect(x - 2, y - 3, width + 4, 3).fill(0x39414f);
  }

  private drawInterior(state: SimState, derived: DerivedValues, seconds: number): void {
    const g = this.interior;
    g.clear();
    const { x, y, width, height } = this.rect;
    const left = x + 2;
    const right = x + width - 2;
    const top = y + 2;
    const bottom = y + height - 2;
    const innerWidth = right - left;
    const innerHeight = bottom - top;
    const lit = derived.lightOn ? 1 : 0;

    // Fondo detrás del agua.
    g.rect(left, top, innerWidth, innerHeight).fill(lerpColor(0x0c1220, 0x16243a, lit));

    // Agua: turquesa; baja con la evaporación y se pone ámbar con los taninos.
    const fullHeight = Math.round(innerHeight * 0.92);
    const waterHeight = Math.round(fullHeight * Math.min(1.05, Math.max(0, derived.waterLevel)));
    const waterTop = bottom - waterHeight;
    const clear = lerpColor(0x12464f, 0x2a9aa6, lit);
    const amber = lerpColor(0x4a3413, 0xb07a2a, lit);
    const waterColor = lerpColor(clear, amber, state.water.tannins * 0.6);
    if (waterHeight > 0) {
      g.rect(left, waterTop, innerWidth, waterHeight).fill(waterColor);
      g.rect(left, waterTop, innerWidth, 1).fill(lerpColor(waterColor, 0xffffff, 0.45));
      if (derived.lightOn) {
        // Rayos de luz.
        const rays = Math.max(2, Math.floor(innerWidth / 56));
        for (let i = 0; i < rays; i++) {
          const rayX = left + Math.round(((i + 0.5) * innerWidth) / rays) - 3;
          g.rect(rayX, waterTop + 1, 6, Math.min(waterHeight - 1, Math.round(innerHeight * 0.45)));
        }
        g.fill({ color: 0xfff2c8, alpha: 0.06 });
      }
    }

    // Arena (verdosa si la decoración tiene algas).
    const sandTop = bottom - SAND_HEIGHT;
    const sand = lerpColor(0x7a6a4a, 0xd9bf8a, lit);
    g.rect(left, sandTop, innerWidth, SAND_HEIGHT).fill(
      lerpColor(sand, 0x5f8a3c, state.algae.decor * 0.7),
    );
    for (let i = 0; i < Math.round(innerWidth / 7); i++) {
      const sx = left + Math.floor(scatter(i, 1) * (innerWidth - 2));
      const sy = sandTop + 1 + Math.floor(scatter(i, 2) * (SAND_HEIGHT - 2));
      g.rect(sx, sy, 2, 1);
    }
    g.fill(lerpColor(0x655839, 0xb89c66, lit));

    // Detrito y comida sin comer sobre la arena.
    const detritusSpecks = Math.min(80, Math.round(state.organics.detritusG * 8));
    for (let i = 0; i < detritusSpecks; i++) {
      const sx = left + 1 + Math.floor(scatter(i, 3) * (innerWidth - 3));
      const sy = sandTop - 1 + Math.floor(scatter(i, 4) * 4);
      g.rect(sx, sy, 2, 1);
    }
    if (detritusSpecks > 0) g.fill(0x4a3a26);
    const foodSpecks = Math.min(60, Math.ceil(state.organics.foodG * 20));
    for (let i = 0; i < foodSpecks; i++) {
      const sx = left + 10 + Math.floor(scatter(i, 5) * (innerWidth - 22));
      const sy = sandTop - 2 + Math.floor(scatter(i, 6) * 3);
      g.rect(sx, sy, 2, 2);
    }
    if (foodSpecks > 0) g.fill(0xd9703a);

    // Capa de algas en el vidrio.
    const algaeSpecks = Math.round(Math.min(1, state.algae.glass) * innerWidth * 0.8);
    const algaeArea = Math.max(1, waterHeight - SAND_HEIGHT - 4);
    for (let i = 0; i < algaeSpecks; i++) {
      const sx = left + Math.floor(scatter(i, 7) * (innerWidth - 2));
      const sy = waterTop + 2 + Math.floor(scatter(i, 8) * algaeArea);
      g.rect(sx, sy, 2, 2);
    }
    if (algaeSpecks > 0) g.fill({ color: 0x3fae4a, alpha: 0.8 });

    // Calefactor.
    if (state.heater.watts > 0) {
      const heaterX = left + 12;
      const heaterTop = top + Math.round(innerHeight * 0.26);
      const heaterHeight = Math.round(innerHeight * 0.44);
      g.rect(heaterX, heaterTop, 5, heaterHeight).fill(0xc9d3dc);
      g.rect(heaterX + 1, heaterTop + 10, 3, heaterHeight - 14).fill(
        state.heater.on ? 0xff7a3a : 0x6f7b88,
      );
      g.rect(heaterX + 1, heaterTop + 3, 3, 3).fill(
        !state.heater.enabled ? 0x30363f : state.heater.on ? 0xff3b30 : 0x3fd16b,
      );
      g.rect(heaterX + 2, top, 1, heaterTop - top).fill(0x20242c);
    }

    // Filtro de mochila.
    if (state.filter.flowLph > 0) {
      const filterX = right - 30;
      g.rect(filterX, y - 18, 26, 36).fill(0x2f3541);
      g.rect(filterX + 3, y - 14, 20, 20).fill(lerpColor(0x7fb7d6, 0x5b4630, state.filter.clog));
      g.rect(filterX + 17, y + 18, 3, Math.round(innerHeight * 0.5)).fill(0x2f3541); // toma
      g.rect(filterX - 8, y + 4, 10, 3).fill(0x2f3541); // vertedero

      // Chorro y burbujas cuando el filtro tira agua.
      if (derived.effectiveFlowLph > 1 && waterHeight > 0) {
        const strength = Math.min(1, derived.effectiveFlowLph / state.filter.flowLph);
        const streamX = filterX - 7;
        for (let sy = y + 7; sy < waterTop; sy += 2) {
          const wobble = Math.floor(seconds * 12 + sy / 2) % 3 === 0 ? 1 : 0;
          g.rect(streamX + wobble, sy, strength > 0.5 ? 3 : 2, 2);
        }
        g.fill({ color: 0xcfeaff, alpha: 0.85 });
        const bubbles = Math.round(4 + strength * 8);
        for (let i = 0; i < bubbles; i++) {
          const phase = (seconds * (0.35 + scatter(i, 9) * 0.4) + scatter(i, 10)) % 1;
          const depth = Math.min(waterHeight - SAND_HEIGHT - 4, 20 + scatter(i, 11) * 50);
          if (depth <= 2) continue;
          const bx = streamX - 10 + Math.floor(scatter(i, 12) * 24);
          const by = waterTop + 2 + Math.floor(depth * (1 - phase));
          const size = scatter(i, 13) > 0.6 ? 2 : 1;
          g.rect(bx, by, size, size);
        }
        g.fill({ color: 0xffffff, alpha: 0.7 });
      }
    }
  }
}
