/**
 * Escena de 1280x720: el dormitorio (imagen) con la pecera sobre el escritorio,
 * vista a través de una cámara con zoom y paneo.
 *
 * Mundo (se mueve con la cámara), de atrás hacia adelante:
 *   skyBase  (código)  degradé del cielo según la hora
 *   night    (imagen)  cielo-noche.png, que aparece de a poco al anochecer
 *   sky      (código)  estrellas que titilan, nubes, árboles, lluvia y rayos
 *   bird     (imagen)  el pájaro que a veces se posa afuera, en el alféizar
 *   room     (imagen)  dormitorio.png, con los vidrios transparentes
 *   curtains (imagen)  los dos paños de la cortina, con vaivén
 *   plants   (imagen)  plantas colgantes y enredadera, con vaivén
 *   anim     (código)  vapor de la taza y plato del gato
 *   pecera -> gato
 *   lights   (aditivo) lámpara, resplandor de la pecera y sol en el piso
 *   flash    (aditivo) relámpago iluminando la habitación
 *   glow     (aditivo) brillo de la zona recién tocada
 * Pantalla (quieta): HUD y botones.
 *
 * Vistas: la habitación (deslizar mueve la cámara), la pecera de cerca (con las
 * acciones de cuidado) y el gato de cerca (para acariciarlo). Las zonas
 * tocables salen de `src/data/rooms.json`.
 */

import { Container, Graphics, Sprite } from 'pixi.js';
import type { DerivedValues, SimAction, SimState, Weather } from '../../sim';
import { asset, tex } from '../assets';
import { Camera, type CameraView } from '../camera';
import { daylight, lerpColor } from '../pixel-utils';
import { TankView } from '../tank/tank-view';
import { Hud } from '../ui/hud';
import { CARE_BAR_HEIGHT, SceneUi, type CareId, type UiMode } from '../ui/scene-ui';
import { texts } from '../ui/texts';
import { GAME_HEIGHT, GAME_WIDTH } from '../viewport';
import { CatView } from './cat-view';
import { drawLights, drawRoomAnim } from './room-fx';
import { inRect, roomData, zoneRect, type RoomZone } from './room-zones';
import { BIRD_PERCH, CURTAINS, CURTAIN_TOP, HANGING, PX, scenePreview } from './scene-layout';
import { drawSky } from './window-view';

/** Lo que la escena necesita además del estado de la simulación. */
export interface SceneView {
  weather: Weather;
}

type Point = { x: number; y: number };

const ROOM_ID = 'dormitorio';
/** Tinte de la habitación de noche (multiplica la imagen). */
const NIGHT_TINT = 0x3a4472;
/** Cuánta luz de día deja pasar cada clima. */
const WEATHER_LIGHT: Record<Weather, number> = { clear: 1, cloudy: 0.85, rain: 0.7, storm: 0.5 };
/** Cuánto hay que mover el dedo para que deje de ser un toque (píxeles de pantalla). */
const DRAG_START = 10;
/** Deslizar hacia abajo esto (en la vista de cerca) vuelve a la habitación. */
const SWIPE_EXIT = 90;
/** Caricia: cuánto deslizar y cada cuánto cuenta otra. */
const STROKE_PIXELS = 28;
const STROKE_SECONDS = 0.35;
/** Cuánto dura el brillo de una zona tocada. */
const GLOW_SECONDS = 0.6;

interface Gesture {
  start: Point;
  last: Point;
  dragging: boolean;
  /** Ya salió de la vista de cerca con este gesto. */
  exited: boolean;
  petting: { travelled: number; lastStroke: number } | null;
}

