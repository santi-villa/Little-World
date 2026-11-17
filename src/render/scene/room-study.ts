import { asset } from '../assets';
import { texts } from '../ui/texts';
import { woodButton } from '../ui/paper-ui';
export const STUDY = {
  desk: { width: 140, height: 74, depth: 60 },
  tank: { width: 60, height: 36, depth: 30 },
  pot: { width: 16, height: 20, depth: 16 },
};
export function studyProject(x: number, y: number, z: number) {
  return { x: 260 + (x - z * 0.45) * 2.3, y: 340 - y * 2.3 + z * 0.24 * 2.3 };
}
export function studySurface(x: number, y: number, height: number) {
  const z = ((y - 340) / 2.3 + height) / 0.24;
  return { x: (x - 260) / 2.3 + z * 0.45, z };
}
/** Isolated comparison: no simulation state or production background is replaced. */
export async function showRoomStudy(): Promise<void> {
  const dialog = document.createElement('dialog');
  dialog.className = 'room-study';
  dialog.setAttribute('aria-label', texts.roomStudy.label);
  const title = document.createElement('h2');
  title.textContent = texts.roomStudy.title;
  const columns = document.createElement('div');
  columns.className = 'study-columns';
  const original = document.createElement('figure'),
    trial = document.createElement('figure');
  const img = document.createElement('img');
  img.src = import.meta.env.BASE_URL + (asset('dormitorio')?.file ?? '');
  img.alt = texts.roomStudy.alt;
  const caption = document.createElement('figcaption');
  caption.textContent = texts.roomStudy.original;
  original.append(img, caption);
  const info = document.createElement('figcaption');
  info.textContent = texts.roomStudy.geometry;
  const host = document.createElement('div');
  trial.append(host, info);
  columns.append(original, trial);
  const close = woodButton(texts.roomStudy.close, () => dialog.close());
  dialog.append(title, columns, close);
  document.body.append(dialog);
  dialog.showModal();
  // A separate 2D canvas keeps this disposable study independent of the game's GPU resources.
  const canvas = document.createElement('canvas');
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = 520 * dpr;
  canvas.height = 410 * dpr;
  canvas.style.width = '100%';
  canvas.style.height = 'auto';
  host.append(canvas);
  const context = canvas.getContext('2d');
  let frame = 0,
    closed = false;
  dialog.addEventListener(
    'close',
    () => {
      closed = true;
      cancelAnimationFrame(frame);
      dialog.remove();
    },
    { once: true },
  );
  if (!context) {
    info.textContent = texts.roomStudy.error;
    return;
  }
  const g = context;
  g.scale(dpr, dpr);
  const color = (value: number) => '#' + value.toString(16).padStart(6, '0');
  let pot = { x: -48, z: 15 };
  const poly = (points: number[][], ink: number, alpha = 1) => {
    g.beginPath();
    points.forEach(([x, y, z], i) => {
      const p = studyProject(x!, y!, z!);
      if (i === 0) g.moveTo(p.x, p.y);
      else g.lineTo(p.x, p.y);
    });
    g.closePath();
    g.fillStyle = color(ink);
    g.globalAlpha = alpha;
    g.fill();
    g.globalAlpha = 1;
  };
  const stroke = (ink: number, width: number, alpha = 1) => {
    g.strokeStyle = color(ink);
    g.lineWidth = width;
    g.globalAlpha = alpha;
    g.stroke();
    g.globalAlpha = 1;
  };
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    c: number,
  ) => {
    poly(
      [
        [x, y, z],
        [x + w, y, z],
        [x + w, y + h, z],
        [x, y + h, z],
      ],
      c,
    );
    poly(
      [
        [x + w, y, z],
        [x + w, y, z + d],
        [x + w, y + h, z + d],
        [x + w, y + h, z],
      ],
      c - 0x171310,
    );
    poly(
      [
        [x, y + h, z],
        [x + w, y + h, z],
        [x + w, y + h, z + d],
        [x, y + h, z + d],
      ],
      c + 0x13110b,
    );
  };
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect(),
      p = studySurface(
        ((event.clientX - rect.left) * 520) / rect.width,
        ((event.clientY - rect.top) * 410) / rect.height,
        78,
      );
    if (p.x >= -65 && p.x <= -20 && p.z >= 5 && p.z <= 42)
      pot = { x: p.x, z: p.z };
  });
  const draw = (now: number) => {
    if (closed) return;
    const time = now / 1000;
    g.fillStyle = '#9eb8bb';
    g.fillRect(0, 0, 520, 410);
    poly(
      [
        [-115, 0, -10],
        [115, 0, -10],
        [115, 150, -10],
        [-115, 150, -10],
      ],
      0xa67d65,
    );
    poly(
      [
        [-115, 0, -10],
        [115, 0, -10],
        [115, 0, 85],
        [-115, 0, 85],
      ],
      0x8d6954,
    );
    poly(
      [
        [-65, 92, -9],
        [65, 92, -9],
        [65, 145, -9],
        [-65, 145, -9],
      ],
      0xb4cfcd,
    );
    for (const x of [-64, 62])
      for (const z of [6, 50]) box(x, 0, z, 5, 74, 5, 0x6a4a35);
    box(-70, 74, 0, 140, 4, 60, 0x8e603d);
    // Soft contact footprint under the tank and pot.
    poly(
      [
        [-4, 78.1, 5],
        [65, 78.1, 5],
        [65, 78.1, 43],
        [-4, 78.1, 43],
      ],
      0x493e2e,
      0.3,
    );
    box(0, 78, 6, 60, 36, 30, 0x6c9d9a);
    poly(
      [
        [0, 82, 6],
        [60, 82, 6],
        [60, 82, 36],
        [0, 82, 36],
      ],
      0xc2b98c,
    );
    poly(
      [
        [0, 110, 6],
        [60, 110, 6],
        [60, 110, 36],
        [0, 110, 36],
      ],
      0x8bc1bb,
      0.55,
    );
    for (const [x, z] of [
      [0, 6],
      [60, 6],
      [0, 36],
      [60, 36],
    ]) {
      const a = studyProject(x!, 78, z!),
        b = studyProject(x!, 114, z!);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      stroke(0xd0e8d8, 2, 0.7);
    }
    for (let i = 0; i < 5; i++) {
      const a = studyProject(8 + i * 2, 83, 25),
        b = studyProject(7 + i * 2 + Math.sin(time + i) * 2, 102 + i, 25);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.quadraticCurveTo(b.x - 3, (a.y + b.y) / 2, b.x, b.y);
      stroke(0x3c714d, 3);
    }
    box(
      pot.x,
      78,
      pot.z,
      STUDY.pot.width,
      STUDY.pot.height,
      STUDY.pot.depth,
      0x9c6247,
    );
    const root = studyProject(pot.x + 8, 98, pot.z + 8);
    for (let i = 0; i < 5; i++) {
      const tip = studyProject(
        pot.x + 8 + Math.sin(i * 2) * 10,
        111 + Math.cos(i) * 4,
        pot.z + 8 + Math.sin(time * 0.4 + i),
      );
      g.beginPath();
      g.moveTo(root.x, root.y);
      g.quadraticCurveTo(tip.x - 5, tip.y + 4, tip.x, tip.y);
      stroke(0x477b50, 4);
    }
    frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);
}
