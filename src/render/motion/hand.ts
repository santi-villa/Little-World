/** Optional bounded curiosity. A hand is outside the tank, never a permanent target. */
export interface HandInput {x:number;y:number;speed:number;age:number;}
export function interestedInHand(id:number,time:number,trust:number,boldness:number,fright:number,intent:string,hand:HandInput|null|undefined):boolean{
 if(!hand||hand.age>2||hand.speed>45||fright>0.1||['rest','hide','flee','eat','gasp','chase'].includes(intent))return false;
 const period=18+(id%5)*3,phase=(time+id*3)%period;
 return phase<3+Math.min(1,trust)*2 && (trust>0.2||boldness>0.65);
}
