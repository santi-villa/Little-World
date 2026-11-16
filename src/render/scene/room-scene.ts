/**
 * Escena de 1280x720: el dormitorio (imagen) con la pecera sobre el escritorio.
 * Capas, de atrás hacia adelante:
 *   sky      (código)  lo que se ve por los vidrios de la ventana: cielo y clima
 *   room     (imagen)  dormitorio.png, con los vidrios transparentes
 *   plants   (imagen)  las plantas colgantes, con el shader de viento
 *   anim     (código)  vapor de la taza y plato del gato
 *   pecera -> gato
 *   lights   (aditivo) lámpara, resplandor de la pecera y sol en el piso
 *   flash    (aditivo) relámpago iluminando la habitación
 *   UI
 * El día y la noche se hacen tiñendo las imágenes.
 */

import { Container, Graphics, Sprite } from 'pixi.js';
import type { DerivedValues, SimState, Weather } from '../../sim';
import { asset, assetNames, tex } from '../assets';
import { daylight, lerpColor } from '../pixel-utils';
import { SwayFilter } from '../sway-filter';
import { TankView } from '../tank/tank-view';
import { Hud } from '../ui/hud';
import { GAME_HEIGHT, GAME_WIDTH } from '../viewport';
import { CatView } from './cat-view';
import { drawLights, drawRoomAnim } from './room-fx';
import { PX, scenePreview } from './scene-layout';
import { drawSky } from './window-view';

/** Lo que la escena necesita además del estado de la simulación. */
export interface SceneView {
  weather: Weather;
}

const ROOM = 'dormitorio';
/** Tinte de la habitación de noche (multiplica la imagen). */
const NIGHT_TINT = 0x3a4472;
const NIGHT = 0x0a0f22;
/** Cuánta luz de día deja pasar cada clima. */
const WEATHER_LIGHT: Record<Weather, number> = { clear: 1, cloudy: 0.85, rain: 0.7, storm: 0.5 };
/** Viento de cada clima: cuántos píxeles se corren las puntas de las plantas. */
const WEATHER_WIND: Record<Weather, number> = { clear: 0.8, cloudy: 1.2, rain: 1.6, storm: 2.4 };

export class RoomScene {
  readonly container = new Container();
  private readonly sky = new Graphics();
  private readonly room = new Sprite(tex(ROOM));
  private readonly plants: { sprite: Sprite; filter: SwayFilter }[] = [];
  private readonly anim = new Graphics();
  private readonly lights = new Graphics();
  private readonly flash = new Graphics();
  private readonly tank = new TankView();
  private readonly cat = new CatView();
  private readonly hud = new Hud();
  /** Los vidrios de la ventana, en píxeles gordos. */
  private readonly window: { x: number; y: number; width: number; height: number };
  private lightsKey = '';
  private lastSeconds = 0;

  constructor() {
    const hole = asset(ROOM)?.hole ?? { x: 413, y: 85, width: 496, height: 300 };
    this.window = {
      x: Math.floor(hole.x / PX),
      y: Math.floor(hole.y / PX),
      width: Math.ceil(hole.width / PX) + 1,
      height: Math.ceil(hole.height / PX) + 1,
    };
    this.sky.scale.set(PX);
    this.anim.scale.set(PX);
    this.lights.blendMode = 'add';
    this.flash.blendMode = 'add';

    const plantLayer = new Container();
    assetNames('wind-plant', ROOM).forEach((name, i) => {
      const entry = asset(name);
      const sprite = new Sprite(tex(name));
      sprite.position.set(entry?.x ?? 0, entry?.y ?? 0);
      const filter = new SwayFilter('top', sprite.height, i * 1.9);
      sprite.filters = [filter];
      plantLayer.addChild(sprite);
      this.plants.push({ sprite, filter });
    });

    this.container.addChild(
      this.sky,
      this.room,
      plantLayer,
      this.anim,
      this.tank.container,
      this.cat.container,
      this.lights,
      this.flash,
      this.hud.container,
    );
  }

  update(state: SimState, derived: DerivedValues, seconds: number, view: SceneView): void {
    const dt = this.lastSeconds === 0 ? 0 : seconds - this.lastSeconds;
    this.lastSeconds = seconds;
    this.tank.update(state, derived, seconds);
    const light = this.drawRoom(state, derived, seconds, view);
    this.cat.update(
      state,
      this.tank.bounds,
      Math.max(light, derived.lightOn ? 0.6 : 0.3),
      seconds,
      dt,
      this.tank.watchPoint(),
    );
    this.hud.update(state);
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
    this.tank.scareAt(x, y);
  }

  /** Dibuja la habitación y devuelve cuánta luz de día hay (0 noche .. 1 pleno día). */
  private drawRoom(state: SimState, derived: DerivedValues, seconds: number, view: SceneView): number {
    const tank = this.tank.bounds;
    // La hora puede venir del panel de debug (solo cambia lo que se ve).
    const day = daylight(scenePreview.hour ?? derived.hour);
    const light = day * WEATHER_LIGHT[view.weather];
    const night = 1 - light;
    const lampOn = light < 0.5;

    // Ventana.
    this.sky.clear();
    const bolt = drawSky(this.sky, this.window, day, view.weather, seconds);

    // Día y noche: las imágenes se tiñen.
    const tint = lerpColor(NIGHT_TINT, 0xffffff, light);
    this.room.tint = tint;
    const wind = WEATHER_WIND[view.weather];
    for (const plant of this.plants) {
      plant.sprite.tint = tint;
      plant.filter.set(seconds, wind);
    }

    // Vapor y plato.
    const tone = (c: number): number => lerpColor(lerpColor(c, NIGHT, 0.62), c, light);
    this.anim.clear();
    drawRoomAnim(this.anim, tone, seconds, state.cat.bowl);

    // Luces.
    const sun = view.weather === 'clear' && day > 0.5 ? day : 0;
    const lightsKey = `${Math.round(night * 40)},${lampOn},${tank.x},${tank.y},${tank.width},${derived.lightOn},${Math.round(sun * 20)}`;
    if (lightsKey !== this.lightsKey) {
      this.lightsKey = lightsKey;
      this.lights.clear();
      drawLights(this.lights, tank, lampOn, night, derived.lightOn, sun);
    }
    this.flash.clear();
    if (bolt > 0) {
      this.flash.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0xb8c8ff, alpha: 0.16 * bolt });
    }
    return light;
  }
}