export class RoomScene {
  readonly container = new Container();
  private readonly world = new Container();
  private readonly camera = new Camera(this.world);
  private readonly data = roomData(ROOM_ID);
  private readonly skyBase = new Graphics();
  private readonly night = new Sprite(tex('cielo-noche'));
  private readonly sky = new Graphics();
  private readonly bird = new Sprite(tex('pajaro'));
  /** Plantas y cortinas que se hamacan: rotación muy leve con el pivote arriba. */
  private readonly swaying: { sprite: Sprite; phase: number; amount: number }[] = [];
  private birdVisit: { start: number; stay: number; flip: boolean } | null = null;
  private nextBird = 25;
  private readonly room = new Sprite(tex(this.data.background));
  private readonly anim = new Graphics();
  private readonly lights = new Graphics();
  private readonly flash = new Graphics();
  private readonly glow = new Graphics();
  private readonly tank = new TankView();
  private readonly cat = new CatView();
  private readonly hud = new Hud();
  private readonly ui = new SceneUi();
  /** Los vidrios de la ventana, en píxeles gordos. */
  private readonly window: { x: number; y: number; width: number; height: number };
  private mode: UiMode = 'room';
  /** Vista de la habitación a la que se vuelve al salir de una vista de cerca. */
  private roomView: CameraView;
  private focusSince = 0;
  private gesture: Gesture | null = null;
  private glowZone: { zone: RoomZone; since: number } | null = null;
  /** null: la lámpara se prende sola cuando oscurece; si no, lo que eligió el jugador. */
  private lamp: boolean | null = null;
  private lampOn = false;
  private state: SimState | null = null;
  /** Zoom de la vista del gato (sale de su zona en rooms.json). */
  private zoomCat = 2.2;
  private lightsKey = '';
  private lastSeconds = 0;
  private seconds = 0;

  /** @param act Hace una acción de la simulación (acariciar al gato, abrir la ventana, cuidados). */
  constructor(private readonly act: (action: SimAction) => void, private readonly tools: (page: 'fish' | 'diary' | 'guide' | CareId) => void) {
    const hole = asset(this.data.background)?.hole ?? { x: 413, y: 85, width: 496, height: 300 };
    this.window = {
      x: Math.floor(hole.x / PX),
      y: Math.floor(hole.y / PX),
      width: Math.ceil(hole.width / PX) + 1,
      height: Math.ceil(hole.height / PX) + 1,
    };
    this.skyBase.scale.set(PX);
    this.sky.scale.set(PX);
    // El cielo de noche cubre el hueco de la ventana (la pared tapa lo que sobra).
    this.night.anchor.set(0.5);
    this.night.position.set(hole.x + Math.round(hole.width / 2), hole.y + Math.round(hole.height / 2));
    this.bird.anchor.set(0.5, 1);
    this.bird.visible = false;

    const decor = new Container();
    const hang = (name: string, x: number, y: number, scale: number, phase: number, amount: number, flip = false): void => {
      const sprite = new Sprite(tex(name));
      // Pivote arriba al centro: de ahí cuelga y alrededor de ahí se hamaca.
      sprite.anchor.set(0.5, 0);
      sprite.scale.set(flip ? -scale : scale, scale);
      sprite.position.set(x, y);
      decor.addChild(sprite);
      this.swaying.push({ sprite, phase, amount });
    };
    for (const c of CURTAINS) {
      const half = Math.round((tex(c.asset).width * c.scale) / 2);
      hang(c.asset, c.side === 'left' ? c.edge - half : c.edge + half, CURTAIN_TOP, c.scale, c.phase, 0.8);
    }
    for (const p of HANGING) hang(p.asset, p.x, p.y, p.scale, p.phase, 1);
    this.anim.scale.set(PX);
    this.lights.blendMode = 'add';
    this.flash.blendMode = 'add';
    this.glow.blendMode = 'add';

    // Las plantas colgantes quedan quietas (son parte del fondo): el viento con
    // un shader hacía rayas. Ver PENDIENTE.md: hacerlas con sprites separados.

    this.world.addChild(
      this.skyBase,
      this.night,
      this.sky,
      this.bird,
      this.room,
      decor,
      this.anim,
      this.tank.container,
      this.cat.container,
      this.lights,
      this.flash,
      this.glow,
    );
    this.container.addChild(this.world, this.hud.container, this.ui.container);
    this.roomView = { ...this.data.camera };
    this.camera.goTo(this.roomView, true);
  }

