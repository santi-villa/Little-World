/** Textos mínimos de la escena (arriba a la izquierda), con la fuente de píxeles y fondo semitransparente. */

import { Container, Graphics } from 'pixi.js';
import type { SimState } from '../../sim';
import { drawPixelText, textWidth } from './pixel-font';
import { clockParts, fill, texts } from './texts';

export class Hud {
  readonly container = new Container();
  private readonly graphics = new Graphics();
  private key = '';

  constructor() {
    // La fuente es de píxeles gordos, como el resto de lo dibujado por código.
    this.container.scale.set(2);
    this.container.addChild(this.graphics);
  }

  update(state: SimState): void {
    const clock = fill(texts.hud.clock, clockParts(state.timeMinutes));
    const temperature = fill(texts.hud.temperature, {
      value: state.water.temperatureC.toFixed(1),
    });
    const alerts =
      state.alerts.length > 0 ? fill(texts.hud.alerts, { count: state.alerts.length }) : '';
    const key = `${clock}|${temperature}|${alerts}`;
    if (key === this.key) return;
    this.key = key;

    const g = this.graphics;
    g.clear();
    // Una tarjetita con fondo semitransparente, para que se lea sobre los cuadros.
    const lines: { text: string; color: number }[] = [
      { text: clock, color: 0xf4e9c8 },
      { text: temperature, color: 0xa9d8e8 },
    ];
    if (alerts) lines.push({ text: alerts, color: 0xff6b5e });
    const width = Math.max(...lines.map((line) => textWidth(line.text))) + 6;
    const height = lines.length * 7 + 4;
    g.rect(3, 3, width, height).fill({ color: 0x0a0d18, alpha: 0.55 });
    g.rect(3, 3, width, 1).fill({ color: 0xf4e9c8, alpha: 0.12 });
    lines.forEach((line, i) => drawPixelText(g, line.text, 6, 6 + i * 7, line.color, 1));
  }
}
