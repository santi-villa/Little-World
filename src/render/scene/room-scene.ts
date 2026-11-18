import {CodeBird} from './code-bird';
import { cannotUse, pinchGrams, strokeSamples, type HandTool } from '../hand-tools';
import { confirmPaper, dismissNote, type CursorState } from '../ui/paper-ui';
import { fill } from '../ui/texts';
import { ambientTint } from '../art-direction';
import { illustratedDecor } from '../tank/illustrated-layout';
import { IllustratedRoomDecor, illustratedRoom } from './illustrated-room-decor';
import type { RoomData } from './room-zones';
import decorData from '../../data/tank-decor.json';
import type { OutsideView } from '../../world/weather';
/**
 * Escena de 1280x720: el dormitorio (imagen) con la pecera sobre el escritorio,
 * vista a través de una cámara con zoom y paneo.
 *
 * Mundo (se mueve con la cámara), de atrás hacia adelante:
 *   skyBase  (código)  degradé del cielo según la hora
 *   sky      (código)  estrellas que titilan, nubes, árboles, lluvia y rayos
 *   bird     (código)  el pájaro que a veces se posa afuera, en el alféizar
 *   room     (imagen)  dormitorio.png, con los vidrios transparentes
 *   plants   (imagen)  plantas colgantes y enredadera, con vaivén
 *   anim     (código)  vapor de la taza y plato del gato
 *   pecera -> gato
 *   lights   (aditivo) lámpara, resplandor de la pecera y sol en el piso
 *   flash    (aditivo) relámpago iluminando la habitación
 *   glow     (aditivo) brillo de la zona recién tocada
 * Pantalla (quieta): HUD y botones.
 *
 * Vistas: la habitación (deslizar mueve la cámara), la pecera de cerca (con las
 * acciones de cuidado) y el gato de cerca (para acariciarlo). Las zonas
 * tocables salen de `src/data/rooms.json`.
 */

import { Container, Graphics, Sprite } from 'pixi.js';
import { defaultConfig, type DerivedValues, type SimAction, type SimState, type Weather } from '../../sim';
import { asset, tex } from '../assets';
import { Camera, type CameraView } from '../camera';
import { aquariumEnvironment, easeEnvironment, roomLightTint, type AquariumEnvironment } from './aquarium-environment';
import { TankView } from '../tank/tank-view';
import { careBarHeight, uiInsets, SceneUi, type CareId, type UiMode } from '../ui/scene-ui';
import { texts } from '../ui/texts';
import { GAME_HEIGHT, GAME_WIDTH } from '../viewport';
import { CatView } from './cat-view';
import { drawLights, drawRoomAnim } from './room-fx';
import { inRect, roomData, zoneRect, type RoomZone } from './room-zones';
import { BIRD_PERCH, HANGING, PX, scenePreview } from './scene-layout';
import { drawSky } from './window-view';

/** Lo que la escena necesita además del estado de la simulación. */
export interface SceneView {
  weather: Weather;
  outside?: OutsideView;
  timeMinutes?: number;
  decorId?: string;
  bettaStyle?: 'code'|'image'|'flat';
}

type Point = { x: number; y: number };

const ROOM_ID = 'dormitorio';
/** Cuánto hay que mover el dedo para que deje de ser un toque (píxeles de pantalla). */
const DRAG_START = 10;
/** Deslizar hacia abajo esto (en la vista de cerca) vuelve a la habitación. */
const SWIPE_EXIT = 90;
/** Caricia: cuánto deslizar y cada cuánto cuenta otra. */
const STROKE_PIXELS = 28;
const STROKE_SECONDS = 0.35;
/** Cuánto dura el brillo de una zona tocada. */
const GLOW_SECONDS = 0.6;

interface Gesture {
  start: Point;
  last: Point;
  dragging: boolean;
  /** Ya salió de la vista de cerca con este gesto. */
  exited: boolean;
  petting: { travelled: number; lastStroke: number } | null;
}

