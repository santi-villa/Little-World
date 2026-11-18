import foodTypes from '../../data/food-types.json';
import type {FoodKind} from '../../sim/food-grains';
/**
 * Bandeja de herramientas de la vista pecera: la bandeja de madera de
 * marcos-ui.png con los íconos de iconos-acciones.jpg. Tocar una herramienta la
 * convierte en el cursor (o, con el dedo, en lo que va pegado al dedo) y
 * aparece "Soltar". Si no se puede usar, se sacude suave y un papelito explica
 * por qué.
 */

import type { HandTool } from '../hand-tools';
import { asset } from '../assets';
import { artUrl, showNote, woodButton } from './paper-ui';
import { playClick } from './ui-sound';
import { texts } from './texts';

const TOOLS: { tool: Exclude<HandTool, 'hand'>; icon: string }[] = [
  { tool: 'food', icon: 'icono-comida' },
  { tool: 'sponge', icon: 'icono-esponja' },
  { tool: 'bucket', icon: 'icono-balde' },
  { tool: 'kit', icon: 'icono-kit' },
  { tool: 'filter', icon: 'icono-filtro' },
  { tool: 'observe', icon: 'icono-lupa' },
  { tool: 'tap', icon: 'herramienta-golpecito' },
];

export class ToolTray {
  readonly root = document.createElement('div');
  private readonly buttons = new Map<HandTool, HTMLButtonElement>();
  private readonly drop: HTMLButtonElement;
  private readonly lid: HTMLButtonElement;
  private readonly foodSelect=document.createElement('select');
  onFoodKind:(kind:FoodKind)=>void=()=>undefined;

  /** @param choose Elegir una herramienta (devuelve el motivo si no se puede, o null). */
  constructor(choose: (tool: HandTool) => string | null, toggleLid: () => void) {
    this.root.className = 'tool-tray';
    this.root.setAttribute('role', 'toolbar');
    this.root.setAttribute('aria-label', texts.ui.trayLabel);
    for (const { tool, icon } of TOOLS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tray-tool';
      const name = texts.ui.tools[tool];
      button.setAttribute('aria-label', name);
      button.title = name;
      button.dataset.tip = name;
      const img = document.createElement('img');
      img.alt = '';
      img.src = artUrl(icon);
      const entry = asset(icon);
      img.style.setProperty('--w', String(entry?.width ?? 32));
      img.style.setProperty('--h', String(entry?.height ?? 32));
      button.append(img);
      button.addEventListener('pointerdown', () => playClick());
      button.addEventListener('click', () => {
        const reason = choose(tool);
        if (reason) this.reject(tool, reason);
      });
      this.buttons.set(tool, button);
      this.root.append(button);
    }
    this.foodSelect.className='tray-food-type';this.foodSelect.setAttribute('aria-label',texts.granular.food);
    for(const [kind,profile]of Object.entries(foodTypes)){const option=document.createElement('option');option.value=kind;option.textContent=profile.label;this.foodSelect.append(option);}
    this.foodSelect.addEventListener('change',()=>this.onFoodKind(this.foodSelect.value as FoodKind));
    this.root.append(this.foodSelect);
    this.lid = woodButton(texts.ui.openLid, toggleLid);
    this.drop = woodButton(texts.ui.drop, () => choose('hand'), 'tray-drop');
    this.root.append(this.lid, this.drop);
    document.body.append(this.root);
  }

  /** La herramienta no se puede usar: se sacude y un papelito explica por qué. */
  reject(tool: HandTool, reason: string): void {
    const button = this.buttons.get(tool);
    if (button) {
      button.classList.remove('shake');
      void button.offsetWidth;
      button.classList.add('shake');
    }
    showNote(reason);
  }

  update(active: HandTool, lidClosed: boolean,foodKind:FoodKind='pellets'): void {
    this.foodSelect.hidden=active!=='food';
    if(this.foodSelect.value!==foodKind)this.foodSelect.value=foodKind;
    for (const [tool, button] of this.buttons) {
      const pressed = String(tool === active);
      if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
    }
    this.drop.hidden = active === 'hand';
    const lid = lidClosed ? texts.ui.openLid : texts.ui.closeLid;
    if (this.lid.textContent !== lid) this.lid.textContent = lid;
  }

  /** Alto en píxeles de CSS (para que la cámara deje la pecera arriba de la bandeja). */
  get height(): number {
    return this.root.offsetHeight;
  }
}
