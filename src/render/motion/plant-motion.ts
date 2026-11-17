/** Damped, coupled flexible stems in normalized coordinates. Fixed roots, free tips. */
export class PlantMotion {
  readonly offsets: number[];
  private readonly velocity: number[];
  constructor(
    readonly segments = 9,
    readonly seed = 0,
  ) {
    this.offsets = Array(segments).fill(0);
    this.velocity = Array(segments).fill(0);
  }
  update(
    dt: number,
    time: number,
    flow: number,
    visitors: { height: number; distance: number; speed: number }[] = [],
  ): void {
    let remaining = Math.max(0, Math.min(0.15, dt));
    while (remaining > 0) {
      const h = Math.min(1 / 120, remaining);
      remaining -= h;
      const previous = [...this.offsets];
      for (let i = 1; i < this.segments; i++) {
        const u = i / (this.segments - 1),
          x = previous[i]!,
          left = previous[i - 1]!,
          right = previous[Math.min(i + 1, this.segments - 1)]!;
        const current =
          (Math.sin(time * 0.8 + this.seed - u * 2) +
            Math.sin(time * 1.31 + this.seed * 2 - u * 3) * 0.35) *
          (0.12 + 0.88 * flow);
        let wake = 0;
        for (const f of visitors)
          wake +=
            Math.exp(-(((u - f.height) * 5) ** 2)) *
            Math.max(0, 1 - f.distance) *
            Math.max(-2, Math.min(2, f.speed)) *
            0.8;
        const acceleration =
          current * u * 1.5 +
          wake -
          (5 - 2 * u) * x +
          20 * (left + right - 2 * x) -
          3.8 * this.velocity[i]!;
        this.velocity[i]! += acceleration * h;
        this.offsets[i] = Math.max(
          -0.42,
          Math.min(0.42, x + this.velocity[i]! * h),
        );
      }
    }
  }
}
