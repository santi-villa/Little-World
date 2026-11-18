import { smoothView } from './view-transition';

/**
 * The front edge travels around the rear hinge. Length is in tank-local
 * units. Its forward reach shrinks as it rises, so the face recedes too.
 */
export function lidPose(progress: number, length: number) {
  const angle = smoothView(progress) * (Math.PI * 0.43);
  const reach = Math.cos(angle);
  const rise = Math.sin(angle);
  return { reach, rise, screenOffset: length * (0.34 * reach - 0.76 * rise) };
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
