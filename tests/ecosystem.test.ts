import {applyAction,createNewTank,defaultConfig} from '../src/sim';
import {buildContext} from '../src/sim/fish';
import {stepFood,fullMealG} from '../src/sim/feeding';
import {getSpecies} from '../src/sim';
import {describe,it,expect} from 'vitest';
import {Container} from 'pixi.js';
import {WaterFlow} from '../src/render/motion/water-flow';
import {FoodParticles} from '../src/render/motion/food-particles';
import {BubbleParticles} from '../src/render/motion/bubble-particles';
import {PlantMotion} from '../src/render/motion/plant-motion';
import {Camera} from '../src/render/camera';
const empty={obstacles:[],leaves:[],refuges:[]};
describe('ecosistema compartido',()=>{
 it('sin caudal no inventa corrientes y los obstáculos atenúan la circulación',()=>{
  const field=new WaterFlow();field.configure(60,30,0,60,empty);expect(field.getWaterVelocity(20,10)).toEqual({x:0,y:0});
  field.configure(60,30,300,60,empty);const clear=field.getWaterVelocity(30,8);field.configure(60,30,300,60,{...empty,obstacles:[{x:.5,y:8/30,rx:.1,ry:.1}]});const blocked=field.getWaterVelocity(30,8);expect(Math.hypot(blocked.x,blocked.y)).toBeLessThan(Math.hypot(clear.x,clear.y));
 });
 it('los representantes conservan los gramos de cada pool y sus IDs al hundirse',()=>{
  const field=new WaterFlow(),food=new FoodParticles(12);food.update(0,{surface:.001,sinking:0,bottom:0,x:20},60,30,field);const id=food.particles[0]!.id;
  food.update(.1,{surface:0,sinking:.001,bottom:0,x:20},60,30,field);expect(food.particles[0]!.id).toBe(id);expect(food.totals[1]).toBeCloseTo(.001,8);
  food.update(.1,{surface:.002,sinking:.003,bottom:.004,x:20},60,30,field);food.totals.forEach((n,i)=>expect(n).toBeCloseTo([.002,.003,.004][i]!,8));expect(food.particles.length).toBeLessThanOrEqual(12);
 });
 it('la comida se deposita sin reaparecer arriba ni atravesar el fondo',()=>{
  const field=new WaterFlow(),food=new FoodParticles();for(let i=0;i<500;i++)food.update(.1,{surface:0,sinking:.001,bottom:0,x:10},20,1,field);
  const p=food.particles[0]!,y=p.y,id=p.id;expect(p.phase).toBe('bottom');expect(p.y).toBeLessThanOrEqual(1);for(let i=0;i<100;i++)food.update(.1,{surface:0,sinking:.001,bottom:0,x:10},20,1,field);expect(food.particles[0]!.id).toBe(id);expect(food.particles[0]!.y).toBe(y);
  food.update(.1,{surface:0,sinking:0,bottom:0,x:10,consumedLayers:2},20,1,field);expect(food.particles.length).toBe(0);expect(food.retired[0]!.phase).toBe('consumed');
 });
 it('las microburbujas necesitan emisor y desaparecen en la superficie',()=>{
  const b=new BubbleParticles(),field=new WaterFlow();for(let i=0;i<120;i++)b.update(1/60,60,30,0,field);expect(b.particles).toHaveLength(0);for(let i=0;i<120;i++)b.update(1/60,60,3,1,field);expect(b.particles.length).toBeGreaterThan(0);for(let i=0;i<600;i++)b.update(1/60,60,3,0,field);expect(b.particles).toHaveLength(0);
 });
 it('anubias se flexiona menos que vallisneria, con raíces fijas',()=>{
  const rigid=new PlantMotion(9,1,'anubias'),flexible=new PlantMotion(9,1,'vallisneria');for(let i=0;i<1200;i++){rigid.update(1/60,i/60,1,[],.3);flexible.update(1/60,i/60,1,[],.3);}expect(rigid.offsets[0]).toBe(0);expect(flexible.offsets[0]).toBe(0);expect(Math.abs(rigid.offsets[8]!)).toBeLessThan(Math.abs(flexible.offsets[8]!));
 });
 it('el zoom mantiene el punto bajo el cursor mientras interpola',()=>{
  const camera=new Camera(new Container()),point={x:740,y:340},before=camera.toWorld(point.x,point.y);camera.zoomAt(point.x,point.y,1.7);for(let i=0;i<40;i++){camera.update(1/60);const after=camera.toWorld(point.x,point.y);expect(after.x).toBeCloseTo(before.x,5);expect(after.y).toBeCloseTo(before.y,5);}
 });
});

describe('alimentación en vivo sin duplicar química',()=>{
 const tank=()=>{const state=applyAction(createNewTank(),{type:'addAnimals',speciesId:'betta',count:1}).state;state.animals[0]!.hunger=.5;state.animals[0]!.stress=0;state.animals[0]!.fright=0;state.animals[0]!.intent='eat';state.food.surfaceG=.01;return state;};
 it('sin contacto no consume; con contacto válido la química reduce comida y hambre',()=>{
  const state=tank(),animal=state.animals[0]!;stepFood(state,.1,buildContext(state,defaultConfig),defaultConfig,{});expect(animal.hunger).toBe(.5);
  const before=state.food.surfaceG+state.food.sinkingG+state.organics.foodG;stepFood(state,.1,buildContext(state,defaultConfig),defaultConfig,{[animal.id]:1});expect(animal.hunger).toBeLessThan(.5);
  const after=state.food.surfaceG+state.food.sinkingG+state.organics.foodG,eaten=(.5-animal.hunger)*fullMealG(getSpecies('betta'),animal,defaultConfig);expect(after+eaten).toBeCloseTo(before,10);
 });
 it('sin observación visual, el modelo offline conserva acceso por especie',()=>{const state=tank();stepFood(state,.1,buildContext(state,defaultConfig),defaultConfig);expect(state.animals[0]!.hunger).toBeLessThan(.5);});
});

it('el alimento asentado permanece sobre el sustrato al rellenar agua',()=>{const field=new WaterFlow(),food=new FoodParticles();food.update(0,{surface:0,sinking:0,bottom:.002,x:10},20,10,field);const id=food.particles[0]!.id;food.update(.1,{surface:0,sinking:0,bottom:.002,x:10},20,15,field);expect(food.particles[0]!.id).toBe(id);expect(food.particles[0]!.y).toBe(15);});
