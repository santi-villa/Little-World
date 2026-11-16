import { Application, TextureSource } from 'pixi.js';
import { Game } from './game';
import { RoomScene } from './render/scene/room-scene';
import { WelcomePanel } from './render/ui/welcome';
import { DebugPanel } from './render/ui/debug-panel';
import { fill, texts } from './render/ui/texts';
import { GAME_HEIGHT, GAME_WIDTH, attachViewport } from './render/viewport';
import { SAVE_FORMAT_VERSION, createSave } from './save/save-format';
import { readSave, writeSave } from './save/storage';
import { MINUTES_PER_DAY, defaultConfig, derive } from './sim';
import { FixedOutdoorTemperature, type OutdoorTemperatureSource } from './world/outdoor';
import './styles.css';

/** Autoguardado cada 1 minuto (además de al pasar a segundo plano). */
const AUTOSAVE_MS = 60_000;
const SAVE_AFTER_ACTION_MS = 300;

function randomSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

interface LoadedGame {
  game: Game;
  savingWorks: boolean;
  note: string;
  /** Momento real del último guardado (0 si la partida es nueva). */
  lastTimestamp: number;
}

/** Carga la partida guardada o arranca una pecera nueva. */
async function loadGame(): Promise<LoadedGame> {
  const s = texts.save;
  try {
    const result = await readSave();
    if (result.status === 'ok') {
      const note =
        result.migratedFrom === null
          ? s.loaded
          : fill(s.migrated, { version: result.migratedFrom });
      return {
        game: new Game(result.save.sim, result.save.settings),
        savingWorks: true,
        note,
        lastTimestamp: result.save.lastTimestamp,
      };
    }
    if (result.status === 'invalid') console.warn('Partida ilegible:', result.reason);
    const note =
      result.status === 'empty'
        ? s.newTank
        : result.status === 'too_new'
          ? fill(s.tooNew, { version: result.formatVersion })
          : s.invalid;
    return { game: Game.newTank(randomSeed()), savingWorks: true, note, lastTimestamp: 0 };
  } catch (error) {
    console.warn('No se pudo usar IndexedDB; la partida no se va a guardar.', error);
    return { game: Game.newTank(randomSeed()), savingWorks: false, note: '', lastTimestamp: 0 };
  }
}

