/**
 * El gato: un atigrado naranja en pixel art dibujado por código. La simulación
 * dice qué hace y en qué lugar está; acá se lo lleva caminando hasta ahí y se
 * elige la pose: hecho un bollito (respira), sentado (mueve la cola, parpadea y
 * sigue a los peces con la mirada), caminando, comiendo o tocando el vidrio.
 */

import { Container, Graphics } from 'pixi.js';
import type { CatSpot, SimState } from '../../sim';
import { lerpColor } from '../pixel-utils';
import { Batch } from '../batch';
import { TANK_BASE_Y, type TankRect } from '../tank/tank-layout';
import { drawPixelText, textWidth } from '../ui/pixel-font';
import { texts } from '../ui/texts';
import { GAME_WIDTH } from '../viewport';
import { BED, BOWL, FLOOR_X, GROUND_Y, PX, SUNBEAM, WINDOWSILL } from './scene-layout';

const FUR = 0xe08a3c;
const FUR_LIGHT = 0xf2a858;
const SHADE = 0xc47430;
const STRIPE = 0xb8621f;
const CREAM = 0xf8e4c4;
const PINK = 0xe58a8a;
const EYE_GREEN = 0x9ad94e;
const INK = 0x2a1a0c;
const WALK_SPEED = 160; // píxeles de la escena por segundo
const NIGHT = 0x1a1f33;

type Pose = 'sit' | 'sleep' | 'walk' | 'eat' | 'tap';

export class CatView {
  readonly container = new Container();
  private readonly graphics = new Graphics();
  private readonly batch = new Batch(true);
  private x = 640;
  private y = GROUND_Y;
  private facing: 1 | -1 = 1;
  private placed = false;
  private wanderX = 640;
  private wanderUntil = 0;

  constructor() {
    // Se dibuja en píxeles gordos (PX): las posiciones son de la escena, el dibujo va a la mitad.
    this.graphics.scale.set(PX);
    this.container.addChild(this.graphics);
  }

  /** ¿El punto (en píxeles de la escena) toca al gato? */
  hit(sceneX: number, sceneY: number): boolean {
    return Math.abs(sceneX - this.x) <= 36 && sceneY <= this.y + 8 && sceneY >= this.y - 60;
  }

  private spotPosition(
    spot: CatSpot,
    tank: TankRect,
    playing: boolean,
    seconds: number,
  ): { x: number; y: number; facing?: 1 | -1 } {
    switch (spot) {
      case 'bed':
        return BED;
      case 'sunbeam':
        return SUNBEAM;
      case 'tank_lid':
        return { x: tank.x + Math.round(tank.width / 2), y: tank.y + 6 };
      case 'tank_front':
        return { x: tank.x - 34, y: TANK_BASE_Y, facing: 1 };
      case 'windowsill':
        return { ...WINDOWSILL, facing: 1 };
      case 'bowl':
        return { x: BOWL.x + 44, y: GROUND_Y, facing: -1 };
      case 'away':
        return { x: GAME_WIDTH + 120, y: GROUND_Y };
      case 'floor':
      default:
        // Paseando o jugando va de un lado a otro del piso.
        if (seconds >= this.wanderUntil) {
          this.wanderX = FLOOR_X.min + Math.random() * (FLOOR_X.max - FLOOR_X.min);
          this.wanderUntil = seconds + (playing ? 1.5 + Math.random() * 2 : 6 + Math.random() * 10);
        }
        return { x: this.wanderX, y: GROUND_Y };
    }
  }

