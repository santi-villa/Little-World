/** Run with the two source ZIPs extracted into the same directory. */
import { mkdir, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const source = process.argv[2];
if (!source) throw new Error('Uso: node scripts/prepare-room-preview.mjs <directorio extraído>');
const root = new URL('../public/assets/', import.meta.url).pathname;
const sources = (await readdir(source, { recursive: true })).filter(name => name.endsWith('.jpg'));
const art = [
  ['3a40804a', 'room/bedroom.png', 'window'],
  ['d16ca3e6', 'aquarium/shell.png', 'shell'],
  ['2014a2f7', 'room/decor/ceramic-pothos.png'],
  ['256de2e8', 'room/decor/trailing-pothos.png'],
  ['4e465036', 'room/decor/terracotta-pothos.png'],
  ['e9f392fa', 'room/decor/round-pot-pothos.png'],
  ['212f090a', 'aquarium/plants/narrow-leaf.png'],
  ['c3ff3fa5', 'aquarium/plants/arching-leaf.png'],
  ['890b762e', 'aquarium/plants/broad-leaf.png'],
  ['5af527e6', 'aquarium/plants/green-stem.png'],
  ['73651b92', 'aquarium/driftwood/low-branch.png'],
  ['9381f732', 'aquarium/driftwood/upright-root.png'],
  ['4f3e58fc', 'aquarium/driftwood/forked-branch.png'],
  ['9d13b5f3', 'aquarium/driftwood/spreading-root.png'],
  ['6fcec0e0', 'aquarium/rocks/mossy-river-stone.png'],
  ['8e415b40', 'aquarium/rocks/smooth-river-stone.png'],
  ['b9bf8d83', 'aquarium/rocks/layered-stone.png'],
  ['14fc6c72', 'aquarium/rocks/rounded-stone.png'],
  ['d50e6539', 'aquarium/substrate/fine-ripples.jpg', 'sand'],
  ['cbd00b82', 'aquarium/substrate/dune-ripples.jpg', 'sand'],
  ['0493c739', 'aquarium/substrate/pale-sand.jpg', 'sand'],
  ['90bfca48', 'aquarium/substrate/warm-sand.jpg', 'sand'],
];
const clamp = value => Math.max(0, Math.min(1, value));
for (const [id, path, mode] of art) {
  const matches = sources.filter(name => name.endsWith(`_${id}.jpg`));
  if (matches.length !== 1) throw new Error(`Se esperaba un archivo para ${id}`);
  const image = sharp(resolve(source, matches[0])).rotate().toColourspace('srgb');
  const output = resolve(root, path);
  await mkdir(dirname(output), { recursive: true });
  if (mode === 'sand') {
    await image.resize({ width: 800, withoutEnlargement: true }).jpeg({ quality: 88, mozjpeg: true }).toFile(output);
    continue;
  }
  if (mode === 'window') image.resize({ width: 1920, withoutEnlargement: true });
  const { data, info: { width, height } } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = width, right = 0, top = height, bottom = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const [r, g, b] = data.subarray(i, i + 3);
      let white = 0;
      let chroma = 0;
      if (mode !== 'window') {
        const light = Math.min(r, g, b);
        const spread = Math.max(r, g, b) - light;
        white = clamp((light - 217) / 29) * clamp((28 - spread) / 15);
      }
      if (mode === 'window' || mode === 'shell') {
        // The source contains lavender only in the window panes and inside the glass.
        chroma = clamp((r - g - 12) / 13) * clamp((b - g - 8) / 14);
      }
      const alpha = 1 - Math.max(white, chroma);
      data[i + 3] = Math.round(alpha * 255);
      if (alpha > 0 && alpha < 1) {
        if (white >= chroma) {
          for (let c = 0; c < 3; c++) data[i + c] = Math.round(clamp((data[i + c] / 255 - white * 0.985) / alpha) * 255);
        } else {
          // Remove purple spill while retaining the shading of partly covered pixels.
          data[i] = Math.round(r - Math.max(0, r - g) * chroma);
          data[i + 2] = Math.round(b - Math.max(0, b - g) * chroma);
        }
      }
      if (alpha > 0.28) {
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
  }
  const cleaned = sharp(data, { raw: { width, height, channels: 4 } });
  if (mode !== 'window') {
    left = Math.max(0, left - 3); top = Math.max(0, top - 3);
    right = Math.min(width - 1, right + 3); bottom = Math.min(height - 1, bottom + 3);
    cleaned.extract({ left, top, width: right - left + 1, height: bottom - top + 1 });
  }
  const result = await cleaned.resize({ width: mode === 'window' ? 1920 : mode === 'shell' ? 1280 : 550, withoutEnlargement: true })
    .png({ compressionLevel: 9 }).toFile(output);
  console.log(path, result.width, result.height);
}