export class RoomScene {
  readonly container = new Container();
  private readonly world = new Container();
  private readonly camera = new Camera(this.world);
  private readonly data: RoomData;
  private readonly skyBase = new Graphics();
  private readonly sky = new Graphics();
  private readonly outsideMask = new Graphics();
  private readonly bird = new CodeBird();
  /** Plantas que se hamacan: rotación muy leve con el pivote arriba. */
  private readonly swaying: { sprite: Sprite; phase: number; amount: number }[] = [];
  private readonly room: Sprite;
  private readonly paintedDecor?: IllustratedRoomDecor;
  private skyKey = '';
  private nextSkyAt = 0;
  private lastBolt = 0;
  private tankFit?: { fill: number; key: string };
  private cloudDistance = 0;
  private environment?: AquariumEnvironment;
  private readonly anim = new Graphics();
  private readonly lights = new Graphics();
  private readonly flash = new Graphics();
  private readonly glow = new Graphics();
  private readonly handOverlay=new Graphics();
  private readonly tank: TankView;
  private hybrid?:import('../dev/hybrid-tank-dev').HybridTankDev;
  private readonly focusShade=new Graphics();
  private get tankBounds(){return this.hybrid?.bounds??this.tank.bounds;}
  private tankPoint(p:Point):Point{return this.hybrid?.toTankPoint(p)??p;}
  private readonly cat: CatView;
  private readonly ui = new SceneUi();
  /** Los vidrios de la ventana, en píxeles gordos. */
  private readonly window: { x: number; y: number; width: number; height: number };
  private handTool:HandTool='hand';
  /** Si una herramienta no se puede usar: la bandeja la sacude y explica por qué. */
  onReject:(tool:HandTool,reason:string)=>void=()=>undefined;
  private hand:{x:number;y:number;at:number;speed:number}|null=null;
  private state:SimState|null=null;
  private lastTap=-100;
  private mode: UiMode = 'room';
  followingId:number|null=null;
  get grainContacts(){return this.tank.fish.grainContacts;}
  get foodPositions(){return this.tank.fish.foodPositions;}
  get feedingContacts(){return this.tank.fish.feedingContacts;}
  zoomAt(p:Point,factor:number):void{this.tankFit=undefined;this.followingId=null;this.gesture=null;this.camera.zoomAt(p.x,p.y,factor);}
  showFish(id:number):void {const p=this.tank.fishPoint(id);if(!p)return;this.followingId=id;this.handTool='hand';this.enterFocus('tank',{x:p.x,y:p.y,zoom:Math.max(3,Math.min(12,120/Math.max(1,p.length)))});}
  showMirror(id:number):void{this.showTank();this.tank.showMirror(id);}
  fishDetails():void {if(this.followingId!==null)this.tools('fish',this.followingId);}
  /** Vista de la habitación a la que se vuelve al salir de una vista de cerca. */
  private roomView: CameraView;
  private focusSince = 0;
  private gesture: Gesture | null = null;
  private glowZone: { zone: RoomZone; since: number } | null = null;
  /** null: la lámpara se prende sola cuando oscurece; si no, lo que eligió el jugador. */
  private lamp: boolean | null = null;
  private lampOn = false;
  /** Zoom de la vista del gato (sale de su zona en rooms.json). */
  private zoomCat = 2.2;
  private decorId = '';
  private lightsKey = '';
  private lastSeconds = 0;
  private seconds = 0;

