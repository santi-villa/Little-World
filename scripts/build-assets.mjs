// Pipeline de arte: convierte las imágenes de assets/raw/ (JPG con fondo magenta)
// en PNG transparentes listos para el juego, en public/assets/, y escribe
// public/assets/manifest.json.
//
// Uso: npm run assets
//
// Procesa TODO lo que haya en assets/raw/ (también en subcarpetas), así que una
// imagen nueva se procesa sola: sin configuración se le quita el magenta, se
// separan las piezas y se nombran <archivo>-1, <archivo>-2... (o <archivo> si
// es una sola). En assets/raw/assets.config.json se pueden dar nombres y
// opciones por archivo:
//   mode       "sprites" (por defecto) | "glass" | "background" | "sheet"
//   skip       true para no procesar ese archivo (con "why" explicando por qué)
//   sourceArtPx  cuántos píxeles del original mide un píxel del dibujo (por
//              defecto 4 en las hojas de 1376 px y 5.4 en las de 2576). Con eso
//              el manifest dice `artPx`: cuántos píxeles del PNG mide un píxel
//              del dibujo, para dibujar todo con el mismo tamaño de píxel.
//   names      nombres de las piezas, en orden de lectura (filas, de izq. a der.)
//   name       nombre base para numerar (madera -> madera-1, madera-2...)
//   order      "rows" (por defecto) | "x" (de izquierda a derecha)
//   scale      factor de reducción de la salida (por defecto 0.5)
//   gap        separación mínima entre piezas, en px del original (por defecto 14)
//   tolerance  cuánto magenta se tolera antes de borrar (por defecto 60)
// Las imágenes de una carpeta "plantas" son etapas de crecimiento: se ordenan
// de izquierda a derecha (chica -> grande) y se numeran <planta>-1/2/3.
//
// Modo "sheet" (hojas de animación, como el gato): `rows` dice, fila por fila,
// el nombre de la animación, cuántos cuadros tiene y cuáles descartar
// ({ "anim": "sentado", "frames": 4, "discard": [3] }, contando desde 1). Cada
// cuadro sale como <name>-<anim>-<n>.png; todos los de una animación tienen el
// mismo tamaño y están alineados por la base (los pies), así no saltan.

import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { basename, dirname, extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'assets', 'raw');
const OUT = join(ROOT, 'public', 'assets');
const CONFIG_PATH = join(RAW, 'assets.config.json');
const IMAGE = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const config = existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) : {};
const fileConfig = config.files ?? {};

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...walk(path));
    else if (IMAGE.has(extname(entry).toLowerCase())) found.push(path);
  }
  return found;
}

/** Cuán magenta es un píxel: 0 nada .. 255 magenta puro. */
const magenta = (r, g, b) => Math.max(0, Math.min(r, b) - g);

