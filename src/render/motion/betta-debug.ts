import {
  bettaParameters as config,
  type BettaDynamics,
} from './betta-dynamics';
import type { FishBody } from './fish-motion';
import type { Graphics } from 'pixi.js';
/** Only dynamically imported under import.meta.env.DEV; absent from the production UI. */
export class BettaDebug {
  private panel = document.createElement('aside');
  private stats = document.createElement('pre');
  private timer: ReturnType<typeof setTimeout> | undefined;
  private start = { x: 0, y: 0 };
  constructor() {
    this.panel.hidden = true;
    this.panel.setAttribute('aria-label', 'Ajuste de movimiento del betta');
    Object.assign(this.panel.style, {
      position: 'fixed',
      left: '8px',
      top: '70px',
      zIndex: '100',
      background: '#f3e3c2',
      color: '#5b3a24',
      padding: '12px',
      maxHeight: '75vh',
      overflow: 'auto',
      font: '14px monospace',
      maxWidth: '92vw',
    });
    this.panel.append(this.stats);
    for (const [key, range] of Object.entries(config.devSliders)) {
      const k = key as keyof typeof config,
        value = config[k];
      if (typeof value !== 'number') continue;
      const label = document.createElement('label'),
        input = document.createElement('input'),
        output = document.createElement('output');
      label.textContent = key + ' ';
      input.type = 'range';
      input.min = String(range[0]);
      input.max = String(range[1]);
      input.step = String(range[2]);
      input.value = String(value);
      output.textContent = String(value);
      input.addEventListener('input', () => {
        Object.assign(config, { [key]: Number(input.value) });
        output.textContent = input.value;
      });
      label.append(input, output);
      label.style.display = 'block';
      this.panel.append(label);
    }
    const copy = document.createElement('button'),
      json = document.createElement('textarea');
    copy.textContent = 'Copiar JSON';
    json.readOnly = true;
    json.setAttribute('aria-label', 'Parámetros JSON para copiar');
    json.hidden = true;
    copy.onclick = () => {
      json.hidden = false;
      json.value = JSON.stringify(config, null, 2);
      void (
        navigator.clipboard
          ? navigator.clipboard.writeText(json.value)
          : Promise.reject(new Error('Clipboard no disponible'))
      )
        .then(() => {
          copy.textContent = 'JSON copiado';
        })
        .catch(() => {
          json.focus();
          json.select();
          copy.textContent = 'Seleccioná y copiá el JSON';
        });
    };
    this.panel.append(copy, json);
    document.body.append(this.panel);
    const toggle = () => {
      this.panel.hidden = !this.panel.hidden;
    };
    document.addEventListener('keydown', (e) => {
      if (
        e.key.toLowerCase() === 'd' &&
        !e.repeat &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(
          (e.target as HTMLElement)?.tagName,
        )
      )
        toggle();
    });
    const cancel = () => {
      if (this.timer) clearTimeout(this.timer);
      this.timer = undefined;
    };
    document.addEventListener('pointerdown', (e) => {
      if (
        e.clientX > config.devCornerPixels ||
        e.clientY > config.devCornerPixels
      )
        return;
      cancel();
      this.start = { x: e.clientX, y: e.clientY };
      this.timer = setTimeout(toggle, config.devHoldMs);
    });
    document.addEventListener('pointermove', (e) => {
      if (
        Math.hypot(e.clientX - this.start.x, e.clientY - this.start.y) >
        config.devCornerPixels
      )
        cancel();
    });
    document.addEventListener('pointerup', cancel);
    document.addEventListener('pointercancel', cancel);
  }
  draw(
    g: Graphics,
    b: FishBody,
    m: BettaDynamics | undefined,
    x: number,
    y: number,
    scale: number,
  ): void {
    if (this.panel.hidden || !m) return;
    this.stats.textContent = `Betta ${b.id}: ${m.mode} / ${m.stroke}\nvelocidad ${Math.hypot(b.vx, b.vy).toFixed(2)} cm/s\nrumbo ${((b.heading * 180) / Math.PI).toFixed(1)}°\nobjetivo ${b.goalX.toFixed(1)}, ${b.goalY.toFixed(1)} cm\nfuerza ${m.force.x.toFixed(2)}, ${m.force.y.toFixed(2)}`;
    const arrow = (dx: number, dy: number, color: number) => {
      const length = Math.hypot(dx, dy),
        k = Math.min(
          1,
          config.devArrowPixels / Math.max(config.epsilon, length),
        );
      g.moveTo(x, y)
        .lineTo(x + dx * k, y + dy * k)
        .stroke({ color, width: 1 });
      g.circle(x + dx * k, y + dy * k, 2).fill(color);
    };
    arrow(
      m.force.x * config.devArrowScale,
      m.force.y * config.devArrowScale,
      0xe79d43,
    );
    arrow((b.goalX - b.x) * scale, (b.goalY - b.y) * scale, 0x91b9ce);
  }
}
