/** Coarse alpha silhouettes with depth slabs, normalized to the water volume. */
export interface HabitatSolid {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  depth: number;
  columns: number;
  rows: number;
  alpha: readonly number[];
}
export function solidAt(
  s: HabitatSolid,
  x: number,
  y: number,
  z: number,
  radius = 0,
): boolean {
  if (Math.abs(z - s.z) > s.depth / 2) return false;
  const u = (x - s.x) / s.width,
    v = (y - s.y) / s.height;
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
  const column = Math.floor(u * s.columns),
    row = Math.floor(v * s.rows),
    spread = Math.min(2, Math.ceil((radius / s.width) * s.columns));
  for (
    let c = Math.max(0, column - spread);
    c <= Math.min(s.columns - 1, column + spread);
    c++
  )
    if (s.alpha[row * s.columns + c]) return true;
  return false;
}
/** Swept collision prevents a fast grain skipping narrow branches between frames. */
export function sweepSolids(
  solids: readonly HabitatSolid[],
  from: { x: number; y: number },
  to: { x: number; y: number },
  z: number,
  radius: number,
  radiusX = radius,
): { x: number; y: number; key: string } | null {
  let result: null | { x: number; y: number; key: string } = null,
    best = Infinity;
  for (const s of solids) {
    if (
      Math.abs(z - s.z) > s.depth / 2 ||
      Math.max(from.x, to.x) + radiusX < s.x ||
      Math.min(from.x, to.x) - radiusX > s.x + s.width ||
      Math.max(from.y, to.y) + radius < s.y ||
      Math.min(from.y, to.y) - radius > s.y + s.height
    )
      continue;
    const steps = Math.min(
      128,
      Math.max(
        1,
        Math.ceil(
          Math.max(
            (Math.abs(to.x - from.x) / s.width) * s.columns,
            (Math.abs(to.y - from.y) / s.height) * s.rows,
          ) * 2,
        ),
      ),
    );
    for (let i = 0; i <= steps; i++) {
      const t = i / steps,
        x = from.x + (to.x - from.x) * t,
        y = from.y + (to.y - from.y) * t + radius;
      if (solidAt(s, x, y, z, radiusX) && t < best) {
        best = t;
        result = {
          x,
          y:
            s.y +
            (Math.floor(((y - s.y) / s.height) * s.rows) * s.height) / s.rows -
            radius,
          key: s.key,
        };
        break;
      }
    }
  }
  return result;
}