  /** @param act Hace una acción de la simulación (acariciar al gato, abrir la ventana, cuidados). */
  constructor(private readonly act: (action: SimAction) => void, private readonly tools: (page: 'fish' | 'diary' | 'guide' | 'weather' | 'decor' | 'status' | CareId, animalId?: number) => void,
    private readonly illustrated = false,
    paintedFish?: ConstructorParameters<typeof TankView>[1],
  ) {
    this.data = roomData(illustrated ? 'illustrated-bedroom' : ROOM_ID);
    this.room = new Sprite(tex(this.data.background));
    this.tank = new TankView(illustrated, paintedFish);
    this.cat = new CatView(illustrated ? illustratedRoom.cat : undefined, illustrated);
    if (illustrated) {
      this.room.width = GAME_WIDTH;
      this.room.height = GAME_HEIGHT;
      this.paintedDecor = new IllustratedRoomDecor();
    }
    const hole = asset(this.data.background)?.hole ?? { x: 413, y: 85, width: 496, height: 300 };
    this.window = illustrated ? illustratedRoom.window : {
      x: Math.floor(hole.x / PX),
      y: Math.floor(hole.y / PX),
      width: Math.ceil(hole.width / PX) + 1,
      height: Math.ceil(hole.height / PX) + 1,
    };
    const skyScale = illustrated ? 1 : PX;
    this.skyBase.scale.set(skyScale);
    this.sky.scale.set(skyScale);

    const decor = new Container();
    const hang = (name: string, x: number, y: number, scale: number, phase: number, amount: number, flip = false): void => {
      const sprite = new Sprite(tex(name));
      // Pivote arriba al centro: de ahí cuelga y alrededor de ahí se hamaca.
      sprite.anchor.set(0.5, 0);
      sprite.scale.set(flip ? -scale : scale, scale);
      sprite.position.set(x, y);
      decor.addChild(sprite);
      this.swaying.push({ sprite, phase, amount });
    };
    if (!illustrated) for (const p of HANGING) hang(p.asset, p.x, p.y, p.scale, p.phase, 1);
    this.anim.scale.set(PX);
    this.lights.blendMode = 'add';
    this.flash.blendMode = 'add';
    this.glow.blendMode = 'add';

    // Las plantas colgantes quedan quietas (son parte del fondo): el viento con
    // un shader hacía rayas. Ver PENDIENTE.md: hacerlas con sprites separados.

    const outside=new Container();
    this.outsideMask.rect(this.window.x*skyScale,this.window.y*skyScale,this.window.width*skyScale,this.window.height*skyScale).fill(0xffffff);
    outside.addChild(this.skyBase,this.sky,this.bird.container,this.outsideMask);outside.mask=this.outsideMask;
    this.world.addChild(
      outside,
      this.room,
      this.paintedDecor?.container ?? decor,
      this.anim,
      this.focusShade,
      this.tank.container,
      this.handOverlay,
      this.cat.container,
      this.lights,
      this.flash,
      this.glow,
    );
    this.container.addChild(this.world);
    this.roomView = { ...this.data.camera };
    this.camera.goTo(this.roomView, true);
    if(import.meta.env.DEV && !illustrated)void import('../dev/hybrid-tank-dev').then(({HybridTankDev})=>{
      const index=this.world.getChildIndex(this.tank.container);this.hybrid=new HybridTankDev(this.tank);this.world.addChildAt(this.hybrid.container,index);this.hybrid.setFocus(this.mode==='tank');
    });
  }

  syncState(state: SimState): void {
    if (!state.tank.hasLid && this.state?.tank.hasLid) dismissNote(texts.ui.cannot.lidClosed);
    this.state = state;
  }

