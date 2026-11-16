/**
 * El dormitorio dibujado por código: pared con la ventana grande, biblioteca,
 * cama, estante, escritorio de madera con lámpara, taza y frasco de comida,
 * plantas colgantes y las luces (lámpara, pecera, sol) en blend aditivo.
 */

import type { Graphics } from 'pixi.js';
import { scatter } from '../pixel-utils';
import { Batch } from '../tank/tank-decor';
import type { TankRect } from '../tank/tank-layout';
import { GAME_HEIGHT, GAME_WIDTH } from '../viewport';
import { BED, BOWL, DESK_FOOT_Y, DESK_TOP_Y, FLOOR_Y, SUNBEAM, WINDOW } from './scene-layout';

export interface RoomParams {
  tank: TankRect;
  desk: { x: number; width: number };
  lampOn: boolean;
  /** Comida en el plato del gato, 0 a 1. */
  bowl: number;
}

const WALL = 0x46557a;
const WALL_STRIPE = 0x4b5b82;
const WALL_SHADE = 0x3a476a;
const BASEBOARD = 0x2e3854;
const WOOD_HI = 0xb8845a;
const WOOD_LIGHT = 0x9a6c46;
const WOOD = 0x7a5236;
const WOOD_MID = 0x6a4630;
const WOOD_DARK = 0x4a3020;
const WOOD_DEEP = 0x33211a;
const FLOOR = 0x6b4a33;
const LEAF = [0x3f9a4a, 0x57b85a, 0x2f7a40, 0x74cf6c] as const;
const POT = 0x9a5030;
const POT_HI = 0xc0703f;
const BOOKS = [0x8a3a3a, 0x3a5a8a, 0x4a7a5a, 0xb89a4a, 0x6a4a7a, 0xc8c0a8, 0x2f4a5a, 0xb86a3a] as const;

const pick = (list: readonly number[], i: number): number => list[i % list.length] as number;

/** Dónde va la lámpara (la base) y la taza según el escritorio y la pecera. */
export function lampX(p: RoomParams): number {
  return p.desk.x + 26;
}
export function mugX(p: RoomParams): number {
  return Math.min(p.tank.x + p.tank.width + 22, p.desk.x + p.desk.width - 50);
}

/** Línea de 2 px de grosor entre dos puntos. */
function line(b: Batch, color: number, x0: number, y0: number, x1: number, y1: number, thick = 2): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    b.add(color, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), thick, thick);
  }
}

/** Matita en maceta (para la biblioteca y el estante). */
function pottedPlant(b: Batch, x: number, baseY: number, seed: number): void {
  b.add(POT, x - 5, baseY - 7, 10, 7);
  b.add(POT_HI, x - 6, baseY - 8, 12, 2);
  b.add(POT_HI, x - 5, baseY - 6, 1, 5);
  for (let i = 0; i < 9; i++) {
    const ang = -Math.PI * (0.12 + 0.76 * scatter(i, seed));
    const len = 6 + scatter(i, seed + 1) * 8;
    for (let q = 2; q < len; q += 2) {
      b.add(pick(LEAF, i), Math.round(x + Math.cos(ang) * q) - 1, Math.round(baseY - 9 + Math.sin(ang) * q), q > len - 3 ? 2 : 3, 2);
    }
  }
}

