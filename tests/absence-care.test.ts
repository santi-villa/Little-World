import { describe,it,expect } from 'vitest';
import { Game } from '../src/game';
import { catchUp,constantOutdoor,defaultConfig } from '../src/sim';
import { favoriteCorner,FishMotion } from '../src/render/motion/fish-motion';
import { getSpecies } from '../src/sim';

describe('regreso al acuario inicial',()=>{
 it.each([1,3,7])('explica qué hacer al volver después de %i días',days=>{
  const state=Game.newTank(42).state;
  const result=catchUp(state,days*1440,defaultConfig,{outdoor:constantOutdoor(23)});
  const lines=result.summary.lines.map(l=>l.text).join(' ');
  console.log(`${days} días: vivos=${result.state.animals.filter(a=>a.alive).length}, hambre=${result.state.animals[0]!.hunger.toFixed(2)}, salud=${result.state.animals[0]!.health.toFixed(1)}, alertas=${result.state.alerts.join(',')}`);
  expect(result.state.animals[0]!.alive).toBe(true);
  expect(lines).toContain('Para empezar:');
  expect(lines).not.toContain('gato tiene hambre');
  if(days>=3){expect(lines).toContain('no alimenta');expect(result.summary.lines.some(l=>l.tone==='good' && l.text.includes('contentos'))).toBe(false);}
  if(result.state.animals[0]!.hunger>defaultConfig.fish.hungryAt && !result.state.alerts.some(id=>id!=='algae_bloom'))expect(lines).toContain('No compenses');
  expect(state.animals[0]!.hunger).toBeLessThan(result.state.animals[0]!.hunger);
 });
 it('prioriza retirar muertos y el agua, antes de recomendar comida',()=>{
  const state=Game.newTank(21).state;state.animals[0]!.alive=false;state.animals[0]!.corpseG=0.5;
  const summary=catchUp(state,60).summary.lines.map(l=>l.text).join(' ');
  expect(summary).toContain('retirá los animales muertos');
  expect(summary).not.toContain('No compenses');
 });
});
describe('personalidad visual',()=>{
 it('conserva una preferencia individual sin cambiar el RNG de la partida',()=>{
  const game=Game.newTank(52), saved=JSON.parse(JSON.stringify(game.state));
  const previous=favoriteCorner(saved.animals[0].id);
  const loaded=new Game(saved);
  expect(favoriteCorner(loaded.state.animals[0]!.id)).toBe(previous);
  expect(loaded.state.rngState).toBe(game.state.rngState);
  expect(favoriteCorner(loaded.state.animals[0]!.id+1)).not.toBe(previous);
 });
 it('un pez con intención de comer se aproxima al sitio de la comida',()=>{
  const motion=new FishMotion(1);
  const input={bounds:{width:60,height:26},animals:[{id:1,species:getSpecies('betta'),intent:'eat' as const,targetId:null,fright:0,sizeCm:5,alive:true,boldness:0.8,activity:0.5,feedingTrust:0.8}],food:{surface:true,sinking:false,bottom:false,x:30},scare:null,catAtGlass:false};
  motion.update(0,input);
  for(let i=0;i<1200;i++)motion.update(1/60,input);
  const body=motion.bodies.get(1)!;
  expect(Math.abs(body.x-30)).toBeLessThan(4);expect(body.y).toBeLessThan(3);
 });
});
