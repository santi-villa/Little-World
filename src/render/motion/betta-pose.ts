/** Visual pose follows velocity with inertia; it never changes aquarium chemistry. */
export interface BettaPose { turn:number; pitch:number; phase:number; effort:number; speed:number; }
export function newBettaPose(facing:number,seed=0):BettaPose{return {turn:facing,pitch:0,phase:seed*2.399,effort:0,speed:0};}
export function advanceBettaPose(p:BettaPose,dt:number,vx:number,vy:number,facing:number,maxSpeed:number,intent:string,alive=true):void{
 if(!alive)return;
 const h=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
 const speed=Math.hypot(vx,vy),ratio=Math.min(1,speed/Math.max(.1,maxSpeed));
 const acceleration=Math.max(0,(speed-p.speed)/Math.max(.016,h));
 const startle=intent==='flee';
 const targetEffort=Math.min(1,ratio*.55+acceleration/Math.max(1,maxSpeed)*.6+(startle ? .25 : 0));
 p.effort+=(targetEffort-p.effort)*(1-Math.exp(-h*5));
 const targetPitch=speed>.15?Math.max(-.75,Math.min(.75,Math.atan2(vy,Math.max(.4,Math.abs(vx))))):0;
 p.pitch+=(targetPitch-p.pitch)*(1-Math.exp(-h*3.5));
 const d=facing-p.turn;p.turn+=Math.sign(d)*Math.min(Math.abs(d),h*(startle?5:2.8));
 // Slow breathing at rest; stronger strokes while accelerating, softer gliding at speed.
 p.phase+=h*(1.3+p.effort*6)*(intent==='rest' ? .55 : 1);
 p.speed=speed;
}
