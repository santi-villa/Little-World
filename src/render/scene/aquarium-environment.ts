import config from '../../data/ambient-aquarium.json';
import { hourOfDay, MINUTES_PER_DAY, MINUTES_PER_HOUR } from '../../sim/clock';
import type { Weather } from '../../sim';
import { buenosAiresDate } from '../../world/buenos-aires';
import type { OutsideView } from '../../world/weather';
import { lerpColor } from '../pixel-utils';

export interface AquariumEnvironment {
  hour: number;
  dayProgress: number;
  phase: 'dawn' | 'morning' | 'afternoon' | 'dusk' | 'night';
  daylight: number;
  twilight: number;
  sunProgress: number;
  natural: number;
  lamp: number;
}

const unit = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => {
  const t = unit(v);
  return t * t * (3 - 2 * t);
};
const hourInBuenosAires = (ms: number) => buenosAiresDate(ms).hour;

export function aquariumEnvironment(
  timeMinutes: number, weather: Weather, lampOn: boolean,
  outside?: Pick<OutsideView, 'sunrise' | 'sunset' | 'cloudCover'>, previewHour?: number | null,
): AquariumEnvironment {
  const hour = hourOfDay(previewHour == null ? timeMinutes : previewHour * MINUTES_PER_HOUR);
  const seasonalSun = config.followBuenosAiresSun ? outside : undefined;
  const sunrise = seasonalSun ? hourInBuenosAires(seasonalSun.sunrise) : config.sunriseHour;
  const sunset = seasonalSun ? hourInBuenosAires(seasonalSun.sunset) : config.sunsetHour;
  const dawn = (hour - sunrise + config.dawn.beforeHours) / (config.dawn.beforeHours + config.dawn.afterHours);
  const dusk = (hour - sunset + config.dusk.beforeHours) / (config.dusk.beforeHours + config.dusk.afterHours);
  const daylight = smooth(dawn) * (1 - smooth(dusk));
  const twilight = Math.sin(Math.PI * unit(dawn)) ** 2 + Math.sin(Math.PI * unit(dusk)) ** 2;
  const phase = dawn <= 0 || dusk >= 1 ? 'night' : dawn < 1 ? 'dawn' : dusk > 0 ? 'dusk'
    : hour < (sunrise + sunset) / 2 ? 'morning' : 'afternoon';
  const clouds = unit((outside?.cloudCover ?? 0) / 100);
  return {
    hour, dayProgress: hour * MINUTES_PER_HOUR / MINUTES_PER_DAY, phase, daylight, twilight,
    sunProgress: unit((hour - sunrise) / Math.max(1, sunset - sunrise)),
    natural: daylight * config.weatherLight[weather] * (1 - clouds * 0.14),
    lamp: Number(lampOn),
  };
}

export function easeEnvironment(previous: AquariumEnvironment | undefined, target: AquariumEnvironment, dt: number): AquariumEnvironment {
  if (!previous) return target;
  const t = 1 - Math.exp(-Math.max(0, dt) * config.transitionPerSecond);
  const step = (a: number, b: number) => a + (b - a) * t;
  return {
    ...target,
    daylight: step(previous.daylight, target.daylight),
    twilight: step(previous.twilight, target.twilight),
    sunProgress: target.daylight === 0 ? previous.sunProgress : step(previous.sunProgress, target.sunProgress),
    natural: step(previous.natural, target.natural),
    lamp: step(previous.lamp, target.lamp),
  };
}

export function roomLightTint(environment: AquariumEnvironment): number {
  const tint = lerpColor(config.room.night, config.room.day, environment.natural);
  return lerpColor(tint, config.room.twilight, environment.twilight * (0.16 + environment.natural * 0.19));
}

export function underwaterLight(environment: Pick<AquariumEnvironment, 'natural' | 'twilight' | 'lamp'>) {
  const { natural, twilight, lamp } = environment;
  const sun = natural * (0.78 + 0.22 * (1 - lamp));
  const color = lerpColor(config.water.sunColor, config.water.twilightColor, twilight);
  return {
    sun, lamp,
    exposure: unit(config.water.dark + natural * config.water.daylight + lamp * config.water.lamp),
    color: lerpColor(color, config.water.lampColor, lamp / Math.max(0.001, sun + lamp)),
  };
}

export type UnderwaterLight = ReturnType<typeof underwaterLight>;

/** Ambient tempo for ordinary swimming, using the existing intent and steering. */
export function swimmingActivity(environment: AquariumEnvironment, group: keyof typeof config.nightActivity): number {
  const night = config.nightActivity[group];
  return night + (1 - night) * environment.daylight;
}
