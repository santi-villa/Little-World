import { Container, Graphics, MeshPlane, Rectangle, Texture } from "pixi.js";
import config from "../../data/illustrated-betta.json";
import {
  IllustratedBettaPose,
  skinBettaPoint,
  projectIllustratedPoint,
  type IllustratedInput,
  type FinName,
} from "../motion/illustrated-betta-pose";
import type { IllustratedArtPart } from "./illustrated-betta-art";

type PartName =
  "front" | "head" | "body" | "rear" | FinName | "pectoral" | "operculum";
interface Part {
  mesh: MeshPlane;
  kind: PartName;
  side: number;
  left: number;
  top: number;
  width: number;
  height: number;
  columns: number;
  rows: number;
  depth: number;
  order: number;
}
/** Painted articulated experiment; never owns a FishMotion, behavior state or simulation. */
export class IllustratedBetta {
  readonly container = new Container();
  readonly pose: IllustratedBettaPose;
  private readonly parts: Part[] = [];
  private readonly owned: Texture[] = [];
  private readonly pelvic = new Graphics();
  private readonly guides = new Graphics();
  private readonly view = new Container();
  private showGuides = false;
  constructor(
    seed: number,
    facing: number,
    art: Readonly<Record<IllustratedArtPart, Texture>>,
  ) {
    this.container.label = "illustrated-fish-" + seed;
    this.pose = new IllustratedBettaPose(facing, seed);
    this.container.addChild(this.view);
    this.view.addChild(this.pelvic, this.guides);
    const add = (
      kind: PartName,
      texture: Texture,
      left: number,
      top: number,
      width: number,
      height: number,
      columns: number,
      rows: number,
      side = 0,
    ) => {
      const mesh = new MeshPlane({
        texture,
        verticesX: columns,
        verticesY: rows,
      });
      mesh.autoResize = false;
      mesh.label = "betta-" + kind + (side ? "-" + side : "");
      const part = {
        mesh,
        kind,
        side,
        left,
        top,
        width,
        height,
        columns,
        rows,
        depth: 0,
        order: this.parts.length,
      };
      this.parts.push(part);
      this.view.addChild(mesh);
    };
    add("front", art.front, -5.25, -11.75, 10.5, 14, 12, 12);
    add("tail", art.tail, -66, -25.2, 51.5, 52, 18, 13);
    add("dorsal", art.dorsal, -32, -29, 55, 22, 18, 8);
    add("anal", art.anal, -32, 6.5, 61, 27, 18, 9);
    for (const side of [-1, 1]) {
      for (const [kind, from, to] of [
        ["rear", 0, 0.43],
        ["body", 0.36, 0.79],
        ["head", 0.73, 1],
      ] as const) {
        const base = art.body.frame,
          start = Math.floor(from * base.width),
          end = Math.ceil(to * base.width);
        const texture = new Texture({
          source: art.body.source,
          frame: new Rectangle(
            base.x + start,
            base.y,
            end - start,
            base.height,
          ),
        });
        this.owned.push(texture);
        add(
          kind,
          texture,
          -18 + (start / base.width) * 72,
          -10.5,
          ((end - start) / base.width) * 72,
          21,
          12,
          8,
          side,
        );
      }
      add("operculum", art.operculum, 22, -7.5, 12, 16, 8, 7, side);
      add("pectoral", art.pectoral, 10.5, -1, 16, 14, 10, 9, side);
    }
  }
  setGuides(value: boolean): void {
    this.showGuides = value;
  }
  update(
    input: IllustratedInput,
    x: number,
    y: number,
    length: number,
    dt: number,
    lit: boolean,
    damage = 0,
  ): void {
    this.pose.update(dt, input);
    const p = this.pose;
    this.container.position.set(x, y);
    this.container.scale.set(length / config.referenceLength);
    this.view.scale.y = input.alive ? 1 : -1;
    this.container.tint = input.alive ? (lit ? 0xffffff : 0x8297ac) : 0x91969b;
    const cos = Math.cos(p.yaw);
    for (const part of this.parts) {
      const { mesh, kind, side } = part;
      const sideAlpha = side
        ? Math.max(0, Math.min(1, 0.5 - side * cos * 3))
        : 1;
      mesh.alpha =
        kind === "front"
          ? Math.max(0, 1 - Math.abs(cos) / 0.55)
          : kind === "pectoral"
            ? 0.35 + 0.45 * sideAlpha
            : kind === "operculum"
              ? sideAlpha * 0.88
              : sideAlpha;
      mesh.visible = mesh.alpha > 0.001;
      if (!mesh.visible) continue;
      const buffer = mesh.geometry.getAttribute("aPosition").buffer,
        data = buffer.data as Float32Array;
      let depth = 0;
      for (let row = 0; row < part.rows; row++)
        for (let col = 0; col < part.columns; col++) {
          const u = col / (part.columns - 1),
            v = row / (part.rows - 1),
            index = (row * part.columns + col) * 2;
          let px = part.left + u * part.width,
            py = part.top + v * part.height,
            z = 0;
          if (kind === "tail") {
            const free = 1 - u,
              fin = p.fin("tail", free),
              a = p.tail;
            const localX = px - config.rig.tail,
              localY = py * (1 + 0.08 * p.flare) * (1 - 0.28 * damage);
            const root = skinBettaPoint(config.rig.tail, 0, p);
            px = root.x + localX * Math.cos(a) - localY * Math.sin(a);
            py =
              root.y + localX * Math.sin(a) + localY * Math.cos(a) + fin * 0.26;
            z = fin + Math.sin(p.phase - v * 2.2) * free * free * p.effort * 2;
          } else {
            if (kind === "front") {
              z = px;
              px = 42 + Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2)) * 4;
            } else if (kind === "dorsal" || kind === "anal") {
              const free = kind === "dorsal" ? 1 - v : v,
                fin = p.fin(kind, free);
              py += (kind === "dorsal" ? -1 : 1) * free * p.flare * 2;
              py += fin * 0.22;
              z = fin + Math.sin(p.phase - u * 3) * free * free * p.effort;
              py =
                kind === "dorsal"
                  ? -7 + (py + 7) * (1 - 0.2 * damage)
                  : 6.5 + (py - 6.5) * (1 - 0.2 * damage);
            } else if (kind === "pectoral") {
              const a = p.pectoral * side,
                dx = px - 26,
                dy = py - 1;
              px = 26 + dx * Math.cos(a) - dy * Math.sin(a);
              py = 1 + dx * Math.sin(a) + dy * Math.cos(a);
              z =
                side *
                (5 +
                  (1 - u) *
                    (3 + Math.sin(p.seconds * 6 + side) * p.effort * 2));
            } else if (kind === "operculum") {
              const a = (p.breath * 0.025 + p.flare * 0.12) * side,
                dx = px - 33,
                dy = py + 6;
              px = 33 + dx * Math.cos(a) - dy * Math.sin(a);
              py = -6 + dx * Math.sin(a) + dy * Math.cos(a);
              z = side * (5 + p.breath * 0.3 + p.flare * 1.7);
            } else {
              const axial = Math.max(0, Math.min(1, (px + 18) / 72));
              const thickness =
                (2.4 + 3.5 * Math.sin(Math.PI * axial)) *
                Math.sqrt(Math.max(0.02, 1 - (py / 12) ** 2));
              z = side * thickness;
              if (kind === "head" && px > 43) px += p.nibble * 0.65;
            }
            const bent = skinBettaPoint(px, py, p);
            px = bent.x;
            py = bent.y;
          }
          const point = projectIllustratedPoint({ x: px, y: py, z }, p);
          data[index] = point.x;
          data[index + 1] = point.y;
          depth += point.z;
        }
      part.depth = depth / (part.rows * part.columns);
      buffer.update();
    }
    // Order membrane surfaces and bilateral anatomy as yaw crosses the camera.
    const order = this.parts
      .filter((part) => part.mesh.visible)
      .sort((a, b) => b.depth - a.depth || a.order - b.order);
    order.forEach((part, i) => {
      part.mesh.zIndex = i;
    });
    this.view.sortableChildren = true;
    this.pelvic.clear();
    this.pelvic.zIndex = order.length + 1;
    for (const side of [-1, 1]) {
      const a = projectIllustratedPoint(
          { ...skinBettaPoint(23, 7, p), z: side * 4 },
          p,
        ),
        b = projectIllustratedPoint(
          {
            ...skinBettaPoint(16, 19, p),
            z: side * 5 + p.fin("anal", 0.5) * 0.5,
          },
          p,
        ),
        c = projectIllustratedPoint(
          {
            ...skinBettaPoint(10 + Math.sin(p.phase) * p.effort, 31, p),
            z: side * 5 + p.fin("anal", 1) * 0.4,
          },
          p,
        );
      this.pelvic
        .moveTo(a.x, a.y)
        .quadraticCurveTo(b.x, b.y, c.x, c.y)
        .stroke({ color: 0xcf8d96, width: 0.85, alpha: 0.8 });
    }
    this.guides.clear();
    this.guides.zIndex = order.length + 2;
    this.guides.visible = this.showGuides;
    if (this.showGuides)
      for (const joint of [
        config.rig.head,
        config.rig.body,
        config.rig.rear,
        config.rig.tail,
      ]) {
        const point = projectIllustratedPoint(
          { ...skinBettaPoint(joint, 0, p), z: 0 },
          p,
        );
        this.guides
          .circle(point.x, point.y, 1.4)
          .stroke({ color: 0xffe0a0, width: 0.45 });
      }
  }
  destroy(): void {
    this.container.destroy({ children: true });
    for (const texture of this.owned) texture.destroy(false);
  }
}
