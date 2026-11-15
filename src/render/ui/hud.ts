/** Textos mínimos de la escena (arriba a la izquierda), con la fuente de píxeles. */

import { Container, Graphics } from 'pixi.js';
import type { SimState } from '../../sim';
import type { TankRect } from '../tank/tank-layout';
import { drawPixelText, textWidth } from './pixel-font';
import { clockParts, fill, texts } from './texts';

export class Hud {
  readonly container = new Container();
  private readonly graphics = new Graphics();
  private key = '';

  constructor() {
    this.container.addChild(this.graphics);
  }

  update(state: SimState, tank: TankRect): void {
    const clock = fill(texts.hud.clock, clockParts(state.timeMinutes));
    const temperature = fill(texts.hud.temperature, {
      value: state.water.temperatureC.toFixed(1),
    });
    const alerts =
      state.alerts.length > 0 ? fill(texts.hud.alerts, { count: state.alerts.length }) : '';
    const key = `${clock}|${temperature}|${alerts}|${tank.x}|${tank.y}`;
    if (key === this.key) return;
    this.key = key;

    const g = this.graphics;
    g.clear();
    drawPixelText(g, texts.title, 9, 9, 0x0a0d18, 2);
    drawPixelText(g, texts.title, 8, 8, 0xf4e9c8, 2);
    drawPixelText(g, clock, 8, 24, 0xa9b6d8, 1);
    if (alerts) drawPixelText(g, alerts, 8, 34, 0xff6b5e, 1);
    // Termómetro: al lado de la pecera.
    drawPixelText(
      g,
      temperature,
      tank.x - 8 - textWidth(temperature),
      tank.y + Math.round(tank.height / 3),
      0xf4e9c8,
      1,
    );
  }
}