  update(state: SimState, derived: DerivedValues, seconds: number, view: SceneView): void {
    const dt = this.lastSeconds === 0 ? 0 : seconds - this.lastSeconds;
    this.lastSeconds = seconds;
    this.seconds = seconds;
    this.state = state;
    this.tank.update(state, derived, seconds);
    const light = this.drawRoom(state, derived, seconds, view);
    this.cat.update(
      Math.max(light, derived.lightOn ? 0.6 : 0.3), seconds,
    );
    // De cerca, la cámara acompaña al gato si camina.
    if (this.mode === 'cat' && !this.gesture?.dragging) this.focusOn(this.catFocus(), false);
    this.camera.update(dt);
    this.drawGlow(seconds);
    this.hud.update(state);
    this.ui.update(this.mode, state, seconds, seconds - this.focusSince);
  }

  // --- Toques y gestos (puntos en píxeles de la pantalla, 1280x720) ---

  pointerDown(p: Point): void {
    this.gesture = { start: p, last: p, dragging: false, exited: false, petting: null };
    if (this.mode === 'cat' && !this.ui.panelOpen && this.ui.hit(p.x, p.y) === null) {
      const w = this.camera.toWorld(p.x, p.y);
      if (this.cat.hit(w.x, w.y)) {
        // Apoyar la mano ya es una caricia; deslizar suma más.
        this.gesture.petting = { travelled: 0, lastStroke: this.seconds };
        this.petCat();
      }
    }
  }

  pointerMove(p: Point): void {
    const g = this.gesture;
    if (!g) return;
    const dx = p.x - g.last.x;
    const dy = p.y - g.last.y;
    g.last = p;
    if (g.petting) {
      g.petting.travelled += Math.hypot(dx, dy);
      const w = this.camera.toWorld(p.x, p.y);
      if (
        g.petting.travelled >= STROKE_PIXELS &&
        this.seconds - g.petting.lastStroke >= STROKE_SECONDS &&
        this.cat.hit(w.x, w.y)
      ) {
        g.petting.travelled = 0;
        g.petting.lastStroke = this.seconds;
        this.petCat();
      }
      return;
    }
    if (!g.dragging && Math.hypot(p.x - g.start.x, p.y - g.start.y) >= DRAG_START) g.dragging = true;
    if (!g.dragging || this.ui.panelOpen) return;
    if (this.mode === 'room') {
      // Deslizar mueve la cámara por la habitación.
      this.camera.dragging = true;
      this.camera.panBy(dx, dy);
    } else if (!g.exited) {
      // De cerca: deslizar hacia abajo vuelve a la habitación.
      const down = p.y - g.start.y;
      if (down > SWIPE_EXIT && down > Math.abs(p.x - g.start.x) * 1.5) {
        g.exited = true;
        this.exitFocus();
      }
    }
  }

  pointerUp(p: Point, cancelled = false): void {
    const g = this.gesture;
    this.gesture = null;
    this.camera.dragging = false;
    if (!g || cancelled || g.dragging || g.petting) return;
    this.tap(p);
  }

  private tap(p: Point): void {
    // Un panel abierto se cierra con cualquier toque.
    if (this.ui.panelOpen) {
      this.ui.closePanel();
      return;
    }
    const hit = this.ui.hit(p.x, p.y);
    if (hit?.kind === 'back') {
      this.exitFocus();
      return;
    }
    if (hit?.kind === 'care') {
      this.tools(hit.id);
      return;
    }

    const w = this.camera.toWorld(p.x, p.y);
    if (this.mode === 'tank') {
      // Golpecito en el vidrio: los peces se asustan (no hay que hacerlo).
      if (inRect(this.tank.bounds, w.x, w.y)) {
        this.tools('fish');
      }
      return;
    }
    if (this.mode === 'cat') {
      if (this.cat.hit(w.x, w.y)) this.petCat();
      return;
    }

    const live = { tank: this.tank.bounds, cat: this.cat.rect };
    const zone = this.data.zones.find((z) => inRect(zoneRect(z, live), w.x, w.y));
    if (!zone) return;
    this.glowZone = { zone, since: this.seconds };
    this.runZone(zone);
  }