  update(
    state: SimState,
    tank: TankRect,
    daylight: number,
    seconds: number,
    dtSeconds: number,
    lookAt: { x: number; y: number } | null,
  ): void {
    const cat = state.cat;
    const playing = cat.behavior === 'play';
    const target = this.spotPosition(cat.spot, tank, playing, seconds);
    if (!this.placed) {
      this.x = target.x;
      this.y = target.y;
      this.placed = true;
    }
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const step = WALK_SPEED * (playing || cat.behavior === 'sulk' ? 1.6 : 1) * Math.min(0.1, dtSeconds);
    const moving = distance > 1.5;
    if (moving) {
      const k = Math.min(1, step / distance);
      this.x += dx * k;
      this.y += dy * k;
      if (Math.abs(dx) > 0.5) this.facing = dx > 0 ? 1 : -1;
    } else if (target.facing) {
      this.facing = target.facing;
    }

    let pose: Pose = 'sit';
    if (moving) pose = 'walk';
    else if (cat.behavior === 'sleep') pose = 'sleep';
    else if (cat.behavior === 'eat') pose = 'eat';
    else if (cat.behavior === 'tap_glass') pose = 'tap';
    else if (playing || cat.behavior === 'wander') pose = 'walk';

    const g = this.graphics;
    g.clear();
    if (this.x > GAME_WIDTH + 60) return;
    const dim = (color: number): number => lerpColor(lerpColor(color, NIGHT, 0.55), color, daylight);
    const b = this.batch;
    const x = Math.round(this.x / PX);
    const y = Math.round(this.y / PX);
    const d = this.facing;
    const purring = cat.behavior === 'purr';
    const watching = cat.behavior === 'watch_fish';
    /** Rectángulo en coordenadas del gato: dx hacia adelante, dy desde el piso (negativo arriba). */
    const R = (color: number, dx: number, dy: number, w: number, h: number): void =>
      b.add(color, d > 0 ? x + dx : x - dx - w + 1, y + dy, w, h);
    /** Filas seguidas, cada una de x0 a x1 (incluidos). */
    const rows = (color: number, dy: number, spans: readonly (readonly [number, number])[]): void =>
      spans.forEach(([x0, x1], r) => R(color, x0, dy + r, x1 - x0 + 1, 1));

    const head = (cx: number, top: number, eyes: 'open' | 'closed', gazeY: number): void => {
      rows(FUR, top, [[cx - 4, cx + 4], [cx - 5, cx + 5], [cx - 5, cx + 5], [cx - 5, cx + 5], [cx - 5, cx + 5], [cx - 5, cx + 5], [cx - 5, cx + 5], [cx - 4, cx + 4], [cx - 3, cx + 3]]);
      R(FUR_LIGHT, cx - 3, top + 1, 7, 1);
      // Orejas.
      rows(FUR, top - 3, [[cx - 5, cx - 5], [cx - 5, cx - 4], [cx - 5, cx - 3]]);
      rows(FUR, top - 3, [[cx + 5, cx + 5], [cx + 4, cx + 5], [cx + 3, cx + 5]]);
      R(PINK, cx - 4, top - 1, 1, 1);
      R(PINK, cx + 4, top - 1, 1, 1);
      // Rayas de atigrado.
      R(STRIPE, cx - 2, top, 1, 2);
      R(STRIPE, cx, top, 1, 3);
      R(STRIPE, cx + 2, top, 1, 2);
      R(STRIPE, cx - 5, top + 4, 2, 1);
      R(STRIPE, cx + 4, top + 4, 2, 1);
      // Hocico, nariz y bigotes.
      R(CREAM, cx - 1, top + 5, 5, 3);
      R(CREAM, cx, top + 8, 3, 1);
      R(PINK, cx + 1, top + 5, 1, 1);
      R(INK, cx + 1, top + 6, 1, 1);
      R(CREAM, cx + 6, top + 6, 3, 1);
      R(CREAM, cx - 8, top + 6, 3, 1);
      for (const ex of [cx - 2, cx + 3]) {
        if (eyes === 'closed') {
          R(INK, ex, top + 4, 2, 1);
        } else {
          R(EYE_GREEN, ex, top + 3, 2, 2);
          R(INK, ex + 1, top + 3 + (gazeY > 0 ? 1 : 0), 1, gazeY === 0 ? 2 : 1);
        }
      }
    };
    const blink = (seconds * 0.35 + 0.3) % 1 < 0.035;

    if (pose === 'sleep') {
      // Hecho un bollito; el lomo sube y baja al respirar.
      const br = Math.sin(seconds * 1.5) > 0 ? 1 : 0;
      rows(FUR, -13 - br, [[-5, 7], [-9, 11], [-12, 13], [-14, 15]]);
      if (br) R(FUR, -14, -10, 30, 1);
      rows(FUR, -9, [[-15, 16], [-15, 16], [-15, 16], [-15, 16], [-15, 16], [-15, 16], [-15, 16], [-14, 15], [-12, 13]]);
      R(FUR_LIGHT, -6, -12 - br, 14, 1);
      R(STRIPE, -10, -11 - br, 2, 3);
      R(STRIPE, -5, -12 - br, 2, 4);
      R(STRIPE, 0, -12 - br, 2, 4);
      R(SHADE, -13, -7, 1, 4);
      R(SHADE, -12, -9, 1, 2);
      // La cola lo rodea.
      R(STRIPE, -14, -3, 21, 2);
      R(FUR, -9, -3, 2, 2);
      R(FUR, -3, -3, 2, 2);
      R(CREAM, 5, -3, 3, 2);
      // Cabeza apoyada sobre las patas.
      R(SHADE, 5, -11, 1, 7);
      rows(FUR, -12, [[8, 14], [7, 15], [6, 16], [6, 16], [6, 16], [6, 16], [6, 16], [7, 15], [8, 14]]);
      rows(FUR, -15, [[7, 7], [7, 8], [7, 9]]);
      rows(FUR, -15, [[15, 15], [14, 15], [13, 15]]);
      R(PINK, 8, -13, 1, 1);
      R(PINK, 14, -13, 1, 1);
      R(STRIPE, 10, -12, 1, 2);
      R(STRIPE, 12, -12, 1, 2);
      R(INK, 8, -8, 2, 1);
      R(INK, 13, -8, 2, 1);
      R(CREAM, 9, -6, 5, 2);
      R(PINK, 11, -7, 1, 1);
      R(CREAM, 8, -3, 6, 2);
      b.flush(g, dim);
      const drift = Math.floor(seconds * 2) % 6;
      drawPixelText(g, 'z', x + d * 14, y - 22 - drift, dim(0xdfe6f7), 1);
      return;
    }

    if (pose === 'walk' || pose === 'eat') {
      const bounce = playing && !moving ? Math.abs(Math.round(Math.sin(seconds * 9) * 3)) : 0;
      const o = -bounce;
      const stride = moving || playing ? Math.floor(seconds * 8) % 2 : 0;
      // Patas de atrás (en sombra) y de adelante, alternadas.
      R(SHADE, -6 + stride, o - 6, 2, 6 - stride);
      R(SHADE, 5 - stride, o - 6, 2, 5 + stride);
      // Cola levantada, con la punta que se mueve.
      R(STRIPE, -13, o - 16, 3, 2);
      R(STRIPE, -14, o - 21, 2, 6);
      R(STRIPE, -13, o - 24, 2, 3);
      R(CREAM, -13 + stride, o - 26, 2, 2);
      // Cuerpo.
      rows(FUR, o - 15, [[-9, 8], [-11, 10], [-11, 10], [-11, 10], [-11, 10], [-11, 10], [-11, 10], [-11, 10], [-10, 9], [-8, 7]]);
      R(FUR_LIGHT, -7, o - 14, 14, 1);
      R(CREAM, -6, o - 7, 12, 1);
      R(STRIPE, -7, o - 15, 2, 4);
      R(STRIPE, -3, o - 15, 2, 5);
      R(STRIPE, 1, o - 15, 2, 4);
      R(STRIPE, 5, o - 15, 2, 3);
      R(FUR, -9 - stride, o - 6, 2, 5 + stride);
      R(FUR, 8 + stride, o - 6, 2, 6 - stride);
      R(CREAM, -9 - stride, o - 1, 3, 1);
      if (!stride) R(CREAM, 8, o - 1, 3, 1);
      if (pose === 'eat') {
        // Cabeza gacha sobre el plato, con un bocadito cada tanto.
        const nod = Math.floor(seconds * 4) % 2;
        head(13, o - 15 + nod, 'closed', 0);
      } else {
        R(FUR, 8, o - 18, 4, 5);
        head(12, o - 25, purring || blink ? 'closed' : 'open', 0);
      }
      b.flush(g, dim);
      return;
    }

    // Sentado (mirando, pidiendo, lavándose, ronroneando, tocando el vidrio).
    // Cola por el piso: late despacio, o da latigazos cuando mira a los peces.
    const wag = Math.sin(seconds * (watching ? 7 : 2)) > 0 ? 1 : 0;
    R(STRIPE, -15, -2, 9, 2);
    R(STRIPE, -16, -4 - wag, 2, 3 + wag);
    R(CREAM, -16, -5 - wag, 2, 1);
    for (let dy = -17; dy <= -1; dy++) {
      const back = dy <= -17 ? -3 : dy === -16 ? -4 : dy <= -13 ? -5 : dy <= -9 ? -6 : dy <= -5 ? -7 : -8;
      const frontX = dy <= -17 ? 3 : dy === -16 ? 4 : dy <= -9 ? 5 : 6;
      R(FUR, back, dy, frontX - back + 1, 1);
    }
    R(FUR_LIGHT, -4, -15, 1, 6);
    R(STRIPE, -6, -11, 3, 1);
    R(STRIPE, -7, -8, 3, 1);
    R(STRIPE, -7, -5, 4, 1);
    R(SHADE, -8, -4, 1, 3);
    R(SHADE, -3, -6, 1, 5);
    R(CREAM, 2, -15, 2, 1);
    R(CREAM, 1, -14, 4, 8);
    R(FUR_LIGHT, 3, -7, 3, 6);
    R(SHADE, 6, -6, 1, 5);
    R(CREAM, 3, -1, 4, 1);
    R(CREAM, -2, -1, 4, 1);
    // La cabeza sigue a un pez cuando mira la pecera.
    let tilt = 0;
    let gaze = 0;
    if (lookAt && watching) {
      tilt = lookAt.y < this.y - 80 ? -1 : 1;
      gaze = tilt;
    }
    if (cat.behavior === 'groom') tilt = Math.floor(seconds * 3) % 2 === 0 ? 2 : 1;
    const closed = purring || cat.behavior === 'groom' || (blink && !watching);
    head(2, -27 + tilt, closed ? 'closed' : 'open', gaze);
    b.flush(g, dim);
    const fur = dim(FUR);
    const belly = dim(CREAM);
    if (pose === 'tap') {
      // La pata contra el vidrio.
      const reach = Math.max(6, Math.abs(Math.round(tank.x / PX) - x) - 2);
      const jab = Math.floor(seconds * 6) % 2;
      g.rect(d > 0 ? x + 4 : x - 4 - reach + jab, y - 12, reach - jab, 2).fill(fur);
      g.rect(d > 0 ? x + 2 + reach - jab : x - 4 - reach + jab, y - 13, 2, 4).fill(belly);
    }

    // Globito: lo que "dice".
    const say = purring
      ? texts.cat.purr
      : cat.behavior === 'beg_food'
        ? texts.cat.hungry
        : '';
    if (say && Math.floor(seconds * 2) % 3 !== 0) {
      drawPixelText(g, say, x - Math.round(textWidth(say) / 2), y - 40, dim(0xf4e9c8), 1);
    }
  }
}
