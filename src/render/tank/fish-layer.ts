import { Container, MeshPlane } from 'pixi.js';
import { tex } from '../assets';
import type { HandInput } from '../motion/hand';
import { drawPixelText, textWidth } from '../ui/pixel-font';
import { ART, fishPigment } from '../art-direction';
/**
 * Animales y comida dentro del agua, dibujados con formas simples de colores
 * (placeholders hasta que haya sprites). El movimiento sale de FishMotion;
 * acá solo se pasa de centímetros a píxeles y se dibuja.
 *
 * Tres planos de profundidad: los de atrás se ven más chicos, más azulados y
 * con menos contraste, y se dibujan primero.
 */

import { Graphics } from 'pixi.js';
import { getSpecies, sizeFactor, defaultConfig, type SimState, type Species } from '../../sim';
import { FishMotion, type FishBody, type MotionAnimal } from '../motion/fish-motion';
import { lerpColor, scatter } from '../pixel-utils';
import type { TankRect } from './tank-layout';
import { FISH_SPRITES, SpritePainter } from './sprites';

/** Vueltas de sprite por segundo: un giro completo tarda ~0,45 s. */
const TURN_SPEED = 4.5;

const WATER_TINT = 0x2f7f8c;
const NIGHT_TINT = 0x0a1420;
const DEAD_COLOR = 0x8a8f96;
/** Cuánto dura el punto del susto (golpe en el vidrio). */
const SCARE_SECONDS = 3;

function hex(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}

export class FishLayer {
  readonly graphics = new Graphics();
  readonly foreground = new Graphics();
  readonly artBack=new Container();
  readonly artFront=new Container();
  private readonly bettas=new Map<number,{mesh:MeshPlane;rest:Float32Array;turn:number}>();
  hand:HandInput|null=null;
  readonly foodGraphics = new Graphics();
  private ink = this.graphics;
  private batches:{x:number;grams:number;at:number}[]=[];
  private selectedId: number | null = null;
  private selectedUntil = 0;
  private positions = new Map<number, {x:number;y:number;radius:number}>();
  hit(x:number,y:number): number | null {
    let nearest:number|null=null, distance=Infinity;
    for(const [id,p] of this.positions){const d=Math.hypot(x-p.x,y-p.y);if(d<p.radius && d<distance){nearest=id;distance=d;}}
    this.selectedId=nearest;this.selectedUntil=this.motion.seconds+30;
    return nearest;
  }
  readonly motion = new FishMotion((Math.random() * 0xffffffff) >>> 0);
  private foodXCm = 0;
  private lastSurfaceG = 0;
  private scare: { x: number; y: number; until: number } | null = null;
  private area: TankRect = { x: 0, y: 0, width: 1, height: 1 };
  private pxPerCm = 1;
  private dt = 0;
  private readonly painter = new SpritePainter();
  /** Estado de animación por animal: fase del coletazo y giro (-1 izquierda .. 1 derecha). */
  private readonly anim = new Map<number, { wag: number; turn: number }>();

  /** Golpe en el vidrio, en píxeles de la escena: los peces huyen de ese punto. */
  scareAt(sceneX: number, sceneY: number): void {
    this.scare = {
      x: (sceneX - this.area.x) / this.pxPerCm,
      y: (sceneY - this.area.y) / this.pxPerCm,
      until: this.motion.seconds + SCARE_SECONDS,
    };
  }

  /** Posición en la escena de un animal cualquiera (para que el gato lo siga con la cabeza). */
  watchPoint(): { x: number; y: number } | null {
    for (const body of this.motion.bodies.values()) {
      return { x: this.area.x + body.x * this.pxPerCm, y: this.area.y + body.y * this.pxPerCm };
    }
    return null;
  }

