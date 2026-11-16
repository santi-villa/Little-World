/**
 * El gato, dibujado con formas simples (placeholder). La simulación dice qué
 * hace y en qué lugar está; acá se lo lleva caminando hasta ahí y se elige la
 * pose.
 */

import { Container, Graphics } from 'pixi.js';
import type { CatSpot, SimState } from '../../sim';
import { lerpColor } from '../pixel-utils';
import { TANK_BASE_Y, type TankRect } from '../tank/tank-layout';
import { drawPixelText, textWidth } from '../ui/pixel-font';
import { texts } from '../ui/texts';
import { GAME_WIDTH } from '../viewport';
import { BED, BOWL, FURNITURE_MARGIN, GROUND_Y, SUNBEAM, WINDOW } from './scene-layout';

const FUR = 0xd98b3a;
const FUR_DARK = 0xa8621f;
const BELLY = 0xf3d9b1;
const WALK_SPEED = 80; // píxeles por segundo
const NIGHT = 0x1a1f33;

type Pose = 'sit' | 'sleep' | 'walk' | 'eat' | 'tap';

export class CatView {
  readonly container = new Container();
  private readonly graphics = new Graphics();
  private x = 320;
  private y = GROUND_Y;
  private facing: 1 | -1 = 1;
  private placed = false;
  private wanderX = 320;
  private wanderUntil = 0;

  constructor() {
    this.container.addChild(this.graphics);
  }

  /** ¿El punto (en píxeles de la escena) toca al gato? */
  hit(sceneX: number, sceneY: number): boolean {
    return Math.abs(sceneX - this.x) <= 18 && sceneY <= this.y + 4 && sceneY >= this.y - 30;
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
        return { x: tank.x + Math.round(tank.width / 2), y: tank.y - 14 };
      case 'tank_front':
        return { x: tank.x - Math.round(FURNITURE_MARGIN / 2) - 4, y: TANK_BASE_Y, facing: 1 };
      case 'windowsill':
        return { x: WINDOW.x + WINDOW.width / 2, y: WINDOW.y + WINDOW.height + 4, facing: -1 };
      case 'bowl':
        return { x: BOWL.x - 22, y: GROUND_Y, facing: 1 };
      case 'away':
        return { x: GAME_WIDTH + 60, y: GROUND_Y };
      case 'floor':
      default:
        // Paseando o jugando va de un lado a otro del piso.
        if (seconds >= this.wanderUntil) {
          this.wanderX = 170 + Math.random() * 300;
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
    if (this.x > GAME_WIDTH + 30) return;
    const dim = (color: number): number => lerpColor(lerpColor(color, NIGHT, 0.55), color, daylight);
    const fur = dim(FUR);
    const dark = dim(FUR_DARK);
    const belly = dim(BELLY);
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    const d = this.facing;
    const purring = cat.behavior === 'purr';

    if (pose === 'sleep') {
      // Hecho un bollito.
      const breath = Math.sin(seconds * 1.5) > 0 ? 1 : 0;
      g.rect(x - 11, y - 7 - breath, 22, 7 + breath).rect(x - 9, y - 9 - breath, 18, 2).fill(fur);
      g.rect(x - 11, y - 2, 22, 2).fill(dark); // la cola lo rodea
      g.rect(x + d * 5 - 4, y - 8, 8, 6).fill(fur); // cabeza apoyada
      g.rect(x + d * 5 - 4, y - 10, 2, 2).rect(x + d * 5 + 2, y - 10, 2, 2).fill(dark);
      g.rect(x + d * 5 - 2, y - 5, 2, 1).rect(x + d * 5 + 1, y - 5, 2, 1).fill(0x2a1a0c); // ojos cerrados
      const drift = Math.floor(seconds * 2) % 6;
      drawPixelText(g, 'z', x + d * 12, y - 18 - drift, dim(0xdfe6f7), 1);
      return;
    }

    if (pose === 'walk' || pose === 'eat') {
      const bounce = playing && !moving ? Math.abs(Math.round(Math.sin(seconds * 9) * 3)) : 0;
      const by = y - bounce;
      const stride = moving || playing ? Math.floor(seconds * 8) % 2 : 0;
      // Patas.
      g.rect(x - 8, by - 5, 2, 5 - stride)
        .rect(x - 4, by - 5, 2, 4 + stride)
        .rect(x + 3, by - 5, 2, 5 - stride)
        .rect(x + 7, by - 5, 2, 4 + stride)
        .fill(dark);
      g.rect(x - 10, by - 13, 20, 8).fill(fur);
      g.rect(x - 8, by - 6, 16, 1).fill(belly);
      // Cola levantada.
      g.rect(x - d * 11 - 1, by - 19, 2, 8).rect(x - d * 12 - 1 + (stride ? d : 0), by - 21, 2, 3).fill(dark);
      const headY = pose === 'eat' ? by - 10 : by - 20;
      this.drawHead(g, x + d * 10, headY, d, fur, dark, purring);
      return;
    }

    // Sentado (mirando, pidiendo, lavándose, ronroneando, tocando el vidrio).
    g.rect(x - 6, y - 14, 12, 14).fill(fur);
    g.rect(x - 3 + d * 2, y - 11, 5, 9).fill(belly);
    g.rect(x - 7, y - 3, 14, 3).fill(fur);
    const wag = Math.sin(seconds * (cat.behavior === 'watch_fish' ? 7 : 2)) > 0 ? 1 : 0;
    g.rect(x - d * 13 + (d > 0 ? 0 : -1), y - 2 - wag, 8, 2).rect(x - d * 14, y - 4 - wag * 2, 2, 3).fill(dark);
    // La cabeza sigue a un pez cuando mira la pecera.
    let tilt = 0;
    if (lookAt && cat.behavior === 'watch_fish') tilt = lookAt.y < y - 40 ? -1 : 1;
    if (cat.behavior === 'groom') tilt = Math.floor(seconds * 3) % 2 === 0 ? 2 : 1;
    this.drawHead(g, x + d * 3, y - 22 + tilt, d, fur, dark, purring);
    if (pose === 'tap') {
      // La pata contra el vidrio.
      const reach = Math.max(6, Math.abs(tank.x - x) - 2);
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
      drawPixelText(g, say, x - Math.round(textWidth(say) / 2), y - 36, dim(0xf4e9c8), 1);
    }
  }

  private drawHead(
    g: Graphics,
    cx: number,
    top: number,
    d: 1 | -1,
    fur: number,
    dark: number,
    happy: boolean,
  ): void {
    g.rect(cx - 5, top, 10, 8).fill(fur);
    g.rect(cx - 5, top - 2, 3, 2).rect(cx + 2, top - 2, 3, 2).fill(dark); // orejas
    const eyeY = top + 3;
    if (happy) {
      g.rect(cx - 3 + d, eyeY, 2, 1).rect(cx + 1 + d, eyeY, 2, 1).fill(0x2a1a0c);
    } else {
      g.rect(cx - 3 + d, eyeY - 1, 1, 2).rect(cx + 2 + d, eyeY - 1, 1, 2).fill(0x1c2a14);
    }
    g.rect(cx + d, top + 5, 1, 1).fill(0xe58a8a); // nariz
  }
}
