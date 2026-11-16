// Videos del gato -> animaciones en pixel art, para scripts/build-assets.mjs.
//
// Cada video se corta en clips (acciones) definidos en assets.config.json. Para
// cada cuadro: se quita el magenta, se erosiona 1 px el borde (el halo rosado),
// se queda solo con la mancha más grande (el gato: afuera platos y motas) y se
// reduce a la grilla del dibujo promediando los píxeles. Después todos los
// cuadros de todos los videos pasan por la misma paleta (así los colores no
// titilan entre cuadros) y cada clip sale como una tira PNG, alineada por los
// pies: todos los clips de un video comparten el mismo punto de apoyo, y entre
// videos se igualan con un cuadro de referencia (el gato sentado), así el gato
// mide siempre lo mismo.
//
// Necesita ffmpeg instalado.

import { execFileSync } from 'node:child_process';

/** Reducción previa con ffmpeg (para no procesar 1920x1080 completos). */
const PRE = 4;

function probe(path) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path]);
  const [w, h] = String(out).trim().split(',').map(Number);
  return { width: Math.round(w / PRE), height: Math.round(h / PRE) };
}

/** Cuadros RGB entre `from` y `to` segundos, a `fps`, ya reducidos PRE veces. */
function readFrames(path, from, to, fps) {
  const { width, height } = probe(path);
  const raw = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-ss', String(from), '-to', String(to), '-i', path, '-vf', `fps=${fps},scale=${width}:${height}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    { maxBuffer: 1024 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const size = width * height * 3;
  const frames = [];
  for (let o = 0; o + size <= raw.length; o += size) frames.push(raw.subarray(o, o + size));
  return { frames, width, height };
}

/** Máscara del gato: sin magenta, erosionada 1 px y solo la mancha más grande. */
function catMask(rgb, width, height) {
  const n = width * height;
  const solid = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const r = rgb[p * 3];
    const g = rgb[p * 3 + 1];
    const b = rgb[p * 3 + 2];
    // El fondo es (240, 48, 224); los rosas del gato (nariz, lengua, almohadillas) tienen más verde.
    const key = r > 160 && b > 140 && g < 120 && Math.abs(r - b) < 70 && r - g > 90;
    solid[p] = key ? 0 : 1;
  }
  const eroded = new Uint8Array(n);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      eroded[p] = solid[p] & solid[p - 1] & solid[p + 1] & solid[p - width] & solid[p + width];
    }
  }
  // La mancha más grande.
  const label = new Int32Array(n).fill(-1);
  let best = -1;
  let bestSize = 0;
  const stack = [];
  for (let start = 0; start < n; start++) {
    if (!eroded[start] || label[start] >= 0) continue;
    const id = start;
    let size = 0;
    stack.push(start);
    label[start] = id;
    while (stack.length) {
      const p = stack.pop();
      size++;
      const x = p % width;
      for (const q of [p - 1, p + 1, p - width, p + width]) {
        if (q < 0 || q >= n || !eroded[q] || label[q] >= 0) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === width - 1)) continue;
        label[q] = id;
        stack.push(q);
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = id;
    }
  }
  const mask = new Uint8Array(n);
  for (let p = 0; p < n; p++) mask[p] = label[p] === best ? 1 : 0;
  return mask;
}

