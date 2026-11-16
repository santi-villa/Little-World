// Videos del gato -> animaciones en pixel art, para scripts/build-assets.mjs.
//
// Cada video se corta en clips (acciones) definidos en assets.config.json. Para
// cada cuadro: se quita el magenta, se erosiona 1 px el borde (el halo rosado) y
// se queda solo con la mancha más grande (el gato: afuera platos y motas).
//
// Nitidez: el video es pixel art agrandado, así que se mide su grilla (cuántos
// píxeles del video mide un píxel del dibujo, ~9.5 en 1920x1080) y cada píxel
// del dibujo se toma del centro de su celda (vecino más cercano, con una
// mediana de 3x3 contra el ruido del video). No se promedia ni se pasa por una
// paleta común: los colores quedan como en el video.
//
// Cada clip sale como una tira PNG con 1 píxel por píxel del dibujo, alineada
// por los pies: todos los clips de un video comparten el mismo punto de apoyo
// (el gato sentado del cuadro de referencia).
//
// Necesita ffmpeg instalado.

import { execFileSync } from 'node:child_process';

/** Reducción previa con ffmpeg, con vecino más cercano (la grilla queda en ~4.7 px). */
const PRE = 2;

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
    ['-v', 'error', '-ss', String(from), '-to', String(to), '-i', path, '-vf', `fps=${fps},scale=${width}:${height}:flags=neighbor`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
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
 * Mide la grilla del pixel art en un cuadro: el tamaño de celda y su desfase,
 * buscando el período en el que más se alinean los bordes de color del gato.
 */
function measureGrid(rgb, mask, width, height) {
  const xs = [];
  const ys = [];
  const diff = (a, b) => Math.abs(rgb[a] - rgb[b]) + Math.abs(rgb[a + 1] - rgb[b + 1]) + Math.abs(rgb[a + 2] - rgb[b + 2]);
  for (let y = 1; y < height; y++) {
    for (let x = 1; x < width; x++) {
      const p = y * width + x;
      if (!mask[p] || !mask[p - 1] || !mask[p - width]) continue;
      if (diff(p * 3, (p - 1) * 3) > 90) xs.push(x);
      if (diff(p * 3, (p - width) * 3) > 90) ys.push(y);
    }
  }
  const fit = (values, p) => {
    let c = 0;
    let s = 0;
    for (const v of values) {
      const a = ((v % p) / p) * 2 * Math.PI;
      c += Math.cos(a);
      s += Math.sin(a);
    }
    const r = Math.hypot(c, s) / Math.max(1, values.length);
    const phase = (((Math.atan2(s, c) / (2 * Math.PI)) * p) % p + p) % p;
    return { r, phase };
  };
  let best = { score: -1, cell: 4, phaseX: 0, phaseY: 0 };
  for (let cell = 2.5; cell <= 9; cell += 0.02) {
    const fx = fit(xs, cell);
    const fy = fit(ys, cell);
    const score = fx.r + fy.r;
    if (score > best.score) best = { score, cell, phaseX: fx.phase, phaseY: fy.phase };
  }
  return best;
}

/**
 * Reduce a la grilla del dibujo con vecino más cercano: cada píxel de salida es
 * el centro de su celda (mediana de 3x3 para que el ruido del video no ensucie).
 */
function sampleGrid(rgb, mask, width, height, grid) {
  const { cell, phaseX, phaseY } = grid;
  const ow = Math.floor((width - phaseX) / cell);
  const oh = Math.floor((height - phaseY) / cell);
  const out = new Uint8Array(ow * oh * 4);
  const r = [];
  const g = [];
  const b = [];
  const median = (list) => list.sort((p, q) => p - q)[list.length >> 1];
  for (let oy = 0; oy < oh; oy++) {
    const cy = Math.floor(phaseY + (oy + 0.5) * cell);
    for (let ox = 0; ox < ow; ox++) {
      const cx = Math.floor(phaseX + (ox + 0.5) * cell);
      r.length = 0;
      g.length = 0;
      b.length = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const p = y * width + x;
          if (!mask[p]) continue;
          r.push(rgb[p * 3]);
          g.push(rgb[p * 3 + 1]);
          b.push(rgb[p * 3 + 2]);
        }
      }
      // Opaco si el centro de la celda es del gato (y la mayoría alrededor).
      if (r.length < 5 || !mask[cy * width + cx]) continue;
      const o = (oy * ow + ox) * 4;
      out[o] = median(r);
      out[o + 1] = median(g);
      out[o + 2] = median(b);
      out[o + 3] = 255;
    }
  }
  return { data: out, width: ow, height: oh };
}

/**
 * Procesa un grupo de videos (todos los de una carpeta comparten paleta).
 * @param videos [{ path, rel, cfg }]
 * @returns clips listos para guardar: { name, frames: [{data,width,height}], anchor, fps, loop }
 */
export function processVideos(videos) {
  const clips = [];
  // Primero se mide la grilla de cada video (en el cuadro de referencia: el gato sentado).
  const measured = videos.map(({ path, rel, cfg }) => {
    const ref = readFrames(path, cfg.refTime, cfg.refTime + 0.2, 5);
    const refMask = catMask(ref.frames[0], ref.width, ref.height);
    const refBox = bbox(refMask, ref.width, ref.height);
    if (!refBox) throw new Error(`${rel}: no encontré al gato en el cuadro de referencia`);
    const grid = cfg.cell ? { cell: cfg.cell, phaseX: cfg.phaseX ?? 0, phaseY: cfg.phaseY ?? 0 } : measureGrid(ref.frames[0], refMask, ref.width, ref.height);
    return { refBox, grid, sitting: (refBox.y1 - refBox.y0 + 1) / grid.cell };
  });
  // El gato tiene que medir lo mismo en todos: si un video da más de 3% distinto
  // (la grilla se midió mal o el video está más cerca), su celda se ajusta a la mediana.
  const heights = measured.map((m) => m.sitting).sort((a, b) => a - b);
  const target = heights[heights.length >> 1] ?? 70;
  for (const m of measured) {
    if (Math.abs(m.sitting / target - 1) > 0.03) {
      m.grid = { ...m.grid, cell: m.grid.cell * (m.sitting / target) };
      m.sitting = target;
    }
  }
  for (const [index, { path, rel, cfg }] of videos.entries()) {
    const fps = cfg.fps ?? 12;
    const { refBox, grid } = measured[index];
    const toGrid = (v, phase) => (v - phase) / grid.cell;
    const anchorX = toGrid((refBox.x0 + refBox.x1 + 1) / 2, grid.phaseX);
    const groundY = toGrid(refBox.y1 + 1, grid.phaseY);
    const sitting = (refBox.y1 - refBox.y0 + 1) / grid.cell;
    console.log(`  ${rel}: celda de ${(grid.cell * PRE).toFixed(2)} px del video, gato sentado de ${sitting.toFixed(1)} px del dibujo`);
    for (const clip of cfg.clips) {
      const { frames, width, height } = readFrames(path, clip.from, clip.to, fps);
      const small = frames.map((rgb) => sampleGrid(rgb, catMask(rgb, width, height), width, height, grid));
      clips.push({ name: clip.name, loop: clip.loop ?? false, fps, frames: small, anchorX, groundY, source: rel, sitting });
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
      sitting: clip.sitting,
    };
  });
}
