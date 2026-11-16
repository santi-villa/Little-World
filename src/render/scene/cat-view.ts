/**
 * El gato: animaciones sacadas de los videos (`npm run assets`, carpeta
 * gato/videos). La simulación dice qué hace y en qué lugar está; acá se lo
 * lleva caminando hasta ahí y se elige la animación.
 *
 * Nunca salta de pose: cada animación en bucle pertenece a una pose (dormido,
 * sentado, caminando, echado, panza arriba, comiendo) y para pasar de una pose
 * a otra se encadenan las transiciones de los videos (despertar, pararse,
 * sentarse, echarse...), buscando el camino más corto entre poses.
 * Caminando hacia la izquierda, el sprite se espeja.
 */

import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { CatSpot, SimState } from '../../sim';
import { asset, tex } from '../assets';
import { lerpColor } from '../pixel-utils';
import { TANK_BASE_Y, type TankRect } from '../tank/tank-layout';
import { drawPixelText, textWidth } from '../ui/pixel-font';
import { texts } from '../ui/texts';
import { GAME_WIDTH } from '../viewport';
import { BED, BOWL, CAT_SCALE, FLOOR_X, GROUND_Y, SUNBEAM, WINDOWSILL } from './scene-layout';

/** Píxeles de la escena por segundo al caminar (acompaña el paso de la animación). */
const WALK_SPEED = 75;
/** Cuánto duran los mimos después de la última caricia. */
const PET_SECONDS = 4;

type Pose = 'sleep' | 'sit' | 'walk' | 'loaf' | 'belly' | 'eat';

/** Animaciones en bucle y su pose. */
const LOOPS: Record<string, Pose> = {
  dormir: 'sleep',
  sentado: 'sit',
  cola: 'sit',
  mimos: 'sit',
  lavarse: 'sit',
  caminar: 'walk',
  loaf: 'loaf',
  panza: 'belly',
  comer: 'eat',
};

/** Transiciones entre poses: qué animaciones se encadenan. */
const TRANSITIONS: { from: Pose; to: Pose; clips: string[]; chance?: number }[] = [
  { from: 'sleep', to: 'sit', clips: ['despertar'] },
  { from: 'sit', to: 'sleep', clips: ['acostarse'] },
  // A veces, antes de ponerse a caminar, se estira y bosteza.
  { from: 'sit', to: 'walk', clips: ['estirarse', 'bostezar'], chance: 0.25 },
  { from: 'sit', to: 'walk', clips: ['pararse'] },
  { from: 'walk', to: 'sit', clips: ['sentarse'] },
  { from: 'walk', to: 'loaf', clips: ['echarse'] },
  { from: 'loaf', to: 'sit', clips: ['levantarse'] },
  { from: 'sit', to: 'belly', clips: ['rodar'] },
  { from: 'belly', to: 'sit', clips: ['incorporarse'] },
  { from: 'sit', to: 'eat', clips: ['agacharse'] },
  { from: 'eat', to: 'sit', clips: ['erguirse'] },
];

interface Clip {
  frames: Texture[];
  fps: number;
  /** Punto de apoyo (las patas), en fracción del cuadro. */
  anchor: { x: number; y: number };
}

function loadClip(name: string): Clip {
  const entry = asset(`gato-${name}`);
  const texture = tex(`gato-${name}`);
  if (!entry?.frames || !entry.frameWidth || !entry.frameHeight) {
    return { frames: [Texture.EMPTY], fps: 1, anchor: { x: 0.5, y: 1 } };
  }
  const frames: Texture[] = [];
  for (let k = 0; k < entry.frames; k++) {
    frames.push(
      new Texture({
        source: texture.source,
        frame: new Rectangle(k * entry.frameWidth, 0, entry.frameWidth, entry.frameHeight),
      }),
    );
  }
  const a = entry.anchor ?? { x: entry.frameWidth / 2, y: entry.frameHeight };
  return { frames, fps: entry.fps ?? 12, anchor: { x: a.x / entry.frameWidth, y: a.y / entry.frameHeight } };
}

/** Corazón de 5x4 píxeles. */
const HEART = ['.#.#.', '#####', '.###.', '..#..'];

/**
 * Tres corazoncitos que suben desde la cabeza del gato, se mecen un poco y se
 * desvanecen; cada uno con su desfase. Coordenadas en píxeles de 2.
 */
function drawHearts(g: Graphics, cx: number, top: number, seconds: number, daylight: number): void {
  const color = lerpColor(0x8a4a6a, 0xff6b8a, daylight);
  const shine = lerpColor(0x9a7a8a, 0xffd0dc, daylight);
  for (let k = 0; k < 3; k++) {
    const life = 1.8;
    const t = ((seconds + k * 0.6) % life) / life;
    const x = cx - 2 + (k - 1) * 6 + Math.round(Math.sin(seconds * 2.2 + k * 2) * 1.5);
    const y = top - Math.round(t * 14);
    const alpha = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
    HEART.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) if (row[c] === '#') g.rect(x + c, y + r, 1, 1);
    });
    g.fill({ color, alpha });
    g.rect(x + 1, y + 1, 1, 1).fill({ color: shine, alpha });
  }
}

