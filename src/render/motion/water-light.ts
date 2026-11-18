/** Shared surface waves; analytic refraction approximation, not a photon solver. */
export function surfaceSlope(u: number, seconds: number): number {
  return (
    Math.cos(u * 22 + seconds * 1.4) * 0.07 +
    Math.cos(u * 9 - seconds * 0.9) * 0.04
  );
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