async function loadRgba(input) {
  const { data, info } = await input.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function savePng(img, rect, scale, outFile) {
  const { data, width } = img;
  const piece = Buffer.alloc(rect.w * rect.h * 4);
  for (let y = 0; y < rect.h; y++) {
    const from = ((rect.y + y) * width + rect.x) * 4;
    data.copy(piece, y * rect.w * 4, from, from + rect.w * 4);
  }
  if (rect.keep) {
    // Solo los píxeles de esta pieza (por si la caja pisa a una vecina).
    for (let y = 0; y < rect.h; y++) {
      for (let x = 0; x < rect.w; x++) if (!rect.keep(rect.x + x, rect.y + y)) piece[(y * rect.w + x) * 4 + 3] = 0;
    }
  }
  const w = Math.max(1, Math.round(rect.w * scale));
  const h = Math.max(1, Math.round(rect.h * scale));
  mkdirSync(dirname(outFile), { recursive: true });
  await sharp(piece, { raw: { width: rect.w, height: rect.h, channels: 4 } })
    .resize(w, h, { kernel: 'nearest', fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toFile(outFile);
  return { width: w, height: h };
}

/** Borra el magenta (recorte duro) y limpia el halo rosado de los bordes. */
function keyHard(img, tolerance) {
  const { data } = img;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const m = magenta(r, g, b);
    if (m > tolerance && r > 100 && b > 100) {
      data[i + 3] = 0;
    } else if (m > 18) {
      // Borde contaminado por la compresión: se le saca el tinte magenta.
      data[i] = Math.min(r, g + 18);
      data[i + 2] = Math.min(b, g + 18);
    }
  }
}

/** Vidrio: el magenta pasa a transparencia parcial, así los reflejos quedan translúcidos. */
function keyGlass(img, opacity) {
  const { data } = img;
  for (let i = 0; i < data.length; i += 4) {
    const m = magenta(data[i], data[i + 1], data[i + 2]);
    if (m < 24) continue;
    let a = 1 - (m / 255) * 1.12;
    if (a < 0.1) {
      data[i + 3] = 0;
      continue;
    }
    a = Math.min(1, a);
    const un = (v) => Math.max(0, Math.min(255, Math.round((v - (1 - a) * 255) / a)));
    data[i] = un(data[i]);
    data[i + 1] = Math.min(255, Math.round(data[i + 1] / a));
    data[i + 2] = un(data[i + 2]);
    data[i + 3] = Math.round(255 * a * opacity);
  }
}

function contentBox(img, x0 = 0, y0 = 0, x1 = img.width, y1 = img.height, minAlpha = 1) {
  let minX = x1;
  let minY = y1;
  let maxX = -1;
  let maxY = -1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] < minAlpha) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Separa las piezas: celdas ocupadas vecinas forman una pieza. */
function findPieces(img, gap) {
  const { data, width, height } = img;
  const cell = Math.max(4, Math.round(gap));
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const filled = new Uint32Array(cols * rows);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) filled[Math.floor(y / cell) * cols + Math.floor(x / cell)]++;
    }
  }
  const label = new Int32Array(cols * rows).fill(-1);
  const pieces = [];
  for (let start = 0; start < filled.length; start++) {
    if (!filled[start] || label[start] >= 0) continue;
    const id = pieces.length;
    const stack = [start];
    label[start] = id;
    let area = 0;
    let c0 = cols;
    let c1 = 0;
    let r0 = rows;
    let r1 = 0;
    while (stack.length) {
      const cur = stack.pop();
      const cx = cur % cols;
      const cy = (cur - cx) / cols;
      area += filled[cur];
      c0 = Math.min(c0, cx);
      c1 = Math.max(c1, cx);
      r0 = Math.min(r0, cy);
      r1 = Math.max(r1, cy);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const n = ny * cols + nx;
          if (filled[n] && label[n] < 0) {
            label[n] = id;
            stack.push(n);
          }
        }
      }
    }
    const keep = (x, y) => label[Math.floor(y / cell) * cols + Math.floor(x / cell)] === id;
    const box = contentBoxOf(img, c0 * cell, r0 * cell, Math.min(width, (c1 + 1) * cell), Math.min(height, (r1 + 1) * cell), keep);
    if (box) pieces.push({ ...box, area, keep });
    else pieces.push(null);
  }
  // Motas sueltas de la compresión: afuera.
  const minArea = width * height * 0.0004;
  return pieces.filter((p) => p && p.area >= minArea);
}

function contentBoxOf(img, x0, y0, x1, y1, keep) {
  let minX = x1;
  let minY = y1;
  let maxX = -1;
  let maxY = -1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] === 0 || !keep(x, y)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Orden de lectura: por filas y, dentro de cada fila, de izquierda a derecha. */
function readingOrder(pieces) {
  const left = [...pieces].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const rows = [];
  for (const p of left) {
    const cy = p.y + p.h / 2;
    const row = rows.find((r) => cy >= r.top && cy <= r.bottom);
    if (row) row.items.push(p);
    else rows.push({ top: p.y, bottom: p.y + p.h, items: [p] });
  }
  return rows.flatMap((r) => r.items.sort((a, b) => a.x - b.x));
}

const manifest = { generated: 'npm run assets', assets: {} };

/** Píxeles del PNG por píxel del dibujo. */
function artPxOf(cfg, sourceWidth, scale) {
  const source = cfg.sourceArtPx ?? (sourceWidth >= 2000 ? 5.4 : 4);
  return Math.round(source * scale * 100) / 100;
}

function register(name, file, size, source, extra = {}) {
  if (manifest.assets[name]) throw new Error(`Nombre de asset repetido: ${name} (${source})`);
  manifest.assets[name] = { file: file.split(sep).join('/'), width: size.width, height: size.height, source, ...extra };
}

