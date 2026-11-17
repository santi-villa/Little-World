/** Persistent spatial film: cleaning one patch does not clean the entire pane. */
import type { AlgaeState } from './types';
export const GLASS_COLS=12, GLASS_ROWS=8, GLASS_CELLS=GLASS_COLS*GLASS_ROWS;
export function glassCells(algae:AlgaeState):number[]{return algae.glassCells??new Array<number>(GLASS_CELLS).fill(algae.glass);}
export function scrubGlass(algae:AlgaeState,x:number,y:number,radius:number,strength:number):number{
  const before=algae.glass,cells=glassCells(algae).slice();
  for(let row=0;row<GLASS_ROWS;row++)for(let col=0;col<GLASS_COLS;col++){
    if(Math.hypot((col+.5)/GLASS_COLS-x,(row+.5)/GLASS_ROWS-y)<=radius)cells[row*GLASS_COLS+col]!*=1-strength;
  }
  algae.glassCells=cells;algae.glass=cells.reduce((a,b)=>a+b,0)/GLASS_CELLS;
  return before-algae.glass;
}
export function evolveGlass(algae:AlgaeState,before:number):void{
  if(!algae.glassCells)return;
  const delta=algae.glass-before;
  // Growth fills remaining capacity; decay preserves the cleaned pattern.
  algae.glassCells=algae.glassCells.map(v=>delta>=0?v+(1-v)*delta/Math.max(1e-9,1-before):v*algae.glass/Math.max(1e-9,before));
}
