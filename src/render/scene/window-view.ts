/**
 * Lo que se ve por la ventana: cielo según la hora (de noche, la imagen
 * cielo-noche.png va entre el degradé y lo de adelante), estrellas, nubes,
 * arboleda lejana con lucecitas, lluvia, gotas que corren por el vidrio y
 * relámpagos. Se dibuja detrás de la pared (el marco va encima).
 */

import type { Graphics } from 'pixi.js';
import type { Weather } from '../../sim';
import type { OutsideView } from '../../world/weather';
import { lerpColor, scatter } from '../pixel-utils';

/** Cuánto tapa el cielo cada clima (0 despejado .. 1 cerrado). */
const OVERCAST: Record<Weather, number> = { clear: 0, cloudy: 0.6, rain: 0.85, storm: 1 };

/**
 * Relámpago: 0 sin luz .. 1 a pleno. Cada tantos segundos cae uno, con doble
 * destello. `bolt` identifica el rayo (para que cada uno caiga en otro lado).
 */
function lightning(t: number): { flash: number; bolt: number } {
  const period = 9;
  const bolt = Math.floor(t / period);
  const at = (t % period) - 1 - scatter(bolt, 95) * 6;
  let flash = 0;
  if (at >= 0 && at < 0.09) flash = 1;
  else if (at >= 0.16 && at < 0.34) flash = 0.7 * (1 - (at - 0.16) / 0.18);
  return { flash, bolt };
}

