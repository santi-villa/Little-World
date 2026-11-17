import { describe, expect, it, vi, afterEach } from 'vitest';
import { BA, approximateSun, buenosAiresDate, seasonOf, solarLight } from '../src/world/buenos-aires';
import { BuenosAiresWeather, WEATHER_CACHE_KEY, parseWeather, weatherFromCode } from '../src/world/weather';
const now=Date.parse('2026-11-17T15:00:00Z');
function payload(code=2) {
  return {current:{time:now/1000,temperature_2m:24.1,weather_code:code,cloud_cover:65,wind_speed_10m:18,precipitation:0.5},
    daily:{time:[Date.parse('2026-11-17T03:00:00Z')/1000],sunrise:[Date.parse('2026-11-17T08:37:00Z')/1000],sunset:[Date.parse('2026-11-17T22:39:00Z')/1000]}};
}
const response=(body:unknown)=>Promise.resolve(new Response(JSON.stringify(body),{status:200}));
afterEach(()=>{vi.useRealTimers();});
describe('calendario y sol de Buenos Aires',()=>{
 it('usa la fecha porteña aunque el dispositivo esté en UTC',()=>{
  expect(buenosAiresDate(Date.parse('2026-11-18T01:30:00Z'))).toMatchObject({date:'2026-11-17',hour:22.5});
  expect(BA.timezone).toBe('America/Argentina/Buenos_Aires');
 });
 it('aplica estaciones del hemisferio sur',()=>{
  expect([1,4,7,10].map(seasonOf)).toEqual(['summer','autumn','winter','spring']);
 });
 it('el verano tiene días más largos y la noche no recibe luz solar',()=>{
  const summer=approximateSun(Date.parse('2026-12-21T15:00:00Z'));
  const winter=approximateSun(Date.parse('2026-06-21T15:00:00Z'));
  expect((summer.sunset-summer.sunrise)/3600000).toBeGreaterThan(14);
  expect((winter.sunset-winter.sunrise)/3600000).toBeLessThan(11);
  expect(solarLight(winter.sunrise-3600000,winter.sunrise,winter.sunset).daylight).toBe(0);
  expect(solarLight((winter.sunrise+winter.sunset)/2,winter.sunrise,winter.sunset).daylight).toBe(1);
 });
});
describe('clima real',()=>{
 it('mapea códigos WMO y conserva mediciones y horas solares de la API',()=>{
  expect([0,3,61,95].map(weatherFromCode)).toEqual(['clear','cloudy','rain','storm']);
  const reading=parseWeather(payload(),now);
  expect(reading.temperatureC).toBe(24.1);
  expect(reading.daily[0]!.date).toBe('2026-11-17');
  expect(reading.daily[0]!.sunrise).toBe(Date.parse('2026-11-17T08:37:00Z'));
 });
 it('actualiza sin credenciales y evita solicitudes duplicadas',async()=>{
  const fetcher=vi.fn(()=>response(payload(95)));
  const source=new BuenosAiresWeather(fetcher);
  expect(await source.refresh(now)).toBe(true);
  expect(source.view(now)).toMatchObject({weather:'storm',source:'live',temperatureC:24.1,season:'spring'});
  await source.refresh(now+60000);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const url=fetcher.mock.calls[0] as unknown as [URL];
  expect(url[0].searchParams.get('longitude')).toBe('-58.3816');
 });
 it('conserva caché, diferencia datos viejos y no inventa condiciones actuales',async()=>{
  const storage=new Map<string,string>();
  const port={getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>{storage.set(key,value);}};
  const live=new BuenosAiresWeather(()=>response(payload()),port);
  await live.refresh(now);
  expect(storage.has(WEATHER_CACHE_KEY)).toBe(true);
  const offline=new BuenosAiresWeather(()=>Promise.reject(new Error('offline')),port);
  expect(await offline.refresh(now+7200000)).toBe(false);
  expect(offline.view(now+7200000).source).toBe('cached');
  expect(offline.view(now+2*86400000).source).toBe('seasonal');
  expect(offline.view(now+2*86400000).observedAt).toBeNull();
 });
 it('rechaza respuestas corruptas y conserva la última lectura válida',async()=>{
  const fetcher=vi.fn().mockImplementationOnce(()=>response(payload())).mockImplementationOnce(()=>response({current:{temperature_2m:null}}));
  const source=new BuenosAiresWeather(fetcher);
  await source.refresh(now);
  expect(await source.refresh(now+60000,true)).toBe(false);
  expect(source.currentC(now+60000)).toBe(24.1);
  expect(()=>parseWeather(payload(),now+86400000)).toThrow();
 });
 it('interpola histórico por hora y separa la caché de intervalos distintos',async()=>{
  vi.useFakeTimers();vi.setSystemTime(now);
  const start=now-3.5*3600000;
  const fetcher=vi.fn(()=>response({hourly:{time:[now/1000-4*3600,now/1000-3*3600,now/1000-2*3600,now/1000-3600,now/1000],temperature_2m:[10,12,14,16,18]}}));
  const source=new BuenosAiresWeather(fetcher);
  expect(await source.hourlyC(start,2)).toEqual([11,13,15]);
  expect(await source.hourlyC(start+3600000,1)).toEqual([13,15]);
  expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it('une histórico y pronóstico para ausencias largas; no completa huecos en silencio',async()=>{
  vi.useFakeTimers();vi.setSystemTime(now);
  const fetcher=vi.fn(()=>response({hourly:{time:[],temperature_2m:[]}}));
  const source=new BuenosAiresWeather(fetcher);
  await expect(source.hourlyC(now-20*86400000,20*24)).rejects.toThrow('no cubre');
  expect(fetcher).toHaveBeenCalledTimes(2);
  const hosts=fetcher.mock.calls.map(call=>(call as unknown as [URL])[0].hostname);
  expect(hosts).toEqual(['archive-api.open-meteo.com','api.open-meteo.com']);
 });
});
