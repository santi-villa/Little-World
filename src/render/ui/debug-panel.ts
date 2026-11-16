/**
 * Panel de debug: todos los parámetros de la simulación, botones para
 * adelantar el tiempo y acciones de prueba. Es HTML común encima del canvas
 * y se puede ocultar con el botón DEBUG.
 */

import { DEFAULT_SPEED, SPEEDS, type Game, type SpeedId } from '../../game';
import {
  DEFAULT_TANK_ID,
  SPECIES,
  TANK_MODELS,
  checkAddition,
  defaultConfig,
  derive,
  findSpecies,
  getSpecies,
  petTolerance,
  stockFromAnimals,
  type DerivedValues,
  type SimAction,
  type SimState,
  type Weather,
} from '../../sim';
import { describeEvent, fill, formatClock, texts } from './texts';

const OPEN_KEY = 'little-world:debug-open';
const REFRESH_MS = 200;

const T = texts.debug;
type RowId = keyof typeof T.rows;
type ButtonId = keyof typeof T.buttons;
type SectionId = keyof typeof T.sections;
type Getter = (state: SimState, derived: DerivedValues) => string;

const n = (value: number, digits = 2): string => value.toFixed(digits);
const pct = (fraction: number, digits = 0): string => `${(fraction * 100).toFixed(digits)}%`;
const yesNo = (value: boolean): string => (value ? T.yes : T.no);

const CAT_ROWS: [RowId, Getter][] = [
  [
    'catBehavior',
    (s) => `${texts.catBehaviors[s.cat.behavior]} · ${texts.catSpots[s.cat.spot]}`,
  ],
  [
    'catNeeds',
    (s) => `${n(s.cat.needs.sleep)} / ${n(s.cat.needs.hunger)} / ${n(s.cat.needs.curiosity)}`,
  ],
  ['catNeeds2', (s) => `${n(s.cat.needs.affection)} / ${n(s.cat.needs.energy)}`],
  ['catPetting', (s) => `${n(s.cat.petting, 1)} / ${n(petTolerance(s.cat, defaultConfig), 1)}`],
  ['catBowl', (s) => pct(s.cat.bowl)],
];

