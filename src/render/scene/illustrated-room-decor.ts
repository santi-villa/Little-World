import { Container, Graphics, MeshPlane, Sprite } from 'pixi.js';
import { tex } from '../assets';
import { lerpColor } from '../pixel-utils';
import { softPool } from '../tank/illustrated-optics';
import type { TankRect } from '../tank/tank-layout';

export const illustratedRoom = {
  window: { x: 183, y: 0, width: 350, height: 239 },
  windowFocus: { x: 357, y: 191, zoom: 1.5 },
  bird: { x: 264, y: 223 },
  cat: { x: 888, y: 689 },
  lamp: { x: 67, y: 507, height: 79 },
  notebook: { x: 106, y: 380, width: 32 },
  transition: 0.66,
} as const;

const plantSpecs = [
  { foliage: 'sage-foliage', pot: 'ivory-pot', x: 74, y: 123, width: 49, leaves: 76, phase: 1.4, amount: 0.72 },
  { foliage: 'trailing-foliage', pot: 'clay-pot', x: 1195, y: 132, width: 54, leaves: 86, phase: 3.7, amount: 1.09 },
] as const;

const COLS = 4;
const ROWS = 8;

function createPlant(spec: typeof plantSpecs[number]) {
  const pot = new Sprite(tex(spec.pot));
  pot.anchor.set(0.5, 1);
  pot.scale.set(spec.width / pot.texture.width);
  pot.position.set(spec.x, spec.y);
  const texture = tex(spec.foliage);
  const mesh = new MeshPlane({ texture, verticesX: COLS, verticesY: ROWS });
  const scale = spec.leaves / texture.width;
  mesh.scale.set(scale);
  // Stem tips meet the soil opening. The bottom row of the mesh never moves.
  mesh.position.set(spec.x - spec.leaves / 2, spec.y - pot.height * 0.81 - texture.height * scale);
  const buffer = mesh.geometry.getAttribute('aPosition').buffer;
  const positions = buffer.data as Float32Array;
  return { spec, pot, mesh, buffer, positions, rest: positions.slice() };
}

export class IllustratedRoomDecor {
  readonly container = new Container();
  private readonly plants = plantSpecs.map(createPlant);
  private readonly table = new Graphics();
  private readonly tankGlow = new Graphics();
  private readonly lampGlow = new Graphics();
  private readonly sunlight = new Graphics();
  private readonly lamp = new Sprite(tex('brass-lamp'));
  private readonly notebook = new Sprite(tex('objeto-cuaderno'));
  private readonly occlusion = softPool('#39271c');
  private readonly aqua = softPool('#b5dab9');
  private name = '';

  constructor() {
    const props = new Graphics();
    for (const { spec, pot, mesh } of this.plants) {
      props.ellipse(spec.x + 2, spec.y - 0.5, spec.width * 0.63, 3.2)
        .fill({ fill: this.occlusion, alpha: 0.65 });
      this.container.addChild(pot, mesh);
    }
    this.lamp.anchor.set(0.5, 1);
    this.lamp.scale.set(illustratedRoom.lamp.height / this.lamp.texture.height);
    this.lamp.position.copyFrom(illustratedRoom.lamp);
    this.notebook.texture.source.scaleMode = 'linear';
    this.notebook.anchor.set(0.5, 1);
    this.notebook.scale.set(illustratedRoom.notebook.width / this.notebook.texture.width);
    this.notebook.position.copyFrom(illustratedRoom.notebook);
    props.ellipse(this.lamp.x + 2, this.lamp.y - 1, this.lamp.width * 0.54, 3)
      .fill({ fill: this.occlusion, alpha: 0.65 });
    this.lampGlow.ellipse(this.lamp.x, this.lamp.y - this.lamp.height * 0.72, 102, 86)
      .fill(softPool('#ffc47b'));
    this.sunlight.ellipse(538, 394, 310, 223).fill(softPool('#fdf1c3'));
    this.sunlight.rotation = -0.09;
    this.container.addChildAt(props, 0);
    this.container.addChild(this.lamp, this.notebook, this.sunlight, this.lampGlow, this.tankGlow, this.table);
  }

  update(tank: TankRect, seconds: number, tint: number, light: number, tankLit: boolean, lampOn: boolean, breeze: number) {
    for (const p of this.plants) {
      p.pot.tint = p.mesh.tint = tint;
      const sway = (Math.sin(seconds * 0.66 + p.spec.phase) + 0.33 * Math.sin(seconds * 1.07 + p.spec.phase * 1.7))
        * p.spec.amount * breeze;
      for (let i = 0; i < p.positions.length; i += 2) {
        const row = Math.floor(i / (COLS * 2));
        const free = (1 - row / (ROWS - 1)) ** 1.8;
        p.positions[i] = p.rest[i]! + (sway * free) / p.mesh.scale.x;
      }
      p.buffer.update();
    }
    this.lamp.tint = lerpColor(tint, 0xffd6a8, lampOn ? 0.47 : 0);
    this.notebook.tint = tint;
    this.lampGlow.alpha = lampOn ? 0.17 + (1 - light) * 0.24 : 0;
    this.sunlight.alpha = light * 0.17;
    this.tankGlow.alpha = tankLit ? 0.1 + (1 - light) * 0.19 : 0;
    const key = [tank.x, tank.y, tank.width, tank.height].join();
    if (key === this.name) return;
    this.name = key;
    const cx = tank.x + tank.width / 2, base = tank.y + tank.height;
    this.tankGlow.clear()
      .ellipse(cx, tank.y + tank.height * 0.34, tank.width * 0.69, tank.height * 0.76).fill(this.aqua)
      .ellipse(cx, base - 3, tank.width * 0.63, 13).fill(this.aqua);
    this.table.clear()
      .ellipse(cx + 8, base - 4, tank.width * 0.53, 10).fill({ fill: this.occlusion, alpha: 0.46 })
      .ellipse(cx, base - 1.5, tank.width * 0.49, 3.8).fill({ fill: this.occlusion, alpha: 0.68 });
  }
}
