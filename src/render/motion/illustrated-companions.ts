/** Local presentation profiles. Species biology and save IDs live in the simulation. */
const profiles = {
  corydoras_paleatus: {
    band: [0.82, 0.95], rest: 0.92, cruise: 0.72, turn: 0.8,
    pause: [0.95, 2.3], goalSeconds: [5.5, 9], drift: 0.14,
    frequencies: [0.2, 2.65], bend: 0.88, turnEase: 4.7,
    spine: 0.595, tailJoin: -35, thickness: 6.7,
  },
  neon_tetra: {
    band: [0.18, 0.51], rest: 0.35, cruise: 1.21, turn: 1.24,
    pause: [0.32, 0.76], goalSeconds: [3.2, 6.2], drift: 0.24,
    frequencies: [0.33, 4.9], bend: 0.96, turnEase: 7.3,
    spine: 0.545, tailJoin: -36, thickness: 4.3,
  },
} as const;

export type CompanionId = keyof typeof profiles;
export type CompanionProfile = typeof profiles[CompanionId];

export function companionProfile(id: string): CompanionProfile | undefined {
  if (id === 'corydoras_paleatus' || id === 'neon_tetra') return profiles[id];
  return undefined;
}
