import appearance from '../../data/fish-appearance.json';
import {bettaParameters as cBetta,type BettaDynamics} from '../motion/betta-dynamics';
import { Container, Graphics } from 'pixi.js';
import { newBettaPose, advanceBettaPose } from '../motion/betta-pose';
import { projectFish, smoothAngle, type Point3 } from '../motion/volume';
import type { FishBody } from '../motion/fish-motion';
import { lerpColor } from '../pixel-utils';
import type { Species } from '../../sim';
interface Face {
  points: Point3[];
  color: number;
  alpha?: number;
}
/** Articulated volume: rings, curved membranes and visible-side anatomy. No image mirroring. */
export class CodeBetta {
  readonly container = new Container();
  private readonly g = new Graphics();
  private readonly pose;
  private yaw: number;
  private pitch = 0;
  private previousPlane:number|undefined;private depthAngle=0;
  private animationSeconds=0;private finLag=0;private finVelocity=0;private previousSpeed=0;
  private readonly species?: Species;
  constructor(seed: number, facing: number, species?: Species) {
    this.container.label='fish-'+seed;
    this.species = species;
    this.pose = newBettaPose(facing, seed);
    this.yaw = facing < 0 ? Math.PI : 0;
    this.container.addChild(this.g);
  }
  update(
    body: FishBody,
    x: number,
    y: number,
    length: number,
    dt: number,
    maxSpeed: number,
    intent: string,
    alive: boolean,
    lit: boolean,
    damage: number,
    motion?: BettaDynamics,
    condition=1,
  ): void {
    const p = this.pose;
    if(!motion)advanceBettaPose(
      p,
      dt,
      body.vx,
      body.vy,
      body.facing,
      maxSpeed,
      intent,
      alive,
    );
    const h = Math.min(0.1, Math.max(0, dt));
    if(alive)this.animationSeconds+=h;
    if(motion&&alive){
      p.phase=motion.phase;p.pitch=motion.mode==='food'?-cBetta.foodPitchDeg*Math.PI/180:motion.pitch;
      p.effort+=((motion.stroke==='burst'?condition:0)-p.effort)*(1-Math.exp(-h*cBetta.pitchEase));
      const speed=Math.hypot(body.vx,body.vy),target=-(speed-this.previousSpeed)*cBetta.finAccelerationLag;
      let remaining=h;while(remaining>0){const step=Math.min(remaining,cBetta.stepSeconds);remaining-=step;this.finVelocity+=(cBetta.finSpring*(target-this.finLag)-cBetta.finDamping*this.finVelocity)*step;this.finLag+=this.finVelocity*step;}this.previousSpeed=speed;
    }

    if(alive){const velocity=(body.plane-(this.previousPlane??body.plane))/Math.max(.016,h);this.depthAngle+=(Math.atan(velocity)*.7-this.depthAngle)*(1-Math.exp(-h*3));}this.previousPlane=body.plane;
    if (alive) {
      this.yaw = smoothAngle(
        this.yaw,
        (body.facing < 0 ? Math.PI : 0)+this.depthAngle,
        h,
        intent === 'flee' ? 5 : 3,
      );
      this.pitch = smoothAngle(
        this.pitch,
        p.pitch * (body.facing < 0 ? -1 : 1),
        h,
        4,
      );
    }
    if(!alive)this.pitch=smoothAngle(this.pitch,0,h,4);
    this.container.position.set(x, y+(motion?.bob??0)*length/Math.max(cBetta.epsilon,motion?.sizeCm??1));
    this.container.scale.set(length / 104, (length / 104) * (alive ? 1 : -1));
    this.container.tint = alive ? (lit ? 0xffffff : 0x7694ad) : 0xa0a0a0;
    const nibble=alive&&intent==='eat'?Math.max(0,Math.sin(this.animationSeconds*7))*.7:0;
    const faces: Face[] = [],
      t = p.phase,
      fin = (1 - 0.5 * damage)*(motion?.mode==='flare'?cBetta.flareScale:1);
    const sp = this.species,
      betta = !sp || sp.id === 'betta',
      tall = sp?.traits.includes('tall'),
      eel = sp?.traits.includes('eel_like');
    const profile=sp?appearance[sp.id as keyof typeof appearance]:undefined;
    const bodyHeight = profile?.height??(tall ? 2.1 : eel ? 0.48 : betta ? 1 : 0.78);
    const main = betta
      ? 0xb95c48
      : Number.parseInt(sp!.color.slice(1), 16);
    const accent = betta
      ? 0x5866a1
      : Number.parseInt(sp!.accent.slice(1), 16);
    const dark = lerpColor(main, 0x152e36, 0.35),
      light = lerpColor(main, 0xd6dfc5, 0.17);
    const point = (px: number, py: number, pz = 0): Point3 => ({
      x: px+(px>29?nibble:0),
      y: py * bodyHeight,
      z: pz,
    });
    const face = (points: Point3[], color: number, alpha = 1) =>
      faces.push({ points, color, alpha });
    // Body cross-sections have real thickness; the head remains visible through front and three-quarter views.
    const xs = [-28, -22, -14, -5, 5, 14, 22, 29, 34];
    const radii = [2, 5, 8, 10, 11, 10, 8, 5, 2.2];
    const radialSegments = length < 28 ? 8 : 14;
    for (let i = 0; i < xs.length - 1; i++)
      for (let j = 0; j < radialSegments; j++) {
        const ring = (k: number, a: number) =>
          point(
            xs[k]!,
            Math.sin(a) * radii[k]!,
            Math.cos(a) * radii[k]! * 0.67,
          );
        const a = (j / radialSegments) * Math.PI * 2,
          b = ((j + 1) / radialSegments) * Math.PI * 2;
        const shade =
          0.4 +
          0.32 * Math.max(0, -Math.sin((a + b) / 2)) +
          0.18 * Math.max(0, -Math.cos((a + b) / 2));
        face(
          [ring(i, a), ring(i + 1, a), ring(i + 1, b), ring(i, b)],
          lerpColor(dark, light, shade),
        );
      }
    face(
      Array.from({ length: radialSegments }, (_, j) =>
        point(
          34,
          Math.sin((j / radialSegments) * Math.PI * 2) * 2.2,
          Math.cos((j / radialSegments) * Math.PI * 2) * 1.5,
        ),
      ),
      main,
    );
    // Caudal membrane: each radial strip bends in depth with a traveling wave.
    const finSegments = length < 28 ? 12 : 24;
    const root = point(-27, 0),
      rim: Point3[] = [];
    for (let i = 0; i <= finSegments; i++) {
      const a =
        (betta || sp?.longFins ? 2 : 2.3) +
        (i / finSegments) * (betta || sp?.longFins ? 2.28 : 1.68);
      rim.push(
        point(
          -27 + Math.cos(a) * (betta ? 38 : 30) * fin,
          Math.sin(a) * (betta ? 28 : sp?.longFins ? 23 : 13) * fin*(profile?.tail??1) + 2,
          (Math.sin(t - i * 0.19) * (2 + 5 * p.effort)*(motion?p.effort:1)+this.finLag),
        ),
      );
    }
    for (let i = 0; i < finSegments; i++) {
      face(
        [root, rim[i]!, rim[i + 1]!],
        lerpColor(accent, light, i % 4 === 0 ? 0.38 : 0.08),
        0.95,
      );
      const a = rim[i]!,
        b = rim[i + 1]!;
      face(
        [{ x: -27 + (a.x + 27) * 0.72, y: a.y * 0.72, z: a.z * 0.72 }, a, b],
        lerpColor(accent, 0xc3aaab, i % 3 === 0 ? 0.45 : 0.12),
        0.85,
      );
    }
    // Dorsal and anal membranes have their own lag and attachment points.
    for (const side of [-1, 1])
      for (let i = 0; i < 12; i++) {
        const u = i / 12,
          v = (i + 1) / 12;
        const anchor = (s: number) => point(-23 + s * 43, side * 7, 0);
        const edge = (s: number) =>
          point(
            -25 + s * 40,
            side *
              (8 + Math.sin(Math.PI * s) * (betta ? 19 : tall ? 15 : 6) * fin),
            Math.sin(t * 1.1 - s * 4 + side) * (1.5 + 2 * p.effort),
          );
        face(
          [anchor(u), edge(u), edge(v), anchor(v)],
          lerpColor(accent, light, i % 3 ? 0.12 : 0.4),
          0.95,
        );
      }
    // Pectorals, eyes and gills live on both sides and are depth sorted with the body.
    for (const side of [-1, 1]) {
      const z = side * 6.2,
        flap = Math.sin(this.animationSeconds*cBetta.pectoralHz*Math.PI*2 + side) * 4;
      face(
        [
          point(12, 0, z),
          point(3, 9, z + side * (4 + flap)),
          point(12, 14, z + side * 3),
          point(17, 3, z),
        ],
        lerpColor(light, 0xc3d9cc, 0.4),
        0.65,
      );
      if (side * Math.cos(this.yaw) < 0.2) {
        const disc = (
          cx: number,
          cy: number,
          r: number,
          zz: number,
          color: number,
        ) =>
          face(
            Array.from({ length: 12 }, (_, i) =>
              point(
                cx + Math.cos((i / 12) * Math.PI * 2) * r,
                cy + Math.sin((i / 12) * Math.PI * 2) * r,
                zz,
              ),
            ),
            color,
          );
        disc(25, -2, 3.1, side * 4.9, 0xc3b98d);
        disc(25.6, -2, 2.0, side * 5.1, 0x10242f);
        disc(25, -3, 0.7, side * 5.3, 0xf4e9d4);
        face(
          [
            point(16, -7, z),
            point(14, 1, z + side * 0.2),
            point(16, 6, z),
            point(16.8, 1, z + side * (0.2+Math.sin(this.animationSeconds*2)*.25)),
          ],
          0x193b50,
        );
      }
      if (betta || tall || sp?.id === 'honey_gourami')
        for (let i = 0; i < 7; i++) {
          const q = i / 6;
          face(
            [
              point(15, 6, side * 4),
              point(
                13 + q * 2,
                6 + q * 18,
                side * (4 + Math.sin(t - q * 3) * q),
              ),
              point(14 + q * 2, 8 + q * 18, side * 4),
            ],
            0xc38c9a,
            0.9,
          );
        }
    }
    if (!betta)
      for (const side of [-1, 1]) {
        const neon = profile?.pattern==='neon';
        const stripe = Array.from({ length: 7 }, (_, i) => {
          const x = -18 + i * 7;
          return point(x, -1, side * (6.4 - Math.abs(x) * 0.04));
        });
        const lower = [...stripe]
          .reverse()
          .map((q) => ({ ...q, y: q.y + 2 * bodyHeight }));
        face([...stripe, ...lower], neon ? 0x7bcece : accent, 0.9);
        if (neon)
          face(
            [
              point(-24, 2, side * 4),
              point(3, 2, side * 6.5),
              point(3, 7, side * 5.5),
              point(-24, 5, side * 4),
            ],
            0xa75b58,
          );
        if (sp?.id === 'corydoras_paleatus')
          for (let i = 0; i < 6; i++) {
            const x = -17 + i * 7;
            face(
              [
                point(x, -6, side * 6),
                point(x + 3, 0, side * 7),
                point(x, 6, side * 6),
                point(x - 2, 0, side * 7),
              ],
              dark,
              0.8,
            );
          }
      }
    if(!betta&&profile)for(const side of [-1,1]){
      if(profile.pattern==='bars')for(const x of [-17,-5,8,20])face([point(x-2,-7,side*6),point(x+2,-7,side*6),point(x+3,8,side*6),point(x-1,8,side*6)],0x233443,.9);
      if(profile.pattern==='lines')for(const y of [-5,0,5])face([point(-22,y,side*6),point(23,y,side*6),point(23,y+1.3,side*6),point(-22,y+1.3,side*6)],accent,.95);
      if(profile.pattern==='wedge')face([point(-24,0,side*6),point(1,-6,side*7),point(1,8,side*7)],0x263343);
      if(profile.pattern==='spots')for(let i=0;i<9;i++){const x=-17+(i%3)*12,y=-5+Math.floor(i/3)*5;face([point(x-1,y-1,side*7),point(x+1,y-1,side*7),point(x+1,y+1,side*7),point(x-1,y+1,side*7)],accent,.85);}
      if(profile.pattern==='gold'){
        face([point(-22,1,side*7),point(15,1,side*7),point(10,8,side*6),point(-19,6,side*6)],0xffd5a0,.85);
        face([point(-27,0,side*3),point(-59,-18,side*8+Math.sin(t)*3),point(-48,2,side*7),point(-61,19,side*8),point(-27,4,side*3)],accent,.8);
      }
      if(sp?.id.includes('cory')||sp?.id==='ancistrus')for(const by of [2,5])face([point(31,by,side*2),point(38,by+4+Math.sin(t)*.5,side*3),point(36,by+3,side*3)],0xd3c7a4,.85);
      if(profile.pattern==='sword')face([point(-27,5),point(-76,23,Math.sin(t)*3),point(-44,9)],accent,.9);
    }
    const projected = faces.map((f) => ({
      ...f,
      points: f.points.map((q) =>
        projectFish(q, this.yaw, this.pitch, t, p.effort,motion?p.effort:1),
      ),
    }));
    projected.sort(
      (a, b) =>
        b.points.reduce((s, q) => s + q.z, 0) / b.points.length -
        a.points.reduce((s, q) => s + q.z, 0) / a.points.length,
    );
    this.g.clear();
    for (const f of projected)
      this.g
        .poly(f.points.flatMap((q) => [q.x, q.y]))
        .fill({ color: f.color, alpha: f.alpha ?? 1 });
  }
  destroy(): void {
    this.container.destroy({ children: true });
  }
}