  update(state: SimState, derived: DerivedValues, seconds: number, view: SceneView): void {
    this.syncState(state);
    const dt = this.lastSeconds === 0 ? 0 : seconds - this.lastSeconds;
    this.lastSeconds = seconds;
    this.seconds = seconds;
    const visualDt = Math.min(0.1, Math.max(0, dt));
    const target = aquariumEnvironment(view.timeMinutes ?? state.timeMinutes, view.weather,
      derived.lightOn, view.outside, scenePreview.hour);
    const environment = this.environment = easeEnvironment(this.environment, target, visualDt);
    const decorId = view.decorId ?? 'default';
    if (decorId !== this.decorId) {
      this.decorId = decorId;
      this.tank.setDecor(this.illustrated ? illustratedDecor[decorId] ?? illustratedDecor.default! :
        decorId === 'garden' ? decorData.garden : decorId === 'stones' ? decorData.stones : decorData.default);
    }

    const hand=this.hand;
    this.tank.setHand(this.mode==='tank' && hand ? {x:hand.x*state.tank.lengthCm,y:hand.y*(this.tank.waterBounds.height/Math.max(1,this.tank.waterBounds.width))*state.tank.lengthCm,speed:hand.speed,age:seconds-hand.at}:null);
    document.body.dataset.handTool=this.handTool;
    this.tank.fish.bettaStyle=view.bettaStyle??'code';
    this.tank.update(state, derived, seconds, environment);
    this.hybrid?.update(state,derived,dt);
    this.focusShade.clear();const dim=this.hybrid?.roomDim??0;if(dim>0)this.focusShade.rect(0,0,GAME_WIDTH,GAME_HEIGHT).fill({color:0x061c24,alpha:dim});
    const uiMode=this.mode==='tank'&&this.hybrid?.active&&!this.hybrid.ready?'room':this.mode;
    if(document.body.dataset.view!==uiMode)document.body.dataset.view=uiMode;
    if(this.followingId!==null&&!this.hybrid?.moving&&!this.camera.transitioning){const p=this.tank.fishPoint(this.followingId),animal=state.animals.find(a=>a.id===this.followingId);if(!p||!animal?.alive)this.showTank();else this.focusOn({x:p.x,y:p.y,zoom:this.camera.target.zoom},false);}

    this.handOverlay.clear();
    if(this.mode==='tank' && hand && seconds-hand.at<2){
      const r=this.tank.waterBounds,cx=r.x+hand.x*r.width,cy=r.y+hand.y*r.height;
      if(this.handTool==='sponge'){
        this.handOverlay.rect(Math.round(cx-8),Math.round(cy-5),16,10).fill(0xd9c48c);
        this.handOverlay.rect(Math.round(cx-8),Math.round(cy+3),16,3).fill(0x607858);
        this.handOverlay.rect(Math.round(cx-5),Math.round(cy-3),10,2).fill(0xeee1ad);
      }else if(this.handTool==='food'){
        this.handOverlay.rect(Math.round(cx-2),Math.round(r.y-3),4,1).fill({color:0xf0d59c,alpha:.8});
      }
    }
    const light = this.drawRoom(state, derived, seconds, visualDt, view, environment);
    this.cat.update(
      Math.max(light, derived.lightOn ? 0.6 : 0.3), seconds,
    );
    // De cerca, la cámara acompaña al gato si camina.
    if (this.mode === 'cat' && !this.gesture?.dragging) this.focusOn(this.catFocus(), false);
    if (this.mode === 'tank' && this.tankFit && this.followingId === null) {
      const key = this.tankFitKey();
      if (key !== this.tankFit.key) {
        this.tankFit.key = key;
        this.camera.goTo(this.tankFocus(this.tankFit.fill), false, 0.42, false);
      }
    }
    this.camera.update(dt);
    this.drawGlow(seconds);
    this.ui.update(this.mode, state, seconds, seconds - this.focusSince);
  }

  // --- Toques y gestos (puntos en píxeles de la pantalla, 1280x720) ---

  pointerDown(p: Point): void {
    this.gesture = { start: p, last: p, dragging: false, exited: false, petting: null };
    if (this.mode === 'cat' && !this.ui.panelOpen && this.ui.hit(p.x, p.y) === null) {
      const w = this.camera.toWorld(p.x, p.y);
      if (this.cat.hit(w.x, w.y)) {
        // Apoyar la mano ya es una caricia; deslizar suma más.
        this.gesture.petting = { travelled: 0, lastStroke: this.seconds };
        this.petCat();
      }
    }
  }

  pointerLeave():void {this.hand=null;this.tank.setHand(null);}
  private normalized(p:Point):{x:number;y:number}|null {
    const w=this.tankPoint(this.camera.toWorld(p.x,p.y)),r=this.tank.waterBounds;
    if(!inRect(r,w.x,w.y))return null;
    return {x:(w.x-r.x)/r.width,y:(w.y-r.y)/r.height};
  }
  pointerMove(p: Point): void {
    const point=this.mode==='tank'?this.normalized(p):null;
    if(point){const old=this.hand;const dt=Math.max(.016,this.seconds-(old?.at??this.seconds));this.hand={...point,at:this.seconds,speed:old?Math.hypot(point.x-old.x,point.y-old.y)*60/dt:0};}
    else this.hand=null;
    const g = this.gesture;
    if (!g) return;
    if(this.mode==='tank' && this.handTool==='sponge' && this.ui.hit(g.start.x,g.start.y)===null){
      const a=this.normalized(g.last),b=this.normalized(p);
      if(a&&b&&Math.hypot(a.x-b.x,a.y-b.y)>.004){
        const samples=strokeSamples(a,b),distance=Math.hypot(a.x-b.x,a.y-b.y);
        const strength=Math.min(1,defaultConfig.algae.manualScrubStrength*distance/.04/samples.length);
        for(const sample of samples)this.act({type:'scrubGlass',...sample,radius:defaultConfig.algae.manualScrubRadius,strength});
        g.dragging=true;g.last=p;
      }
      return;
    }
    if(this.mode==='tank' && this.handTool!=='observe'){g.last=p;return;}
    const dx = p.x - g.last.x;
    const dy = p.y - g.last.y;
    g.last = p;
    if (g.petting) {
      g.petting.travelled += Math.hypot(dx, dy);
      const w = this.camera.toWorld(p.x, p.y);
      if (
        g.petting.travelled >= STROKE_PIXELS &&
        this.seconds - g.petting.lastStroke >= STROKE_SECONDS &&
        this.cat.hit(w.x, w.y)
      ) {
        g.petting.travelled = 0;
        g.petting.lastStroke = this.seconds;
        this.petCat();
      }
      return;
    }
    if (!g.dragging && Math.hypot(p.x - g.start.x, p.y - g.start.y) >= DRAG_START) g.dragging = true;
    if (!g.dragging || this.ui.panelOpen) return;
    if (this.mode === 'room') {
      // Deslizar mueve la cámara por la habitación.
      this.camera.dragging = true;
      this.camera.panBy(dx, dy);
    } else if (!g.exited) {
      // De cerca: deslizar hacia abajo vuelve a la habitación.
      const down = p.y - g.start.y;
      if (down > SWIPE_EXIT && down > Math.abs(p.x - g.start.x) * 1.5) {
        g.exited = true;
        this.exitFocus();
      }
    }
  }

