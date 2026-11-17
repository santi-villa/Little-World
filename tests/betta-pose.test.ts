import {createSave,parseSave,DEFAULT_SETTINGS} from '../src/save/save-format';
import {createNewTank} from '../src/sim';
import {describe,it,expect} from 'vitest';
import {newBettaPose,advanceBettaPose} from '../src/render/motion/betta-pose';
import {FishMotion} from '../src/render/motion/fish-motion';
import {getSpecies} from '../src/sim';

describe('pose procedural del betta',()=>{
 it('inclina el cuerpo al subir y bajar sin saltar de ángulo',()=>{
  const p=newBettaPose(1);advanceBettaPose(p,1/60,1,-2,1,4,'explore');expect(p.pitch).toBeLessThan(0);expect(Math.abs(p.pitch)).toBeLessThan(.15);
  for(let i=0;i<120;i++)advanceBettaPose(p,1/60,1,2,1,4,'explore');expect(p.pitch).toBeGreaterThan(.5);
 });
 it('gira progresivamente y mantiene las aletas vivas incluso quieto',()=>{
  const p=newBettaPose(1);advanceBettaPose(p,.016,-2,0,-1,4,'explore');expect(p.turn).toBeGreaterThan(0);
  for(let i=0;i<90;i++)advanceBettaPose(p,1/60,-2,0,-1,4,'explore');expect(p.turn).toBe(-1);
  const phase=p.phase;advanceBettaPose(p,.016,0,0,-1,4,'rest');expect(p.phase).toBeGreaterThan(phase);
 });
 it('da más esfuerzo en un arranque que en reposo y no anima peces muertos',()=>{
  const rest=newBettaPose(1),burst=newBettaPose(1);
  for(let i=0;i<30;i++){advanceBettaPose(rest,1/60,0,0,1,4,'rest');advanceBettaPose(burst,1/60,4,0,1,4,'flee');}
  expect(burst.effort).toBeGreaterThan(rest.effort+.2);
  const before={...burst};advanceBettaPose(burst,.1,0,0,1,4,'rest',false);expect(burst).toEqual(before);
 });
 it('recorre ambas direcciones y varias alturas sin salir de la pecera',()=>{
  const m=new FishMotion(32),a={id:1,species:getSpecies('betta'),intent:'explore' as const,targetId:null,fright:0,sizeCm:5,alive:true,boldness:.7,activity:.6};
  const input={bounds:{width:60,height:30},animals:[a],food:{surface:false,sinking:false,bottom:false,x:30},scare:null,catAtGlass:false};
  let left=false,right=false,up=false,down=false,minY=30,maxY=0;
  for(let i=0;i<5400;i++){m.update(1/30,input);const b=m.bodies.get(1)!;left ||= b.vx<-.3;right ||= b.vx>.3;up ||= b.vy<-.3;down ||= b.vy>.3;minY=Math.min(minY,b.y);maxY=Math.max(maxY,b.y);expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x).toBeLessThanOrEqual(60);}
  expect([left,right,up,down]).toEqual([true,true,true,true]);expect(maxY-minY).toBeGreaterThan(8);
 });
});

describe('comparación de arte',()=>{
 it('conserva cada estilo y rechaza preferencias desconocidas',()=>{
  for(const style of ['code','image'] as const){
   const save=createSave(createNewTank(),DEFAULT_SETTINGS,1,{tutorial:4,journal:[],bettaStyle:style});
   const loaded=parseSave(JSON.parse(JSON.stringify(save)));expect(loaded.status).toBe('ok');
   if(loaded.status==='ok')expect(loaded.save.player.bettaStyle).toBe(style);
   expect(parseSave({...save,player:{...save.player,bettaStyle:'missing'}}).status).toBe('invalid');
  }
 });
});