/** Dibuja la ventana y devuelve la intensidad del relámpago (para iluminar la habitación). */
export function drawSky(
  g: Graphics,
  window: { x: number; y: number; width: number; height: number },
  day: number,
  weather: Weather,
  t: number,
  /** 'base': solo el degradé del cielo; 'front': estrellas, nubes, árboles, lluvia y rayos. */
  part: 'base' | 'front' = 'front',
  outside?: OutsideView,
): number {
  const { x, y, width: W, height: H } = window;
  const ov = outside ? Math.max(weather === 'storm' ? 0.9 : weather === 'rain' ? 0.7 : 0, outside.cloudCover / 100) : OVERCAST[weather];
  const night = 1 - day;
  const right = x + W;
  const bottom = y + H;
  /** Rectángulo recortado al vidrio. */
  const rect = (rx: number, ry: number, rw: number, rh: number): boolean => {
    const x0 = Math.max(x, Math.round(rx));
    const y0 = Math.max(y, Math.round(ry));
    const x1 = Math.min(right, Math.round(rx + rw));
    const y1 = Math.min(bottom, Math.round(ry + rh));
    if (x1 <= x0 || y1 <= y0) return false;
    g.rect(x0, y0, x1 - x0, y1 - y0);
    return true;
  };

  // Cielo en franjas: de noche azul profundo, de día celeste; gris si está tapado
  // y con el horizonte anaranjado al amanecer y al atardecer.
  const greyTop = lerpColor(0x0a0d18, weather === 'storm' ? 0x4a5262 : 0x6f7a8c, day);
  const greyLow = lerpColor(0x1a1f2c, weather === 'storm' ? 0x6a7280 : 0xa3adb8, day);
  const twilight = outside?.twilight ?? Math.sin(day * Math.PI);
  let top = lerpColor(lerpColor(0x070b1c, 0x70a9c6, day), greyTop, ov);
  let low = lerpColor(lerpColor(0x18223f, 0xd0e3dc, day), greyLow, ov);
  top = lerpColor(top, 0x6a5a9a, twilight * 0.4 * (1 - ov));
  low = lerpColor(low, 0xf2a25c, twilight * 0.7 * (1 - ov));
  const bands = 24;
  const skyAt = (k: number): number => lerpColor(top, low, k);
  for (let i = 0; part === 'base' && i < bands; i++) {
    const y0 = y + Math.round((i * H) / bands);
    const y1 = y + Math.round(((i + 1) * H) / bands);
    g.rect(x, y0, W, y1 - y0).fill(skyAt(i / (bands - 1)));
  }

  if (part === 'base') return 0;

  // Estrellas que titilan suave, sobre el cielo de noche (la imagen ya trae la luna).
  if (day < 0.5 && ov < 0.9) {
    const groups = 3;
    for (let k = 0; k < groups; k++) {
      let drawn = 0;
      for (let i = k; i < 36; i += groups) {
        const sx = x + 3 + Math.floor(scatter(i, 31) * (W - 6));
        const sy = y + 3 + Math.floor(scatter(i, 32) * H * 0.6);
        g.rect(sx, sy, 1, 1);
        drawn++;
      }
      const twinkle = 0.5 + 0.5 * Math.sin(t * (0.7 + k * 0.23) + k * 2.1);
      if (drawn > 0) g.fill({ color: 0xf4f1d0, alpha: (1 - day / 0.5) * (1 - ov) * (0.25 + 0.6 * twinkle) });
    }
  }

  // Sol o luna en arco: la luz sigue el amanecer/atardecer de Buenos Aires.
  const progress = outside?.sunProgress ?? 0.5;
  if (day > 0.05 && ov < 0.9) {
    const sx = x + W * (0.12 + progress * 0.76), sy = y + H * (0.65 - Math.sin(progress * Math.PI) * 0.5);
    for (let r = 16; r >= 8; r -= 4) {
      for (let row = -r; row <= r; row += 2) {
        const half = Math.round(Math.sqrt(Math.max(0,r*r-row*row))/2)*2;
        rect(sx-half,sy+row,half*2,2);
      }
      g.fill({color: twilight > 0.5 ? 0xffc78e : 0xfff0bc, alpha:r===8 ? 0.85*(1-ov) : 0.07*(1-ov)});
    }
  } else if (day < 0.15 && ov < 0.7) {
    const moonX=x+W*0.7, moonY=y+H*0.2;
    for(let row=-7;row<=7;row++){
      const half=Math.round(Math.sqrt(Math.max(0,49-row*row)));
      rect(moonX-half,moonY+row,half*2,1);
    }
    g.fill({color:0xe9e3bd,alpha:0.85*(1-ov)});
    // A soft crescent cutout rather than another bright lamp in the sky.
    for(let row=-7;row<=7;row++){
      const half=Math.round(Math.sqrt(Math.max(0,49-row*row)));
      rect(moonX-half+5,moonY+row-2,half*2,1);
    }
    g.fill(skyAt(0.2));
  }

  // Nubes de bordes escalonados, con profundidad y viento real.
  const clouds = Math.round(2 + ov*7);
  const wind = Math.max(0.3,Math.min(3,(outside?.windKph??10)/14));
  const cloudLight = lerpColor(lerpColor(0x343d56,0xf2eede,day),lerpColor(0x242c40,0xa4adb4,day),ov);
  const cloudDark=lerpColor(cloudLight,0x526174,0.22);
  for(let i=0;i<clouds;i++) {
    const w=42+scatter(i,37)*54, h=9+scatter(i,74)*9;
    const cx=x-100+((scatter(i,33)*(W+200)+t*(0.4+scatter(i,38))*wind)%(W+200));
    const cy=y+H*(0.1+scatter(i,39)*0.34);
    for(let pass=0;pass<2;pass++) {
      for(let row=-Math.round(h);row<=4;row+=2){
        const normalized=(row+h)/(h+4);
        const half=w*0.5*Math.sqrt(Math.max(0,1-(normalized-0.7)**2/0.5));
        const lobes=Math.sin(normalized*9+i)*3;
        rect(cx-half+lobes,cy+row+(pass===0?3:0),Math.max(2,half*2),2);
      }
      g.fill({color:pass===0?cloudDark:cloudLight,alpha:(weather==='clear'?0.45:0.68)*(pass===0?0.5:1)});
    }
  }

  // Un barrio lejano, detrás de las copas: siluetas bajas, terrazas y antenas.
  const building=lerpColor(0x141b2b,0x8b9b9e,day);
  for(let i=0;i<18;i++){
    const bx=x+i*(W/17)-6, bw=10+scatter(i,110)*14, bh=22+scatter(i,111)*25;
    rect(bx,bottom-bh,bw,bh);
    rect(bx+2,bottom-bh-2,bw-4,2);
    if(i%4===0){rect(bx+4,bottom-bh-10,1,10);rect(bx+1,bottom-bh-8,7,1);}
  }
  g.fill({color:building,alpha:0.85});

  // Árboles en tres planos. Las estaciones cambian las hojas, no el tamaño del paisaje.
  const season=outside?.season??'spring';
  const foliage={summer:[0x668568,0x345a49],autumn:[0xa8956c,0x706947],winter:[0x7d8881,0x4c655b],spring:[0x7e9a78,0x446e59]}[season];
  for(let layer=0;layer<2;layer++){
    const color=lerpColor(layer===0?0x14212b:0x0e1b25,foliage[layer]??0x446e59,day);
    const count=layer===0?13:9;
    for(let i=0;i<count;i++){
      const cx=x+(i+0.2)*(W/(count-1)),h=20+scatter(i+layer*20,91)*26;
      const radius=12+scatter(i,92)*12;
      const sway=Math.sin(t*0.7+i)*(outside?.windKph??10)/35;
      rect(cx-2,bottom-h,3,h);
      for(let row=-radius;row<radius;row+=2){
        const half=Math.sqrt(Math.max(0,radius*radius-row*row));
        rect(cx-half+sway,bottom-h+row,half*2,2);
      }
    }
    g.fill({color,alpha:layer===0?0.8:1});
  }
  // Jacarandás de primavera: acentos lilas muy discretos, sin teñir toda la ciudad.
  if(season==='spring' && day>0.2){
    for(let i=0;i<24;i++)rect(x+scatter(i,141)*W,bottom-18-scatter(i,142)*20,2,1);
    g.fill({color:0xa58bb8,alpha:0.55*day});
  }

  // Luces lejanas de noche.
  if (day < 0.5) {
    for (let i = 0; i < 7; i++) {
      const lx = x + Math.round(W * (0.55 + 0.42 * scatter(i, 93)));
      const ly = bottom - 26 - Math.round(scatter(i, 94) * 22);
      g.rect(lx - 1, ly - 1, 4, 4);
    }
    g.fill({ color: 0xffc46a, alpha: 0.18 * night });
    for (let i = 0; i < 7; i++) {
      const lx = x + Math.round(W * (0.55 + 0.42 * scatter(i, 93)));
      const ly = bottom - 26 - Math.round(scatter(i, 94) * 22);
      g.rect(lx, ly, 2, 2);
    }
    g.fill({ color: 0xffd98a, alpha: 0.85 * night });
  }

  let flash = 0;
  if (weather === 'rain' || weather === 'storm') {
    const storm = weather === 'storm';
    // Relámpago: destello en el cielo y el rayo.
    if (storm) {
      const l = lightning(t);
      flash = l.flash;
      if (flash > 0) {
        g.rect(x, y, W, H).fill({ color: 0xdfe8ff, alpha: 0.5 * flash });
        let bx = x + 30 + scatter(l.bolt, 97) * (W - 60);
        for (let by = y; by < bottom - 40; by += 6) {
          const nx = bx + (scatter(l.bolt * 31 + by, 98) - 0.5) * 14;
          rect(Math.min(bx, nx), by, Math.abs(nx - bx) + 2, 2);
          rect(nx, by + 2, 2, 4);
          bx = nx;
        }
        g.fill({ color: 0xffffff, alpha: Math.min(1, flash + 0.2) });
      }
    }

    // Lluvia cayendo (inclinada con tormenta).
    const drops = Math.round(Math.min(150, 20 + (outside?.precipitationMm ?? (storm ? 5 : 1)) * 18));
    const slant = Math.min(0.45, 0.05 + (outside?.windKph ?? (storm ? 35 : 8)) / 100);
    for (let i = 0; i < drops; i++) {
      const fall = (scatter(i, 35) * H + t * (150 + 70 * scatter(i, 36))) % H;
      const dx = x + ((scatter(i, 34) * W - fall * slant + W) % W);
      const len = 5 + Math.floor(scatter(i, 40) * 4);
      rect(dx, y + fall, 1, len / 2);
      rect(dx - (storm ? 1 : 0), y + fall + len / 2, 1, len / 2);
    }
    g.fill({ color: 0xbcd4f0, alpha: storm ? 0.5 : 0.4 });

    // Gotitas quietas y gotas que se juntan y corren por el vidrio.
    for (let i = 0; i < 46; i++) {
      rect(x + 2 + scatter(i, 41) * (W - 4), y + 2 + scatter(i, 42) * (H - 4), 1, 1);
    }
    g.fill({ color: 0xd8ecff, alpha: 0.28 });
    const runners = storm ? 22 : 14;
    for (let pass = 0; pass < 2; pass++) {
      let any = false;
      for (let i = 0; i < runners; i++) {
        const period = 4 + scatter(i, 43) * 6;
        const phase = ((t + scatter(i, 44) * period) / period) % 1;
        const startY = scatter(i, 45) * H * 0.5;
        const run = phase < 0.4 ? 0 : ((phase - 0.4) / 0.6) ** 2;
        const dy = startY + run * (H - startY);
        const dx = x + 3 + scatter(i, 46) * (W - 6) + Math.round(Math.sin(dy * 0.13 + i) * 1.5);
        if (pass === 0) {
          // Estela.
          if (run > 0) any = rect(dx, y + dy - Math.min(12, dy - startY), 1, Math.min(12, dy - startY)) || any;
        } else {
          any = rect(dx, y + dy, 1, 2) || any;
          if (phase > 0.25) any = rect(dx - 1, y + dy + 1, 3, 1) || any;
        }
      }
      if (any) g.fill({ color: 0xe4f2ff, alpha: pass === 0 ? 0.22 : 0.7 });
    }
  }

  // Reflejo tenue del vidrio.
  for (let j = 0; j < 60; j += 2) rect(x + 46 - j / 2, y + 10 + j, 7, 2);
  g.fill({ color: 0xffffff, alpha: 0.04 });
  return flash;
}
