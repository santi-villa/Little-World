/**
 * Pegamento entre la simulación pura y el resto (render, UI, guardado).
 * Es el único lugar que conoce el reloj real.
 *
 * El juego corre en tiempo real 1:1. Las velocidades más rápidas existen solo
 * para probar desde el panel de debug.
 */

import {
  applyAction,
  createNewTank,
  step,
  type SimAction,
  type SimEvent,
  type SimState,
} from './sim';

/** Minutos simulados por segundo real. */
export const SPEEDS = {
  pause: 0,
  realtime: 1 / 60,
  minute: 1,
  hour: 60,
  day: 1440,
} as const;

export type SpeedId = keyof typeof SPEEDS;

export const DEFAULT_SPEED: number = SPEEDS.realtime;
const MAX_LOG = 40;
/** Si un cuadro tarda más que esto (pestaña en segundo plano), no se recupera el tiempo. */
const MAX_FRAME_SECONDS = 0.25;

/** Minuto del día según el reloj del dispositivo. */
function localMinuteOfDay(now: Date): number {
  return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
}

export class Game {
  state: SimState;
  speed: number;
  /** Últimos eventos, el más nuevo primero. */
  readonly log: SimEvent[] = [];
  /** Hay cambios sin guardar. */
  dirty = false;
  /** El jugador hizo algo: conviene guardar enseguida, sin esperar al autoguardado. */
  saveSoon = false;
  private pendingMinutes = 0;

  constructor(state: SimState, speed: number = DEFAULT_SPEED) {
    this.state = state;
    this.speed = speed;
  }

  /** Pecera nueva, con el reloj de la simulación en la hora real. */
  static newTank(seed: number | string, tankId?: string, now: Date = new Date()): Game {
    const game = new Game(
      createNewTank({ seed, tankId, startMinuteOfDay: localMinuteOfDay(now) }),
    );
    game.dirty = true;
    game.saveSoon = true;
    return game;
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

  /** Salto de tiempo pedido a mano (botones del panel de debug). */
  skip(minutes: number): void {
    this.advance(minutes);
    this.saveSoon = true;
  }

  act(action: SimAction): void {
    const result = applyAction(this.state, action);
    this.state = result.state;
    this.record(result.events);
    this.dirty = true;
    this.saveSoon = true;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    this.pendingMinutes = 0;
    this.dirty = true;
    this.saveSoon = true;
  }

  reset(seed: number | string, tankId?: string, now: Date = new Date()): void {
    this.state = createNewTank({ seed, tankId, startMinuteOfDay: localMinuteOfDay(now) });
    this.speed = DEFAULT_SPEED;
    this.log.length = 0;
    this.pendingMinutes = 0;
    this.dirty = true;
    this.saveSoon = true;
  }

  private record(events: SimEvent[]): void {
    for (const event of events) this.log.unshift(event);
    if (this.log.length > MAX_LOG) this.log.length = MAX_LOG;
  }
}
