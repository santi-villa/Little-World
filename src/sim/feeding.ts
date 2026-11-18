import {reconcileFoodGrains,publishFoodGrains} from './food-grains';
/**
 * Alimentación. La comida cae a la superficie, flota un rato, se hunde y
 * termina en el fondo. Cada animal come de las capas a las que llega según su
 * zona; los rápidos y atrevidos se llevan más. Lo que nadie come queda en el
 * fondo como residuo orgánico (organics.foodG) y se pudre.
 */

import type { SimConfig } from './config';
import { sizeFactor, type TankContext } from './fish';
import type { Species } from './species';
import type { AnimalState, SimState } from './types';

const EPSILON_G = 1e-6;
let want = new Float64Array(64);
let full = new Float64Array(64);

/** Gramos que lleva a un animal de famélico (1) a lleno (0). */
export function fullMealG(species: Species, animal: AnimalState, config: SimConfig): number {
  const f = config.fish;
  return (species.bioload * sizeFactor(animal, config) * f.foodGPerBioloadPerDay) / f.hungerPerDay;
}

/** Acceso (0–1) de un animal a cada capa: [superficie, media agua, fondo]. */
export function layerAccess(
  species: Species,
  animal: AnimalState,
  layer: 0 | 1 | 2,
  config: SimConfig,
): number {
  const access = config.food.access[species.zone][layer] as number;
  if (layer !== 0 || species.zone === 'surface') return access;
  // Los tímidos no se animan a subir: necesitan comida que se hunda.
  const min = config.food.shySurfaceAccessMin;
  return access * (min + (1 - min) * animal.personality.boldness);
}

/** ¿Hay comida al alcance de esta especie? */
export function foodInReach(state: SimState, species: Species, config: SimConfig): boolean {
  const access = config.food.access[species.zone];
  return (
    state.food.surfaceG * (access[0] as number) +
      state.food.sinkingG * (access[1] as number) +
      state.organics.foodG * (access[2] as number) >
    1e-4
  );
}

export function stepFood(
  state: SimState,
  dtMinutes: number,
  ctx: TankContext,
  config: SimConfig,
  contacts?:Readonly<Record<number,number>>,
  grainContacts?:Readonly<Record<number,readonly number[]>>,
): void {
  if(state.food.grains){stepGrainFood(state,dtMinutes,ctx,config,contacts,grainContacts);return;}
  const food = state.food;
  const organics = state.organics;
  const inColumn = food.surfaceG + food.sinkingG;
  if (inColumn <= EPSILON_G && (organics.foodG <= EPSILON_G || ctx.aliveCount === 0)) {
    food.surfaceG = 0;
    food.sinkingG = 0;
    return;
  }
  const f = config.fish;
  const animals = state.animals;
  const count = animals.length;
  const accessAt=(i:number,layer:0|1|2):number=>contacts!==undefined&&((contacts[animals[i]!.id]??0)&(1<<layer))===0?0:layerAccess(ctx.species[i] as Species,animals[i]!,layer,config);
  if (want.length < count) {
    want = new Float64Array(count * 2);
    full = new Float64Array(count * 2);
  }

  // Mientras haya comida cayendo se avanza de a un minuto como mucho.
  const substeps = inColumn > EPSILON_G ? Math.max(1, Math.ceil(dtMinutes - 1e-9)) : 1;
  const h = dtMinutes / substeps;
  const floatOut = 1 - Math.exp(-h / config.food.floatMinutes);
  const sinkOut = 1 - Math.exp(-h / config.food.sinkMinutes);

  for (let step = 0; step < substeps; step++) {
    const bottomOnly = food.surfaceG + food.sinkingG <= EPSILON_G;
    if (ctx.aliveCount > 0) {
      // Cuánto quiere comer cada uno en este rato.
      for (let i = 0; i < count; i++) {
        const a = animals[i] as AnimalState;
        want[i] = 0;
        if (!a.alive || a.hunger <= 0.02 || a.stress > 85 || a.fright > 0.5) continue;
        const sp = ctx.species[i] as Species;
        // Si solo queda comida en el fondo, los que no bajan ni se enteran.
        if (bottomOnly && (config.food.access[sp.zone][2] as number) <= 0) continue;
        const size = sizeFactor(a, config);
        const ration = sp.bioload * size * f.foodGPerBioloadPerDay;
        const speed = Math.min(2, Math.max(0.3, sp.swim.speedCmS / f.referenceSpeedCmS));
        const appetite = a.intent === 'rest' ? 0.3 : 1;
        full[i] = ration / f.hungerPerDay;
        want[i] = Math.min(a.hunger * (full[i] as number), (ration / f.mealMinutes) * speed * appetite * h);
      }
      for (let layer = (bottomOnly ? 2 : 0) as 0 | 1 | 2; layer < 3; layer++) {
        const available = layer === 0 ? food.surfaceG : layer === 1 ? food.sinkingG : organics.foodG;
        if (available <= EPSILON_G) continue;
        let demand = 0;
        for (let i = 0; i < count; i++) {
          if ((want[i] as number) <= 0) continue;
          demand +=
            (want[i] as number) *
            accessAt(i,layer);
        }
        if (demand <= 0) continue;
        const share = Math.min(1, available / demand);
        let eatenTotal = 0;
        for (let i = 0; i < count; i++) {
          if ((want[i] as number) <= 0) continue;
          const a = animals[i] as AnimalState;
          const eaten =
            (want[i] as number) * accessAt(i,layer) * share;
          if (eaten <= 0) continue;
          want[i] = (want[i] as number) - eaten;
          a.hunger = Math.max(0, a.hunger - eaten / (full[i] as number));
          eatenTotal += eaten;
        }
        if (layer === 0) food.surfaceG = Math.max(0, food.surfaceG - eatenTotal);
        else if (layer === 1) food.sinkingG = Math.max(0, food.sinkingG - eatenTotal);
        else organics.foodG = Math.max(0, organics.foodG - eatenTotal);
      }
    }
    // Lo que queda sigue bajando.
    const landed = food.sinkingG * sinkOut;
    const sunk = food.surfaceG * floatOut;
    food.sinkingG += sunk - landed;
    food.surfaceG -= sunk;
    organics.foodG += landed;
  }
  if (food.surfaceG + food.sinkingG <= EPSILON_G) {
    organics.foodG += food.surfaceG + food.sinkingG;
    food.surfaceG = 0;
    food.sinkingG = 0;
  }
}

