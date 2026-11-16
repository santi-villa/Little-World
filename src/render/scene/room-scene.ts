/**
 * Escena de 640x360: el dormitorio con la pecera sobre el escritorio.
 * Capas, de atrás hacia adelante:
 *   sky     (animado)  lo que se ve por la ventana: cielo, nubes, lluvia, relámpagos
 *   room    (fijo)     pared, marco de la ventana, muebles y objetos
 *   anim    (animado)  plantas colgantes y vapor de la taza
 *   pecera -> gato
 *   lights  (aditivo)  lámpara, resplandor de la pecera y sol en el piso
 *   flash   (aditivo)  relámpago iluminando la habitación
 *   UI
 * La capa fija solo se redibuja cuando cambia la luz, la pecera o el plato del gato.
 */

import { Container, Graphics } from 'pixi.js';
import type { DerivedValues, SimState, Weather } from '../../sim';
import { daylight, lerpColor } from '../pixel-utils';
import { Batch } from '../tank/tank-decor';
import { TankView } from '../tank/tank-view';
import { Hud } from '../ui/hud';
import { GAME_HEIGHT, GAME_WIDTH } from '../viewport';
import { CatView } from './cat-view';
import { drawLights, drawRoom, drawRoomAnim, drawRoomShadows, type RoomParams } from './room-decor';
import { deskSpan, scenePreview } from './scene-layout';
import { drawSky } from './window-view';

/** Lo que la escena necesita además del estado de la simulación. */
export interface SceneView {
  weather: Weather;
}

const NIGHT = 0x0a0f22;
/** Cuánta luz de día deja pasar cada clima. */
const WEATHER_LIGHT: Record<Weather, number> = { clear: 1, cloudy: 0.85, rain: 0.7, storm: 0.5 };

export class RoomScene {
  readonly container = new Container();
  private readonly sky = new Graphics();
  private readonly room = new Graphics();
  private readonly anim = new Graphics();
  private readonly lights = new Graphics();
  private readonly flash = new Graphics();
  private readonly tank = new TankView();
  private readonly cat = new CatView();
  private readonly hud = new Hud();
  private readonly ordered = new Batch(true);
  private readonly batch = new Batch();
  private roomKey = '';
  private lightsKey = '';
  private lastSeconds = 0;

  constructor() {
    this.lights.blendMode = 'add';
    this.flash.blendMode = 'add';
    this.container.addChild(
      this.sky,
      this.room,
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

  /** Dibuja la habitación y devuelve cuánta luz de día hay (0 noche .. 1 pleno día). */
  private drawRoom(state: SimState, derived: DerivedValues, seconds: number, view: SceneView): number {
    const tank = this.tank.bounds;
    // La hora puede venir del panel de debug (solo cambia lo que se ve).
    const day = daylight(scenePreview.hour ?? derived.hour);
    const light = day * WEATHER_LIGHT[view.weather];
    const night = 1 - light;
    const tone = (c: number): number => lerpColor(lerpColor(c, NIGHT, 0.62), c, light);
    const params: RoomParams = {
      tank,
      desk: deskSpan(tank.width),
      lampOn: light < 0.5,
      bowl: Math.round(state.cat.bowl * 7) / 7,
    };

    // Ventana.
    this.sky.clear();
    const bolt = drawSky(this.sky, day, view.weather, seconds);

    // Lo fijo.
    const roomKey = `${Math.round(light * 40)},${tank.x},${tank.y},${tank.width},${params.bowl},${params.lampOn}`;
    if (roomKey !== this.roomKey) {
      this.roomKey = roomKey;
      this.room.clear();
      drawRoom(this.ordered, params);
      this.ordered.flush(this.room, tone);
      drawRoomShadows(this.room, params);
    }

    // Plantas y vapor.
    this.anim.clear();
    drawRoomAnim(this.batch, this.anim, params, tone, seconds);

    // Luces.
    const sun = view.weather === 'clear' && day > 0.5 ? day : 0;
    const lightsKey = `${roomKey},${derived.lightOn},${Math.round(sun * 20)}`;
    if (lightsKey !== this.lightsKey) {
      this.lightsKey = lightsKey;
      this.lights.clear();
      drawLights(this.lights, params, night, derived.lightOn, sun);
    }
    this.flash.clear();
    if (bolt > 0) {
      this.flash.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0xb8c8ff, alpha: 0.16 * bolt });
    }
    return light;
  }
}
