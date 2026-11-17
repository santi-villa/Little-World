/** Shared lighting for existing art. Shapes and silhouettes stay in the source assets. */
import { lerpColor } from './pixel-utils';
export const ART = { night: 0x424b68, daylight: 0xf5efdf, shadow: 0x172d2b, water: 0x557f7e, food: 0xcda26a } as const;
export function ambientTint(light: number): number { return lerpColor(ART.night, ART.daylight, light); }
export function fishPigment(color: number): number { return lerpColor(color, 0xa39982, 0.12); }
