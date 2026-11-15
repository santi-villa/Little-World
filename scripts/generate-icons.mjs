// Genera los íconos de la PWA (pixel art de 32x32 agrandado sin suavizar).
// Uso: npm run icons
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const SIZE = 32;

const COLORS = {
  bg: [0x0b, 0x10, 0x20],
  bgLight: [0x18, 0x22, 0x40],
  glass: [0xa9, 0xcf, 0xe0],
  glassDark: [0x7f, 0xa7, 0xba],
  water: [0x2f, 0x7f, 0xc4],
  waterDeep: [0x24, 0x66, 0xa6],
  surface: [0x8f, 0xd0, 0xff],
  sand: [0xd9, 0xbf, 0x8a],
  sandDark: [0xb8, 0x9c, 0x66],
  plant: [0x3f, 0xae, 0x4a],
  plantDark: [0x2a, 0x7d, 0x39],
  fish: [0xff, 0x8a, 0x3a],
  fishDark: [0xd9, 0x5f, 0x22],
  fishBelly: [0xff, 0xd0, 0x8a],
  eye: [0x14, 0x1a, 0x2e],
  bubble: [0xe6, 0xf6, 0xff],
};

/** Dibuja la escena en una grilla de 32x32 y devuelve los colores por píxel. */
function drawArt() {
  const px = Array.from({ length: SIZE }, () => Array(SIZE).fill(COLORS.bg));
  const rect = (x, y, w, h, color) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px[j][i] = color;
  };
  const dot = (x, y, color) => {
    px[y][x] = color;
  };

  // Resplandor detrás de la pecera.
  rect(3, 5, 26, 23, COLORS.bgLight);

  // Agua, superficie y arena.
  rect(6, 10, 20, 15, COLORS.water);
  rect(6, 18, 20, 7, COLORS.waterDeep);
  rect(6, 10, 20, 1, COLORS.surface);
  rect(6, 22, 20, 3, COLORS.sand);
  for (const [x, y] of [[8, 23], [12, 24], [15, 23], [19, 24], [23, 23]]) dot(x, y, COLORS.sandDark);

  // Vidrio.
  rect(5, 7, 1, 19, COLORS.glass);
  rect(26, 7, 1, 19, COLORS.glass);
  rect(5, 25, 22, 1, COLORS.glassDark);

  // Planta.
  for (const [x, y] of [[9, 21], [9, 20], [8, 19], [9, 18], [10, 17], [9, 16], [8, 15], [9, 14]]) {
    dot(x, y, COLORS.plant);
  }
  for (const [x, y] of [[10, 21], [10, 19], [8, 17], [10, 15]]) dot(x, y, COLORS.plantDark);

  // Pez.
  rect(14, 15, 6, 4, COLORS.fish);
  rect(15, 14, 4, 1, COLORS.fish);
  rect(15, 19, 4, 1, COLORS.fishDark);
  rect(15, 18, 4, 1, COLORS.fishBelly);
  dot(13, 16, COLORS.fish);
  dot(13, 17, COLORS.fish);
  rect(20, 16, 1, 2, COLORS.fishDark);
  rect(21, 15, 1, 4, COLORS.fish);
  rect(22, 14, 1, 6, COLORS.fishDark);
  dot(15, 16, COLORS.eye);

  // Burbujas.
  dot(12, 13, COLORS.bubble);
  dot(11, 11, COLORS.bubble);
  dot(22, 12, COLORS.bubble);
  return px;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** PNG RGB de `size` píxeles: el arte ocupa `artFraction` del lado, centrado. */
function png(art, size, artFraction) {
  const scale = Math.max(1, Math.floor((size * artFraction) / SIZE));
  const offset = Math.floor((size - SIZE * scale) / 2);
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0; // filtro "none"
    for (let x = 0; x < size; x++) {
      const ax = Math.floor((x - offset) / scale);
      const ay = Math.floor((y - offset) / scale);
      const inside = ax >= 0 && ay >= 0 && ax < SIZE && ay < SIZE;
      const [r, g, b] = inside ? art[ay][ax] : COLORS.bg;
      raw[row + 1 + x * 3] = r;
      raw[row + 2 + x * 3] = g;
      raw[row + 3 + x * 3] = b;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bits por canal
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const art = drawArt();
const files = [
  ['favicon-32.png', 32, 1],
  ['apple-touch-icon.png', 180, 1],
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  // Los íconos "maskable" se recortan en círculo: el dibujo va en el 70% central.
  ['icon-maskable-512.png', 512, 0.7],
];
for (const [name, size, fraction] of files) {
  writeFileSync(join(OUT, name), png(art, size, fraction));
  console.log(`${name} (${size}x${size})`);
}
