/**
 * La pecera. Refleja el estado de la simulación: tamaño del modelo, nivel del
 * agua, luz, taninos, calefactor, filtro, algas y residuos.
 *
 * Capas, de atrás hacia adelante:
 *   water     (código)  degradé del agua: se oscurece de noche y se pone ámbar con taninos
 *   equip     (código)  calefactor, termómetro y toma del filtro
 *   inside    (recortado al agua)
 *     substrate (imagen)  sustrato
 *     hardscape (imagen)  maderas y rocas
 *     plants    (imagen)  plantas, ondulando con el shader de vaivén
 *     mid       (código)  residuos sobre el fondo y burbujas
 *     fish               animales
 *     fx        (código)  tinte del agua, rayos de luz, partículas, brillos y algas del vidrio
 *   glass     (imagen)  el vidrio con su tapa, como capa frontal
 *
 * La decoración sale de datos (`src/data/tank-decor.json`), para que más
 * adelante venga del estado de la simulación. Lo dibujado por código usa
 * píxeles gordos (PX).
 */

import { Container, Graphics, Sprite } from 'pixi.js';
import decorData from '../../data/tank-decor.json';
import type { DerivedValues, SimState } from '../../sim';
import { asset, tex } from '../assets';
import { lerpColor, scatter } from '../pixel-utils';
import { PX } from '../scene/scene-layout';
import { SwayFilter } from '../sway-filter';
import { FishLayer } from './fish-layer';
import { display } from '../camera';
import { GLASS_ART, tankFrame, type TankRect } from './tank-layout';

/** Una pieza de la decoración. */
export interface TankDecorItem {
  /** Nombre del asset (madera-1, roca-dragon-1...). */
  asset?: string;
  /** O una planta por especie y etapa de crecimiento (1 = chica). */
  plant?: string;
  stage?: number;
  /** Posición a lo ancho de la pecera, 0 a 1. */
  x: number;
  /** Ancho real en cm. */
  widthCm: number;
  /** Cuánto se hunde en el sustrato (fracción de su alto). */
  sink?: number;
  flip?: boolean;
}

export interface TankDecor {
  substrate: string;
  items: TankDecorItem[];
}

const GLASS = 'vidrio';
const EQUIP = 0x23272f;
const EQUIP_HI = 0x3d4450;
const NIGHT = 0x081420;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Interior en píxeles gordos (lo que se dibuja por código). */
interface Geo {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  waterTop: number;
  waterHeight: number;
  sandTop: number;
  sandH: number;
}

export class TankView {
  readonly container = new Container();
  readonly fish = new FishLayer();
  private readonly water = new Graphics();
  private readonly equip = new Graphics();
  private readonly inside = new Container();
  private readonly substrate = new Sprite();
  private readonly hardscape = new Container();
  private readonly plants = new Container();
  private readonly mid = new Graphics();
  private readonly fx = new Graphics();
  private readonly waterMask = new Graphics();
  private readonly ledOff = new Graphics();
  private readonly glass = new Sprite(tex(GLASS));
  private readonly sway = new SwayFilter('bottom', 100);
  private decor: TankDecor = decorData.default;
  private inner: TankRect = { x: 0, y: 0, width: 1, height: 1 };
  private outer: TankRect = this.inner;
  private decorKey = '';
  private glassKey = '';
  private waterKey = '';
  private equipKey = '';
  private lastSeconds = 0;

  constructor() {
    for (const g of [this.equip, this.mid, this.fx, this.fish.graphics]) g.scale.set(PX);
    this.plants.filters = [this.sway];
    this.inside.addChild(this.substrate, this.hardscape, this.plants, this.mid, this.fish.graphics, this.fx);
    this.inside.mask = this.waterMask;
    this.container.addChild(this.water, this.equip, this.inside, this.waterMask, this.glass, this.ledOff);
  }

  /** Rectángulo de la pecera entera, con tapa y base (para ubicar al gato y los toques). */
  get bounds(): TankRect {
    return this.outer;
  }

  /** Cambia la decoración (más adelante va a salir del estado de la simulación). */
  setDecor(decor: TankDecor): void {
    this.decor = decor;
    this.decorKey = '';
  }

