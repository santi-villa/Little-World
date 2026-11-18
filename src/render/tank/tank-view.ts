import {Sediment} from '../motion/sediment';
import {surfaceSlope,causticStrips} from '../motion/water-light';
import {textureSilhouette} from './alpha-mask';
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
import { drawIllustratedEquipment } from './illustrated-equipment';
import { FRONT_GLASS, canopyMotion, illustratedFrame, type CanopyMotion } from './illustrated-layout';
import { fillWater, IllustratedOptics, softPool } from './illustrated-optics';
import { AquariumBed, bedSurface, planeDepth } from './aquarium-bed';
import { IllustratedLid } from './illustrated-lid';
import { filterMount } from './illustrated-equipment';
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
  /** Ancho relativo al cristal para los objetos de alta resolución. */
  width?: number;
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
  phase: number;
  cx: number;
  baseY: number;
  worldHeight: number;
  worldWidth: number;
  canopy?: CanopyMotion;
  depth: number;
}

export class TankView {
  readonly container = new Container();
  /** Vidrio e interior, en coordenadas de la imagen del vidrio. */
  private readonly art = new Container();
  readonly flow=new WaterFlow();
  private sediment=new Sediment(typeof window!=='undefined'&&window.innerWidth<800?32:64);
  private bubbles=new BubbleParticles(typeof window!=="undefined"&&window.innerWidth<800?ecosystem.bubbles.mobileMax:ecosystem.bubbles.max);
  readonly fish: FishLayer;
  private readonly optics?: IllustratedOptics;
  private readonly bed?: AquariumBed;
  private readonly backObjects = new Container();
  private readonly frontObjects = new Container();
  private readonly paintedLid?: IllustratedLid;
  private decorVersion = 0;
  private readonly softShadow = softPool('#334437');
  private frameCut = 1;
  private get paintedGlass(): boolean { return this.illustrated && !this.round; }
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
  private readonly frontShadows = new Graphics();
  private readonly plantEncounters = new Set<string>();
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
  private waterGradients: ReturnType<typeof fillWater> = [];
  private equipKey = '';
  private lastSeconds = 0;
  private mirrorUntil=0;
  private mirrorAnchor={x:.5,y:.4,z:.5};
  showMirror(id:number):void{
    if(this.lastSeconds<this.mirrorUntil)return;
    const b=this.fish.motion.bodies.get(id);if(!b)return;
    this.mirrorAnchor={x:clamp(b.x/this.flow.width+.08,.1,.9),y:clamp(b.y/this.flow.height,.15,.8),z:b.plane/2};
    this.mirrorUntil=this.lastSeconds+8;
  }

  constructor(private readonly illustrated = false, paintedFish?: ConstructorParameters<typeof FishLayer>[0]) {
    this.fish = new FishLayer(paintedFish);
    if (illustrated) { this.optics = new IllustratedOptics(); this.bed = new AquariumBed(); this.paintedLid = new IllustratedLid(); }
    try{if(localStorage.getItem("lw-tank-glass")==="round")tankAppearance.shape="round";}catch{/* Storage can be unavailable. */}
    if (illustrated) {
      const bed = this.bed!;
      this.inside.addChild(this.substrate, bed.backMask, bed.terrain, ...Object.values(bed.above), this.contactShadows,
        this.backObjects, this.rearPlants, bed.rootSeams.back, this.fish.graphics, this.fish.artBack,
        this.hardscape, this.plantLayer, bed.rootSeams.middle, this.fish.foreground, this.fish.artFront,
        this.foregroundSand, bed.frontMask, bed.details, this.frontShadows, this.frontObjects, this.frontPlants, bed.rootSeams.front,
        this.mid, this.fish.foodGraphics, this.optics!.light, this.fx, this.optics!.reflections);
    } else {
      this.inside.addChild(this.substrate, this.contactShadows, this.rearPlants, this.fish.graphics, this.fish.artBack, this.hardscape, this.plantLayer, this.fish.foreground, this.fish.artFront, this.frontPlants, this.foregroundSand, this.mid, this.fish.foodGraphics, this.fx);
    }
    this.inside.mask = this.waterMask;
    this.equip.mask = this.waterMask;
    this.wet.addChild(this.water,this.glassBack,this.equip,this.inside,this.waterMask,this.roundMask);
    this.art.addChild(this.wet, this.glass, this.glassMask, this.lidSprite, this.ledOff);
    if (this.paintedLid) this.art.addChild(this.paintedLid.container);
    this.container.addChild(this.art);
  }

