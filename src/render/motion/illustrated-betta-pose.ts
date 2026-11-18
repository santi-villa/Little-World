import config from "../../data/illustrated-betta.json";
import type { BettaDynamics } from "./betta-dynamics";
import type { FishBody } from "./fish-motion";
import { angleDiff } from "./steering";

export type FinName = "tail" | "dorsal" | "anal";
export interface MouthTarget {
  x: number;
  y: number;
  distance: number;
}
export interface IllustratedInput {
  body: Readonly<FishBody>;
  motion?: Pick<BettaDynamics, "mode" | "stroke" | "pitch" | "force">;
  lengthCm: number;
  alive: boolean;
  condition: number;
  current: { x: number; y: number };
  food?: MouthTarget;
}
const clamp = (x: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, x));
const ease = (current: number, target: number, dt: number, rate: number) =>
  current + (target - current) * (1 - Math.exp(-dt * rate));
/** Visual-only articulated pose. Reads the physical body, never steers it or changes needs. */
export class IllustratedBettaPose {
  yaw: number;
  pitch = 0;
  phase = 0;
  effort = 0;
  frequency = 0;
  head = 0;
  body = 0;
  rear = 0;
  tail = 0;
  pectoral = 0;
  breath = 0;
  nibble = 0;
  flare = 0;
  turnRate = 0;
  seconds = 0;
  readonly fins: Record<FinName, Float64Array>;
  private velocities: Record<FinName, Float64Array>;
  private previousSpeed: number | undefined;
  private previousHeading: number | undefined;
  private nibbleAt = -Infinity;
  private pectoralPhase = 0;
  private breathPhase = 0;
  constructor(facing = 1, seed = 0) {
    this.yaw = facing < 0 ? Math.PI : 0;
    this.phase = seed * 2.399;
    this.fins = {
      tail: new Float64Array(config.pose.finNodes),
      dorsal: new Float64Array(config.pose.finNodes),
      anal: new Float64Array(config.pose.finNodes),
    };
    this.velocities = {
      tail: new Float64Array(config.pose.finNodes),
      dorsal: new Float64Array(config.pose.finNodes),
      anal: new Float64Array(config.pose.finNodes),
    };
  }
  update(dt: number, input: IllustratedInput): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const c = config.pose,
      elapsed = Math.min(c.maxDelta, dt),
      b = input.body,
      speed = Math.hypot(b.vx, b.vy),
      L = Math.max(0.1, input.lengthCm * config.bodyFraction);
    const acceleration = clamp(
      (speed - (this.previousSpeed ?? speed)) / elapsed,
      -L * 10,
      L * 10,
    );
    const angular = clamp(
      angleDiff(b.heading, this.previousHeading ?? b.heading) / elapsed,
      -4,
      4,
    );
    this.previousSpeed = speed;
    this.previousHeading = b.heading;
    const resting = input.motion?.mode === "sleep",
      startled = input.motion?.mode === "startle",
      burst = input.motion?.stroke === "burst";
    const effortTarget = input.alive
      ? resting
        ? 0.01
        : clamp(
            (burst ? 0.45 : 0.015) +
              (burst
                ? Math.min(
                    0.15,
                    (Math.hypot(
                      input.motion?.force.x ?? 0,
                      input.motion?.force.y ?? 0,
                    ) /
                      L) *
                      0.02,
                  )
                : 0) +
              (Math.max(0, acceleration) / L) * 0.18 +
              (burst ? (speed / L) * 0.25 : 0) +
              (startled ? 0.2 : 0),
            0,
            1,
          ) * input.condition
      : 0;
    let remaining = elapsed;
    while (remaining > 1e-8) {
      const h = Math.min(c.stepSeconds, remaining);
      remaining -= h;
      this.effort = ease(this.effort, effortTarget, h, c.effortEase);
      this.frequency = ease(
        this.frequency,
        input.alive
          ? c.baseHz + this.effort * (startled ? c.startleHz : c.strokeHz)
          : 0,
        h,
        c.frequencyEase,
      );
      if (input.alive) {
        this.seconds += h;
        this.phase += h * this.frequency * Math.PI * 2;
      }
      this.turnRate = ease(this.turnRate, input.alive ? angular : 0, h, 6);
      const targetYaw = b.facing < 0 ? Math.PI : 0;
      if (input.alive)
        this.yaw +=
          angleDiff(targetYaw, this.yaw) * (1 - Math.exp(-h * c.turnEase));
      const foodClose =
        !!input.food && input.food.distance < input.lengthCm * 0.65;
      const foodPitch = foodClose
        ? clamp(
            Math.atan2(
              input.food!.y - b.y,
              Math.max(0.1, Math.abs(input.food!.x - b.x)),
            ),
            -0.7,
            0.7,
          )
        : undefined;
      this.pitch = ease(
        this.pitch,
        input.alive ? (foodPitch ?? input.motion?.pitch ?? 0) : 0,
        h,
        c.pitchEase,
      );
      const amplitude = resting ? 0.002 : 0.012 + 0.095 * this.effort;
      const wave = Math.sin(this.phase),
        curve = clamp(this.turnRate * 0.05, -0.13, 0.13);
      this.head = ease(
        this.head,
        clamp(curve * 0.25, -c.headLimit, c.headLimit),
        h,
        c.jointEase,
      );
      this.body = ease(
        this.body,
        clamp(-wave * amplitude * 0.25 + curve * 0.3, -0.08, 0.08),
        h,
        c.jointEase,
      );
      this.rear = ease(
        this.rear,
        clamp(
          Math.sin(this.phase - 0.65) * amplitude + curve * 0.7,
          -c.jointLimit,
          c.jointLimit,
        ),
        h,
        c.jointEase,
      );
      this.tail = ease(
        this.tail,
        clamp(
          Math.sin(this.phase - 1.3) * amplitude * 1.65 + curve,
          -c.jointLimit,
          c.jointLimit,
        ),
        h,
        c.jointEase,
      );
      this.flare = ease(
        this.flare,
        input.alive && input.motion?.mode === "flare" ? 1 : 0,
        h,
        4,
      );
      if (input.alive) {
        this.pectoralPhase +=
          h * Math.PI * 2 * (resting ? 0.65 : 1.8 + this.effort * 1.9);
        this.breathPhase += h * Math.PI * 2 * (c.breathHz + this.effort * 0.3);
      }
      this.pectoral = input.alive
        ? Math.sin(this.pectoralPhase) *
          (resting ? 0.04 : 0.13 + 0.1 * this.effort)
        : 0;
      this.breath = input.alive ? Math.sin(this.breathPhase) * 0.5 + 0.5 : 0;
      if (
        input.alive &&
        foodClose &&
        this.seconds - this.nibbleAt > c.nibbleSeconds
      )
        this.nibbleAt = this.seconds;
      this.nibble =
        input.alive && foodClose
          ? Math.max(
              0,
              Math.sin(
                Math.min(1, (this.seconds - this.nibbleAt) / 0.22) * Math.PI,
              ),
            )
          : 0;
      for (const [name, offsets] of Object.entries(this.fins) as [
        FinName,
        Float64Array,
      ][]) {
        const v = this.velocities[name],
          lag = name === "tail" ? 1.2 : name === "dorsal" ? 0.5 : 0.9;
        const drag = clamp((input.current.x - b.vx) / L, -3, 3),
          inertia = clamp(-acceleration / L, -2, 2);
        for (let i = 1; i < offsets.length; i++) {
          const free = i / (offsets.length - 1),
            activity = input.alive
              ? resting
                ? 0.015
                : 0.08 + this.effort * 0.9
              : 0;
          const target =
            (Math.sin(this.phase - lag - free * 2.5) * activity * 3 +
              drag * 0.45 +
              inertia * 0.5 +
              this.turnRate * 0.45) *
            free *
            free;
          const neighbors =
            (offsets[i - 1]! + (offsets[i + 1] ?? offsets[i]!)) * 0.5 -
            offsets[i]!;
          v[i] = clamp(
            v[i]! +
              (c.spring * (target - offsets[i]!) +
                c.coupling * neighbors -
                c.damping * v[i]!) *
                h,
            -c.finSpeedLimit,
            c.finSpeedLimit,
          );
          offsets[i] = clamp(offsets[i]! + v[i]! * h, -c.finLimit, c.finLimit);
        }
        offsets[0] = 0;
        v[0] = 0;
      }
    }
  }
  fin(name: FinName, free: number): number {
    const nodes = this.fins[name],
      s = clamp(free, 0, 1) * (nodes.length - 1),
      i = Math.min(nodes.length - 2, Math.floor(s));
    return nodes[i]! + (nodes[i + 1]! - nodes[i]!) * (s - i);
  }
}

