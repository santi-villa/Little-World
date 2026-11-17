import type { Weather } from '../sim';
import type { OutdoorTemperatureSource } from './outdoor';
import { BA, approximateSun, buenosAiresDate, seasonOf, solarLight, type Season } from './buenos-aires';

export interface WeatherReading {
  observedAt: number; fetchedAt: number; temperatureC: number; code: number;
  cloudCover: number; windKph: number; precipitationMm: number;
  daily: { date: string; sunrise: number; sunset: number }[];
}
export interface OutsideView {
  nowMs: number; season: Season; weather: Weather; temperatureC: number;
  cloudCover: number; windKph: number; precipitationMm: number;
  sunrise: number; sunset: number; daylight: number; twilight: number; sunProgress: number;
  source: 'live' | 'cached' | 'seasonal'; observedAt: number | null;
}
export const WEATHER_CACHE_KEY = 'little-world:weather-buenos-aires:v1';
const REFRESH_MS = 30 * 60000;
const HISTORY_CACHE_MS = 3600000;
export function weatherFromCode(code: number): Weather {
  if (code >= 95) return 'storm';
  if (code >= 51 && code <= 86) return 'rain';
  if (code >= 2) return 'cloudy';
  return 'clear';
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function number(value: unknown, min: number, max: number): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max; }
export function validReading(v: unknown): v is WeatherReading {
  return record(v) && number(v.fetchedAt,0,1e14) && number(v.observedAt,0,1e14) && number(v.temperatureC,-60,60) &&
    number(v.code,0,99) && number(v.cloudCover,0,100) && number(v.windKph,0,500) && number(v.precipitationMm,0,1000) &&
    Array.isArray(v.daily) && v.daily.every(d => record(d) && typeof d.date === 'string' && number(d.sunrise,0,1e14) && number(d.sunset,0,1e14) && d.sunset>d.sunrise);
}
export function parseWeather(raw: unknown, nowMs: number): WeatherReading {
  if (!record(raw) || !record(raw.current) || !record(raw.daily)) throw new Error('Respuesta meteorológica incompleta');
  const c=raw.current,d=raw.daily;
  if (!Array.isArray(d.time) || !Array.isArray(d.sunrise) || !Array.isArray(d.sunset)) throw new Error('Faltan horas solares');
  const reading: WeatherReading = {
    observedAt: Number(c.time)*1000, fetchedAt: nowMs,
    temperatureC: c.temperature_2m as number, code:c.weather_code as number,
    cloudCover:c.cloud_cover as number, windKph:c.wind_speed_10m as number, precipitationMm:c.precipitation as number,
    daily:d.time.map((time,i)=>({ date:buenosAiresDate(Number(time)*1000).date, sunrise:Number((d.sunrise as unknown[])[i])*1000, sunset:Number((d.sunset as unknown[])[i])*1000 })),
  };
  if (!validReading(reading) || Math.abs(reading.observedAt-nowMs)>6*3600000) throw new Error('Datos meteorológicos inválidos o atrasados');
  return reading;
}
async function request(url: URL, fetcher: typeof fetch): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),8000);
  try { const response=await fetcher(url,{signal:controller.signal}); if(!response.ok)throw new Error(`Open-Meteo HTTP ${response.status}`); return await response.json(); }
  finally { clearTimeout(timer); }
}
/** Weather is public modeled data from Open-Meteo, not a sensor in the user's house. */
export class BuenosAiresWeather implements OutdoorTemperatureSource {
  reading: WeatherReading | null = null;
  private pending: Promise<boolean> | null = null;
  private attemptedAt = -Infinity;
  private history = new Map<string,{ at:number; values:number[] }>();
  constructor(private readonly fetcher: typeof fetch = fetch, private readonly storage?: Pick<Storage,'getItem'|'setItem'>) {
    try { const raw:unknown=JSON.parse(storage?.getItem(WEATHER_CACHE_KEY) ?? 'null'); if(validReading(raw))this.reading=raw; } catch { /* Optional persistence. */ }
  }
  refresh(nowMs=Date.now(),force=false): Promise<boolean> {
    if(this.pending)return this.pending;
    if(!force && nowMs-this.attemptedAt<REFRESH_MS)return Promise.resolve(false);
    this.attemptedAt=nowMs;
    const url=new URL('https://api.open-meteo.com/v1/forecast');
    url.search=new URLSearchParams({latitude:String(BA.latitude),longitude:String(BA.longitude),current:'temperature_2m,weather_code,cloud_cover,wind_speed_10m,precipitation',daily:'sunrise,sunset',timezone:BA.timezone,timeformat:'unixtime',forecast_days:'2',wind_speed_unit:'kmh'}).toString();
    this.pending=request(url,this.fetcher).then(raw=>{
      this.reading=parseWeather(raw,nowMs);
      try{this.storage?.setItem(WEATHER_CACHE_KEY,JSON.stringify(this.reading));}catch{/* Storage may be full. */}
      return true;
    }).catch(()=>false).finally(()=>{this.pending=null;});
    return this.pending;
  }
  currentC(nowMs=Date.now()): number { return this.view(nowMs).temperatureC; }
  view(nowMs=Date.now()): OutsideView {
    const date=buenosAiresDate(nowMs),season=seasonOf(date.month);
    const usable=this.reading && nowMs-this.reading.observedAt>=-3600000 && nowMs-this.reading.observedAt<24*3600000 ? this.reading : null;
    const sun=usable?.daily.find(d=>d.date===date.date) ?? approximateSun(nowMs);
    const source=usable ? nowMs-usable.observedAt<90*60000 ? 'live' : 'cached' : 'seasonal';
    return { nowMs,season,source,observedAt:usable?.observedAt??null,
      temperatureC:usable?.temperatureC ?? ({summer:25,autumn:18,winter:12,spring:20}[season]),
      weather:usable ? weatherFromCode(usable.code) : 'clear',cloudCover:usable?.cloudCover??20,
      windKph:usable?.windKph??8,precipitationMm:usable?.precipitationMm??0,
      sunrise:sun.sunrise,sunset:sun.sunset,...solarLight(nowMs,sun.sunrise,sun.sunset) };
  }
  async hourlyC(startMs: number,hours: number): Promise<number[]> {
    if (!Number.isFinite(startMs) || !Number.isFinite(hours) || hours < 0 || hours > 30*24) throw new Error('Intervalo meteorológico inválido');
    const endMs=startMs+(Math.ceil(hours)+1)*3600000;
    const key=`${startMs}:${hours}`;
    let cached=this.history.get(key);
    if(!cached||Date.now()-cached.at>HISTORY_CACHE_MS){
      const cutoffDate=buenosAiresDate(Date.now()-14*86400000);
      const cutoff=Date.UTC(cutoffDate.year,cutoffDate.month-1,cutoffDate.day,3);
      const ranges:{ host:string; start:number; end:number }[]=[];
      if(startMs<cutoff)ranges.push({host:'https://archive-api.open-meteo.com/v1/archive',start:startMs,end:Math.min(endMs,cutoff-1)});
      if(endMs>=cutoff)ranges.push({host:'https://api.open-meteo.com/v1/forecast',start:Math.max(startMs,cutoff),end:endMs});
      const responses=await Promise.all(ranges.map(range=>{
        const url=new URL(range.host);
        url.search=new URLSearchParams({latitude:String(BA.latitude),longitude:String(BA.longitude),hourly:'temperature_2m',timezone:BA.timezone,timeformat:'unixtime',start_date:buenosAiresDate(range.start).date,end_date:buenosAiresDate(range.end).date}).toString();
        return request(url,this.fetcher);
      }));
      const samples=new Map<number,number>();
      for(const raw of responses){
        if(!record(raw)||!record(raw.hourly)||!Array.isArray(raw.hourly.time)||!Array.isArray(raw.hourly.temperature_2m))throw new Error('Histórico incompleto');
        const times=raw.hourly.time as unknown[],temps=raw.hourly.temperature_2m as unknown[];
        times.forEach((time,i)=>{if(number(time,0,1e12)&&number(temps[i],-60,60))samples.set(time,temps[i] as number);});
      }
      const values:number[]=[];
      for(let i=0;i<=Math.ceil(hours);i++) {
        const epoch=(startMs+i*3600000)/1000,lo=Math.floor(epoch/3600)*3600,alpha=(epoch-lo)/3600;
        const a=samples.get(lo),b=samples.get(lo+3600);
        if(a===undefined || (alpha>0 && b===undefined))throw new Error('Histórico no cubre toda la ausencia');
        values.push(a+((b??a)-a)*alpha);
      }
      cached={at:Date.now(),values};
      if(this.history.size>3)this.history.clear();
      this.history.set(key,cached);
    }
    return cached.values;
  }
}
