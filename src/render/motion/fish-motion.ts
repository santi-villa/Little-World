import visual from '../../data/aquarium-visual.json';
import {BettaDynamics} from './betta-dynamics';
import {resolveHabitat,habitatTarget,type Habitat} from './habitat';
import { interestedInHand, type HandInput } from './hand';
/**
 * Movimiento de los animales de la pecera.
 *
 * La simulación dice qué quiere hacer cada uno (su intención); acá eso se
 * convierte en un nado continuo con steering behaviors, boids para los que
 * van en grupo y tres planos de profundidad (lejos, medio y cerca).
 *
 * Es lógica pura (sin Pixi ni DOM) para poder testearla. No afecta a la
 * simulación: es solo cómo se ve.
 */

import { groupStyle, type Intent, type Species } from '../../sim';
import {
  alignment,
  arrive,
  cohesion,
  containment,
  flee,
  integrate,
  length,
  seek,
  separation,
  wander,
  type Body,
  type Bounds,
  type Limits,
  type Vec,
} from './steering';

export const PLANE_FAR = 0;
export const PLANE_MID = 1;
export const PLANE_NEAR = 2;
/** Planos por segundo: los cambios de plano son suaves. */
export const PLANE_SPEED = 0.35;

/** Lo que el movimiento necesita saber de cada animal en este cuadro. */
export interface MotionAnimal {
  id: number;
  species: Species;
  intent: Intent;
  targetId: number | null;
  /** Susto, 0 a 1. */
  fright: number;
  /** Largo en cm (ya con su tamaño según la edad). */
  sizeCm: number;
  alive: boolean;
  boldness: number;
  activity: number;
  feedingTrust?: number;
  condition?:number;
  visualSizeCm?:number;
}

export interface MotionInput {
  /** Explicit opt-in for the visual betta prototype; legacy consumers retain their motion contract. */
  bettaPrototype?: boolean;
  renderDepth?:boolean;
  habitat?:Habitat;
  hand?: HandInput | null;
  /** Agua: ancho y profundidad en cm. */
  bounds: Bounds;
  animals: readonly MotionAnimal[];
  /** Dónde hay comida ahora. */
  food: { surface: boolean; sinking: boolean; bottom: boolean; x: number };
  /** Golpe reciente en el vidrio (posición en cm) o null. */
  scare: Vec | null;
  /** El gato está pegado al vidrio. */
  catAtGlass: boolean;
}

export interface FishBody extends Body {
  id: number;
  /** 0 lejos, 1 medio, 2 cerca (continuo: cambia de a poco). */
  plane: number;
  targetPlane: number;
  /** Hacia dónde mira el sprite. */
  facing: 1 | -1;
  goalX: number;
  goalY: number;
  goalUntil: number;
  /** Fase propia, para que no aleteen todos a la vez. */
  phase: number;
  pauseUntil?: number;
  slowSeconds?: number;
  depthAt?:number;
}

interface SchoolGoal {
  x: number;
  y: number;
  plane: number;
  until: number;
}

const TWO_PI = Math.PI * 2;

/** Franja vertical preferida (fracciones de la profundidad) según la zona. */
export function zoneBand(species: Species): [number, number] {
  if (species.traits.includes('upper_levels')) return [0.08, 0.5];
  if (species.traits.includes('midwater_too')) return [0.55, 0.97];
  switch (species.zone) {
    case 'surface':
      return [0.04, 0.3];
    case 'middle':
      return [0.25, 0.75];
    case 'bottom':
      return [0.82, 0.98];
  }
}

export function limitsFor(species: Species): Limits {
  const maxSpeed = species.swim.speedCmS;
  return {
    maxSpeed,
    maxAccel: maxSpeed * 2.5,
    maxTurn: (species.swim.turnDegS * Math.PI) / 180,
  };
}

