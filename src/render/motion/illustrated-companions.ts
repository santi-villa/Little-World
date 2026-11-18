/** Local presentation profiles. Species biology and save IDs live in the simulation. */
const profiles = {
  corydoras_paleatus: {
    band: [0.82, 0.95], rest: 0.92, cruise: 0.72, turn: 0.8,
    pause: [0.95, 2.3], goalSeconds: [5.5, 9], drift: 0.14,
    frequencies: [0.2, 2.65], bend: 0.88, turnEase: 4.7,
    bob: [0.31, 1.65], spine: 0.595, tailJoin: -35, thickness: 6.7,
  },
  neon_tetra: {
    band: [0.18, 0.51], rest: 0.35, cruise: 1.21, turn: 1.24,
    pause: [0.32, 0.76], goalSeconds: [3.2, 6.2], drift: 0.24,
    frequencies: [0.33, 4.9], bend: 0.96, turnEase: 7.3,
    bob: [0.62, 2.25], spine: 0.545, tailJoin: -36, thickness: 4.3,
  },
  harlequin_rasbora: {
    band: [0.25, 0.58], rest: 0.39, cruise: 1.16, turn: 1.14,
    pause: [0.36, 0.84], goalSeconds: [3.4, 6.6], drift: 0.19,
    frequencies: [0.3, 4.4], bend: 0.95, turnEase: 6.8,
    bob: [0.58, 2.1], spine: 0.55, tailJoin: -34, thickness: 5.2,
  },
} as const;

export type CompanionId = keyof typeof profiles;
export type CompanionProfile = typeof profiles[CompanionId];

export function companionProfile(id: string): CompanionProfile | undefined {
  if (id === 'corydoras_paleatus' || id === 'neon_tetra' || id === 'harlequin_rasbora') return profiles[id];
  return undefined;
}