/** Camino más corto de poses (lista de transiciones). */
function route(from: Pose, to: Pose): (typeof TRANSITIONS)[number][] {
  if (from === to) return [];
  const prev = new Map<Pose, (typeof TRANSITIONS)[number]>();
  const queue: Pose[] = [from];
  const seen = new Set<Pose>([from]);
  while (queue.length) {
    const pose = queue.shift() as Pose;
    for (const t of TRANSITIONS) {
      if (t.from !== pose || seen.has(t.to)) continue;
      seen.add(t.to);
      prev.set(t.to, t);
      if (t.to === to) {
        const path: (typeof TRANSITIONS)[number][] = [];
        let at: Pose = to;
        while (at !== from) {
          const step = prev.get(at) as (typeof TRANSITIONS)[number];
          path.unshift(step);
          at = step.from;
        }
        return path;
      }
      queue.push(t.to);
    }
  }
  return [];
}

export class CatView {
  readonly container = new Container();
  private readonly sprite = new Sprite();
  /** Globito y zetas, con letra de 2 px. */
  private readonly graphics = new Graphics();
  private readonly clips = new Map<string, Clip>();
  private x = 640;
  private y = GROUND_Y;
  private facing: 1 | -1 = 1;
  private placed = false;
  private wanderX = 640;
  private wanderUntil = 0;
  /** Lo que se está mostrando: la animación, desde cuándo, y lo que sigue. */
  private current = 'sentado';
  private currentStart = 0;
  private queue: string[] = [];
  private pose: Pose = 'sit';
  private pettedAt = -100;

  constructor() {
    for (const name of [...Object.keys(LOOPS), ...TRANSITIONS.flatMap((t) => t.clips)]) {
      if (!this.clips.has(name)) this.clips.set(name, loadClip(name));
    }
    this.graphics.scale.set(2);
    this.container.addChild(this.sprite, this.graphics);
  }

  /** Lo acariciaron: pasa a los mimos. */
  pet(seconds: number): void {
    this.pettedAt = seconds;
  }