/** Todo lo que no se mueve. */
export function drawRoom(b: Batch, p: RoomParams): void {
  const W = WINDOW;
  const wr = W.x + W.width;
  const wb = W.y + W.height;

  // Pared alrededor de la ventana, con rayitas de empapelado.
  b.add(WALL, 0, 0, W.x, FLOOR_Y);
  b.add(WALL, wr, 0, GAME_WIDTH - wr, FLOOR_Y);
  b.add(WALL, W.x, 0, W.width, W.y);
  b.add(WALL, W.x, wb, W.width, FLOOR_Y - wb);
  for (let x = 8; x < GAME_WIDTH; x += 16) {
    if (x >= W.x && x < wr) {
      b.add(WALL_STRIPE, x, 0, 1, W.y);
      b.add(WALL_STRIPE, x, wb, 1, FLOOR_Y - wb);
    } else b.add(WALL_STRIPE, x, 0, 1, FLOOR_Y);
  }
  b.add(WALL_SHADE, 0, 0, GAME_WIDTH, 5);
  b.add(BASEBOARD, 0, FLOOR_Y - 8, GAME_WIDTH, 8);
  b.add(0x55648c, 0, FLOOR_Y - 8, GAME_WIDTH, 1);

  // Piso de tablas.
  b.add(FLOOR, 0, FLOOR_Y, GAME_WIDTH, GAME_HEIGHT - FLOOR_Y);
  b.add(0x8a6244, 0, FLOOR_Y, GAME_WIDTH, 1);
  const seams = [FLOOR_Y + 10, FLOOR_Y + 22, FLOOR_Y + 37];
  seams.forEach((y, row) => {
    b.add(WOOD_DARK, 0, y, GAME_WIDTH, 1);
    b.add(0x76543a, 0, y + 1, GAME_WIDTH, 1);
    const next = seams[row + 1] ?? GAME_HEIGHT;
    for (let k = 0; k < 6; k++) b.add(WOOD_DARK, (row * 97 + k * 131 + 40) % GAME_WIDTH, y + 1, 1, next - y - 1);
  });
  for (let k = 0; k < 5; k++) b.add(WOOD_DARK, (k * 149 + 70) % GAME_WIDTH, FLOOR_Y + 1, 1, 9);

  // Marco de la ventana: dos hojas con parteluces, manijas y alféizar.
  b.add(WOOD_MID, W.x - 6, W.y - 6, W.width + 12, 6);
  b.add(WOOD_MID, W.x - 6, wb, W.width + 12, 5);
  b.add(WOOD_MID, W.x - 6, W.y, 6, W.height);
  b.add(WOOD_MID, wr, W.y, 6, W.height);
  b.add(WOOD, W.x - 6, W.y - 6, W.width + 12, 1);
  b.add(WOOD, W.x - 6, W.y - 6, 1, W.height + 11);
  b.add(WOOD_DEEP, W.x - 1, W.y - 1, W.width + 2, 1);
  b.add(WOOD_DEEP, W.x - 1, W.y, 1, W.height);
  const mid = W.x + W.width / 2;
  const crossY = W.y + Math.round(W.height * 0.36);
  b.add(WOOD_MID, W.x, crossY, W.width, 3);
  b.add(WOOD_DEEP, W.x, crossY + 3, W.width, 1);
  for (const mx of [W.x + Math.round(W.width / 4), W.x + Math.round((W.width * 3) / 4)]) {
    b.add(WOOD_MID, mx - 1, W.y, 3, W.height);
    b.add(WOOD_DEEP, mx + 2, W.y, 1, W.height);
  }
  b.add(WOOD_MID, mid - 5, W.y, 10, W.height);
  b.add(WOOD, mid - 5, W.y, 1, W.height);
  b.add(WOOD_DEEP, mid, W.y, 1, W.height);
  b.add(0xb8b0a0, mid - 4, W.y + Math.round(W.height * 0.55), 2, 9);
  b.add(0xb8b0a0, mid + 2, W.y + Math.round(W.height * 0.55), 2, 9);
  b.add(WOOD, W.x - 12, wb + 4, W.width + 24, 5);
  b.add(WOOD_LIGHT, W.x - 12, wb + 4, W.width + 24, 1);
  b.add(WALL_SHADE, W.x - 10, wb + 9, W.width + 20, 2);

  // Biblioteca a la izquierda.
  const bcTop = 96;
  b.add(WOOD_DEEP, 0, bcTop, 56, FLOOR_Y - bcTop);
  b.add(WOOD_MID, 52, bcTop, 5, FLOOR_Y - bcTop);
  b.add(WOOD, 56, bcTop, 1, FLOOR_Y - bcTop);
  for (let s = 0; s < 5; s++) {
    const sy = bcTop + s * 46;
    b.add(WOOD, 0, sy, 56, 4);
    b.add(WOOD_LIGHT, 0, sy, 56, 1);
    if (s === 4) break;
    const shelfBottom = sy + 46;
    if (s === 1) {
      // Ropa doblada.
      for (let k = 0; k < 4; k++) b.add(pick([0x8a94a8, 0xb8aa98, 0x5a6a88, 0xc8c8c0], k), 8, shelfBottom - 6 - k * 6, 34, 5);
      continue;
    }
    let bx = 3;
    for (let k = 0; bx < 46; k++) {
      const w = 3 + Math.floor(scatter(k, 110 + s) * 4);
      const h = 22 + Math.floor(scatter(k, 120 + s) * 14);
      if (scatter(k, 130 + s) < 0.12) {
        bx += w + 2;
        continue;
      }
      const c = pick(BOOKS, Math.floor(scatter(k, 140 + s) * BOOKS.length));
      b.add(c, bx, shelfBottom - h, w, h);
      b.add(0xe8dcc0, bx, shelfBottom - h + 4, w, 1);
      b.add(WOOD_DEEP, bx + w, shelfBottom - h, 1, h);
      bx += w + 1;
    }
  }
  pottedPlant(b, 20, bcTop, 150);
  b.add(0x8a7a5a, 34, bcTop - 9, 16, 9);
  b.add(0xa8966e, 34, bcTop - 9, 16, 2);

  // Estante de la derecha con libros, plantita y un cuadro debajo.
  b.add(WOOD, 566, 112, 74, 4);
  b.add(WOOD_LIGHT, 566, 112, 74, 1);
  b.add(WOOD_DARK, 574, 116, 3, 9);
  b.add(WOOD_DARK, 577, 116, 3, 5);
  pottedPlant(b, 584, 112, 160);
  for (let k = 0; k < 5; k++) {
    const h = 16 + Math.floor(scatter(k, 170) * 9);
    b.add(pick(BOOKS, k + 2), 600 + k * 6, 112 - h, 5, h);
    b.add(0xe8dcc0, 600 + k * 6, 112 - h + 3, 5, 1);
  }
  b.add(WOOD_DARK, 594, 146, 30, 24);
  b.add(0x9ab8c8, 596, 148, 26, 20);
  b.add(0x5f8a6a, 596, 160, 26, 8);
  b.add(0xf2e2a8, 612, 151, 5, 5);

  // Cama a la derecha: poste con pomo, almohada y frazada.
  b.add(WOOD_DEEP, 556, 322, 84, DESK_FOOT_Y - 322);
  b.add(0xd8d4cc, 568, 238, 66, 22);
  b.add(0xf0ece4, 570, 236, 62, 4);
  b.add(0xb8b4b0, 568, 256, 66, 4);
  b.add(0xc8ccd0, 556, 260, 84, 5);
  b.add(0x3a4a66, 556, 265, 84, 57);
  b.add(0x4a5c7c, 556, 265, 84, 3);
  for (let k = 0; k < 4; k++) b.add(0x2e3c54, 566 + k * 20, 272 + (k % 2) * 6, 2, 44 - (k % 2) * 6);
  b.add(0x2e3c54, 556, 316, 84, 6);
  b.add(WOOD_MID, 548, 222, 9, DESK_FOOT_Y - 222);
  b.add(WOOD, 548, 222, 2, DESK_FOOT_Y - 222);
  b.add(WOOD_MID, 546, 214, 13, 9);
  b.add(WOOD, 548, 211, 9, 3);
  b.add(WOOD_LIGHT, 548, 213, 3, 3);

  // Almohadón del gato y su plato.
  b.add(0x1c1410, BED.x - 26, BED.y + 2, 52, 2);
  b.add(0x6f5a9a, BED.x - 26, BED.y - 3, 52, 6);
  b.add(0x6f5a9a, BED.x - 24, BED.y - 5, 48, 2);
  b.add(0x9783c4, BED.x - 22, BED.y - 7, 44, 3);
  b.add(0x5a4880, BED.x - 16, BED.y - 5, 32, 2);
  b.add(0x4a6a88, BOWL.x - 9, BOWL.y - 4, 18, 5);
  b.add(0x6f8fb0, BOWL.x - 10, BOWL.y - 5, 20, 2);
  b.add(0x3a5670, BOWL.x - 7, BOWL.y, 14, 1);
  if (p.bowl > 0) {
    const food = Math.max(2, Math.round(14 * p.bowl));
    b.add(0xa8703a, BOWL.x - Math.floor(food / 2), BOWL.y - 7, food, 2);
  }

  // Escritorio: tapa, canto, cajones y patas.
  const { x: dx, width: dw } = p.desk;
  b.add(0x1c1410, dx + 2, DESK_FOOT_Y, dw - 4, 2);
  b.add(WOOD_LIGHT, dx - 4, DESK_TOP_Y, dw + 8, 8);
  b.add(WOOD_HI, dx - 4, DESK_TOP_Y, dw + 8, 1);
  for (let k = 0; k < dw / 26; k++) {
    b.add(0x8a5e3c, dx + Math.floor(scatter(k, 180) * (dw - 20)), DESK_TOP_Y + 2 + Math.floor(scatter(k, 181) * 5), 8 + Math.floor(scatter(k, 182) * 10), 1);
  }
  b.add(WOOD, dx - 4, DESK_TOP_Y + 8, dw + 8, 4);
  b.add(WOOD_DEEP, dx - 2, DESK_TOP_Y + 12, dw + 4, 1);
  b.add(WOOD_MID, dx, DESK_TOP_Y + 13, dw, 20);
  for (const drawerX of [dx + 14, dx + dw - 110]) {
    b.add(WOOD_DARK, drawerX, DESK_TOP_Y + 16, 96, 14);
    b.add(WOOD_MID, drawerX + 1, DESK_TOP_Y + 17, 94, 12);
    b.add(WOOD, drawerX + 1, DESK_TOP_Y + 17, 94, 1);
    b.add(WOOD_DEEP, drawerX + 40, DESK_TOP_Y + 22, 16, 2);
    b.add(0xb8b0a0, drawerX + 40, DESK_TOP_Y + 22, 16, 1);
  }
  const legTop = DESK_TOP_Y + 33;
  for (const legX of [dx + 2, dx + dw - 11]) {
    b.add(WOOD_MID, legX, legTop, 9, DESK_FOOT_Y - legTop);
    b.add(WOOD, legX, legTop, 2, DESK_FOOT_Y - legTop);
    b.add(WOOD_DARK, legX + 7, legTop, 2, DESK_FOOT_Y - legTop);
  }

  // Lámpara de escritorio articulada.
  const lx = lampX(p);
  const metal = 0x3a3238;
  const metalHi = 0x6a5a58;
  b.add(metal, lx - 8, DESK_TOP_Y + 3, 16, 3);
  b.add(metalHi, lx - 6, DESK_TOP_Y + 2, 12, 1);
  line(b, metal, lx - 1, DESK_TOP_Y + 1, lx - 10, DESK_TOP_Y - 26);
  line(b, metal, lx - 10, DESK_TOP_Y - 26, lx + 9, DESK_TOP_Y - 54);
  b.add(metalHi, lx - 11, DESK_TOP_Y - 27, 3, 3);
  for (let j = 0; j < 11; j++) {
    const cx = lx + 11 + j * 0.6;
    const half = 4 + j * 0.75;
    b.add(0x4a3a2c, Math.round(cx - half), DESK_TOP_Y - 58 + j, Math.round(half * 2), 1);
    b.add(0x6e5642, Math.round(cx - half), DESK_TOP_Y - 58 + j, 2, 1);
  }
  b.add(p.lampOn ? 0xffe2a0 : 0x8a7a5a, lx + 8, DESK_TOP_Y - 47, 20, 1);
  if (p.lampOn) b.add(0xfff6da, lx + 15, DESK_TOP_Y - 46, 6, 2);

  // Taza, frasco de comida y cuaderno sobre el escritorio.
  const mx = mugX(p);
  b.add(0xd8cfc0, mx, DESK_TOP_Y - 5, 9, 9);
  b.add(0xb0a898, mx + 7, DESK_TOP_Y - 5, 2, 9);
  b.add(0xc06a4a, mx, DESK_TOP_Y - 2, 9, 2);
  b.add(0x4a2c1a, mx + 1, DESK_TOP_Y - 5, 7, 1);
  b.add(0xd8cfc0, mx + 9, DESK_TOP_Y - 3, 2, 1);
  b.add(0xd8cfc0, mx + 10, DESK_TOP_Y - 2, 1, 3);
  b.add(0xd8cfc0, mx + 9, DESK_TOP_Y + 1, 2, 1);
  const jx = mx + 20;
  b.add(0xb8963a, jx, DESK_TOP_Y - 8, 10, 3);
  b.add(0x5f8f98, jx, DESK_TOP_Y - 5, 10, 10);
  b.add(0x8fc0c8, jx, DESK_TOP_Y - 5, 1, 10);
  b.add(0xe8dcc0, jx + 1, DESK_TOP_Y - 3, 8, 6);
  b.add(0xe07a3a, jx + 3, DESK_TOP_Y - 1, 4, 2);
  if (jx + 40 < dx + dw) {
    b.add(0x3a4a66, jx + 16, DESK_TOP_Y + 3, 20, 3);
    b.add(0xe8e4d8, jx + 17, DESK_TOP_Y + 2, 18, 2);
  }
}

