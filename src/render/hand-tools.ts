import { suggestedFoodG } from '../care';
import { defaultConfig, type SimState } from '../sim';
/** La mano: 'hand' es la mano sola; el resto, la herramienta que sostiene. */
export type HandTool='hand'|'observe'|'food'|'sponge'|'tap'|'bucket'|'kit'|'filter';
/** Why a tool can't be used right now (a text key of texts.ui.cannot), or null. */
export function cannotUse(tool:HandTool,state:SimState):'lidClosed'|'fed'|'filterClean'|null{
 if(tool==='food'){ if(state.tank.hasLid)return 'lidClosed'; if(pinchGrams(state)<=0.0001)return 'fed'; }
 if(tool==='filter' && (state.filter.mediaCapacity<=0||state.filter.clog<defaultConfig.thresholds.filterClogged))return 'filterClean';
 return null;
}
/** Small pinches leave room to choose placement and avoid turning repeated clicks into a large meal. */
export function pinchGrams(state:SimState):number { return Math.min(defaultConfig.food.manualPinchG,suggestedFoodG(state)); }
export function strokeSamples(from:{x:number;y:number},to:{x:number;y:number},spacing=0.04):{x:number;y:number}[]{
 const count=Math.min(64,Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/spacing)));
 return Array.from({length:count},(_,i)=>({x:from.x+(to.x-from.x)*(i+1)/count,y:from.y+(to.y-from.y)*(i+1)/count}));
}