  /** Golpe en el vidrio, en píxeles de la escena: los peces huyen de ese punto. */
  scareAt(sceneX: number, sceneY: number): void {
    this.fish.scareAt(sceneX / PX, sceneY / PX);
  }

  /** Posición en la escena de un animal cualquiera (para que el gato lo siga con la cabeza). */
  watchPoint(): { x: number; y: number } | null {
    const p = this.fish.watchPoint();
    return p ? { x: p.x * PX, y: p.y * PX } : null;
  }

  update(state: SimState, derived: DerivedValues, seconds: number): void {
    const lit = derived.lightOn;
    const geo = this.layout(state, derived);
    const pxPerCm = this.inner.width / state.tank.lengthCm;
    const tannins = state.water.tannins;

    this.drawWater(geo, lit, tannins);
    this.drawEquipment(state, geo, lit);
    this.buildDecor(pxPerCm);
    // Las imágenes se tiñen: más oscuras con la luz apagada y ámbar con taninos.
    const tint = lerpColor(lit ? 0xffffff : 0x4a5a80, lit ? 0xd9a860 : 0x4a3a2a, tannins * 0.45);
    this.substrate.tint = tint;
    for (const child of this.hardscape.children) child.tint = tint;
    for (const child of this.plants.children) child.tint = tint;
    // La corriente mueve las plantas: más fuerte con el filtro andando.
    const flow = state.filter.flowLph > 0 ? Math.min(1, derived.effectiveFlowLph / state.filter.flowLph) : 0;
    this.sway.set(seconds, 1 + flow, this.plants.worldTransform.a * display.resolution, this.plants.height);

    const shade = (c: number): number => (lit ? c : lerpColor(c, NIGHT, 0.6));
    this.drawMid(state, derived, geo, shade, seconds);
    this.drawFx(state, geo, shade, lit, seconds);

    const dt = this.lastSeconds === 0 ? 0 : seconds - this.lastSeconds;
    this.lastSeconds = seconds;
    const swimTop = geo.waterTop + 1;
    this.fish.update(
      state,
      lit,
      { x: geo.left, y: swimTop, width: geo.width, height: Math.max(0, geo.sandTop - swimTop) },
      pxPerCm / PX,
      seconds,
      dt,
    );
  }

  /** Ubica el interior y el vidrio según las medidas de la pecera. */
  private layout(state: SimState, derived: DerivedValues): Geo {
    const meta = asset(GLASS);
    const glass = meta?.inner ? { width: meta.width, height: meta.height, inner: meta.inner } : GLASS_ART;
    // El vidrio se escala parejo: nunca se estira.
    const { outer, inner, scale: k } = tankFrame(state.tank.lengthCm, glass);
    const glassKey = `${outer.x},${outer.y},${k}`;
    if (glassKey !== this.glassKey) {
      this.glassKey = glassKey;
      this.glass.scale.set(k);
      this.glass.position.set(outer.x, outer.y);
    }
    this.inner = inner;
    this.outer = outer;

    // La tira de luz de la tapa, apagada.
    const led = meta?.led;
    this.ledOff.clear();
    if (led && !derived.lightOn) {
      this.ledOff
        .rect(Math.round(outer.x + led.x * k), Math.round(outer.y + led.y * k), Math.round(led.width * k), Math.ceil(led.height * k))
        .fill({ color: 0x20242e, alpha: 0.85 });
    }

    const left = Math.round(inner.x / PX);
    const top = Math.round(inner.y / PX);
    const width = Math.round(inner.width / PX);
    const height = Math.round(inner.height / PX);
    const bottom = top + height;
    const sandH = clamp(Math.round(height * 0.15), 10, 18);
    const fullHeight = Math.round(height * 0.92);
    const waterHeight = Math.round(fullHeight * clamp(derived.waterLevel, 0, 1.05));
    return {
      left,
      right: left + width,
      top,
      bottom,
      width,
      height,
      waterTop: bottom - waterHeight,
      waterHeight,
      sandTop: bottom - sandH + 3,
      sandH,
    };
  }

