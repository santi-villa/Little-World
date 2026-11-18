import settings from '../../data/ecosystem.json';

export function plantWakeDistance(horizontal: number, depth: number, height: number): number {
  if (height <= 0 || height >= 1) return 1;
  return Math.min(1, Math.hypot(horizontal, depth / 0.32));
}

/** Damped, coupled flexible stems in normalized coordinates. Fixed roots, free tips. */
export class PlantMotion {
  readonly offsets: number[];
  private readonly velocity: number[];
  private readonly previous: Float64Array;
  private readonly drive: Float64Array;
  private readonly frequency: number;
  private readonly amplitude: number;
  constructor(
    readonly segments = 9,
    readonly seed = 0,
    readonly kind: string = 'vallisneria',
  ) {
    this.offsets = Array(segments).fill(0);
    this.velocity = Array(segments).fill(0);
    this.previous = new Float64Array(segments);
    this.drive = new Float64Array(segments);
    this.frequency = 0.26 + (Math.sin(seed * 3.17) + 1) * 0.13;
    this.amplitude = 0.83 + (Math.cos(seed * 2.51) + 1) * 0.19;
  }
  receiveImpulse(height: number, strength: number): void {
    for (let i = 1; i < this.segments; i++) {
      const u = i / (this.segments - 1);
      this.velocity[i]! +=
        Math.max(
          -settings.plants.impulseLimit,
          Math.min(settings.plants.impulseLimit, strength),
        ) * Math.exp(-(((u - height) * 4.2) ** 2));
    }
  }
  update(
    dt: number,
    time: number,
    flow: number,
    visitors: { height: number; distance: number; speed: number }[] = [],
    waterVelocity?: number | { base: number; tip: number },
  ): void {
    const profile =
      settings.plantProfiles[
        this.kind as keyof typeof settings.plantProfiles
      ] ?? settings.plantProfiles.vallisneria;
    const fallback = flow * settings.flow.maxCmS;
    const base = typeof waterVelocity === 'object' ? waterVelocity.base : waterVelocity ?? fallback;
    const tip = typeof waterVelocity === 'object' ? waterVelocity.tip : base;
    for (let i = 1; i < this.segments; i++) {
      const u = i / (this.segments - 1);
      let force = (base + (tip - base) * u) * settings.plants.currentForce * u;
      for (const f of visitors) {
        force += Math.exp(-(((u - f.height) * 5) ** 2)) *
          Math.max(0, 1 - f.distance) *
          Math.max(-2, Math.min(2, f.speed)) *
          settings.plants.wakeForce;
      }
      this.drive[i] = force;
    }
    let remaining = Math.max(0, Math.min(0.15, dt));
    while (remaining > 0) {
      const h = Math.min(1 / 120, remaining);
      remaining -= h;
      this.previous.set(this.offsets);
      const t = (time - remaining - h * 0.5) * this.frequency;
      for (let i = 1; i < this.segments; i++) {
        const u = i / (this.segments - 1),
          x = this.previous[i]!,
          left = this.previous[i - 1]!,
          right = this.previous[Math.min(i + 1, this.segments - 1)]!;
        const idle = Math.sin(t + this.seed - u * 1.2) * settings.plants.ambientForce * u * this.amplitude;
        const acceleration =
          (this.drive[i]! + idle) * profile.exposure -
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
