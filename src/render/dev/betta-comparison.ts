import { Application, Container, Graphics } from "pixi.js";
import { CodeBetta } from "../tank/code-betta";
import { getSpecies } from "../../sim";
import { IllustratedBetta } from "./illustrated-betta";
import { loadIllustratedBettaArt } from "./illustrated-betta-art";
import {
  BETTA_SCENARIOS,
  BettaComparisonSession,
  type BettaScenario,
} from "./betta-comparison-session";
import { texts } from "../ui/texts";
import "./betta-comparison.css";
let active: HTMLDialogElement | undefined;
/** Shared physics fixture, separate renderer resources; closing always frees this Pixi application. */
export async function openBettaComparison(
  options: { standalone?: boolean } = {},
): Promise<void> {
  if (active) {
    active.focus();
    return;
  }
  const t = texts.bettaIllustrated,
    dialog = document.createElement("dialog");
  active = dialog;
  dialog.className = "betta-comparison";
  dialog.setAttribute("aria-label", t.label);
  const header = document.createElement("header"),
    title = document.createElement("h1"),
    close = document.createElement("button");
  title.textContent = t.title;
  close.type = "button";
  close.textContent = t.close;
  close.onclick = () => dialog.close();
  header.append(title, close);
  const intro = document.createElement("p");
  intro.textContent = t.intro;
  const controls = document.createElement("div");
  controls.className = "betta-comparison-controls";
  const select = document.createElement("select");
  select.setAttribute("aria-label", t.scenario);
  for (const id of BETTA_SCENARIOS) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = t.scenarios[id].label;
    select.append(option);
  }
  const zoom = document.createElement("input");
  zoom.type = "range";
  zoom.min = "1";
  zoom.max = "8";
  zoom.step = ".25";
  zoom.value = "3";
  zoom.setAttribute("aria-label", t.zoom);
  const zoomLabel = document.createElement("label"),
    zoomOutput = document.createElement("output");
  zoomLabel.append(t.zoom + " ", zoom, zoomOutput);
  const fps = document.createElement("select");
  fps.setAttribute("aria-label", t.fps);
  for (const value of [15, 30, 60, 120]) {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = value + " FPS";
    fps.append(option);
  }
  fps.value = "60";
  const pause = document.createElement("button"),
    reset = document.createElement("button"),
    sequence = document.createElement("button"),
    guide = document.createElement("input"),
    guideLabel = document.createElement("label");
  pause.textContent = t.pause;
  reset.textContent = t.replay;
  sequence.textContent = t.sequence;
  guide.type = "checkbox";
  guideLabel.append(guide, " " + t.guides);
  guide.setAttribute("aria-label", t.guides);
  controls.append(select, zoomLabel, fps, pause, reset, sequence, guideLabel);
  const description = document.createElement("p");
  description.className = "betta-description";
  const labels = document.createElement("div");
  labels.className = "betta-model-labels";
  for (const name of [t.current, t.illustrated]) {
    const h = document.createElement("h2");
    h.textContent = name;
    labels.append(h);
  }
  const host = document.createElement("div");
  host.className = "betta-comparison-canvas";
  const status = document.createElement("output"),
    scale = document.createElement("p");
  scale.textContent = t.length + " · " + t.small;
  dialog.append(
    header,
    intro,
    controls,
    description,
    labels,
    host,
    status,
    scale,
  );
  document.body.append(dialog);
  dialog.showModal();
  let app: Application | undefined,
    applicationReady = false,
    frame = 0,
    closed = false,
    paused = false,
    automatic = false;
  let current: CodeBetta | undefined, illustrated: IllustratedBetta | undefined;
  dialog.addEventListener(
    "close",
    () => {
      closed = true;
      cancelAnimationFrame(frame);
      current?.destroy();
      illustrated?.destroy();
      // Keep Pixi global pools alive: the main aquarium renderer is still using them.
      if (applicationReady)
        app?.destroy(
          { removeView: true, releaseGlobalResources: false },
          {
            children: true,
            texture: false,
            textureSource: false,
          },
        );
      dialog.remove();
      active = undefined;
      if (options.standalone) location.assign(import.meta.env.BASE_URL);
    },
    { once: true },
  );
  try {
    const art = await loadIllustratedBettaArt();
    if (closed) return;
    app = new Application();
    await app.init({
      width: 1100,
      height: 450,
      background: 0x153b3b,
      antialias: true,
      resolution: Math.min(2, devicePixelRatio || 1),
      autoDensity: true,
      preference: "webgl",
      autoStart: false,
    });
    applicationReady = true;
    if (closed) {
      app.destroy(
        { removeView: true, releaseGlobalResources: false },
        { children: true },
      );
      return;
    }
    host.append(app.canvas);
    app.canvas.setAttribute("aria-label", t.title);
    app.canvas.style.width = "100%";
    app.canvas.style.height = "auto";
    const views: [Container, Container] = [new Container(), new Container()],
      foodInk = [new Graphics(), new Graphics()],
      camera = [new Container(), new Container()];
    const bounds = new Graphics();
    app.stage.addChild(bounds);
    for (let i = 0; i < 2; i++) {
      const x = i * 550;
      for (let row = 0; row < 70; row++)
        bounds
          .rect(x, (row * 450) / 70, 549, 450 / 70 + 1)
          .fill({ color: 0x365f5c, alpha: 0.45 - (row / 70) * 0.35 });
      bounds.rect(x, 407, 549, 43).fill(0x425d4e);
      const mask = new Graphics().rect(x + 1, 0, 548, 450).fill(0xffffff);
      app.stage.addChild(views[i]!, mask);
      views[i]!.mask = mask;
      views[i]!.addChild(camera[i]!);
      camera[i]!.addChild(foodInk[i]!);
    }
    let session = new BettaComparisonSession("swim");
    const recreate = () => {
      current?.destroy();
      illustrated?.destroy();
      session = new BettaComparisonSession(select.value as BettaScenario);
      current = new CodeBetta(1, 1, getSpecies("betta"));
      illustrated = new IllustratedBetta(1, 1, art);
      camera[0]!.addChild(current.container);
      camera[1]!.addChild(illustrated.container);
      description.textContent = t.scenarios[session.scenario].description;
    };
    select.onchange = () => {
      automatic = false;
      recreate();
    };
    reset.onclick = recreate;
    pause.onclick = () => {
      paused = !paused;
      pause.textContent = paused ? t.resume : t.pause;
    };
    sequence.onclick = () => {
      automatic = true;
      paused = false;
      pause.textContent = t.pause;
      select.value = "swim";
      recreate();
    };
    recreate();
    let last = performance.now(),
      accumulator = 0,
      rendered = 0;
    const render = (dt: number) => {
      const b = session.body,
        m = session.motion.bettas.get(1),
        input = session.illustratedInput,
        k = 550 / session.width,
        length = session.lengthCm * k,
        scaleValue = Number(zoom.value);
      current!.update(
        b,
        b.x * k,
        b.y * k,
        length,
        dt,
        getSpecies("betta").swim.speedCmS,
        session.animal.intent,
        session.animal.alive,
        true,
        0,
        m,
        input.condition,
      );
      illustrated!.setGuides(guide.checked);
      illustrated!.update(input, b.x * k, b.y * k, length, dt, true);
      for (let i = 0; i < 2; i++) {
        camera[i]!.scale.set(scaleValue);
        camera[i]!.pivot.set(b.x * k, b.y * k);
        camera[i]!.position.set(i * 550 + 275, 210);
        const g = foodInk[i]!;
        g.clear();
        g.zIndex = 3;
        for (const grain of session.food.particles)
          g.circle(
            grain.x * k,
            grain.y * k,
            Math.max(0.8, grain.size * k),
          ).fill({ color: 0xf4ca85, alpha: 0.95 });
        camera[i]!.sortableChildren = true;
      }
      zoomOutput.textContent = scaleValue.toFixed(2) + "×";
      if (rendered++ % 8 === 0)
        status.textContent = `${t.state}: ${m?.mode ?? "wander"} / ${m?.stroke ?? "float"} · ${t.speed}: ${Math.hypot(b.vx, b.vy).toFixed(2)} cm/s · ${t.effort}: ${Math.round(illustrated!.pose.effort * 100)}% · ${Number(fps.value)} FPS`;
    };
    render(0);
    app.render();
    const tick = (now: number) => {
      if (closed) return;
      const elapsed = Math.min(0.25, Math.max(0, (now - last) / 1000));
      last = now;
      if (!paused) {
        accumulator += elapsed;
        const step = 1 / Number(fps.value);
        while (accumulator >= step) {
          session.update(step);
          render(step);
          accumulator -= step;
        }
      } else {
        accumulator = 0;
        render(0);
      }
      if (automatic && session.seconds >= 7) {
        const next =
          (BETTA_SCENARIOS.indexOf(session.scenario) + 1) %
          BETTA_SCENARIOS.length;
        select.value = BETTA_SCENARIOS[next]!;
        recreate();
      }
      app!.render();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  } catch (error) {
    intro.textContent = t.error;
    console.error(error);
  }
}