  /** Color del agua a una profundidad (0 superficie .. 1 fondo). */
  private waterColor(lit: boolean, tannins: number, depth: number): number {
    const clear = lit ? lerpColor(0x40c6bf, 0x14606e, depth) : lerpColor(0x14434e, 0x0a2731, depth);
    const amber = lit ? lerpColor(0xc08a34, 0x6a4418, depth) : lerpColor(0x4a3413, 0x2a1c0c, depth);
    return lerpColor(clear, amber, tannins * 0.6);
  }

  /** El agua: degradé en franjas, más clara arriba y en el centro. */
  private drawWater(geo: Geo, lit: boolean, tannins: number): void {
    const key = `${this.inner.x},${this.inner.y},${this.inner.width},${geo.waterHeight},${lit},${Math.round(tannins * 20)}`;
    if (key === this.waterKey) return;
    this.waterKey = key;
    const g = this.water;
    g.clear();
    this.waterMask.clear();
    const x = this.inner.x;
    const w = this.inner.width;
    const top = geo.waterTop * PX;
    const h = geo.waterHeight * PX;
    if (h <= 0) {
      this.waterMask.rect(x, top, w, 1).fill(0xffffff);
      return;
    }
    this.waterMask.rect(x, top, w, h).fill(0xffffff);
    const bands = clamp(Math.round(h / 16), 4, 14);
    for (let i = 0; i < bands; i++) {
      const y0 = top + Math.round((i * h) / bands / PX) * PX;
      const y1 = top + Math.round(((i + 1) * h) / bands / PX) * PX;
      const color = this.waterColor(lit, tannins, i / (bands - 1));
      g.rect(x, y0, w, y1 - y0);
      // Borde entre franjas salpicado, para que no se vea la línea.
      if (i > 0) for (let q = 0; q < w / 8; q++) g.rect(x + q * 8 + ((i + q) % 2) * 4, y0 - PX, 4, PX);
      g.fill({ color, alpha: 0.96 });
    }
    if (lit) {
      g.rect(x + Math.round(w * 0.2), top, Math.round(w * 0.6), h)
        .rect(x + Math.round(w * 0.34), top, Math.round(w * 0.32), h)
        .fill({ color: 0xc8fff0, alpha: 0.05 });
    }
    g.rect(x, top, 10, h).rect(x + w - 10, top, 10, h).fill({ color: 0x04202a, alpha: 0.16 });
    g.rect(x, top, w, PX).fill(lerpColor(this.waterColor(lit, tannins, 0), 0xffffff, 0.55));
  }

  /** Calefactor, termómetro y toma del filtro, al fondo. */
  private drawEquipment(state: SimState, geo: Geo, lit: boolean): void {
    const hasFilter = state.filter.flowLph > 0;
    const hasHeater = state.heater.watts > 0;
    const key = [geo.left, geo.top, geo.width, geo.height, lit, hasHeater, state.heater.on, state.heater.enabled, hasFilter, Math.round(state.water.temperatureC)].join();
    if (key === this.equipKey) return;
    this.equipKey = key;
    const g = this.equip;
    g.clear();
    const shade = (c: number): number => (lit ? c : lerpColor(c, NIGHT, 0.6));
    const { left, right, top, height } = geo;

    if (hasHeater) {
      const hx = left + 12;
      const hTop = top + Math.round(height * 0.26);
      const hH = Math.round(height * 0.4);
      g.rect(hx + 2, top, 1, hTop - top).fill(0x15181e); // cable
      if (state.heater.on) g.rect(hx - 2, hTop + 6, 9, hH - 6).fill({ color: 0xff7a3a, alpha: 0.14 });
      g.rect(hx, hTop, 5, hH).fill(shade(0xb9c7d0));
      g.rect(hx + 1, hTop + 6, 3, hH - 8).fill(shade(0xe4edf2));
      for (let yy = hTop + 9; yy < hTop + hH - 4; yy += 3) g.rect(hx + 1, yy, 3, 1);
      g.fill(state.heater.on ? 0xff8a3a : shade(0x7a8590));
      g.rect(hx, hTop, 5, 6).fill(EQUIP);
      g.rect(hx + 2, hTop + 2, 1, 2).fill(!state.heater.enabled ? 0x30363f : state.heater.on ? 0xff3b30 : 0x3fd16b);
    }

    // Termómetro pegado al vidrio de la izquierda (el número va en el HUD).
    const tx = left + 3;
    const tTop = top + Math.round(height * 0.22);
    const tH = clamp(Math.round(height * 0.2), 16, 30);
    g.rect(tx, tTop, 4, tH).fill(shade(0xdfe8ee));
    g.rect(tx + 1, tTop + 1, 2, tH - 2).fill(shade(0xf8fafb));
    const mercury = Math.round((tH - 7) * clamp((state.water.temperatureC - 14) / 20, 0.05, 1));
    g.rect(tx + 1, tTop + tH - 4 - mercury, 1, mercury).fill(shade(0xe0443a));
    g.rect(tx + 1, tTop + tH - 4, 2, 3).fill(shade(0xe0443a));
    g.rect(tx + 1, tTop - 2, 2, 2).fill(EQUIP);

    if (hasFilter) {
      const tubeX = right - 10;
      const tubeEnd = geo.sandTop - Math.round(height * 0.3);
      g.rect(tubeX, top, 3, tubeEnd - top).fill(EQUIP);
      g.rect(tubeX, top, 1, tubeEnd - top).fill(EQUIP_HI);
      g.rect(tubeX - 1, tubeEnd, 5, 9).fill(EQUIP);
      for (let yy = tubeEnd + 1; yy < tubeEnd + 8; yy += 2) g.rect(tubeX, yy, 3, 1);
      g.fill(EQUIP_HI);
    }
  }

