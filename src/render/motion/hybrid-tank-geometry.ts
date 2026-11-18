import defaults from "../../data/hybrid-tank.json";
import type { TankRect } from "../tank/tank-layout";
export interface HybridConfig {
  mode: "current" | "hybrid";
  referenceWidth: number;
  placement: { x: number; y: number; scale: number };
  geometry: {
    depth: number;
    angleDeg: number;
    surfacePitch: number;
    frontSlope: number;
    rim: number;
    glassThickness: number;
    capTop: number;
    capBottom: number;
    lidLift: number;
  };
  appearance: {
    reflection: number;
    illumination: number;
    roomDim: number;
    transitionGlint: number;
  };
  transition: { seconds: number };
}
export const createHybridConfig = (): HybridConfig =>
  structuredClone(defaults) as HybridConfig;
export interface Point2 {
  x: number;
  y: number;
}
export interface Affine2 {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}
export const identityAffine = (): Affine2 => ({
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  tx: 0,
  ty: 0,
});
export function projectPoint(p: Point2, m: Affine2): Point2 {
  return { x: m.a * p.x + m.c * p.y + m.tx, y: m.b * p.x + m.d * p.y + m.ty };
}
export function unprojectPoint(p: Point2, m: Affine2): Point2 {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-8) return { ...p };
  const x = p.x - m.tx,
    y = p.y - m.ty;
  return { x: (m.d * x - m.c * y) / det, y: (m.a * y - m.b * x) / det };
}
export function rectPoints(r: TankRect): Point2[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ];
}
export function pointBounds(points: readonly Point2[]): TankRect {
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y),
    x = Math.min(...xs),
    y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
export function insidePolygon(p: Point2, polygon: readonly Point2[]): boolean {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!,
      b = polygon[(i + 1) % polygon.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  if (Math.abs(area) < 1e-7) return false;
  let sign = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!,
      b = polygon[(i + 1) % polygon.length]!,
      cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(cross) < 1e-7) continue;
    const s = Math.sign(cross);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}
/** One affine front plus depth slabs. No fictional side view of the fish. */
export function hybridGeometry(
  r: TankRect,
  physicalDepthRatio: number,
  near: number,
  config: HybridConfig,
) {
  const room = 1 - Math.max(0, Math.min(1, near)),
    angle = (config.geometry.angleDeg * Math.PI) / 180,
    scale = 1 + (config.placement.scale - 1) * room;
  const a = scale * (1 + (Math.cos(angle) - 1) * room),
    b = -Math.sin(angle) * config.geometry.frontSlope * room * scale,
    d = scale;
  const anchor = { x: r.x + r.width / 2, y: r.y + r.height },
    k = r.width / config.referenceWidth;
  const matrix: Affine2 = {
    a,
    b,
    c: 0,
    d,
    tx: anchor.x * (1 - a) + config.placement.x * k * room,
    ty: anchor.y * (1 - d) - b * anchor.x + config.placement.y * k * room,
  };
  const depth =
    r.width *
    Math.max(0, physicalDepthRatio) *
    config.geometry.depth *
    room *
    scale;
  const extrusion = {
    x: depth * Math.sin(angle),
    y: -depth * Math.cos(angle) * config.geometry.surfacePitch,
  };
  const front = rectPoints(r).map((p) => projectPoint(p, matrix)),
    back = front.map((p) => ({ x: p.x + extrusion.x, y: p.y + extrusion.y }));
  const top = [front[0]!, back[0]!, back[1]!, front[1]!],
    right = [front[1]!, back[1]!, back[2]!, front[2]!];
  return {
    matrix,
    front,
    back,
    top,
    right,
    extrusion,
    bounds: pointBounds([...front, ...back]),
    room,
  };
}
