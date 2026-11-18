import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const assets = new URL('../public/assets/', import.meta.url).pathname;
const manifest = new URL('../src/data/illustrated-assets.json', import.meta.url);
const output = assets + 'room/decor/layers/';
await mkdir(output, { recursive: true });

// Use the front face of the approved shell. Level the rim and mirror its
// narrow left bevel to replace the seam with the original right side panel.
const { data, info } = await sharp(assets + 'aquarium/shell.png').raw().toBuffer({ resolveWithObject: true });
const width = 949, height = 550;
const face = Buffer.alloc(width * height * 4);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const edge = Math.max(0, Math.min(1, (x - (width - 38)) / 27));
    const blend = edge * edge * (3 - 2 * edge);
    const target = (y * width + x) * 4;
    for (let c = 0; c < 4; c++) {
      const sample = sx => {
        const sy = y + 5 * (1 - sx / width) * (1 - y / height);
        const row = Math.floor(sy);
        const offset = (row * info.width + sx) * 4 + c;
        return data[offset] * (1 - sy + row) + data[offset + info.width * 4] * (sy - row);
      };
      face[target + c] = Math.round(sample(x) * (1 - blend) + sample(width - 1 - x) * blend);
    }
  }
}
await sharp(face, { raw: { width, height, channels: 4 } }).png().toFile(assets + 'aquarium/front-frame.png');

const sheet = process.argv[2];
if (sheet) {
  const { width: w, height: h } = await sharp(sheet).metadata();
  const cw = Math.floor(w / 2), ch = Math.floor(h / 2);
  for (const [index, name] of ['sage-foliage', 'trailing-foliage', 'ivory-pot', 'clay-pot'].entries()) {
    const { data, info } = await sharp(sheet)
      .extract({ left: (index % 2) * cw, top: Math.floor(index / 2) * ch, width: cw, height: ch })
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let x0 = cw, y0 = ch, x1 = 0, y1 = 0;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const alpha = (y * cw + x) * 4 + 3;
        if (data[alpha] < 12) data[alpha] = 0;
        if (data[alpha] && data[alpha] >= 32) {
          x0 = Math.min(x0, x); y0 = Math.min(y0, y);
          x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
      }
    }
    if (x1 <= x0 || y1 <= y0) throw new Error(`Sprite vacío: ${name}`);
    await sharp(data, { raw: info })
      .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
      .resize({ width: 440, withoutEnlargement: true })
      .png().toFile(output + name + '.png');
  }
}

const files = {
  'illustrated-bedroom': 'room/bedroom.png',
  'illustrated-frame': 'aquarium/front-frame.png',
  'sage-foliage': 'room/decor/layers/sage-foliage.png',
  'trailing-foliage': 'room/decor/layers/trailing-foliage.png',
  'ivory-pot': 'room/decor/layers/ivory-pot.png',
  'clay-pot': 'room/decor/layers/clay-pot.png',
  'brass-lamp': 'room/decor/layers/brass-lamp.png',
  'sleeping-tabby': 'room/decor/layers/sleeping-tabby.png',
  'fine-ripples': 'aquarium/substrate/fine-ripples.jpg',
  'warm-sand': 'aquarium/substrate/warm-sand.jpg',
  'pale-sand': 'aquarium/substrate/pale-sand.jpg',
  'narrow-leaf': 'aquarium/plants/narrow-leaf.png',
  'broad-leaf': 'aquarium/plants/broad-leaf.png',
  'green-stem': 'aquarium/plants/green-stem.png',
  'arching-leaf': 'aquarium/plants/arching-leaf.png',
  'low-branch': 'aquarium/driftwood/low-branch.png',
  'upright-root': 'aquarium/driftwood/upright-root.png',
  'mossy-river-stone': 'aquarium/rocks/mossy-river-stone.png',
  'rounded-stone': 'aquarium/rocks/rounded-stone.png',
  'layered-stone': 'aquarium/rocks/layered-stone.png',
};
const entries = {};
for (const [id, file] of Object.entries(files)) {
  const { width, height } = await sharp(assets + file).metadata();
  entries[id] = { file, width, height, source: file, kind: 'illustrated' };
}
await writeFile(manifest, JSON.stringify(entries, null, 2) + '\n');