async function boot(): Promise<void> {
  const stage = document.getElementById('stage');
  if (!stage) throw new Error('Falta #stage');
  document.title = texts.title;
  const hint = document.querySelector('#rotate-hint p');
  if (hint) hint.textContent = texts.rotateHint;

  // Pixel perfect: sin suavizado en ningún lado.
  TextureSource.defaultOptions.scaleMode = 'nearest';
  const app = new Application();
  await app.init({
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    background: 0x0b1020,
    antialias: false,
    resolution: 1,
    autoDensity: false,
    roundPixels: true,
    powerPreference: 'low-power',
  });
  stage.append(app.canvas);
  attachViewport(app.canvas, stage);

  const { game, savingWorks, note, lastTimestamp } = await loadGame();
  const welcome = new WelcomePanel(document.body);
  // Por ahora el exterior es un valor fijo; el clima real va a implementar la misma interfaz.
  const fixedOutdoor = new FixedOutdoorTemperature(game.outdoorC);
  const outdoor: OutdoorTemperatureSource = fixedOutdoor;
  /** Momento real hasta el que la simulación está al día. */
  let hiddenAt: number | null = null;
  /** Catch-up en curso: desde cuándo se está recuperando. */
  let recoveringFrom: number | null = null;
  const syncedAt = (): number => recoveringFrom ?? hiddenAt ?? Date.now();

  /**
   * Catch-up: simula lo que pasó desde `sinceMs` (juego cerrado o en segundo
   * plano) y, si fue un rato largo, muestra el resumen de bienvenida.
   */
  const catchUpSince = async (sinceMs: number): Promise<void> => {
    const elapsedMs = Date.now() - sinceMs;
    if (!(sinceMs > 0) || !(elapsedMs > 0)) return;
    fixedOutdoor.temperatureC = game.outdoorC;
    const maxMs = defaultConfig.clock.maxCatchUpDays * MINUTES_PER_DAY * 60_000;
    let hourly: number[] | undefined;
    try {
      hourly = await outdoor.hourlyC(sinceMs, Math.min(elapsedMs, maxMs) / 3_600_000);
    } catch (error) {
      console.warn('Sin histórico de temperatura exterior; se usa el valor fijo.', error);
    }
    const report = game.catchUp(elapsedMs, hourly);
    if (!report) return;
    if (report.result.elapsedMinutes >= defaultConfig.clock.welcomeMinMinutes) {
      welcome.show(report.result.summary);
    }
  };
  await catchUpSince(lastTimestamp);

  let lastSavedAt = 0;
  let saveNote = note;
  let saving = false;

  const save = async (): Promise<void> => {
    if (!savingWorks || saving || !game.dirty) return;
    saving = true;
    game.dirty = false;
    try {
      // El timestamp es el momento hasta el que la simulación está al día: si
      // el guardado sale estando en segundo plano, no se pierde ese tiempo.
      await writeSave(createSave(game.state, game.settings, syncedAt()));
      lastSavedAt = Date.now();
      saveNote = '';
    } catch (error) {
      game.dirty = true;
      saveNote = texts.save.error;
      console.warn('No se pudo guardar la partida.', error);
    } finally {
      saving = false;
    }
  };

  const saveStatus = (): string => {
    if (!savingWorks) return texts.save.unavailable;
    const prefix = fill(texts.save.status, { version: SAVE_FORMAT_VERSION });
    if (saveNote || lastSavedAt === 0) return saveNote ? `${prefix} · ${saveNote}` : prefix;
    const seconds = Math.max(0, Math.round((Date.now() - lastSavedAt) / 1000));
    return `${prefix} · ${fill(texts.save.ago, { seconds })}`;
  };

  const scene = new RoomScene();
  app.stage.addChild(scene.container);

  const panel = new DebugPanel(game, document.body, {
    saveStatus,
    onReset: (tankId) => game.reset(randomSeed(), tankId),
    onSimulateAway: (minutes) => {
      const report = game.catchUp(minutes * 60_000);
      if (report) welcome.show(report.result.summary);
    },
  });

  // --- Tocar la escena: acariciar al gato o golpear el vidrio ---
  const canvas = app.canvas;
  canvas.style.touchAction = 'none';
  const toScene = (event: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * GAME_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * GAME_HEIGHT,
    };
  };
  const STROKE_PIXELS = 14;
  const STROKE_MS = 350;
  let petting: { x: number; y: number; travelled: number; lastStroke: number } | null = null;
  let tapStart: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (event) => {
    const p = toScene(event);
    const hit = scene.pick(p.x, p.y);
    if (hit === 'cat') {
      // Apoyar la mano ya es una caricia; deslizar suma más.
      petting = { ...p, travelled: 0, lastStroke: performance.now() };
      game.act({ type: 'petCat' });
    } else if (hit === 'tank') {
      tapStart = p;
    }
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!petting) return;
    const p = toScene(event);
    petting.travelled += Math.hypot(p.x - petting.x, p.y - petting.y);
    petting.x = p.x;
    petting.y = p.y;
    const now = performance.now();
    if (
      petting.travelled >= STROKE_PIXELS &&
      now - petting.lastStroke >= STROKE_MS &&
      scene.pick(p.x, p.y) === 'cat'
    ) {
      petting.travelled = 0;
      petting.lastStroke = now;
      game.act({ type: 'petCat' });
    }
  });
  const release = (event: PointerEvent): void => {
    if (tapStart && event.type === 'pointerup') {
      const p = toScene(event);
      if (Math.hypot(p.x - tapStart.x, p.y - tapStart.y) < 6) {
        // Golpecito en el vidrio: los peces se asustan (no hay que hacerlo).
        game.act({ type: 'tapGlass' });
        scene.scareFish(p.x, p.y);
      }
    }
    petting = null;
    tapStart = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', release);

  app.ticker.add((ticker) => {
    game.update(ticker.deltaMS / 1000);
    // Después de una acción del jugador se guarda enseguida.
    if (game.saveSoon) {
      game.saveSoon = false;
      window.setTimeout(() => void save(), SAVE_AFTER_ACTION_MS);
    }
    const now = performance.now();
    scene.update(game.state, derive(game.state), now / 1000, { weather: game.weather });
    panel.update(now);
  });

  // Guardado automático: cada minuto y al salir o pasar a segundo plano.
  window.setInterval(() => void save(), AUTOSAVE_MS);
  // En segundo plano el bucle se frena: se anota desde cuándo y al volver se
  // recupera ese tiempo con el catch-up.
  const goBackground = (): void => {
    hiddenAt ??= Date.now();
    game.dirty = true;
    void save();
  };
  const comeBack = (): void => {
    if (hiddenAt === null || document.visibilityState !== 'visible') return;
    const since = hiddenAt;
    hiddenAt = null;
    recoveringFrom = since;
    void catchUpSince(since).finally(() => {
      recoveringFrom = null;
    });
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') goBackground();
    else comeBack();
  });
  window.addEventListener('pagehide', goBackground);
  window.addEventListener('pageshow', comeBack);

  // Instalada como app: intentar fijar la orientación horizontal.
  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (orientation: string) => Promise<void>;
  };
  orientation?.lock?.('landscape').catch(() => {
    // Solo funciona a pantalla completa; el manifest ya pide "landscape".
  });
}

boot().catch((error) => {
  console.error(error);
  const message = document.createElement('pre');
  message.style.cssText =
    'position:fixed;inset:0;margin:0;padding:16px;color:#ff6b5e;white-space:pre-wrap';
  message.textContent = `${texts.bootError}\n${String(error)}`;
  document.body.append(message);
});
