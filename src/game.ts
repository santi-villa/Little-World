/**
 * Pegamento entre la simulación pura y el resto (render, UI, guardado).
 * Es el único lugar que conoce el reloj real.
 *
 * El juego corre en tiempo real 1:1. Mientras está abierto avanza de a
 * pasitos; cuando estuvo cerrado o en segundo plano, recupera lo que pasó de
 * una sola vez (catch-up). Las velocidades más rápidas existen solo para
 * probar desde el panel de debug.
 */

import {
  applyAction,
  catchUp,
  constantOutdoor,
  createNewTank,
  defaultConfig,
  step,
  type CatchUpResult,
  type SimAction,
  type SimEnvironment,
  type SimEvent,
  type SimState,
  type Weather,
} from './sim';
import { DEFAULT_SETTINGS, type GameSettings } from './save/save-format';

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
/** Si un cuadro tarda más que esto (pestaña en segundo plano), lo que falta lo recupera el catch-up. */
const MAX_FRAME_SECONDS = 0.25;
/** Con el juego abierto la simulación avanza cada 10 segundos de juego, así reacciona enseguida. */
const LIVE_STEP_MINUTES = 1 / 6;
/** Ausencias más cortas que esto no se recuperan (no vale la pena). */
const MIN_CATCH_UP_MS = 20_000;

/** Minuto del día según el reloj del dispositivo. */
function localMinuteOfDay(now: Date): number {
  return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
}

export interface CatchUpReport {
  result: CatchUpResult;
  /** Cuánto tardó en calcularse, ms. */
  durationMs: number;
}

export class Game {
  state: SimState;
  speed: number;
  /** Temperatura exterior fija (hasta que se conecte el clima real). */
  outdoorC: number;
  /** Clima fijo (ídem). */
  weather: Weather;
  /** Últimos eventos, el más nuevo primero. */
  readonly log: SimEvent[] = [];
  /** Hay cambios sin guardar. */
  dirty = false;
  /** El jugador hizo algo: conviene guardar enseguida, sin esperar al autoguardado. */
  saveSoon = false;
  /** El último catch-up, para mostrar cuánto tardó. */
  lastCatchUp: CatchUpReport | null = null;
  private pendingMinutes = 0;

  constructor(state: SimState, settings: GameSettings = DEFAULT_SETTINGS) {
    this.state = state;
    this.speed = settings.speed;
    this.outdoorC = settings.outdoorC;
    this.weather = settings.weather;
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

  get settings(): GameSettings {
    return { speed: this.speed, outdoorC: this.outdoorC, weather: this.weather };
  }

  /** Lo que la simulación recibe de afuera mientras el juego está abierto. */
  private environment(): SimEnvironment {
    return {
      outdoor: constantOutdoor(this.outdoorC),
      weather: this.weather,
      playerPresent: true,
    };
  }

  /** Avanza según el reloj real y la velocidad elegida. */
  update(realSeconds: number): void {
    if (this.speed <= 0) return;
    this.pendingMinutes += Math.min(realSeconds, MAX_FRAME_SECONDS) * this.speed;
    if (this.pendingMinutes < LIVE_STEP_MINUTES) return;
    const minutes = this.pendingMinutes;
    this.pendingMinutes = 0;
    this.advance(minutes);
  }

  /** Avanza la simulación `minutes` minutos de una. */
  advance(minutes: number): void {
    const result = step(this.state, minutes, defaultConfig, this.environment());
    this.state = result.state;
    this.record(result.events);
    this.dirty = true;
  }

  /** Salto de tiempo pedido a mano (botones del panel de debug). */
  skip(minutes: number): void {
    this.advance(minutes);
    this.saveSoon = true;
  }

  /**
   * Recupera el tiempo que pasó con el juego cerrado o en segundo plano.
   * `hourlyC` es la temperatura exterior hora por hora durante la ausencia
   * (si falta, se usa la fija). Devuelve null si no había nada que recuperar.
   */
  catchUp(elapsedMs: number, hourlyC?: readonly number[]): CatchUpReport | null {
    if (this.speed <= 0 || !(elapsedMs >= MIN_CATCH_UP_MS)) return null;
    const startedAt = performance.now();
    const result = catchUp(this.state, elapsedMs / 60_000, defaultConfig, {
      outdoor:
        hourlyC && hourlyC.length > 0
          ? { startTimeMinutes: this.state.timeMinutes, hourlyC }
          : constantOutdoor(this.outdoorC),
      weather: this.weather,
    });
    const report = { result, durationMs: performance.now() - startedAt };
    this.state = result.state;
    this.record(result.events);
    this.lastCatchUp = report;
    this.pendingMinutes = 0;
    this.dirty = true;
    this.saveSoon = true;
    return report;
  }

  act(action: SimAction): SimEvent[] {
    const result = applyAction(this.state, action);
    this.state = result.state;
    this.record(result.events);
    this.dirty = true;
    this.saveSoon = true;
    return result.events;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    this.pendingMinutes = 0;
    this.dirty = true;
    this.saveSoon = true;
  }

  setOutdoor(temperatureC: number): void {
    this.outdoorC = Math.max(-20, Math.min(45, temperatureC));
    this.dirty = true;
    this.saveSoon = true;
  }

  setWeather(weather: Weather): void {
    this.weather = weather;
    this.dirty = true;
    this.saveSoon = true;
  }

  reset(seed: number | string, tankId?: string, now: Date = new Date()): void {
    this.state = createNewTank({ seed, tankId, startMinuteOfDay: localMinuteOfDay(now) });
    this.speed = DEFAULT_SPEED;
    this.log.length = 0;
    this.pendingMinutes = 0;
    this.lastCatchUp = null;
    this.dirty = true;
    this.saveSoon = true;
  }

  private record(events: SimEvent[]): void {
    // Si llegan muchos de golpe (un catch-up), solo entran los últimos.
    const start = Math.max(0, events.length - MAX_LOG);
    for (let i = start; i < events.length; i++) this.log.unshift(events[i] as SimEvent);
    if (this.log.length > MAX_LOG) this.log.length = MAX_LOG;
  }
}