  private runZone(zone: RoomZone): void {
    switch (zone.action) {
      case 'tank-view':
        this.enterFocus('tank', this.tankFocus(zone.fill ?? 0.85));
        break;
      case 'pet-cat':
        this.zoomCat = zone.zoom ?? 2.2;
        this.enterFocus('cat', this.catFocus());
        this.petCat();
        break;
      case 'panel':
        if (zone.panel) this.tools(zone.panel === 'notebook' ? 'diary' : 'guide');
        break;
      case 'toggle-window': {
        const open = !(this.state?.room.windowOpen ?? false);
        this.act({ type: 'setWindow', open });
        this.ui.say(open ? texts.scene.windowOpened : texts.scene.windowClosed);
        break;
      }
      case 'toggle-lamp':
        this.lamp = !this.lampOn;
        this.ui.say(this.lamp ? texts.scene.lampOn : texts.scene.lampOff);
        break;
    }
  }

  /** La pecera de cerca: ocupa `fill` de la pantalla, arriba de la barra de acciones. */
  private tankFocus(fill: number): CameraView {
    const t = this.tank.bounds;
    const free = GAME_HEIGHT - CARE_BAR_HEIGHT;
    const zoom = Math.min((fill * GAME_WIDTH) / t.width, (0.94 * free) / t.height);
    // Centrada en el espacio libre (la barra tapa la parte de abajo de la pantalla).
    return { x: t.x + t.width / 2, y: t.y + t.height / 2 + CARE_BAR_HEIGHT / 2 / zoom, zoom };
  }