async function processSprites(path, rel, cfg) {
  const img = await loadRgba(sharp(path));
  keyHard(img, cfg.tolerance ?? 60);
  const dir = dirname(rel);
  const base = basename(rel);
  const isPlant = dir.split(sep).includes('plantas');
  const scaleRef = img.width / 1376;
  let pieces = findPieces(img, (cfg.gap ?? 14) * scaleRef);
  pieces = (cfg.order ?? (isPlant ? 'x' : 'rows')) === 'x' ? pieces.sort((a, b) => a.x - b.x) : readingOrder(pieces);
  const scale = cfg.scale ?? 0.5;
  const stem = cfg.name ?? base;
  for (let i = 0; i < pieces.length; i++) {
    const name = cfg.names?.[i] ?? (pieces.length === 1 ? stem : `${stem}-${i + 1}`);
    const file = join(dir, `${name}.png`);
    const size = await savePng(img, pieces[i], scale, join(OUT, file));
    const extra = { kind: isPlant ? 'plant' : 'sprite', artPx: artPxOf(cfg, img.width, scale) };
    if (isPlant) Object.assign(extra, { plant: stem, stage: i + 1, stages: pieces.length });
    register(name, file, size, rel, extra);
  }
  return pieces.length;
}

async function processGlass(path, rel, cfg) {
  const img = await loadRgba(sharp(path));
  keyGlass(img, cfg.opacity ?? 0.7);
  // La caja sale del marco (lo opaco), no de los restos tenues del fondo.
  const box = contentBox(img, 0, 0, img.width, img.height, 128);
  const scale = cfg.scale ?? 0.25;
  const name = cfg.name ?? basename(rel);
  // Lo que se ve a través del agua (las aristas del vidrio de atrás y la parte
  // de abajo de la tapa) va en una capa aparte, que se dibuja detrás del agua.
  // Adelante quedan el marco y los reflejos claros.
  const back = { data: Buffer.alloc(img.data.length), width: img.width, height: img.height };
  if (cfg.inner) {
    const [ix0, iy0, ix1, iy1] = cfg.inner;
    for (let y = iy0; y < iy1; y++) {
      for (let x = ix0; x < ix1; x++) {
        const i = (y * img.width + x) * 4;
        const d = img.data;
        const light = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
        // Los reflejos son casi blancos; las aristas de atrás, gris azulado.
        if (d[i + 3] < 40 || light >= 214) continue;
        d.copy(back.data, i, i, i + 4);
        d[i + 3] = 0;
      }
    }
  }
  const file = join(dirname(rel), `${name}.png`);
  const size = await savePng(img, box, scale, join(OUT, file));
  const backFile = join(dirname(rel), `${name}-fondo.png`);
  const backSize = await savePng(back, box, scale, join(OUT, backFile));
  // El hueco (donde va el agua) y otras medidas vienen en px del original.
  const extra = { kind: 'glass', artPx: artPxOf(cfg, img.width, scale) };
  for (const key of ['inner', 'led']) {
    const r = cfg[key];
    if (r) {
      extra[key] = {
        x: Math.round((r[0] - box.x) * scale),
        y: Math.round((r[1] - box.y) * scale),
        width: Math.round((r[2] - r[0]) * scale),
        height: Math.round((r[3] - r[1]) * scale),
      };
    }
  }
  register(name, file, size, rel, extra);
  register(`${name}-fondo`, backFile, backSize, rel, { kind: 'glass-back', of: name, artPx: extra.artPx });
  return 2;
}