/** Generador simple con semilla (el movimiento no usa el RNG de la simulación). */
function mulberry(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable individual preference, independent of the simulation RNG and render session. */
export function favoriteCorner(id: number): 'left' | 'right' { return ((Math.imul(id, 2654435761) >>> 0) & 1) === 0 ? 'left' : 'right'; }

export class FishMotion {
  readonly bettas=new Map<number,BettaDynamics>();
  readonly bodies = new Map<number, FishBody>();
  private readonly schools = new Map<string, SchoolGoal>();
  private readonly random: () => number;
  private time = 0;

  constructor(seed = 1) {
    this.random = mulberry(seed);
  }

  flareBetta(id:number):void{this.bettas.get(id)?.triggerFlare(this.time);}

  get seconds(): number {
    return this.time;
  }

  private spawn(animal: MotionAnimal, bounds: Bounds): FishBody {
    const [top, bottom] = zoneBand(animal.species);
    const r = this.random;
    const heading = r() < 0.5 ? 0 : Math.PI;
    const body: FishBody = {
      id: animal.id,
      x: bounds.width * (0.15 + 0.7 * r()),
      y: bounds.height * (top + (bottom - top) * r()),
      vx: 0,
      vy: 0,
      heading,
      wanderAngle: heading,
      plane: Math.floor(r() * 3),
      targetPlane: PLANE_MID,
      facing: heading === 0 ? 1 : -1,
      goalX: 0,
      goalY: 0,
      goalUntil: -1,
      phase: r() * TWO_PI,
    };
    body.targetPlane = body.plane;
    return body;
  }

  private pickGoal(body: FishBody, animal: MotionAnimal, bounds: Bounds): void {
    const r = this.random;
    let [top, bottom] = zoneBand(animal.species);
    if(animal.species.id==='betta' && r()<.35)[top,bottom]=[.12,.82];
    // Salidas ocasionales de su zona.
    if (r() < 0.15) [top, bottom] = [0.08, 0.92];
    const visitHome = r() < 0.4;
    body.goalX = bounds.width * (visitHome ? (favoriteCorner(animal.id) === 'left' ? 0.2 : 0.8) : (0.12 + 0.76 * r()));
    body.goalY = bounds.height * (top + (bottom - top) * r());
    body.goalUntil = this.time + 4 + 6 * r();
    if (r() < 0.4) body.targetPlane = Math.floor(r() * 3);
  }

  private schoolGoal(species: Species, bounds: Bounds): SchoolGoal {
    let goal = this.schools.get(species.id);
    if (!goal || this.time >= goal.until) {
      const r = this.random;
      const [top, bottom] = zoneBand(species);
      goal = {
        x: bounds.width * (0.12 + 0.76 * r()),
        y: bounds.height * (top + (bottom - top) * r()),
        plane: r() < 0.5 ? PLANE_MID : r() < 0.5 ? PLANE_FAR : PLANE_NEAR,
        until: this.time + 5 + 7 * r(),
      };
      this.schools.set(species.id, goal);
    }
    return goal;
  }

  /** Avanza `dt` segundos. Conviene llamarlo con pasos chicos (un cuadro). */
  update(dt: number, input: MotionInput): void {
    const { bounds, animals } = input;
    const r = this.random;

    // Altas y bajas (también con dt = 0: quien dibuja necesita un cuerpo por animal).
    const present = new Set<number>();
    for (const animal of animals) {
      present.add(animal.id);
      if (!this.bodies.has(animal.id)) this.bodies.set(animal.id, this.spawn(animal, bounds));
    }
    for (const id of this.bodies.keys()) if (!present.has(id)){this.bodies.delete(id);this.bettas.delete(id);}
    if (!(dt > 0)) return;
    this.time += dt;

    // Vecinos por especie (para los boids) y todos (para el espacio personal).
    const bySpecies = new Map<string, FishBody[]>();
    const everyone: FishBody[] = [];
    for (const animal of animals) {
      if (!animal.alive) continue;
      const body = this.bodies.get(animal.id) as FishBody;
      everyone.push(body);
      const list = bySpecies.get(animal.species.id);
      if (list) list.push(body);
      else bySpecies.set(animal.species.id, [body]);
    }

    for (const animal of animals) {
      const body = this.bodies.get(animal.id) as FishBody;
      const sp = animal.species;
      const limits = limitsFor(sp);
      const condition=animal.condition??1;limits.maxSpeed*=condition;limits.maxAccel*=condition;
      const depth = bounds.height;

      if(input.renderDepth&&animal.alive){
        if(this.time>=(body.depthAt??0)){body.targetPlane=animal.intent==='eat'?2:animal.intent==='hide'?0:r()*2;body.depthAt=this.time+visual.depthIntervalSeconds*(1+r());}
        body.plane+=(body.targetPlane-body.plane)*(1-Math.exp(-dt*visual.depthTravelSpeed));
      }
      if (!animal.alive) {
        // Los peces muertos flotan; caracoles y gambas quedan en el fondo.
        const targetY = sp.category === 'fish' ? 0 : depth;
        const v = arrive(body, body.x, targetY, input.renderDepth?visual.floatSpeed:1.5, 4);
        integrate(body, v.x, v.y, { maxSpeed: 1.5, maxAccel: 2, maxTurn: 10 }, dt, bounds);
        continue;
      }

      if(sp.id==='betta' && input.bettaPrototype){let motion=this.bettas.get(animal.id);if(!motion){motion=new BettaDynamics();this.bettas.set(animal.id,motion);}motion.update(body,animal,dt,input,this.time,r);continue;}

      const crawler = sp.category !== 'fish';
      const cruise = limits.maxSpeed * (0.35 + 0.3 * animal.activity) * (sp.id==='betta' ? .82+.18*Math.sin(this.time*.9+body.phase) : 1);
      const [bandTop, bandBottom] = zoneBand(sp);
      let desired: Vec = { x: 0, y: 0 };
      let boost = 1;

      const mates = bySpecies.get(sp.id) ?? [];
      const style = groupStyle(sp);

      switch (animal.intent) {
        case 'eat': {
          const access = sp.zone;
          let y = depth * 0.5;
          if (input.food.surface && access !== 'bottom') y = depth * 0.02;
          else if (input.food.sinking) y = depth * (access === 'bottom' ? 0.8 : 0.45);
          else if (input.food.bottom) y = depth * 0.98;
          // Cada uno picotea en su lugarcito alrededor de la comida.
          const spread = Math.min(2, bounds.width * 0.05);
          const x = input.food.x + (Math.sin(body.phase) + 0.15 * Math.sin(this.time * 0.7 + body.phase)) * spread;
          desired = arrive(body, x, y, limits.maxSpeed * 0.9, 1.5);
          break;
        }
        case 'rest': {
          // Los que respiran aire descansan arriba; el resto, cerca del fondo.
          const leaf=input.habitat && sp.traits.includes('labyrinth')?habitatTarget(input.habitat.leaves,body.x,body.y,bounds.width,depth):null;
          const y = leaf?.y ?? (sp.traits.includes('labyrinth') ? depth * 0.08 : depth * 0.86);
          if (body.goalUntil < this.time || Math.abs(body.goalY - y) > 1) {
            body.goalX = leaf?.x ?? Math.min(bounds.width * 0.92, Math.max(bounds.width * 0.08, body.x));
            body.goalY = y;
            body.goalUntil = this.time + 60;
            body.targetPlane = r() < 0.6 ? PLANE_FAR : PLANE_MID;
          }
          desired = arrive(body, body.goalX, body.goalY, limits.maxSpeed * 0.2, 6);
          // Flota casi quieto.
          desired.y += Math.sin(this.time * 0.8 + body.phase) * 0.15;
          break;
        }
        case 'hide': {
          // Los rincones del fondo, en el plano de atrás.
          const x = body.x < bounds.width / 2 ? bounds.width * 0.07 : bounds.width * 0.93;
          const refuge=input.habitat?habitatTarget(input.habitat.refuges,body.x,body.y,bounds.width,depth):null;
          desired = arrive(body, refuge?.x??x, refuge?.y??depth*.9, limits.maxSpeed*.6, 3);
          body.targetPlane = PLANE_FAR;
          break;
        }
        case 'beg': {
          // Al frente, arriba, esperando que caiga algo.
          body.targetPlane = PLANE_NEAR;
          const x = bounds.width * (0.3 + 0.4 * ((Math.sin(body.phase) + 1) / 2));
          const y = depth * (0.12 + 0.05 * Math.sin(this.time * 3 + body.phase));
          desired = arrive(body, x, y, limits.maxSpeed * 0.7, 4);
          break;
        }
        case 'gasp': {
          desired = arrive(body, body.x + Math.sin(this.time * 0.5 + body.phase) * 3, 0, cruise, 3);
          break;
        }
        case 'chase': {
          const target = animal.targetId === null ? undefined : this.bodies.get(animal.targetId);
          if (target) {
            desired = seek(body, target.x, target.y, limits.maxSpeed);
            body.targetPlane = target.plane;
            boost = 1.1;
          }
          break;
        }
        case 'court': {
          const target = animal.targetId === null ? undefined : this.bodies.get(animal.targetId);
          if (target) {
            // Da vueltas alrededor de la hembra.
            const angle = this.time * 1.8 + body.phase;
            const radius = animal.sizeCm * 1.6;
            desired = arrive(
              body,
              target.x + Math.cos(angle) * radius,
              target.y + Math.sin(angle) * radius * 0.6,
              limits.maxSpeed * 0.8,
              2,
            );
            body.targetPlane = target.plane;
          }
          break;
        }
        case 'flee': {
          boost = 1.3;
          const chaser = animal.targetId === null ? undefined : this.bodies.get(animal.targetId);
          if (chaser) {
            desired = flee(body, chaser.x, chaser.y, limits.maxSpeed * boost, bounds.width);
          } else {
            // Susto general: lejos del golpe (o del frente) y al plano de atrás.
            const from = input.scare ?? { x: bounds.width / 2, y: depth * 0.5 };
            desired = flee(body, from.x, from.y, limits.maxSpeed * boost, bounds.width * 2);
            body.targetPlane = PLANE_FAR;
          }
          break;
        }
        case 'school':
        case 'explore':
        default: {
          if (animal.intent === 'school' && style !== 'none' && mates.length > 1) {
            const goal = this.schoolGoal(sp, bounds);
            body.targetPlane = goal.plane;
            desired = arrive(body, goal.x, goal.y, cruise, 6);
          } else {
            if(sp.id==='betta' && this.time<(body.pauseUntil??0)){desired={x:0,y:0};break;}
            const arrived=length(body.goalX-body.x,body.goalY-body.y)<2;
            if(sp.id==='betta' && arrived && body.goalUntil>=0){body.pauseUntil=this.time+.5+1.2*r();body.goalUntil=-1;desired={x:0,y:0};break;}
            if (this.time >= body.goalUntil || arrived) {
              this.pickGoal(body, animal, bounds);
            }
            const toGoal = arrive(body, body.goalX, body.goalY, cruise, 5);
            const drift = wander(body, cruise * 0.5, 1.5, dt, r);
            desired = { x: toGoal.x + drift.x, y: toGoal.y + drift.y };
          }
          break;
        }
      }

      if (animal.intent === 'explore' && (animal.feedingTrust ?? 0) > 0.4 && !input.food.surface && !input.food.sinking) {
        // Familiar fish periodically approach the front, then resume their own routine.
        if (Math.sin(this.time * 0.08 + body.phase) > 0.65) body.targetPlane = PLANE_NEAR;
      }

      if(input.hand && input.hand.age<.5 && input.hand.speed>80 && animal.boldness<.65 && !['eat','gasp','flee'].includes(animal.intent)){
        desired=flee(body,input.hand.x,input.hand.y,cruise,bounds.width*.4);body.targetPlane=PLANE_FAR;
      }
      if(interestedInHand(animal.id,this.time,animal.feedingTrust??0,animal.boldness,animal.fright,animal.intent,input.hand)){
        const hand=input.hand!;desired=arrive(body,hand.x,Math.max(depth*0.08,Math.min(depth*.9,hand.y)),cruise*0.65,4);body.targetPlane=PLANE_NEAR;
      }
      // Boids: los que van en grupo se juntan y se alinean, más apretados si
      // son de cardumen y todavía más ante un susto.
      if (style !== 'none' && mates.length > 1 && animal.intent !== 'hide' && animal.intent !== 'rest') {
        const tight = style === 'schooling' ? 1 : 0.4;
        const scared = 1 + 1.5 * animal.fright;
        const schooling = animal.intent === 'school' || animal.intent === 'flee' ? 1 : 0.35;
        const c = cohesion(body, mates);
        const a = alignment(body, mates);
        const k = tight * schooling * scared;
        desired.x += c.x * 0.5 * k + (a.x - body.vx) * 0.4 * tight * schooling;
        desired.y += c.y * 0.5 * k + (a.y - body.vy) * 0.4 * tight * schooling;
      }

      // Espacio personal: nadie se atraviesa (solo cuenta quien está en un plano cercano).
      const near = everyone.filter((other) => Math.abs(other.plane - body.plane) < 0.7);
      const personal = animal.sizeCm * (style === 'schooling' ? 1.1 : style === 'shoaling' ? 1.8 : 1.5);
      const push = separation(body, near, Math.max(1.5, personal));
      desired.x += push.x * limits.maxSpeed;
      desired.y += push.y * limits.maxSpeed;

      // Los vidrios, la superficie y el fondo.
      const wall = containment(body, bounds, Math.max(2, animal.sizeCm), limits.maxSpeed);
      desired.x += wall.x;
      if (animal.intent !== 'eat' && animal.intent !== 'gasp' && animal.intent !== 'rest') {
        desired.y += wall.y;
        // Tira suave hacia su zona cuando anda paseando.
        if (animal.intent === 'explore' || animal.intent === 'school') {
          const y = body.y / depth;
          if (y < bandTop - 0.15) desired.y += cruise * 0.3;
          else if (y > bandBottom + 0.15) desired.y -= cruise * 0.3;
        }
      }

      if (crawler) {
        // Gambas y caracoles caminan: pegados al fondo (los caracoles también trepan el vidrio de atrás).
        if (sp.category === 'shrimp' || animal.intent !== 'explore') {
          desired.y = (depth - body.y) * 2;
        }
        if (sp.category === 'snail') body.targetPlane = PLANE_FAR;
      }

      if(input.habitat){
        const ahead=resolveHabitat(body.x+desired.x,body.y+desired.y,input.habitat,bounds.width,depth,Math.min(1,animal.sizeCm*.15));
        desired.x+=(ahead.x-body.x-desired.x)*2;desired.y+=(ahead.y-body.y-desired.y)*2;
        const goal=resolveHabitat(body.goalX,body.goalY,input.habitat,bounds.width,depth,Math.min(1,animal.sizeCm*.15));body.goalX=goal.x;body.goalY=goal.y;
      }
      const speedLimit = limits.maxSpeed * boost;
      const l = length(desired.x, desired.y);
      if (l > speedLimit) {
        desired.x = (desired.x / l) * speedLimit;
        desired.y = (desired.y / l) * speedLimit;
      }
      integrate(body, desired.x, desired.y, { ...limits, maxSpeed: speedLimit }, dt, bounds);

      if(input.habitat){const safe=resolveHabitat(body.x,body.y,input.habitat,bounds.width,depth,Math.min(1,animal.sizeCm*.15));body.x=safe.x;body.y=safe.y;}
      if(['explore','school'].includes(animal.intent)){
        body.slowSeconds=Math.hypot(body.vx,body.vy)<.12?(body.slowSeconds??0)+dt:0;
        if(body.slowSeconds>5 && this.time>(body.pauseUntil??0)){this.pickGoal(body,animal,bounds);body.slowSeconds=0;}
      }
      // Cambio de plano suave.
      const dp = body.targetPlane - body.plane;
      const maxDp = PLANE_SPEED * dt * (animal.intent === 'flee' ? 3 : 1);
      body.plane += Math.abs(dp) <= maxDp ? dp : Math.sign(dp) * maxDp;

      // El sprite se da vuelta recién cuando el giro es claro (no titila).
      if (body.vx > 0.3) body.facing = 1;
      else if (body.vx < -0.3) body.facing = -1;
    }
  }
}
