/**
 * Botones y carteles en pantalla (no se mueven con la cámara): "volver", las
 * acciones de cuidado de la vista de pecera, los paneles provisorios de la
 * biblioteca y el cuaderno, y avisos cortos. Dibujado con la fuente de píxeles,
 * en píxeles gordos de 2x2 (coordenadas de 640x360).
 */

import { Container, Graphics } from 'pixi.js';
import type { SimAction, SimState } from '../../sim';
import type { PanelId } from '../scene/room-zones';
import { GAME_HEIGHT, GAME_WIDTH } from '../viewport';
import { drawPixelText, textWidth } from './pixel-font';
import { texts } from './texts';

const U = 2;
const W = GAME_WIDTH / U;
const H = GAME_HEIGHT / U;
const INK = 0xf4e9c8;
/** Barra de acciones de la vista de pecera: alto en unidades de 2 px. */
const BAR = 44;
/** Alto de la barra de acciones, en píxeles de la pantalla (la cámara deja la pecera arriba). */
export const CARE_BAR_HEIGHT = BAR * U;
const BOX = 0x0a0d18;

export type CareId = keyof typeof texts.scene.care;
export type UiMode = 'room' | 'tank' | 'cat';

/** Acciones de cuidado de la vista de pecera. */
const CARE: { id: CareId; action: (state: SimState) => SimAction; when?: (state: SimState) => boolean }[] = [
  { id: 'feed', action: () => ({ type: 'feed', grams: 0.1 }) },
  { id: 'cleanGlass', action: () => ({ type: 'cleanGlass' }) },
  {
    id: 'waterChange',
    action: (state) => ({
      type: 'waterChange',
      fraction: 0.25,
      conditioned: true,
      vacuum: true,
      temperatureC: state.water.temperatureC,
    }),
  },
  { id: 'topOff', action: (state) => ({ type: 'topOff', conditioned: true, temperatureC: state.water.temperatureC }) },
  { id: 'cleanFilter', action: () => ({ type: 'cleanFilter', method: 'tankWater' }) },
  {
    id: 'removeDead',
    action: () => ({ type: 'removeDead' }),
    when: (state) => state.animals.some((animal) => !animal.alive),
  },
];

interface Button {
  x: number;
  y: number;
  w: number;
  h: number;
  hit: UiHit;
}

export type UiHit = { kind: 'back' } | { kind: 'care'; id: CareId; action: SimAction } | { kind: 'panel' };

export class SceneUi {
  readonly container = new Container();
  private readonly graphics = new Graphics();
  private buttons: Button[] = [];
  private panel: PanelId | null = null;
  private toast: { text: string; until: number } | null = null;
  /** Último botón tocado, para que se ilumine un instante. */
  private pressed: { id: string; until: number } | null = null;
  private seconds = 0;

  constructor() {
    this.container.scale.set(U);
    this.container.addChild(this.graphics);
  }

  get panelOpen(): boolean {
    return this.panel !== null;
  }

  openPanel(id: PanelId): void {
    this.panel = id;
  }

  closePanel(): void {
    this.panel = null;
  }

  /** Aviso corto abajo al centro. */
  say(text: string): void {
    this.toast = { text, until: this.seconds + 1.8 };
  }

  /** Marca un botón como recién tocado y avisa lo que se hizo. */
  pressedCare(id: CareId): void {
    this.pressed = { id, until: this.seconds + 0.25 };
    this.say(texts.scene.done[id]);
  }

