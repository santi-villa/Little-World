import ecosystem from '../../data/ecosystem.json';
import {WaterFlow} from '../motion/water-flow';
import {BubbleParticles} from '../motion/bubble-particles';
import visual from '../../data/aquarium-visual.json';
import {tankAppearance} from './tank-layout';
import {bettaParameters as bettaConfig} from '../motion/betta-dynamics';
import {PlantMotion} from '../motion/plant-motion';
import {emptyHabitat,type Habitat} from '../motion/habitat';
import { GLASS_COLS, GLASS_ROWS } from '../../sim/glass';
import type { HandInput } from '../motion/hand';
import { ambientTint, ART } from '../art-direction';
/**
 * La pecera. Refleja el estado de la simulación: tamaño del modelo, nivel del
 * agua, luz, taninos, calefactor, filtro, algas y residuos.
 *
 * Todo lo de adentro ocupa EXACTAMENTE el hueco del vidrio (`inner` de la
 * imagen, medido en el manifest): de vidrio a vidrio, debajo de la tapa y
 * arriba de la base. El agua lo llena, con la superficie apenas bajo la tapa.
 *
 * Todo (vidrio e interior) es hijo de un mismo contenedor `art`, en
 * coordenadas de la imagen del vidrio: el contenedor se ubica y se escala en la
 * escena, y el interior queda pegado al vidrio en cualquier pantalla. Las
 * medidas salen del tamaño real de la textura cargada (si el navegador tuviera
 * guardada una imagen vieja de otro tamaño, el hueco igual se ajusta).
 *
 * Capas, de atrás hacia adelante:
 *   water      (código)  degradé del agua: se oscurece de noche y se pone ámbar con taninos
 *   glassBack  (imagen)  las aristas del vidrio de atrás, vistas a través del agua
 *   equip      (código)  calefactor, termómetro y toma del filtro
 *   inside     (recortado al hueco del vidrio)
 *     substrate  (imagen)  sustrato
 *     hardscape  (imagen)  maderas y rocas
 *     plants     (imagen)  plantas, ondulando (malla que se dobla)
 *     mid        (código)  residuos sobre el fondo y burbujas
 *     fish                animales
 *     fx         (código)  tinte del agua, rayos de luz, partículas, brillos y algas del vidrio
 *   glass      (imagen)  el marco del vidrio con su tapa y los reflejos, adelante
 *
 * Tamaño de píxel: las imágenes de la pecera se dibujan con 1 píxel del dibujo
 * = 1 píxel de la escena (usando el `artPx` del manifest), y lo dibujado por
 * código también usa 1 píxel de la escena. Así nada tiene píxeles más gordos.
 *
 * La decoración sale de datos (`src/data/tank-decor.json`), para que más
 * adelante venga del estado de la simulación.
 */

