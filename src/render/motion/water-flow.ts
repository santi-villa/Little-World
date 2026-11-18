import {sweepSolids,solidAt} from './solid-contact';
import config from '../../data/ecosystem.json';
import type { Habitat } from './habitat';
export interface WaterVelocity {
  getWaterVelocity(x: number, y: number): { x: number; y: number };
  foodContact?(from:{x:number;y:number},to:{x:number;y:number},z:number,radius:number):{x:number;y:number;key:string}|null;
  foodSupported?(key:string,x:number,y:number,z:number,radius:number):boolean;
  constrain?(x: number, y: number, margin: number): { x: number; y: number };
}
/** Analytic recirculation in cm/s. No gravity, randomness or fluid solver. */
export class WaterFlow implements WaterVelocity {
  width = 60;
  height = 30;
  strength = 0;
  shape: 'box' | 'round' = 'box';
  private habitat?: Habitat;
  private pulse = 1;
  private eddy = 0;
  configure(
    width: number,
    height: number,
    effectiveLph: number,
    volumeL: number,
    habitat: Habitat,
    round = false,
  ): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.strength = Math.min(
      1,
      Math.max(0, effectiveLph / Math.max(1, volumeL * 6)),
    );
    this.habitat = habitat;
    this.shape = round ? 'round' : 'box';
  }
  setTime(seconds: number): void {
    this.pulse = 1 + 0.17 * Math.sin(seconds * 0.53);
    this.eddy = Math.sin(seconds * 0.39);
  }
  constrain(x: number, y: number, margin: number): { x: number; y: number } {
    let px = Math.max(margin, Math.min(this.width - margin, x)),
      py = Math.max(margin, Math.min(this.height - margin, y));
    if (this.shape === 'round') {
      const cx = this.width / 2,
        cy = this.height / 2,
        rx = Math.max(0.1, this.width * 0.5 - margin),
        ry = Math.max(0.1, this.height * 0.6 - margin),
        dx = (px - cx) / rx,
        dy = (py - cy) / ry,
        d = Math.hypot(dx, dy);
      if (d > 1) {
        px = cx + (dx / d) * rx;
        py = cy + (dy / d) * ry;
      }
    }
    return { x: px, y: py };
  }
  foodContact(from:{x:number;y:number},to:{x:number;y:number},z:number,radius:number){
    const hit=sweepSolids(this.habitat?.solids??[],{x:from.x/this.width,y:from.y/this.height},{x:to.x/this.width,y:to.y/this.height},z,radius/this.height,radius/this.width);
    return hit?{x:hit.x*this.width,y:hit.y*this.height,key:hit.key}:null;
  }
  foodSupported(key:string,x:number,y:number,z:number,radius:number):boolean{
    const solid=this.habitat?.solids?.find(s=>s.key===key);
    return !!solid&&solidAt(solid,x/this.width,(y+radius*1.1)/this.height,z,radius/this.width);
  }
  getWaterVelocity(x: number, y: number): { x: number; y: number } {
    if (this.strength === 0) return { x: 0, y: 0 };
    const u = Math.max(0, Math.min(1, x / this.width)),
      v = Math.max(0, Math.min(1, y / this.height));
    // Stream function vanishes at boundaries: jet left along the surface, return along the substrate.
    let attenuation =
      this.shape === 'round' ? Math.max(0.25, 1 - (u - 0.5) ** 2) : 1;
    for (const o of this.habitat?.obstacles ?? []) {
      const d = Math.hypot(
        (u - o.x) / Math.max(0.01, o.rx * 2),
        (v - o.y) / Math.max(0.01, o.ry * 2),
      );
      attenuation *= 1 - config.flow.obstacleLoss * Math.exp(-d * d);
    }
    const speed = this.strength * config.flow.maxCmS * attenuation;
    const along = Math.sin(Math.PI * u);
    const across = Math.sin(Math.PI * v);
    return {
      x: -speed * along * (this.pulse * Math.cos(Math.PI * v) + 0.14 * this.eddy * Math.cos(2 * Math.PI * v)),
      y: speed * Math.cos(Math.PI * u) * across * this.height / this.width
        * (this.pulse + 0.14 * this.eddy * Math.cos(Math.PI * v)),
    };
  }
}