  pointerUp(p: Point, cancelled = false): void {
    const g = this.gesture;
    this.gesture = null;
    this.camera.dragging = false;
    if (!g || cancelled || g.dragging || g.petting) return;
    this.tap(p);
  }

  private tap(p: Point): void {
    // Un panel abierto se cierra con cualquier toque.
    if (this.ui.panelOpen) {
      this.ui.closePanel();
      return;
    }
    const hit = this.ui.hit(p.x, p.y);
    if (hit?.kind === 'back') {
      this.exitFocus();
      return;
    }
    if (hit?.kind === 'care') {
      if(hit.id==='feed'){this.selectTool('food');return;}
      if(hit.id==='cleanGlass'){this.selectTool('sponge');return;}
      this.tools(hit.id);
      return;
    }

    const worldPoint=this.camera.toWorld(p.x,p.y);
    if(this.mode==='tank'&&this.hybrid?.active&&!this.hybrid.ready)return;
    if(this.mode==='room'&&this.hybrid?.active&&this.hybrid.contains(worldPoint)){this.showTank();return;}
    const w = this.tankPoint(worldPoint);
    if (this.mode === 'tank') {
      const r=this.tank.waterBounds,state=this.state;
      if(!state)return;
      if(this.handTool==='food'){
        // A click above the surface chooses where the hand drops its pinch.
        if(w.x>=r.x && w.x<=r.x+r.width && w.y>=this.tank.bounds.y-35 && w.y<=r.y+r.height){
          const why=cannotUse('food',state);
          if(why){this.onReject('food',texts.ui.cannot[why]);return;}
          const grams=pinchGrams(state);
          this.act({type:'feed',grams,x:Math.max(0,Math.min(1,(w.x-r.x)/r.width))});
          this.ui.say(texts.ui.pinch);
        }
        return;
      }
      if(inRect(r,w.x,w.y)){
        if(this.handTool==='tap'){
          if(this.seconds-this.lastTap<1)return;
          this.lastTap=this.seconds;this.act({type:'tapGlass'});this.tank.scareAt(w.x,w.y);this.ui.say(texts.ui.knock);
        } else if(this.handTool==='observe'||this.handTool==='hand'){
          const id=this.tank.fishAt(w.x,w.y);if(id!==null){this.showFish(id);this.fishDetails();}
        } else if(this.handTool==='kit'){
          this.tools('status');
        } else if(this.handTool==='bucket'){
          void this.confirmCare('bucket');
        } else if(this.handTool==='filter'){
          const why=cannotUse('filter',state);
          if(why)this.onReject('filter',texts.ui.cannot[why]);else void this.confirmCare('filter');
        }
      }
      return;
    }
    if (this.mode === 'cat') {
      if (this.cat.hit(worldPoint.x, worldPoint.y)) this.petCat();
      return;
    }

    if(this.mode==='room' && !this.illustrated){const id=this.tank.fishAt(w.x,w.y);if(id!==null){this.showFish(id);this.fishDetails();return;}}

    const live = { tank: this.tankBounds, cat: this.cat.rect };
    const zone = this.data.zones.find((z) => inRect(zoneRect(z, live), worldPoint.x, worldPoint.y));
    if (!zone) return;
    this.glowZone = { zone, since: this.seconds };
    this.runZone(zone);
  }

