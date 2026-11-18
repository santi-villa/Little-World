import { Application, Assets, Container, FillGradient, Graphics, Rectangle, Sprite, type Texture } from 'pixi.js';
import { Camera } from '../camera';
import { lerpColor } from '../pixel-utils';
import { drawSky } from '../scene/window-view';
import { attachViewport, GAME_HEIGHT, GAME_WIDTH } from '../viewport';
import { loadIllustratedBettaArt } from './illustrated-betta-art';
import { roomPreview as layout } from './room-preview-layout';
import { buildPreviewTank, type PreviewTextures } from './room-preview-tank';
import './room-preview.css';

const weather = {
  day: { light: 1, condition: 'clear', tint: 0xffffff },
  rain: { light: 0.76, condition: 'rain', tint: 0xc6c8c6 },
  night: { light: 0, condition: 'clear', tint: 0x667690 },
} as const;

export async function openRoomPreview(): Promise<void> {
  const stage = document.getElementById('stage');
  if (!stage) throw new Error('Falta el escenario de la habitación ilustrada.');
  document.body.classList.add('illustrated-room-preview');
  document.title = 'Habitación ilustrada · Little World';

  const controls = document.createElement('header');
  controls.className = 'room-preview-controls';
  controls.innerHTML = `
    <a class="preview-back">Volver al juego</a>
    <h1>Habitación ilustrada</h1>
    <div class="preview-actions">
      <label>Ventana
        <select name="weather">
          <option value="day">Día</option>
          <option value="rain">Lluvia</option>
          <option value="night">Noche</option>
        </select>
      </label>
      <button type="button" class="preview-focus" disabled>Acercar a la pecera</button>
      <button type="button" class="preview-feed" disabled>Dar comida</button>
    </div>
  `;
  controls.querySelector<HTMLAnchorElement>('.preview-back')!.href = import.meta.env.BASE_URL;
  stage.before(controls);
  const status = document.createElement('p');
  status.className = 'preview-loading';
  status.setAttribute('role', 'status');
  status.textContent = 'Preparando la habitación…';
  stage.append(status);

  const [loaded, bettaArt] = await Promise.all([
    Promise.all(Object.entries(layout.assets).map(async ([name, file]) => {
      const texture = await Assets.load<Texture>(`${import.meta.env.BASE_URL}assets/${file}`);
      texture.source.scaleMode = 'linear';
      return [name, texture] as const;
    })),
    loadIllustratedBettaArt(),
  ]);
  const textures = Object.fromEntries(loaded) as PreviewTextures;
  const app = new Application();
  await app.init({
    width: GAME_WIDTH, height: GAME_HEIGHT, background: 0x151c20,
    preference: 'webgl', antialias: true, resolution: Math.min(2, window.devicePixelRatio || 1),
  });
  app.canvas.setAttribute('aria-label', 'Habitación y pecera ilustradas con un betta animado');
  stage.append(app.canvas);
  attachViewport(app.canvas, stage);
  app.canvas.style.imageRendering = 'auto';
  status.remove();

  const world = new Container();
  app.stage.addChild(world);
  const camera = new Camera(world);

  const outside = new Container({ label: 'room-preview-exterior' });
  const { x, y, width, height } = layout.window;
  const windowMask = new Graphics().rect(x, y, width, height).fill(0xffffff);
  outside.mask = windowMask;
  const skyBase = new Graphics();
  const sky = new Graphics();
  outside.addChild(skyBase, sky);
  const room = new Sprite(textures.room);
  room.width = GAME_WIDTH;
  room.height = GAME_HEIGHT;
  const decor = layout.pots.map(item => {
    const pot = new Sprite(textures[item.asset]);
    pot.anchor.set(0.5, 1);
    pot.scale.set(item.height / pot.texture.height);
    pot.position.set(item.x, item.y);
    return pot;
  });

  const tank = buildPreviewTank(textures, bettaArt);
  const tankScale = layout.tank.width / layout.tank.shellWidth;
  const tankHeight = tank.hitArea.height * tankScale;
  const centerX = layout.tank.x + layout.tank.width / 2;
  tank.container.scale.set(tankScale);
  tank.container.position.set(layout.tank.x, layout.tank.baseY - tankHeight);

  const tableShadow = new Graphics()
    .ellipse(centerX + 7, layout.tank.baseY - 5, layout.tank.width * 0.51, 9)
    .fill(new FillGradient({
      type: 'radial', colorStops: [{ offset: 0, color: '#35281dbb' }, { offset: 1, color: '#35281d00' }],
    }));
  const wallLight = new Graphics()
    .ellipse(centerX, layout.tank.baseY - tankHeight + 11, layout.tank.width * 0.63, tankHeight * 0.84)
    .fill(new FillGradient({
      type: 'radial', colorStops: [{ offset: 0, color: '#c9deb944' }, { offset: 1, color: '#c9deb900' }],
    }));
  world.addChild(windowMask, outside, room, ...decor, tableShadow, wallLight, tank.container);

  let focused = false;
  const focusBtn = controls.querySelector<HTMLButtonElement>('.preview-focus')!;
  const feedBtn = controls.querySelector<HTMLButtonElement>('.preview-feed')!;
  const weatherSelect = controls.querySelector<HTMLSelectElement>('[name="weather"]')!;
  function setFocus(value: boolean) {
    focused = value;
    const framing = focused
      ? { x: centerX, y: layout.tank.baseY - tankHeight / 2, zoom: 2.38 }
      : { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, zoom: 1 };
    camera.goTo(framing, false, layout.transitionSeconds);
    focusBtn.textContent = focused ? 'Ver habitación' : 'Acercar a la pecera';
  }
  focusBtn.disabled = feedBtn.disabled = false;
  focusBtn.onclick = () => setFocus(!focused);
  feedBtn.onclick = () => tank.feed();
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && focused) setFocus(false);
  });
  tank.container.eventMode = 'static';
  tank.container.cursor = 'pointer';
  tank.container.hitArea = new Rectangle(0, 0, tank.hitArea.width, tank.hitArea.height);
  tank.container.on('pointertap', event => {
    if (camera.transitioning) return;
    if (!focused) setFocus(true);
    else {
      const point = event.getLocalPosition(tank.container);
      tank.tap(point.x, point.y);
    }
  });

  let seconds = 0;
  let nextSky = 0;
  let currentTint = weather.day.tint as number;
  function updateSky(force = false) {
    if (!force && seconds < nextSky) return;
    nextSky = seconds + 1 / 24;
    const frame = weather[weatherSelect.value as keyof typeof weather];
    if (currentTint !== frame.tint || force) {
      currentTint = frame.tint;
      drawSky(skyBase.clear(), layout.window, frame.light, frame.condition, seconds, 'base');
      room.tint = frame.tint;
      for (const pot of decor) pot.tint = frame.tint;
      wallLight.alpha = 1 - frame.light * 0.53;
      tableShadow.tint = lerpColor(0xc3d4e0, 0xffffff, frame.light);
    }
    drawSky(sky.clear(), layout.window, frame.light, frame.condition, seconds);
  }
  weatherSelect.onchange = () => updateSky(true);
  updateSky(true);
  app.ticker.add(({ deltaMS }) => {
    const dt = Math.min(0.05, deltaMS / 1000);
    seconds += dt;
    updateSky();
    tank.update(dt);
    camera.update(dt);
  });
}
