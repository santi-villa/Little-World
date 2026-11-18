import type {HabitatSolid} from './solid-contact';
/** Measurements normalized to the swimming area; independent of sprites and screen size. */
export interface HabitatObstacle {
  x: number;
  y: number;
  z?:number;depth?:number;
  rx: number;
  ry: number;
}
export interface Habitat {
  solids?:HabitatSolid[];
  obstacles: HabitatObstacle[];
  refuges: { x: number; y: number }[];
  leaves: { x: number; y: number }[];
}
export const emptyHabitat = (): Habitat => ({
  solids: [],
  obstacles: [],
  refuges: [],
  leaves: [],
});
export function resolveHabitat(
  x: number,
  y: number,
  h: Habitat,
  width: number,
  height: number,
  margin = 0,
  z?:number,
): { x: number; y: number } {
  let px = x,
    py = y;
  for (let pass = 0; pass < 6; pass++)
    for (const o of h.obstacles) {
      if(z!==undefined&&o.z!==undefined&&Math.abs(z-o.z)>(o.depth??.4)/2)continue;
      const rx = o.rx * width + margin,
        ry = o.ry * height + margin,
        cx = o.x * width,
        cy = o.y * height;
      const dx = (px - cx) / rx,
        dy = (py - cy) / ry,
        d = Math.hypot(dx, dy);
      if (d < 1) {
        let best = Infinity,
          candidate = { x: px, y: py };
        for (let i = 0; i < 32; i++) {
          const a = (i * Math.PI * 2) / 32,
            q = {
              x: cx + Math.cos(a) * rx * 1.003,
              y: cy + Math.sin(a) * ry * 1.003,
            };
          if (
            q.x < margin ||
            q.x > width - margin ||
            q.y < margin ||
            q.y > height - margin
          )
            continue;
          const distance = Math.hypot(q.x - px, q.y - py);
          if (distance < best) {
            best = distance;
            candidate = q;
          }
        }
        px = candidate.x;
        py = candidate.y;
      }
    }
  return {
    x: Math.max(margin, Math.min(width - margin, px)),
    y: Math.max(margin, Math.min(height - margin, py)),
  };
}
export function habitatTarget(
  points: { x: number; y: number }[],
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number } | null {
  let result: null | { x: number; y: number } = null,
    best = Infinity;
  for (const p of points) {
    const v = { x: p.x * width, y: p.y * height },
      d = Math.hypot(v.x - x, v.y - y);
    if (d < best) {
      best = d;
      result = v;
    }
  }
  return result;
}