  /**
   * @param area   Rectángulo del agua donde se puede nadar, en píxeles.
   * @param pxPerCm Escala de la pecera.
   */
  update(
    state: SimState,
    lightOn: boolean,
    area: TankRect,
    pxPerCm: number,
    seconds: number,
    dtSeconds: number,
  ): void {
    this.area = area;
    this.pxPerCm = pxPerCm;
    this.graphics.clear(); this.foreground.clear(); this.foodGraphics.clear(); this.positions.clear();
    if (area.height <= 2) return;
    const bounds = { width: area.width / pxPerCm, height: area.height / pxPerCm };

    // Comida nueva: cae en algún lugar de la superficie.
    if (state.food.surfaceG > this.lastSurfaceG + 1e-6 || this.foodXCm === 0) {
      this.foodXCm = bounds.width * (state.food.x ?? (0.25 + 0.5 * Math.random()));
    }
    if(state.food.surfaceG<this.lastSurfaceG && this.lastSurfaceG>0){const keep=state.food.surfaceG/this.lastSurfaceG;for(const batch of this.batches)batch.grams*=keep;}
    if(state.food.surfaceG>this.lastSurfaceG+1e-6)this.batches.push({x:this.foodXCm,grams:state.food.surfaceG-this.lastSurfaceG,at:seconds});
    this.batches=this.batches.filter(b=>b.grams>1e-6).slice(-16);
    this.lastSurfaceG = state.food.surfaceG;

    const species = new Map<number, Species>();
    const animals: MotionAnimal[] = state.animals.map((animal) => {
      const sp = getSpecies(animal.speciesId);
      species.set(animal.id, sp);
      return {
        id: animal.id,
        species: sp,
        intent: animal.intent,
        targetId: animal.targetId,
        fright: animal.fright,
        sizeCm: sp.adultSizeCm * sizeFactor(animal, defaultConfig),
        alive: animal.alive,
        boldness: animal.personality.boldness,
        activity: animal.personality.activity,
        feedingTrust: animal.feedingTrust,
      };
    });
    if (this.scare && this.motion.seconds > this.scare.until) this.scare = null;
    const cat = state.cat.behavior;
    this.motion.update(Math.min(0.1, Math.max(0, dtSeconds)), {
      bounds,
      animals,
      food: {
        surface: state.food.surfaceG > 1e-4,
        sinking: state.food.sinkingG > 1e-4,
        bottom: state.organics.foodG > 1e-3,
        x: this.foodXCm,
      },
      scare: this.scare,
      hand:this.hand,
      catAtGlass: cat === 'watch_fish' || cat === 'tap_glass',
    });

    const ids=new Set(animals.filter(a=>a.species.id==='betta').map(a=>a.id));
    for(const [id,entry]of this.bettas)if(!ids.has(id)){entry.mesh.destroy();this.bettas.delete(id);}
    this.dt = Math.min(0.1, Math.max(0, dtSeconds));
    for (const id of this.anim.keys()) if (!this.motion.bodies.has(id)) this.anim.delete(id);

    this.drawFood(state, area, pxPerCm, seconds);

    // De atrás hacia adelante.
    const order = animals
      .map((animal) => ({ animal, body: this.motion.bodies.get(animal.id) as FishBody }))
      .sort((a, b) => a.body.plane - b.body.plane);
    for (const { animal, body } of order) {
      this.ink = body.plane < 1.2 ? this.graphics : this.foreground;
      const state_ = state.animals.find((a) => a.id === animal.id);
      this.drawAnimal(
        animal,
        body,
        lightOn,
        seconds,
        state_?.finDamage ?? 0,
        state_?.mood === 'sick',
        state_?.intent === 'rest',
        state_?.sex ?? 'male',
      );
    }
    const selected = state.animals.find(a=>a.id===this.selectedId);
    const position = selected ? this.positions.get(selected.id) : undefined;
    if(selected && position && this.motion.seconds<this.selectedUntil){
      const label=(selected.name ?? getSpecies(selected.speciesId).name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().slice(0,24);
      const w=textWidth(label)+6;
      const x=Math.max(area.x,Math.min(area.x+area.width-w,Math.round(position.x-w/2)));
      const y=Math.max(area.y+2,Math.round(position.y-position.radius-12));
      this.foodGraphics.rect(x,y,w,10).fill({color:0x202c2b,alpha:0.85});
      drawPixelText(this.foodGraphics,label,x+3,y+2,0xeee2c5,1);
    }
  }

  private drawFood(state: SimState, area: TankRect, pxPerCm: number, seconds: number): void {
    const g = this.foodGraphics;
    const x0 = area.x + this.foodXCm * pxPerCm;
    const spread = Math.max(5, pxPerCm * 2);
    let floating=0;
    for(const [batchIndex,batch]of this.batches.entries()){
      const count=Math.min(16,Math.ceil(batch.grams*200));floating+=count;
      for(let i=0;i<count;i++){
        const x=Math.round(area.x+batch.x*pxPerCm+(scatter(i+batchIndex*19,21)-.5)*2*spread);
        if(x<area.x||x>area.x+area.width-2)continue;
        const age=seconds-batch.at-i*.035;
        const y=area.y-12+12*Math.min(1,Math.max(0,age)/.7)**2;
        g.rect(x,Math.round(y+Math.sin(seconds*1.7+i)*.5),2,1);
      }
    }
    const sinking = Math.min(40, Math.ceil(state.food.sinkingG * 200));
    for (let i = 0; i < sinking; i++) {
      const x = Math.round(x0 + (scatter(i, 22) - 0.5) * 2 * spread);
      if (x < area.x || x > area.x + area.width - 2) continue;
      const fall = (scatter(i, 23) + seconds * (0.05 + 0.04 * scatter(i, 24))) % 1;
      g.rect(x, Math.round(area.y + fall * (area.height - 2)), 1, 1);
    }
    if (floating + sinking > 0) g.fill(ART.food);
  }

  private drawAnimal(
    animal: MotionAnimal,
    body: FishBody,
    lightOn: boolean,
    seconds: number,
    finDamage: number,
    sick: boolean,
    resting: boolean,
    sex: 'male' | 'female',
  ): void {
    const g = this.ink;
    const sp = animal.species;
    // Plano: 0 lejos (chico y azulado) .. 2 cerca.
    const far = (2 - body.plane) / 2;
    const scale = 1 - 0.22 * far;
    const tint = (color: number): number => {
      let c = fishPigment(color);
      if (!animal.alive) c = DEAD_COLOR;
      else if (sick) c = lerpColor(c, 0xe8e8e8, 0.35);
      // De noche los colores se apagan (los neones, más).
      if (!lightOn) {
        const fade = resting && sp.traits.includes('color_fades_at_night') ? 0.75 : 0.45;
        c = lerpColor(c, NIGHT_TINT, fade);
      }
      return lerpColor(c, WATER_TINT, 0.3 * far);
    };
    const main = tint(hex(sp.color));
    const accent = tint(hex(sp.accent));
    const len = Math.max(3, Math.round(animal.sizeCm * this.pxPerCm * scale));
    // Nadie asoma fuera del agua: el dibujo entero queda entre los vidrios y bajo la superficie.
    const area = this.area;
    const halfLen = Math.min(len / 2, area.width / 2);
    const cx = Math.round(
      Math.min(area.x + area.width - halfLen, Math.max(area.x + halfLen, area.x + body.x * this.pxPerCm)),
    );
    const cy = Math.round(
      Math.min(area.y + area.height, Math.max(area.y + Math.min(len * 0.3, area.height), area.y + body.y * this.pxPerCm)),
    );
    this.positions.set(animal.id,{x:cx,y:cy,radius:Math.max(8,len*0.8)});
    const nibbling = animal.alive && animal.intent === 'eat' &&
      Math.abs(body.x-this.foodXCm)<3 && body.y*this.pxPerCm<Math.max(8,this.area.height*0.15);
    const pulse = nibbling ? Math.max(0,Math.sin(seconds*8+body.phase)) : 0;
    if (pulse > 0.65) {
      this.foodGraphics.rect(cx+body.facing*len*0.35,cy-1,2,1).fill(ART.food);
      this.foodGraphics.rect(cx-2,area.y+1,4,1).fill({color:0xe8dec7,alpha:0.3});
    }
    const dir = body.facing;

    if(sp.id==='betta'){
      let entry=this.bettas.get(animal.id);
      if(!entry){const mesh=new MeshPlane({texture:tex('betta'),verticesX:12,verticesY:4});const rest=(mesh.geometry.getAttribute('aPosition').buffer.data as Float32Array).slice();entry={mesh,rest,turn:body.facing};this.bettas.set(animal.id,entry);}
      const mesh=entry.mesh,texture=mesh.texture;
      const parent=body.plane<1.2?this.artBack:this.artFront;
      if(mesh.parent!==parent)parent.addChild(mesh);
      mesh.pivot.set(texture.width*.5,texture.height*.5);
      const k=len/texture.width;
      const turnDelta=body.facing-entry.turn;
      entry.turn+=Math.sign(turnDelta)*Math.min(Math.abs(turnDelta),this.dt*TURN_SPEED);
      const turn=(entry.turn<0?-1:1)*Math.max(.35,Math.abs(Math.sin(entry.turn*Math.PI/2)));
      mesh.scale.set(turn*k,animal.alive?k:-k);mesh.position.set(cx,cy);
      mesh.tint=lightOn?0xffffff:0x687c98;mesh.alpha=1;
      const attribute=mesh.geometry.getAttribute('aPosition'),positions=attribute.buffer.data as Float32Array;
      for(let i=0;i<positions.length;i+=2){const x=entry.rest[i]!,y=entry.rest[i+1]!,tail=Math.max(0,1-x/(texture.width*.65));
        positions[i]=x;positions[i+1]=y+(animal.alive?Math.sin(seconds*3.1+body.phase+x*.018)*texture.height*.025*tail*tail:0);}
      attribute.buffer.update();return;
    }

    // Especies con sprite propio; el resto sigue con el placeholder de abajo.
    const sprite = FISH_SPRITES[sp.id];
    if (sprite) {
      let a = this.anim.get(animal.id);
      if (!a) {
        a = { wag: body.phase, turn: body.facing };
        this.anim.set(animal.id, a);
      }
      const speed = Math.sqrt(body.vx * body.vx + body.vy * body.vy);
      const swim = animal.alive ? Math.min(1, speed / Math.max(0.1, sp.swim.speedCmS)) : 0;
      if (animal.alive) {
        a.wag += this.dt * (sprite.tempo ?? 1) * (1.8 + 9 * swim);
        const d = body.facing - a.turn;
        const step = this.dt * TURN_SPEED;
        a.turn += Math.abs(d) <= step ? d : Math.sign(d) * step;
      }
      // Giro suave: el sprite se acorta, se da vuelta y se vuelve a estirar.
      const ease = Math.sin((a.turn * Math.PI) / 2);
      const turn = (a.turn >= 0 ? 1 : -1) * Math.max(0.3, Math.abs(ease));
      const spriteLen = Math.max(sprite.minLen ?? 6, Math.round(len / (sprite.span ?? 1)));
      const painter = this.painter;
      painter.begin(spriteLen, turn, (sprite.wave ?? 0.07) * spriteLen * (0.3 + 0.7 * swim), a.wag, !animal.alive);
      sprite.draw(painter, {
        len: spriteLen,
        seconds,
        wag: a.wag,
        swim,
        seed: animal.id,
        sex,
        finDamage,
        resting,
        alive: animal.alive,
        night: !lightOn,
      });
      painter.flush(g, cx, cy, tint);
      return;
    }

    if (sp.category === 'snail') {
      const size = Math.max(2, Math.round(len * 0.8));
      g.rect(cx - Math.floor(size / 2), cy - size, size, size).fill(main);
      g.rect(cx - Math.floor(size / 2) + (size > 2 ? 1 : 0), cy - size + 1, Math.max(1, size - 2), 1).fill(accent);
      g.rect(cx - Math.floor(size / 2) - (dir < 0 ? 1 : 0), cy, size + 1, 1).fill(accent);
      return;
    }
    if (sp.category === 'shrimp') {
      const h = Math.max(1, Math.round(len * 0.3));
      g.rect(cx - Math.floor(len / 2), cy - h, len, h).fill(main);
      g.rect(cx + (dir > 0 ? Math.ceil(len / 2) : -Math.floor(len / 2) - 2), cy - h - 1, 2, 1).fill(accent);
      if (Math.floor(seconds * 6 + body.phase) % 2 === 0) {
        g.rect(cx - Math.floor(len / 2) + 1, cy, Math.max(1, len - 2), 1).fill(accent);
      }
      return;
    }

    const tall = sp.traits.includes('tall');
    const eel = sp.traits.includes('eel_like');
    const h = Math.max(2, Math.round(len * (tall ? 1.05 : eel ? 0.2 : 0.42)));
    const bodyLen = Math.max(2, Math.round(len * (eel ? 0.85 : 0.68)));
    const tailBase = len - bodyLen;
    const tailLen = Math.max(
      1,
      Math.round((tailBase + (sp.longFins ? len * 0.35 : 0)) * (1 - 0.7 * finDamage)),
    );
    const flip = animal.alive ? 1 : -1; // muerto: panza arriba
    const top = cy - Math.floor(h / 2);
    const front = dir > 0 ? cx + Math.ceil(bodyLen / 2) : cx - Math.ceil(bodyLen / 2);
    const back = dir > 0 ? cx - Math.floor(bodyLen / 2) : cx + Math.floor(bodyLen / 2);

    // Cola: se abre hacia atrás y se mueve al nadar.
    const speed = Math.sqrt(body.vx * body.vx + body.vy * body.vy);
    const wagRate = animal.alive ? 4 + speed * 1.2 : 0;
    for (let i = 0; i < tailLen; i++) {
      const open = Math.min(h + (sp.longFins ? 2 : 0), 1 + Math.round((i * (h + 1)) / Math.max(1, tailLen)));
      const wag = Math.round(Math.sin(seconds * wagRate + body.phase - i * 0.6) * Math.min(1.5, i * 0.5));
      const x = dir > 0 ? back - 1 - i : back + i;
      g.rect(x, cy - Math.floor(open / 2) + wag, 1, open);
    }
    g.fill(accent);

    // Cuerpo, con el hocico un poco más angosto.
    g.rect(Math.min(front, back), top, bodyLen, h).fill(main);
    if (h >= 4) {
      const noseX = dir > 0 ? front - 1 : front;
      g.rect(noseX, top, 1, 1).rect(noseX, top + h - 1, 1, 1).fill(lerpColor(main, WATER_TINT, 0.6));
    }
    // Aletas altas (escalar) y franja de color.
    if (tall && len >= 8) {
      g.rect(cx - 1, top - Math.round(h * 0.35), 2, Math.round(h * 0.35))
        .rect(cx - 1, top + h, 2, Math.round(h * 0.35))
        .fill(main);
    }
    if (len >= 5) {
      const stripe = Math.max(1, Math.round(bodyLen * 0.5));
      g.rect(cx - Math.floor(stripe / 2), cy + (h >= 4 ? 0 : -Math.floor(h / 2)), stripe, 1).fill(accent);
    }
    // Ojo.
    if (len >= 4) {
      const eyeX = dir > 0 ? front - 2 : front + 1;
      g.rect(eyeX, flip > 0 ? top + (h >= 4 ? 1 : 0) : top + h - 1 - (h >= 4 ? 1 : 0), 1, 1).fill(
        animal.alive ? 0x10141c : 0xffffff,
      );
    }
  }
}
