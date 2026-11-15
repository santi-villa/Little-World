/**
 * Panel de debug: todos los parámetros de la simulación, botones para
 * adelantar el tiempo y acciones de prueba. Es HTML común encima del canvas
 * y se puede ocultar con el botón DEBUG.
 */

import { DEFAULT_SPEED, SPEEDS, type Game } from '../game/game';
import { PPM_PER_MG_N, derive, type DerivedValues, type SimAction, type SimState } from '../sim';
import { ALERT_LABELS, describeEvent, formatClock } from './labels';

const OPEN_KEY = 'little-world:debug-open';
const REFRESH_MS = 200;

type Getter = (state: SimState, derived: DerivedValues) => string;

interface Row {
  label: string;
  get: Getter;
}

interface Section {
  title: string;
  rows: Row[];
}

const n = (value: number, digits = 2): string => value.toFixed(digits);
const yesNo = (value: boolean): string => (value ? 'sí' : 'no');

const SECTIONS: Section[] = [
  {
    title: 'Agua',
    rows: [
      { label: 'Temperatura', get: (s) => `${n(s.water.temperatureC)} °C` },
      {
        label: 'Amoníaco total',
        get: (s, d) => `${n(d.ammoniaPpm, 3)} ppm (${n(s.water.ammonia, 3)} N)`,
      },
      {
        label: 'NH3 libre (tóxico)',
        get: (_s, d) => `${n(d.nh3 * PPM_PER_MG_N.ammonia, 4)} ppm (${n(d.nh3Fraction * 100)}%)`,
      },
      { label: 'Toxicidad NH3', get: (_s, d) => `${n(d.ammoniaToxicity * 100, 0)}%` },
      { label: 'Nitrito', get: (s, d) => `${n(d.nitritePpm, 3)} ppm (${n(s.water.nitrite, 3)} N)` },
      { label: 'Nitrato', get: (s, d) => `${n(d.nitratePpm)} ppm (${n(s.water.nitrate)} N)` },
      { label: 'pH', get: (s) => n(s.water.ph) },
      { label: 'KH', get: (s) => `${n(s.water.kh)} dKH` },
      { label: 'CO2', get: (s) => `${n(s.water.co2)} mg/L` },
      {
        label: 'Oxígeno',
        get: (s, d) => `${n(s.water.oxygen)} mg/L (${n(d.oxygenPercent, 0)}%)`,
      },
      { label: 'Cloro', get: (s) => `${n(s.water.chlorine, 3)} mg/L` },
      {
        label: 'Volumen',
        get: (s, d) => `${n(s.tank.waterLiters, 1)} L (${n(d.levelFraction * 100, 0)}%)`,
      },
    ],
  },
  {
    title: 'Bacterias y ciclo (mg N/día)',
    rows: [
      {
        label: 'AOB filtro / superficies',
        get: (s) => `${n(s.bacteria.filter.aob)} / ${n(s.bacteria.surfaces.aob)}`,
      },
      {
        label: 'NOB filtro / superficies',
        get: (s) => `${n(s.bacteria.filter.nob)} / ${n(s.bacteria.surfaces.nob)}`,
      },
      { label: 'Carga de amoníaco', get: (s) => n(s.bioload.ammoniaMgNPerDay, 1) },
      {
        label: 'Ciclada',
        get: (s) =>
          s.cycle.established ? 'sí' : `no (${n(s.cycle.stableMinutes / 60, 0)} h estable)`,
      },
    ],
  },
  {
    title: 'Residuos y algas',
    rows: [
      { label: 'Comida sin comer', get: (s) => `${n(s.organics.foodG)} g` },
      { label: 'Detrito', get: (s) => `${n(s.organics.detritusG)} g` },
      {
        label: 'Algas',
        get: (s, d) => `${n(s.algae.biomassG, 3)} g (${n(d.algaeFraction * 100, 1)}%)`,
      },
    ],
  },
  {
    title: 'Equipo y habitación',
    rows: [
      { label: 'Habitación', get: (s) => `${n(s.room.temperatureC)} °C (media ${n(s.room.baseC, 0)})` },
      {
        label: 'Calefactor',
        get: (s, d) =>
          `${!s.heater.enabled ? 'apagado' : s.heater.on ? 'CALENTANDO' : 'en espera'} · ${
            s.heater.watts
          } W (${n(d.heaterWattsPerLiter)} W/L) → ${n(s.heater.setpointC, 0)} °C`,
      },
      {
        label: 'Filtro',
        get: (s, d) =>
          `${s.filter.running ? 'andando' : 'APAGADO'} · ${n(d.effectiveFlowLph, 0)} de ${
            s.filter.flowLph
          } L/h`,
      },
      { label: 'Suciedad del filtro', get: (s) => `${n(s.filter.clog * 100, 0)}%` },
      {
        label: 'Luz',
        get: (s, d) =>
          `${d.lightOn ? 'prendida' : 'apagada'} (${s.light.startHour} a ${
            (s.light.startHour + s.light.durationHours) % 24
          } h)`,
      },
      { label: 'Tapa', get: (s) => yesNo(s.tank.hasLid) },
      { label: 'Estado del RNG', get: (s) => String(s.rngState) },
    ],
  },
];

