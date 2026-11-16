/**
 * El gato: sprites de un atigrado naranja (hoja gato-alternativa.jpg). La
 * simulación dice qué hace y en qué lugar está; acá se lo lleva caminando
 * hasta ahí y se elige la animación: durmiendo enroscado, sentado moviendo la
 * cola (también mirando a los peces), caminando (hacia la izquierda, el
 * sprite espejado), lamiéndose la pata o tocando el vidrio.
 */

import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { CatSpot, SimState } from '../../sim';
import { lerpColor } from '../pixel-utils';
import { asset, tex } from '../assets';
import { TANK_BASE_Y, type TankRect } from '../tank/tank-layout';
import { drawPixelText, textWidth } from '../ui/pixel-font';
import { texts } from '../ui/texts';
import { GAME_WIDTH } from '../viewport';
import { BED, BOWL, CAT_SCALE, FLOOR_X, GROUND_Y, SUNBEAM, WINDOWSILL } from './scene-layout';

const WALK_SPEED = 160; // píxeles de la escena por segundo

type Anim = 'dormir' | 'sentado' | 'caminar' | 'lamer' | 'tocar';

/** Cuadros de cada animación (salen de `npm run assets`, hoja gato-alternativa.jpg). */
function loadFrames(anim: string): Texture[] {
  const frames: Texture[] = [];
  for (let n = 1; asset(`gato-${anim}-${n}`); n++) frames.push(tex(`gato-${anim}-${n}`));
  return frames.length > 0 ? frames : [Texture.EMPTY];
}

export class CatView {
  readonly container = new Container();
  /** El gato: un sprite con los cuadros de la animación que toca. */
  private readonly sprite = new Sprite();
  /** Globito y zetas, con letra de 2 px. */
  private readonly graphics = new Graphics();
  private readonly frames: Record<Anim, Texture[]>;
  private anim: Anim = 'sentado';
  private animStart = 0;
  private x = 640;
  private y = GROUND_Y;
  private facing: 1 | -1 = 1;
  private placed = false;
  private wanderX = 640;
  private wanderUntil = 0;

  constructor() {
    const lick = loadFrames('lamer');
    this.frames = {
      dormir: loadFrames('dormir'),
      sentado: loadFrames('sentado'),
      caminar: loadFrames('caminar'),
      lamer: lick,
      // Tocar el vidrio: la pata levantada, va y viene.
      tocar: lick.slice(0, 2),
    };
    this.sprite.anchor.set(0.5, 1);
    this.graphics.scale.set(2);
    this.container.addChild(this.sprite, this.graphics);
  }

  /** Dónde está el gato ahora, en píxeles de la escena (las patas). */
  get position(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  /** Rectángulo que ocupa, en píxeles de la escena (para tocarlo). */
  get rect(): { x: number; y: number; width: number; height: number } {
    const w = Math.max(60, this.sprite.width);
    const h = Math.max(50, this.sprite.height);
    return { x: this.x - w / 2, y: this.y - h, width: w, height: h + 8 };
  }

  /** ¿El punto (en píxeles de la escena) toca al gato? */
  hit(sceneX: number, sceneY: number): boolean {
    const r = this.rect;
    return sceneX >= r.x && sceneX <= r.x + r.width && sceneY >= r.y && sceneY <= r.y + r.height;
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
        return { x: tank.x - 50, y: TANK_BASE_Y, facing: 1 };
      case 'windowsill':
        return { ...WINDOWSILL, facing: 1 };
      case 'bowl':
        return { x: BOWL.x + 64, y: GROUND_Y, facing: -1 };
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

    // Qué animación va según lo que hace (los estados son los de la simulación).
    let anim: Anim = 'sentado';
    let fps = 3;
    if (moving || playing) {
      anim = 'caminar';
      fps = playing ? 14 : 10;
    } else if (cat.behavior === 'sleep') {
      anim = 'dormir';
      fps = 0.8; // respira
    } else if (cat.behavior === 'groom') {
      anim = 'lamer';
      fps = 4;
    } else if (cat.behavior === 'tap_glass') {
      anim = 'tocar';
      fps = 3;
    } else if (cat.behavior === 'watch_fish') {
      fps = 6; // la cola se mueve más rápido mirando a los peces
    }
    if (anim !== this.anim) {
      this.anim = anim;
      this.animStart = seconds;
    }
    const frames = this.frames[anim];
    const frame = frames[Math.floor((seconds - this.animStart) * fps) % frames.length] ?? frames[0];
    const sprite = this.sprite;
    sprite.visible = this.x <= GAME_WIDTH + 60;
    if (frame) sprite.texture = frame;
    sprite.scale.set(this.facing * CAT_SCALE, CAT_SCALE);
    sprite.position.set(Math.round(this.x), Math.round(this.y));
    sprite.tint = lerpColor(0x4a5272, 0xffffff, daylight);

    // Globito y zetas: lo que "dice" (letra de 2 px, nunca más gorda que el fondo).
    const g = this.graphics;
    g.clear();
    if (!sprite.visible) return;
    const ink = lerpColor(0x8a90a8, 0xf4e9c8, daylight);
    const top = Math.round((this.y - sprite.height) / 2);
    const cx = Math.round(this.x / 2);
    if (anim === 'dormir') {
      const drift = Math.floor(seconds * 2) % 6;
      drawPixelText(g, 'z', cx + this.facing * 22, top - 4 - drift, ink, 1);
      return;
    }
    const say =
      cat.behavior === 'purr' ? texts.cat.purr : cat.behavior === 'beg_food' ? texts.cat.hungry : '';
    if (say && Math.floor(seconds * 2) % 3 !== 0) {
      drawPixelText(g, say, cx - Math.round(textWidth(say) / 2), top - 10, ink, 1);
    }
    void lookAt;
  }
}
