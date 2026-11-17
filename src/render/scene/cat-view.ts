import { ambientTint } from '../art-direction';
/** Sleeping cat with a cosmetic heart response to petting. */
import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { asset, tex } from '../assets';
import { lerpColor } from '../pixel-utils';
import { drawPixelText } from '../ui/pixel-font';
import { BED, CAT_SCALE } from './scene-layout';

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

export class CatView {
  readonly container = new Container();
  private readonly sprite = new Sprite();
  private readonly graphics = new Graphics();
  private readonly clip = loadClip('dormir');
  private pettedAt = -100;
  constructor() {
    this.graphics.scale.set(2);
    this.container.addChild(this.sprite, this.graphics);
  }
  pet(seconds: number): void { this.pettedAt = seconds; }
  get position(): { x: number; y: number } { return BED; }
  get rect(): { x: number; y: number; width: number; height: number } {
    const w = Math.max(70, this.sprite.width), h = Math.max(60, this.sprite.height);
    return { x: BED.x - w / 2, y: BED.y - h, width: w, height: h + 8 };
  }
  hit(x: number, y: number): boolean {
    const r = this.rect;
    return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
  }
  update(daylight: number, seconds: number): void {
    const clip = this.clip, sprite = this.sprite;
    sprite.texture = clip.frames[Math.floor(seconds * clip.fps) % clip.frames.length] ?? Texture.EMPTY;
    sprite.anchor.set(clip.anchor.x, clip.anchor.y);
    sprite.scale.set(CAT_SCALE);
    sprite.position.set(BED.x, BED.y);
    sprite.tint = ambientTint(daylight);
    const g = this.graphics;
    g.clear();
    const top = Math.round((BED.y - sprite.height) / 2), cx = Math.round(BED.x / 2);
    if (seconds - this.pettedAt < 4) drawHearts(g, cx, top - 2, seconds - this.pettedAt, daylight);
    else drawPixelText(g, 'z', cx + 24, top - 4 - Math.floor(seconds * 2) % 6,
      lerpColor(0x8a90a8, 0xf4e9c8, daylight), 1);
  }
}
