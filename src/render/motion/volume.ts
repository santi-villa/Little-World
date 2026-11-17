/** Orthographic deformation for articulated fish, independent of the renderer. */
export interface Point3 {
  x: number;
  y: number;
  z: number;
}
export function projectFish(
  p: Point3,
  yaw: number,
  pitch: number,
  phase = 0,
  effort = 0,
  flex = 1,
): Point3 {
  const tail = Math.max(0, Math.min(1, (-p.x + 5) / 65));
  const bend = Math.sin(phase - tail * 3.8) * tail * tail * (1 + effort * 7)*flex;
  const z = p.z + bend;
  // A small vertical component and membrane sweep keep the stroke readable side-on.
  const py =
    p.y + Math.sin(phase - tail * 3.8) * tail * tail * (0.5 + effort * 3.5)*flex;
  const rx = p.x * Math.cos(yaw) + z * Math.sin(yaw),
    rz = -p.x * Math.sin(yaw) + z * Math.cos(yaw);
  return {
    x: rx * Math.cos(pitch) - py * Math.sin(pitch),
    y: rx * Math.sin(pitch) + py * Math.cos(pitch),
    z: rz,
  };
}
export function smoothAngle(
  current: number,
  target: number,
  dt: number,
  rate: number,
): number {
  const delta = Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current),
  );
  return current + delta * (1 - Math.exp(-Math.max(0, dt) * rate));
}
