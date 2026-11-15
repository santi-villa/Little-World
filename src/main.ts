import { Application, TextureSource } from 'pixi.js';
import { DEFAULT_SPEED, Game } from './game/game';
import { TankScene } from './render/scene';
import { GAME_HEIGHT, GAME_WIDTH, attachViewport } from './render/viewport';
import { SAVE_FORMAT_VERSION, createSave } from './save/save-format';
import { deleteSave, readSave, writeSave } from './save/storage';
import { derive } from './sim';
import './styles.css';
import { DebugPanel } from './ui/debug-panel';

const AUTOSAVE_MS = 5000;

function randomSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

/** Carga la partida guardada o arranca una pecera nueva. */
async function loadGame(): Promise<{ game: Game; savingWorks: boolean; note: string }> {
  try {
    const result = await readSave();
    if (result.status === 'ok') {
      const note =
        result.migratedFrom === null
          ? 'Partida cargada'
          : `Partida migrada del formato v${result.migratedFrom}`;
      return {
        game: new Game(result.save.sim, result.save.settings.speed),
        savingWorks: true,
        note,
      };
    }
    const note =
      result.status === 'empty'
        ? 'Pecera nueva'
        : result.status === 'too_new'
          ? `La partida era de un formato más nuevo (v${result.formatVersion}); quedó una copia de respaldo`
          : `La partida guardada no se pudo leer (${result.reason}); quedó una copia de respaldo`;
    return { game: Game.newTank(randomSeed()), savingWorks: true, note };
  } catch (error) {
    console.warn('No se pudo usar IndexedDB; la partida no se va a guardar.', error);
    return { game: Game.newTank(randomSeed()), savingWorks: false, note: 'Sin guardado' };
  }
}

async function boot(): Promise<void> {
  const stage = document.getElementById('stage');
  if (!stage) throw new Error('Falta #stage');

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

  const { game, savingWorks, note } = await loadGame();
  let lastSavedAt = 0;
  let saveNote = note;
  let saving = false;

  const save = async (): Promise<void> => {
    if (!savingWorks || saving || !game.dirty) return;
    saving = true;
    game.dirty = false;
    try {
      await writeSave(createSave(game.state, { speed: game.speed }, Date.now()));
      lastSavedAt = Date.now();
      saveNote = '';
    } catch (error) {
      game.dirty = true;
      saveNote = 'Error al guardar';
      console.warn('No se pudo guardar la partida.', error);
    } finally {
      saving = false;
    }
  };

  const saveStatus = (): string => {
    if (!savingWorks) return 'Guardado no disponible en este navegador';
    const prefix = `Guardado en IndexedDB · formato v${SAVE_FORMAT_VERSION}`;
    if (saveNote) return `${prefix} · ${saveNote}`;
    const seconds = Math.max(0, Math.round((Date.now() - lastSavedAt) / 1000));
    return `${prefix} · hace ${seconds} s`;
  };

  const scene = new TankScene();
  app.stage.addChild(scene.container);

  const panel = new DebugPanel(game, document.body, {
    saveStatus,
    onReset: () => {
      game.reset(randomSeed());
      game.speed = DEFAULT_SPEED;
      void (savingWorks ? deleteSave().then(save) : Promise.resolve());
    },
  });

  app.ticker.add((ticker) => {
    game.update(ticker.deltaMS / 1000);
    const now = performance.now();
    scene.update(game.state, derive(game.state), now / 1000);
    panel.update(now);
  });

  // Guardado automático: cada pocos segundos y al salir o minimizar.
  window.setInterval(() => void save(), AUTOSAVE_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void save();
  });
  window.addEventListener('pagehide', () => void save());

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
  message.style.cssText = 'position:fixed;inset:0;margin:0;padding:16px;color:#ff6b5e;white-space:pre-wrap';
  message.textContent = `Little World no pudo arrancar:\n${String(error)}`;
  document.body.append(message);
});
