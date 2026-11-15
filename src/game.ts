/**
 * Pegamento entre la simulación pura y el resto (render, UI, guardado).
 * Es el único lugar que conoce el reloj real.
 */

import {
  applyAction,
  createNewTank,
  step,
  type SimAction,
  type SimEvent,
  type SimState,
} from '../sim';

export interface SpeedOption {
  label: string;
  /** Minutos simulados por segundo real. */
  value: number;
}

export const SPEEDS: SpeedOption[] = [
  { label: 'Pausa', value: 0 },
  { label: 'Tiempo real', value: 1 / 60 },
  { label: '1 min por seg', value: 1 },
  { label: '1 hora por seg', value: 60 },
  { label: '1 día por seg', value: 1440 },
];

export const DEFAULT_SPEED = 1;
const MAX_LOG = 40;
/** Si un cuadro tarda más que esto (pestaña en segundo plano), no se recupera el tiempo. */
const MAX_FRAME_SECONDS = 0.25;

export class Game {
  state: SimState;
  speed: number;
  /** Últimos eventos, el más nuevo primero. */
  readonly log: SimEvent[] = [];
  /** Hay cambios sin guardar. */
  dirty = false;
  private pendingMinutes = 0;

  constructor(state: SimState, speed: number = DEFAULT_SPEED) {
    this.state = state;
    this.speed = speed;
  }

  static newTank(seed: number | string): Game {
    return new Game(createNewTank({ seed }));
  }

  /** Avanza según el reloj real y la velocidad elegida. */
  update(realSeconds: number): void {
    if (this.speed <= 0) return;
    this.pendingMinutes += Math.min(realSeconds, MAX_FRAME_SECONDS) * this.speed;
    if (this.pendingMinutes < 1) return;
    const minutes = Math.floor(this.pendingMinutes);
    this.pendingMinutes -= minutes;
    this.advance(minutes);
  }

  /** Avanza la simulación `minutes` minutos de una. */
  advance(minutes: number): void {
    const result = step(this.state, minutes);
    this.state = result.state;
    this.record(result.events);
    this.dirty = true;
  }

  act(action: SimAction): void {
    const result = applyAction(this.state, action);
    this.state = result.state;
    this.record(result.events);
    this.dirty = true;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    this.pendingMinutes = 0;
    this.dirty = true;
  }

  reset(seed: number | string): void {
    this.state = createNewTank({ seed });
    this.log.length = 0;
    this.pendingMinutes = 0;
    this.dirty = true;
  }

  private record(events: SimEvent[]): void {
    for (const event of events) this.log.unshift(event);
    if (this.log.length > MAX_LOG) this.log.length = MAX_LOG;
  }
}
