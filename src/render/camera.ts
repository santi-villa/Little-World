import {smoothView} from './motion/view-transition';
import settings from '../data/ecosystem.json';
/**
 * Cámara de la escena: zoom y paneo con easing.
 *
 * Mueve un contenedor (el "mundo", de 1280x720) dentro de la pantalla del
 * mismo tamaño. En reposo, el zoom se ajusta a un número entero de píxeles de
 * la pantalla por píxel del mundo si queda cerca del pedido, y la posición se
 * redondea a píxeles enteros. Durante la transición se mueve libre.
 */

import type { Container } from 'pixi.js';
import { GAME_HEIGHT, GAME_WIDTH } from './viewport';

/** Píxeles del canvas por píxel del juego (hoy siempre 1: el navegador agranda el canvas). */
export const display = { resolution: 1 };

export interface CameraView {
  /** Centro de la vista, en píxeles del mundo. */
  x: number;
  y: number;
  zoom: number;
}

/** Cuánto se puede alejar el zoom ajustado del pedido para que sea entero. */
const SNAP_TOLERANCE = 0.12;
/** Rapidez del easing (más alto, más rápido). */
const EASE = 5.5;
const EASE_DRAG = 22;

/** Zoom ajustado a un número entero de píxeles físicos por píxel del mundo, si se puede. */
export function snapZoom(zoom: number, resolution = display.resolution): number {
  const exact = zoom * resolution;
  let best = zoom;
  let bestError = SNAP_TOLERANCE;
  for (const n of [Math.floor(exact), Math.ceil(exact)]) {
    if (n < 1) continue;
    const z = n / resolution;
    const error = Math.abs(z - zoom) / zoom;
    if (error <= bestError) {
      best = z;
      bestError = error;
    }
  }
  return Math.max(1, best);
}

export class Camera {
  /** Lo que se ve ahora. */
  readonly current: CameraView = { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, zoom: 1 };
  /** Hacia dónde va. */
  readonly target: CameraView = { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, zoom: 1 };
  /** Mientras el dedo arrastra, la cámara lo sigue más pegada. */
  dragging = false;
  private journey:{from:CameraView;elapsed:number;duration:number}|null=null;
  get transitioning():boolean{return this.journey!==null;}
  private anchor:{screenX:number;screenY:number;x:number;y:number}|null=null;

  constructor(private readonly world: Container) {}

  /** Va hacia una vista (con easing). `instant` salta sin transición. */
  goTo(view: CameraView, instant = false,durationSeconds?:number): void {
    this.anchor=null;
    this.target.zoom = snapZoom(view.zoom);
    this.target.x = view.x;
    this.target.y = view.y;
    this.clamp(this.target);
    this.journey=!instant&&durationSeconds!==undefined&&Number.isFinite(durationSeconds)&&durationSeconds>0?{from:{...this.current},elapsed:0,duration:durationSeconds}:null;
    if (instant) Object.assign(this.current, this.target);
  }

  /** Cursor-anchored continuous zoom; panel scroll never reaches this method. */
  zoomAt(screenX:number,screenY:number,factor:number):void{
    if(!Number.isFinite(factor)||factor<=0)return;this.journey=null;const world=this.toWorld(screenX,screenY);
    this.target.zoom=Math.max(settings.camera.minimum,Math.min(settings.camera.maximum,this.target.zoom*factor));
    this.target.x=world.x-(screenX-GAME_WIDTH/2)/this.target.zoom;this.target.y=world.y-(screenY-GAME_HEIGHT/2)/this.target.zoom;
    this.clamp(this.target);this.anchor={screenX,screenY,...world};
  }

  /** Corre el objetivo, en píxeles de la pantalla (deslizar el dedo). */
  panBy(screenDx: number, screenDy: number): void {
    this.anchor=null;this.journey=null;
    this.target.x -= screenDx / this.current.zoom;
    this.target.y -= screenDy / this.current.zoom;
    this.clamp(this.target);
  }

  /** Mantiene la vista adentro de la imagen de la habitación. */
  private clamp(view: CameraView): void {
    view.zoom = Math.max(1, view.zoom);
    const halfW = GAME_WIDTH / 2 / view.zoom;
    const halfH = GAME_HEIGHT / 2 / view.zoom;
    view.x = Math.min(GAME_WIDTH - halfW, Math.max(halfW, view.x));
    view.y = Math.min(GAME_HEIGHT - halfH, Math.max(halfH, view.y));
  }

  /** Avanza el easing y ubica el mundo. */
  update(dt: number): void {
    const c = this.current;
    const t = this.target;
    if(this.journey){
      const j=this.journey;j.elapsed=Math.min(j.duration,j.elapsed+(Number.isFinite(dt)?Math.max(0,dt):0));const t=smoothView(j.elapsed/j.duration);
      c.x=j.from.x+(this.target.x-j.from.x)*t;c.y=j.from.y+(this.target.y-j.from.y)*t;
      c.zoom=Math.exp(Math.log(j.from.zoom)+(Math.log(this.target.zoom)-Math.log(j.from.zoom))*t);
      if(j.elapsed===j.duration){Object.assign(c,this.target);this.journey=null;}
    }else{
    const k = 1 - Math.exp(-Math.max(0, dt) * (this.dragging ? EASE_DRAG : EASE));
    // El zoom se interpola en escala logarítmica: se siente parejo al acercar y al alejar.
    const zoom = Math.exp(Math.log(c.zoom) + (Math.log(t.zoom) - Math.log(c.zoom)) * k);
    c.zoom = Math.abs(zoom - t.zoom) < 0.0005 ? t.zoom : zoom;
    c.x += (t.x - c.x) * k;
    c.y += (t.y - c.y) * k;
    if (Math.abs(t.x - c.x) < 0.05) c.x = t.x;
    if (Math.abs(t.y - c.y) < 0.05) c.y = t.y;
    if(this.anchor){c.x=this.anchor.x-(this.anchor.screenX-GAME_WIDTH/2)/c.zoom;c.y=this.anchor.y-(this.anchor.screenY-GAME_HEIGHT/2)/c.zoom;if(c.zoom===t.zoom)this.anchor=null;}
    }
    this.clamp(c);

    this.world.scale.set(c.zoom);
    this.world.position.set(GAME_WIDTH/2-c.x*c.zoom,GAME_HEIGHT/2-c.y*c.zoom);
  }

  /** De la pantalla (píxeles del juego) al mundo. */
  toWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.world.position.x) / this.current.zoom,
      y: (screenY - this.world.position.y) / this.current.zoom,
    };
  }

  /** ¿Ya llegó a donde iba? */
  get settled(): boolean {
    const c = this.current;
    const t = this.target;
    return c.zoom === t.zoom && Math.abs(c.x - t.x) < 0.5 && Math.abs(c.y - t.y) < 0.5;
  }
}