function bbox(mask, width, height) {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/**
 * Reduce a la grilla del dibujo: cada píxel de salida promedia los píxeles del
 * gato que caen adentro; es opaco si el gato cubre al menos la mitad.
 */
function downsample(rgb, mask, width, height, f) {
  const ow = Math.max(1, Math.round(width * f));
  const oh = Math.max(1, Math.round(height * f));
  const out = new Float32Array(ow * oh * 4);
  const step = 1 / f;
  for (let oy = 0; oy < oh; oy++) {
    const sy0 = Math.floor(oy * step);
    const sy1 = Math.min(height, Math.max(sy0 + 1, Math.floor((oy + 1) * step)));
    for (let ox = 0; ox < ow; ox++) {
      const sx0 = Math.floor(ox * step);
      const sx1 = Math.min(width, Math.max(sx0 + 1, Math.floor((ox + 1) * step)));
      let r = 0;
      let g = 0;
      let b = 0;
      let covered = 0;
      let total = 0;
      for (let y = sy0; y < sy1; y++) {
        for (let x = sx0; x < sx1; x++) {
          total++;
          const p = y * width + x;
          if (!mask[p]) continue;
          covered++;
          r += rgb[p * 3];
          g += rgb[p * 3 + 1];
          b += rgb[p * 3 + 2];
        }
      }
      const o = (oy * ow + ox) * 4;
      if (covered * 2 >= total && covered > 0) {
        out[o] = r / covered;
        out[o + 1] = g / covered;
        out[o + 2] = b / covered;
        out[o + 3] = 1;
      }
    }
  }
  return { data: out, width: ow, height: oh };
}

/** Paleta común (k-means sobre una muestra de todos los cuadros). */
function buildPalette(images, colors) {
  const sample = [];
  let seen = 0;
  for (const img of images) {
    for (let o = 0; o < img.data.length; o += 4) {
      if (!img.data[o + 3]) continue;
      seen++;
      if (seen % 7 === 0) sample.push([img.data[o], img.data[o + 1], img.data[o + 2]]);
    }
  }
  if (sample.length === 0) return [[0, 0, 0]];
  const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  sample.sort((a, b) => lum(a) - lum(b));
  let centers = Array.from({ length: Math.min(colors, sample.length) }, (_, i) => [...sample[Math.floor(((i + 0.5) * sample.length) / colors)]]);
  for (let iter = 0; iter < 14; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const c of sample) {
      let best = 0;
      let bestD = Infinity;
      for (let k = 0; k < centers.length; k++) {
        const d = (c[0] - centers[k][0]) ** 2 + (c[1] - centers[k][1]) ** 2 + (c[2] - centers[k][2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      const s = sums[best];
      s[0] += c[0];
      s[1] += c[1];
      s[2] += c[2];
      s[3]++;
    }
    centers = centers.map((c, k) => (sums[k][3] ? [sums[k][0] / sums[k][3], sums[k][1] / sums[k][3], sums[k][2] / sums[k][3]] : c));
  }
  return centers.map((c) => c.map((v) => Math.round(v)));
}

function nearest(palette, r, g, b) {
  let best = palette[0];
  let bestD = Infinity;
  for (const c of palette) {
    const d = (r - c[0]) ** 2 * 3 + (g - c[1]) ** 2 * 4 + (b - c[2]) ** 2 * 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/**
 * Procesa un grupo de videos (todos los de una carpeta comparten paleta).
 * @param videos [{ path, rel, cfg }]
 * @returns clips listos para guardar: { name, frames: [{data,width,height}], anchor, fps, loop }
 */
export function processVideos(videos, { colors = 32, refHeight = 41 } = {}) {
  const clips = [];
  for (const { path, rel, cfg } of videos) {
    const fps = cfg.fps ?? 12;
    // Escala: el gato sentado del cuadro de referencia mide `refHeight` píxeles del dibujo.
    const ref = readFrames(path, cfg.refTime, cfg.refTime + 0.2, 5);
    const refMask = catMask(ref.frames[0], ref.width, ref.height);
    const refBox = bbox(refMask, ref.width, ref.height);
    if (!refBox) throw new Error(`${rel}: no encontré al gato en el cuadro de referencia`);
    const f = (cfg.refHeight ?? refHeight) / (refBox.y1 - refBox.y0 + 1);
    // Punto de apoyo del video: el centro del gato sentado y la línea de sus patas.
    const anchorX = ((refBox.x0 + refBox.x1 + 1) / 2) * f;
    const groundY = (refBox.y1 + 1) * f;
    for (const clip of cfg.clips) {
      const { frames, width, height } = readFrames(path, clip.from, clip.to, fps);
      const small = frames.map((rgb) => downsample(rgb, catMask(rgb, width, height), width, height, f));
      clips.push({ name: clip.name, loop: clip.loop ?? false, fps, frames: small, anchorX, groundY, source: rel });
    }
  }
  // Paleta estable para todos los cuadros.
  const palette = buildPalette(clips.flatMap((c) => c.frames), colors);
  const cache = new Map();
  for (const clip of clips) {
    for (const img of clip.frames) {
      for (let o = 0; o < img.data.length; o += 4) {
        if (!img.data[o + 3]) continue;
        const key = (Math.round(img.data[o]) << 16) | (Math.round(img.data[o + 1]) << 8) | Math.round(img.data[o + 2]);
        let c = cache.get(key);
        if (!c) {
          c = nearest(palette, img.data[o], img.data[o + 1], img.data[o + 2]);
          cache.set(key, c);
        }
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
      }
    }
  }
  // Cada clip: recorte común a todos sus cuadros, con el punto de apoyo adentro.
  return clips.map((clip) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const img of clip.frames) {
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          if (!img.data[(y * img.width + x) * 4 + 3]) continue;
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
      }
    }
    // La base del recorte llega al menos hasta las patas.
    y1 = Math.max(y1, Math.ceil(clip.groundY) - 1);
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const strip = Buffer.alloc(w * clip.frames.length * h * 4);
    clip.frames.forEach((img, k) => {
      for (let y = y0; y <= y1 && y < img.height; y++) {
        for (let x = x0; x <= x1; x++) {
          const o = (y * img.width + x) * 4;
          if (!img.data[o + 3]) continue;
          const d = (((y - y0) * w * clip.frames.length) + k * w + (x - x0)) * 4;
          strip[d] = img.data[o];
          strip[d + 1] = img.data[o + 1];
          strip[d + 2] = img.data[o + 2];
          strip[d + 3] = 255;
        }
      }
    });
    return {
      name: clip.name,
      loop: clip.loop,
      fps: clip.fps,
      source: clip.source,
      frames: clip.frames.length,
      frameWidth: w,
      frameHeight: h,
      strip,
      anchorX: Math.round(clip.anchorX - x0),
      anchorY: Math.round(clip.groundY - y0),
    };
  });
}
