/** Fórmulas puras de química y física del agua. Sin estado. */

import type { SimConfig } from './config';

/**
 * Fracción en masa de nitrógeno de cada compuesto. El estado guarda ppm del
 * compuesto (como un test), pero la cuenta del ciclo se hace en nitrógeno:
 * 1 mg de N de amoníaco se convierte en 1 mg de N de nitrito y después en
 * 1 mg de N de nitrato.
 */
export const NITROGEN_FRACTION = {
  ammonia: 14.007 / 17.031, // NH3
  nitrite: 14.007 / 46.005, // NO2-
  nitrate: 14.007 / 62.004, // NO3-
} as const;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Saturación tipo Monod: 0 sin sustrato, tiende a 1 con mucho. */
export function monod(concentration: number, halfSaturation: number): number {
  if (concentration <= 0) return 0;
  return concentration / (halfSaturation + concentration);
}

/** Fracción que reacciona en dt con una cinética de primer orden (siempre estable). */
export function firstOrderFraction(ratePerDay: number, dtDays: number): number {
  return 1 - Math.exp(-ratePerDay * dtDays);
}

/**
 * Fracción del amoníaco total que está como NH3 libre (la forma tóxica).
 * Emerson et al. 1975: pKa = 0.09018 + 2729.92 / T(K).
 * Sube con el pH (x10 por cada punto) y con la temperatura.
 */
export function freeAmmoniaFraction(ph: number, temperatureC: number): number {
  const pKa = 0.09018 + 2729.92 / (temperatureC + 273.15);
  return 1 / (1 + Math.pow(10, pKa - ph));
}

/** Oxígeno disuelto de saturación en agua dulce a nivel del mar, mg/L. */
export function oxygenSaturation(temperatureC: number): number {
  const t = clamp(temperatureC, 0, 45);
  return 14.62 - 0.3898 * t + 0.006969 * t * t - 0.00005897 * t * t * t;
}

/**
 * pH a partir del KH y el CO2 disuelto (equilibrio de carbonatos):
 * CO2 = 3 * KH * 10^(7 - pH)  =>  pH = 7 + log10(3 * KH / CO2).
 * Sin KH no hay tampón y el pH se desploma ("crash de pH").
 */
export function phFromKhCo2(kh: number, co2: number, config: SimConfig): number {
  const effectiveKh = Math.max(kh, config.ph.khFloor);
  const effectiveCo2 = Math.max(co2, 0.01);
  const ph = 7 + Math.log10((3 * effectiveKh) / effectiveCo2);
  return clamp(ph, config.ph.min, config.ph.max);
}

/** Presión de vapor de saturación del agua, kPa (Tetens). */
export function saturationVaporPressure(temperatureC: number): number {
  return 0.6108 * Math.exp((17.27 * temperatureC) / (temperatureC + 237.3));
}

/**
 * Factor de actividad biológica según la temperatura: 1 a la temperatura de
 * referencia, crece hasta el óptimo y cae a 0 en el máximo.
 */
export function temperatureFactor(temperatureC: number, config: SimConfig): number {
  const t = config.nitrogen.temperature;
  if (temperatureC <= 0 || temperatureC >= t.maxC) return 0;
  const base = Math.pow(t.theta, Math.min(temperatureC, t.optimumC) - t.referenceC);
  if (temperatureC <= t.optimumC) return base;
  return base * (1 - (temperatureC - t.optimumC) / (t.maxC - t.optimumC));
}

/** Factor de actividad de las nitrificantes según el pH (se frenan en agua ácida). */
export function nitrifierPhFactor(ph: number, config: SimConfig): number {
  const f = config.nitrogen.phFactor;
  return clamp((ph - f.zeroBelow) / (f.fullAbove - f.zeroBelow), 0, 1);
}

/** Índice 0..1 de toxicidad por NH3 libre (0 = seguro, 1 = letal). */
export function ammoniaToxicity(nh3Ppm: number, config: SimConfig): number {
  const { nh3SafePpm, nh3LethalPpm } = config.toxicity;
  return clamp((nh3Ppm - nh3SafePpm) / (nh3LethalPpm - nh3SafePpm), 0, 1);
}