  /** ¿Qué botón hay en ese punto de la pantalla (píxeles del juego)? */
  hit(screenX: number, screenY: number): UiHit | null {
    if (this.panel) return { kind: 'panel' };
    const x = screenX / U;
    const y = screenY / U;
    for (const b of this.buttons) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.hit;
    }
    return null;
  }

  /** @param focusAge Segundos desde que se entró a la vista de cerca. */
  update(mode: UiMode, state: SimState, seconds: number, focusAge: number): void {
    this.seconds = seconds;
    const g = this.graphics;
    g.clear();
    this.buttons = [];
    const t = texts.scene;

    if (mode !== 'room') {
      // Volver: botón grande, fácil de tocar con el dedo.
      const bw = textWidth(t.back, 2) + 16;
      this.button(g, t.back, W - 6 - bw, 6, { kind: 'back' }, 'back', bw, 2);
      // Indicación para salir deslizando, que se apaga sola.
      if (focusAge < 4) {
        const w = textWidth(t.swipeHint) + 8;
        const x = Math.round((W - w) / 2);
        g.rect(x, 6, w, 11).fill({ color: BOX, alpha: 0.55 });
        drawPixelText(g, t.swipeHint, x + 4, 9, INK, 1);
      }
    }

    if (mode === 'tank') this.careBar(g, state);

    if (this.toast && seconds < this.toast.until) {
      const text = this.toast.text;
      const w = textWidth(text) + 10;
      const x = Math.round((W - w) / 2);
      const y = mode === 'tank' ? H - BAR - 16 : H - 28;
      g.rect(x, y, w, 11).fill({ color: BOX, alpha: 0.7 });
      drawPixelText(g, text, x + 5, y + 3, INK, 1);
    } else {
      this.toast = null;
    }

    if (this.panel) {
      const p = t.panels[this.panel];
      const lines = [p.title, '', ...p.body];
      const w = Math.max(...lines.map((line) => textWidth(line)), textWidth(t.panels.close)) + 24;
      const h = lines.length * 8 + 26;
      const x = Math.round((W - w) / 2);
      const y = Math.round((H - h) / 2);
      g.rect(0, 0, W, H).fill({ color: BOX, alpha: 0.35 });
      g.rect(x, y, w, h).fill({ color: 0x2a1f18, alpha: 0.94 });
      g.rect(x, y, w, 1).rect(x, y + h - 1, w, 1).rect(x, y, 1, h).rect(x + w - 1, y, 1, h).fill(0x9a6c46);
      lines.forEach((line, i) => drawPixelText(g, line, x + 12, y + 10 + i * 8, i === 0 ? 0xffd98a : INK, 1));
      drawPixelText(g, t.panels.close, x + 12, y + h - 12, 0xa9b6d8, 1);
    }
  }

  /**
   * Barra de acciones abajo, debajo de la pecera: botones grandes para el dedo,
   * con letra doble (y en dos renglones si no entra).
   */
  private careBar(g: Graphics, state: SimState): void {
    const t = texts.scene;
    const visible = CARE.filter((care) => !care.when || care.when(state));
    const top = H - BAR;
    g.rect(0, top, W, BAR).fill({ color: BOX, alpha: 0.6 });
    g.rect(0, top, W, 1).fill({ color: INK, alpha: 0.15 });
    const gap = 4;
    const margin = 6;
    const w = Math.floor((W - margin * 2 - gap * (visible.length - 1)) / visible.length);
    const h = BAR - 10;
    visible.forEach((care, i) => {
      const x = margin + i * (w + gap);
      const y = top + 5;
      const lit = this.pressed && this.pressed.id === care.id && this.seconds < this.pressed.until;
      g.rect(x, y, w, h).fill({ color: lit ? 0x3a6a78 : 0x1e2a3a, alpha: 0.92 });
      g.rect(x, y, w, 1).fill({ color: INK, alpha: 0.25 });
      g.rect(x, y + h - 1, w, 1).fill({ color: 0x000000, alpha: 0.3 });
      // Letra doble; si no entra en un renglón, una palabra por renglón.
      const label = t.care[care.id];
      const lines = textWidth(label, 2) <= w - 6 ? [label] : label.split(' ');
      const lineH = 12;
      const y0 = y + Math.round((h - lines.length * lineH + 2) / 2);
      lines.forEach((line, k) => {
        drawPixelText(g, line, x + Math.round((w - textWidth(line, 2)) / 2), y0 + k * lineH, INK, 2);
      });
      this.buttons.push({ x, y, w, h, hit: { kind: 'care', id: care.id, action: care.action(state) } });
    });
  }

  private button(g: Graphics, label: string, x: number, y: number, hit: UiHit, id: string, width?: number, size = 1): void {
    const w = width ?? textWidth(label, size) + 8;
    const h = 5 * size + 6 * size;
    const lit = this.pressed && this.pressed.id === id && this.seconds < this.pressed.until;
    g.rect(x, y, w, h).fill({ color: lit ? 0x3a6a78 : BOX, alpha: 0.72 });
    g.rect(x, y, w, 1).fill({ color: INK, alpha: 0.18 });
    drawPixelText(g, label, x + Math.round((w - textWidth(label, size)) / 2), y + 3 * size, INK, size);
    this.buttons.push({ x, y, w, h, hit });
  }
}
