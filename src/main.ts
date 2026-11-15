import { Application, TextureSource } from 'pixi.js';
import { Game } from './game';
import { RoomScene } from './render/scene/room-scene';
import { DebugPanel } from './render/ui/debug-panel';
import { fill, texts } from './render/ui/texts';
import { GAME_HEIGHT, GAME_WIDTH, attachViewport } from './render/viewport';
import { SAVE_FORMAT_VERSION, createSave } from './save/save-format';
import { readSave, writeSave } from './save/storage';
import { derive } from './sim';
import './styles.css';

/** Autoguardado cada 1 minuto (además de al pasar a segundo plano). */
const AUTOSAVE_MS = 60_000;
const SAVE_AFTER_ACTION_MS = 300;

function randomSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

/** Carga la partida guardada o arranca una pecera nueva. */
async function loadGame(): Promise<{ game: Game; savingWorks: boolean; note: string }> {
  const s = texts.save;
  try {
    const result = await readSave();
    if (result.status === 'ok') {
      const note =
        result.migratedFrom === null
          ? s.loaded
          : fill(s.migrated, { version: result.migratedFrom });
      return {
        game: new Game(result.save.sim, result.save.settings.speed),
        savingWorks: true,
        note,
      };
    }
    if (result.status === 'invalid') console.warn('Partida ilegible:', result.reason);
    const note =
      result.status === 'empty'
        ? s.newTank
        : result.status === 'too_new'
          ? fill(s.tooNew, { version: result.formatVersion })
          : s.invalid;
    return { game: Game.newTank(randomSeed()), savingWorks: true, note };
  } catch (error) {
    console.warn('No se pudo usar IndexedDB; la partida no se va a guardar.', error);
    return { game: Game.newTank(randomSeed()), savingWorks: false, note: '' };
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

  const { game, savingWorks, note } = await loadGame();
  let lastSavedAt = 0;
  let saveNote = note;
  let saving = false;

  const save = async (): Promise<void> => {
    if (!savingWorks || saving || !game.dirty) return;
    saving = true;
    game.dirty = false;
    try {
      const now = Date.now();
      await writeSave(createSave(game.state, { speed: game.speed }, now));
      lastSavedAt = now;
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
  });

  app.ticker.add((ticker) => {
    game.update(ticker.deltaMS / 1000);
    // Después de una acción del jugador se guarda enseguida.
    if (game.saveSoon) {
      game.saveSoon = false;
      window.setTimeout(() => void save(), SAVE_AFTER_ACTION_MS);
    }
    const now = performance.now();
    scene.update(game.state, derive(game.state), now / 1000);
    panel.update(now);
  });

  // Guardado automático: cada minuto y al salir o pasar a segundo plano.
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
  message.style.cssText =
    'position:fixed;inset:0;margin:0;padding:16px;color:#ff6b5e;white-space:pre-wrap';
  message.textContent = `${texts.bootError}\n${String(error)}`;
  document.body.append(message);
});
