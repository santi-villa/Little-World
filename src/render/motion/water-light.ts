/** Waves shared by the waterline, the underwater light and the spill on the furniture. */
export function surfaceSlope(u: number, seconds: number): number {
  return (
    Math.cos(u * 22 + seconds * 1.4) * 0.07 +
    Math.cos(u * 9 - seconds * 0.9) * 0.04
  );
}

export function surfaceHeight(u: number, seconds: number): number {
  return Math.sin(u * 22 + seconds * 1.4) * 0.68
    + Math.sin(u * 9 - seconds * 0.9) * 0.93;
}

/** Short local disturbances travel out from the bubble or tap and dissipate. */
export class SurfaceRipples {
  private readonly events = Array.from({ length: 8 }, () => ({ u: 0, at: -Infinity, strength: 0 }));
  private next = 0;

  disturb(u: number, seconds: number, strength: number): void {
    Object.assign(this.events[this.next]!, { u, at: seconds, strength: Math.min(1, Math.max(0, strength)) });
    this.next = (this.next + 1) % this.events.length;
  }

  displacement(u: number, seconds: number): number {
    let offset = surfaceHeight(u, seconds);
    for (const event of this.events) {
      const age = seconds - event.at;
      if (age < 0 || age > 2.4) continue;
      const front = (Math.abs(u - event.u) - age * 0.105) * 32;
      offset += event.strength * Math.exp(-age * 1.9 - front ** 2) * Math.cos(front * 2.6);
    }
    // The glass pins the contact line at either edge.
    return offset * Math.min(1, u * 22, (1 - u) * 22);
  }
}
export function causticStrips(
  seconds: number,
  count = 20,
): { x: number; intensity: number }[] {
  const projected = Array.from({ length: count }, (_, i) => {
    const u = (i + 0.5) / count;
    return u + surfaceSlope(u, seconds) * 0.3;
  });
  return projected.map((x, i) => {
    const distance = Math.abs(
      (projected[Math.min(count - 1, i + 1)] ?? x) -
        (projected[Math.max(0, i - 1)] ?? x),
    );
    return {
      x: Math.max(0, Math.min(1, x)),
      intensity: Math.min(1, 0.025 / Math.max(0.005, distance)),
    };
  });
}
