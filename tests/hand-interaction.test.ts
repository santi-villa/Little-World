import {describe,it,expect} from 'vitest';
import {applyAction,createNewTank,step} from '../src/sim';
import {GLASS_CELLS} from '../src/sim/glass';
import {createSave,parseSave,DEFAULT_SETTINGS} from '../src/save/save-format';
import {interestedInHand} from '../src/render/motion/hand';
import {strokeSamples,pinchGrams} from '../src/render/hand-tools';

describe('mano y cuidados espaciales',()=>{
 it('una pizca conserva el punto elegido y no cambia el estado anterior',()=>{
  const state=applyAction(createNewTank(),{type:'addAnimals',speciesId:'betta',count:1}).state;
  const amount=pinchGrams(state);expect(amount).toBeGreaterThan(0);expect(amount).toBeLessThanOrEqual(.004);
  const result=applyAction(state,{type:'feed',grams:amount,x:.83});
  expect(result.state.food.x).toBe(.83);expect(result.state.food.surfaceG).toBe(amount);expect(state.food.surfaceG).toBe(0);
 });
 it('limpia solo el recorrido y lo conserva al guardar y simular crecimiento',()=>{
  const state=createNewTank();state.algae.glass=.8;
  const clean=applyAction(state,{type:'scrubGlass',x:.2,y:.5,radius:.12,strength:.7}).state;
  expect(state.algae.glassCells).toBeUndefined();expect(clean.algae.glassCells).toHaveLength(GLASS_CELLS);
  expect(clean.algae.glass).toBeLessThan(.8);expect(clean.algae.glass).toBeGreaterThan(.6);
  expect(clean.algae.glassCells!.some(v=>v===.8)).toBe(true);
  const low=Math.min(...clean.algae.glassCells!);expect(low).toBeLessThan(.3);
  const result=parseSave(createSave(clean,DEFAULT_SETTINGS,1));expect(result.status).toBe('ok');
  if(result.status==='ok'){
    const next=step(result.save.sim,60).state;
    expect(Math.max(...next.algae.glassCells!)-Math.min(...next.algae.glassCells!)).toBeGreaterThan(.2);
    expect(next.algae.glassCells!.reduce((a,b)=>a+b,0)/GLASS_CELLS).toBeCloseTo(next.algae.glass,6);
  }
 });
 it('valida los datos nuevos sin rechazar partidas anteriores',()=>{
  const save=createSave(createNewTank(),DEFAULT_SETTINGS,1);expect(parseSave(save).status).toBe('ok');
  expect(parseSave({...save,sim:{...save.sim,algae:{...save.sim.algae,glassCells:[NaN]}}}).status).toBe('invalid');
  expect(parseSave({...save,sim:{...save.sim,food:{...save.sim.food,x:Infinity}}}).status).toBe('invalid');
 });
 it('interpola trazos rápidos sin dejar huecos y no genera puntos fuera del recorrido',()=>{
  const points=strokeSamples({x:.1,y:.5},{x:.9,y:.5});expect(points.length).toBeGreaterThan(10);
  expect(points.every(p=>p.x>=.1&&p.x<=.91&&p.y===.5)).toBe(true);
 });
});
describe('curiosidad con pausas',()=>{
 const hand={x:20,y:10,speed:2,age:0};
 it('puede acercarse por unos segundos pero después pierde el interés',()=>{
  let interested=0;
  for(let t=0;t<60;t+=.5)if(interestedInHand(1,t,.8,.8,0,'explore',hand))interested++;
  expect(interested).toBeGreaterThan(0);expect(interested).toBeLessThan(60);
 });
 it('respeta descanso, miedo, hambre y movimientos bruscos',()=>{
  for(const intent of ['rest','hide','flee','eat','gasp'])expect(interestedInHand(1,0,1,1,0,intent,hand)).toBe(false);
  expect(interestedInHand(1,0,1,1,.5,'explore',hand)).toBe(false);
  expect(interestedInHand(1,0,1,1,0,'explore',{...hand,speed:100})).toBe(false);
  expect(interestedInHand(1,0,1,1,0,'explore',{...hand,age:5})).toBe(false);
 });
});