  /** Arma el sustrato, las maderas, las rocas y las plantas desde los datos. */
  private buildDecor(pxPerCm: number): void {
    const inner = this.inner;
    const key = `${inner.x},${inner.y},${inner.width},${inner.height},${JSON.stringify(this.decor)}`;
    if (key === this.decorKey) return;
    this.decorKey = key;
    const bottom = inner.y + inner.height;
    const sandH = clamp(Math.round((inner.height / PX) * 0.15), 10, 18) * PX;

    this.substrate.texture = tex(this.decor.substrate);
    this.substrate.position.set(inner.x, bottom - sandH);
    this.substrate.width = inner.width;
    this.substrate.height = sandH;

    for (const layer of [this.hardscape, this.plants]) {
      for (const child of layer.removeChildren()) child.destroy();
    }
    for (const item of this.decor.items) {
      const name = item.plant ? `${item.plant}-${item.stage ?? 1}` : (item.asset ?? '');
      const texture = tex(name);
      if (!asset(name)) continue;
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 1);
      const scale = (item.widthCm * pxPerCm) / texture.width;
      sprite.scale.set(item.flip ? -scale : scale, scale);
      const half = (texture.width * scale) / 2;
      sprite.position.set(
        Math.round(clamp(inner.x + item.x * inner.width, inner.x + half, inner.x + inner.width - half)),
        Math.round(bottom - sandH + 8 + (item.sink ?? 0) * texture.height * scale),
      );
      (item.plant ? this.plants : this.hardscape).addChild(sprite);
    }
  }

  /** Detrás de los peces: residuos sobre el fondo y burbujas del filtro. */
  private drawMid(state: SimState, derived: DerivedValues, geo: Geo, shade: (c: number) => number, seconds: number): void {
    const g = this.mid;
    g.clear();
    const { left, width, waterTop, waterHeight, sandTop, sandH } = geo;

    const detritus = Math.min(80, Math.round(state.organics.detritusG * 8));
    for (let i = 0; i < detritus; i++) {
      g.rect(left + 1 + Math.floor(scatter(i, 3) * (width - 3)), sandTop - 1 + Math.floor(scatter(i, 4) * 4), 2, 1);
    }
    if (detritus > 0) g.fill(shade(0x4a3a26));
    const food = Math.min(60, Math.ceil(state.organics.foodG * 20));
    for (let i = 0; i < food; i++) {
      g.rect(left + 6 + Math.floor(scatter(i, 5) * (width - 14)), sandTop - 1 + Math.floor(scatter(i, 6) * 3), 2, 2);
    }
    if (food > 0) g.fill(shade(0xd9703a));

    // Burbujas que suben junto a la toma del filtro, serpenteando.
    if (state.filter.flowLph > 0 && derived.effectiveFlowLph > 1 && waterHeight > sandH + 6) {
      const strength = Math.min(1, derived.effectiveFlowLph / state.filter.flowLph);
      const colX = geo.right - 16;
      const from = sandTop - Math.round(geo.height * 0.3) + 6;
      const travel = from - waterTop - 2;
      const bubbles = Math.round(8 + strength * 14);
      for (let i = 0; i < bubbles; i++) {
        const phase = (seconds * (0.22 + scatter(i, 9) * 0.3) + scatter(i, 10)) % 1;
        const bx = colX + Math.round(Math.sin(phase * 11 + i) * 2 + (scatter(i, 12) - 0.5) * 5);
        const size = scatter(i, 13) > 0.65 && phase > 0.3 ? 2 : 1;
        g.rect(bx, from - Math.round(travel * phase), size, size);
      }
      g.fill({ color: 0xffffff, alpha: derived.lightOn ? 0.75 : 0.4 });
    }
  }

  /** Delante de los peces: tinte del agua, rayos de luz, partículas, brillos y algas. */
  private drawFx(state: SimState, geo: Geo, shade: (c: number) => number, lit: boolean, seconds: number): void {
    const g = this.fx;
    g.clear();
    const { left, right, width, waterTop, waterHeight, sandH } = geo;
    if (waterHeight <= 0) return;
    const tannins = state.water.tannins;

    // Tinte del agua sobre todo lo que está adentro.
    g.rect(left, waterTop, width, waterHeight).fill({
      color: this.waterColor(lit, tannins, 0.5),
      alpha: 0.12 + 0.18 * tannins,
    });

    // Rayos de luz que bajan desde la tapa, abriéndose y respirando.
    if (lit && waterHeight > 12) {
      const rays = Math.max(3, Math.round(width / 26));
      const mid = left + width / 2;
      for (let i = 0; i < rays; i++) {
        const baseX = left + ((i + 0.5) * width) / rays + Math.sin(seconds * 0.15 + i * 2) * 5;
        const wd = 4 + 5 * scatter(i, 81);
        const alpha = 0.06 + 0.04 * Math.sin(seconds * 0.6 + i * 1.9);
        const slant = 0.4 * ((baseX - mid) / width) + 0.05;
        const len = (waterHeight - sandH * 0.5) * (0.6 + 0.35 * scatter(i, 82));
        const half = Math.round(len * 0.55);
        let pending = 0;
        for (let yy = 0; yy < len; yy += 3) {
          const x0 = clamp(Math.round(baseX + slant * yy), left, right);
          const x1 = clamp(Math.round(baseX + slant * yy + wd + yy * 0.05), left, right);
          if (x1 > x0) {
            g.rect(x0, waterTop + 1 + yy, x1 - x0, Math.min(3, len - yy));
            pending++;
          }
          if (yy < half && yy + 3 >= half && pending > 0) {
            g.fill({ color: 0xdcfff0, alpha });
            pending = 0;
          }
        }
        if (pending > 0) g.fill({ color: 0xdcfff0, alpha: alpha * 0.5 });
      }
    }

    // Partículas en suspensión, a la deriva.
    const column = Math.max(1, waterHeight - sandH - 3);
    const specks = Math.min(60, Math.round((width * column) / 260));
    for (let i = 0; i < specks; i++) {
      const drift = (i % 3 === 0 ? -1 : 1) * (0.5 + scatter(i, 83));
      const py = (((scatter(i, 84) * column + seconds * drift) % column) + column) % column;
      const px = left + 2 + scatter(i, 85) * (width - 5) + Math.sin(seconds * 0.25 + i) * 3;
      g.rect(clamp(Math.round(px), left, right - 1), waterTop + 2 + Math.floor(py), 1, 1);
    }
    if (specks > 0) g.fill({ color: 0xeafff4, alpha: lit ? 0.4 : 0.14 });

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
    const algaeSpecks = Math.round(Math.min(1, state.algae.glass) * width * 0.8);
    const algaeArea = Math.max(1, waterHeight - sandH - 4);
    for (let i = 0; i < algaeSpecks; i++) {
      g.rect(left + Math.floor(scatter(i, 7) * (width - 2)), waterTop + 2 + Math.floor(scatter(i, 8) * algaeArea), 2, 2);
    }
    if (algaeSpecks > 0) g.fill({ color: shade(0x3fae4a), alpha: 0.8 });
  }
}
