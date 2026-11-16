/**
 * La pecera, en pixel art dibujado por código. Refleja el estado de la
 * simulación: tamaño del modelo, nivel del agua, luz, taninos, calefactor,
 * filtro, temperatura, algas y residuos.
 *
 * Capas, de atrás hacia adelante:
 *   back        (fijo)   fondo, agua, equipos, madera, arena y piedras
 *   interior    (animado) vallisneria, anubias, caustics, burbujas, residuos
 *   fish                  animales
 *   frontStatic (fijo)   musgo y piedras de adelante
 *   front       (animado) puntas del musgo, rayos de luz, partículas, superficie, algas
 *   glass       (fijo)   vidrio, reflejos, tapa y luz
 * Las capas fijas solo se redibujan cuando cambia algo que las afecta.
 */

import { Container, Graphics } from 'pixi.js';
import type { DerivedValues, SimState } from '../../sim';
import { lerpColor, scatter } from '../pixel-utils';
import { FishLayer } from './fish-layer';
import {
  Batch,
  drawAnubias,
  drawMoss,
  drawMossTips,
  drawSand,
  drawStones,
  drawVallisneria,
  drawWood,
  sandY,
  type TankGeo,
} from './tank-decor';
import { tankRect, type TankRect } from './tank-layout';

const NIGHT = 0x081420;
const FRAME_DARK = 0x14181f;
const EQUIP = 0x23272f;
const EQUIP_HI = 0x3d4450;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export class TankView {
  readonly container = new Container();
  private readonly back = new Graphics();
  private readonly interior = new Graphics();
  private readonly frontStatic = new Graphics();
  private readonly front = new Graphics();
  private readonly glass = new Graphics();
  readonly fish = new FishLayer();
  private readonly batch = new Batch();
  /** Para las capas fijas: respeta el orden de dibujo. */
  private readonly ordered = new Batch(true);
  private rect: TankRect = tankRect(30, 30);
  private glassKey = '';
  private backKey = '';
  private lastSeconds = 0;

  constructor() {
    this.container.addChild(this.back, this.interior, this.fish.graphics, this.frontStatic, this.front, this.glass);
  }

  /** Rectángulo actual (lo usan el fondo y el HUD para ubicarse). */
  get bounds(): TankRect {
    return this.rect;
  }

  update(state: SimState, derived: DerivedValues, seconds: number): void {
    this.rect = tankRect(state.tank.lengthCm, state.tank.heightCm);
    const geo = this.layout(derived);
    const lit = derived.lightOn;
    const shade = (c: number): number => (lit ? c : lerpColor(c, NIGHT, 0.6));
    this.drawGlass(state, lit);
    this.drawBack(state, derived, geo, shade);
    this.drawInterior(state, derived, geo, shade, seconds);
    this.drawFront(state, geo, shade, lit, seconds);

    const dt = this.lastSeconds === 0 ? 0 : seconds - this.lastSeconds;
    this.lastSeconds = seconds;
    const swimTop = geo.waterTop + 1;
    this.fish.update(
      state,
      lit,
      { x: geo.left, y: swimTop, width: geo.innerWidth, height: Math.max(0, geo.sandTop - swimTop) },
      this.rect.width / state.tank.lengthCm,
      seconds,
      dt,
    );
  }

  private layout(derived: DerivedValues): TankGeo {
    const { x, y, width, height } = this.rect;
    const left = x + 2;
    const right = x + width - 2;
    const top = y + 2;
    const bottom = y + height - 3;
    const innerWidth = right - left;
    const innerHeight = bottom - top;
    const sandH = clamp(Math.round(innerHeight * 0.1), 9, 18);
    const fullHeight = Math.round(innerHeight * 0.92);
    const waterHeight = Math.round(fullHeight * clamp(derived.waterLevel, 0, 1.05));
    return {
      left,
      right,
      top,
      bottom,
      innerWidth,
      innerHeight,
      waterTop: bottom - waterHeight,
      waterHeight,
      sandTop: bottom - sandH,
      sandH,
      colH: fullHeight - sandH,
      s: clamp(innerWidth / 150, 1, 1.5),
    };
  }

  /** Color del agua a una profundidad (0 superficie .. 1 fondo). */
  private waterColor(state: SimState, lit: boolean, depth: number): number {
    const clear = lit ? lerpColor(0x40c6bf, 0x14606e, depth) : lerpColor(0x14434e, 0x0a2731, depth);
    const amber = lit ? lerpColor(0xc08a34, 0x6a4418, depth) : lerpColor(0x4a3413, 0x2a1c0c, depth);
    return lerpColor(clear, amber, state.water.tannins * 0.6);
  }

  /** Vidrio, reflejos, base, tapa y luz: solo cambian con la pecera o la luz. */
  private drawGlass(state: SimState, lit: boolean): void {
    const { x, y, width, height } = this.rect;
    const key = `${x},${y},${width},${height},${state.tank.hasLid},${lit}`;
    if (key === this.glassKey) return;
    this.glassKey = key;
    const g = this.glass;
    g.clear();

    // Cantos del vidrio: filo oscuro afuera y brillo turquesa adentro.
    g.rect(x, y, 1, height - 3).rect(x + width - 1, y, 1, height - 3).fill(0x0f2f38);
    g.rect(x + 1, y, 1, height - 3)
      .rect(x + width - 2, y, 1, height - 3)
      .fill({ color: 0xa8e6e2, alpha: lit ? 0.6 : 0.3 });
    // Base oscura.
    g.rect(x - 1, y + height - 3, width + 2, 3).fill(FRAME_DARK);
    g.rect(x - 1, y + height - 3, width + 2, 1).fill(0x2a313c);

    // Reflejos en el frente: franjas diagonales muy suaves.
    const streak = (x0: number, y0: number, len: number, w: number): void => {
      for (let j = 0; j < len; j += 2) g.rect(Math.round(x0 - j / 2), y0 + j, w, 2);
    };
    streak(x + Math.round(width * 0.17), y + 9, Math.round(height * 0.3), 5);
    streak(x + Math.round(width * 0.17) + 9, y + 9, Math.round(height * 0.19), 2);
    g.fill({ color: 0xffffff, alpha: 0.1 });
    streak(x + Math.round(width * 0.92), y + Math.round(height * 0.52), Math.round(height * 0.22), 3);
    g.fill({ color: 0xffffff, alpha: 0.06 });
    g.rect(x + 3, y + 6, 1, Math.round(height * 0.5)).fill({ color: 0xffffff, alpha: 0.16 });

    const led = lit ? 0xfff6d8 : 0x3a4048;
    if (state.tank.hasLid) {
      // Tapa con la luz debajo.
      g.rect(x - 2, y - 5, width + 4, 6).fill(0x171b22);
      g.rect(x - 2, y - 5, width + 4, 1).fill(0x2c333e);
      g.rect(x - 2, y, width + 4, 1).fill(0x0e1116);
      g.rect(x + 6, y + 1, width - 12, 1).fill(led);
    } else {
      // Sin tapa: borde del vidrio y una barra de luz con patitas.
      g.rect(x, y, width, 1).fill({ color: 0xa8e6e2, alpha: 0.5 });
      const barX = x + Math.round(width * 0.2);
      const barW = Math.round(width * 0.6);
      g.rect(barX, y - 8, barW, 3).fill(0x171b22);
      g.rect(barX, y - 8, barW, 1).fill(0x2c333e);
      g.rect(barX + 2, y - 5, 1, 5).rect(barX + barW - 3, y - 5, 1, 5).fill(0x171b22);
      g.rect(barX + 4, y - 5, barW - 8, 1).fill(led);
    }
  }

  /** Todo lo que no se mueve detrás de los peces. */
  private drawBack(state: SimState, derived: DerivedValues, geo: TankGeo, shade: (c: number) => number): void {
    const { y } = this.rect;
    const { left, right, top, bottom, innerWidth, innerHeight, waterTop, waterHeight } = geo;
    const lit = derived.lightOn;
    const hasFilter = state.filter.flowLph > 0;
    const hasHeater = state.heater.watts > 0;
    const temp = Math.round(state.water.temperatureC);
    const key = [
      this.rect.x,
      this.rect.y,
      this.rect.width,
      this.rect.height,
      waterHeight,
      lit,
      Math.round(state.water.tannins * 20),
      Math.round(state.algae.decor * 10),
      hasHeater,
      state.heater.on,
      state.heater.enabled,
      hasFilter,
      Math.round(state.filter.clog * 10),
      temp,
    ].join();
    if (key === this.backKey) return;
    this.backKey = key;
    const g = this.back;
    const b = this.ordered;
    g.clear();

    // Filtro de mochila: la caja asoma por detrás, arriba a la derecha.
    const filterX = right - Math.round(26 * Math.min(1.2, geo.s));
    if (hasFilter) {
      g.rect(filterX, y - 11, 22, 24).fill(EQUIP);
      g.rect(filterX, y - 11, 22, 1).rect(filterX, y - 11, 1, 24).fill(EQUIP_HI);
      g.rect(filterX + 3, y - 8, 9, 5).fill(lerpColor(0x7fb7d6, 0x5b4630, state.filter.clog));
    }

    // Fondo y aire sobre el agua.
    g.rect(left, top, innerWidth, innerHeight).fill(lit ? 0x24424c : 0x0e1a26);
    if (lit) {
      g.rect(left, top, innerWidth, 2).fill({ color: 0xfff2c8, alpha: 0.35 });
      g.rect(left, top + 2, innerWidth, Math.max(0, waterTop - top - 2)).fill({ color: 0xfff2c8, alpha: 0.12 });
    }

    // Agua en franjas, más clara arriba.
    if (waterHeight > 0) {
      const bands = clamp(Math.round(waterHeight / 10), 4, 14);
      for (let i = 0; i < bands; i++) {
        const y0 = waterTop + Math.round((i * waterHeight) / bands);
        const y1 = waterTop + Math.round(((i + 1) * waterHeight) / bands);
        g.rect(left, y0, innerWidth, y1 - y0).fill(this.waterColor(state, lit, i / (bands - 1)));
        // Borde entre franjas salpicado, para que no se vea la línea.
        if (i > 0) {
          for (let k = 0; k < innerWidth / 4; k++) g.rect(left + k * 4 + ((i + k) % 2) * 2, y0 - 1, 2, 1);
          g.fill(this.waterColor(state, lit, i / (bands - 1)));
        }
      }
      if (lit) {
        // Resplandor en el centro, donde pega la luz.
        g.rect(left + Math.round(innerWidth * 0.2), waterTop, Math.round(innerWidth * 0.6), waterHeight)
          .rect(left + Math.round(innerWidth * 0.34), waterTop, Math.round(innerWidth * 0.32), waterHeight)
          .fill({ color: 0xc8fff0, alpha: 0.05 });
      }
      // Costados más oscuros.
      g.rect(left, waterTop, 5, waterHeight).rect(right - 5, waterTop, 5, waterHeight).fill({ color: 0x04202a, alpha: 0.16 });
      g.rect(left, waterTop, innerWidth, 1).fill(lerpColor(this.waterColor(state, lit, 0), 0xffffff, 0.55));
      g.rect(left, waterTop + 1, innerWidth, 1).fill({ color: 0xffffff, alpha: 0.14 });
    }

    // Calefactor: tubo de vidrio con la resistencia y su lucecita.
    if (hasHeater) {
      const hx = left + 12;
      const hTop = top + Math.round(innerHeight * 0.24);
      const hH = Math.round(innerHeight * 0.4);
      g.rect(hx + 2, top, 1, hTop - top).fill(0x15181e); // cable
      if (state.heater.on) g.rect(hx - 2, hTop + 6, 9, hH - 6).fill({ color: 0xff7a3a, alpha: 0.14 });
      g.rect(hx, hTop, 5, hH).fill(shade(0xb9c7d0));
      g.rect(hx + 1, hTop + 6, 3, hH - 8).fill(shade(0xe4edf2));
      for (let yy = hTop + 9; yy < hTop + hH - 4; yy += 3) g.rect(hx + 1, yy, 3, 1);
      g.fill(state.heater.on ? 0xff8a3a : shade(0x7a8590));
      g.rect(hx, hTop, 5, 6).fill(EQUIP);
      g.rect(hx + 2, hTop + 2, 1, 2).fill(!state.heater.enabled ? 0x30363f : state.heater.on ? 0xff3b30 : 0x3fd16b);
    }

    // Termómetro pegado al vidrio de la izquierda.
    {
      const tx = left + 3;
      const tTop = top + Math.round(innerHeight * 0.2);
      const tH = clamp(Math.round(innerHeight * 0.2), 18, 34);
      g.rect(tx, tTop, 4, tH).fill(shade(0xdfe8ee));
      g.rect(tx + 1, tTop + 1, 2, tH - 2).fill(shade(0xf8fafb));
      for (let yy = tTop + 3; yy < tTop + tH - 5; yy += 3) g.rect(tx + 2, yy, 1, 1);
      g.fill(shade(0x8a96a0));
      const mercury = Math.round((tH - 7) * clamp((state.water.temperatureC - 14) / 20, 0.05, 1));
      g.rect(tx + 1, tTop + tH - 4 - mercury, 1, mercury).fill(shade(0xe0443a));
      g.rect(tx + 1, tTop + tH - 4, 2, 3).fill(shade(0xe0443a));
      g.rect(tx + 1, tTop - 2, 2, 2).fill(EQUIP); // ventosa
    }

    // Filtro: toma con rejilla dentro del agua y vertedero.
    if (hasFilter) {
      const tubeX = filterX + 14;
      const tubeEnd = geo.sandTop - Math.round(geo.colH * 0.3);
      g.rect(tubeX, top, 3, tubeEnd - top).fill(EQUIP);
      g.rect(tubeX, top, 1, tubeEnd - top).fill(EQUIP_HI);
      g.rect(tubeX - 1, tubeEnd, 5, 9).fill(EQUIP);
      for (let yy = tubeEnd + 1; yy < tubeEnd + 8; yy += 2) g.rect(tubeX, yy, 3, 1);
      g.fill(EQUIP_HI);
      g.rect(filterX - 5, top, 9, 3).fill(EQUIP);
      g.rect(filterX - 5, top + 3, 7, 1).fill(EQUIP_HI);
    }

    // Madera, arena y piedras del fondo.
    drawWood(b, geo);
    b.flush(g, shade);
    drawSand(b, geo);
    const algae = state.algae.decor * 0.6;
    b.flush(g, (c) => shade(lerpColor(c, 0x5f8a3c, algae)));
    drawStones(b, geo, false);
    b.flush(g, (c) => shade(lerpColor(c, 0x5f8a3c, algae * 0.7)));
    // Sombra al pie de la arena contra el vidrio.
    g.rect(left, bottom - 1, innerWidth, 1).fill({ color: 0x000000, alpha: 0.18 });

    // Lo fijo de adelante: musgo y piedras.
    const f = this.frontStatic;
    f.clear();
    drawStones(b, geo, true);
    b.flush(f, (c) => shade(lerpColor(c, 0x5f8a3c, algae * 0.7)));
    drawMoss(b, geo);
    b.flush(f, shade);
  }

  /** Lo que se mueve detrás de los peces. */
  private drawInterior(
    state: SimState,
    derived: DerivedValues,
    geo: TankGeo,
    shade: (c: number) => number,
    seconds: number,
  ): void {
    const g = this.interior;
    const b = this.batch;
    g.clear();
    const { left, right, top, innerWidth, waterTop, waterHeight, sandTop, sandH } = geo;
    const lit = derived.lightOn;

    drawVallisneria(b, geo, seconds);
    drawAnubias(b, geo, seconds);
    b.flush(g, shade);

    // Caustics: la luz que baila sobre la arena.
    if (lit && waterHeight > sandH) {
      const rows = Math.min(4, sandH - 3);
      let spots = 0;
      for (let r = 0; r < rows; r++) {
        let run = 0;
        let runY = 0;
        for (let x = left; x <= right; x++) {
          const v =
            x < right
              ? Math.sin(x * 0.21 + seconds * 1.1 + r * 0.9) +
                Math.sin(x * 0.083 - seconds * 0.7 + r * 0.4) +
                Math.sin((x + r * 3) * 0.37 + seconds * 0.5)
              : -9;
          const yy = sandY(geo, x) + r;
          if (v > 1.2 && (run === 0 || yy === runY)) {
            run++;
            runY = yy;
            continue;
          }
          if (run > 0) {
            g.rect(x - run, runY, run, 1);
            spots++;
          }
          run = v > 1.2 ? 1 : 0;
          runY = yy;
        }
      }
      if (spots > 0) g.fill({ color: 0xfff6c8, alpha: 0.3 });
    }

    // Detrito y comida sin comer sobre la arena.
    const detritus = Math.min(80, Math.round(state.organics.detritusG * 8));
    for (let i = 0; i < detritus; i++) {
      const sx = left + 1 + Math.floor(scatter(i, 3) * (innerWidth - 3));
      g.rect(sx, sandY(geo, sx) - 1 + Math.floor(scatter(i, 4) * 4), 2, 1);
    }
    if (detritus > 0) g.fill(shade(0x4a3a26));
    const food = Math.min(60, Math.ceil(state.organics.foodG * 20));
    for (let i = 0; i < food; i++) {
      const sx = left + 10 + Math.floor(scatter(i, 5) * (innerWidth - 22));
      g.rect(sx, sandTop - 1 + Math.floor(scatter(i, 6) * 3), 2, 2);
    }
    if (food > 0) g.fill(shade(0xd9703a));

    // Filtro andando: chorro del vertedero y columna de burbujas.
    if (state.filter.flowLph > 0 && derived.effectiveFlowLph > 1 && waterHeight > sandH + 6) {
      const strength = Math.min(1, derived.effectiveFlowLph / state.filter.flowLph);
      const filterX = right - Math.round(26 * Math.min(1.2, geo.s));
      const streamX = filterX - 4;
      for (let sy = top + 4; sy < waterTop; sy += 2) {
        const wobble = Math.floor(seconds * 12 + sy / 2) % 3 === 0 ? 1 : 0;
        g.rect(streamX + wobble, sy, strength > 0.5 ? 3 : 2, 2);
      }
      g.fill({ color: 0xcfeaff, alpha: 0.8 });

      // Burbujas que suben junto a la toma, serpenteando.
      const colX = filterX + 8;
      const from = sandTop - Math.round(geo.colH * 0.3) + 6;
      const travel = from - waterTop - 2;
      const bubbles = Math.round(8 + strength * 16);
      for (let i = 0; i < bubbles; i++) {
        const phase = (seconds * (0.22 + scatter(i, 9) * 0.3) + scatter(i, 10)) % 1;
        const bx = colX + Math.round(Math.sin(phase * 11 + i) * 2 + (scatter(i, 12) - 0.5) * 5);
        const by = from - Math.round(travel * phase);
        const size = scatter(i, 13) > 0.65 && phase > 0.3 ? 2 : 1;
        b.add(0xffffff, bx, by, size, size);
        if (size === 2) b.add(0x9fe8f0, bx + 1, by + 1, 1, 1);
      }
      // Espuma donde cae el chorro.
      for (let i = 0; i < 6; i++) {
        const phase = (seconds * (0.6 + scatter(i, 14) * 0.5) + scatter(i, 15)) % 1;
        const depth = 4 + scatter(i, 16) * 12 * strength;
        b.add(0xffffff, streamX - 3 + Math.floor(scatter(i, 17) * 8), waterTop + 2 + Math.round(depth * Math.sin(phase * Math.PI)), 1, 1);
      }
      b.flush(g, undefined, lit ? 0.75 : 0.4);
    }
  }

  /** Lo que va delante de los peces: luz, partículas, superficie y algas del vidrio. */
  private drawFront(
    state: SimState,
    geo: TankGeo,
    shade: (c: number) => number,
    lit: boolean,
    seconds: number,
  ): void {
    const g = this.front;
    const b = this.batch;
    g.clear();
    const { left, right, innerWidth, waterTop, waterHeight, sandH } = geo;
    if (waterHeight <= 0) return;

    drawMossTips(b, geo, seconds);
    b.flush(g, shade);

    // Tinte del agua sobre todo lo que está adentro.
    g.rect(left, waterTop, innerWidth, waterHeight).fill({
      color: this.waterColor(state, lit, 0.5),
      alpha: 0.1 + 0.18 * state.water.tannins,
    });

    // Rayos de luz que bajan desde la tapa, abriéndose y respirando.
    if (lit && waterHeight > 12) {
      const rays = Math.max(3, Math.round(innerWidth / 38));
      const mid = left + innerWidth / 2;
      for (let i = 0; i < rays; i++) {
        const baseX = left + ((i + 0.5) * innerWidth) / rays + Math.sin(seconds * 0.15 + i * 2) * 6;
        const wd = 5 + 5 * scatter(i, 81);
        const alpha = 0.05 + 0.035 * Math.sin(seconds * 0.6 + i * 1.9);
        const slant = 0.2 * ((baseX - mid) / innerWidth) * 2 + 0.06;
        const len = (waterHeight - sandH * 0.5) * (0.6 + 0.35 * scatter(i, 82));
        const half = Math.round(len * 0.55);
        let pending = 0;
        for (let yy = 0; yy < len; yy += 4) {
          const x0 = clamp(Math.round(baseX + slant * yy), left, right);
          const x1 = clamp(Math.round(baseX + slant * yy + wd + yy * 0.04), left, right);
          if (x1 > x0) {
            g.rect(x0, waterTop + 1 + yy, x1 - x0, Math.min(4, len - yy));
            pending++;
          }
          if (yy < half && yy + 4 >= half && pending > 0) {
            g.fill({ color: 0xdcfff0, alpha });
            pending = 0;
          }
        }
        if (pending > 0) g.fill({ color: 0xdcfff0, alpha: alpha * 0.5 });
      }
    }

    // Partículas en suspensión, a la deriva.
    const column = Math.max(1, waterHeight - sandH - 3);
    const specks = Math.min(60, Math.round((innerWidth * column) / 900));
    for (let i = 0; i < specks; i++) {
      const drift = (i % 3 === 0 ? -1 : 1) * (0.8 + 1.6 * scatter(i, 83));
      const py = (((scatter(i, 84) * column + seconds * drift) % column) + column) % column;
      const px = left + 2 + scatter(i, 85) * (innerWidth - 5) + Math.sin(seconds * 0.25 + i) * 4;
      g.rect(clamp(Math.round(px), left, right - 1), waterTop + 2 + Math.floor(py), 1, 1);
    }
    if (specks > 0) g.fill({ color: 0xeafff4, alpha: lit ? 0.32 : 0.12 });

    // Brillos que corren por la superficie.
    let run = 0;
    let glints = 0;
    for (let x = left; x <= right; x++) {
      const on = x < right && Math.sin(x * 0.3 + seconds * 1.4) + Math.sin(x * 0.11 - seconds * 0.9) > 1.15;
      if (on) {
        run++;
        continue;
      }
      if (run > 0) {
        g.rect(x - run, waterTop, run, 1);
        glints++;
      }
      run = 0;
    }
    if (glints > 0) g.fill({ color: 0xffffff, alpha: lit ? 0.7 : 0.25 });

    // Capa de algas en el vidrio.
    const algaeSpecks = Math.round(Math.min(1, state.algae.glass) * innerWidth * 0.8);
    const algaeArea = Math.max(1, waterHeight - sandH - 4);
    for (let i = 0; i < algaeSpecks; i++) {
      const sx = left + Math.floor(scatter(i, 7) * (innerWidth - 2));
      const sy = waterTop + 2 + Math.floor(scatter(i, 8) * algaeArea);
      g.rect(sx, sy, 2, 2);
    }
    if (algaeSpecks > 0) g.fill({ color: shade(0x3fae4a), alpha: 0.8 });
  }
}