  private runZone(zone: RoomZone): void {
    switch (zone.action) {
      case 'tank-view':
        this.frameTank(zone.fill ?? 0.85);
        break;
      case 'pet-cat':
        this.zoomCat = zone.zoom ?? 2.2;
        this.enterFocus('cat', this.catFocus());
        this.petCat();
        break;
      case 'panel':
        if (zone.panel) this.tools(zone.panel === 'notebook' ? 'diary' : 'guide');
        break;
      case 'toggle-window': {
        this.enterFocus('window', this.illustrated ? illustratedRoom.windowFocus : { x: 660, y: 250, zoom: 1.5 });
        this.tools('weather');
        break;
      }
      case 'toggle-lamp':
        this.lamp = !this.lampOn;
        this.ui.say(this.lamp ? texts.scene.lampOn : texts.scene.lampOff);
        break;
    }
  }

  /**
   * Agarra una herramienta (o la suelta con 'hand'). Si no se puede usar ahora,
   * no se agarra y devuelve el motivo (la bandeja la sacude y lo explica).
   */
  selectTool(tool:HandTool):string|null {
    if(this.mode!=='tank'||this.followingId!==null)this.showTank();
    if(tool==='hand'||tool===this.handTool){this.handTool='hand';return null;}
    const why=this.state?cannotUse(tool,this.state):null;
    // La comida con la tapa cerrada se puede agarrar igual: el aviso dice qué falta.
    if(why&&!(tool==='food'&&why==='lidClosed'))return texts.ui.cannot[why];
    this.handTool=tool;
    this.ui.say(why?texts.ui.cannot[why]:texts.ui.toolHints[tool]);
    return null;
  }
  get activeTool():HandTool{return this.handTool;}

  /** Cambio de agua o limpieza de filtro: acciones importantes, con confirmación. */
  private async confirmCare(kind:'bucket'|'filter'):Promise<void>{
    const state=this.state;if(!state)return;
    const text=kind==='bucket'?fill(texts.ui.bucketConfirm,{liters:(state.tank.waterLiters*0.25).toFixed(1)}):texts.ui.filterConfirm;
    if(!(await confirmPaper(text,texts.ui.yes,texts.ui.no)))return;
    const now=this.state;if(!now)return;
    if(kind==='bucket'){
      this.act({type:'waterChange',fraction:0.25,conditioned:true,vacuum:true,temperatureC:now.water.temperatureC});
      this.ui.say(texts.ui.waterChanged);
    }else{
      this.act({type:'cleanFilter',method:'tankWater'});
      this.ui.say(texts.ui.filterCleaned);
    }
  }

  /** Qué cursor corresponde en ese punto de la pantalla. */
  cursorAt(p:Point):CursorState {
    if(this.gesture?.dragging && this.mode==='room')return 'grab';
    if(this.mode==='tank'){
      const tool={food:'pinch',sponge:'sponge',observe:'lens',tap:'tap',bucket:'bucket',kit:'point',filter:'point'} as const;
      if(this.handTool!=='hand')return tool[this.handTool];
    }
    const worldPoint=this.camera.toWorld(p.x,p.y),w=this.tankPoint(worldPoint);
    if(this.cat.hit(worldPoint.x,worldPoint.y))return 'pet';
    if(this.mode==='tank')return this.tank.fishAt(w.x,w.y)!==null?'point':'open';
    if(this.mode==='room'){
      const live={tank:this.tankBounds,cat:this.cat.rect};
      if(this.data.zones.some(z=>inRect(zoneRect(z,live),worldPoint.x,worldPoint.y)))return 'point';
    }
    return 'open';
  }