/** Sombra debajo del escritorio y contra el piso (va con transparencia). */
export function drawRoomShadows(g: Graphics, p: RoomParams): void {
  const { x: dx, width: dw } = p.desk;
  g.rect(dx + 11, DESK_TOP_Y + 33, dw - 22, DESK_FOOT_Y - DESK_TOP_Y - 33).fill({ color: 0x05070c, alpha: 0.32 });
  g.rect(0, FLOOR_Y, GAME_WIDTH, 3).fill({ color: 0x05070c, alpha: 0.2 });
}

/** Plantas colgantes que se mecen apenas y el vapor de la taza. */
export function drawRoomAnim(b: Batch, g: Graphics, p: RoomParams, tone: (c: number) => number, t: number): void {
  const anchors = [WINDOW.x + 22, WINDOW.x + WINDOW.width - 20];
  anchors.forEach((hx, plant) => {
    const swing = Math.sin(t * 0.5 + plant * 2) * 0.8;
    const px = Math.round(hx + swing);
    const cord = 0x8a7a5a;
    b.add(cord, hx, 0, 1, 30);
    line(b, cord, hx, 30, px - 8, 52, 1);
    line(b, cord, hx, 30, px + 8, 52, 1);
    // Enredaderas que cuelgan, cada una con su vaivén.
    for (let i = 0; i < 6; i++) {
      const sx = px - 10 + i * 4;
      const len = 16 + Math.floor(scatter(i + plant * 10, 190) * 30);
      const sway = Math.sin(t * 0.7 + i * 1.3 + plant * 3) * 1.6;
      for (let j = 0; j < len; j += 2) {
        const k = j / len;
        const vx = Math.round(sx + sway * Math.pow(k, 1.3) + Math.sin(j * 0.3 + i) * 1.5 + (i - 2.5) * k * 2);
        b.add(0x2f6a3c, vx, 56 + j, 1, 2);
        if (j % 4 === 0) b.add(pick(LEAF, i + j), vx + ((j >> 2) % 2 === 0 ? -2 : 1), 56 + j, 2, 2);
      }
    }
    // Maceta.
    b.add(POT_HI, px - 8, 52, 16, 3);
    b.add(POT, px - 7, 55, 14, 5);
    b.add(POT, px - 6, 60, 12, 3);
    b.add(POT, px - 4, 63, 8, 1);
    b.add(POT_HI, px - 7, 55, 1, 5);
    // Copa de hojas.
    const halves = [5, 8, 10, 11, 11, 10];
    halves.forEach((half, r) => {
      const y = 41 + r * 2;
      b.add(LEAF[2], px - half, y, half * 2, 2);
      for (let q = -half; q < half; q += 3) {
        if (scatter(q + 40 + r * 7, 191 + plant) < 0.6) b.add(pick(LEAF, q + r + 40), px + q, y, 2, 2);
      }
    });
  });
  b.flush(g, tone);

  // Vapor: tres hilitos que suben ondulando y se deshacen.
  const mx = mugX(p) + 4;
  const top = DESK_TOP_Y - 7;
  for (let pass = 0; pass < 2; pass++) {
    let any = false;
    for (let w = 0; w < 3; w++) {
      for (let j = pass === 0 ? 0 : 8; j < (pass === 0 ? 8 : 17); j++) {
        if (Math.sin((j - t * 5) * 0.7 + w * 2.1) < -0.25) continue;
        const sx = mx + (w - 1) * 2 + Math.round(Math.sin(t * 1.4 + j * 0.45 + w * 2) * (0.6 + j * 0.12));
        g.rect(sx, top - j, 1, 1);
        any = true;
      }
    }
    if (any) g.fill({ color: 0xf4f0e8, alpha: pass === 0 ? 0.5 : 0.22 });
  }
}