const ROWS: { section: SectionId; rows: [RowId, Getter][] }[] = [
  {
    section: 'water',
    rows: [
      ['temperature', (s) => `${n(s.water.temperatureC)} °C`],
      ['ammonia', (s) => `${n(s.water.ammonia, 3)} ppm`],
      ['nh3', (_s, d) => `${n(d.nh3, 4)} ppm (${pct(d.nh3Fraction, 2)})`],
      ['toxicity', (_s, d) => pct(d.ammoniaToxicity)],
      ['nitrite', (s) => `${n(s.water.nitrite, 3)} ppm`],
      ['nitrate', (s) => `${n(s.water.nitrate)} ppm`],
      ['phosphate', (s) => `${n(s.water.phosphate)} ppm`],
      ['ph', (s) => n(s.water.ph)],
      ['kh', (s) => `${n(s.water.kh)} dKH`],
      ['gh', (s) => `${n(s.water.gh)} dGH`],
      ['co2', (s) => `${n(s.water.co2)} mg/L`],
      ['oxygen', (s, d) => `${n(d.oxygenRelative)} (${n(s.water.oxygen)} mg/L)`],
      ['chlorine', (s) => `${n(s.water.chlorine, 3)} ppm`],
      ['tannins', (s) => n(s.water.tannins)],
      ['volume', (s, d) => `${n(s.tank.waterLiters, 1)} L (${n(d.waterLevel)})`],
    ],
  },
  {
    section: 'bacteria',
    rows: [
      ['aob', (s) => `${n(s.bacteria.filter.aob)} / ${n(s.bacteria.surfaces.aob)}`],
      ['nob', (s) => `${n(s.bacteria.filter.nob)} / ${n(s.bacteria.surfaces.nob)}`],
      ['bioload', (s) => n(s.bioload.ammoniaMgNPerDay, 1)],
      [
        'cycled',
        (s) =>
          s.cycle.established
            ? T.yes
            : fill(T.values.cycledNo, { hours: n(s.cycle.stableMinutes / 60, 0) }),
      ],
    ],
  },
  {
    section: 'waste',
    rows: [
      ['foodColumn', (s) => `${n(s.food.surfaceG, 3)} / ${n(s.food.sinkingG, 3)} g`],
      ['food', (s) => `${n(s.organics.foodG)} g`],
      ['detritus', (s) => `${n(s.organics.detritusG)} g`],
      ['algaeGlass', (s) => n(s.algae.glass, 3)],
      ['algaeDecor', (s) => n(s.algae.decor, 3)],
    ],
  },
  {
    section: 'equipment',
    rows: [
      [
        'tank',
        (s) =>
          `${TANK_MODELS.find((m) => m.id === s.tank.modelId)?.name ?? s.tank.modelId} · ${
            s.tank.lengthCm
          }×${s.tank.widthCm}×${s.tank.heightCm}`,
      ],
      [
        'outdoor',
        (s) =>
          `${n(s.room.outdoorC, 1)} °C`,
      ],
      ['room', (s) => `${n(s.room.temperatureC)} °C`],
      ['window', (s) => (s.room.windowOpen ? T.values.windowOpen : T.values.windowClosed)],
      [
        'heater',
        (s, d) =>
          s.heater.watts <= 0
            ? T.values.heaterNone
            : `${
                !s.heater.enabled
                  ? T.values.heaterOff
                  : s.heater.on
                    ? T.values.heaterHeating
                    : T.values.heaterIdle
              } · ${s.heater.watts} W (${n(d.heaterWattsPerLiter)} W/L) → ${n(
                s.heater.setpointC,
                0,
              )} °C`,
      ],
      [
        'filter',
        (s, d) =>
          s.filter.flowLph <= 0
            ? T.values.filterNone
            : `${s.filter.running ? T.values.filterRunning : T.values.filterStopped} · ${n(
                d.effectiveFlowLph,
                0,
              )} / ${s.filter.flowLph} L/h`,
      ],
      ['clog', (s) => pct(s.filter.clog)],
      [
        'light',
        (s, d) =>
          `${d.lightOn ? T.values.lightOn : T.values.lightOff} (${s.light.startHour}–${
            (s.light.startHour + s.light.durationHours) % 24
          } h)`,
      ],
      ['lid', (s) => yesNo(s.tank.hasLid)],
      ['rng', (s) => String(s.rngState)],
    ],
  },
];

interface ActionButton {
  id: ButtonId;
  /** Marca visual: acción "mal hecha" a propósito. */
  bad?: boolean;
  run: (game: Game) => void;
}

const act =
  (action: SimAction) =>
  (game: Game): void => {
    game.act(action);
  };

const TIME_BUTTONS: ActionButton[] = [
  { id: 'plusHour', run: (game) => game.skip(60) },
  { id: 'plusDay', run: (game) => game.skip(1440) },
  { id: 'plusWeek', run: (game) => game.skip(10080) },
];

/** Cambio de agua bien hecho: sifonear, acondicionar e igualar la temperatura. */
const waterChange =
  (conditioned: boolean) =>
  (game: Game): void => {
    game.act({
      type: 'waterChange',
      fraction: 0.3,
      conditioned,
      vacuum: true,
      temperatureC: game.state.water.temperatureC,
    });
  };

const ACTION_BUTTONS: ActionButton[] = [
  { id: 'pinch', run: act({ type: 'feed', grams: 0.02 }) },
  { id: 'feed', run: act({ type: 'feed', grams: 0.1 }) },
  { id: 'overfeed', bad: true, run: act({ type: 'feed', grams: 2 }) },
  { id: 'waterChange', run: waterChange(true) },
  { id: 'waterChangeRaw', bad: true, run: waterChange(false) },
  { id: 'cleanFilterGood', run: act({ type: 'cleanFilter', method: 'tankWater' }) },
  { id: 'cleanFilterBad', bad: true, run: act({ type: 'cleanFilter', method: 'tapWater' }) },
  { id: 'replaceMedia', bad: true, run: act({ type: 'replaceFilterMedia' }) },
  {
    id: 'topOff',
    run: (game) =>
      void game.act({
        type: 'topOff',
        conditioned: true,
        temperatureC: game.state.water.temperatureC,
      }),
  },
  { id: 'conditioner', run: act({ type: 'addConditioner' }) },
  { id: 'cleanGlass', run: act({ type: 'cleanGlass' }) },
  { id: 'seededMedia', run: act({ type: 'addSeededMedia' }) },
  { id: 'doseAmmonia', run: act({ type: 'doseAmmonia', ppm: 2 }) },
  { id: 'tapGlass', bad: true, run: act({ type: 'tapGlass' }) },
  { id: 'removeDead', run: act({ type: 'removeDead' }) },
];

