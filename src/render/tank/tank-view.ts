/**
 * Escena base: la pecera dibujada con rectángulos, a 640x360.
 * Es provisoria (todavía no hay arte), pero ya refleja el estado de la
 * simulación: nivel del agua, luz, calefactor, filtro, algas y residuos.
 */

import { Container, Graphics } from 'pixi.js';
import type { DerivedValues, SimState } from '../sim';
import { drawPixelText, textWidth } from './pixel-font';
import { GAME_HEIGHT, GAME_WIDTH } from './viewport';

const TANK = { x: 170, y: 96, width: 300, height: 180 };
const INNER = {
  left: TANK.x + 2,
  right: TANK.x + TANK.width - 2,
  top: TANK.y + 2,
  bottom: TANK.y + TANK.height - 2,
};
const SAND_HEIGHT = 12;
/** Altura del agua con la pecera llena, en píxeles. */
const FULL_WATER_HEIGHT = 162;

function lerpColor(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return (r << 16) | (g << 8) | bl;
}

/** Pseudoazar fijo por índice, para repartir motas sin que titilen. */
function scatter(index: number, salt: number): number {
  let h = Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** 0 de noche, 1 de día, con amanecer y atardecer suaves. */
function daylight(hour: number): number {
  if (hour < 6 || hour >= 21) return 0;
  if (hour < 8) return (hour - 6) / 2;
  if (hour >= 19) return (21 - hour) / 2;
  return 1;
}

export class TankScene {
  readonly container = new Container();
  private readonly background = new Graphics();
  private readonly tank = new Graphics();
  private readonly glass = new Graphics();
  private readonly hud = new Graphics();
  private hudKey = '';

  constructor() {
    this.container.addChild(this.background, this.tank, this.glass, this.hud);
    this.drawGlass();
  }

  /** El marco de la pecera no cambia nunca: se dibuja una sola vez. */
  private drawGlass(): void {
    const g = this.glass;
    const { x, y, width, height } = TANK;
    g.rect(x, y, 2, height).rect(x + width - 2, y, 2, height).fill(0xa9cfe0);
    g.rect(x, y + height - 2, width, 2).fill(0x7fa7ba);
    // Reflejo en el vidrio.
    g.rect(x + 8, y + 16, 2, 40).rect(x + 12, y + 22, 1, 22).fill({ color: 0xffffff, alpha: 0.25 });
  }

  update(state: SimState, derived: DerivedValues, seconds: number): void {
    this.drawBackground(state, derived);
    this.drawTank(state, derived, seconds);
    this.drawHud(state, derived);
  }

  private drawBackground(state: SimState, derived: DerivedValues): void {
    const g = this.background;
    g.clear();
    const day = daylight(derived.hour);
    g.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill(lerpColor(0x141a2e, 0x34406a, day));
    // Zócalo y piso.
    g.rect(0, 300, GAME_WIDTH, 4).fill(lerpColor(0x0e1322, 0x232c4d, day));
    g.rect(0, 304, GAME_WIDTH, 56).fill(lerpColor(0x1b1410, 0x4a3628, day));
    // Mueble.
    g.rect(140, 276, 360, 84).fill(lerpColor(0x2c1d14, 0x6b4a33, day));
    g.rect(140, 276, 360, 4).fill(lerpColor(0x3a271b, 0x8a6244, day));
    g.rect(318, 286, 2, 74).fill(lerpColor(0x1f140e, 0x4f3625, day));

    // Lámpara sobre la pecera.
    g.rect(TANK.x + 20, TANK.y - 14, TANK.width - 40, 6).fill(0x2a2f3a);
    if (derived.lightOn) {
      g.rect(TANK.x + 22, TANK.y - 8, TANK.width - 44, 2).fill(0xfff2a8);
    }
    // Tapa.
    if (state.tank.hasLid) {
      g.rect(TANK.x - 2, TANK.y - 3, TANK.width + 4, 3).fill(0x39414f);
    }
  }

  private drawTank(state: SimState, derived: DerivedValues, seconds: number): void {
    const g = this.tank;
    g.clear();
    const innerWidth = INNER.right - INNER.left;
    const lit = derived.lightOn ? 1 : 0;

    // Fondo detrás del agua.
    g.rect(INNER.left, INNER.top, innerWidth, INNER.bottom - INNER.top).fill(
      lerpColor(0x0c1220, 0x1a2540, lit),
    );

    // Agua: baja con la evaporación y se pone verde con las algas.
    const level = Math.min(1.05, Math.max(0, derived.levelFraction));
    const waterHeight = Math.round(FULL_WATER_HEIGHT * level);
    const waterTop = INNER.bottom - waterHeight;
    const algae = Math.min(1, Math.max(0, derived.algaeFraction));
    const clear = lerpColor(0x173f6b, 0x2f7fc4, lit);
    const green = lerpColor(0x1c4a2a, 0x4d9a45, lit);
    const waterColor = lerpColor(clear, green, algae * 0.85);
    if (waterHeight > 0) {
      g.rect(INNER.left, waterTop, innerWidth, waterHeight).fill(waterColor);
      g.rect(INNER.left, waterTop, innerWidth, 1).fill(lerpColor(waterColor, 0xffffff, 0.45));
      if (derived.lightOn) {
        // Rayos de luz.
        for (let i = 0; i < 5; i++) {
          const x = INNER.left + 30 + i * 56;
          g.rect(x, waterTop + 1, 6, Math.min(waterHeight - 1, 70)).fill({
            color: 0xffffff,
            alpha: 0.05,
          });
        }
      }
    }

    // Arena.
    const sandTop = INNER.bottom - SAND_HEIGHT;
    g.rect(INNER.left, sandTop, innerWidth, SAND_HEIGHT).fill(lerpColor(0x7a6a4a, 0xd9bf8a, lit));
    for (let i = 0; i < 40; i++) {
      const x = INNER.left + Math.floor(scatter(i, 1) * (innerWidth - 2));
      const y = sandTop + 1 + Math.floor(scatter(i, 2) * (SAND_HEIGHT - 2));
      g.rect(x, y, 2, 1);
    }
    g.fill(lerpColor(0x655839, 0xb89c66, lit));

    // Detrito y comida sin comer sobre la arena.
    const detritusSpecks = Math.min(80, Math.round(state.organics.detritusG * 8));
    for (let i = 0; i < detritusSpecks; i++) {
      const x = INNER.left + 1 + Math.floor(scatter(i, 3) * (innerWidth - 3));
      const y = sandTop - 1 + Math.floor(scatter(i, 4) * 4);
      g.rect(x, y, 2, 1);
    }
    if (detritusSpecks > 0) g.fill(0x4a3a26);
    const foodSpecks = Math.min(60, Math.ceil(state.organics.foodG * 10));
    for (let i = 0; i < foodSpecks; i++) {
      const x = INNER.left + 20 + Math.floor(scatter(i, 5) * (innerWidth - 60));
      const y = sandTop - 2 + Math.floor(scatter(i, 6) * 3);
      g.rect(x, y, 2, 2);
    }
    if (foodSpecks > 0) g.fill(0xd9703a);

    // Algas pegadas al vidrio.
    const algaeSpecks = Math.round(algae * 220);
    for (let i = 0; i < algaeSpecks; i++) {
      const x = INNER.left + Math.floor(scatter(i, 7) * (innerWidth - 2));
      const y = waterTop + 2 + Math.floor(scatter(i, 8) * Math.max(1, waterHeight - SAND_HEIGHT - 4));
      g.rect(x, y, 2, 2);
    }
    if (algaeSpecks > 0) g.fill({ color: 0x3fae4a, alpha: 0.8 });

    // Calefactor.
    const heaterX = INNER.left + 12;
    g.rect(heaterX, INNER.top + 46, 5, 78).fill(0xc9d3dc);
    g.rect(heaterX + 1, INNER.top + 56, 3, 64).fill(state.heater.on ? 0xff7a3a : 0x6f7b88);
    g.rect(heaterX + 1, INNER.top + 49, 3, 3).fill(
      !state.heater.enabled ? 0x30363f : state.heater.on ? 0xff3b30 : 0x3fd16b,
    );
    g.rect(heaterX + 2, INNER.top, 1, 46).fill(0x20242c);

    // Filtro de mochila.
    const filterX = INNER.right - 30;
    g.rect(filterX, TANK.y - 18, 26, 36).fill(0x2f3541);
    g.rect(filterX + 3, TANK.y - 14, 20, 20).fill(
      lerpColor(0x7fb7d6, 0x5b4630, state.filter.clog),
    );
    g.rect(filterX + 17, TANK.y + 18, 3, 90).fill(0x2f3541); // caño de toma
    g.rect(filterX - 8, TANK.y + 4, 10, 3).fill(0x2f3541); // vertedero

    // Chorro y burbujas cuando el filtro tira agua.
    const flowing = derived.effectiveFlowLph > 1;
    if (flowing && waterHeight > 0) {
      const strength = Math.min(1, derived.effectiveFlowLph / Math.max(1, state.filter.flowLph));
      const streamX = filterX - 7;
      const streamTop = TANK.y + 7;
      for (let y = streamTop; y < waterTop; y += 2) {
        const wobble = Math.floor(seconds * 12 + y / 2) % 3 === 0 ? 1 : 0;
        g.rect(streamX + wobble, y, strength > 0.5 ? 3 : 2, 2);
      }
      g.fill({ color: 0xcfeaff, alpha: 0.85 });
      const bubbles = Math.round(4 + strength * 8);
      for (let i = 0; i < bubbles; i++) {
        const phase = (seconds * (0.35 + scatter(i, 9) * 0.4) + scatter(i, 10)) % 1;
        const depth = Math.min(waterHeight - SAND_HEIGHT - 4, 20 + scatter(i, 11) * 50);
        if (depth <= 2) continue;
        const x = streamX - 10 + Math.floor(scatter(i, 12) * 24);
        const y = waterTop + 2 + Math.floor(depth * (1 - phase));
        g.rect(x, y, scatter(i, 13) > 0.6 ? 2 : 1, scatter(i, 13) > 0.6 ? 2 : 1);
      }
      g.fill({ color: 0xffffff, alpha: 0.7 });
    }
  }

  private drawHud(state: SimState, derived: DerivedValues): void {
    const totalMinutes = Math.floor(state.timeMinutes);
    const hh = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    const clock = `DIA ${derived.day + 1}  ${hh}:${mm}`;
    const temperature = `${state.water.temperatureC.toFixed(1)}°C`;
    const alerts = state.alerts.length > 0 ? `! ${state.alerts.length} ALERTAS` : '';
    const key = `${clock}|${temperature}|${alerts}`;
    if (key === this.hudKey) return;
    this.hudKey = key;

    const g = this.hud;
    g.clear();
    drawPixelText(g, 'LITTLE WORLD', 9, 9, 0x0a0d18, 2);
    drawPixelText(g, 'LITTLE WORLD', 8, 8, 0xf4e9c8, 2);
    drawPixelText(g, clock, 8, 24, 0xa9b6d8, 1);
    drawPixelText(g, temperature, TANK.x - 8 - textWidth(temperature), TANK.y + 60, 0xf4e9c8, 1);
    if (alerts) drawPixelText(g, alerts, 8, 34, 0xff6b5e, 1);
  }
}