  /** Dónde está el gato ahora, en píxeles de la escena (las patas). */
  get position(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  /** Rectángulo que ocupa, en píxeles de la escena (para tocarlo). */
  get rect(): { x: number; y: number; width: number; height: number } {
    const b = this.sprite.getBounds();
    const w = Math.max(70, b.width);
    const h = Math.max(60, b.height);
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

  /** ¿Ya terminó la animación que se está mostrando? (los bucles nunca terminan). */
  private finished(seconds: number): boolean {
    if (LOOPS[this.current]) return false;
    const clip = this.clips.get(this.current) as Clip;
    return (seconds - this.currentStart) * clip.fps >= clip.frames.length;
  }

  private play(name: string, seconds: number): void {
    this.current = name;
    this.currentStart = seconds;
  }

  /**
   * Avanza hacia la animación pedida sin saltar de pose: si es de otra pose,
   * primero encadena las transiciones.
   */
  private advance(wantPose: Pose, wantLoop: string, seconds: number): void {
    // Una transición en curso se termina siempre.
    if (!LOOPS[this.current]) {
      if (!this.finished(seconds)) return;
      const next = this.queue.shift();
      if (next) {
        this.play(next, seconds);
        return;
      }
    }
    if (this.pose === wantPose) {
      if (this.current !== wantLoop) this.play(wantLoop, seconds);
      return;
    }
    const path = route(this.pose, wantPose);
    const step = path[0];
    if (!step) {
      // No hay camino (no debería pasar): se queda donde está.
      if (!LOOPS[this.current]) this.play(Object.keys(LOOPS).find((k) => LOOPS[k] === this.pose) ?? 'sentado', seconds);
      return;
    }
    // Entre las transiciones posibles de esa pose a la siguiente, a veces una más larga.
    const options = TRANSITIONS.filter((t) => t.from === step.from && t.to === step.to);
    const chosen = options.find((t) => t.chance !== undefined && Math.random() < t.chance) ?? options.find((t) => t.chance === undefined) ?? step;
    this.pose = chosen.to;
    this.queue = chosen.clips.slice(1);
    this.play(chosen.clips[0] as string, seconds);
  }

  update(
    state: SimState,
    tank: TankRect,
    daylight: number,
    seconds: number,
    dtSeconds: number,
    bird: { x: number; y: number } | null,
  ): void {
    const cat = state.cat;
    const playing = cat.behavior === 'play';
    const target = this.spotPosition(cat.spot, tank, playing, seconds);
    if (!this.placed) {
      this.x = target.x;
      this.y = target.y;
      this.placed = true;
      if (cat.behavior === 'sleep') {
        this.pose = 'sleep';
        this.play('dormir', seconds);
      }
    }
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const needsToWalk = distance > 2;

    // Qué pose y qué bucle pide lo que está haciendo.
    const petted = seconds - this.pettedAt < PET_SECONDS;
    let wantPose: Pose = 'sit';
    let wantLoop = 'sentado';
    if (needsToWalk || playing) {
      wantPose = 'walk';
      wantLoop = 'caminar';
    } else if (cat.behavior === 'sleep') {
      wantPose = 'sleep';
      wantLoop = 'dormir';
    } else if (cat.behavior === 'purr') {
      // Mimos largos: panza arriba.
      wantPose = 'belly';
      wantLoop = 'panza';
    } else if (petted) {
      wantLoop = 'mimos';
    } else if (cat.behavior === 'eat') {
      wantPose = 'eat';
      wantLoop = 'comer';
    } else if (cat.behavior === 'groom') {
      wantLoop = 'lavarse';
    } else if (cat.behavior === 'sulk') {
      wantPose = 'loaf';
      wantLoop = 'loaf';
    } else if (cat.behavior === 'watch_fish' || cat.behavior === 'tap_glass' || cat.behavior === 'look_window' || bird) {
      // Mirando algo: la cola se mueve.
      wantLoop = 'cola';
    }

    // Mira al pájaro si está despierto y quieto.
    if (bird && this.pose === 'sit' && !needsToWalk) this.facing = bird.x >= this.x ? 1 : -1;

    // Antes de caminar se da vuelta hacia donde va.
    if (needsToWalk && Math.abs(dx) > 0.5 && this.pose !== 'walk') this.facing = dx > 0 ? 1 : -1;
    this.advance(wantPose, wantLoop, seconds);

    // Solo se mueve con la animación de caminar (nada de deslizarse sentado).
    if (this.current === 'caminar' && needsToWalk) {
      const step = WALK_SPEED * (playing || cat.behavior === 'sulk' ? 1.5 : 1) * Math.min(0.1, dtSeconds);
      const k = Math.min(1, step / distance);
      this.x += dx * k;
      this.y += dy * k;
      if (Math.abs(dx) > 0.5) this.facing = dx > 0 ? 1 : -1;
    } else if (!needsToWalk && target.facing && this.pose !== 'walk' && !bird) {
      this.facing = target.facing;
    }

    // Cuadro actual.
    const clip = this.clips.get(this.current) as Clip;
    const index = Math.floor((seconds - this.currentStart) * clip.fps);
    const frame = LOOPS[this.current] ? index % clip.frames.length : Math.min(index, clip.frames.length - 1);
    const sprite = this.sprite;
    sprite.texture = clip.frames[frame] ?? clip.frames[0] ?? Texture.EMPTY;
    sprite.anchor.set(clip.anchor.x, clip.anchor.y);
    sprite.texture.source.scaleMode = 'nearest';
    sprite.scale.set(this.facing * CAT_SCALE, CAT_SCALE);
    // En píxeles enteros del dibujo del gato (múltiplos de su escala): no se deforma al moverse.
    sprite.position.set(Math.round(this.x / CAT_SCALE) * CAT_SCALE, Math.round(this.y / CAT_SCALE) * CAT_SCALE);
    sprite.visible = this.x <= GAME_WIDTH + 60;
    sprite.tint = lerpColor(0x4a5272, 0xffffff, daylight);

    // Zetas, corazoncitos y globito: en píxeles de 2 (los mismos que el gato).
    const g = this.graphics;
    g.clear();
    if (!sprite.visible) return;
    const ink = lerpColor(0x8a90a8, 0xf4e9c8, daylight);
    const top = Math.round((this.y - sprite.height) / 2);
    const cx = Math.round(this.x / 2);
    if (this.current === 'dormir') {
      const drift = Math.floor(seconds * 2) % 6;
      drawPixelText(g, 'z', cx + this.facing * 24, top - 4 - drift, ink, 1);
      return;
    }
    // Ronroneando o recién acariciado: corazoncitos que suben y se desvanecen.
    if (cat.behavior === 'purr' || seconds - this.pettedAt < PET_SECONDS) {
      drawHearts(g, cx, top - 2, seconds, daylight);
      return;
    }
    if (cat.behavior === 'beg_food' && Math.floor(seconds * 2) % 3 !== 0) {
      const say = texts.cat.hungry;
      drawPixelText(g, say, cx - Math.round(textWidth(say) / 2), top - 10, ink, 1);
    }
  }
}
