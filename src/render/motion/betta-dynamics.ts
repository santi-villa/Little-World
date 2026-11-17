import defaults from '../../data/motion-betta.json';
import type {FishBody,MotionAnimal,MotionInput} from './fish-motion';
import {angleDiff,containment} from './steering';
import {resolveHabitat} from './habitat';
export const bettaParameters={...defaults};
export type BettaMode='wander'|'investigate'|'breathe'|'food'|'startle'|'sleep'|'flare';
export class BettaDynamics {
 mode:BettaMode='wander'; stroke:'burst'|'glide'|'float'='float';pitch=0;bob=0;phase=0;force={x:0,y:0};
 private cycle=0;private goalAt=0;
 update(b:FishBody,a:MotionAnimal,dt:number,input:MotionInput,time:number,random:()=>number):void{
  const c=bettaParameters,L=Math.max(c.epsilon,a.sizeCm*c.bodyFraction),bounds=input.bounds;
  if(time>=this.goalAt){b.goalX=L+(bounds.width-2*L)*random();b.goalY=bounds.height*(c.zoneTop+(c.zoneBottom-c.zoneTop)*random());this.goalAt=time+c.goalMinSeconds+random()*(c.goalMaxSeconds-c.goalMinSeconds);}
  this.cycle+=dt;
  const period=c.burstSeconds+c.glideSeconds+c.floatSeconds,at=this.cycle%period;
  this.stroke=at<c.burstSeconds?'burst':at<c.burstSeconds+c.glideSeconds?'glide':'float';
  let remaining=Math.min(c.maxDelta,Math.max(0,dt));
  while(remaining>0){const h=Math.min(c.stepSeconds,remaining);remaining-=h;
   const angle=Math.atan2(b.goalY-b.y,b.goalX-b.x),turn=Math.max(-c.maxTurnDegS*Math.PI/180*h,Math.min(c.maxTurnDegS*Math.PI/180*h,angleDiff(angle,b.heading)));b.heading+=turn;
   const speed=Math.hypot(b.vx,b.vy),thrust=this.stroke==='burst'&&speed<L*c.cruiseLengthsS?c.thrust*L:0;
   const wall=containment(b,bounds,L*c.wallLengths,c.wallForce*L);
   let fx=Math.cos(b.heading)*thrust+wall.x,fy=Math.sin(b.heading)*thrust+wall.y;
   for(const o of input.habitat?.obstacles??[]){const rx=o.rx*bounds.width+L*c.wallLengths,ry=o.ry*bounds.height+L*c.wallLengths,dx=(b.x-o.x*bounds.width)/rx,dy=(b.y-o.y*bounds.height)/ry,d=Math.hypot(dx,dy);if(d<1&&d>c.epsilon){fx+=dx/d*(1-d)*c.obstacleForce*L;fy+=dy/d*(1-d)*c.obstacleForce*L;}}
   this.force={x:fx,y:fy};b.vx+=(fx-c.drag*speed*b.vx)/c.mass*h;b.vy+=(fy-c.drag*speed*b.vy)/c.mass*h;
   if(this.stroke!=='burst'){b.vx*=Math.exp(-c.glideDrag*h);b.vy*=Math.exp(-c.glideDrag*h);}
   const v=Math.hypot(b.vx,b.vy),limit=L*c.burstLengthsS;if(v>limit){b.vx*=limit/v;b.vy*=limit/v;}
   b.x+=b.vx*h;b.y+=b.vy*h;
   const safe=resolveHabitat(b.x,b.y,input.habitat??{obstacles:[],leaves:[],refuges:[]},bounds.width,bounds.height,L*c.collisionMargin);b.x=safe.x;b.y=safe.y;
  }
  const pitch=Math.max(-c.pitchMaxDeg*Math.PI/180,Math.min(c.pitchMaxDeg*Math.PI/180,Math.atan2(b.vy,Math.max(c.epsilon,Math.abs(b.vx)))));
  this.pitch+=(pitch-this.pitch)*(1-Math.exp(-dt*c.pitchEase));
  this.bob=Math.sin(time*Math.PI*2*c.floatHz+b.phase)*a.sizeCm*c.heightFraction*c.floatAmplitude*(1+c.noiseAmount*Math.sin(time*c.noiseHz+b.phase));
  this.phase+=dt*Math.PI*2*(this.stroke==='burst'?c.tailHz:this.stroke==='glide'?c.glideTailHz:0);
  if(Math.abs(Math.cos(b.heading))>c.turnMinWidth)b.facing=Math.cos(b.heading)<0?-1:1;
 }
}