  /** El nombre de lo que hay en ese punto (toque largo o hover). */
  describe(p:Point):string|null {
    const worldPoint=this.camera.toWorld(p.x,p.y),w=this.tankPoint(worldPoint);
    if(this.mode==='tank'){
      const id=this.tank.fishAt(w.x,w.y);
      const animal=id===null?undefined:this.state?.animals.find(a=>a.id===id);
      if(animal)return animal.name||texts.ui.zones.tank;
      if(this.handTool!=='hand')return texts.ui.tools[this.handTool];
      return null;
    }
    if(this.cat.hit(worldPoint.x,worldPoint.y))return texts.ui.zones.cat;
    const live={tank:this.tankBounds,cat:this.cat.rect};
    const zone=this.data.zones.find(z=>inRect(zoneRect(z,live),worldPoint.x,worldPoint.y));
    return zone?(texts.ui.zones as Record<string,string>)[zone.id]??null:null;
  }

  /** Un toque largo mostró el nombre: soltar ya no cuenta como toque. */
  cancelPress():void{this.gesture=null;this.camera.dragging=false;}
  toggleLid():void {if(this.state){this.act({type:'setLid',hasLid:!this.state.tank.hasLid});}}
  showRoom(): void { this.exitFocus(); }

  showTank(): void { this.frameTank(0.85); }

  private frameTank(fill: number): void {
    this.followingId = null;
    this.enterFocus('tank', this.tankFocus(fill));
    if (this.illustrated) this.tankFit = { fill, key: this.tankFitKey() };
  }

  private tankFitKey(): string {
    const { width, height } = this.tank.bounds;
    return `${uiInsets.top}/${uiInsets.bottom}/${width}/${height}`;
  }

  /** La pecera de cerca: ocupa `fill` de la pantalla, arriba de la barra de acciones. */
  private tankFocus(fill: number): CameraView {
    const t = this.tank.bounds;
    const bar = careBarHeight();
    const header = this.illustrated ? uiInsets.top : 0;
    const lidRoom = this.illustrated ? t.height * 0.14 : 0;
    const free = Math.max(250, GAME_HEIGHT - bar - header);
    const zoom = Math.min((fill * GAME_WIDTH) / t.width, (0.94 * free) / (t.height + lidRoom));
    return { x: t.x + t.width / 2, y: t.y + (t.height - lidRoom) / 2 + (bar - header) / 2 / zoom, zoom };
  }

