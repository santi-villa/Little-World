import { smoothView } from './view-transition';

/** Orthographic projection of a rear-hinged lid climbing toward the viewer. */
export function lidProjection(progress: number, thickness: number): number {
  const angle = smoothView(progress) * (Math.PI * 0.43);
  return thickness * (Math.cos(angle) - 1.17 * Math.sin(angle));
}

export class LidMotion {
  private progress = 0;
  private initialized = false;

  update(open: boolean, dt: number): number {
    const target = open ? 1 : 0;
    if (!this.initialized) {
      this.progress = target;
      this.initialized = true;
    }
    const step = Math.min(0.08, Math.max(0, dt)) / 0.52;
    const distance = target - this.progress;
    this.progress += Math.sign(distance) * Math.min(Math.abs(distance), step);
    return this.progress;
  }
}
