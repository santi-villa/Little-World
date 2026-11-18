/** Reversible finite-duration easing. Pure presentation state, independent of aquarium time. */
export const smoothView = (t: number): number => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
};
export class ViewBlend {
  value = 0;
  target = 0;
  private from = 0;
  private elapsed = 0;
  private duration = 1;
  get moving(): boolean {
    return this.value !== this.target;
  }
  set(target: number, seconds: number): void {
    const to = Math.max(0, Math.min(1, target));
    if (to === this.target) return;
    this.from = this.value;
    this.target = to;
    this.elapsed = 0;
    this.duration = Math.max(0.05, seconds);
  }
  snap(target: number): void {
    this.value = this.target = this.from = Math.max(0, Math.min(1, target));
    this.elapsed = 0;
  }
  update(dt: number): void {
    if (!this.moving || !Number.isFinite(dt) || dt <= 0) return;
    this.elapsed = Math.min(this.duration, this.elapsed + dt);
    this.value =
      this.elapsed === this.duration
        ? this.target
        : this.from +
          (this.target - this.from) * smoothView(this.elapsed / this.duration);
  }
}