const CAT_BUTTONS: ActionButton[] = [
  { id: 'petCat', run: act({ type: 'petCat' }) },
  {
    id: 'petCatMany',
    bad: true,
    run: (game) => {
      for (let i = 0; i < 10; i++) game.act({ type: 'petCat' });
    },
  },
  { id: 'fillBowl', run: act({ type: 'fillCatBowl' }) },
];

const AWAY_BUTTONS: { id: ButtonId; minutes: number }[] = [
  { id: 'away3h', minutes: 180 },
  { id: 'away3d', minutes: 3 * 1440 },
  { id: 'away7d', minutes: 7 * 1440 },
  { id: 'away40d', minutes: 40 * 1440 },
];

const bioload =
  (delta: number) =>
  (game: Game): void => {
    game.act({
      type: 'setBioload',
      ammoniaMgNPerDay: game.state.bioload.ammoniaMgNPerDay + delta,
    });
  };

const outdoor =
  (delta: number) =>
  (game: Game): void =>
    game.setOutdoor(game.outdoorC + delta);

const SETTING_BUTTONS: ActionButton[] = [
  { id: 'loadDown', run: bioload(-2) },
  { id: 'loadUp', run: bioload(2) },
  { id: 'outdoorDown', run: outdoor(-5) },
  { id: 'outdoorUp', run: outdoor(5) },
  {
    id: 'window',
    run: (game) => void game.act({ type: 'setWindow', open: !game.state.room.windowOpen }),
  },
  {
    id: 'filter',
    run: (game) => void game.act({ type: 'setFilterRunning', running: !game.state.filter.running }),
  },
  {
    id: 'heater',
    run: (game) => void game.act({ type: 'setHeater', enabled: !game.state.heater.enabled }),
  },
  { id: 'lid', run: (game) => void game.act({ type: 'setLid', hasLid: !game.state.tank.hasLid }) },
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
  /** Empezar una pecera nueva del modelo elegido. */
  onReset: (tankId: string) => void;
  /** Simular que el juego estuvo cerrado tantos minutos (catch-up + resumen). */
  onSimulateAway: (minutes: number) => void;
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
  private readonly animals: HTMLElement;
  private readonly warnings: HTMLElement;
  private readonly species: HTMLSelectElement;
  private readonly weather: HTMLSelectElement;
  private readonly catchUp: HTMLElement;
  private lastAnimalsKey = '';
  private lastWarningsKey = '';
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
    this.root.setAttribute('aria-label', T.panelLabel);
    this.body = el('div', 'debug-body');
    this.root.append(this.body);

    // --- Tiempo ---
    const time = this.section('time');
    this.clock = el('div', 'debug-clock');
    this.speed = el('select', 'debug-speed');
    this.speed.setAttribute('aria-label', T.speedLabel);
    for (const id of Object.keys(SPEEDS) as SpeedId[]) {
      const node = el('option', undefined, T.speeds[id]);
      node.value = String(SPEEDS[id]);
      this.speed.append(node);
    }
    this.speed.addEventListener('change', () => this.game.setSpeed(Number(this.speed.value)));
    time.append(this.clock, this.speed, this.buttons(TIME_BUTTONS));
    // Simular una ausencia: corre el catch-up y muestra el resumen de bienvenida.
    const away = el('div', 'debug-buttons');
    for (const item of AWAY_BUTTONS) {
      const button = el('button', 'debug-button', T.buttons[item.id]);
      button.type = 'button';
      button.addEventListener('click', () => {
        this.options.onSimulateAway(item.minutes);
        this.refresh();
      });
      away.append(button);
    }
    this.catchUp = el('div', 'debug-save');
    time.append(away, this.catchUp);

    // --- Tienda de prueba: elegir especie, ver las advertencias y agregar ---
    const shop = this.section('shop');
    this.species = el('select', 'debug-speed');
    this.species.setAttribute('aria-label', T.speciesLabel);
    for (const sp of SPECIES) {
      const node = el('option', undefined, `${sp.name} (${sp.minTankL} L, grupo ${sp.minGroup}+)`);
      node.value = sp.id;
      this.species.append(node);
    }
    this.species.addEventListener('change', () => this.refresh());
    this.warnings = el('ul', 'debug-list');
    const shopButtons = el('div', 'debug-buttons');
    const addButton = (id: ButtonId, run: () => void, bad = false): void => {
      const button = el('button', bad ? 'debug-button bad' : 'debug-button', T.buttons[id]);
      button.type = 'button';
      button.addEventListener('click', () => {
        run();
        this.refresh();
      });
      shopButtons.append(button);
    };
    const add = (count: number): void => {
      this.game.act({ type: 'addAnimals', speciesId: this.species.value, count });
    };
    addButton('addOne', () => add(1));
    addButton('addGroup', () => add(getSpecies(this.species.value).minGroup));
    addButton(
      'removeAll',
      () => {
        for (const animal of [...this.game.state.animals]) {
          this.game.act({ type: 'removeAnimal', id: animal.id });
        }
      },
      true,
    );
    shop.append(this.species, this.warnings, shopButtons);

    // --- Animales ---
    this.animals = el('ol', 'debug-list');
    this.section('animals').append(this.animals);

    // --- Gato ---
    const cat = this.section('cat');
    const catTable = el('table', 'debug-table');
    for (const [id, get] of CAT_ROWS) {
      const tr = el('tr');
      const value = el('td', 'debug-value');
      tr.append(el('th', undefined, T.rows[id]), value);
      catTable.append(tr);
      this.cells.push({ get, node: value });
    }
    this.weather = el('select', 'debug-speed');
    this.weather.setAttribute('aria-label', T.weatherLabel);
    for (const id of Object.keys(texts.weather) as Weather[]) {
      const node = el('option', undefined, `${T.weatherLabel}: ${texts.weather[id]}`);
      node.value = id;
      this.weather.append(node);
    }
    this.weather.addEventListener('change', () =>
      this.game.setWeather(this.weather.value as Weather),
    );
    cat.append(catTable, this.buttons(CAT_BUTTONS), this.weather);

    // --- Acciones y ajustes ---
    this.section('actions').append(this.buttons(ACTION_BUTTONS));
    this.section('settings').append(this.buttons(SETTING_BUTTONS));

    // --- Alertas ---
    this.alerts = el('div', 'debug-alerts');
    this.section('alerts').append(this.alerts);

    // --- Parámetros ---
    for (const group of ROWS) {
      const table = el('table', 'debug-table');
      for (const [id, get] of group.rows) {
        const tr = el('tr');
        const value = el('td', 'debug-value');
        tr.append(el('th', undefined, T.rows[id]), value);
        table.append(tr);
        this.cells.push({ get, node: value });
      }
      this.section(group.section).append(table);
    }

    // --- Eventos ---
    this.events = el('ol', 'debug-events');
    this.section('events').append(this.events);

    // --- Partida ---
    const game_ = this.section('game');
    this.save = el('div', 'debug-save');
    const model = el('select', 'debug-speed');
    model.setAttribute('aria-label', T.rows.tank);
    for (const tank of TANK_MODELS) {
      const node = el('option', undefined, `${tank.name} (${tank.id})`);
      node.value = tank.id;
      model.append(node);
    }
    model.value = TANK_MODELS.some((m) => m.id === game.state.tank.modelId)
      ? game.state.tank.modelId
      : DEFAULT_TANK_ID;
    const reset = el('button', 'debug-button bad', T.buttons.reset);
    reset.type = 'button';
    reset.addEventListener('click', () => {
      if (window.confirm(T.resetConfirm)) {
        this.options.onReset(model.value);
        this.refresh();
      }
    });
    game_.append(this.save, model, reset);

    parent.append(this.root, this.toggle);
    this.setOpen(this.open);
  }

  private section(id: SectionId): HTMLElement {
    const section = el('section', 'debug-section');
    section.append(el('h2', undefined, T.sections[id]));
    this.body.append(section);
    return section;
  }

  private buttons(list: ActionButton[]): HTMLElement {
    const group = el('div', 'debug-buttons');
    for (const item of list) {
      const button = el(
        'button',
        item.bad ? 'debug-button bad' : 'debug-button',
        T.buttons[item.id],
      );
      button.type = 'button';
      button.addEventListener('click', () => {
        item.run(this.game);
        this.refresh();
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
    this.toggle.textContent = open ? T.toggleClose : T.toggle;
    this.toggle.setAttribute('aria-expanded', String(open));
    writeOpen(open);
    if (open) this.refresh();
  }

  /** Se llama en cada cuadro; solo redibuja unas pocas veces por segundo. */
  update(nowMs: number): void {
    if (!this.open || nowMs - this.lastRefresh < REFRESH_MS) return;
    this.lastRefresh = nowMs;
    this.refresh();
  }

  private refresh(): void {
    if (!this.open) return;
    const state = this.game.state;
    const derived = derive(state);

    this.clock.textContent = formatClock(state.timeMinutes);
    if (document.activeElement !== this.speed) {
      const known = Object.values(SPEEDS).includes(this.game.speed as never);
      this.speed.value = String(known ? this.game.speed : DEFAULT_SPEED);
    }

    for (const cell of this.cells) {
      const text = cell.get(state, derived);
      if (cell.node.textContent !== text) cell.node.textContent = text;
    }

    const alertsText =
      state.alerts.length === 0 ? T.none : state.alerts.map((id) => texts.alerts[id]).join(' · ');
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
      if (recent.length === 0) this.events.append(el('li', 'empty', T.noEvents));
    }

    this.refreshLiving(state);

    const saveText = this.options.saveStatus();
    if (this.save.textContent !== saveText) this.save.textContent = saveText;
  }

  /** Animales, advertencias de la tienda, clima y último catch-up. */
  private refreshLiving(state: SimState): void {
    if (document.activeElement !== this.weather) this.weather.value = this.game.weather;

    const last = this.game.lastCatchUp;
    const catchUpText = `${T.rows.catchUp}: ${
      last
        ? fill(T.values.catchUp, {
            minutes: Math.round(last.result.plan.simulatedMinutes),
            ms: last.durationMs.toFixed(0),
            steps: last.result.plan.count,
          })
        : T.values.catchUpNone
    }`;
    if (this.catchUp.textContent !== catchUpText) this.catchUp.textContent = catchUpText;

    // Lo que diría la tienda si se suma uno más de la especie elegida.
    const stock = stockFromAnimals(state.animals);
    const warningsKey = `${this.species.value}|${state.tank.modelId}|${stock
      .map((entry) => `${entry.speciesId}:${entry.count}:${entry.males ?? 0}`)
      .join(',')}`;
    if (warningsKey !== this.lastWarningsKey) {
      this.lastWarningsKey = warningsKey;
      const warnings = checkAddition(
        { liters: state.tank.fullLiters, heightCm: state.tank.heightCm },
        stock,
        { speciesId: this.species.value, count: 1 },
      );
      this.warnings.replaceChildren(
        ...warnings.map((warning) => el('li', warning.severity, warning.message)),
      );
      if (warnings.length === 0) this.warnings.append(el('li', 'ok', T.values.noWarnings));
    }

    const animalsKey = state.animals
      .map(
        (a) =>
          `${a.id}${a.alive ? '' : 'x'}${a.intent}${a.mood}${Math.round(a.hunger * 50)}${Math.round(
            a.stress,
          )}${Math.round(a.health)}`,
      )
      .join('|');
    if (animalsKey === this.lastAnimalsKey) return;
    this.lastAnimalsKey = animalsKey;
    this.animals.replaceChildren(
      ...state.animals.map((a) => {
        const name = `${a.name ?? findSpecies(a.speciesId)?.name ?? a.speciesId} #${a.id} ${
          a.sex === 'male' ? '♂' : '♀'
        }`;
        const item = el(
          'li',
          a.alive ? undefined : 'dead',
          a.alive
            ? fill(T.values.animalRow, {
                name,
                mood: texts.moods[a.mood],
                intent: texts.intents[a.intent],
              })
            : `${name} · ${T.values.dead}`,
        );
        if (a.alive) {
          item.append(
            el(
              'small',
              undefined,
              fill(T.values.animalNeeds, {
                hunger: n(a.hunger),
                stress: n(a.stress, 0),
                health: n(a.health, 0),
              }),
            ),
          );
        }
        return item;
      }),
    );
    if (state.animals.length === 0) this.animals.append(el('li', 'empty', T.values.noAnimals));
  }
}
