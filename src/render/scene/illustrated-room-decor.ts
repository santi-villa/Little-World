import { Container, FillGradient, Graphics, MeshPlane, Sprite } from 'pixi.js';
import { tex } from '../assets';
import { lerpColor } from '../pixel-utils';
import { softPool } from '../tank/illustrated-optics';
import { surfaceSlope } from '../motion/water-light';
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
  private readonly wallLight = new Container();
  private readonly wallMask = new Graphics().poly([
    575, 0, 1036, 0, 1036, 403, 979, 416, 218, 416, 218, 283, 575, 283,
  ]).fill(0xffffff);
  private readonly tankGlow = new Graphics();
  private readonly tableLight = new Container();
  private readonly tableGlow = new Graphics();
  private readonly tableMask = new Graphics().poly([356, 416, 922, 416, 966, 447, 316, 447]).fill(0xffffff);
  private readonly moonlight = new Graphics();
  private lit = -1;
  private warm = -1;
  private readonly lampGlow = new Graphics();
  private readonly sunlight = new Graphics();
  private readonly lamp = new Sprite(tex('brass-lamp'));
  private readonly notebook = new Sprite(tex('objeto-cuaderno'));
  private readonly occlusion = softPool('#39271c');
  private readonly aqua = softPool('#b5dab9');
  private readonly edgeLight = new Graphics();
  private readonly spillRibbons = Array.from({ length: 4 }, () =>
    new Graphics().ellipse(0, 0, 1, 1).fill(this.aqua));
  private readonly wallBloom = new Graphics().ellipse(0, 0, 1, 1).fill(this.aqua);
  private footprint = '';

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
    this.lampGlow.ellipse(this.lamp.x + 9, this.lamp.y - this.lamp.height * 0.65, 135, 103)
      .fill(softPool('#ffc47b'));
    this.sunlight.ellipse(434, 268, 246, 172).fill(softPool('#fdf1c3'));
    this.sunlight.poly([184, 133, 503, 130, 762, 445, 439, 452]).fill(new FillGradient({
      start: { x: 0, y: 0 }, end: { x: 0.88, y: 1 },
      colorStops: [{ offset: 0, color: '#ffe5ab00' }, { offset: 0.56, color: '#ffe5ab1e' }, { offset: 1, color: '#ffe5ab00' }],
    }));
    this.moonlight.ellipse(353, 222, 262, 216).fill(softPool('#8ea9db'));
    this.wallLight.addChild(this.tankGlow, this.wallBloom);
    this.wallLight.mask = this.wallMask;
    this.tableLight.addChild(this.tableGlow, ...this.spillRibbons);
    this.tableLight.mask = this.tableMask;
    this.edgeLight.moveTo(539, 270).bezierCurveTo(552, 269, 568, 267, 575, 262)
      .stroke({ color: 0xb4d2bb, width: 1.8, alpha: 0.27 });
    this.edgeLight.moveTo(781, 447).bezierCurveTo(828, 447, 898, 445.7, 919, 444.4)
      .stroke({ color: 0xc5e1c2, width: 1.15, alpha: 0.41 });
    this.wallLight.blendMode = 'add';
    this.tableLight.blendMode = 'add';
    this.container.addChildAt(props, 0);
    this.container.addChild(this.lamp, this.notebook, this.sunlight, this.moonlight, this.lampGlow, this.wallMask, this.wallLight, this.tableMask, this.tableLight, this.edgeLight, this.table);
  }

  update(tank: TankRect, seconds: number, dt: number, tint: number, light: number, tankLit: boolean, lampOn: boolean, breeze: number) {
    for (const p of this.plants) {
      p.pot.tint = p.mesh.tint = tint;
      const sway = Math.sin(seconds * 0.47 + p.spec.phase) * p.spec.amount * breeze;
      for (let i = 0; i < p.positions.length; i += 2) {
        const row = Math.floor(i / (COLS * 2));
        const free = (1 - row / (ROWS - 1)) ** 1.8;
        const leaf = Math.sin(seconds * 0.71 + p.spec.phase * 1.8 + (i / 2 % COLS) * 0.63) * 0.33;
        p.positions[i] = p.rest[i]! + ((sway + leaf) * free) / p.mesh.scale.x;
      }
      p.buffer.update();
    }
    const fade = 1 - Math.exp(-dt * 2.6);
    this.lit = this.lit < 0 ? Number(tankLit) : this.lit + (Number(tankLit) - this.lit) * fade;
    this.warm = this.warm < 0 ? Number(lampOn) : this.warm + (Number(lampOn) - this.warm) * fade;
    this.lamp.tint = lerpColor(tint, 0xffd6a8, this.warm * 0.54);
    this.notebook.tint = tint;
    this.lampGlow.alpha = this.warm * (0.12 + (1 - light) * 0.33);
    this.sunlight.alpha = light * 0.29;
    this.moonlight.alpha = (1 - light) * 0.16;
    const dusk = 1 - light;
    const active = this.lit * (0.12 + dusk * 0.88);
    const cx = tank.x + tank.width / 2, base = tank.y + tank.height;
    // Match the drift of the waterline and keep the reflected motion local.
    // Only the transforms and opacity change each frame.
    const sway = surfaceSlope(0.48, seconds);
    this.tankGlow.alpha = active * 0.24;
    this.tableGlow.alpha = active * 0.41;
    this.wallBloom.alpha = active * (0.071 + sway * 0.21);
    this.wallBloom.position.set(cx + tank.width * (0.39 + sway * 0.39), tank.y + tank.height * 0.31);
    this.wallBloom.scale.set(tank.width * 0.39, tank.height * 0.65);
    this.edgeLight.alpha = active * 0.46;
    for (const [i, ribbon] of this.spillRibbons.entries()) {
      const u = 0.21 + i * 0.19;
      const drift = surfaceSlope(u, seconds);
      ribbon.position.set(tank.x + tank.width * (u + drift * 0.24), base + 2.6 + i % 2 * 2);
      ribbon.scale.set(tank.width * (0.14 + 0.023 * i), 6 + i);
      ribbon.alpha = active * (0.12 + drift * 0.49);
    }
    const key = [tank.x, tank.y, tank.width, tank.height].join();
    if (key === this.footprint) return;
    this.footprint = key;
    this.tankGlow.clear()
      .ellipse(cx, tank.y + tank.height * 0.41, tank.width * 0.71, tank.height * 0.88).fill(this.aqua);
    this.tableGlow.clear()
      .ellipse(cx + 3, base + 2, tank.width * 0.64, 23).fill(this.aqua);
    this.table.clear()
      .ellipse(cx + 8, base - 2, tank.width * 0.55, 10).fill({ fill: this.occlusion, alpha: 0.46 })
      .ellipse(cx, base - 1, tank.width * 0.47, 4.6).fill({ fill: this.occlusion, alpha: 0.68 });
  }
}
