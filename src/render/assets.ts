/**
 * Carga del arte generado por `npm run assets` (public/assets/): el manifest
 * y todas sus texturas. Hay que esperar a `loadAssets()` antes de armar la escena.
 */

import { Assets, Texture } from 'pixi.js';

export interface AssetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AssetEntry {
  file: string;
  width: number;
  height: number;
  source: string;
  /** sprite, plant, glass, glass-back, background, wind-plant o frame. */
  kind: string;
  /** Píxeles del PNG por píxel del dibujo (para dibujar todo con el mismo tamaño de píxel). */
  artPx?: number;
  /** Cuadro de animación: nombre de la animación (gato-caminar) y número de cuadro (desde 1). */
  anim?: string;
  frame?: number;
  /** Animación en tira (videos del gato): cuadros, su tamaño, velocidad y punto de apoyo. */
  frames?: number;
  frameWidth?: number;
  frameHeight?: number;
  fps?: number;
  loop?: boolean;
  anchor?: { x: number; y: number };
  /** Fondo: el hueco transparente (los vidrios de la ventana). */
  hole?: AssetRect;
  /** Vidrio: dónde va el agua y dónde está la tira de luz. */
  inner?: AssetRect;
  led?: AssetRect;
  /** Planta con viento: dónde va sobre su fondo. */
  of?: string;
  x?: number;
  y?: number;
  /** Planta de pecera: especie y etapa de crecimiento (1 = chica). */
  plant?: string;
  stage?: number;
  stages?: number;
}

let entries: Record<string, AssetEntry> = {};
const textures = new Map<string, Texture>();

export async function loadAssets(): Promise<void> {
  const base = `${import.meta.env.BASE_URL}assets/`;
  const response = await fetch(`${base}manifest.json`);
  if (!response.ok) throw new Error('Falta public/assets/manifest.json: corré "npm run assets".');
  entries = ((await response.json()) as { assets: Record<string, AssetEntry> }).assets;
  await Promise.all(
    Object.entries(entries).map(async ([name, entry]) => {
      const texture = await Assets.load<Texture>(base + entry.file);
      texture.source.scaleMode = 'nearest';
      textures.set(name, texture);
    }),
  );
}

export function tex(name: string): Texture {
  return textures.get(name) ?? Texture.EMPTY;
}

export function asset(name: string): AssetEntry | undefined {
  return entries[name];
}

/** Nombres de los assets de un tipo (por ejemplo, las plantas con viento de un fondo). */
export function assetNames(kind: string, of?: string): string[] {
  return Object.keys(entries).filter((name) => {
    const entry = entries[name] as AssetEntry;
    return entry.kind === kind && (of === undefined || entry.of === of);
  });
}