/** Exact bites withdraw grams from identified grains; no second hunger or chemistry model. */
function stepGrainFood(state:SimState,dtMinutes:number,ctx:TankContext,config:SimConfig,contacts:Readonly<Record<number,number>>|undefined,grainContacts:Readonly<Record<number,readonly number[]>>|undefined):void{
 reconcileFoodGrains(state);const grains=state.food.grains!,f=config.fish,substeps=Math.max(1,Math.ceil(dtMinutes)),h=dtMinutes/substeps,spatial=grainContacts!==undefined&&dtMinutes<=1;
 const needs=new Float64Array(state.animals.length),meals=new Float64Array(state.animals.length);
 const ids=grainContacts?new Map(Object.entries(grainContacts).map(([id,list])=>[Number(id),new Set(list)])):undefined;
 for(let step=0;step<substeps;step++){
  for(const g of grains){g.ageMinutes+=h;if(g.layer===0&&g.ageMinutes>=g.sinkAt){g.layer=1;g.y=Math.max(0,g.y);}if(g.layer===1&&!spatial&&g.ageMinutes>=g.bottomAt){g.layer=2;g.y=1;g.vx=0;g.vy=0;}}
  state.animals.forEach((a,i)=>{needs[i]=0;if(!a.alive||a.hunger<=.02||a.stress>85||a.fright>.5)return;const sp=ctx.species[i]!,ration=sp.bioload*sizeFactor(a,config)*f.foodGPerBioloadPerDay;meals[i]=ration/f.hungerPerDay;needs[i]=Math.min(a.hunger*meals[i]!,ration/f.mealMinutes*Math.min(2,Math.max(.3,sp.swim.speedCmS/f.referenceSpeedCmS))*(a.intent==='rest'?.3:1)*h);});
  for(const g of grains){if(g.grams<=EPSILON_G)continue;let demand=0;const eligible=(i:number)=>{
    const a=state.animals[i]!;if(ids&&!ids.get(a.id)?.has(g.id))return 0;if(contacts!==undefined&&((contacts[a.id]??0)&(1<<g.layer))===0)return 0;
    return needs[i]!*layerAccess(ctx.species[i]!,a,g.layer,config);
   };
   for(let i=0;i<needs.length;i++)demand+=eligible(i);if(demand<=0)continue;const share=Math.min(1,g.grams/demand);let eaten=0;
   // All shares use the same pre-bite demand, preserving fair allocation among nearby fish.
   for(let i=0;i<needs.length;i++){const amount=eligible(i)*share;if(amount<=0)continue;needs[i]=Math.max(0,needs[i]!-amount);state.animals[i]!.hunger=Math.max(0,state.animals[i]!.hunger-amount/meals[i]!);eaten+=amount;}
   g.grams=Math.max(0,g.grams-eaten);
  }
 }
 publishFoodGrains(state);
}