/** Hoja de animación: filas de cuadros sobre magenta. */
async function processSheet(path, rel, cfg) {
  const img = await loadRgba(sharp(path));
  const { data, width: W, height: H } = img;
  // Magenta: solo el del fondo (los rosas de la lengua o la nariz tienen bastante verde).
  const isKey = (r, g, b) => r > 150 && b > 150 && g < 110 && Math.abs(r - b) < 70;
  for (let i = 0; i < data.length; i += 4) {
    if (isKey(data[i], data[i + 1], data[i + 2])) data[i + 3] = 0;
  }
  // Borde: lo que quedó teñido de magenta al lado del fondo se limpia.
  const at = (x, y) => (y * W + x) * 4;
  const nearKey = (x, y) =>
    (x > 0 && data[at(x - 1, y) + 3] === 0) ||
    (x < W - 1 && data[at(x + 1, y) + 3] === 0) ||
    (y > 0 && data[at(x, y - 1) + 3] === 0) ||
    (y < H - 1 && data[at(x, y + 1) + 3] === 0);
  const fringe = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = at(x, y);
      if (data[i + 3] === 0 || !nearKey(x, y)) continue;
      const tint = Math.min(data[i], data[i + 2]) - data[i + 1];
      if (tint > 40) fringe.push(i);
    }
  }
  for (const i of fringe) {
    const light = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (light < 90) {
      // Contorno oscuro mezclado con el fondo: pasa a ser contorno.
      data[i] = 40;
      data[i + 1] = 22;
      data[i + 2] = 16;
    } else {
      data[i + 3] = 0;
    }
  }
  const solid = (x, y) => data[at(x, y) + 3] > 0;

  // Filas: bandas de píxeles opacos separadas por renglones vacíos.
  const spans = (count, isSolid, minRun, minLength) => {
    const out = [];
    let start = -1;
    for (let k = 0; k <= count; k++) {
      const on = k < count && isSolid(k) > minRun;
      if (on && start < 0) start = k;
      if (!on && start >= 0) {
        if (k - start >= minLength) out.push([start, k]);
        start = -1;
      }
    }
    return out;
  };
  const bands = spans(H, (y) => { let n = 0; for (let x = 0; x < W; x += 2) if (solid(x, y)) n++; return n; }, 2, 12);
  const rows = cfg.rows ?? [];
  if (bands.length !== rows.length) throw new Error(`${rel}: hay ${bands.length} filas y el config dice ${rows.length}`);

  const scale = cfg.scale ?? 0.5;
  const name = cfg.name ?? basename(rel);
  const dir = dirname(rel);
  let count = 0;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const [y0, y1] = bands[r];
    const segs = spans(W, (x) => { let n = 0; for (let y = y0; y < y1; y += 2) if (solid(x, y)) n++; return n; }, 1, 8);
    if (segs.length !== row.frames) throw new Error(`${rel}: la fila ${r + 1} tiene ${segs.length} cuadros y el config dice ${row.frames}`);
    // Caja de cada cuadro, y su lugar en la grilla pareja de la hoja (para que no se corran).
    const boxes = segs.map(([x0, x1]) => {
      let top = y1;
      let bottom = y0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (solid(x, y)) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
      return { x0, x1, top, bottom };
    });
    const first = (boxes[0].x0 + boxes[0].x1) / 2;
    const last = (boxes[boxes.length - 1].x0 + boxes[boxes.length - 1].x1) / 2;
    const pitch = boxes.length > 1 ? (last - first) / (boxes.length - 1) : 0;
    const anchors = boxes.map((_, k) => Math.round(first + k * pitch));
    const left = Math.min(...boxes.map((b, k) => b.x0 - anchors[k]));
    const right = Math.max(...boxes.map((b, k) => b.x1 - anchors[k]));
    const height = Math.max(...boxes.map((b) => b.bottom - b.top + 1));
    const fw = right - left;
    const discard = new Set(row.discard ?? []);
    let n = 0;
    for (let k = 0; k < boxes.length; k++) {
      if (discard.has(k + 1)) continue;
      n++;
      const b = boxes[k];
      // Cuadro del mismo tamaño para todos, con los pies en la base.
      const frame = { data: Buffer.alloc(fw * height * 4), width: fw, height };
      const dx = b.x0 - anchors[k] - left;
      const dy = height - 1 - b.bottom;
      for (let y = b.top; y <= b.bottom; y++) {
        for (let x = b.x0; x < b.x1; x++) {
          const i = at(x, y);
          if (data[i + 3] === 0) continue;
          data.copy(frame.data, ((y + dy) * fw + (x - b.x0 + dx)) * 4, i, i + 4);
        }
      }
      const frameName = `${name}-${row.anim}-${n}`;
      const file = join(dir, `${frameName}.png`);
      const size = await savePng(frame, { x: 0, y: 0, w: fw, h: height }, scale, join(OUT, file));
      register(frameName, file, size, rel, { kind: 'frame', anim: `${name}-${row.anim}`, frame: n, artPx: artPxOf(cfg, W, scale) });
      count++;
    }
  }
  return count;
}

