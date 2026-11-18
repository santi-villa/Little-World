import ecosystem from './data/ecosystem.json';
import {FishFocus} from './render/ui/fish-focus';
import { beforeAppUpdate, startAppUpdates } from './app-update';
import { AquariumPanel } from './render/ui/aquarium-panel';
import { Application, TextureSource } from 'pixi.js';
import { Game } from './game';
import { loadAssets } from './render/assets';
import { RoomScene } from './render/scene/room-scene';
import { enableTips, follow, longPress, setCursor } from './render/ui/cursor';
import { HudPaper } from './render/ui/hud-paper';
import { initUiArt } from './render/ui/paper-ui';
import { uiInsets } from './render/ui/scene-ui';
import { ToolTray } from './render/ui/tool-tray';
import { WelcomePanel } from './render/ui/welcome';
import { DebugPanel } from './render/ui/debug-panel';
import { fill, texts } from './render/ui/texts';
import { GAME_HEIGHT, GAME_WIDTH, attachViewport } from './render/viewport';
import { SAVE_FORMAT_VERSION, createSave } from './save/save-format';
import { deleteSave, readSave, writeSave } from './save/storage';
import { MINUTES_PER_DAY, defaultConfig, derive } from './sim';
import { BuenosAiresWeather } from './world/weather';
import './styles.css';
import './ui.css';

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
        game: new Game(result.save.sim, result.save.settings, result.save.player),
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