  /** La carcasa experimental rectangular conserva el render original de las redondas. */
  get isRound():boolean{return this.round;}

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
    this.decorVersion++;
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
    this.glass.texture = tex(this.round ? 'redonda-1' : this.paintedGlass ? 'illustrated-frame' : GLASS);
    this.glassBack.visible = !this.round && !this.paintedGlass;
    this.optics?.updateVisibility(this.paintedGlass);
    const roundKey=this.round?String(this.glass.texture.uid):"";if(roundKey!==this.roundMaskKey){this.roundMaskKey=roundKey;this.roundMask.clear();if(this.round){const t=this.glass.texture,m=visual.roundMask;this.roundMask.ellipse(t.width*m.x,t.height*m.y,t.width*m.rx,t.height*m.ry).fill(0xffffff);}}this.wet.mask=this.round?this.roundMask:null;
    const geo = this.layout(state, derived);
    this.waterArea={x:geo.left,y:geo.waterTop+2,width:geo.width,height:Math.max(1,geo.sandTop-geo.waterTop-2)};
    const dt = this.lastSeconds === 0 ? 0 : Math.max(0, seconds - this.lastSeconds);
    this.updateLid(state.tank.hasLid, dt);
    const pxPerCm = this.inner.width / state.tank.lengthCm;
    const tannins = state.water.tannins;

    this.drawWater(geo, lit, tannins);
    this.drawEquipment(state, geo, lit);
    this.buildDecor(geo);
    this.flow.configure(geo.width/pxPerCm,(geo.sandTop-geo.waterTop-2)/pxPerCm,derived.effectiveFlowLph,state.tank.waterLiters,this.habitat,this.round);this.fish.water=this.flow;
    // Las imágenes se tiñen: más oscuras con la luz apagada y ámbar con taninos.
    const tint = lerpColor(this.illustrated && lit ? 0xe6eedd : ambientTint(lit ? 1 : 0.18), lit ? 0xd9a860 : 0x4a3a2a, tannins * 0.45);
    this.substrate.tint = tint;
    this.foregroundSand.tint = tint;
    for (const child of this.hardscape.children) child.tint = tint;
    for (const child of this.frontObjects.children) child.tint = lerpColor(tint, 0xcab895, 0.13);
    const distantTint = lerpColor(tint, this.waterColor(lit, tannins, 0.46), 0.31);
    for (const child of this.backObjects.children) child.tint = distantTint;
    for (const plant of this.plants) plant.mesh.tint = this.illustrated && plant.depth < 0.3 ? distantTint : tint;
    this.bed?.tint(tint);
    // Las aristas de atrás se ven a través del agua: toman su color.
    this.glassBack.tint = lerpColor(this.waterColor(lit, tannins, 0.4), 0xffffff, 0.45);
    // La corriente mueve las plantas: más con el filtro andando.
    const flow = state.filter.flowLph > 0 ? Math.min(1, derived.effectiveFlowLph / state.filter.flowLph) : 0;
    this.swayPlants(seconds, flow, dt, pxPerCm, state);

    this.fish.habitat=this.habitat;
    this.fish.mirror=seconds<this.mirrorUntil?{x:this.mirrorAnchor.x*this.flow.width,y:this.mirrorAnchor.y*this.flow.height,z:this.mirrorAnchor.z}:undefined;

    const shade = (c: number): number => (lit ? c : lerpColor(c, NIGHT, 0.6));
    this.drawMid(state, derived, geo, shade, seconds);
    this.drawFx(state, geo, shade, lit, seconds);