import { Container, Graphics, MeshPlane, Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js';
import decorData from '../../data/tank-decor.json';
import type { DerivedValues, SimState } from '../../sim';
import { asset, tex } from '../assets';
import { lerpColor, scatter } from '../pixel-utils';
import { FishLayer } from './fish-layer';
import { GLASS_ART, tankFrame, type TankRect } from './tank-layout';

/** Una pieza de la decoración. */
export interface TankDecorItem {
  /** Nombre del asset (madera-1, roca-dragon-1...). */
  asset?: string;
  /** O una planta por especie y etapa de crecimiento (1 = chica). */
  plant?: string;
  stage?: number;
  /** Posición a lo ancho de la pecera, 0 a 1. */
  x: number;
  /** Cuánto se hunde en el sustrato (fracción de su alto). */
  sink?: number;
  /** Agrandar o achicar (1 = su tamaño natural, con el píxel del resto). */
  scale?: number;
  flip?: boolean;
  height?: number;
  layer?: string;
}

export interface TankDecor {
  substrate: string;
  items: TankDecorItem[];
}

const GLASS = 'vidrio';
const GLASS_BACK = 'vidrio-fondo';
const EQUIP = 0x23272f;
const EQUIP_HI = 0x3d4450;
const NIGHT = 0x081420;
/** Distancia de la superficie del agua a la tapa, en píxeles (con la pecera llena). */
const SURFACE_GAP = 3;
/** Filas de la malla de cada planta (más filas, curva más suave). */
const PLANT_ROWS = 16;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Píxeles del PNG por píxel del dibujo (del manifest). */
function artPx(name: string): number {
  return asset(name)?.artPx ?? 2;
}

/** El hueco del vidrio y el agua, en píxeles de la escena. */
interface Geo {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  waterTop: number;
  waterHeight: number;
  /** Donde apoyan las cosas sobre la arena. */
  sandTop: number;
  sandH: number;
}

interface Plant {
  motion:PlantMotion;
  mesh: MeshPlane;
  /** Posiciones originales de los vértices. */
  rest: Float32Array;
  /** Píxeles del PNG por píxel del dibujo. */
  unit: number;
  phase: number;
}

export class TankView {
  readonly container = new Container();
  /** Vidrio e interior, en coordenadas de la imagen del vidrio. */
  private readonly art = new Container();
  readonly flow=new WaterFlow();
  private bubbles=new BubbleParticles(typeof window!=="undefined"&&window.innerWidth<800?ecosystem.bubbles.mobileMax:ecosystem.bubbles.max);
  readonly fish = new FishLayer();
  private readonly wet=new Container();
  private readonly roundMask=new Graphics();
  private round=false;private roundMaskKey="";
  private readonly water = new Graphics();
  private readonly glassBack = new Sprite(tex(GLASS_BACK));
  private readonly equip = new Graphics();
  private readonly inside = new Container();
  private readonly substrate = new TilingSprite({ texture: tex('sustrato-arena') });
  private readonly foregroundSand = new TilingSprite({ texture: tex('sustrato-arena') });
  private readonly hardscape = new Container();
  private readonly plantLayer = new Container();
  private readonly rearPlants = new Container();
  private readonly frontPlants = new Container();
  private readonly contactShadows = new Graphics();
  private plantImpulseAt=new Map<string,number>();
  private habitat:Habitat=emptyHabitat();
  private plants: Plant[] = [];
  private readonly mid = new Graphics();
  private readonly fx = new Graphics();
  private readonly waterMask = new Graphics();
  private readonly ledOff = new Graphics();
  private readonly lidSprite=new Sprite();
  private readonly glassMask=new Graphics();
  private lidTextureKey='';
  private readonly glass = new Sprite(tex(GLASS));
  private decor: TankDecor = decorData.default;
  private waterArea:TankRect={x:0,y:0,width:1,height:1};
  private inner: TankRect = { x: 0, y: 0, width: 1, height: 1 };
  private outer: TankRect = this.inner;
  private decorKey = '';
  private glassKey = '';
  private waterKey = '';
  private equipKey = '';
  private lastSeconds = 0;

  constructor() {
    try{if(localStorage.getItem("lw-tank-glass")==="round")tankAppearance.shape="round";}catch{/* Storage can be unavailable. */}
    this.inside.addChild(this.substrate, this.contactShadows, this.rearPlants, this.fish.graphics, this.fish.artBack, this.hardscape, this.plantLayer, this.fish.foreground, this.fish.artFront, this.frontPlants, this.foregroundSand, this.mid, this.fish.foodGraphics, this.fx);
    this.inside.mask = this.waterMask;
    this.wet.addChild(this.water,this.glassBack,this.equip,this.inside,this.waterMask,this.roundMask);
    this.art.addChild(this.wet, this.glass, this.glassMask, this.lidSprite, this.ledOff);
    this.container.addChild(this.art);
  }

  /** Rectángulo de la pecera entera, con tapa y base (para ubicar al gato y los toques). */
  get bounds(): TankRect {
    return this.outer;
  }

  get waterBounds():TankRect { const k=this.art.scale.x;return {x:this.art.x+this.waterArea.x*k,y:this.art.y+this.waterArea.y*k,width:this.waterArea.width*k,height:this.waterArea.height*k}; }
  fishPoint(id:number){const p=this.fish.pointFor(id),k=this.art.scale.x;return p?{x:this.art.x+p.x*k,y:this.art.y+p.y*k,length:p.radius/.8*k}:null;}
  setHand(hand:HandInput|null):void {this.fish.hand=hand;}
  fishAt(x:number,y:number):number|null { return this.fish.hit((x-this.art.x)/this.art.scale.x,(y-this.art.y)/this.art.scale.y); }

  /** Cambia la decoración (más adelante va a salir del estado de la simulación). */
  setDecor(decor: TankDecor): void {
    this.decor = decor;
    this.decorKey = '';
  }

  /** Golpe en el vidrio, en píxeles de la escena: los peces huyen de ese punto. */
  scareAt(sceneX: number, sceneY: number): void {
    const k = this.art.scale.x || 1;
    this.fish.scareAt((sceneX - this.art.x) / k, (sceneY - this.art.y) / k);
  }

  /** Posición en la escena de un animal cualquiera (para que el gato lo siga con la cabeza). */
  watchPoint(): { x: number; y: number } | null {
    const p = this.fish.watchPoint();
    const k = this.art.scale.x || 1;
    return p ? { x: this.art.x + p.x * k, y: this.art.y + p.y * k } : null;
  }

  update(state: SimState, derived: DerivedValues, seconds: number): void {
    const lit = derived.lightOn;
    this.round=tankAppearance.shape==='round'||(tankAppearance.shape==='model'&&state.tank.modelId==='bowl_8');
    this.glass.texture=tex(this.round?'redonda-1':GLASS);this.glassBack.visible=!this.round;
    const roundKey=this.round?String(this.glass.texture.uid):"";if(roundKey!==this.roundMaskKey){this.roundMaskKey=roundKey;this.roundMask.clear();if(this.round){const t=this.glass.texture,m=visual.roundMask;this.roundMask.ellipse(t.width*m.x,t.height*m.y,t.width*m.rx,t.height*m.ry).fill(0xffffff);}}this.wet.mask=this.round?this.roundMask:null;
    const geo = this.layout(state, derived);
    this.waterArea={x:geo.left,y:geo.waterTop+2,width:geo.width,height:Math.max(1,geo.sandTop-geo.waterTop-2)};
    const glassTexture=this.glass.texture;
    const cut=Math.max(1,this.inner.y-3);
    const lidKey=`${glassTexture.uid}:${cut}`;
    if(this.lidTextureKey!==lidKey){this.lidTextureKey=lidKey;this.lidSprite.texture=new Texture({source:glassTexture.source,frame:new Rectangle(0,0,glassTexture.width,cut)});}
    this.glassMask.clear();
    if(!this.round&&!state.tank.hasLid){this.glassMask.rect(0,cut,glassTexture.width,glassTexture.height-cut).fill(0xffffff);this.glass.mask=this.glassMask;}
    else this.glass.mask=null;
    this.lidSprite.visible=!this.round&&!state.tank.hasLid;this.lidSprite.position.set(0,-26);this.lidSprite.rotation=-0.035;
    const pxPerCm = this.inner.width / state.tank.lengthCm;
    const tannins = state.water.tannins;

    this.drawWater(geo, lit, tannins);
    this.drawEquipment(state, geo, lit);
    this.buildDecor(geo);
    this.flow.configure(geo.width/pxPerCm,(geo.sandTop-geo.waterTop-2)/pxPerCm,derived.effectiveFlowLph,state.tank.waterLiters,this.habitat,this.round);this.fish.water=this.flow;
    // Las imágenes se tiñen: más oscuras con la luz apagada y ámbar con taninos.
    const tint = lerpColor(ambientTint(lit ? 1 : 0.18), lit ? 0xd9a860 : 0x4a3a2a, tannins * 0.45);
    this.substrate.tint = tint;
    this.foregroundSand.tint = tint;
    for (const child of this.hardscape.children) child.tint = tint;
    for (const plant of this.plants) plant.mesh.tint = tint;
    // Las aristas de atrás se ven a través del agua: toman su color.
    this.glassBack.tint = lerpColor(this.waterColor(lit, tannins, 0.4), 0xffffff, 0.45);
    // La corriente mueve las plantas: más con el filtro andando.
    const flow = state.filter.flowLph > 0 ? Math.min(1, derived.effectiveFlowLph / state.filter.flowLph) : 0;
    const visitors=[...this.fish.motion.bodies.values()].map(b=>({x:geo.left+b.x*pxPerCm,y:geo.waterTop+2+b.y*pxPerCm,vx:b.vx}));
    this.swayPlants(seconds,flow,Math.max(0,seconds-this.lastSeconds),visitors);
    // One brief wake per encounter, rather than forcing the whole plant every frame.
    for(const animal of state.animals){if(!animal.alive)continue;const body=this.fish.motion.bodies.get(animal.id);if(!body)continue;
      const x=geo.left+body.x*pxPerCm,y=geo.waterTop+2+body.y*pxPerCm,range=bettaConfig.plantRangeLengths*bettaConfig.bodyFraction*(this.fish.motion.bettas.get(animal.id)?.sizeCm??2)*pxPerCm;
      const candidates=[...this.plants.map((p,index)=>({key:'mesh'+index,x:p.mesh.x+(p.mesh.scale.x<0?-1:1)*p.mesh.width/2,y:p.mesh.y+p.mesh.height,h:p.mesh.height,w:p.mesh.width,impulse:(u:number,v:number)=>p.motion.receiveImpulse(u,v)}))];
      for(const p of candidates){const u=(p.y-y)/Math.max(1,p.h),d=Math.abs(x-p.x),key=animal.id+':'+p.key;if(u<0||u>1||d>range+p.w/2){this.plantImpulseAt.delete(key);continue;}if(!this.plantImpulseAt.has(key)){p.impulse(u,body.vx*bettaConfig.plantImpulse);this.plantImpulseAt.set(key,seconds);}}
    }

    this.fish.habitat=this.habitat;

    const shade = (c: number): number => (lit ? c : lerpColor(c, NIGHT, 0.6));
    this.drawMid(state, derived, geo, shade, seconds);
    this.drawFx(state, geo, shade, lit, seconds);

    const dt = this.lastSeconds === 0 ? 0 : seconds - this.lastSeconds;
    this.lastSeconds = seconds;
    const swimTop = geo.waterTop + 2;
    this.fish.update(
      state,
      lit,
      { x: geo.left, y: swimTop, width: geo.width, height: Math.max(0, geo.sandTop - swimTop) },
      pxPerCm,
      seconds,
      dt,
    );
  }

  /**
   * Ubica la pecera en la escena según su largo y mide el hueco del vidrio, en
   * coordenadas de la imagen del vidrio (las del contenedor `art`).
   */
  private layout(state: SimState, derived: DerivedValues): Geo {
    const meta = asset(this.round?'redonda-1':GLASS);
    // Medidas de la textura que realmente se cargó; el hueco del manifest se lleva a ese tamaño.
    const texture = this.glass.texture;
    const texW = texture.width > 1 ? texture.width : (meta?.width ?? GLASS_ART.width);
    const texH = texture.height > 1 ? texture.height : (meta?.height ?? GLASS_ART.height);
    const source = this.round?{width:texW,height:texH,inner:{x:texW*visual.roundInner.x,y:texH*visual.roundInner.y,width:texW*visual.roundInner.width,height:texH*visual.roundInner.height}}:meta?.inner ? { width: meta.width, height: meta.height, inner: meta.inner } : GLASS_ART;
    const rx = texW / source.width;
    const ry = texH / source.height;
    const inner = {
      x: Math.round(source.inner.x * rx),
      y: Math.round(source.inner.y * ry),
      width: Math.round(source.inner.width * rx),
      height: Math.round(source.inner.height * ry),
    };
    // El vidrio se escala parejo (nunca se estira) y el interior viaja con él.
    const frame = tankFrame(state.tank.lengthCm, { width: texW, height: texH, inner });
    const k = frame.scale;
    const glassKey = `${frame.outer.x},${frame.outer.y},${k}`;
    if (glassKey !== this.glassKey) {
      this.glassKey = glassKey;
      this.art.position.set(frame.outer.x, frame.outer.y);
      this.art.scale.set(k);
    }
    this.inner = inner;
    this.outer = frame.outer;

    // La tira de luz de la tapa, apagada.
    const led = meta?.led;
    this.ledOff.clear();
    if (led && !derived.lightOn) {
      this.ledOff.rect(Math.round(led.x * rx), Math.round(led.y * ry), Math.round(led.width * rx), Math.ceil(led.height * ry)).fill({ color: 0x20242e, alpha: 0.85 });
    }

    const { x: left, y: top, width, height } = inner;
    const bottom = top + height;
    // El agua llena el hueco; la evaporación la baja de a poco.
    const fullTop = top + SURFACE_GAP;
    const waterHeight = Math.round((bottom - fullTop) * clamp(derived.waterLevel, 0, 1));
    const sandH = clamp(Math.round(height * 0.13), 12, 28);
    return {
      left,
      right: left + width,
      top,
      bottom,
      width,
      height,
      waterTop: bottom - waterHeight,
      waterHeight,
      sandTop: bottom - Math.round(sandH * 0.6),
      sandH,
    };
  }

  /** Color del agua a una profundidad (0 superficie .. 1 fondo). */
  private waterColor(lit: boolean, tannins: number, depth: number): number {
    const clear = lit ? lerpColor(0x6caaa1, 0x294e50, depth) : lerpColor(0x14434e, 0x0a2731, depth);
    const amber = lit ? lerpColor(0xc08a34, 0x6a4418, depth) : lerpColor(0x4a3413, 0x2a1c0c, depth);
    return lerpColor(clear, amber, tannins * 0.6);
  }

  /** El agua: degradé en franjas, más clara arriba y en el centro. El hueco entero va recortado. */
  private drawWater(geo: Geo, lit: boolean, tannins: number): void {
    const key = `${geo.left},${geo.top},${geo.width},${geo.height},${geo.waterHeight},${lit},${Math.round(tannins * 20)}`;
    if (key === this.waterKey) return;
    this.waterKey = key;
    const g = this.water;
    g.clear();
    this.waterMask.clear();
    // Lo de adentro (arena, plantas, peces) se recorta al hueco del vidrio.
    this.waterMask.rect(geo.left, geo.top, geo.width, geo.height).fill(0xffffff);
    const { left: x, width: w, waterTop: top, waterHeight: h } = geo;
    // El aire entre la tapa y el agua: la sombra de la tapa (no se ve la habitación a través).
    g.rect(x, geo.top, w, Math.max(0, top - geo.top)).fill(lit ? 0x7d92a0 : 0x1c222c);
    if (h <= 0) return;
    const bands = clamp(Math.round(h / 12), 4, 16);
    for (let i = 0; i < bands; i++) {
      const y0 = top + Math.round((i * h) / bands);
      const y1 = top + Math.round(((i + 1) * h) / bands);
      const color = this.waterColor(lit, tannins, i / (bands - 1));
      g.rect(x, y0, w, y1 - y0);
      // Borde entre franjas salpicado, para que no se vea la línea.
      if (i > 0) for (let q = 0; q < w / 4; q++) g.rect(x + q * 4 + ((i + q) % 2) * 2, y0 - 1, 2, 1);
      g.fill({ color, alpha: 0.96 });
    }
    if (lit) {
      g.rect(x + Math.round(w * 0.2), top, Math.round(w * 0.6), h)
        .rect(x + Math.round(w * 0.34), top, Math.round(w * 0.32), h)
        .fill({ color: 0xc8fff0, alpha: 0.05 });
    }
    g.rect(x, top, 6, h).rect(x + w - 6, top, 6, h).fill({ color: 0x04202a, alpha: 0.16 });
    const inset=w*.09,backTop=top+h*.08,backBottom=top+h*.86;
    g.poly([x,top,x+inset,backTop,x+inset,backBottom,x,top+h]).fill({color:0x123c47,alpha:.12});
    g.poly([x+w,top,x+w-inset,backTop,x+w-inset,backBottom,x+w,top+h]).fill({color:0x133c45,alpha:.1});
    g.poly([x,top+h,x+inset,backBottom,x+w-inset,backBottom,x+w,top+h]).fill({color:0xc8d1aa,alpha:.14});
    g.moveTo(x+inset,backTop).lineTo(x+inset,backBottom).lineTo(x+w-inset,backBottom).lineTo(x+w-inset,backTop).stroke({color:0x99c9be,alpha:.14,width:1});
    g.rect(x, top, w, 1).fill(lerpColor(this.waterColor(lit, tannins, 0), 0xffffff, 0.55));
  }

  /** Calefactor, termómetro y toma del filtro, al fondo. */
  private drawEquipment(state: SimState, geo: Geo, lit: boolean): void {
    const hasFilter = state.filter.flowLph > 0;
    const hasHeater = state.heater.watts > 0;
    const key = [geo.left, geo.top, geo.width, geo.height, lit, hasHeater, state.heater.on, state.heater.enabled, hasFilter, Math.round(state.water.temperatureC)].join();
    if (key === this.equipKey) return;
    this.equipKey = key;
    const g = this.equip;
    g.clear();
    const shade = (c: number): number => (lit ? c : lerpColor(c, NIGHT, 0.6));
    const { left, right, top, height } = geo;

    if (hasHeater) {
      const hx = left + 26;
      const hTop = top + Math.round(height * 0.2);
      const hH = Math.round(height * 0.42);
      g.rect(hx + 3, top, 2, hTop - top).fill(0x15181e); // cable
      if (state.heater.on) g.rect(hx - 4, hTop + 12, 16, hH - 12).fill({ color: 0xff7a3a, alpha: 0.12 });
      g.rect(hx, hTop, 8, hH).fill(shade(0xb9c7d0));
      g.rect(hx + 1, hTop + 10, 6, hH - 12).fill(shade(0xe4edf2));
      g.rect(hx + 1, hTop + 10, 1, hH - 12).fill(shade(0xffffff));
      for (let yy = hTop + 14; yy < hTop + hH - 6; yy += 4) g.rect(hx + 2, yy, 4, 2);
      g.fill(state.heater.on ? 0xff8a3a : shade(0x7a8590));
      g.rect(hx, hTop, 8, 10).fill(EQUIP);
      g.rect(hx, hTop, 8, 1).fill(EQUIP_HI);
      g.rect(hx + 3, hTop + 3, 2, 3).fill(!state.heater.enabled ? 0x30363f : state.heater.on ? 0xff3b30 : 0x3fd16b);
      g.rect(hx + 1, hTop + hH - 2, 6, 2).fill(shade(0x8a96a0));
    }

    // Termómetro pegado al vidrio de la izquierda (el número va en el HUD).
    const tx = left + 8;
    const tTop = top + Math.round(height * 0.24);
    const tH = clamp(Math.round(height * 0.24), 26, 60);
    g.rect(tx, tTop, 7, tH).fill(shade(0xdfe8ee));
    g.rect(tx + 1, tTop + 1, 5, tH - 2).fill(shade(0xf8fafb));
    for (let yy = tTop + 4; yy < tTop + tH - 8; yy += 4) g.rect(tx + 5, yy, 1, 1);
    g.fill(shade(0x8a96a0));
    const mercury = Math.round((tH - 10) * clamp((state.water.temperatureC - 14) / 20, 0.05, 1));
    g.rect(tx + 3, tTop + tH - 6 - mercury, 1, mercury).fill(shade(0xe0443a));
    g.rect(tx + 2, tTop + tH - 6, 3, 4).fill(shade(0xe0443a));
    g.rect(tx + 2, tTop - 3, 3, 3).fill(EQUIP);

    if (hasFilter) {
      const tubeX = right - 20;
      const tubeEnd = geo.sandTop - Math.round(height * 0.3);
      g.rect(tubeX, top, 6, tubeEnd - top).fill(EQUIP);
      g.rect(tubeX, top, 1, tubeEnd - top).fill(EQUIP_HI);
      g.rect(tubeX - 2, tubeEnd, 10, 16).fill(EQUIP);
      for (let yy = tubeEnd + 2; yy < tubeEnd + 15; yy += 3) g.rect(tubeX - 1, yy, 8, 1);
      g.fill(EQUIP_HI);
    }
  }

  /** Arma el sustrato, las maderas, las rocas y las plantas desde los datos. */
  private buildDecor(geo: Geo): void {
    const key = `${geo.left},${geo.top},${geo.width},${geo.height},${JSON.stringify(this.decor)}`;
    if (key === this.decorKey) return;
    this.decorKey = key;

    // Sustrato: se repite a lo ancho, con su píxel natural (no se estira).
    const unit = artPx(this.decor.substrate);
    this.substrate.texture = tex(this.decor.substrate);
    this.substrate.tileScale.set(1 / unit);
    this.substrate.position.set(geo.left, geo.bottom - geo.sandH);
    this.substrate.width = geo.width;
    this.substrate.height = geo.sandH;
    // A foreground lip of substrate buries roots rather than leaving plants floating.
    this.foregroundSand.texture = this.substrate.texture;
    this.foregroundSand.tileScale.set(1 / unit);
    this.foregroundSand.position.set(geo.left, geo.sandTop);
    this.foregroundSand.width = geo.width;
    this.foregroundSand.height = geo.bottom - geo.sandTop;
    this.foregroundSand.tilePosition.y = -(geo.sandTop - (geo.bottom - geo.sandH));

    for (const child of this.hardscape.removeChildren()) child.destroy();
    for (const child of this.plantLayer.removeChildren()) child.destroy();
    for (const child of this.rearPlants.removeChildren()) child.destroy();
    for (const child of this.frontPlants.removeChildren()) child.destroy();
    this.contactShadows.clear();
    this.plants = [];this.plantImpulseAt.clear();this.habitat=emptyHabitat();
    for (const [index, item] of this.decor.items.entries()) {
      const name = item.plant ? `${item.plant}-${item.stage ?? 1}` : (item.asset ?? '');
      if (!asset(name)) continue;
      const texture = tex(name);
      const unit = artPx(name);
      // 1 píxel del dibujo = 1 píxel del vidrio. Las plantas, a lo sumo un tercio del agua.
      let scale = (item.scale ?? 1) / unit;
      if (item.plant) scale = Math.min(scale, (geo.bottom - geo.top) * (item.height ?? 0.45) / texture.height);
      const w = texture.width * scale;
      const h = texture.height * scale;
      const cx = Math.round(clamp(geo.left + item.x * geo.width, geo.left + w / 2, geo.right - w / 2));
      const baseY = Math.round(geo.sandTop + (item.sink ?? 0) * h);
      const shadowW = Math.min(w * 0.7,geo.width*0.32);
      for(let row=0;row<3;row++) this.contactShadows.rect(Math.round(cx-shadowW/2+row*2),geo.sandTop+row,Math.max(1,Math.round(shadowW-row*4)),1);
      this.contactShadows.fill({color:ART.shadow,alpha:item.plant?0.1:0.22});
      if(item.plant){
        const ny=(baseY-geo.waterTop-2)/Math.max(1,geo.sandTop-geo.waterTop-2),nh=h/Math.max(1,geo.sandTop-geo.waterTop-2);
        this.habitat.refuges.push({x:(cx-geo.left)/geo.width,y:Math.max(.12,Math.min(.88,ny-nh*.4))});
        if(item.plant==='anubias')this.habitat.leaves.push({x:(cx-geo.left)/geo.width,y:Math.max(.1,Math.min(.8,ny-nh*.8))});
        this.habitat.obstacles.push({x:(cx-geo.left)/geo.width,y:Math.min(.98,ny-.04),rx:.012,ry:.035});
        const mesh = new MeshPlane({ texture, verticesX: 4, verticesY: PLANT_ROWS });
        mesh.scale.set(item.flip ? -scale : scale, scale);
        mesh.position.set(Math.round(item.flip ? cx + w / 2 : cx - w / 2), baseY - Math.round(h));
        (item.layer === 'back' ? this.rearPlants : item.layer === 'front' ? this.frontPlants : this.plantLayer).addChild(mesh);
        const positions = mesh.geometry.getAttribute('aPosition').buffer.data as Float32Array;
        this.plants.push({ motion:new PlantMotion(9,index*1.7,item.plant),mesh, rest: positions.slice(), unit, phase: index * 1.7 });
      } else {
        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5, 1);
        sprite.scale.set(item.flip ? -scale : scale, scale);
        sprite.position.set(cx, baseY);
        this.hardscape.addChild(sprite);
        this.habitat.obstacles.push({x:(cx-geo.left)/geo.width,y:Math.min(.95,(baseY-h*.38-geo.waterTop-2)/Math.max(1,geo.sandTop-geo.waterTop-2)),rx:w*.27/geo.width,ry:h*.22/Math.max(1,geo.sandTop-geo.waterTop-2)});
      }
    }
  }

  /**
   * Ondulación suave de las plantas: la base queda quieta y la punta se hamaca
   * unos píxeles, de a píxeles enteros del dibujo; la malla dobla la planta de
   * forma pareja (sin rayas).
   */
  private swayPlants(seconds:number,flow:number,dt:number,visitors:{x:number;y:number;vx:number}[]): void {
    for (const plant of this.plants) {
      const attribute = plant.mesh.geometry.getAttribute('aPosition');
      const positions = attribute.buffer.data as Float32Array;
      const height = plant.rest[plant.rest.length - 1] || 1;
      plant.motion.update(dt,seconds,flow,visitors.map(f=>({height:(plant.mesh.y+plant.mesh.height-f.y)/Math.max(1,plant.mesh.height),distance:Math.abs(f.x-(plant.mesh.x+(plant.mesh.scale.x<0?-1:1)*plant.mesh.width*.5))/Math.max(20,plant.mesh.width),speed:f.vx/4})),this.flow.getWaterVelocity((plant.mesh.x-this.inner.x)/(this.inner.width/this.flow.width),(plant.mesh.y-this.waterArea.y)/(this.inner.width/this.flow.width)).x);
      for (let i = 0; i < positions.length; i += 2) {
        const free = Math.pow(1 - (plant.rest[i + 1] as number) / height, 1.5);
        const sample=free*8,index=Math.min(7,Math.floor(sample)),offset=plant.motion.offsets[index]!*(1-(sample-index))+plant.motion.offsets[index+1]!*(sample-index);
        positions[i] = (plant.rest[i] as number) + offset*height;

      }
      attribute.buffer.update();
    }
  }

  /** Detrás de los peces: residuos sobre el fondo y burbujas del filtro. */
  private drawMid(state: SimState, derived: DerivedValues, geo: Geo, shade: (c: number) => number, seconds: number): void {
    const g = this.mid;
    g.clear();
    const { left, width, waterTop, sandTop } = geo;

    const detritus = Math.min(80, Math.round(state.organics.detritusG * 8));
    for (let i = 0; i < detritus; i++) {
      g.rect(left + 1 + Math.floor(scatter(i, 3) * (width - 3)), sandTop - 1 + Math.floor(scatter(i, 4) * 4), 2, 1);
    }
    if (detritus > 0) g.fill(shade(0x4a3a26));
    for(const animal of state.animals){if(!animal.alive||animal.intent!=='eat'||!animal.speciesId.includes('cory'))continue;const body=this.fish.motion.bodies.get(animal.id);if(!body||body.y<this.flow.height*.75)continue;const scale=this.inner.width/this.flow.width;
      for(let j=0;j<3;j++){const age=(seconds*.25+j/3)%1,current=this.flow.getWaterVelocity(body.x,body.y);g.rect(left+body.x*scale+(j-1)*2+current.x*age*scale,sandTop-age*5,1,1).fill({color:0xb5b69a,alpha:(1-age)*.2});}}
    this.bubbles.update(Math.max(0,seconds-this.lastSeconds),this.flow.width,this.flow.height,this.flow.strength,this.flow);
    const scale=this.inner.width/this.flow.width;
    for(const bubble of this.bubbles.particles){const x=left+bubble.x*scale,y=waterTop+2+bubble.y*scale,r=Math.max(.4,bubble.radius*scale);g.circle(x,y,r).stroke({color:0xe3f8f6,width:.7,alpha:derived.lightOn?.6:.25});}

  }

  /** Delante de los peces: tinte del agua, rayos de luz, partículas, brillos y algas. */
  private drawFx(state: SimState, geo: Geo, shade: (c: number) => number, lit: boolean, seconds: number): void {
    const g = this.fx;
    g.clear();
    const { left, right, width, waterTop, waterHeight, sandH } = geo;
    if (waterHeight <= 0) return;
    const tannins = state.water.tannins;

    // Tinte del agua sobre todo lo que está adentro.
    g.rect(left, waterTop, width, waterHeight).fill({
      color: this.waterColor(lit, tannins, 0.5),
      alpha: 0.04 + 0.18 * tannins,
    });

    // Rayos de luz que bajan desde la tapa, abriéndose y respirando.
    if (lit && waterHeight > 12) {
      const rays = Math.max(3, Math.round(width / 52));
      const mid = left + width / 2;
      for (let i = 0; i < rays; i++) {
        const baseX = left + ((i + 0.5) * width) / rays + Math.sin(seconds * 0.15 + i * 2) * 10;
        const wd = 8 + 10 * scatter(i, 81);
        const alpha = ecosystem.water.rayAlpha + 0.01 * Math.sin(seconds * 0.6 + i * 1.9);
        const slant = 0.4 * ((baseX - mid) / width) + 0.05;
        const len = (waterHeight - sandH * 0.5) * (0.6 + 0.35 * scatter(i, 82));
        const half = Math.round(len * 0.55);
        let pending = 0;
        for (let yy = 0; yy < len; yy += 3) {
          const x0 = clamp(baseX + slant * yy, left, right);
          const x1 = clamp(baseX + slant * yy + wd + yy * 0.05, left, right);
          if (x1 > x0) {
            g.rect(x0, waterTop + 1 + yy, x1 - x0, Math.min(3, len - yy));
            pending++;
          }
          if (yy < half && yy + 3 >= half && pending > 0) {
            g.fill({ color: 0xdcfff0, alpha });
            pending = 0;
          }
        }
        if (pending > 0) g.fill({ color: 0xdcfff0, alpha: alpha * 0.5 });
      }
    }

    // Partículas en suspensión, a la deriva.
    const column = Math.max(1, waterHeight - sandH - 3);
    const turbidity=Math.min(1,state.organics.detritusG*.3+state.algae.glass*.2);
    const specks = Math.round(ecosystem.water.cleanSpecks+turbidity*ecosystem.water.dirtySpecks);
    for (let i = 0; i < specks; i++) {
      const drift = (i % 3 === 0 ? -1 : 1) * (0.5 + scatter(i, 83));
      const py = (((scatter(i, 84) * column + seconds * drift) % column) + column) % column;
      const px = left + 2 + scatter(i, 85) * (width - 5) + Math.sin(seconds * 0.25 + i) * 6;
      const driftFlow=this.flow.getWaterVelocity((px-left)/(this.inner.width/this.flow.width),py/(this.inner.width/this.flow.width));
      g.rect(clamp(px+driftFlow.x*4,left,right-1),waterTop+2+py+driftFlow.y,1,1);
    }
    if (specks > 0) g.fill({ color: 0xeafff4, alpha: lit ? 0.2 : 0.1 });

    // Brillos que corren por la superficie.
    let run = 0;
    let glints = 0;
    for (let x = left; x <= right; x++) {
      const on = x < right && Math.sin(x * 0.15 + seconds * 1.4) + Math.sin(x * 0.055 - seconds * 0.9) > 1.15;
      if (on) {
        run++;
        continue;
      }
      if (run > 0) {
        g.rect(x - run, waterTop, run, 1);
        glints++;
      }
      run = 0;
    }
    if (glints > 0) g.fill({ color: 0xffffff, alpha: lit ? ecosystem.water.surfaceAlpha : 0.12 });

    // Capa de algas en el vidrio.
    const algaeSpecks = Math.round(width * 1.6);
    const algaeArea = Math.max(1, waterHeight - sandH - 4);
    for (let i = 0; i < algaeSpecks; i++) {
      const u=scatter(i,7),v=scatter(i,8);
      const cell=Math.min(GLASS_ROWS-1,Math.floor(v*GLASS_ROWS))*GLASS_COLS+Math.min(GLASS_COLS-1,Math.floor(u*GLASS_COLS));
      const coverage=state.algae.glassCells?.[cell]??state.algae.glass;
      if(scatter(i,72)<coverage)g.rect(left+Math.floor(u*(width-2)),waterTop+2+Math.floor(v*algaeArea),2,2);
    }
    g.fill({color:shade(0x3fae4a),alpha:0.8});
  }
}
