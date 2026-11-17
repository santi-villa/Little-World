import { suggestedFoodG } from '../care';
import { defaultConfig, type SimState } from '../sim';
export type HandTool='observe'|'food'|'sponge'|'tap';
/** Small pinches leave room to choose placement and avoid turning repeated clicks into a large meal. */
export function pinchGrams(state:SimState):number { return Math.min(defaultConfig.food.manualPinchG,suggestedFoodG(state)); }
export function strokeSamples(from:{x:number;y:number},to:{x:number;y:number},spacing=0.04):{x:number;y:number}[]{
 const count=Math.min(64,Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/spacing)));
 return Array.from({length:count},(_,i)=>({x:from.x+(to.x-from.x)*(i+1)/count,y:from.y+(to.y-from.y)*(i+1)/count}));
}
