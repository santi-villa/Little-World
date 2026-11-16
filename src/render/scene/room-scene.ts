/**
 * Escena base de 640x360: una habitación provisoria con la pecera.
 * Capas, de atrás hacia adelante: fondo de la habitación -> muebles ->
 * pecera -> UI. Las capas que faltan (clima en la ventana, objetos, gato,
 * iluminación global) se suman en las fases siguientes.
 */

import { Container, Graphics } from 'pixi.js';
import type { DerivedValues, SimState, Weather } from '../../sim';
import { daylight, lerpColor, scatter } from '../pixel-utils';
import { TANK_BASE_Y } from '../tank/tank-layout';
import { TankView } from '../tank/tank-view';
import { Hud } from '../ui/hud';
import { GAME_HEIGHT, GAME_WIDTH } from '../viewport';
import { CatView } from './cat-view';
import { BED, BOWL, FLOOR_Y, FURNITURE_MARGIN, SUNBEAM, WINDOW } from './scene-layout';

/** Lo que la escena necesita además del estado de la simulación. */
export interface SceneView {
  weather: Weather;
}

export class RoomScene {
  readonly container = new Container();
  private readonly background = new Graphics();
  private readonly tank = new TankView();
  private readonly cat = new CatView();
  private readonly hud = new Hud();
  private lastSeconds = 0;

  constructor() {
    this.container.addChild(
      this.background,
      this.tank.container,
      this.cat.container,
      this.hud.container,
    );
  }

  update(state: SimState, derived: DerivedValues, seconds: number, view: SceneView): void {
    const dt = this.lastSeconds === 0 ? 0 : seconds - this.lastSeconds;
    this.lastSeconds = seconds;
    this.tank.update(state, derived, seconds);
    this.drawBackground(state, derived, seconds, view);
    this.cat.update(
      state,
      this.tank.bounds,
      Math.max(daylight(derived.hour), derived.lightOn ? 0.6 : 0.25),
      seconds,
      dt,
      this.tank.fish.watchPoint(),
    );
    this.hud.update(state, this.tank.bounds);
  }

  /** ¿Qué hay en ese punto de la escena? */
  pick(x: number, y: number): 'cat' | 'tank' | null {
    if (this.cat.hit(x, y)) return 'cat';
    const t = this.tank.bounds;
    if (x >= t.x && x <= t.x + t.width && y >= t.y && y <= t.y + t.height) return 'tank';
    return null;
  }

  /** Golpe en el vidrio en ese punto: los peces se alejan de ahí. */
  scareFish(x: number, y: number): void {
    this.tank.fish.scareAt(x, y);
  }

  private drawWindow(g: Graphics, hour: number, seconds: number, weather: Weather): void {
    const day = daylight(hour);
    const { x, y, width, height } = WINDOW;
    const clear = lerpColor(0x0a0f24, 0x6fb7e8, day);
    const grey = lerpColor(0x0c0f1c, 0x8a93a3, day);
    const sky = weather === 'clear' ? clear : weather === 'cloudy' ? lerpColor(clear, grey, 0.7) : grey;
    g.rect(x - 3, y - 3, width + 6, height + 6).fill(lerpColor(0x241a14, 0x6b4a33, day));
    g.rect(x, y, width, height).fill(weather === 'storm' ? lerpColor(sky, 0x1a1c26, 0.5) : sky);
    if (weather === 'clear' && day < 0.3) {
      for (let i = 0; i < 12; i++) {
        g.rect(x + 3 + Math.floor(scatter(i, 31) * (width - 6)), y + 3 + Math.floor(scatter(i, 32) * (height - 20)), 1, 1);
      }
      g.fill(0xf4f1d0);
    }
    if (weather !== 'clear') {
      for (let i = 0; i < 4; i++) {
        const cx = x + ((scatter(i, 33) * width + seconds * (2 + i)) % (width - 30));
        g.rect(Math.round(cx), y + 8 + i * 9, 30, 6);
      }
      g.fill({ color: lerpColor(0x2a2f44, 0xe6ebf2, day), alpha: 0.7 });
    }
    if (weather === 'rain' || weather === 'storm') {
      const drops = weather === 'storm' ? 40 : 24;
      for (let i = 0; i < drops; i++) {
        const dx = x + 1 + Math.floor(scatter(i, 34) * (width - 3));
        const dy = y + ((scatter(i, 35) * height + seconds * (90 + 40 * scatter(i, 36))) % (height - 5));
        g.rect(dx, Math.round(dy), 1, 4);
      }
      g.fill({ color: 0xcfe3ff, alpha: 0.7 });
      // Relámpago ocasional.
      if (weather === 'storm' && Math.floor(seconds * 10) % 70 === 0) {
        g.rect(x, y, width, height).fill({ color: 0xffffff, alpha: 0.5 });
      }
    }
    // Marco y alféizar.
    g.rect(x + width / 2 - 1, y, 2, height).rect(x, y + height / 2 - 1, width, 2).fill(lerpColor(0x241a14, 0x6b4a33, day));
    g.rect(x - 8, y + height + 3, width + 16, 4).fill(lerpColor(0x30231a, 0x8a6244, day));
  }

  private drawBackground(
    state: SimState,
    derived: DerivedValues,
    seconds: number,
    view: SceneView,
  ): void {
    const g = this.background;
    const tank = this.tank.bounds;
    const day = daylight(derived.hour);
    g.clear();
    // Pared, zócalo y piso.
    g.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill(lerpColor(0x141a2e, 0x3a4468, day));
    g.rect(0, FLOOR_Y - 4, GAME_WIDTH, 4).fill(lerpColor(0x0e1322, 0x232c4d, day));
    g.rect(0, FLOOR_Y, GAME_WIDTH, GAME_HEIGHT - FLOOR_Y).fill(lerpColor(0x1b1410, 0x4a3628, day));
    this.drawWindow(g, derived.hour, seconds, view.weather);

    // Rayo de sol en el piso los días despejados (donde le gusta dormir al gato).
    if (view.weather === 'clear' && day > 0.5) {
      g.rect(SUNBEAM.x - 34, FLOOR_Y + 22, 68, 26).fill({ color: 0xffe9a8, alpha: 0.22 * day });
    }
    // Cama del gato y su plato.
    g.rect(BED.x - 24, BED.y - 4, 48, 8).fill(lerpColor(0x2a2140, 0x6f5a9a, day));
    g.rect(BED.x - 20, BED.y - 7, 40, 4).fill(lerpColor(0x3a2f55, 0x9783c4, day));
    g.rect(BOWL.x - 8, BOWL.y - 4, 16, 5).fill(lerpColor(0x26303f, 0x6f8fb0, day));
    if (state.cat.bowl > 0) {
      const food = Math.max(2, Math.round(12 * state.cat.bowl));
      g.rect(BOWL.x - Math.floor(food / 2), BOWL.y - 6, food, 2).fill(lerpColor(0x4a3018, 0xa8703a, day));
    }

    // Mueble de madera cálida debajo de la pecera.
    const width = Math.max(200, tank.width + FURNITURE_MARGIN * 2);
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