export interface RigPoint {
  x: number;
  y: number;
  z: number;
}
const rotate = (x: number, y: number, angle: number) => ({
  x: x * Math.cos(angle) - y * Math.sin(angle),
  y: x * Math.sin(angle) + y * Math.cos(angle),
});
/** Shared skinning across overlapping body/head crops keeps the same seam positions. */
export function skinBettaPoint(
  x: number,
  y: number,
  p: IllustratedBettaPose,
): { x: number; y: number } {
  const r = config.rig,
    headAngle = p.head,
    bodyAngle = headAngle + p.body,
    rearAngle = bodyAngle + p.rear;
  const bodyPivot = rotate(r.rear - r.head, 0, bodyAngle);
  const head = rotate(x - r.head, y, headAngle),
    body = rotate(x - r.head, y, bodyAngle),
    rear = rotate(x - r.rear, y, rearAngle);
  const h = { x: head.x + r.head, y: head.y },
    b = { x: body.x + r.head, y: body.y },
    t = { x: rear.x + r.head + bodyPivot.x, y: rear.y + bodyPivot.y };
  const blend = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    v: number,
  ) => {
    const s = clamp(v, 0, 1),
      w = s * s * (3 - 2 * s);
    return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w };
  };
  return x > r.body
    ? blend(b, h, (x - r.body) / (r.head - r.body))
    : blend(
        t,
        b,
        (x - r.rear + r.blendWidth) / (r.body - r.rear + r.blendWidth),
      );
}
/** Orthographic thickness during turns, without switching an image's scale sign. */
export function projectIllustratedPoint(
  p: RigPoint,
  pose: IllustratedBettaPose,
): RigPoint {
  const co = Math.cos(pose.yaw),
    si = Math.sin(pose.yaw),
    pitch = pose.pitch * co;
  const x = p.x * co + p.z * si,
    z = -p.x * si + p.z * co;
  return {
    x: x * Math.cos(pitch) - p.y * Math.sin(pitch),
    y: x * Math.sin(pitch) + p.y * Math.cos(pitch),
    z,
  };
}
