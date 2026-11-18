import { Container, Graphics, Matrix } from "pixi.js";
import type { SimState, DerivedValues } from "../../sim";
import type { TankView } from "../tank/tank-view";
import { ViewBlend } from "../motion/view-transition";
import {
  hybridGeometry,
  createHybridConfig,
  insidePolygon,
  unprojectPoint,
  projectPoint,
  type Point2,
} from "../motion/hybrid-tank-geometry";
/** One existing TankView on one projected front, not a second aquarium or a rendered screenshot. */
export class HybridTank {
  readonly container = new Container();
  readonly config = createHybridConfig();
  private readonly shadow = new Graphics();
  private readonly glow = new Graphics();
  private readonly back = new Graphics();
  private readonly reflection = new Graphics();
  private readonly focus = new ViewBlend();
  private focused = false;
  private geometry: ReturnType<typeof hybridGeometry> | undefined;
  private _frames = 0;
  constructor(private readonly tank: TankView) {
    this.container.label = "hybrid-tank-presentation";
    this.glow.blendMode = "add";
    this.reflection.blendMode = "add";
    this.container.addChild(
      this.shadow,
      this.glow,
      this.back,
      tank.container,
      this.reflection,
    );
  }
  get active() {
    return this.config.mode === "hybrid" && !this.tank.isRound;
  }
  get progress() {
    return this.focus.value;
  }
  get moving() {
    return this.active && this.focus.moving;
  }
  get ready() {
    return (
      !this.active || (this.focused && !this.moving && this.progress === 1)
    );
  }
  get duration() {
    return this.config.transition.seconds;
  }
  get roomDim() {
    return this.active ? this.config.appearance.roomDim * this.progress : 0;
  }
  get bounds() {
    return this.active && this.geometry
      ? this.geometry.bounds
      : this.tank.bounds;
  }
  get metrics() {
    return {
      mode: this.active ? "hybrid" : "current",
      near: this.progress,
      frames: this._frames,
      liveTankViews: 1,
      offscreenPasses: 0,
      renderTextures: 0,
    };
  }
  setFocus(near: boolean): void {
    this.focused = near;
    if (this.active) this.focus.set(near ? 1 : 0, this.duration);
    else this.focus.snap(near ? 1 : 0);
  }
  toTankPoint(p: Point2): Point2 {
    return this.active && this.geometry
      ? unprojectPoint(p, this.geometry.matrix)
      : p;
  }
  contains(p: Point2): boolean {
    const g = this.geometry;
    return (
      !!g &&
      (insidePolygon(p, g.front) ||
        insidePolygon(p, g.right) ||
        insidePolygon(p, g.top))
    );
  }
  update(state: SimState, derived: DerivedValues, dt: number): void {
    this._frames++;
    if (!this.active) {
      this.focus.snap(this.focused ? 1 : 0);
      this.geometry = undefined;
      this.shadow.clear();
      this.glow.clear();
      this.back.clear();
      this.reflection.clear();
      this.tank.container.setFromMatrix(new Matrix());
      return;
    }
    this.focus.set(this.focused ? 1 : 0, this.duration);
    this.focus.update(dt);
    const r = this.tank.bounds,
      w = this.tank.waterBounds,
      c = this.config,
      g = hybridGeometry(
        r,
        state.tank.widthCm / state.tank.lengthCm,
        this.focus.value,
        c,
      );
    this.geometry = g;
    const { a, b, tx, ty, d } = g.matrix;
    this.tank.container.setFromMatrix(new Matrix(a, b, 0, d, tx, ty));
    this.shadow.clear();
    this.glow.clear();
    this.back.clear();
    this.reflection.clear();
    const add = (p: Point2) => ({
        x: p.x + g.extrusion.x,
        y: p.y + g.extrusion.y,
      }),
      flat = (points: Point2[]) => points.flatMap((p) => [p.x, p.y]);
    const room = g.room,
      lit = derived.lightOn,
      ink = this.back,
      front = g.front;
    const baseX = (front[3]!.x + front[2]!.x + g.extrusion.x * 0.5) / 2,
      baseY = (front[3]!.y + front[2]!.y) / 2;
    for (let i = 0; i < 3; i++)
      this.shadow
        .ellipse(
          baseX,
          baseY + 2 + i * 0.5,
          r.width * (0.51 - i * 0.018),
          3 + i * 2,
        )
        .fill({ color: 0x142225, alpha: room * (0.14 - i * 0.035) });
    if (lit) {
      for (let i = 0; i < 3; i++)
        this.glow
          .ellipse(baseX, baseY - 2, r.width * (0.5 + i * 0.1), 5 + i * 5)
          .fill({
            color: this.tank.waterColor(true, state.water.tannins, 0.3),
            alpha: c.appearance.illumination * room * (0.12 - i * 0.025),
          });
    }
    const glassTop = projectPoint(
      {
        x: r.x + r.width,
        y: state.tank.hasLid ? r.y + r.height * c.geometry.capBottom : w.y,
      },
      g.matrix,
    );
    ink
      .poly(flat([glassTop, add(glassTop), add(front[2]!), front[2]!]))
      .fill({ color: lit ? 0x426c6d : 0x152f39, alpha: 0.72 * room });
    const waterRight = w.x + w.width;
    for (let i = 0; i < 10; i++) {
      const p = projectPoint(
          { x: waterRight, y: w.y + (w.height * i) / 10 },
          g.matrix,
        ),
        q = projectPoint(
          { x: waterRight, y: w.y + (w.height * (i + 1)) / 10 },
          g.matrix,
        );
      ink.poly(flat([p, add(p), add(q), q])).fill({
        color: this.tank.waterColor(lit, state.water.tannins, i / 10),
        alpha: 0.86 * room,
      });
    }
    const surface = [
      projectPoint({ x: w.x, y: w.y }, g.matrix),
      projectPoint({ x: waterRight, y: w.y }, g.matrix),
    ];
    ink
      .poly(
        flat([surface[0]!, add(surface[0]!), add(surface[1]!), surface[1]!]),
      )
      .fill({
        color: this.tank.waterColor(lit, state.water.tannins, 0.05),
        alpha: 0.72 * room,
      });
    ink
      .moveTo(surface[1]!.x, surface[1]!.y)
      .lineTo(add(surface[1]!).x, add(surface[1]!).y)
      .stroke({ color: 0xb6ded1, alpha: 0.4 * room, width: 1 });
    // The cap and base belong to the shell; the original front rim remains on the live face.
    const lidLift = state.tank.hasLid ? 0 : r.height * c.geometry.lidLift;
    const capLeft = projectPoint(
        { x: r.x, y: r.y + r.height * c.geometry.capTop - lidLift },
        g.matrix,
      ),
      capRight = projectPoint(
        { x: r.x + r.width, y: r.y + r.height * c.geometry.capTop - lidLift },
        g.matrix,
      );
    const capBottom = projectPoint(
      { x: r.x + r.width, y: r.y + r.height * c.geometry.capBottom - lidLift },
      g.matrix,
    );
    const lid = [capLeft, add(capLeft), add(capRight), capRight];
    ink
      .poly(flat([capRight, add(capRight), add(capBottom), capBottom]))
      .fill({ color: 0x26333e, alpha: room });
    ink
      .poly(flat(lid))
      .fill({ color: lit ? 0x303b45 : 0x172532, alpha: room })
      .stroke({ color: 0x617078, width: 1, alpha: 0.65 * room });
    for (let i = 0; i < 5; i++) {
      const t = 0.2 + i * 0.12,
        p = {
          x: lid[0]!.x + (lid[3]!.x - lid[0]!.x) * t,
          y: lid[0]!.y + (lid[3]!.y - lid[0]!.y) * t,
        };
      ink
        .moveTo(p.x + g.extrusion.x * 0.25, p.y + g.extrusion.y * 0.25)
        .lineTo(p.x + g.extrusion.x * 0.7, p.y + g.extrusion.y * 0.7)
        .stroke({ color: 0x101b24, width: 2, alpha: room });
    }
    const rim = Math.max(2, r.height * c.geometry.rim),
      rightBase = [
        front[2]!,
        g.back[2]!,
        { x: g.back[2]!.x, y: g.back[2]!.y - rim },
        { x: front[2]!.x, y: front[2]!.y - rim },
      ];
    ink.poly(flat(rightBase)).fill({ color: 0x1d2933, alpha: room });
    ink
      .moveTo(glassTop.x, glassTop.y)
      .lineTo(add(glassTop).x, add(glassTop).y)
      .lineTo(g.back[2]!.x, g.back[2]!.y)
      .lineTo(front[2]!.x, front[2]!.y)
      .stroke({
        color: lit ? 0xc0d6cf : 0x547b8b,
        width: Math.max(1, r.width * c.geometry.glassThickness),
        alpha: 0.55 * room,
      });
    const reflect = c.appearance.reflection * room * (lit ? 1 : 0.4);
    const sideTop = surface[1]!,
      sideBottom = projectPoint({ x: waterRight, y: w.y + w.height }, g.matrix);
    ink
      .poly(
        flat([
          {
            x: sideTop.x + g.extrusion.x * 0.25,
            y: sideTop.y + g.extrusion.y * 0.25,
          },
          {
            x: sideTop.x + g.extrusion.x * 0.4,
            y: sideTop.y + g.extrusion.y * 0.4,
          },
          {
            x: sideBottom.x + g.extrusion.x * 0.7,
            y: sideBottom.y + g.extrusion.y * 0.7,
          },
          {
            x: sideBottom.x + g.extrusion.x * 0.55,
            y: sideBottom.y + g.extrusion.y * 0.55,
          },
        ]),
      )
      .fill({ color: 0xd8efe4, alpha: reflect * 0.27 });
    // The hand-off is an identity transform, masked only by a very restrained glint.
    const pulse =
      Math.sin(Math.PI * this.progress) * c.appearance.transitionGlint;
    const q0 = projectPoint({ x: w.x + w.width * 0.1, y: w.y }, g.matrix),
      q1 = projectPoint({ x: w.x + w.width * 0.25, y: w.y }, g.matrix),
      q2 = projectPoint(
        { x: w.x + w.width * 0.15, y: w.y + w.height },
        g.matrix,
      ),
      q3 = projectPoint(
        { x: w.x + w.width * 0.1, y: w.y + w.height },
        g.matrix,
      );
    this.reflection
      .poly(flat([q0, q1, q2, q3]))
      .fill({ color: 0xc9e3da, alpha: pulse + reflect * 0.05 });
  }
  destroy(): void {
    this.tank.container.setFromMatrix(new Matrix());
    this.container.removeChild(this.tank.container);
    this.container.destroy({ children: true });
  }
}
