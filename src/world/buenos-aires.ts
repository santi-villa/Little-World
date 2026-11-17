/** Local calendar and solar approximation for Buenos Aires (no browser dependencies). */
export const BA = { latitude: -34.6037, longitude: -58.3816, timezone: 'America/Argentina/Buenos_Aires' };
export type Season = 'summer' | 'autumn' | 'winter' | 'spring';
const localFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: BA.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function buenosAiresDate(nowMs: number): { year: number; month: number; day: number; hour: number; date: string } {
  const parts = localFormatter.formatToParts(nowMs);
  const get = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find(p => p.type === type)?.value);
  const year = get('year'), month = get('month'), day = get('day');
  return { year, month, day, hour: get('hour') + get('minute') / 60, date: `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}` };
}
/** Meteorological seasons in the Southern Hemisphere. No snow in a BA winter. */
export function seasonOf(month: number): Season {
  return month === 12 || month <= 2 ? 'summer' : month <= 5 ? 'autumn' : month <= 8 ? 'winter' : 'spring';
}
export function approximateSun(nowMs: number): { sunrise: number; sunset: number } {
  const d = buenosAiresDate(nowMs);
  const ordinal = (Date.UTC(d.year,d.month-1,d.day) - Date.UTC(d.year,0,0)) / 86400000;
  const rad = Math.PI / 180;
  const declination = 23.44 * Math.sin(rad * 360 * (ordinal - 81) / 365);
  const hourAngle = Math.acos(-Math.tan(BA.latitude * rad) * Math.tan(declination * rad)) / rad;
  const b = 2 * Math.PI * (ordinal - 81) / 364;
  const equation = 9.87 * Math.sin(2*b) - 7.53*Math.cos(b) - 1.5*Math.sin(b);
  const noonHour = 12 - BA.longitude / 15 - 3 - equation / 60;
  const midnight = Date.UTC(d.year,d.month-1,d.day,3);
  return { sunrise: midnight + (noonHour-hourAngle/15)*3600000, sunset: midnight + (noonHour+hourAngle/15)*3600000 };
}
export function solarLight(nowMs: number, sunrise: number, sunset: number): { daylight: number; twilight: number; sunProgress: number } {
  const dawn = (nowMs-sunrise)/3600000, dusk=(sunset-nowMs)/3600000;
  const edge = Math.min(dawn,dusk);
  const daylight = Math.max(0, Math.min(1,(edge+0.5)/1.25));
  return { daylight, twilight: Math.max(0,1-Math.abs(edge)/0.9), sunProgress: Math.max(0,Math.min(1,(nowMs-sunrise)/(sunset-sunrise))) };
}