  private catFocus(): CameraView {
    const r = this.cat.rect;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, zoom: this.zoomCat };
  }

  private enterFocus(mode: UiMode, view: CameraView): void {
    this.tankFit = undefined;
    if (this.mode === 'room') this.roomView = { ...this.camera.target };
    const projected=this.hybrid?.active&&(mode==='tank'||this.mode==='tank');
    this.hybrid?.setFocus(mode==='tank');
    this.mode = mode;
    this.focusSince = this.seconds;
    if (projected) this.camera.goTo(view, false, this.hybrid!.duration);
    else if (this.illustrated) this.camera.goTo(view, false, illustratedRoom.transition, false);
    else this.focusOn(view, true);
  }

  private focusOn(view: CameraView, snap: boolean): void {
    if (snap) {
      this.camera.goTo(view);
      return;
    }
    // Siguiendo algo que se mueve: solo el centro, sin volver a ajustar el zoom.
    this.camera.goTo({ ...view, zoom: this.camera.target.zoom });
  }

  private exitFocus(): void {
    this.tankFit = undefined;
    this.followingId=null;
    if (this.mode === 'room') return;
    this.mode = 'room';this.handTool='hand';this.pointerLeave();
    const duration=this.hybrid?.active?this.hybrid.duration:this.illustrated?illustratedRoom.transition:undefined;this.hybrid?.setFocus(false);
    this.camera.goTo(this.roomView,false,duration);
  }

  /** Acaricia al gato: la simulación lo registra y el gato pasa a los mimos. */
  private petCat(): void {
    this.act({ type: 'petCat' });
    this.cat.pet(this.seconds);
  }

  /**
   * El pájaro: de vez en cuando, en días despejados, se posa afuera en el
   * alféizar, se queda unos segundos (a veces se da vuelta) y se va volando.
   */
  private updateBird(seconds: number, allowed: boolean, light: number): void {
    const perch = this.illustrated ? illustratedRoom.bird : BIRD_PERCH;
    this.bird.update(seconds, allowed, light, perch.x, perch.y - 8);
  }

  /** Brillo sutil sobre la zona recién tocada. */
  private drawGlow(seconds: number): void {
    const g = this.glow;
    g.clear();
    if (!this.glowZone || (this.illustrated && this.glowZone.zone.id === 'tank')) return;
    const age = seconds - this.glowZone.since;
    if (age > GLOW_SECONDS) {
      this.glowZone = null;
      return;
    }
    const k = 1 - age / GLOW_SECONDS;
    const r = zoneRect(this.glowZone.zone, { tank: this.tankBounds, cat: this.cat.rect });
    const x = Math.round(r.x);
    const y = Math.round(r.y);
    const w = Math.round(r.width);
    const h = Math.round(r.height);
    g.rect(x, y, w, h).fill({ color: 0xfff2c8, alpha: 0.07 * k });
    g.rect(x, y, w, 2).rect(x, y + h - 2, w, 2).rect(x, y + 2, 2, h - 4).rect(x + w - 2, y + 2, 2, h - 4);
    g.fill({ color: 0xfff2c8, alpha: 0.22 * k });
  }

  /** Dibuja la habitación y devuelve cuánta luz de día hay (0 noche .. 1 pleno día). */
  private drawRoom(state: SimState, derived: DerivedValues, seconds: number, dt: number,
    view: SceneView, environment: AquariumEnvironment): number {
    const tank = this.tankBounds;
    const { daylight: day, natural: light, twilight } = environment;
    const wind = Math.max(0.28, Math.min(2.2, (view.outside?.windKph ?? 10) / 14));
    this.cloudDistance += wind * dt;
    const night = 1 - light;
    // La lámpara: la que eligió el jugador o, si nunca la tocó, sola cuando oscurece.
    const lampOn = this.lamp ?? light < 0.5;
    this.lampOn = lampOn;

    const skyKey = [Math.round(day * 256), view.weather, Math.round(view.outside?.cloudCover ?? 0),
      Math.round(twilight * 255)].join();
    if (this.skyKey !== skyKey) {
      this.skyKey = skyKey;
      drawSky(this.skyBase.clear(), this.window, day, view.weather, seconds, 'base', view.outside, undefined, environment);
    }
    if (seconds >= this.nextSkyAt || seconds < this.nextSkyAt - 1 || view.weather === 'storm') {
      this.nextSkyAt = seconds + 1 / 30;
      this.lastBolt = drawSky(this.sky.clear(), this.window, day, view.weather, seconds, 'front', view.outside, this.cloudDistance, environment);
    }
    const bolt = this.lastBolt;
    this.updateBird(seconds, view.weather === 'clear' && day > 0.6, light);

    // Día y noche: las imágenes se tiñen.
    const tint = this.illustrated ? roomLightTint(environment) : ambientTint(light);
    this.room.tint = tint;
    // Brisa: las plantas se hamacan apenas (más con la ventana abierta).
    const breeze = (state.room.windowOpen ? 1.8 : 0.9) * (view.weather === 'storm' ? 1.2 : 1);
    for (const item of this.swaying) {
      item.sprite.tint = tint;
      const swing = Math.sin(seconds * 0.45 + item.phase) * 0.75 + Math.sin(seconds * 0.27 + item.phase * 1.9) * 0.25;
      item.sprite.rotation = (Math.min(2, breeze * item.amount) * swing * Math.PI) / 180;
    }

    this.paintedDecor?.update(tank, seconds, dt, tint, environment, lampOn, breeze);
    if (!this.illustrated) drawRoomAnim(this.anim.clear(), seconds);

    // Luces.
    const sun = view.weather === 'clear' && day > 0.5 ? day : 0;
    const lightsKey = `${Math.round(night * 40)},${lampOn},${tank.x},${tank.y},${tank.width},${derived.lightOn},${Math.round(sun * 20)}`;
    if (!this.illustrated && lightsKey !== this.lightsKey) {
      this.lightsKey = lightsKey;
      this.lights.clear();
      drawLights(this.lights, tank, lampOn, night, derived.lightOn, sun);
    }
    this.flash.clear();
    if (bolt > 0) {
      this.flash.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0xb8c8ff, alpha: 0.16 * bolt });
    }
    return light;
  }
}
