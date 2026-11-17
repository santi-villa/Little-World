/**
 * HUD mínimo: un papelito arriba a la izquierda con el día, la hora y un
 * iconito del clima, y al lado una gotita con el estado del agua (bien,
 * revisar, peligro) que al tocarla abre el detalle. Se oculta en Contemplar
 * (CSS). Las monedas se mostrarán solo al ganarlas o en la tienda (no hay
 * monedas todavía).
 */

import type { SimState, Weather } from '../../sim';
import { playPaper } from './ui-sound';
import { clockParts, fill, texts } from './texts';

type Level = 'ok' | 'check' | 'danger';

/** Íconos de 16x16 dibujados con rectángulos (nítidos a escala entera). */
const ICONS: Record<Weather | 'night', string> = {
  clear: '<rect x="6" y="1" width="4" height="2" fill="#f2b23a"/><rect x="6" y="13" width="4" height="2" fill="#f2b23a"/><rect x="1" y="6" width="2" height="4" fill="#f2b23a"/><rect x="13" y="6" width="2" height="4" fill="#f2b23a"/><rect x="4" y="4" width="8" height="8" fill="#f6c84e"/><rect x="5" y="5" width="3" height="2" fill="#fde49a"/>',
  cloudy: '<rect x="3" y="7" width="11" height="5" fill="#e9e4da"/><rect x="5" y="5" width="5" height="3" fill="#e9e4da"/><rect x="9" y="6" width="3" height="2" fill="#e9e4da"/><rect x="3" y="11" width="11" height="1" fill="#b9b2a6"/>',
  rain: '<rect x="3" y="4" width="11" height="5" fill="#b9bfc6"/><rect x="5" y="2" width="5" height="3" fill="#b9bfc6"/><rect x="4" y="11" width="1" height="2" fill="#4aa8c8"/><rect x="8" y="12" width="1" height="2" fill="#4aa8c8"/><rect x="12" y="11" width="1" height="2" fill="#4aa8c8"/>',
  storm: '<rect x="3" y="3" width="11" height="5" fill="#8c929c"/><rect x="5" y="1" width="5" height="3" fill="#8c929c"/><rect x="8" y="8" width="2" height="3" fill="#f2c23a"/><rect x="6" y="10" width="3" height="2" fill="#f2c23a"/><rect x="6" y="12" width="2" height="3" fill="#f2c23a"/>',
  night: '<rect x="6" y="2" width="5" height="2" fill="#f1e6c0"/><rect x="4" y="4" width="4" height="8" fill="#f1e6c0"/><rect x="6" y="12" width="5" height="2" fill="#f1e6c0"/><rect x="11" y="3" width="1" height="1" fill="#f1e6c0"/><rect x="13" y="7" width="1" height="1" fill="#f1e6c0"/>',
};
const DROP =
  '<rect x="7" y="1" width="2" height="2"/><rect x="6" y="3" width="4" height="2"/><rect x="5" y="5" width="6" height="2"/><rect x="4" y="7" width="8" height="5"/><rect x="5" y="12" width="6" height="2"/><rect x="6" y="14" width="4" height="1"/><rect x="6" y="8" width="2" height="2" fill="#ffffff" opacity=".7"/>';

const svg = (inner: string, fill = 'currentColor'): string =>
  `<svg viewBox="0 0 16 16" fill="${fill}" aria-hidden="true">${inner}</svg>`;

/** Qué tan mal está el agua según las alertas activas. */
export function waterLevel(state: SimState): Level {
  if (state.alerts.length === 0) return 'ok';
  return state.alerts.some((id) => /danger|toxic|death|lethal/.test(id)) ? 'danger' : 'check';
}

export class HudPaper {
  private readonly root = document.createElement('div');
  private readonly note = document.createElement('button');
  private readonly label = document.createElement('span');
  private readonly icon = document.createElement('span');
  private readonly drop = document.createElement('button');
  private key = '';

  constructor(openWeather: () => void, openWater: () => void) {
    this.root.className = 'hud-paper';
    this.note.type = 'button';
    this.note.className = 'hud-note';
    this.note.append(this.icon, this.label);
    this.note.addEventListener('click', () => {
      playPaper();
      openWeather();
    });
    this.drop.type = 'button';
    this.drop.className = 'hud-drop';
    this.drop.innerHTML = svg(DROP);
    this.drop.addEventListener('click', () => {
      playPaper();
      openWater();
    });
    this.root.append(this.note, this.drop);
    document.body.append(this.root);
  }

  update(state: SimState, weather: Weather, hour: number): void {
    const label = fill(texts.ui.hudDay, clockParts(state.timeMinutes));
    const night = hour < 6.5 || hour >= 20;
    const level = waterLevel(state);
    const key = `${label}|${weather}|${night}|${level}`;
    if (key === this.key) return;
    this.key = key;
    this.label.textContent = label;
    this.icon.innerHTML = svg(ICONS[night && (weather === 'clear' || weather === 'cloudy') ? 'night' : weather], 'none');
    const weatherTip = fill(texts.ui.hudWeather, { weather: texts.weather[weather] });
    this.note.setAttribute('aria-label', `${label}. ${weatherTip}`);
    this.note.title = weatherTip;
    this.note.dataset.tip = weatherTip;
    this.drop.dataset.level = level;
    this.drop.setAttribute('aria-label', texts.ui.water[level]);
    this.drop.title = texts.ui.water[level];
    this.drop.dataset.tip = texts.ui.water[level];
  }
}