    if (this.paintedGlass) this.optics?.update(geo, seconds, lit);
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
    const meta = asset(this.round ? 'redonda-1' : GLASS);
    const texture = this.glass.texture;
    const texW = texture.width > 1 ? texture.width : (meta?.width ?? GLASS_ART.width);
    const texH = texture.height > 1 ? texture.height : (meta?.height ?? GLASS_ART.height);
    const source = this.paintedGlass ? FRONT_GLASS : this.round
      ? { width: texW, height: texH, inner: {
          x: texW * visual.roundInner.x, y: texH * visual.roundInner.y,
          width: texW * visual.roundInner.width, height: texH * visual.roundInner.height,
        } }
      : meta?.inner ? { width: texW, height: texH, inner: {
          x: Math.round(meta.inner.x * texW / meta.width), y: Math.round(meta.inner.y * texH / meta.height),
          width: Math.round(meta.inner.width * texW / meta.width), height: Math.round(meta.inner.height * texH / meta.height),
        } } : GLASS_ART;
    this.glass.width = source.width;
    this.glass.height = source.height;
    const inner = source.inner;
    this.frameCut = this.paintedGlass ? FRONT_GLASS.lidCut : Math.max(1, inner.y - 3);
    const frame = this.illustrated ? illustratedFrame(state.tank.lengthCm, source) : tankFrame(state.tank.lengthCm, source);
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
    const rx = texW / (meta?.width ?? texW), ry = texH / (meta?.height ?? texH);
    const led = this.paintedGlass ? undefined : meta?.led;
    this.ledOff.clear();
    if (led && !derived.lightOn) {
      this.ledOff.rect(Math.round(led.x * rx), Math.round(led.y * ry), Math.round(led.width * rx), Math.ceil(led.height * ry)).fill({ color: 0x20242e, alpha: 0.85 });
    }

    const { x: left, y: top, width, height } = inner;
    const bottom = top + height;
    // El agua llena el hueco; la evaporación la baja de a poco.
    const fullTop = top + (this.paintedGlass ? 8 : SURFACE_GAP);
    const waterHeight = Math.round((bottom - fullTop) * clamp(derived.waterLevel, 0, 1));
    const sandH = clamp(Math.round(height * (this.illustrated ? 0.155 : 0.13)), 12, 34);
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

  private updateLid(closed: boolean, dt: number): void {
    const texture = this.glass.texture;
    const cut = this.frameCut;
    const sourceCut = Math.min(texture.height, Math.max(1, Math.round(cut * texture.height / this.glass.height)));
    const painted = this.paintedGlass;
    const separate = !this.round && (painted || !closed);
    const key = `${texture.uid}:${sourceCut}:${separate}`;
    if (this.lidTextureKey !== key) {
      this.lidTextureKey = key;
      this.glassMask.clear();
      this.glass.mask = separate ? this.glassMask : null;
      this.lidSprite.visible = separate && !painted;
      if (separate) {
        // The painted frame keeps its real front rail while the top rotates.
        const rail = painted ? cut - 3.8 : cut;
        this.glassMask.rect(0, rail, this.glass.width, this.glass.height - rail).fill(0xffffff);
        if (!painted) {
          if (this.lidSprite.texture !== Texture.EMPTY) this.lidSprite.texture.destroy(false);
          this.lidSprite.texture = new Texture({ source: texture.source, frame: new Rectangle(0, 0, texture.width, sourceCut) });
          this.lidSprite.width = this.glass.width;
          this.lidSprite.height = cut;
          this.lidSprite.position.set(0, -26);
          this.lidSprite.rotation = -0.035;
        }
      }
    }
    if (this.paintedLid) {
      this.paintedLid.container.visible = painted;
      if (painted) this.paintedLid.update(!closed, dt, this.glass.width, cut - 3.8);
    }
  }