/** Disco de luz por filas de 2 px. */
function disc(g: Graphics, cx: number, cy: number, r: number): void {
  for (let y = -r; y < r; y += 2) {
    const half = Math.round(Math.sqrt(r * r - (y + 1) * (y + 1)));
    if (half > 0) g.rect(cx - half, cy + y, half * 2, 2);
  }
}

/**
 * Luces en blend aditivo: el halo cálido de la lámpara, el resplandor turquesa
 * de la pecera de noche y el sol en el piso.
 */
export function drawLights(g: Graphics, p: RoomParams, night: number, tankLit: boolean, sun: number): void {
  if (p.lampOn) {
    const cx = lampX(p) + 18;
    const cy = DESK_TOP_Y - 36;
    const k = 0.5 + 0.5 * night;
    const rings: readonly (readonly [number, number])[] = [
      [80, 0.035],
      [60, 0.045],
      [42, 0.06],
      [26, 0.08],
      [12, 0.14],
    ];
    for (const [r, a] of rings) {
      disc(g, cx, cy, r);
      g.fill({ color: 0xffa850, alpha: a * k });
    }
    // Charco de luz sobre la madera.
    g.rect(cx - 44, DESK_TOP_Y, 96, 8).rect(cx - 30, DESK_TOP_Y, 66, 8).fill({ color: 0xffb060, alpha: 0.09 * k });
  }
  if (tankLit && night > 0.05) {
    const t = p.tank;
    for (const [grow, a] of [
      [22, 0.022],
      [13, 0.028],
      [5, 0.035],
    ] as const) {
      g.rect(t.x - grow, t.y - grow, t.width + grow * 2, t.height + grow).fill({ color: 0x4ad0c8, alpha: a * night });
    }
    g.rect(t.x - 14, DESK_TOP_Y, t.width + 28, 8).fill({ color: 0x4ad0c8, alpha: 0.1 * night });
  }
  if (sun > 0) {
    for (let r = 0; r < 26; r += 2) g.rect(Math.round(SUNBEAM.x - 44 + r * 0.7), FLOOR_Y + 12 + r, 76, 2);
    g.fill({ color: 0xffe9a8, alpha: 0.2 * sun });
  }
}
