import ecosystem from '../../data/ecosystem.json';
import defaults from '../../data/motion-betta.json';
import type { FishBody, MotionAnimal, MotionInput } from './fish-motion';
import { angleDiff, containment } from './steering';
import { resolveHabitat } from './habitat';
export const bettaParameters = { ...defaults };
export type BettaMode =
  'wander' | 'investigate' | 'breathe' | 'food' | 'startle' | 'sleep' | 'flare';
export class BettaDynamics {
  sizeCm = 1;
  breathRingAt = -Infinity;
  flareUntil = 0;
  private nextBreath = 0;
  private modeUntil = 0;
  private scareLatch = false;
  private previousFood = false;
  private foodUntil = 0;
  triggerFlare(time: number): void {
    this.flareUntil = time + bettaParameters.flareSeconds;
  }
  mode: BettaMode = 'wander';
  stroke: 'burst' | 'glide' | 'float' = 'float';
  pitch = 0;
  bob = 0;
  phase = 0;
  force = { x: 0, y: 0 };
  private cycle = 0;
  private goalAt = 0;
  update(
    b: FishBody,
    a: MotionAnimal,
    dt: number,
    input: MotionInput,
    time: number,
    random: () => number,
  ): void {
    const c = bettaParameters,
      L = Math.max(c.epsilon, a.sizeCm * c.bodyFraction),
      bounds = input.bounds;
    this.sizeCm = a.sizeCm;
    if (!this.nextBreath)
      this.nextBreath =
        time +
        c.breatheMinSeconds +
        random() * (c.breatheMaxSeconds - c.breatheMinSeconds);
    const scared =
      a.intent === 'flee' ||
      !!input.scare ||
      !!(
        input.hand &&
        input.hand.age < c.handRecentSeconds &&
        input.hand.speed > c.handShadowSpeed
      );
    if (scared && !this.scareLatch) {
      this.mode = 'startle';
      this.modeUntil = time + c.startleSeconds;
      this.cycle = 0;
      const from = input.scare ?? input.trackingTargets?.get(a.targetId??-1)??
        input.hand ?? { x: bounds.width / 2, y: bounds.height / 2 };
      b.goalX = b.x + (b.x - from.x);
      b.goalY = b.y + (b.y - from.y);
    }
    this.scareLatch = scared;
    const food = input.food.surface || input.food.sinking;
    if (food && !this.previousFood)
      this.foodUntil = time + c.investigateSeconds;
    this.previousFood = food;
    if (this.mode === 'startle' && time < this.modeUntil) {
      /* Finish the short escape before another intention. */
    } else if (a.intent === 'rest'||a.intent==='hide') {
      this.mode = 'sleep';
      b.goalX = bounds.width * c.zoneTop;
      b.goalY = bounds.height * c.sleepFraction;
      const refuge = input.habitat?.refuges[0];
      if (refuge) {
        b.goalX = refuge.x * bounds.width;
        b.goalY = refuge.y * bounds.height;
      }
    } else if (a.intent === 'gasp') {
      this.mode = 'breathe';
      b.goalX = b.x;
      b.goalY = bounds.height * c.surfaceFraction;
      this.modeUntil = Infinity;
    } else if (food && (a.intent === 'eat' || time < this.foodUntil)) {
      this.mode = 'food';
      const targets=(input.food.targets??[]).filter(p=>p.layer!==2),closest=targets.reduce<{x:number;y:number}|undefined>((best,p)=>!best||Math.hypot(p.x-b.x,p.y-b.y)<Math.hypot(best.x-b.x,best.y-b.y)?p:best,undefined);
      b.goalX = closest?.x??input.food.x;
      b.goalY = closest?.y??
        bounds.height * (input.food.surface ? c.surfaceFraction : c.zoneBottom);
    } else if ((a.intent==='chase'||a.intent==='court')&&input.trackingTargets?.has(a.targetId??-1)){const target=input.trackingTargets.get(a.targetId!)!;this.mode='investigate';b.goalX=target.x+(a.intent==='court'?Math.cos(time+b.phase)*L:0);b.goalY=target.y+(a.intent==='court'?Math.sin(time+b.phase)*L:0);this.modeUntil=time+1;
    } else if (input.hand&&input.hand.age<1&&input.hand.speed<15&&(a.feedingTrust??0)>.4&&a.fright<.1&&Math.sin(time*.07+b.phase)>.92){this.mode='investigate';b.goalX=input.hand.x;b.goalY=input.hand.y;this.modeUntil=time+1;
    } else if (time < this.flareUntil) {
      this.mode = 'flare';
    } else if (this.mode === 'breathe') {
      if (
        this.modeUntil === Infinity &&
        Math.abs(b.y - b.goalY) < L * c.arriveLengths
      ) {
        this.breathRingAt = time;
        this.modeUntil = time + c.breatheSeconds;
      }
      if (time >= this.modeUntil) {
        this.mode = 'wander';
        this.goalAt = 0;
        this.nextBreath =
          time +
          c.breatheMinSeconds +
          random() * (c.breatheMaxSeconds - c.breatheMinSeconds);
      }
    } else if (time >= this.nextBreath) {
      this.mode = 'breathe';
      this.modeUntil = Infinity;
      b.goalX = b.x;
      b.goalY = bounds.height * c.surfaceFraction;
    } else if (this.mode === 'investigate' && time < this.modeUntil) {
      /* Pause at the selected feature. */
    } else {
      if (this.mode !== 'wander') this.goalAt = 0;
      this.mode = 'wander';
      const features = [
        ...(input.habitat?.refuges ?? []),
        ...(input.habitat?.leaves ?? []),
      ];
      if (
        time >= this.goalAt &&
        features.length &&
        random() < c.investigateChance
      ) {
        const feature = features[Math.floor(random() * features.length)]!;
        this.mode = 'investigate';
        this.modeUntil = time + c.investigateSeconds;
        b.goalX = feature.x * bounds.width;
        b.goalY = feature.y * bounds.height;
        this.goalAt = this.modeUntil;
      }
    }
    if (this.mode === 'wander' && time >= this.goalAt) {
      b.goalX = L + (bounds.width - 2 * L) * random();
      b.goalY =
        bounds.height * (c.zoneTop + (c.zoneBottom - c.zoneTop) * random());
      this.goalAt =
        time +
        c.goalMinSeconds +
        random() * (c.goalMaxSeconds - c.goalMinSeconds);
    }
    if (this.mode !== 'wander')
      this.goalAt = Math.max(this.goalAt, time + c.goalMinSeconds);
    this.cycle += dt;
    const period = c.burstSeconds + c.glideSeconds + c.floatSeconds,
      at = this.cycle % period;
    this.stroke =
      at < c.burstSeconds
        ? 'burst'
        : at < c.burstSeconds + c.glideSeconds
          ? 'glide'
          : 'float';
    const arrived =
      Math.hypot(b.goalX - b.x, b.goalY - b.y) < L * c.arriveLengths;
    if (this.mode === 'startle' && time < this.modeUntil)
      this.stroke =
        time < this.modeUntil - c.startleSeconds + c.burstSeconds
          ? 'burst'
          : 'glide';
    else if (
      ['breathe', 'food', 'sleep', 'investigate'].includes(this.mode) &&
      !arrived
    )
      this.stroke = 'burst';
    if (arrived || this.mode === 'flare') this.stroke = 'float';
    let remaining = Math.min(c.maxDelta, Math.max(0, dt));
    while (remaining > 0) {
      const h = Math.min(c.stepSeconds, remaining);
      remaining -= h;
      const angle = Math.atan2(b.goalY - b.y, b.goalX - b.x),
        turn = Math.max(
          ((-c.maxTurnDegS * Math.PI) / 180) * h,
          Math.min(
            ((c.maxTurnDegS * Math.PI) / 180) * h,
            angleDiff(angle, b.heading),
          ),
        );
      b.heading += turn;
      const speed = Math.hypot(b.vx, b.vy),
        cap =
          L * (this.mode === 'startle' ? c.burstLengthsS : c.cruiseLengthsS)*(a.condition??1),
        thrust =
          this.stroke === 'burst' && speed < cap
            ? (this.mode === 'startle' ? c.burstThrust : c.thrust) * L*(a.condition??1)
            : 0;
      const wall = containment(b, bounds, L * c.wallLengths, c.wallForce * L);
      let fx = Math.cos(b.heading) * thrust + wall.x,
        fy =
          Math.sin(b.heading) * thrust +
          (['food', 'breathe'].includes(this.mode) ? 0 : wall.y);
      for (const o of input.habitat?.obstacles ?? []) {
        const rx = o.rx * bounds.width + L * c.wallLengths,
          ry = o.ry * bounds.height + L * c.wallLengths,
          dx = (b.x - o.x * bounds.width) / rx,
          dy = (b.y - o.y * bounds.height) / ry,
          d = Math.hypot(dx, dy);
        if (d < 1 && d > c.epsilon) {
          fx += (dx / d) * (1 - d) * c.obstacleForce * L;
          fy += (dy / d) * (1 - d) * c.obstacleForce * L;
        }
      }
      if(input.water){const current=input.water.getWaterVelocity(b.x,b.y);fx+=current.x*ecosystem.flow.fishCoupling;fy+=current.y*ecosystem.flow.fishCoupling;}
      this.force = { x: fx, y: fy };
      b.vx += ((fx - c.drag * speed * b.vx) / c.mass) * h;
      b.vy += ((fy - c.drag * speed * b.vy) / c.mass) * h;
      if (this.stroke !== 'burst') {
        b.vx *= Math.exp(-c.glideDrag * h);
        b.vy *= Math.exp(-c.glideDrag * h);
      }
      const v = Math.hypot(b.vx, b.vy),
        limit = L * c.burstLengthsS*(a.condition??1);
      if (v > limit) {
        b.vx *= limit / v;
        b.vy *= limit / v;
      }
      b.x += b.vx * h;
      b.y += b.vy * h;
      const safe = resolveHabitat(
        b.x,
        b.y,
        input.habitat ?? { obstacles: [], leaves: [], refuges: [] },
        bounds.width,
        bounds.height,
        ['breathe', 'food'].includes(this.mode) ? 0 : L * c.collisionMargin,
      );
      b.x = safe.x;
      b.y = safe.y;
      if(input.water?.constrain){const p=input.water.constrain(b.x,b.y,L*c.collisionMargin);b.x=p.x;b.y=p.y;}
    }
    const pitch = Math.max(
      (-c.pitchMaxDeg * Math.PI) / 180,
      Math.min(
        (c.pitchMaxDeg * Math.PI) / 180,
        Math.atan2(b.vy, Math.max(c.epsilon, Math.abs(b.vx))),
      ),
    );
    this.pitch += (pitch - this.pitch) * (1 - Math.exp(-dt * c.pitchEase));
    this.bob =
      Math.sin(time * Math.PI * 2 * c.floatHz + b.phase) *
      a.sizeCm *
      c.heightFraction *
      c.floatAmplitude *
      (1 + c.noiseAmount * Math.sin(time * c.noiseHz + b.phase));
    this.phase +=
      dt *
      Math.PI *
      2 *
      (this.stroke === 'burst'
        ? this.mode === 'startle'
          ? c.burstTailHz
          : c.tailHz
        : this.stroke === 'glide'
          ? c.glideTailHz
          : 0);
    if (Math.abs(Math.cos(b.heading)) > c.turnMinWidth)
      b.facing = Math.cos(b.heading) < 0 ? -1 : 1;
  }
}