async function boot(illustrated: boolean): Promise<void> {
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
    antialias: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
    autoDensity: false,
    roundPixels: false,
    powerPreference: 'low-power',
    // Los filtros propios (vaivén de las plantas) están escritos en GLSL.
    preference: 'webgl',
  });
  stage.append(app.canvas);
  // El canvas queda en 1280x720 y el navegador lo agranda (ver viewport.ts).
  // Cambiar la resolución del canvas según la pantalla corría y achicaba la
  // escena en algunos celulares, así que no se hace.
  attachViewport(app.canvas, stage);
  if (illustrated) app.canvas.style.imageRendering = 'auto';

  const { game, savingWorks, note, lastTimestamp } = await loadGame();
  const welcome = new WelcomePanel(document.body);
  // Buenos Aires: modeled current weather, solar times, cache and historical temperatures.
  let weatherStorage: Storage | undefined;
  try { weatherStorage = localStorage; } catch { /* Private mode: memory cache only. */ }
  const outdoor = new BuenosAiresWeather(fetch, weatherStorage);
  const syncWeather = (): void => {
    const view = outdoor.view();
    if (game.outdoorC !== view.temperatureC) game.setOutdoor(view.temperatureC);
    if (game.weather !== view.weather) game.setWeather(view.weather);
  };
  syncWeather();
  void outdoor.refresh().then(syncWeather);
  window.setInterval(() => void outdoor.refresh().then(syncWeather), 30 * 60_000);
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
    if (!(sinceMs > 0) || elapsedMs < 20_000 || game.speed <= 0) return;

    const maxMs = defaultConfig.clock.maxCatchUpDays * MINUTES_PER_DAY * 60_000;
    let hourly: number[] | undefined;
    try {
      hourly = await outdoor.hourlyC(sinceMs, Math.min(elapsedMs, maxMs) / 3_600_000);
    } catch (error) {
      console.warn('Sin histórico de temperatura exterior; se usa el valor de referencia.', error);
      game.note(texts.careUi.historico_estimado);
    }
    const report = game.catchUp(elapsedMs, hourly);
    if (!report) return;
    if (report.result.elapsedMinutes >= defaultConfig.clock.welcomeMinMinutes) {
      welcome.show(report.result.summary);
    }
  };
  const initialRecovery = catchUpSince(lastTimestamp).then(()=>game.enableGrains());

  let lastSavedAt = 0;
  let saveNote = note;
  let saving = false;

  const save = async (): Promise<void> => {
    game.flushGrains();
    if (!savingWorks || saving || !game.dirty) return;
    saving = true;
    game.dirty = false;
    try {
      // El timestamp es el momento hasta el que la simulación está al día: si
      // el guardado sale estando en segundo plano, no se pierde ese tiempo.
      await writeSave(createSave(game.state, game.settings, syncedAt(), game.player));
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

  beforeAppUpdate(async()=>{
    await initialRecovery;
    // Wait for an in-flight save before requesting a final snapshot.
    while(saving)await new Promise(resolve=>window.setTimeout(resolve,25));
    game.dirty=true;
    await save();
    if(game.dirty||!savingWorks)throw new Error('No se pudo confirmar el guardado');
  });
  startAppUpdates();

  const saveStatus = (): string => {
    if (!savingWorks) return texts.save.unavailable;
    const prefix = fill(texts.save.status, { version: SAVE_FORMAT_VERSION });
    if (saveNote || lastSavedAt === 0) return saveNote ? `${prefix} · ${saveNote}` : prefix;
    const seconds = Math.max(0, Math.round((Date.now() - lastSavedAt) / 1000));
    return `${prefix} · ${fill(texts.save.ago, { seconds })}`;
  };

  const [bettaRenderer] = await Promise.all([
    illustrated ? import('./render/scene/illustrated-fish').then(({ loadBettaRenderer }) => loadBettaRenderer()) : undefined,
    loadAssets(illustrated),
  ]);
  // UI de papel y madera: arte en variables CSS, cursores y nombres al tocar largo.
  initUiArt();
  enableTips();
  const tray = new ToolTray((tool) => scene.selectTool(tool), () => scene.toggleLid());
  tray.onFoodKind=kind=>{game.state.food.kind=kind;game.dirty=true;game.saveSoon=true;};
  const tools = new AquariumPanel(game, outdoor, () => scene.showTank(), () => scene.showRoom(), (tool) => {
    const why = scene.selectTool(tool);
    if (why) tray.reject(tool, why);
  }, () => scene.toggleLid());
  const hud = new HudPaper(() => tools.open('weather'), () => tools.open('status'));
  const scene = new RoomScene((action) => {
    game.act(action);
    scene.syncState(game.state);
  }, (page, animalId) => {
    if(page==='fish' && animalId!==undefined){tools.openAnimal(animalId);return;}
    if (page === 'fish' || page === 'diary' || page === 'guide' || page === 'weather' || page === 'decor' || page === 'status') tools.open(page);
    else tools.care(page);
  }, illustrated, bettaRenderer);
  const fishFocus=new FishFocus(()=>scene.fishDetails(),()=>scene.showTank());
  tools.onObserveAnimal=id=>scene.showFish(id);
  tools.onMirror=id=>scene.showMirror(id);
  scene.onReject = (tool, reason) => tray.reject(tool, reason);
  app.stage.addChild(scene.container);
  // Render the room while historical data is loading, instead of showing a blank screen.
  scene.update(game.state, derive(game.state), performance.now() / 1000,
    { weather: game.weather, outside: outdoor.view(), decorId: game.player.decorId ?? 'default', bettaStyle:game.player.bettaStyle??'code' });
  tools.setBusy(true);
  // Mientras se recupera el acuario, el cursor es el reloj de arena.
  document.body.classList.add('busy');
  const recovering = document.createElement('div');
  recovering.className = 'recovery-status'; recovering.setAttribute('role', 'status');
  recovering.textContent = texts.careUi.recuperando_acuario;
  if (lastTimestamp > 0 && Date.now() - lastTimestamp >= 20_000) document.body.append(recovering);
  await initialRecovery;
  tools.setBusy(false); recovering.remove();
  document.body.classList.remove('busy');

  // An explicit flag also lets a production build be inspected without
  // putting debug controls in the normal player experience.
  const debug = import.meta.env.DEV || new URLSearchParams(location.search).has('debug');
  document.body.classList.toggle('has-debug-tools', debug);
  const panel = debug ? new DebugPanel(game, document.body, {
    saveStatus,
    onReset: (tankId) => { game.reset(randomSeed(), tankId); tools.open('guide'); },
    onNewGame: () => {
      // Se borra el guardado y se arranca de cero: pecera inicial con un solo betta.
      void deleteSave().finally(() => {
        game.reset(randomSeed());
        tools.open('guide');
      });
    },
    onSimulateAway: (minutes) => {
      const report = game.catchUp(minutes * 60_000);
      if (report) welcome.show(report.result.summary);
    },
  }) : undefined;

  // --- Tocar la escena: la escena decide (zonas, cámara, caricias, botones) ---
  const canvas = app.canvas;
  canvas.style.touchAction = 'none';
  const toScene = (event: {clientX:number;clientY:number}): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * GAME_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * GAME_HEIGHT,
    };
  };
  // Cursor según lo que hay debajo; con el dedo, la herramienta va pegada al
  // dedo mientras se arrastra y un toque largo dice qué es lo que se toca.
  let cancelLong: (() => void) | null = null;
  let pressStart: { x: number; y: number } | null = null;
  const toolUnderFinger = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse') return;
    const tool = scene.activeTool;
    follow(tool === 'hand' ? null : scene.cursorAt(toScene(event)), event.clientX, event.clientY);
  };
  const touches=new Map<number,{x:number;y:number}>();let pinching=false,pinchDistance=0;
  const pinch=()=>{const points=[...touches.values()];if(points.length<2)return;const a=points[0]!,b=points[1]!,distance=Math.hypot(a.x-b.x,a.y-b.y),rect=canvas.getBoundingClientRect();if(pinchDistance>0)scene.zoomAt({x:((a.x+b.x)/2-rect.left)/rect.width*GAME_WIDTH,y:((a.y+b.y)/2-rect.top)/rect.height*GAME_HEIGHT},distance/pinchDistance);pinchDistance=distance;};
  canvas.addEventListener('wheel',event=>{if(document.querySelector('dialog[open]'))return;event.preventDefault();const units=event.deltaMode===1?16:event.deltaMode===2?GAME_HEIGHT:1;scene.zoomAt(toScene(event),Math.exp(-Math.max(-300,Math.min(300,event.deltaY*units))*ecosystem.camera.wheelRate));},{passive:false});
  canvas.addEventListener('pointerdown', (event) => {
    if(event.pointerType==='touch'){touches.set(event.pointerId,{x:event.clientX,y:event.clientY});if(touches.size>=2){pinching=true;cancelLong?.();scene.cancelPress();pinch();canvas.setPointerCapture?.(event.pointerId);return;}}

    canvas.setPointerCapture?.(event.pointerId);
    const p = toScene(event);
    scene.pointerDown(p);
    setCursor(scene.cursorAt(p));
    toolUnderFinger(event);
    pressStart = { x: event.clientX, y: event.clientY };
    cancelLong?.();
    cancelLong = longPress(() => scene.describe(p), () => scene.cancelPress());
  });
  canvas.addEventListener('pointermove', (event) => {
    if(touches.has(event.pointerId))touches.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pinching){pinch();return;}
    const p = toScene(event);
    scene.pointerMove(p);
    setCursor(scene.cursorAt(p));
    if (pressStart) toolUnderFinger(event);
    if (pressStart && Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) > 10) {
      cancelLong?.();
      cancelLong = null;
    }
  });
  const release = (event: PointerEvent, cancelled = false): void => {
    touches.delete(event.pointerId);if(pinching){if(touches.size===0){pinching=false;pinchDistance=0;}scene.pointerUp(toScene(event),true);return;}
    cancelLong?.();
    cancelLong = null;
    pressStart = null;
    const calm=document.body.classList.contains('contemplating');
    scene.pointerUp(toScene(event), cancelled||calm);if(calm)tools.revealControls();
    setCursor(scene.cursorAt(toScene(event)));
    follow(null, 0, 0);
  };
  canvas.addEventListener('pointerup', (event) => release(event));
  canvas.addEventListener('dblclick',()=>{if(scene.followingId!==null)scene.fishDetails();});
  canvas.addEventListener('pointerleave', () => scene.pointerLeave());
  canvas.addEventListener('pointercancel', (event) => release(event, true));

  window.addEventListener('keydown',e=>{if(e.key==='Escape')tools.revealControls();if(e.key==='0'&&!['INPUT','SELECT','TEXTAREA'].includes((e.target as HTMLElement)?.tagName))scene.showTank();});
  let lastFrame = performance.now();
  app.ticker.add(() => {
    const frame = performance.now();
    const elapsed = (frame - lastFrame) / 1000;
    lastFrame = frame;
    game.observeFeedingContacts(scene.feedingContacts);game.observeGrains(scene.foodPositions,scene.grainContacts);
    if (hiddenAt === null && recoveringFrom === null) game.update(elapsed);
    tools.update();
    fishFocus.update(game.state.animals.find(a=>a.id===scene.followingId));
    hud.update(game.state, game.weather, derive(game.state).hour);
    tray.update(scene.activeTool, game.state.tank.hasLid,game.state.food.kind);
    // La cámara deja la pecera arriba de la bandeja: su alto, en píxeles del juego.
    const trayHeight = tray.height;
    const viewportScale = canvas.clientHeight / GAME_HEIGHT;
    if (viewportScale > 0) {
      if (trayHeight > 0) {
        uiInsets.bottom = Math.round((trayHeight + 12) / viewportScale);
        document.body.style.setProperty('--tray-height', `${trayHeight}px`);
      }
      const chrome = window.innerWidth <= 760 ? 49 : 57;
      // The canvas is letterboxed. Only reserve the part that the UI overlaps.
      uiInsets.top = Math.max(12, Math.round((chrome - canvas.offsetTop) / viewportScale));
    }
    // Después de una acción del jugador se guarda enseguida.
    if (game.saveSoon) {
      game.saveSoon = false;
      window.setTimeout(() => void save(), SAVE_AFTER_ACTION_MS);
    }
    const now = performance.now();
    scene.update(game.state, derive(game.state), now / 1000, { weather: game.weather, outside: outdoor.view(), decorId: game.player.decorId ?? 'default', bettaStyle:game.player.bettaStyle??'code' });
    panel?.update(now);
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
    lastFrame = performance.now();
    recoveringFrom = since;
    void catchUpSince(since).finally(() => {
      recoveringFrom = null;
      lastFrame = performance.now();
      void outdoor.refresh().then(syncWeather);
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

const query = new URL(location.href).searchParams;
const entry = query.has('room-preview')
  ? import('./render/dev/room-preview').then(({ openRoomPreview }) => openRoomPreview())
  : import.meta.env.DEV && query.has('betta-lab')
    ? import('./render/dev/betta-comparison').then(({ openBettaComparison }) => openBettaComparison({ standalone: true }))
    : boot(!query.has('classic-room'));
entry.catch((error) => {
  console.error(error);
  const message = document.createElement('pre');
  message.style.cssText =
    'position:fixed;inset:0;margin:0;padding:16px;color:#ff6b5e;white-space:pre-wrap';
  message.textContent = `${texts.bootError}\n${String(error)}`;
  document.body.append(message);
});
