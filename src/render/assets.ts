import bundledEntries from 'virtual:versioned-art';
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
  /** Cursor: la versión 2x y el punto activo (punta del dedo o de la herramienta). */
  file2x?: string;
  hotspot?: { x: number; y: number };
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

export async function loadAssets(illustrated = false): Promise<void> {
  const base = import.meta.env.BASE_URL;
  entries = bundledEntries;
  await Promise.all(
    Object.entries(entries).filter(([, entry]) => illustrated || entry.kind !== 'illustrated').map(async ([name, entry]) => {
      const texture = await Assets.load<Texture>(base + entry.file);
      if(texture.width!==entry.width || texture.height!==entry.height)throw new Error('La imagen no coincide con esta versión: '+name);
      texture.source.scaleMode = entry.kind === 'illustrated' ? 'linear' : 'nearest';
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