interface ActionButton {
  label: string;
  /** Marca visual: acción "mal hecha" a propósito. */
  bad?: boolean;
  run: (game: Game) => void;
}

const act =
  (action: SimAction) =>
  (game: Game): void =>
    game.act(action);

const TIME_BUTTONS: ActionButton[] = [
  { label: '+1 hora', run: (game) => game.advance(60) },
  { label: '+1 día', run: (game) => game.advance(1440) },
  { label: '+1 semana', run: (game) => game.advance(10080) },
];

const ACTION_BUTTONS: ActionButton[] = [
  { label: 'Alimentar (0,5 g)', run: act({ type: 'feed', grams: 0.5 }) },
  { label: 'Sobrealimentar (5 g)', bad: true, run: act({ type: 'feed', grams: 5 }) },
  {
    label: 'Cambio de agua 30%',
    run: act({ type: 'waterChange', fraction: 0.3, conditioned: true, vacuum: true }),
  },
  {
    label: 'Cambio 30% sin acondicionador',
    bad: true,
    run: act({ type: 'waterChange', fraction: 0.3, conditioned: false, vacuum: true }),
  },
  { label: 'Lavar filtro bien (agua de pecera)', run: act({ type: 'cleanFilter', method: 'tankWater' }) },
  {
    label: 'Lavar filtro mal (canilla)',
    bad: true,
    run: act({ type: 'cleanFilter', method: 'tapWater' }),
  },
  { label: 'Rellenar lo evaporado', run: act({ type: 'topOff', conditioned: true }) },
  { label: 'Acondicionador', run: act({ type: 'addConditioner' }) },
  { label: 'Limpiar algas', run: act({ type: 'scrubAlgae' }) },
  { label: 'Material colonizado', run: act({ type: 'addSeededMedia' }) },
  {
    label: 'Amoníaco +2 ppm',
    run: act({ type: 'doseAmmonia', mgPerLiter: 2 / PPM_PER_MG_N.ammonia }),
  },
];

const SETTING_BUTTONS: ActionButton[] = [
  {
    label: 'Carga −5',
    run: (game) =>
      game.act({
        type: 'setBioload',
        ammoniaMgNPerDay: game.state.bioload.ammoniaMgNPerDay - 5,
      }),
  },
  {
    label: 'Carga +5',
    run: (game) =>
      game.act({
        type: 'setBioload',
        ammoniaMgNPerDay: game.state.bioload.ammoniaMgNPerDay + 5,
      }),
  },
  {
    label: 'Habitación −2°',
    run: (game) => game.act({ type: 'setRoomBase', baseC: game.state.room.baseC - 2 }),
  },
  {
    label: 'Habitación +2°',
    run: (game) => game.act({ type: 'setRoomBase', baseC: game.state.room.baseC + 2 }),
  },
  {
    label: 'Filtro sí/no',
    run: (game) => game.act({ type: 'setFilterRunning', running: !game.state.filter.running }),
  },
  {
    label: 'Calefactor sí/no',
    run: (game) => game.act({ type: 'setHeater', enabled: !game.state.heater.enabled }),
  },
  {
    label: 'Tapa sí/no',
    run: (game) => game.act({ type: 'setLid', hasLid: !game.state.tank.hasLid }),
  },
];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== '0';
  } catch {
    return true;
  }
}

function writeOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  } catch {
    // Sin localStorage el panel igual funciona; solo no recuerda si estaba abierto.
  }
}

export interface DebugPanelOptions {
  /** Texto del estado del guardado (lo arma main.ts). */
  saveStatus: () => string;
  onReset: () => void;
}

export class DebugPanel {
  private readonly root: HTMLElement;
  /** Parte del panel que hace scroll (el botón DEBUG queda fijo arriba). */
  private readonly body: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly clock: HTMLElement;
  private readonly speed: HTMLSelectElement;
  private readonly alerts: HTMLElement;
  private readonly events: HTMLElement;
  private readonly save: HTMLElement;
  private readonly cells: { get: Getter; node: HTMLElement }[] = [];
  private open = readOpen();
  private lastRefresh = -Infinity;
  private lastEventsKey = '';

