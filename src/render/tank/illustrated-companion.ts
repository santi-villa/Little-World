import { Container, MeshPlane, type Texture } from 'pixi.js';
import {
  IllustratedBettaPose, projectIllustratedPoint, skinBettaPoint, type IllustratedInput,
} from '../motion/illustrated-betta-pose';
import type { CompanionProfile } from '../motion/illustrated-companions';
import type { IllustratedFishRenderer } from './illustrated-fish-renderer';

const COLS = 24;
const ROWS = 9;
const LENGTH = 120;
interface MeshPoint { x: number; y: number; tail: number; membrane: number; pectoral: number; thickness: number }
const clampUnit = (x: number) => Math.max(0, Math.min(1, x));

/** Continuous skin over one painted animal. Both sides share the original PNG. */
export class IllustratedCompanion implements IllustratedFishRenderer {
  readonly container = new Container();
  private readonly pose: IllustratedBettaPose;
  private readonly sides: readonly [MeshPlane, MeshPlane];
  private readonly model: MeshPoint[] = [];
  private readonly rig: Parameters<typeof skinBettaPoint>[3];

  constructor(id: number, facing: number, species: string, texture: Texture, profile: CompanionProfile) {
    this.container.label = `illustrated-${species}-${id}`;
    this.pose = new IllustratedBettaPose(facing, id, profile);
    this.rig = { head: 30, body: 7, rear: -15, tail: profile.tailJoin, blendWidth: 8 };
    const height = (texture.height / texture.width) * LENGTH;
    for (let row = 0; row < ROWS; row++) {
      const v = row / (ROWS - 1);
      const y = (v - profile.spine) * height;
      const tip = Math.abs(y) / (height * 0.32);
      for (let col = 0; col < COLS; col++) {
        const u = col / (COLS - 1);
        const x = (u - 0.5) * LENGTH;
        const tail = clampUnit((profile.tailJoin - x) / (profile.tailJoin + LENGTH * 0.5));
        const coreWidth = Math.sin(Math.PI * clampUnit((u - 0.18) / 0.83)) ** 0.66;
        this.model.push({ x, y, tail,
          membrane: clampUnit(Math.max(0, tip - 0.5) * (1 - tail)),
          pectoral: Math.max(0, 1 - Math.abs(u - 0.74) * 7) * clampUnit((v - 0.57) * 4),
          thickness: profile.thickness * coreWidth * Math.sqrt(Math.max(0.025, 1 - tip * tip)),
        });
      }
    }
    this.sides = [
      new MeshPlane({ texture, verticesX: COLS, verticesY: ROWS }),
      new MeshPlane({ texture, verticesX: COLS, verticesY: ROWS }),
    ];
    this.container.addChild(...this.sides);
  }

  update(input: IllustratedInput, x: number, y: number, length: number, dt: number, _lit: boolean, damage = 0) {
    const pose = this.pose;
    pose.update(dt, input);
    const scale = length / LENGTH;
    this.container.position.set(x, y + pose.bob * scale);
    this.container.scale.set(scale, input.alive ? scale : -scale);
    const cos = Math.cos(pose.yaw);

    for (const [index, mesh] of this.sides.entries()) {
      const side = index === 0 ? -1 : 1;
      mesh.alpha = clampUnit(0.5 - side * cos * 2.45);
      mesh.visible = mesh.alpha > 0.002;
      if (!mesh.visible) continue;
      const buffer = mesh.geometry.getAttribute('aPosition').buffer;
      const data = buffer.data as Float32Array;
      for (let i = 0; i < this.model.length; i++) {
        const p = this.model[i]!;
        const tailFlex = pose.fin('tail', p.tail);
        const finY = tailFlex * 0.23 + pose.fin(p.y < 0 ? 'dorsal' : 'anal', p.membrane) * 0.18
          + pose.pectoral * p.pectoral * 2;
        const skinned = skinBettaPoint(
          p.x + Math.max(0, p.x - LENGTH * 0.38) / LENGTH * pose.nibble * 3.3,
          p.y * (1 - p.tail * damage * 0.19) + finY + pose.tail * p.tail ** 1.65 * 24,
          pose, this.rig,
        );
        const point = projectIllustratedPoint({ ...skinned, z: side * p.thickness + tailFlex * 0.62 }, pose);
        data[i * 2] = point.x;
        data[i * 2 + 1] = point.y;
      }
      buffer.update();
    }
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