  private catFocus(): CameraView {
    const r = this.cat.rect;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, zoom: this.zoomCat };
  }

  private enterFocus(mode: UiMode, view: CameraView): void {
    if (this.mode === 'room') this.roomView = { ...this.camera.target };
    this.mode = mode;
    this.focusSince = this.seconds;
    this.focusOn(view, true);
  }

  private focusOn(view: CameraView, snap: boolean): void {
    if (snap) {
      this.camera.goTo(view);
      return;
    }
    // Siguiendo algo que se mueve: solo el centro, sin volver a ajustar el zoom.
    this.camera.goTo({ ...view, zoom: this.camera.target.zoom });
  }

  private exitFocus(): void {
    if (this.mode === 'room') return;
    this.mode = 'room';
    this.camera.goTo(this.roomView);
  }

  /** Acaricia al gato: la simulación lo registra y el gato pasa a los mimos. */
  private petCat(): void {
    this.act({ type: 'petCat' });
    this.cat.pet(this.seconds);
  }

  /**
   * El pájaro: de vez en cuando, en días despejados, se posa afuera en el
   * alféizar, se queda unos segundos (a veces se da vuelta) y se va volando.
   */
  private updateBird(seconds: number, allowed: boolean, light: number): void {
    const b = this.bird;
    if (!this.birdVisit) {
      b.visible = false;
      if (seconds >= this.nextBird) {
        if (allowed) this.birdVisit = { start: seconds, stay: 6 + Math.random() * 5, flip: Math.random() < 0.5 };
        else this.nextBird = seconds + 20;
      }
      return;
    }
    const v = this.birdVisit;
    const age = seconds - v.start;
    const arrive = 0.7;
    const leave = 0.8;
    if (age > arrive + v.stay + leave) {
      this.birdVisit = null;
      this.nextBird = seconds + 40 + Math.random() * 60;
      b.visible = false;
      return;
    }
    let dx = 0;
    let dy = 0;
    let alpha = 1;
    if (age < arrive) {
      // Llega bajando.
      const k = 1 - age / arrive;
      dy = -18 * k * k;
      dx = -10 * k;
      alpha = 1 - k;
    } else if (age > arrive + v.stay) {
      // Se va volando hacia arriba.
      const k = (age - arrive - v.stay) / leave;
      dy = -30 * k;
      dx = 24 * k;
      alpha = 1 - k;
    }
    // A mitad de la visita se da vuelta, y da saltitos de vez en cuando.
    const turned = v.flip !== age > arrive + v.stay / 2;
    const hop = age > arrive && age < arrive + v.stay && Math.sin(age * 5) > 0.97 ? -2 : 0;
    b.visible = true;
    b.alpha = alpha;
    b.scale.set(turned ? -1 : 1, 1);
    b.position.set(Math.round(BIRD_PERCH.x + dx), Math.round(BIRD_PERCH.y + dy + hop));
    b.tint = lerpColor(NIGHT_TINT, 0xffffff, light);
  }

  /** Brillo sutil sobre la zona recién tocada. */
  private drawGlow(seconds: number): void {
    const g = this.glow;
    g.clear();
    if (!this.glowZone) return;
    const age = seconds - this.glowZone.since;
    if (age > GLOW_SECONDS) {
      this.glowZone = null;
      return;
    }
    const k = 1 - age / GLOW_SECONDS;
    const r = zoneRect(this.glowZone.zone, { tank: this.tank.bounds, cat: this.cat.rect });
    const x = Math.round(r.x);
    const y = Math.round(r.y);
    const w = Math.round(r.width);
    const h = Math.round(r.height);
    g.rect(x, y, w, h).fill({ color: 0xfff2c8, alpha: 0.07 * k });
    g.rect(x, y, w, 2).rect(x, y + h - 2, w, 2).rect(x, y + 2, 2, h - 4).rect(x + w - 2, y + 2, 2, h - 4);
    g.fill({ color: 0xfff2c8, alpha: 0.22 * k });
  }

  /** Dibuja la habitación y devuelve cuánta luz de día hay (0 noche .. 1 pleno día). */
  private drawRoom(state: SimState, derived: DerivedValues, seconds: number, view: SceneView): number {
    const tank = this.tank.bounds;
    // La hora puede venir del panel de debug (solo cambia lo que se ve).
    const day = daylight(scenePreview.hour ?? derived.hour);
    const light = day * WEATHER_LIGHT[view.weather];
    const night = 1 - light;
    // La lámpara: la que eligió el jugador o, si nunca la tocó, sola cuando oscurece.
    const lampOn = this.lamp ?? light < 0.5;
    this.lampOn = lampOn;

    // Ventana.
    this.skyBase.clear();
    drawSky(this.skyBase, this.window, day, view.weather, seconds, 'base');
    // De noche aparece la imagen del cielo estrellado, de a poco según la hora.
    this.night.alpha = Math.min(1, (1 - day) * 1.15) * (view.weather === 'clear' ? 1 : view.weather === 'cloudy' ? 0.7 : 0.45);
    this.night.visible = this.night.alpha > 0.01;
    this.sky.clear();
    const bolt = drawSky(this.sky, this.window, day, view.weather, seconds, 'front');
    this.updateBird(seconds, view.weather === 'clear' && day > 0.6, light);

    // Día y noche: las imágenes se tiñen.
    const tint = lerpColor(NIGHT_TINT, 0xffffff, light);
    this.room.tint = tint;
    // Brisa: las plantas y la cortina se hamacan apenas (más con la ventana abierta).
    const breeze = (state.room.windowOpen ? 1.8 : 0.9) * (view.weather === 'storm' ? 1.2 : 1);
    for (const item of this.swaying) {
      item.sprite.tint = tint;
      const swing = Math.sin(seconds * 0.45 + item.phase) * 0.75 + Math.sin(seconds * 0.27 + item.phase * 1.9) * 0.25;
      item.sprite.rotation = (Math.min(2, breeze * item.amount) * swing * Math.PI) / 180;
    }

    // Vapor de la taza.
    this.anim.clear();
    drawRoomAnim(this.anim, seconds);

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
