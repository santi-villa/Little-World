/** Decorative companion. Legacy fields are retained for old saves only. */
import type { SimConfig } from './config';
import type { SimEnvironment } from './environment';
import type { Rng } from './rng';
import type { CatState, SimEvent, SimState } from './types';

export function createCat(timeMinutes = 0): CatState {
  return {
    needs: { sleep: 0, hunger: 0, curiosity: 0, affection: 0, energy: 1 },
    behavior: 'sleep', spot: 'bed', behaviorSince: timeMinutes,
    behaviorUntil: timeMinutes, petting: 0, annoyedUntil: 0, bowl: 1, watchingMinutes: 0,
  };
}
export function stepCat(state: SimState, _dt: number, _rng: Rng, _config: SimConfig,
  _env: SimEnvironment, _events: SimEvent[]): void {
  state.cat = createCat(state.cat.behaviorSince);
}
export function petCat(state: SimState, _config: SimConfig, events: SimEvent[]): void {
  state.cat = createCat(state.timeMinutes);
  events.push({ type: 'cat_petted', timeMinutes: state.timeMinutes });
}
/** Compatibility for legacy callers; the cat no longer needs food. */
export function fillCatBowl(_state: SimState, _events: SimEvent[]): void {}
