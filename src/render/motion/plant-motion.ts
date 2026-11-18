import settings from '../../data/ecosystem.json';
/** Damped, coupled flexible stems in normalized coordinates. Fixed roots, free tips. */
export class PlantMotion {
  readonly offsets: number[];
  private readonly velocity: number[];
  constructor(
    readonly segments = 9,
    readonly seed = 0,
    readonly kind: string = 'vallisneria',
  ) {
    this.offsets = Array(segments).fill(0);
    this.velocity = Array(segments).fill(0);
  }
  receiveImpulse(height: number, strength: number): void {
    for (let i = 1; i < this.segments; i++) {
      const u = i / (this.segments - 1);
      this.velocity[i]! +=
        Math.max(
          -settings.plants.impulseLimit,
          Math.min(settings.plants.impulseLimit, strength),
        ) * Math.max(0, 1 - Math.abs(u - height));
    }
  }
  update(
    dt: number,
    time: number,
    flow: number,
    visitors: { height: number; distance: number; speed: number }[] = [],
    waterVelocity?: number,
  ): void {
    const profile =
      settings.plantProfiles[
        this.kind as keyof typeof settings.plantProfiles
      ] ?? settings.plantProfiles.vallisneria;
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
          (waterVelocity ?? flow * settings.flow.maxCmS) *
            settings.plants.currentForce +
          Math.sin(time * 0.12 + this.seed) * settings.plants.ambientForce;
        let wake = 0;
        for (const f of visitors)
          wake +=
            Math.exp(-(((u - f.height) * 5) ** 2)) *
            Math.max(0, 1 - f.distance) *
            Math.max(-2, Math.min(2, f.speed)) *
            settings.plants.wakeForce;
        const acceleration =
          current * u * profile.exposure +
          wake * profile.exposure -
          profile.stiffness * x +
          settings.plants.coupling * (left + right - 2 * x) -
          profile.damping * this.velocity[i]!;
        this.velocity[i]! += acceleration * h;
        this.offsets[i] = Math.max(
          -settings.plants.maxBend,
          Math.min(settings.plants.maxBend, x + this.velocity[i]! * h),
        );
      }
    }
  }
}
