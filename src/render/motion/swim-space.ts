import visual from '../../data/aquarium-visual.json';
import type { HabitatSolid } from './solid-contact';
import type { Bounds, Vec } from './steering';

export interface SwimPoint extends Vec { plane: number }
export interface SwimBody extends SwimPoint { vx: number; vy: number }

export function swimProjection(p: SwimPoint, bounds: Bounds, bottomDweller: boolean): Vec {
  const far = (2 - p.plane) / 2;
  return {
    x: bounds.width / 2 + (p.x - bounds.width / 2) * (1 - far * visual.depthScale * 0.25),
    y: p.y - far * bounds.height * (bottomDweller ? 0.018 : 0.07),
  };
}

/** Hardscape uses the same PNG silhouette as food, with a hull around the fish's body. */
export class SwimSpace {
  constructor(private readonly bounds: Bounds, private readonly solids: readonly HabitatSolid[] = []) {}

  clear(p: SwimPoint, cm: number, bottomDweller: boolean): boolean {
    if (p.x < 0 || p.x > this.bounds.width || p.y < 0 || p.y > this.bounds.height || p.plane < 0 || p.plane > 2) return false;
    if (!this.solids.length) return true;

    const projected = swimProjection(p, this.bounds, bottomDweller);
    const x = projected.x / this.bounds.width, y = projected.y / this.bounds.height;
    const radiusX = Math.max(0.06, cm * 0.27) / this.bounds.width;
    const radiusY = Math.max(0.04, cm * 0.135) / this.bounds.height;
    for (const s of this.solids) {
      if (Math.abs(p.plane / 2 - s.z) > s.depth / 2 + 0.044 ||
          x + radiusX < s.x || x - radiusX > s.x + s.width ||
          y + radiusY < s.y || y - radiusY > s.y + s.height) continue;

      const cellWidth = s.width / s.columns, cellHeight = s.height / s.rows;
      const c0 = Math.max(0, Math.floor((x - radiusX - s.x) / cellWidth));
      const c1 = Math.min(s.columns - 1, Math.floor((x + radiusX - s.x) / cellWidth));
      const r0 = Math.max(0, Math.floor((y - radiusY - s.y) / cellHeight));
      const r1 = Math.min(s.rows - 1, Math.floor((y + radiusY - s.y) / cellHeight));
      for (let row = r0; row <= r1; row++) {
        const y0 = s.y + row * cellHeight;
        const dy = Math.max(y0 - y, y - (y0 + cellHeight), 0) / radiusY;
        for (let col = c0; col <= c1; col++) {
          if (!s.alpha[row * s.columns + col]) continue;
          const x0 = s.x + col * cellWidth;
          const dx = Math.max(x0 - x, x - (x0 + cellWidth), 0) / radiusX;
          if (dx * dx + dy * dy <= 1) return false;
        }
      }
    }
    return true;
  }

  /** Scan shortly ahead rather than pushing a fish to the edge of a rock. */
  steer(body: SwimPoint, desired: Vec, cm: number, bottomDweller: boolean): Vec {
    const speed = Math.hypot(desired.x, desired.y);
    if (speed < 0.07 || !this.solids.length) return desired;
    const sx = desired.x / speed, sy = desired.y / speed;
    const reach = Math.max(cm * 0.42, speed * 0.82);
    const startingClear = this.clear(body, cm, bottomDweller);
    const probe = (x: number, y: number, distance: number) =>
      this.clear({ x: body.x + x * distance, y: body.y + y * distance, plane: body.plane }, cm, bottomDweller);
    const available = (x: number, y: number) => startingClear
      ? probe(x, y, reach * 0.44) && probe(x, y, reach)
      : probe(x, y, reach) || probe(x, y, reach * 2.1);
    if (available(sx, sy)) return desired;

    const turn = Math.atan2(sy, sx);
    // Bottom fish favor passing along the sand over climbing steeply.
    let best: Vec | undefined, bestCost = Infinity;
    for (const angle of [0.64, -0.64, 1.21, -1.21, 1.88, -1.88]) {
      const x = Math.cos(turn + angle), y = Math.sin(turn + angle);
      if (!available(x, y)) continue;
      const cost = Math.abs(angle) + (bottomDweller ? Math.max(0, -y) * 0.5 : Math.abs(y) * 0.11);
      if (cost < bestCost) {
        bestCost = cost;
        best = { x: x * speed * 0.76, y: y * speed * 0.76 };
      }
    }
    return best ?? { x: -sx * speed * 0.56, y: -sy * speed * 0.56 };
  }

  /** Continuous contact at walking speed: stop at the surface, then slide. */
  constrain(from: SwimPoint, body: SwimBody, cm: number, bottomDweller: boolean): void {
    const end: SwimPoint = {
      x: Math.max(0, Math.min(this.bounds.width, body.x)),
      y: Math.max(0, Math.min(this.bounds.height, body.y)),
      plane: Math.max(0, Math.min(2, body.plane)),
    };
    const between = (t: number) => ({
      x: from.x + (end.x - from.x) * t,
      y: from.y + (end.y - from.y) * t,
      plane: from.plane + (end.plane - from.plane) * t,
    });
    // A profile changed by the player can appear over an existing fish. Let it
    // swim out under its own velocity, preserving the same position continuity.
    if (!this.clear(from, cm, bottomDweller)) { Object.assign(body, end); return; }
    let lo = 0;
    let hi = 1;
    const distance = Math.hypot(end.x - from.x, end.y - from.y);
    const probes = Math.min(32, Math.max(2, Math.ceil(distance / Math.max(0.09, cm * 0.11))));
    let blocked = false;
    for (let i = 1; i <= probes; i++) {
      const t = i / probes;
      if (!this.clear(between(t), cm, bottomDweller)) { hi = t; blocked = true; break; }
      lo = t;
    }
    if (!blocked) { Object.assign(body, end); return; }
    for (let i = 0; i < 5; i++) {
      const t = (lo + hi) * 0.5;
      if (this.clear(between(t), cm, bottomDweller)) lo = t;
      else hi = t;
    }
    const point = between(lo);
    const slideX = { ...point, x: end.x };
    if (Math.abs(slideX.x - point.x) <= cm * 0.16 && this.clear(slideX, cm, bottomDweller)) point.x = slideX.x;
    else body.vx *= 0.35;
    const slideY = { ...point, y: end.y };
    if (Math.abs(slideY.y - point.y) <= cm * 0.16 && this.clear(slideY, cm, bottomDweller)) point.y = slideY.y;
    else body.vy *= 0.35;
    const slideDepth = { ...point, plane: end.plane };
    if (this.clear(slideDepth, cm, bottomDweller)) point.plane = slideDepth.plane;
    Object.assign(body, point);
  }
}
