import { Container, MeshPlane, type Texture } from 'pixi.js';
import {
  IllustratedBettaPose, projectIllustratedPoint, skinBettaPoint, type IllustratedInput,
} from '../motion/illustrated-betta-pose';
import type { CompanionProfile } from '../motion/illustrated-companions';
import type { IllustratedFishRenderer } from './illustrated-fish-renderer';

const COLS = 24;
const ROWS = 9;
const LENGTH = 120;
const clampUnit = (x: number) => Math.max(0, Math.min(1, x));

/** Continuous skin over one painted animal. Both sides share the original PNG. */
export class IllustratedCompanion implements IllustratedFishRenderer {
  readonly container = new Container();
  private readonly pose: IllustratedBettaPose;
  private readonly profile: CompanionProfile;
  private readonly sides: readonly [MeshPlane, MeshPlane];
  private readonly height: number;

  constructor(id: number, facing: number, species: string, texture: Texture, profile: CompanionProfile) {
    this.container.label = `illustrated-${species}-${id}`;
    this.profile = profile;
    this.pose = new IllustratedBettaPose(facing, id, profile);
    this.height = (texture.height / texture.width) * LENGTH;
    this.sides = [
      new MeshPlane({ texture, verticesX: COLS, verticesY: ROWS }),
      new MeshPlane({ texture, verticesX: COLS, verticesY: ROWS }),
    ];
    this.container.addChild(...this.sides);
  }

  update(input: IllustratedInput, x: number, y: number, length: number, dt: number, _lit: boolean, damage = 0) {
    const pose = this.pose;
    pose.update(dt, input);
    this.container.position.set(x, y);
    const scale = length / LENGTH;
    this.container.scale.set(scale, input.alive ? scale : -scale);
    const cos = Math.cos(pose.yaw);
    const rig = { head: 30, body: 7, rear: -15, tail: this.profile.tailJoin, blendWidth: 8 };
    const coreHeight = this.height * 0.32;

    for (const [index, mesh] of this.sides.entries()) {
      const side = index === 0 ? -1 : 1;
      mesh.alpha = clampUnit(0.5 - side * cos * 2.45);
      mesh.visible = mesh.alpha > 0.002;
      if (!mesh.visible) continue;
      const buffer = mesh.geometry.getAttribute('aPosition').buffer;
      const data = buffer.data as Float32Array;
      for (let row = 0; row < ROWS; row++) {
        const v = row / (ROWS - 1);
        for (let col = 0; col < COLS; col++) {
          const u = col / (COLS - 1);
          const i = (row * COLS + col) * 2;
          const px = (u - 0.5) * LENGTH;
          const py = (v - this.profile.spine) * this.height;
          const freeTail = clampUnit((rig.tail - px) / (rig.tail + LENGTH * 0.5));
          const tailFlex = pose.fin('tail', freeTail);
          const tip = Math.abs(py) / coreHeight;
          const membrane = Math.max(0, tip - 0.5) * (1 - freeTail);
          const freePectoral = Math.max(0, 1 - Math.abs(u - 0.74) * 7) * clampUnit((v - 0.57) * 4);
          const finY = tailFlex * 0.23 + pose.fin(py < 0 ? 'dorsal' : 'anal', clampUnit(membrane)) * 0.18
            + pose.pectoral * freePectoral * 2;
          // The tapered spine twists during a turn. Fins bend locally without
          // moving the eye and without seams at their roots.
          const coreWidth = Math.sin(Math.PI * clampUnit((u - 0.18) / 0.83)) ** 0.66;
          const thickness = this.profile.thickness * coreWidth * Math.sqrt(Math.max(0.025, 1 - tip * tip));
          const skinned = skinBettaPoint(
            px + Math.max(0, u - 0.88) * pose.nibble * 3.3,
            py * (1 - freeTail * damage * 0.19) + finY + pose.tail * freeTail ** 1.65 * 24,
            pose, rig,
          );
          const point = projectIllustratedPoint({ ...skinned, z: side * thickness + tailFlex * 0.62 }, pose);
          data[i] = point.x;
          data[i + 1] = point.y;
        }
      }
      buffer.update();
    }
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