  /** Color del agua a una profundidad (0 superficie .. 1 fondo). */
  waterColor(lit: boolean, tannins: number, depth: number): number {
    const clear = lit ? lerpColor(this.paintedGlass ? 0x96bdb0 : 0x6caaa1, this.paintedGlass ? 0x2b5955 : 0x294e50, depth) : lerpColor(0x14434e, 0x0a2731, depth);
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
    for (const gradient of this.waterGradients) gradient.destroy();
    this.waterGradients = [];
    this.waterMask.clear();
    // Lo de adentro (arena, plantas, peces) se recorta al hueco del vidrio.
    this.waterMask.rect(geo.left, geo.top, geo.width, geo.height).fill(0xffffff);
    if (this.paintedGlass) {
      this.waterGradients = fillWater(g, geo, [
        this.waterColor(lit, tannins, 0), this.waterColor(lit, tannins, 0.39), this.waterColor(lit, tannins, 1),
      ], lit);
      return;
    }
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
    const key = [geo.left, geo.top, geo.width, geo.height, this.paintedGlass, lit, hasHeater, state.heater.on, state.heater.enabled, hasFilter, Math.round(state.water.temperatureC)].join();
    if (key === this.equipKey) return;
    this.equipKey = key;
    const g = this.equip;
    g.clear();
    if (this.paintedGlass) {
      drawIllustratedEquipment(g, geo, state, lit);
      return;
    }
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
    const key = `${geo.left},${geo.top},${geo.width},${geo.height},${geo.waterTop},${geo.sandTop},${this.decorVersion}`;
    if (key === this.decorKey) return;
    this.decorKey = key;

    // Sustrato: se repite a lo ancho, con su píxel natural (no se estira).
    const unit = this.illustrated ? tex(this.decor.substrate).width / geo.width : artPx(this.decor.substrate);
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
    if (this.bed) {
      const start = geo.sandTop - 23;
      this.substrate.position.y = this.foregroundSand.position.y = start;
      this.substrate.height = this.foregroundSand.height = geo.bottom - start;
      this.substrate.tilePosition.y = -this.substrate.texture.height / unit * 0.34;
      this.foregroundSand.tilePosition.copyFrom(this.substrate.tilePosition);
      this.bed.build(geo);
      this.substrate.mask = this.bed.backMask;
      this.foregroundSand.mask = this.bed.frontMask;
    }

    for (const layer of [this.backObjects, this.hardscape, this.frontObjects]) {
      for (const child of layer.removeChildren()) child.destroy();
    }
    for (const child of this.plantLayer.removeChildren()) child.destroy();
    for (const child of this.rearPlants.removeChildren()) child.destroy();
    for (const child of this.frontPlants.removeChildren()) child.destroy();
    this.contactShadows.clear();
    this.frontShadows.clear();
    this.plants = [];
    this.plantEncounters.clear();
    this.habitat = emptyHabitat();
    if (this.illustrated) this.habitat.features = [{ x: 0.63, y: 0.15, z: 0.59 }];
    for (const [index, item] of this.decor.items.entries()) {
      const name = item.asset ?? (item.plant ? `${item.plant}-${item.stage ?? 1}` : '');
      if (!asset(name)) continue;
      const texture = tex(name);
      const unit = artPx(name);
      // 1 píxel del dibujo = 1 píxel del vidrio. Las plantas, a lo sumo un tercio del agua.
      let scale = item.width ? item.width * geo.width / texture.width : (item.scale ?? 1) / unit;
      if (item.plant) {
        const heightScale = (geo.bottom - geo.top) * (item.height ?? 0.45) / texture.height;
        scale = this.illustrated ? Math.min(heightScale, geo.width * 0.3 / texture.width) : Math.min(scale, heightScale);
      }
      const w = texture.width * scale;
      const h = texture.height * scale;
      const cx = Math.round(clamp(geo.left + item.x * geo.width, geo.left + w / 2, geo.right - w / 2));
      const layer = item.layer === 'back' || item.layer === 'front' ? item.layer : 'middle';
      const depth = planeDepth[layer];
      const u = (cx - geo.left) / geo.width;
      const ground = this.bed ? bedSurface(geo, u, layer) : geo.sandTop;
      const canopy = this.bed && item.plant ? canopyMotion(name, index) : undefined;
      const bury = canopy?.burial ?? item.sink ?? 0;
      const baseY = Math.min(geo.bottom - 1, Math.round(ground + bury * h));
      const swimY = geo.waterTop + 2;
      const heightInWater = this.waterArea.height;
      const shadowW = Math.min(w * 0.7,geo.width*0.32);
      if (this.illustrated) {
        const shadow = layer === 'front' ? this.frontShadows : this.contactShadows;
        if (canopy) {
          shadow.ellipse(cx + w * 0.075, ground + 1.2, w * 0.28, 3.25)
            .fill({ fill: this.softShadow, alpha: 0.37 });
        } else {
          shadow.ellipse(cx + w * 0.13, ground + 2, shadowW * 0.76, Math.max(3, h * 0.085))
            .fill({ fill: this.softShadow, alpha: 0.43 });
          shadow.ellipse(cx, ground + 1, w * 0.32, Math.max(1.3, h * 0.043))
            .fill({ fill: this.softShadow, alpha: 0.58 });
        }
      } else {
        for (let row = 0; row < 3; row++) this.contactShadows.rect(Math.round(cx - shadowW / 2 + row * 2), geo.sandTop + row, Math.max(1, Math.round(shadowW - row * 4)), 1);
        this.contactShadows.fill({ color: ART.shadow, alpha: item.plant ? 0.1 : 0.22 });
      }
      if(item.plant){
        const ny=(baseY-geo.waterTop-2)/Math.max(1,geo.sandTop-geo.waterTop-2),nh=h/Math.max(1,geo.sandTop-geo.waterTop-2);
        this.habitat.refuges.push({x:(cx-geo.left)/geo.width,y:Math.max(.12,Math.min(.88,ny-nh*.4))});
        if(item.plant==='anubias')this.habitat.leaves.push({x:(cx-geo.left)/geo.width,y:Math.max(.1,Math.min(.8,ny-nh*.8))});
        this.habitat.obstacles.push({ x: u, y: Math.min(.98, ny - .04), rx: .012, ry: .035,
          z: this.illustrated ? depth : undefined, depth: 0.28 });
        this.habitat.features?.push({ x: Math.max(0.07, Math.min(0.93, u + (u < 0.5 ? 0.10 : -0.10))),
          y: Math.max(0.16, Math.min(0.85, ny - nh * 0.48)), z: depth });
        const mesh = new MeshPlane({ texture, verticesX: this.illustrated ? 6 : 4, verticesY: PLANT_ROWS });
        mesh.scale.set(item.flip ? -scale : scale, scale);
        if (this.bed) {
          const rootLine = this.bed.above[layer];
          mesh.mask = rootLine;
          rootLine.visible = true;
          this.bed.seatRoots(geo, layer, u, w, index);
        }
        mesh.position.set(Math.round(item.flip ? cx + w / 2 : cx - w / 2), baseY - Math.round(h));
        (item.layer === 'back' ? this.rearPlants : item.layer === 'front' ? this.frontPlants : this.plantLayer).addChild(mesh);
        const positions = mesh.geometry.getAttribute('aPosition').buffer.data as Float32Array;
        this.plants.push({ motion: new PlantMotion(9, index * 1.7, item.plant), mesh,
          rest: positions.slice(), phase: index * 1.7, cx, baseY, worldHeight: h, worldWidth: w, canopy, depth });
      } else {
        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5, 1);
        sprite.scale.set(item.flip ? -scale : scale, scale);
        sprite.position.set(cx, baseY);
        const objects = this.illustrated && layer === 'back' ? this.backObjects
          : this.illustrated && layer === 'front' ? this.frontObjects : this.hardscape;
        objects.addChild(sprite);
        const slab = this.illustrated ? depth : item.layer === 'back' ? 0.2 : item.layer === 'front' ? 0.8 : 0.5;
        if (layer !== 'front' && w > geo.width * 0.13) {
          this.habitat.features?.push({ x: u, y: clamp((baseY - h * 0.88 - swimY) / heightInWater, 0.2, 0.84), z: slab });
        }
        this.habitat.solids!.push({key:name+':'+index,x:(cx-w/2-geo.left)/geo.width,y:(baseY-h-geo.waterTop-2)/this.waterArea.height,width:w/geo.width,height:h/this.waterArea.height,z:slab,depth:.42,...textureSilhouette(texture,!!item.flip)});
        this.habitat.obstacles.push({z:slab,depth:.42,x:(cx-geo.left)/geo.width,y:Math.min(.95,(baseY-h*.38-geo.waterTop-2)/Math.max(1,geo.sandTop-geo.waterTop-2)),rx:w*.27/geo.width,ry:h*.22/Math.max(1,geo.sandTop-geo.waterTop-2)});
      }
    }
  }

  /**
   * Ondulación suave de las plantas: la base queda quieta y la punta se hamaca
   * unos píxeles, de a píxeles enteros del dibujo; la malla dobla la planta de
   * forma pareja (sin rayas).
   */
  private swayPlants(seconds: number, flow: number, dt: number, pxPerCm: number, state: SimState): void {
    const recent = new Set<string>();
    const visitors = state.animals.filter(animal => animal.alive).flatMap(animal => {
      const b = this.fish.motion.bodies.get(animal.id);
      return b ? [{ id: animal.id, x: this.waterArea.x + b.x * pxPerCm,
        y: this.waterArea.y + b.y * pxPerCm, vx: b.vx, z: b.plane / 2 }] : [];
    });
    for (const [index, plant] of this.plants.entries()) {
      const buffer = plant.mesh.geometry.getAttribute('aPosition').buffer;
      const positions = buffer.data as Float32Array;
      const height = plant.mesh.texture.height;
      const width = plant.mesh.texture.width;
      const profile = plant.canopy;
      const nearby = visitors.flatMap(f => {
        const height = (plant.baseY - f.y) / plant.worldHeight;
        const distance = Math.abs(f.x - plant.cx) / Math.max(14, plant.worldWidth * 0.77);
        const depth = this.illustrated ? Math.abs(plant.depth - f.z) : 0;
        if (height < 0 || height > 1 || distance >= 1 || depth > 0.34) return [];
        const contact = `${index}:${f.id}`;
        recent.add(contact);
        const flip = Math.sign(plant.mesh.scale.x);
        const speed = f.vx * flip * (1 - depth / 0.4) * (profile?.wake ?? 1);
        if (!this.plantEncounters.has(contact)) {
          plant.motion.receiveImpulse(height, speed * bettaConfig.plantImpulse * (1 - distance * 0.55));
        }
        return [{ height, distance, speed: speed * 0.16 }];
      });
      const current = this.flow.getWaterVelocity((plant.cx - this.inner.x) / pxPerCm,
        (plant.baseY - plant.worldHeight * 0.58 - this.waterArea.y) / pxPerCm).x;
      plant.motion.update(dt, seconds, flow, nearby, current * Math.sign(plant.mesh.scale.x));
      for (let i = 0; i < positions.length; i += 2) {
        const heightFromBase = 1 - plant.rest[i + 1]! / height;
        // The whole exposed crown eases into the motion. The area below,
        // including the small visible part of the roots, stays pinned.
        const pinned = profile ? profile.burial + 0.045 : 0;
        const free = Math.max(0, (heightFromBase - pinned) / (1 - pinned));
        const sample = free ** 1.52 * 8;
        const row = Math.min(7, Math.floor(sample));
        const blend = sample - row;
        const offset = plant.motion.offsets[row]! * (1 - blend) + plant.motion.offsets[row + 1]! * blend;
        const blade = profile
          ? Math.sin(seconds * profile.frequency * profile.direction + plant.phase + plant.rest[i]! / width * 2.5 + free * 2.8)
            * free ** 2 * height * profile.amplitude * 0.018 * Math.sign(plant.mesh.scale.x) : 0;
        positions[i] = plant.rest[i]! + offset * height * (profile?.amplitude ?? 1) + blade;
      }
      buffer.update();
    }
    this.plantEncounters.clear();
    for (const contact of recent) this.plantEncounters.add(contact);
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
    const scale = this.inner.width / this.flow.width;
    const outlet = this.paintedGlass ? filterMount(geo) : undefined;
    const source = outlet ? { x: (outlet.x - left) / scale, y: (outlet.outlet - waterTop - 2) / scale } : undefined;
    this.bubbles.update(Math.max(0, seconds - this.lastSeconds), this.flow.width, this.flow.height,
      this.flow.strength * (this.paintedGlass ? 0.66 : 1), this.flow, source);
    for (const bubble of this.bubbles.particles) {
      const x = left + bubble.x * scale, y = waterTop + 2 + bubble.y * scale;
      const r = Math.max(0.42, bubble.radius * scale);
      const alpha = derived.lightOn ? 0.58 : 0.28;
      g.ellipse(x, y, r, r * 0.9).stroke({ color: 0xcdece0, width: Math.min(0.63, r * 0.58), alpha });
      if (r > 0.75) g.circle(x - r * 0.3, y - r * 0.38, r * 0.2).fill({ color: 0xf3fff2, alpha: alpha * 0.92 });
    }
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
    if (!this.paintedGlass && lit && waterHeight > 12) {
      const rays = Math.max(3, Math.round(width / 52));
      const mid = left + width / 2;
      for (let i = 0; i < rays; i++) {
        const baseX = left + ((i + 0.5) * width) / rays + Math.sin(seconds * 0.15 + i * 2) * 10;
        const wd = 8 + 10 * scatter(i, 81);
        const alpha = ecosystem.water.rayAlpha + 0.01 * Math.sin(seconds * 0.6 + i * 1.9);
        const slant = 0.4 * ((baseX - mid) / width) + surfaceSlope((baseX-left)/width,seconds);
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

    // Persistent local trajectories, shared current and brief bottom-foraging wakes.
    const turbidity=Math.min(1,state.organics.detritusG*.3+state.algae.glass*.2);
    const foragers=state.animals.filter(a=>a.alive&&a.intent==='eat'&&a.speciesId.includes('cory')).flatMap(a=>{const b=this.fish.motion.bodies.get(a.id);return b?[{x:b.x,y:b.y,speed:Math.hypot(b.vx,b.vy)}]:[];});
    this.sediment.update(seconds-this.lastSeconds,ecosystem.water.cleanSpecks+turbidity*ecosystem.water.dirtySpecks,this.flow.width,this.flow.height,this.flow,foragers);
    for(const p of this.sediment.particles)g.circle(left+p.x/this.flow.width*width,this.waterArea.y+p.y/this.flow.height*this.waterArea.height,.55);
    if(this.sediment.particles.length)g.fill({color:0xeafff4,alpha:lit?.2:.1});
    if(lit && !this.paintedGlass)for(const strip of causticStrips(seconds,window.innerWidth<800?12:22)){
      g.ellipse(left+strip.x*width,geo.sandTop+2,width*.025,1.4).fill({color:0xdaf6ce,alpha:strip.intensity*.08});
    }

    // Brillos que corren por la superficie.
    let run = 0;
    let glints = 0;
    for (let x = left; !this.paintedGlass && x <= right; x++) {
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

    if(seconds<this.mirrorUntil){
      const x=left+this.mirrorAnchor.x*width,y=this.waterArea.y+this.mirrorAnchor.y*this.waterArea.height,w=width*.07,h=this.waterArea.height*.24;
      g.roundRect(x-w/2,y-h/2,w,h,2).fill({color:0x65787d,alpha:.95}).stroke({color:0xc6d4cc,width:1.4});
      g.poly([x-w*.35,y-h*.4,x+w*.2,y-h*.4,x-w*.1,y+h*.4,x-w*.35,y+h*.4]).fill({color:0xe1f9f3,alpha:.4});
      g.ellipse(x,y,w*.24,h*.12).fill({color:0xb17387,alpha:.4});
    }
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