  constructor(
    private readonly game: Game,
    parent: HTMLElement,
    private readonly options: DebugPanelOptions,
  ) {
    this.toggle = el('button', 'debug-toggle');
    this.toggle.type = 'button';
    this.toggle.addEventListener('click', () => this.setOpen(!this.open));

    this.root = el('aside', 'debug-panel');
    this.root.setAttribute('aria-label', 'Panel de debug');
    this.body = el('div', 'debug-body');
    this.root.append(this.body);

    // --- Tiempo ---
    const time = this.section('Tiempo');
    this.clock = el('div', 'debug-clock');
    time.append(this.clock);
    this.speed = el('select', 'debug-speed');
    this.speed.setAttribute('aria-label', 'Velocidad');
    for (const option of SPEEDS) {
      const node = el('option', undefined, option.label);
      node.value = String(option.value);
      this.speed.append(node);
    }
    this.speed.addEventListener('change', () => this.game.setSpeed(Number(this.speed.value)));
    time.append(this.speed, this.buttons(TIME_BUTTONS));

    // --- Acciones ---
    this.section('Acciones de prueba').append(this.buttons(ACTION_BUTTONS));
    this.section('Ajustes').append(this.buttons(SETTING_BUTTONS));

    // --- Alertas ---
    this.alerts = el('div', 'debug-alerts');
    this.section('Alertas activas').append(this.alerts);

    // --- Parámetros ---
    for (const section of SECTIONS) {
      const table = el('table', 'debug-table');
      for (const row of section.rows) {
        const tr = el('tr');
        const value = el('td', 'debug-value');
        tr.append(el('th', undefined, row.label), value);
        table.append(tr);
        this.cells.push({ get: row.get, node: value });
      }
      this.section(section.title).append(table);
    }

    // --- Eventos ---
    this.events = el('ol', 'debug-events');
    this.section('Últimos eventos').append(this.events);

    // --- Partida ---
    const saveSection = this.section('Partida');
    this.save = el('div', 'debug-save');
    const reset = el('button', 'debug-button bad', 'Pecera nueva (borra la partida)');
    reset.type = 'button';
    reset.addEventListener('click', () => {
      if (window.confirm('¿Empezar una pecera nueva? Se pierde la partida actual.')) {
        this.options.onReset();
        this.refresh(true);
      }
    });
    saveSection.append(this.save, reset);

    parent.append(this.root, this.toggle);
    this.setOpen(this.open);
  }

  private section(title: string): HTMLElement {
    const section = el('section', 'debug-section');
    section.append(el('h2', undefined, title));
    this.body.append(section);
    return section;
  }

  private buttons(list: ActionButton[]): HTMLElement {
    const group = el('div', 'debug-buttons');
    for (const item of list) {
      const button = el('button', item.bad ? 'debug-button bad' : 'debug-button', item.label);
      button.type = 'button';
      button.addEventListener('click', () => {
        item.run(this.game);
        this.refresh(true);
      });
      group.append(button);
    }
    return group;
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.root.hidden = !open;
    // Con el panel abierto la escena se corre a la izquierda para no quedar tapada.
    document.body.classList.toggle('debug-open', open);
    this.toggle.textContent = open ? 'DEBUG ✕' : 'DEBUG';
    this.toggle.setAttribute('aria-expanded', String(open));
    writeOpen(open);
    if (open) this.refresh(true);
  }

  /** Se llama en cada cuadro; solo redibuja unas pocas veces por segundo. */
  update(nowMs: number): void {
    if (!this.open || nowMs - this.lastRefresh < REFRESH_MS) return;
    this.lastRefresh = nowMs;
    this.refresh(false);
  }

  private refresh(force: boolean): void {
    if (!this.open && !force) return;
    const state = this.game.state;
    const derived = derive(state);

    this.clock.textContent = formatClock(state.timeMinutes);
    if (document.activeElement !== this.speed) {
      const current = SPEEDS.find((s) => s.value === this.game.speed)?.value ?? DEFAULT_SPEED;
      this.speed.value = String(current);
    }

    for (const cell of this.cells) {
      const text = cell.get(state, derived);
      if (cell.node.textContent !== text) cell.node.textContent = text;
    }

    const alertsText =
      state.alerts.length === 0 ? 'Ninguna' : state.alerts.map((id) => ALERT_LABELS[id]).join(' · ');
    if (this.alerts.textContent !== alertsText) {
      this.alerts.textContent = alertsText;
      this.alerts.classList.toggle('active', state.alerts.length > 0);
    }

    const recent = this.game.log.slice(0, 12);
    const first = recent[0];
    const eventsKey = `${this.game.log.length}:${first ? `${first.type}@${first.timeMinutes}` : ''}`;
    if (eventsKey !== this.lastEventsKey) {
      this.lastEventsKey = eventsKey;
      this.events.replaceChildren(
        ...recent.map((event) =>
          el('li', undefined, `${formatClock(event.timeMinutes)} — ${describeEvent(event)}`),
        ),
      );
      if (recent.length === 0) this.events.append(el('li', 'empty', 'Todavía no pasó nada'));
    }

    const saveText = this.options.saveStatus();
    if (this.save.textContent !== saveText) this.save.textContent = saveText;
  }
}
