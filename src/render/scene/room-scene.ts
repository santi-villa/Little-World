/**
 * Escena base de 640x360: una habitación provisoria con la pecera.
 * Capas, de atrás hacia adelante: fondo de la habitación -> muebles ->
 * pecera -> UI. Las capas que faltan (clima en la ventana, objetos, gato,
 * iluminación global) se suman en las fases siguientes.
 */

import { Container, Graphics } from 'pixi.js';
import type { DerivedValues, SimState } from '../../sim';
import { daylight, lerpColor } from '../pixel-utils';
import { TANK_BASE_Y } from '../tank/tank-layout';
import { TankView } from '../tank/tank-view';
import { Hud } from '../ui/hud';
import { GAME_HEIGHT, GAME_WIDTH } from '../viewport';

export class RoomScene {
  readonly container = new Container();
  private readonly background = new Graphics();
  private readonly tank = new TankView();
  private readonly hud = new Hud();

  constructor() {
    this.container.addChild(this.background, this.tank.container, this.hud.container);
  }

  update(state: SimState, derived: DerivedValues, seconds: number): void {
    this.tank.update(state, derived, seconds);
    this.drawBackground(derived);
    this.hud.update(state, this.tank.bounds);
  }

  private drawBackground(derived: DerivedValues): void {
    const g = this.background;
    const tank = this.tank.bounds;
    const day = daylight(derived.hour);
    g.clear();
    // Pared, zócalo y piso.
    g.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill(lerpColor(0x141a2e, 0x3a4468, day));
    g.rect(0, 300, GAME_WIDTH, 4).fill(lerpColor(0x0e1322, 0x232c4d, day));
    g.rect(0, 304, GAME_WIDTH, 56).fill(lerpColor(0x1b1410, 0x4a3628, day));

    // Mueble de madera cálida debajo de la pecera.
    const width = Math.max(200, tank.width + 60);
    const x = Math.round((GAME_WIDTH - width) / 2);
    const height = GAME_HEIGHT - TANK_BASE_Y;
    g.rect(x, TANK_BASE_Y, width, height).fill(lerpColor(0x2c1d14, 0x7a5236, day));
    g.rect(x, TANK_BASE_Y, width, 4).fill(lerpColor(0x3a271b, 0x9a6c46, day));
    g.rect(GAME_WIDTH / 2 - 1, TANK_BASE_Y + 10, 2, height - 10).fill(
      lerpColor(0x1f140e, 0x553a27, day),
    );

    // Luz de la pecera: ámbar cuando está prendida.
    g.rect(tank.x + 16, tank.y - 14, tank.width - 32, 6).fill(0x2a2f3a);
    if (derived.lightOn) {
      g.rect(tank.x + 18, tank.y - 8, tank.width - 36, 2).fill(0xffd98a);
    }
  }
}