async function processBackground(path, rel, cfg) {
  const [W, H] = cfg.size ?? [1280, 720];
  const img = await loadRgba(sharp(path).resize(W, H, { kernel: 'nearest', fit: 'cover' }));
  const { data } = img;
  const name = cfg.name ?? basename(rel);
  const dir = dirname(rel);
  // Hojas: verdes y también oliva (el verde le gana al azul y no pierde con el rojo).
  const isGreen = (i) => {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    return g > 24 && ((g >= r - 6 && g >= b + 14) || (g >= r && g >= b + 8));
  };

  // Plantas que se mueven con el viento: sus hojas se copian a una capa propia
  // (y quedan también en el fondo, que asoma debajo cuando la capa se corre).
  const zones = cfg.plantZones ?? [];
  const plantFiles = [];
  for (let z = 0; z < zones.length; z++) {
    const [x0, y0, x1, y1] = zones[z];
    const w = x1 - x0;
    const h = y1 - y0;
    const layer = Buffer.alloc(w * h * 4);
    // Máscara de hojas: lo verde, más los contornos oscuros pegados a lo verde.
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) if (isGreen(((y + y0) * W + x + x0) * 4)) mask[y * w + x] = 1;
    }
    const isDark = (i) => Math.max(data[i], data[i + 1], data[i + 2]) < 78 && data[i] < data[i + 1] + 24;
    // Una sola vuelta: el contorno pegado a la hoja, no la pared ni la soga.
    for (let pass = 0; pass < 1; pass++) {
      const grown = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const p = y * w + x;
          if (mask[p] || !isDark(((y + y0) * W + x + x0) * 4)) continue;
          if ((x > 0 && mask[p - 1]) || (x < w - 1 && mask[p + 1]) || (y > 0 && mask[p - w]) || (y < h - 1 && mask[p + w])) grown.push(p);
        }
      }
      for (const p of grown) mask[p] = 1;
    }
    for (let y = y0; y < y1; y++) {
      const on = (x) => mask[(y - y0) * w + (x - x0)] === 1;
      let x = x0;
      while (x < x1) {
        if (!on(x)) {
          x++;
          continue;
        }
        let end = x;
        while (end < x1 && on(end)) end++;
        for (let k = x; k < end; k++) {
          const from = (y * W + k) * 4;
          data.copy(layer, ((y - y0) * w + (k - x0)) * 4, from, from + 4);
        }
        // Las hojas también quedan en el fondo: la capa se corre a lo sumo 1 px,
        // así que debajo asoma la misma hoja y no un relleno inventado (que hacía rayas).
        x = end;
      }
    }
    const plantName = `${name}-planta-${z + 1}`;
    const file = join(dir, `${plantName}.png`);
    mkdirSync(dirname(join(OUT, file)), { recursive: true });
    await sharp(layer, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 9 }).toFile(join(OUT, file));
    plantFiles.push({ name: plantName, file, x: x0, y: y0, w, h });
  }

  // El magenta de los vidrios queda transparente (ahí va el cielo), con 1 px de margen.
  const hole = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    if (magenta(data[i], data[i + 1], data[i + 2]) > (cfg.tolerance ?? 110) && data[i] > 150 && data[i + 2] > 150) hole[p] = 1;
  }
  let minX = W;
  let minY = H;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      const near = hole[p] || (x > 0 && hole[p - 1]) || (x < W - 1 && hole[p + 1]) || (y > 0 && hole[p - W]) || (y < H - 1 && hole[p + W]);
      if (!near) continue;
      data[p * 4 + 3] = 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const file = join(dir, `${name}.png`);
  mkdirSync(dirname(join(OUT, file)), { recursive: true });
  await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toFile(join(OUT, file));
  const extra = { kind: 'background' };
  if (maxX >= 0) extra.hole = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  if (cfg.points) extra.points = cfg.points;
  register(name, file, { width: W, height: H }, rel, extra);
  for (const p of plantFiles) {
    register(p.name, p.file, { width: p.w, height: p.h }, rel, { kind: 'wind-plant', of: name, x: p.x, y: p.y });
  }
  return 1 + plantFiles.length;
}

rmSync(OUT, { recursive: true, force: true });
let total = 0;
for (const path of walk(RAW)) {
  const rel = relative(RAW, path).slice(0, -extname(path).length);
  const cfg = fileConfig[rel.split(sep).join('/')] ?? {};
  if (cfg.skip) {
    console.log(`${rel}: salteado (${cfg.why ?? 'skip en el config'})`);
    continue;
  }
  const mode = cfg.mode ?? 'sprites';
  const count =
    mode === 'background'
      ? await processBackground(path, rel, cfg)
      : mode === 'glass'
        ? await processGlass(path, rel, cfg)
        : mode === 'sheet'
          ? await processSheet(path, rel, cfg)
          : await processSprites(path, rel, cfg);
  total += count;
  console.log(`${rel}: ${count} ${count === 1 ? 'pieza' : 'piezas'}`);
}
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Listo: ${total} imágenes en public/assets/ y manifest.json`);
